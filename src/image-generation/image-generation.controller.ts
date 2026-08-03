import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { CreateImageGenerationDto } from './dto';
import { ImageGeneration } from '../entities/image-generation.entity';
import { OpenAIService } from '../openai/openai.service';

@Controller('image-generations')
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly openaiService: OpenAIService,
  ) {}

  @Get()
  findAll(@Query('project_id') projectId?: string): Promise<ImageGeneration[]> {
    return this.imageGenerationService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ImageGeneration> {
    return this.imageGenerationService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateImageGenerationDto): Promise<ImageGeneration> {
    return this.imageGenerationService.create(dto);
  }

  @Post('generate-prompt')
  async generatePrompt(@Body() body: {
    brand_name?: string;
    primary_color?: string;
    secondary_color?: string;
    font_style?: string;
    mood?: string;
    description: string;
    reference_description?: string;
    reference_image_urls?: string[];
  }): Promise<{ prompt: string }> {
    const prompt = await this.openaiService.generateCreativePrompt({
      brandName: body.brand_name,
      primaryColor: body.primary_color,
      secondaryColor: body.secondary_color,
      fontStyle: body.font_style,
      mood: body.mood,
      description: body.description,
      referenceDescription: body.reference_description,
      referenceImageUrls: body.reference_image_urls,
    });
    return { prompt };
  }

  @Post('analyze-reference-prompt')
  async analyzeReferencePrompt(@Body() body: {
    reference_image_urls: string[];
    mode?: 'replace_subject' | 'replace_text' | 'redesign';
  }): Promise<{ prompt: string }> {
    const prompt = await this.openaiService.analyzeReferencePrompt({
      referenceImageUrls: body.reference_image_urls,
      mode: body.mode,
    });
    return { prompt };
  }

  @Post('analyze-reference-structure')
  async analyzeReferenceStructure(@Body() body: {
    reference_image_urls: string[];
    mode?: 'replace_subject' | 'replace_text' | 'redesign';
  }) {
    return this.openaiService.analyzeReferenceStructure({
      referenceImageUrls: body.reference_image_urls,
      mode: body.mode,
    });
  }

  @Post('analyze-brand-asset')
  async analyzeBrandAsset(@Body() body: {
    logo_url: string;
  }) {
    return this.openaiService.analyzeBrandAsset({
      logoUrl: body.logo_url,
    });
  }

  @Post('generate-video-storyboard')
  async generateVideoStoryboard(@Body() body: {
    script: string;
    image_urls?: string[];
  }): Promise<{ storyboard: string }> {
    const storyboard = await this.openaiService.generateVideoStoryboard({
      script: body.script,
      imageUrls: body.image_urls,
    });
    return { storyboard };
  }

  @Post('generate-content')
  async generateContent(@Body() body: {
    brand?: {
      name?: string;
      primary_color?: string;
      secondary_color?: string;
      description?: string;
      logo_url?: string;
    };
    marketing_plan?: string;
    guideline?: string;
    brief: string;
    content_type?: 'facebook_ad' | 'daily_post' | 'video_script';
    image_urls?: string[];
  }): Promise<{ content: string }> {
    const content = await this.openaiService.generateMarketingContent({
      brand: body.brand,
      marketingPlan: body.marketing_plan,
      guideline: body.guideline,
      brief: body.brief,
      contentType: body.content_type,
      imageUrls: body.image_urls,
    });
    return { content };
  }
}
