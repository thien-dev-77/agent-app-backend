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
    },
  ): Promise<{ videoUrl: string }> {
    this.logger.log(`[Video] Starting generation`);
    this.logger.log(`[Video] Prompt: ${prompt.substring(0, 80)}...`);
    this.logger.log(`[Video] Input images: ${inputImageUrls?.length || 0}`);
    const apiKey = await this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const input: any[] = [];
    if (inputImageUrls && inputImageUrls.length > 0) {
      for (const url of inputImageUrls.slice(0, 4)) {
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
    const referenceOnlyPrompt = prompt
      .replace(/<FIRST_FRAME>/g, '<__FIRST_FRAME_REF__>')
      .replace(/<IMAGE_REF_(\d+)>/g, (_, index) => `<IMAGE_REF_${Number(index) + 1}>`)
      .replace(/<__FIRST_FRAME_REF__>/g, '<IMAGE_REF_0>');
    const imageTags = imageCount > 0
      ? [
          `[# References ${Array.from({ length: imageCount }, (_, index) => `<IMAGE_REF_${index}>@Image${index + 1}`).join(' ')}]`,
          '',
          `Image tag rules: Use all images only as references, not literal initial frames. Do not show any storyboard/reference still as the first frame. Reference tags start at <IMAGE_REF_0> for Image1. Treat <IMAGE_REF_0> as the primary identity reference when it contains a real person: preserve the exact face, facial proportions, age, hairstyle, hair color, skin tone, body shape, clothing, clothing color, accessories, and distinctive details. Other reference images should guide motion, camera, scene continuity, and composition without overriding the identity from <IMAGE_REF_0>.`,
        ].filter(Boolean).join('\n')
      : '';

    const videoPrompt = [
      imageTags,
      imageCount > 0 ? referenceOnlyPrompt : prompt,
      options?.durationSeconds ? `Target duration: ${options.durationSeconds} seconds. Pace the storybook shots to fit this exact duration as closely as the model allows.` : '',
      options?.voiceStyle ? `Audio/voice: ${options.voiceStyle}. Vietnamese language voiceover if narration is present. Keep speech natural, clear, and suitable for a professional TVC commercial.` : '',
    ].filter(Boolean).join('\n\n');

    input.push({
      type: 'text',
      text: input.length > 0
        ? `${videoPrompt}\n\nCreate a polished TVC commercial. Use the tagged images only as visual references for video generation. The input may contain a real person, a product, or both. If <IMAGE_REF_0> contains a real person, prioritize it above all other images for facial identity and wardrobe consistency. Keep the same face, facial structure, age, hairstyle, hair color, skin tone, body shape, outfit, outfit color, accessories, and distinctive details throughout the whole video. If any reference contains a product, preserve the exact product shape, packaging, label, logo, material, color, scale, and key details. Use later reference images for motion, camera, scene continuity, composition, product hero moments, brand mood, and styling only; they must not change the person's identity, clothing, or product identity. The references should not be used as literal first frames or still images in the final video. Turn the referenced subjects, products, composition, and motion guidance into realistic TVC footage with a clear hook, benefit moment, brand/product emphasis, and short CTA. Do not show any drawing/sketch/UI/storyboard still from the input in the final video unless explicitly requested.`
        : videoPrompt,
    });

    this.logger.log('[Video] Using gemini-omni-flash-preview interactions...');
    const interaction = await ai.interactions.create({
      model: 'gemini-omni-flash-preview',
      input,
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
