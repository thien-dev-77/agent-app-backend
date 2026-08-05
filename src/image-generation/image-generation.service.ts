import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageGeneration, ImageGenerationStatus } from '../entities/image-generation.entity';
import { BrandsService } from '../brands/brands.service';
import { TemplatesService } from '../templates/templates.service';
import { OpenAIService } from '../openai/openai.service';
import { CreateImageGenerationDto } from './dto';
import { Template } from '../entities/template.entity';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(
    @InjectRepository(ImageGeneration)
    private readonly imageGenRepository: Repository<ImageGeneration>,
    private readonly brandsService: BrandsService,
    private readonly templatesService: TemplatesService,
    private readonly openaiService: OpenAIService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId?: string): Promise<ImageGeneration[]> {
    return this.imageGenRepository.find({
      where: projectId ? { project_id: projectId } : {},
      relations: ['brand', 'template', 'project'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ImageGeneration> {
    const imageGen = await this.imageGenRepository.findOne({
      where: { id },
      relations: ['brand', 'template', 'project'],
    });
    if (!imageGen) {
      throw new NotFoundException(`ImageGeneration with ID "${id}" not found`);
    }
    return imageGen;
  }

  async create(dto: CreateImageGenerationDto): Promise<ImageGeneration> {
    // Validate brand if provided
    let brand: any = null;
    if (dto.brand_id) {
      try {
        brand = await this.brandsService.findOne(dto.brand_id);
      } catch {
        // Brand not found, continue without brand
      }
    }

    // Validate template if provided
    let template: Template | null = null;
    if (dto.template_id) {
      template = await this.templatesService.findOne(dto.template_id);
    }

    let project: any = null;
    if (dto.project_id) {
      project = await this.projectsService.findOne(dto.project_id);
      if (project.brand_id && dto.brand_id && project.brand_id !== dto.brand_id) {
        throw new BadRequestException('Project brand does not match the selected brand');
      }
    }

    // Build prompt
    const prompt = brand
      ? this.openaiService.buildPrompt(brand, template, dto.user_input)
      : dto.user_input;

    this.logger.log(`[CREATE] user_input: "${dto.user_input}"`);
    this.logger.log(`[CREATE] built prompt: "${prompt.slice(0, 100)}..."`);
    this.logger.log(`[CREATE] brand: ${brand?.name || 'none'}, logo: ${brand?.logo_url || 'none'}`);
    this.logger.log(`[CREATE] refs from user: ${(dto.reference_images || []).length}`);
    this.logger.log(`[CREATE] input images: ${(dto.input_images || []).length}, style refs: ${(dto.style_reference_images || []).length}`);

    // Determine image size - ưu tiên từ DTO, sau đó từ template
    let size = dto.size || '1024x1024';
    if (!dto.size && template) {
      const w = template.width;
      const h = template.height;
      if (w > h) size = '1536x1024';
      else if (h > w) size = '1024x1536';
    }

    // Quality từ DTO (high/medium/low) - OpenAI dùng 'hd' hoặc 'standard'
    const quality = dto.quality === 'high' || dto.quality === 'hd' ? 'hd' : 'standard';

    const inputImages = dto.input_images || [];
    const styleReferenceImages = dto.style_reference_images || dto.reference_images || [];
    const allReferences = [
      ...inputImages,
      ...styleReferenceImages.filter((url) => !inputImages.includes(url)),
    ];
    if (brand?.logo_url && dto.mode !== 'edit') {
      // Logo đặt đầu để AI biết đây là brand mới cần inject
      allReferences.unshift(brand.logo_url);
    }

    // Create record with processing status
    const imageGen = this.imageGenRepository.create({
      brand_id: dto.brand_id || null,
      template_id: dto.template_id || null,
      project_id: dto.project_id || null,
      prompt,
      status: ImageGenerationStatus.PROCESSING,
      reference_images: allReferences.length > 0 ? allReferences : null,
      metadata: {
        ...(dto.metadata || {}),
        input_images: inputImages,
        style_reference_images: styleReferenceImages,
        variation_index: dto.variation_index,
      },
    });

    const saved = await this.imageGenRepository.save(imageGen);

    // Generate SYNCHRONOUSLY - wait for result before returning
    try {
      this.logger.log(`Generating image ${saved.id}...`);

      const resultUrl = await this.openaiService.generateImage(
        prompt,
        size,
        allReferences.length > 0 ? allReferences : undefined,
        brand?.name,
        brand?.logo_url || undefined,
        {
          inputImageCount: inputImages.length,
          styleReferenceImageCount: styleReferenceImages.length,
          editMode: dto.mode === 'edit',
          variationIndex: dto.variation_index,
        },
      );

      // Update with result
      saved.status = ImageGenerationStatus.COMPLETED;
      saved.result_url = resultUrl;
      await this.imageGenRepository.save(saved);

      this.logger.log(`Image generation ${saved.id} completed: ${resultUrl}`);
      return saved;
    } catch (error) {
      this.logger.error(`Image generation ${saved.id} failed: ${error.message}`);
      saved.status = ImageGenerationStatus.FAILED;
      saved.error_message = error.message;
      await this.imageGenRepository.save(saved);
      return saved;
    }
  }
}
