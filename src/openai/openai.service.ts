import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { Brand } from '../entities/brand.entity';
import { Template } from '../entities/template.entity';
import { v4 as uuidv4 } from 'uuid';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private openai: OpenAI | null = null;
  private currentApiKey = '';
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly maxReferenceImages = 10;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
  }

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.settingsService.getOpenAIApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    if (!this.openai || this.currentApiKey !== apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.currentApiKey = apiKey;
    }

    return this.openai;
  }

  /**
   * Build a prompt from brand info, template, and user input.
   * Includes explicit instructions to incorporate the logo.
   */
  buildPrompt(brand: Brand, template: Template | null, userInput: string): string {
    let mainPrompt = '';

    if (template) {
      let templateText = template.prompt_template;
      templateText = templateText.replace('{{brand_name}}', brand.name);
      templateText = templateText.replace('{{primary_color}}', brand.primary_color);
      templateText = templateText.replace('{{secondary_color}}', brand.secondary_color || '');
      templateText = templateText.replace('{{accent_color}}', brand.accent_color || '');
      templateText = templateText.replace('{{description}}', brand.description || '');

      if (templateText.includes('{{user_input}}')) {
        templateText = templateText.replace('{{user_input}}', userInput);
        mainPrompt = templateText;
      } else {
        mainPrompt = `${userInput}\n\nTemplate style: ${templateText}`;
      }
    } else {
      mainPrompt = userInput;
    }

    // Brand context — hướng dẫn AI rõ ràng hơn về logo và màu sắc
    const brandLines: string[] = [
      `Brand name: "${brand.name}"`,
      `Primary color: ${brand.primary_color}`,
      brand.secondary_color ? `Secondary color: ${brand.secondary_color}` : '',
      brand.description ? `Brand description: ${brand.description}` : '',
      brand.logo_url
        ? `IMPORTANT: Replace ALL existing logos/watermarks in the reference image with the provided brand logo of "${brand.name}". Keep the layout, composition, and overall design structure identical — only swap the brand identity elements (logo, colors, brand name text).`
        : '',
    ].filter(Boolean);

    return `${mainPrompt}\n\n[Brand context:\n${brandLines.join('\n')}]`;
  }

  /**
   * Generate image using GPT Image model.
   * If logo/reference images are available, use images.edit() to incorporate them.
   * Otherwise, use images.generate() for text-only generation.
   */
  async generateImage(
    prompt: string,
    size: string = '1024x1024',
    referenceImages?: string[],
    brandName?: string,
    logoUrl?: string,
    options?: {
      inputImageCount?: number;
      styleReferenceImageCount?: number;
      variationIndex?: number;
    },
  ): Promise<string> {
    this.logger.log(`Generating image with prompt: ${prompt.substring(0, 100)}...`);

    try {
      let b64Data: string;

      if (referenceImages && referenceImages.length > 0) {
        b64Data = await this.generateWithReferences(prompt, size, referenceImages, brandName, logoUrl, options);
      } else {
        b64Data = await this.generateTextOnly(prompt, size);
      }

      const imageUrl = await this.uploadBase64ToSupabase(b64Data);
      this.logger.log('Image generated and uploaded successfully');
      return imageUrl;
    } catch (error) {
      this.logger.error(`Failed to generate image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate with text only (no reference images)
   */
  private async generateTextOnly(prompt: string, size: string): Promise<string> {
    const openai = await this.getClient();
    const response = await openai.images.generate({
      model: 'gpt-image-2',
      prompt: this.appendImageSafetyGuard(prompt),
      n: 1,
      size: size as '1024x1024' | '1536x1024' | '1024x1536',
      quality: 'high',
    });

    const b64Data = response.data?.[0]?.b64_json;
    if (!b64Data) {
      throw new Error('No image data returned from OpenAI');
    }
    return b64Data;
  }

  private appendImageSafetyGuard(prompt: string): string {
    return `${prompt}

[Safety and professional advertising requirements:
- The final output must always be a polished, professional, family-safe advertisement.
- The final output must be non-sexual, non-erotic, and non-suggestive.
- If any input person appears in revealing clothing, sleepwear, lingerie-like clothing, swimwear, bedroom/mirror-selfie styling, intimate framing, cleavage-emphasis, body-emphasis, or a seductive pose, adapt the person into modest professional advertising styling.
- Use covered, appropriate clothing such as a blouse, blazer, clinic uniform, dental/medical coat, or modest casual top. Use a neutral, confident commercial pose.
- Keep the person generally recognizable where allowed, but do not preserve sexualized wardrobe, pose, framing, expression, or mood.
- No nudity, no erotic mood, no fetishized body focus, no provocative camera angle, and no intimate/bedroom context.
- Prefer clean healthcare/commercial lighting, professional composition, and brand-safe dental marketing aesthetics.
]`;
  }

  /**
   * STEP 0: Phân tích ảnh tham khảo — detect logos, brand elements, layout
   * Trả về JSON mô tả vị trí logo, màu sắc, layout để build prompt chính xác hơn
   */
  private async analyzeReferenceForBrandSwap(
    referenceImageUrls: string[],
    newBrandName: string,
    newLogoUrl?: string,
  ): Promise<string> {
    this.logger.log('[BrandSwap] Analyzing reference images for logo detection...');

    const userContent: any[] = [
      {
        type: 'text',
        text: `You are a professional brand design analyst.

Analyze the provided reference image(s) and return a detailed prompt for recreating this design with a NEW BRAND.

NEW BRAND: "${newBrandName}"
${newLogoUrl ? `NEW LOGO: Will be provided as an additional image.` : ''}

Your analysis must produce a ready-to-use image generation prompt that:
1. DETECTS all existing logos, watermarks, brand names, and brand colors in the reference
2. READS/OCRs all visible text zones in the reference image, including headline, offer, CTA, small captions, benefit badges, footer, address/contact text, and legal/disclaimer text
3. DESCRIBES the full layout, composition, spacing, and structure
4. DESCRIBES all visual elements: background, decorations, typography style, CTA buttons
5. DESCRIBES the subject/content placeholders (people, products, medical images, etc.) as layout roles, but do not require copying their identity
6. EXPLICITLY INSTRUCTS to:
   - REMOVE all detected logos, watermarks, and brand text from the reference
   - REPLACE them with "${newBrandName}" branding${newLogoUrl ? ` using the new logo provided` : ''}
   - REPLACE ALL visible text content from the reference with new text derived from the user's prompt and new brand context
   - Preserve the text hierarchy, typography style, approximate text block positions, and relative sizes, but not the old wording
   - Keep the EXACT same position, size, and style for the brand placement

If separate input subject images are provided later, the generated poster must replace the reference subject/person/product with those input subject images while preserving the reference layout.
The final output must not retain old promotion text, old prices, old phone numbers, old address, old CTA, old brand name, old logo text, or any original reference wording unless the user explicitly asks to keep it.

Return ONLY the final image generation prompt (in English), no explanation, no JSON.
The prompt must be detailed, specific, and actionable for GPT-Image-2.`,
      },
    ];

    // Thêm tất cả reference images để phân tích
    for (const url of referenceImageUrls.slice(0, 3)) {
      userContent.push({
        type: 'image_url',
        image_url: { url, detail: 'high' },
      });
    }

    try {
      const openai = await this.getClient();
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.3,
        max_tokens: 1200,
      });

      const analysisPrompt = response.choices[0]?.message?.content || '';
      this.logger.log(`[BrandSwap] Analysis prompt (${analysisPrompt.length} chars): ${analysisPrompt.slice(0, 200)}...`);
      return analysisPrompt;
    } catch (err) {
      this.logger.warn(`[BrandSwap] Analysis failed: ${err.message}`);
      return '';
    }
  }

  /**
   * Generate with reference images using images.edit()
   * Image[0] = brand logo (nếu có), Image[1..] = style/layout references
   */
  private async generateWithReferences(
    prompt: string,
    size: string,
    referenceImages: string[],
    brandName?: string,
    logoUrl?: string,
    options?: {
      inputImageCount?: number;
      styleReferenceImageCount?: number;
      variationIndex?: number;
    },
  ): Promise<string> {
    // ── STEP 0: Phân tích ảnh tham khảo, detect logo cũ ──
    // Chỉ coi ảnh đầu là logo khi brand thật sự có logoUrl.
    // Nếu không, mọi ảnh đều là input/reference để ghép hoặc giữ style.
    const logoImageUrl = logoUrl;
    const logoOffset = logoUrl ? 1 : 0;
    const inputImageCount = options?.inputImageCount || 0;
    const inputImages = referenceImages.slice(logoOffset, logoOffset + inputImageCount);
    const styleRefs = referenceImages.slice(logoOffset + inputImageCount);

    let finalPrompt = prompt;

    if (styleRefs.length > 0 && brandName) {
      const analysisPrompt = await this.analyzeReferenceForBrandSwap(
        styleRefs,
        brandName,
        logoImageUrl,
      );
      if (analysisPrompt) {
        // Dùng analysis prompt làm base, append user intent
        finalPrompt = `${analysisPrompt}\n\nAdditional instruction from user: ${prompt}`;
        this.logger.log('[BrandSwap] Using analysis-based prompt');
      }
    }

    // ── STEP 1: Download tất cả ảnh ──
    const imageFiles: any[] = [];
    this.logger.log(`Downloading ${referenceImages.length} reference images...`);

    for (let i = 0; i < Math.min(referenceImages.length, this.maxReferenceImages); i++) {
      try {
        this.logger.log(`  Downloading [${i}]: ${referenceImages[i]}`);
        const res = await fetch(referenceImages[i]);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          this.logger.log(`  Downloaded [${i}]: ${buffer.length} bytes`);
          const file = await toFile(buffer, `image_${i}.png`, { type: 'image/png' });
          imageFiles.push(file);
        } else {
          this.logger.warn(`  Failed [${i}]: HTTP ${res.status}`);
        }
      } catch (err) {
        this.logger.warn(`  Error [${i}]: ${err.message}`);
      }
    }

    this.logger.log(`Successfully downloaded ${imageFiles.length}/${referenceImages.length} images`);

    if (imageFiles.length === 0) {
      this.logger.warn('No images downloaded, falling back to text-only generation');
      return this.generateTextOnly(finalPrompt, size);
    }

    // ── STEP 2: Build image role instructions ──
    let imageInstruction: string;
    if (inputImages.length > 0 || styleRefs.length > 0) {
      const roleLines: string[] = [];
      if (logoUrl) {
        roleLines.push(`Image[0] is the NEW BRAND LOGO for "${brandName || 'the brand'}". Use it for brand identity and replace old logos/brand marks from style references.`);
      }
      if (inputImages.length > 0) {
        const start = logoOffset;
        const end = logoOffset + inputImages.length - 1;
        roleLines.push(`Image[${start}${end > start ? `..${end}` : ''}] are INPUT SUBJECT IMAGES. These are the required real person/product/object assets that must appear in the final poster. Preserve identity, face, product shape, packaging, labels, object silhouette, and key visual details as much as possible, but change outfit, pose, framing, and mood to modest professional advertising styling whenever needed for safety.`);
      }
      if (styleRefs.length > 0) {
        const start = logoOffset + inputImages.length;
        const end = start + styleRefs.length - 1;
        roleLines.push(`Image[${start}${end > start ? `..${end}` : ''}] are STYLE/LAYOUT REFERENCES only. Analyze their poster composition, all visible text zones, text hierarchy, dental marketing layout, colors, decorations, spacing, and CTA structure. Do NOT copy their person/product when input subject images are provided.`);
      }
      roleLines.push('Create one coherent final marketing image, not a collage grid.');
      roleLines.push('Remove watermarks, platform UI, unrelated logos, and old brand text from style references.');
      roleLines.push('If style/layout references contain an old main product, packshot, dental object, mockup, device, tray, teeth image, before/after image, or other product slot, replace that old product/object with the matching product/object from INPUT SUBJECT IMAGES. Keep the slot position, scale, perspective, lighting, and surrounding layout from the reference, but do not keep the old reference product.');
      roleLines.push('Replace EVERY visible text string from style/layout references with new text derived from the user prompt and current brand context. Preserve the visual text hierarchy and approximate block placement, but do not keep old headlines, offers, prices, CTAs, addresses, phone numbers, small captions, or footer text.');
      roleLines.push('When the prompt provides a current brand palette, replace ALL non-photo design colors from style/layout references with the nearest brand colors: background, gradients, CTA blocks, badges, icons, borders, decorations, headline/subheadline/body text colors, large display typography/product-name colors, footer bars, and small UI accents. Do not preserve old gold/yellow/green/red/blue reference colors unless they are explicitly part of the current brand palette. Neutral white/black/gray and natural photo colors may remain only when needed for readability/realism.');
      if (options?.variationIndex) {
        roleLines.push(`This is variation ${options.variationIndex}. Make the composition clearly different from other variations by changing subject placement, typography arrangement, decorative elements, or crop while preserving the same brief and brand.`);
      }
      imageInstruction = roleLines.join('\n');
    } else if (referenceImages.length >= 2) {
      imageInstruction = `The provided images are INPUT/REFERENCE IMAGES for one final composition.
Use all relevant subjects, products, faces, visual elements, layout cues, and style references from these images according to the user's prompt.
Do not treat any input image as a new brand logo unless the prompt explicitly says so.
Keep the final image coherent as a single generated image, not a collage grid.
Remove watermarks, UI, and unrelated text from the reference images.`;
    } else {
      imageInstruction = `The provided image is the LAYOUT REFERENCE.
Analyze all visible text zones and REMOVE any existing logos, watermarks, brand text, promotion text, prices, CTAs, address, phone number, and footer text found in the image.
${brandName ? `Replace with brand name "${brandName}" text${logoUrl ? ' and the new logo provided' : ''}.` : ''}
Replace all other text with new content derived from the user's prompt while preserving text hierarchy, style, and approximate placement.
Keep all other design elements, composition, and visual content unchanged.`;
    }

    const fullPrompt = this.appendImageSafetyGuard(`${finalPrompt}\n\n[Image roles:\n${imageInstruction}]`);

    const openai = await this.getClient();
    const response = await openai.images.edit({
      model: 'gpt-image-2',
      image: imageFiles,
      prompt: fullPrompt,
      n: 1,
      size: size as '1024x1024' | '1536x1024' | '1024x1536',
    });

    const b64Data = response.data?.[0]?.b64_json;
    if (!b64Data) {
      throw new Error('No image data returned from OpenAI edit');
    }
    return b64Data;
  }

  /**
   * Upload base64 image to Supabase Storage
   */
  private async uploadBase64ToSupabase(base64Data: string): Promise<string> {
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `generated/${uuidv4()}.png`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/uploads/${fileName}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.supabaseAnonKey}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase upload failed: ${response.status} - ${errorBody}`);
    }

    return `${this.supabaseUrl}/storage/v1/object/public/uploads/${fileName}`;
  }

  /**
   * Generate creative prompt from brand info + user description
   */
