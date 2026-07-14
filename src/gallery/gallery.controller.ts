import { Controller, Get, Query } from '@nestjs/common';
import { GalleryService, GalleryResponse, PromptResponse } from './gallery.service';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async getGalleryImages(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
    @Query('model') model?: string,
  ): Promise<GalleryResponse> {
    return this.galleryService.getGalleryImages(
      limit ? parseInt(limit) : 24,
      offset ? parseInt(offset) : 0,
      sort || 'latest',
      model || 'gpt-image',
    );
  }

  @Get('prompt')
  async getPrompt(@Query('share_id') shareId: string): Promise<PromptResponse> {
    if (!shareId) {
      return { error: 'share_id is required', prompt: '' };
    }
    return this.galleryService.getPromptByShareId(shareId);
  }
}
