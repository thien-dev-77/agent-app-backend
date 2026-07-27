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

    input.push({
      type: 'text',
      text: input.length > 0
        ? `${prompt}\n\nUse the input image(s) as the visual source. Turn them into realistic footage. Use the image only as guidance for identity, subject, composition, and motion. Do not show any drawing/sketch/UI from the input in the final video unless explicitly requested.`
        : prompt,
    });

    this.logger.log('[Video] Using gemini-omni-flash-preview interactions...');
    const interaction = await ai.interactions.create({
      model: 'gemini-omni-flash-preview',
      input,
      generationConfig: {
        videoConfig: {
          task: inputImageUrls?.length ? 'image_to_video' : 'text_to_video',
        },
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
