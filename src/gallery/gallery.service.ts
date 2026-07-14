import { Injectable, Logger } from '@nestjs/common';

export interface GalleryItem {
  id: number;
  user_name: string;
  user_avatar: string;
  user_handle: string;
  output_image_url: string;
  likes_count: number;
  view_count: number;
  created_at: string;
  prompt_excerpt: string;
  model: string;
  size: string;
  quality: string;
  share_id: string;
}

export interface GalleryResponse {
  data: GalleryItem[];
  nextOffset: number;
  hasMore: boolean;
}

export interface PromptResponse {
  prompt: string;
  [key: string]: any;
}

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);
  private readonly API_BASE = 'https://promptsref.com/api';

  async getGalleryImages(
    limit = 24,
    offset = 0,
    sort = 'latest',
    model = 'gpt-image',
  ): Promise<GalleryResponse> {
    try {
      const url = `${this.API_BASE}/home/showcase-works?limit=${limit}&offset=${offset}&sort=${sort}&model=${model}`;
      
      this.logger.log(`Fetching gallery: ${url}`);
      
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!res.ok) {
        this.logger.error(`Gallery API error: ${res.status} ${res.statusText}`);
        return { data: [], nextOffset: offset, hasMore: false };
      }

      const data = await res.json();
      this.logger.log(`Fetched ${data.data?.length || 0} images`);
      return data;
    } catch (error) {
      this.logger.error(`Gallery fetch error: ${error.message}`);
      return { data: [], nextOffset: offset, hasMore: false };
    }
  }

  async getPromptByShareId(shareId: string): Promise<PromptResponse> {
    try {
      const url = `${this.API_BASE}/work/get-prompt-by-share-id?share_id=${shareId}`;
      
      this.logger.log(`Fetching prompt for share_id: ${shareId}`);
      
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!res.ok) {
        this.logger.error(`Prompt API error: ${res.status} ${res.statusText}`);
        return { prompt: '' };
      }

      const data = await res.json();
      return data;
    } catch (error) {
      this.logger.error(`Prompt fetch error: ${error.message}`);
      return { prompt: '' };
    }
  }
}