async generateCreativePrompt(params: {
  brandName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontStyle?: string;
  mood?: string;
  description: string;
  referenceDescription?: string;
  referenceImageUrls?: string[];
}): Promise<string> {
  this.logger.log('Generating creative prompt (2-step structured method)...');

  // ═══════════════════════════════════════════════
  // STEP 1: Analyze reference images → JSON spec
  // ═══════════════════════════════════════════════
  let designSpec: any = null;

  if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
    const analyzePrompt = `You are a Senior Creative Director.

Analyze the reference image(s).

Do NOT generate an image prompt.

Instead generate a structured JSON describing:
- layout (canvas ratio, subjectPosition, textPosition, logoPosition, textArea%, subjectArea%)
- background (type, colors array, decorations array)
- subject (count, type, style, crop)
- typography (headlineStyle, subHeadlineStyle, bodyStyle)
- colors (primary, secondary, accent)
- CTA (style, position, text)
- decorations (list of decorative elements)
- negative (list of things to avoid)

Return ONLY valid JSON, no explanation, no markdown.`;

    try {
      const userContent: any[] = [{ type: 'text', text: analyzePrompt }];
      for (const url of params.referenceImageUrls.slice(0, 4)) {
        userContent.push({ type: 'image_url', image_url: { url, detail: 'low' } });
      }

      const openai = await this.getClient();
      const analyzeResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        max_tokens: 800,
      });

      const jsonText = analyzeResponse.choices[0]?.message?.content || '';
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        designSpec = JSON.parse(jsonMatch[0]);
        this.logger.log(`[Step1] Design spec: ${JSON.stringify(designSpec).slice(0, 300)}`);
      }
    } catch (err) {
      this.logger.warn(`[Step1] Analyze failed: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════
  // STEP 1B: Nếu không có ảnh reference, vẫn gọi GPT tạo layout spec từ description
  // ═══════════════════════════════════════════════
  if (!designSpec) {
    try {
      const specPrompt = `You are a Senior Creative Director. Based on this brief, generate a structured JSON for a marketing banner design.

Brief: ${params.description}
Brand: ${params.brandName || 'Generic'}
Primary color: ${params.primaryColor || '#000000'}
Mood: ${params.mood || 'Professional'}

Generate JSON with: layout, background, subject, typography, colors, CTA, decorations, negative.
Return ONLY valid JSON.`;

      const openai = await this.getClient();
      const specResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: specPrompt }],
        temperature: 0.4,
        max_tokens: 600,
      });

      const jsonText = specResponse.choices[0]?.message?.content || '';
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        designSpec = JSON.parse(jsonMatch[0]);
        this.logger.log(`[Step1B] Spec from description: ${JSON.stringify(designSpec).slice(0, 300)}`);
      }
    } catch (err) {
      this.logger.warn(`[Step1B] Spec generation failed: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════
  // STEP 2: Build structured prompt from spec
  // NO GPT call - deterministic template
  // ═══════════════════════════════════════════════
  const prompt = this.buildModularPrompt(designSpec, params);
  this.logger.log(`[Step2] Final prompt (${prompt.length} chars): ${prompt.slice(0, 200)}...`);
  return prompt;
}

async analyzeReferencePrompt(params: {
  referenceImageUrls: string[];
  mode?: 'replace_subject' | 'replace_text' | 'redesign';
}): Promise<string> {
  const urls = (params.referenceImageUrls || []).filter(Boolean).slice(0, 4);
  if (urls.length === 0) {
    throw new Error('referenceImageUrls is required');
  }

  const modeGuide = params.mode === 'replace_text'
    ? 'Ưu tiên tạo prompt chỉ thay text, giữ nguyên hình ảnh, nhân vật, sản phẩm, nền, icon, logo và bố cục.'
    : params.mode === 'redesign'
      ? 'Ưu tiên tạo prompt thiết kế lại poster mới nhưng vẫn dựa trên style, màu sắc và tinh thần của ảnh tham khảo.'
      : 'Ưu tiên tạo prompt thay nhân vật/sản phẩm từ ảnh đầu vào vào đúng bố cục của ảnh tham khảo.';

  const analyzePrompt = `Bạn là Senior Creative Director cho quảng cáo nha khoa.

Hãy phân tích ảnh tham khảo và tạo ra MỘT PROMPT TIẾNG VIỆT có thể đưa thẳng vào node Prompt để sinh ảnh.
${modeGuide}

Bắt buộc trong prompt đầu ra phải có:
1. Mô tả bố cục: tỉ lệ ảnh, vị trí logo, nhân vật/sản phẩm, headline, CTA, footer, icon/badge.
2. OCR toàn bộ text nhìn thấy được: headline, subheadline, ưu đãi, CTA, địa chỉ, số điện thoại, footer, text nhỏ. Nếu không đọc chắc, ghi "không rõ".
3. Màu sắc chính: màu nền, màu chữ, màu brand, màu accent, gradient nếu có.
4. Hướng dẫn sửa text: yêu cầu thay toàn bộ text cũ bằng nội dung mới người dùng nhập, không giữ text cũ trừ khi được yêu cầu.
5. Hướng dẫn thay ảnh: nếu có ảnh đầu vào thì thay nhân vật/sản phẩm trong ảnh tham khảo bằng ảnh đầu vào, giữ bố cục.
6. Ràng buộc an toàn: quảng cáo chuyên nghiệp, trang phục kín đáo, non-sexual, phù hợp nha khoa.

Đầu ra chỉ là prompt tiếng Việt hoàn chỉnh, không markdown, không JSON, không giải thích.`;

  const userContent: any[] = [{ type: 'text', text: analyzePrompt }];
  for (const url of urls) {
    userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  const openai = await this.getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.2,
    max_tokens: 1400,
  });

  const prompt = response.choices[0]?.message?.content?.trim();
  if (!prompt) {
    throw new Error('No prompt returned from reference analysis');
  }
  return prompt;
}

