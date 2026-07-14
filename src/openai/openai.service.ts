import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { Brand } from '../entities/brand.entity';
import { Template } from '../entities/template.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly openai: OpenAI;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
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
  ): Promise<string> {
    this.logger.log(`Generating image with prompt: ${prompt.substring(0, 100)}...`);

    try {
      let b64Data: string;

      if (referenceImages && referenceImages.length > 0) {
        // Use images.edit() to incorporate reference images (logo, etc.)
        b64Data = await this.generateWithReferences(prompt, size, referenceImages);
      } else {
        // Use images.generate() for text-only
        b64Data = await this.generateTextOnly(prompt, size);
      }

      // Upload to Supabase Storage
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
    const response = await this.openai.images.generate({
      model: 'gpt-image-2',
      prompt: prompt,
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

  /**
   * Generate with reference images using images.edit()
   * Image[0] = brand logo (nếu có), Image[1..] = style/layout references
   */
  private async generateWithReferences(
    prompt: string,
    size: string,
    referenceImages: string[],
  ): Promise<string> {
    const imageFiles: any[] = [];
    this.logger.log(`Downloading ${referenceImages.length} reference images...`);

    for (let i = 0; i < Math.min(referenceImages.length, 4); i++) {
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
      return this.generateTextOnly(prompt, size);
    }

    // Xây dựng instruction rõ ràng hơn về vai trò từng ảnh
    let imageInstruction: string;
    if (referenceImages.length >= 2) {
      // Ảnh đầu = logo brand, ảnh sau = layout tham khảo
      imageInstruction = `Image[0] is the NEW BRAND LOGO — use it as the brand identity.
Image[1..] are LAYOUT/STYLE REFERENCES — copy their composition, structure, color zones, and design layout exactly.
TASK: Recreate the layout from the reference image(s) but replace ALL brand elements (logos, brand name, colors) with the new brand from Image[0].
Keep all other design elements: composition, typography style, spacing, decorations, background structure.`;
    } else {
      // Chỉ có 1 ảnh — có thể là logo hoặc reference
      imageInstruction = `Use the provided image as both style reference and source material.
Incorporate it directly into the design according to the prompt instructions.`;
    }

    const fullPrompt = `${prompt}\n\n[Image roles:\n${imageInstruction}]`;

    const response = await this.openai.images.edit({
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

      const analyzeResponse = await this.openai.chat.completions.create({
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

      const specResponse = await this.openai.chat.completions.create({
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
      const response = await this.openai.chat.completions.create({
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
