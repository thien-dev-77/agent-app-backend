import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
  }

  /**
   * Upload file to Supabase Storage and return public URL
   */
  async uploadFile(
    file: Express.Multer.File,
    bucket: string = 'uploads',
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = `${bucket}/${fileName}`;

    this.logger.log(`Uploading file: ${fileName} to bucket: ${bucket}`);

    try {
      // Upload to Supabase Storage via REST API
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${filePath}`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.supabaseAnonKey}`,
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        },
        body: new Uint8Array(file.buffer),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Supabase upload failed: ${response.status} - ${errorBody}`);
      }

      // Return public URL
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${filePath}`;
      this.logger.log(`File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
  }
}