async analyzeBrandAsset(params: {
  logoUrl: string;
}): Promise<{
  brandName: string;
  colors: { primary: string; secondary: string; accent: string };
  fontStyle: string;
  fontAnalysis?: {
    category: string;
    weight: string;
    letterShape: string;
    caseStyle: string;
    spacing: string;
    comparableFonts: string[];
    fontPrompt: string;
  };
  visualStyle: string;
  confidence: string;
}> {
  if (!params.logoUrl) {
    throw new Error('logoUrl is required');
  }

  const analyzePrompt = `Analyze this brand logo/brand image and return ONLY valid JSON.

Schema:
{
  "brandName": "detected brand name or empty string",
  "colors": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "accent": "#RRGGBB"
  },
  "fontStyle": "short Vietnamese description of the typography/font style",
  "fontAnalysis": {
    "category": "sans-serif|serif|script|display|rounded|geometric|humanist|condensed|other",
    "weight": "thin|light|regular|medium|semibold|bold|extrabold|mixed",
    "letterShape": "Vietnamese description of letterforms: rounded/sharp/geometric/humanist/condensed/wide/italic/etc",
    "caseStyle": "uppercase|lowercase|title case|mixed",
    "spacing": "tight|normal|wide",
    "comparableFonts": ["closest common font/style 1", "closest common font/style 2"],
    "fontPrompt": "Vietnamese instruction that can be reused in image prompt to recreate the brand typography style"
  },
  "visualStyle": "short Vietnamese description of the brand visual style",
  "confidence": "high|medium|low"
}

Rules:
- OCR the logo text/brand name if visible.
- Extract dominant brand colors as hex values.
- Inspect the actual letterforms, not only the logo mood: font category, stroke weight, corner radius, proportions, casing, spacing, slant/italic, and Vietnamese accent styling.
- If the exact font is unknown, estimate the nearest typography category and comparable common fonts/styles. Do not answer only "modern sans-serif" unless no more detail is visible.
- If unsure, still return best estimates.
- No markdown, no explanation.`;

  const openai = await this.getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: analyzePrompt },
        { type: 'image_url', image_url: { url: params.logoUrl, detail: 'high' } },
      ] as any,
    }],
    temperature: 0.1,
    max_tokens: 700,
  });

  return this.parseJsonObject(response.choices[0]?.message?.content || '', {
    brandName: '',
    colors: { primary: '#2563eb', secondary: '#0ea5e9', accent: '#22c55e' },
    fontStyle: 'Sans-serif hiện đại',
    fontAnalysis: {
      category: 'sans-serif',
      weight: 'semibold',
      letterShape: 'Chữ sans-serif hiện đại, nét sạch, dễ đọc',
      caseStyle: 'mixed',
      spacing: 'normal',
      comparableFonts: ['Inter', 'Montserrat'],
      fontPrompt: 'Dùng kiểu chữ sans-serif hiện đại, nét rõ, dễ đọc, phù hợp thương hiệu nha khoa chuyên nghiệp.',
    },
    visualStyle: 'Nhận diện thương hiệu sạch, chuyên nghiệp',
    confidence: 'low',
  });
}

