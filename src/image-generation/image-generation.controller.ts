import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
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
  findAll(): Promise<ImageGeneration[]> {
    return this.imageGenerationService.findAll();
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
}
