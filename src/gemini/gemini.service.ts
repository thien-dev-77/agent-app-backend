import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
  }

  private async getApiKey(): Promise<string> {
    const apiKey = await this.settingsService.getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }
    return apiKey;
  }

  /**
   * Generate video using Google Gemini Omni interactions.
   * Supports image(s) + storyboard prompt → base64 video → Supabase URL.
   */
  async generateVideo(
    prompt: string,
    inputImageUrls?: string[],
    options?: {
      aspectRatio?: '16:9' | '9:16';
      durationSeconds?: number;
      voiceStyle?: string;
      videoStyle?: 'tvc' | 'intro';
    },
  ): Promise<{ videoUrl: string }> {
    this.logger.log(`[Video] Starting generation`);
    this.logger.log(`[Video] Prompt: ${prompt.substring(0, 80)}...`);
    this.logger.log(`[Video] Input images: ${inputImageUrls?.length || 0}`);
    const apiKey = await this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const input: any[] = [];
    const videoInputImageUrls = (inputImageUrls || []).filter(Boolean).slice(0, 1);
    if ((inputImageUrls?.length || 0) > videoInputImageUrls.length) {
      this.logger.warn(`[Video] Using only the first source image for Gemini Omni image_to_video stability`);
    }
    if (videoInputImageUrls.length > 0) {
      for (const url of videoInputImageUrls) {
        try {
          const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
          const base64 = Buffer.from(response.data).toString('base64');
          const mimeType = response.headers['content-type'] || 'image/jpeg';
          input.push({ type: 'image', data: base64, mime_type: mimeType });
          this.logger.log(`[Video] Added image: ${mimeType} (${Math.round(response.data.length / 1024)}KB)`);
        } catch (err) {
          this.logger.warn(`[Video] Skip image ${url.slice(0, 50)}: ${err.message}`);
        }
      }
    }

    const imageCount = input.length;
    const compactPrompt = this.extractVideoPrompt(prompt);
    const referenceOnlyPrompt = compactPrompt
      .replace(/<FIRST_FRAME>/g, '<__FIRST_FRAME_REF__>')
      .replace(/<IMAGE_REF_(\d+)>/g, (_, index) => `<IMAGE_REF_${Number(index) + 1}>`)
      .replace(/<__FIRST_FRAME_REF__>/g, '<IMAGE_REF_0>');
    const imageTags = imageCount > 0
      ? [
          `[# References ${Array.from({ length: imageCount }, (_, index) => `<IMAGE_REF_${index}>@Image${index + 1}`).join(' ')}]`,
          '',
          `Image tag rules: Use all images only as scene and subject continuity references, not literal initial frames. Do not show any storyboard/reference still as the first frame. Reference tags start at <IMAGE_REF_0> for Image1. Treat <IMAGE_REF_0> as the primary continuity reference for the main subject and wardrobe. Other reference images should guide motion, camera, scene continuity, and composition without overriding the main subject continuity from <IMAGE_REF_0>.`,
        ].filter(Boolean).join('\n')
      : '';
    const videoStyle = options?.videoStyle || 'tvc';
    const styleInstruction = videoStyle === 'intro'
      ? `Video style: natural introduction video. Create a calm, realistic, straightforward intro/explainer clip with gentle camera movement, minimal transitions, no aggressive sales hook, no hard-sell CTA, and no flashy TVC pacing. Show the person/product/service clearly and naturally, like a professional brand introduction or product overview.`
      : `Video style: polished TVC commercial. Create a clear opening hook, visual benefit moment, product/brand hero moment, cinematic pacing, and a short CTA. Keep transitions purposeful and commercial-quality.`;
    const imageToVideoMotionInstruction = imageCount > 0
      ? `Image-to-video motion rules for Google Omni:
- Use the input image(s) as visual continuity references. Do not redraw, redesign, beautify, age-change, restyle, or reinterpret the subject/product.
- Maintain subject, wardrobe, product, and scene continuity from the reference image(s) without requesting recognition of any named or private individual.
- The animation prompt should describe MOTION ONLY. Do not repeat detailed appearance descriptions from the source image such as beauty, hair color, dress color, face shape, age, skin tone, or wardrobe details.
- Animate subtle realistic micro-movements from the storyboard: natural breathing, subtle eye blinking, micro-expressions, soft smile only when appropriate, natural lip movement if speaking, tiny head/shoulder shifts, relaxed hand/finger motion, and slight hair sway when wind or movement exists.
- Add small environmental realism only when appropriate: soft wind, realistic light reflections in the eyes, tiny dust particles, gentle fabric movement, minor handheld camera drift, slow pan/push-in, or natural focus breathing.
- Keep motion restrained and continuous. Fewer extra visual details produce a more natural result and reduce face/body deformation.`
      : '';

    const videoPrompt = [
      imageTags,
      imageCount > 0 ? referenceOnlyPrompt : compactPrompt,
      styleInstruction,
      imageToVideoMotionInstruction,
      options?.durationSeconds ? `Target duration: ${options.durationSeconds} seconds. Pace the storybook shots to fit this exact duration as closely as the model allows.` : '',
      options?.voiceStyle ? `Audio/voice: ${options.voiceStyle}. Vietnamese language voiceover if narration is present. Keep speech natural, clear, and suitable for a professional TVC commercial.` : '',
    ].filter(Boolean).join('\n\n');

    input.push({
      type: 'text',
      text: input.length > 0
        ? `${videoPrompt}\n\nUse the tagged images only as visual references for video generation. The input may contain a human subject, a product, or both. Use <IMAGE_REF_0> as the primary reference for subject continuity, wardrobe continuity, and product continuity. If any reference contains a product, preserve the product shape, packaging, label, logo, material, color, scale, and key details. Use later reference images for motion, camera, scene continuity, composition, product/service clarity, brand mood, and styling only; they must not change the main subject, wardrobe, or product continuity. The references should not be used as literal first frames or still images in the final video. Do not show any drawing/sketch/UI/storyboard still from the input in the final video unless explicitly requested. Do not mention names or request recognition of any named or private individual. For realism, follow the storyboard action but keep the generated video prompt motion-first: subtle eye blinks, natural breathing, micro-expressions, gentle lip movement when speaking, slight hair/fabric movement, small body shifts, realistic eye highlights, and slow natural camera movement. Avoid adding new appearance descriptions because they can cause face/body deformation.`
        : videoPrompt,
    });

    this.logger.log('[Video] Using gemini-omni-flash-preview interactions...');
    const interaction = await ai.interactions.create({
      model: 'gemini-omni-flash-preview',
      input,
      generation_config: {
        video_config: {
          task: imageCount > 0 ? 'image_to_video' : 'text_to_video',
        },
      },
      response_format: {
        type: 'video',
        aspect_ratio: options?.aspectRatio || '16:9',
      },
    } as any);

    const outputVideo = (interaction as any).output_video;
    if (!outputVideo?.data) {
      throw new Error('No output video returned from Gemini Omni');
    }

    const videoBuffer = Buffer.from(outputVideo.data, 'base64');
    this.logger.log(`[Video] Generated: ${Math.round(videoBuffer.length / 1024)}KB`);

    const videoUrl = await this.uploadToSupabase(videoBuffer, 'video/mp4');
    return { videoUrl };
  }

  private extractVideoPrompt(prompt: string): string {
    const cleaned = (prompt || '').trim();
    const marker = '### Prompt video tổng hợp:';
    const markerIndex = cleaned.toLowerCase().indexOf(marker.toLowerCase());
    const promptText = markerIndex >= 0
      ? cleaned.slice(markerIndex + marker.length).trim()
      : cleaned;

    return promptText
      .replace(/real person/gi, 'human subject')
      .replace(/person identity/gi, 'subject continuity')
      .replace(/facial identity/gi, 'subject continuity')
      .replace(/exact face/gi, 'source subject')
      .replace(/face match/gi, 'subject continuity')
      .replace(/likeness/gi, 'visual continuity')
      .slice(0, 2500);
  }

  /**
   * Upload buffer to Supabase Storage
   */
  private async uploadToSupabase(buffer: Buffer, contentType: string): Promise<string> {
    const ext = contentType.includes('video') ? 'mp4' : 'png';
    const fileName = `videos/${uuidv4()}.${ext}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/uploads/${fileName}`;

    this.logger.log(`[Video] Uploading to Supabase: ${fileName} (${Math.round(buffer.length / 1024)}KB)`);

    const response = await axios.put(uploadUrl, buffer, {
      headers: {
        Authorization: `Bearer ${this.supabaseAnonKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      timeout: 60000,
      maxBodyLength: 100 * 1024 * 1024, // 100MB
    });

    if (response.status >= 400) {
      throw new Error(`Supabase upload failed: ${response.status}`);
    }

    const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/uploads/${fileName}`;
    this.logger.log(`[Video] Uploaded: ${publicUrl}`);
    return publicUrl;
  }
}