async analyzeReferenceStructure(params: {
  referenceImageUrls: string[];
  mode?: 'replace_subject' | 'replace_text' | 'redesign';
}): Promise<{
  prompt: string;
  layout: Record<string, string>;
  colors: Record<string, string>;
  colorReplacements: Array<{
    originalColor: string;
    originalUsage: string;
    replaceWith: string;
    brandRole: string;
    note: string;
  }>;
  productSlots: Array<{
    role: string;
    description: string;
    position: string;
    size: string;
    shouldReplaceWithInput: boolean;
    replacementInstruction: string;
  }>;
  textItems: Array<{ role: string; originalText: string; suggestedText: string; position: string }>;
  style: Record<string, string>;
}> {
  const urls = (params.referenceImageUrls || []).filter(Boolean).slice(0, 4);
  if (urls.length === 0) {
    throw new Error('referenceImageUrls is required');
  }

  const modeGuide = params.mode === 'replace_text'
    ? 'Người dùng thường muốn chỉ thay text, giữ nguyên hình ảnh/bố cục.'
    : params.mode === 'redesign'
      ? 'Người dùng thường muốn thiết kế lại nhưng giữ tinh thần/style ảnh tham khảo.'
      : 'Người dùng thường muốn thay nhân vật/sản phẩm bằng ảnh đầu vào nhưng giữ bố cục tham khảo.';

  const analyzePrompt = `Bạn là Senior Creative Director cho quảng cáo nha khoa.
Phân tích ảnh tham khảo và trả về ONLY valid JSON, không markdown, không giải thích.
${modeGuide}

Schema:
{
  "prompt": "Prompt tiếng Việt hoàn chỉnh để sinh ảnh từ reference này",
  "layout": {
    "ratio": "tỉ lệ ảnh",
    "composition": "bố cục tổng thể",
    "logoPosition": "vị trí logo",
    "subjectPosition": "vị trí nhân vật/sản phẩm",
    "textPosition": "vị trí vùng text chính",
    "ctaPosition": "vị trí CTA/ưu đãi",
    "notes": "ghi chú bố cục"
  },
  "colors": {
    "background": "màu nền/gradient",
    "primary": "màu chính",
    "secondary": "màu phụ",
    "accent": "màu nhấn",
    "text": "màu chữ",
    "notes": "ghi chú màu sắc"
  },
  "colorReplacements": [
    {
      "originalColor": "#RRGGBB hoặc mô tả màu/gradient trong ảnh tham khảo",
      "originalUsage": "background|gradient|headline|display_text|product_name|subheadline|body_text|CTA|badge|icon|border|decoration|footer|other",
      "replaceWith": "brand.primary|brand.secondary|brand.accent|brand.text|brand.background|neutral",
      "brandRole": "primary|secondary|accent|text|background|neutral",
      "note": "màu này đang dùng ở đâu và nên đổi sang vai trò màu brand nào"
    }
  ],
  "productSlots": [
    {
      "role": "main_product|secondary_product|mockup|device|packaging|before_after|decorative_product|other",
      "description": "mô tả sản phẩm/vật thể chính đang xuất hiện trong ảnh tham khảo",
      "position": "vị trí sản phẩm trong bố cục: trái/phải/giữa/trên/dưới + mô tả gần đúng",
      "size": "kích thước tương đối: nhỏ|vừa|lớn|chiếm bao nhiêu phần khung",
      "shouldReplaceWithInput": true,
      "replacementInstruction": "cách thay sản phẩm này bằng ảnh đầu vào nhưng giữ bố cục/khung/ánh sáng/perspective"
    }
  ],
  "textItems": [
    {
      "role": "headline|subheadline|offer|cta|address|phone|footer|badge|body|other",
      "originalText": "text OCR từ ảnh, nếu không chắc ghi không rõ",
      "suggestedText": "text mới gợi ý để người dùng sửa nhanh",
      "position": "vị trí text trong ảnh"
    }
  ],
  "style": {
    "fontStyle": "kiểu font/chữ",
    "mood": "mood thiết kế",
    "decorations": "icon/badge/decor",
    "safety": "quảng cáo chuyên nghiệp, trang phục kín đáo, non-sexual"
  }
}

Yêu cầu:
- OCR toàn bộ text nhìn thấy: headline, ưu đãi, CTA, địa chỉ, phone, footer, badge, text nhỏ.
- Tách text ra nhiều item để frontend hiển thị ô sửa riêng.
- Detect sản phẩm chính/vật thể chính trong ảnh tham khảo: hộp sản phẩm, mockup, khay niềng, răng, thiết bị, before/after, banner packshot, icon sản phẩm.
- Với mọi sản phẩm chính/phụ không phải decoration thuần, tạo productSlots và đặt shouldReplaceWithInput=true để khi có ảnh đầu vào thì thay sản phẩm cũ bằng sản phẩm từ ảnh đầu vào, giữ vị trí/kích thước/perspective/ánh sáng của slot.
- Nếu ảnh tham khảo có cả người mẫu và sản phẩm, tách rõ slot người/chủ thể trong layout và slot sản phẩm trong productSlots.
- Kiểm tra toàn bộ màu quan trọng trong ảnh tham khảo: nền, gradient, headline, chữ display lớn/tên dịch vụ hoặc sản phẩm, subheadline, body text, CTA, badge, icon, border, decoration, footer, shadow/tint.
- Bắt buộc đưa các màu chữ nổi bật như vàng/gold/gradient của headline hoặc tên sản phẩm/dịch vụ vào colorReplacements; không bỏ sót chỉ vì đó là text.
- Với mỗi màu design không thuộc ảnh người/sản phẩm, tạo colorReplacements để frontend thay palette cũ bằng màu brand. Không giữ palette cũ nếu người dùng có brand.
- Prompt phải yêu cầu thay mọi text cũ bằng text trong textItems.suggestedText, giữ hierarchy/vị trí tương ứng.
- Prompt phải nhắc nếu có ảnh đầu vào thì thay nhân vật/sản phẩm theo ảnh đầu vào.
- Prompt phải family-safe, quảng cáo chuyên nghiệp, trang phục kín đáo, non-sexual.`;

  const userContent: any[] = [{ type: 'text', text: analyzePrompt }];
  for (const url of urls) {
    userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  const openai = await this.getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.1,
    max_tokens: 1800,
  });

  return this.parseJsonObject(response.choices[0]?.message?.content || '', {
    prompt: await this.analyzeReferencePrompt(params),
    layout: {},
    colors: {},
    colorReplacements: [],
    productSlots: [],
    textItems: [],
    style: {},
  });
}

