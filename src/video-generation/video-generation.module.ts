import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoGeneration } from '../entities/video-generation.entity';
import { VideoGenerationController } from './video-generation.controller';
import { VideoGenerationService } from './video-generation.service';
import { GeminiModule } from '../gemini/gemini.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoGeneration]),
    GeminiModule,
    ProjectsModule,
  ],
  controllers: [VideoGenerationController],
  providers: [VideoGenerationService],
})
export class VideoGenerationModule {}
