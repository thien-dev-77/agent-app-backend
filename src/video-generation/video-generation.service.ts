import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoGeneration, VideoGenerationStatus } from '../entities/video-generation.entity';
import { GeminiService } from '../gemini/gemini.service';
import { CreateVideoGenerationDto } from './dto/create-video-generation.dto';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    @InjectRepository(VideoGeneration)
    private readonly videoGenRepository: Repository<VideoGeneration>,
    private readonly geminiService: GeminiService,
  ) {}

  async findAll(): Promise<VideoGeneration[]> {
    return this.videoGenRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<VideoGeneration> {
    const videoGen = await this.videoGenRepository.findOne({ where: { id } });
    if (!videoGen) {
      throw new NotFoundException(`VideoGeneration with ID "${id}" not found`);
    }
    return videoGen;
  }

  async create(dto: CreateVideoGenerationDto): Promise<VideoGeneration> {
    const videoGen = this.videoGenRepository.create({
      prompt: dto.prompt,
      input_image_url: dto.input_image_url || null,
      status: VideoGenerationStatus.PENDING,
      duration: dto.duration_seconds || null,
      metadata: {
        aspect_ratio: dto.aspect_ratio || '16:9',
        duration_seconds: dto.duration_seconds || null,
        voice_style: dto.voice_style || '',
      },
    });

    const saved = await this.videoGenRepository.save(videoGen);

    // Trigger async video generation (hỗ trợ nhiều ảnh)
    const imageUrls = dto.input_image_urls || (dto.input_image_url ? [dto.input_image_url] : undefined);
    this.processGeneration(saved.id, dto.prompt, imageUrls, {
      aspectRatio: dto.aspect_ratio || '16:9',
      durationSeconds: dto.duration_seconds,
      voiceStyle: dto.voice_style,
    });

    return saved;
  }

  private async processGeneration(
    id: string,
    prompt: string,
    inputImageUrls?: string[],
    options?: {
      aspectRatio?: '16:9' | '9:16';
      durationSeconds?: number;
      voiceStyle?: string;
    },
  ): Promise<void> {
    try {
      await this.videoGenRepository.update(id, {
        status: VideoGenerationStatus.PROCESSING,
      });

      const { videoUrl } = await this.geminiService.generateVideo(prompt, inputImageUrls, options);

      await this.videoGenRepository.update(id, {
        status: VideoGenerationStatus.COMPLETED,
        video_url: videoUrl,
      });

      this.logger.log(`Video generation ${id} completed`);
    } catch (error) {
      this.logger.error(`Video generation ${id} failed: ${error.message}`);
      await this.videoGenRepository.update(id, {
        status: VideoGenerationStatus.FAILED,
        error_message: error.message,
      });
    }
  }
}