async generateVideoStoryboard(params: {
  script: string;
  imageUrls?: string[];
}): Promise<string> {
  const script = params.script?.trim();
  if (!script) {
    throw new Error('script is required');
  }

  const imageUrls = (params.imageUrls || []).filter(Boolean).slice(0, 3);
  const imageCount = imageUrls.length;

  const userContent: any[] = [{
    type: 'text',
    text: `Bạn là đạo diễn video quảng cáo và prompt engineer cho Google Gemini/Omni video.

Tạo một kịch bản video ngắn tối đa 10 giây để đưa thẳng vào model tạo video.
Không chia kịch bản thành nhiều phần theo từng ảnh. Không bắt buộc tạo 4 cảnh/4 trang.

Kịch bản người dùng:
${script}

Số ảnh đầu vào: ${imageCount}
Quy ước tag ảnh cho Gemini Omni:
${imageCount > 0 ? `- Image1 = <FIRST_FRAME>, dùng làm khung hình bắt đầu.
${imageCount > 1 ? Array.from({ length: imageCount - 1 }, (_, index) => `- Image${index + 2} = <IMAGE_REF_${index}>, dùng làm ảnh tham chiếu.`).join('\n') : ''}
- Kịch bản phải bắt đầu từ <FIRST_FRAME>.
- Nếu có ảnh tham chiếu khác, bắt buộc nhắc đầy đủ từng tag <IMAGE_REF_N> trong "Prompt video tổng hợp" để Gemini Omni nhận được references. Không tạo mục riêng cho từng ảnh.` : '- Không có ảnh đầu vào, tạo kịch bản từ text prompt.'}

Yêu cầu output:
- Viết bằng tiếng Việt, rõ ràng, có thể dùng làm prompt video.
- Tổng thời lượng không quá 10 giây.
- Chỉ tạo một mục duy nhất: "### Hình 1 / Trang 1: <FIRST_FRAME>".
- Trong mục này phải có: Thời gian [0-10s] hoặc ngắn hơn, Mô tả, Hành động/chuyển động, Camera movement, Ánh sáng, Mood, Text overlay nếu cần, Transition nếu cần.
- Không tạo "Hình 2 / Trang 2", "Hình 3 / Trang 3", "Hình 4 / Trang 4".
- Không chia theo 4 phần/cảnh riêng biệt. Nếu cần diễn tiến, mô tả liền mạch trong cùng một cảnh 0-10s.
- Giữ nhận diện người/sản phẩm/không gian từ ảnh đầu vào; không biến thành nhân vật/sản phẩm khác.
- Bắt buộc giữ nguyên nhân vật từ ảnh đầu vào: mặt, tóc, tuổi, dáng người, màu da, trang phục, màu trang phục, phụ kiện và chi tiết nhận diện. Không thay đổi trang phục trừ khi người dùng yêu cầu rõ.
- Nếu ảnh là bản vẽ/mockup, chỉ dùng làm guide chuyển động và bố cục, không hiển thị nét vẽ trong final video trừ khi người dùng yêu cầu.
- Quảng cáo chuyên nghiệp, family-safe, non-sexual.
- Cuối output có mục "### Prompt video tổng hợp:" là một prompt liền mạch bằng tiếng Anh hoặc song ngữ để node Google Omni dùng render, bắt buộc bắt đầu từ <FIRST_FRAME> và giữ tổng thời lượng tối đa 10 giây.
- Nếu có nhiều ảnh đầu vào, "Prompt video tổng hợp" bắt buộc chứa đủ tất cả tag theo thứ tự: <FIRST_FRAME>${imageCount > 1 ? `, ${Array.from({ length: imageCount - 1 }, (_, index) => `<IMAGE_REF_${index}>`).join(', ')}` : ''}. Dùng các tag này trong cùng một prompt liền mạch, ví dụ: "Starting from <FIRST_FRAME>, keep the same main character and use <IMAGE_REF_0>, <IMAGE_REF_1> as visual references for consistent wardrobe, subject identity, props, style, and scene continuity..."
- Không được bỏ sót tag ảnh tham chiếu nào trong "Prompt video tổng hợp".
- Không dùng markdown table.`,
  }];

  for (const url of imageUrls) {
    userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  const openai = await this.getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.35,
    max_tokens: 1300,
  });

  const storyboard = response.choices[0]?.message?.content?.trim();
  if (!storyboard) {
    throw new Error('No storyboard returned');
  }
  return storyboard;
}

