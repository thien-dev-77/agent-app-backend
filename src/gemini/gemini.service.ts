import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
  }

  /**
   * Generate video using Gemini/Veo
   * Supports multiple input images + text prompt → video
   * Flow: submit → poll operation → download → upload Supabase
   */
  async generateVideo(
    prompt: string,
    inputImageUrls?: string[],
  ): Promise<{ videoUrl: string }> {
    this.logger.log(`[Video] Starting generation`);
    this.logger.log(`[Video] Prompt: ${prompt.substring(0, 80)}...`);
    this.logger.log(`[Video] Input images: ${inputImageUrls?.length || 0}`);

    // Prepare image parts
    const imageParts: any[] = [];
    if (inputImageUrls && inputImageUrls.length > 0) {
      for (const url of inputImageUrls.slice(0, 6)) {
        try {
          const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
          const base64 = Buffer.from(response.data).toString('base64');
          const mimeType = response.headers['content-type'] || 'image/png';
          imageParts.push({ inlineData: { mimeType, data: base64 } });
          this.logger.log(`[Video] Added image: ${mimeType} (${Math.round(response.data.length / 1024)}KB)`);
        } catch (err) {
          this.logger.warn(`[Video] Skip image ${url.slice(0, 50)}: ${err.message}`);
        }
      }
    }

    // Try Veo model first (long-running operation)
    try {
      return await this.generateWithVeo(prompt, imageParts);
    } catch (veoErr) {
      this.logger.warn(`[Video] Veo failed: ${veoErr.message}, trying Gemini Flash...`);
    }

    // Fallback: Gemini Flash generateContent
    try {
      return await this.generateWithGeminiFlash(prompt, imageParts);
    } catch (flashErr) {
      this.logger.error(`[Video] All methods failed: ${flashErr.message}`);
      throw flashErr;
    }
  }

  /**
   * Method 1: Veo model (long-running operation with polling)
   */
  private async generateWithVeo(prompt: string, imageParts: any[]): Promise<{ videoUrl: string }> {
    this.logger.log('[Video] Using Veo model...');

    // Submit generation request
    const submitUrl = `${this.baseUrl}/models/veo-002:predictLongRunning?key=${this.apiKey}`;

    const instance: any = { prompt };
    // Nếu có ảnh, truyền ảnh đầu tiên làm image input
    if (imageParts.length > 0) {
      instance.image = {
        bytesBase64Encoded: imageParts[0].inlineData.data,
        mimeType: imageParts[0].inlineData.mimeType,
      };
    }

    const submitRes = await axios.post(submitUrl, {
      instances: [instance],
      parameters: {
        durationSeconds: 5,
        enhancePrompt: true,
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const operationName = submitRes.data?.name;
    if (!operationName) {
      throw new Error('No operation name returned from Veo');
    }

    this.logger.log(`[Video] Operation started: ${operationName}`);

    // Poll until done
    const videoUri = await this.pollOperation(operationName);

    // Download from Google → Upload to Supabase
    const videoUrl = await this.downloadAndUploadVideo(videoUri);
    return { videoUrl };
  }

  /**
   * Poll operation until complete
   */
  private async pollOperation(operationName: string, maxPolls = 120): Promise<string> {
    let done = false;
    let videoUri = '';
    let polls = 0;

    while (!done && polls < maxPolls) {
      this.logger.log(`[Video] Polling ${polls + 1}/${maxPolls}...`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10s

      try {
        const pollRes = await axios.get(
          `${this.baseUrl}/${operationName}`,
          {
            params: { key: this.apiKey },
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
          },
        );

        const data = pollRes.data;
        done = data?.done === true;

        if (done) {
          videoUri =
            data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
            data?.response?.generatedVideos?.[0]?.video?.uri ||
            '';
          this.logger.log(`[Video] Done! URI: ${videoUri.slice(0, 80)}`);
        }
      } catch (pollErr) {
        this.logger.warn(`[Video] Poll error (${polls + 1}): ${pollErr.message}`);
      }

      polls++;
    }

    if (!done) {
      throw new Error(`Timeout after ${maxPolls * 10}s`);
    }

    if (!videoUri) {
      throw new Error('No video URI in response');
    }

    return videoUri;
  }

  /**
   * Method 2: Gemini Flash generateContent (for quick/short videos)
   */
  private async generateWithGeminiFlash(prompt: string, imageParts: any[]): Promise<{ videoUrl: string }> {
    this.logger.log('[Video] Using Gemini Flash...');

    const url = `${this.baseUrl}/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`;

    const parts: any[] = [...imageParts, { text: `Generate a short video: ${prompt}` }];

    const response = await axios.post(url, {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['VIDEO', 'TEXT'] },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    const candidates = response.data?.candidates || [];
    for (const candidate of candidates) {
      const responseParts = candidate?.content?.parts || [];
      for (const part of responseParts) {
        if (part.inlineData?.mimeType?.startsWith('video/')) {
          // Video trả về inline → upload Supabase
          const videoBuffer = Buffer.from(part.inlineData.data, 'base64');
          const videoUrl = await this.uploadToSupabase(videoBuffer, 'video/mp4');
          return { videoUrl };
        }
        if (part.fileData?.fileUri) {
          const videoUrl = await this.downloadAndUploadVideo(part.fileData.fileUri);
          return { videoUrl };
        }
      }
    }

    throw new Error('No video in Gemini Flash response');
  }

  /**
   * Download video from Google URI → Upload to Supabase
   */
  private async downloadAndUploadVideo(googleUri: string): Promise<string> {
    this.logger.log(`[Video] Downloading from Google: ${googleUri.slice(0, 80)}...`);

    // Download with API key
    const separator = googleUri.includes('?') ? '&' : '?';
    const downloadUrl = `${googleUri}${separator}key=${this.apiKey}`;

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: { Accept: 'video/*' },
    });

    const videoBuffer = Buffer.from(response.data);
    this.logger.log(`[Video] Downloaded: ${Math.round(videoBuffer.length / 1024)}KB`);

    return this.uploadToSupabase(videoBuffer, 'video/mp4');
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
