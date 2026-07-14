import { Injectable, Logger } from '@nestjs/common';
import * as galleryDataRaw from './data/gallery-data.json';

export interface GalleryItem {
  id: number;
  user_name: string;
  user_avatar: string;
  user_handle: string;
  output_image_url: string;
  likes_count: number;
  view_count: number;
  created_at: string;
  prompt: string | null;
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
  private readonly galleryItems: GalleryItem[];

  constructor() {
    // Handle both default export and direct array
    const data = (galleryDataRaw as any).default || galleryDataRaw;
    this.galleryItems = Array.isArray(data) ? data : [];
    this.logger.log(`Loaded ${this.galleryItems.length} gallery items`);
  }

  async getGalleryImages(
    limit = 24,
    offset = 0,
    sort = 'latest',
    model = 'gpt-image',
  ): Promise<GalleryResponse> {
    this.logger.log(`Fetching gallery: limit=${limit}, offset=${offset}`);
    
    // Filter and sort
    let items = [...this.galleryItems];
    
    if (sort === 'latest') {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    
    // Pagination
    const paginatedItems = items.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const hasMore = nextOffset < items.length;
    
    this.logger.log(`Returning ${paginatedItems.length} items, hasMore: ${hasMore}`);
    
    return {
      data: paginatedItems,
      nextOffset,
      hasMore,
    };
  }

  async getPromptByShareId(shareId: string): Promise<PromptResponse> {
    this.logger.log(`Looking up prompt for share_id: ${shareId}`);

    // Đọc thẳng từ data JSON (đã được pre-fetch đầy đủ)
    const item = this.galleryItems.find(i => i.share_id === shareId);
    if (item?.prompt) {
      return { prompt: item.prompt };
    }

    // Fallback về prompt_excerpt nếu chưa có prompt đầy đủ
    if (item?.prompt_excerpt) {
      return { prompt: item.prompt_excerpt };
    }

    return { prompt: '' };
  }
}