private parseJsonObject<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch (err) {
    this.logger.warn(`JSON parse failed: ${err.message}`);
    return fallback;
  }
}

/**
 * Build modular prompt from JSON spec + brand info
 * Deterministic - no AI call, just template
 */
private buildModularPrompt(spec: any, params: {
  brandName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontStyle?: string;
  mood?: string;
  description: string;
}): string {
  const s = spec || {};

  // ─── ROLE ───
  const role = `Create a premium professional marketing banner.`;

  // ─── INPUT ───
  const input = [
    `Brand: ${params.brandName || 'Premium Brand'}.`,
    `Brief: ${params.description}.`,
    params.mood ? `Mood: ${params.mood}.` : '',
  ].filter(Boolean).join(' ');

  // ─── LAYOUT ───
  const layout = s.layout ? [
    `LAYOUT:`,
    `Canvas ${s.layout.canvas || '1:1'} ratio.`,
    s.layout.textPosition ? `Reserve the ${s.layout.textPosition} ${s.layout.textArea || '45%'} for typography.` : '',
    s.layout.subjectPosition ? `Reserve the ${s.layout.subjectPosition} ${s.layout.subjectArea || '55%'} for the main subject.` : '',
    s.layout.logoPosition ? `Place logo at ${s.layout.logoPosition}.` : 'Place logo at top-left.',
    `Leave 8-10% padding on all sides.`,
    `Use clear visual hierarchy.`,
  ].filter(Boolean).join('\n') : [
    `LAYOUT:`,
    `Canvas 1:1 square.`,
    `Reserve the left 40% for typography.`,
    `Reserve the right 60% for the main visual.`,
    `Place logo at top-left.`,
    `Leave 10% padding.`,
    `Use clear visual hierarchy.`,
  ].join('\n');

  // ─── SUBJECT ───
  const subject = s.subject ? [
    `SUBJECT:`,
    s.subject.count ? `${s.subject.count} subject(s).` : '',
    s.subject.type ? `Type: ${s.subject.type}.` : '',
    `Style: ${s.subject.style || 'photorealistic, high quality'}.`,
    s.subject.crop ? `Crop: ${s.subject.crop}.` : '',
  ].filter(Boolean).join('\n') : [
    `SUBJECT:`,
    `Style: photorealistic, premium quality.`,
    `Relevant to the creative brief.`,
  ].join('\n');

  // ─── BACKGROUND ───
  const bg = s.background || {};
  const background = [
    `BACKGROUND:`,
    bg.type ? `Type: ${bg.type}.` : 'Clean gradient.',
    bg.colors?.length ? `Colors: ${bg.colors.join(' → ')}.` : (params.primaryColor ? `Colors: ${params.primaryColor}${params.secondaryColor ? ' → ' + params.secondaryColor : ''}.` : ''),
    bg.decorations?.length ? `Decorations: ${bg.decorations.join(', ')}.` : 'Subtle decorative elements.',
  ].filter(Boolean).join('\n');

  // ─── TYPOGRAPHY ───
  const typo = s.typography || {};
  const typography = [
    `TYPOGRAPHY:`,
    `ALL TEXT MUST BE IN VIETNAMESE (tiếng Việt).`,
    `Headline: ${typo.headlineStyle || 'bold, large, eye-catching'}.`,
    typo.subHeadlineStyle ? `Sub-headline: ${typo.subHeadlineStyle}.` : '',
    `Body: ${typo.bodyStyle || params.fontStyle || 'clean modern sans-serif'}.`,
    `High contrast for readability.`,
  ].filter(Boolean).join('\n');

  // ─── COLORS ───
  const colors = s.colors ? [
    `COLORS:`,
    `Primary: ${s.colors.primary || params.primaryColor || '#000000'}.`,
    `Secondary: ${s.colors.secondary || params.secondaryColor || '#FFFFFF'}.`,
    s.colors.accent ? `Accent: ${s.colors.accent}.` : '',
  ].filter(Boolean).join('\n') : (params.primaryColor ? [
    `COLORS:`,
    `Primary: ${params.primaryColor}.`,
    params.secondaryColor ? `Secondary: ${params.secondaryColor}.` : '',
    `Use brand colors prominently.`,
  ].filter(Boolean).join('\n') : '');

  // ─── CTA ───
  const ctaSpec = s.CTA || s.cta;
  const cta = ctaSpec ? [
    `CTA:`,
    `Style: ${ctaSpec.style || 'rounded button, high contrast'}.`,
    `Position: ${ctaSpec.position || 'bottom center'}.`,
    `Text in Vietnamese.`,
  ].join('\n') : '';

  // ─── DECORATIONS ───
  const decoList = s.decorations || s.decoration;
  const decorations = decoList && Array.isArray(decoList) ? [
    `DECORATIONS:`,
    `${decoList.join(', ')}.`,
    `Keep subtle, don't overwhelm.`,
  ].join('\n') : '';

  // ─── NEGATIVE ───
  const negList = s.negative;
  const negative = [
    `NEGATIVE (do NOT include):`,
    negList ? (Array.isArray(negList) ? negList.join('. ') + '.' : negList) : '',
    `No cluttered design. No blurry text. No English text. No watermarks. No low quality.`,
  ].filter(Boolean).join('\n');

  // ─── COMBINE ALL MODULES ───
  return [role, input, '', layout, '', subject, '', background, '', typography, '', colors, '', cta, '', decorations, '', negative]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

  /**
   * Chat completion using GPT model.
   * Used for chatbot training - takes system prompt (training data) and user message.
   */
  async chatCompletion(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    this.logger.log('Calling ChatGPT for chatbot training...');

    try {
      const openai = await this.getClient();
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });

      const reply = response.choices[0]?.message?.content;
      if (!reply) {
        throw new Error('No response from ChatGPT');
      }

      return reply;
    } catch (error) {
      this.logger.error(`ChatGPT error: ${error.message}`);
      throw error;
    }
  }
}
