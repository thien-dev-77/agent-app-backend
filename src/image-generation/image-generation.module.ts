import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageGeneration } from '../entities/image-generation.entity';
import { ImageGenerationController } from './image-generation.controller';
import { ImageGenerationService } from './image-generation.service';
import { BrandsModule } from '../brands/brands.module';
import { TemplatesModule } from '../templates/templates.module';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageGeneration]),
    BrandsModule,
    TemplatesModule,
    OpenAIModule,
  ],
  controllers: [ImageGenerationController],
  providers: [ImageGenerationService],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
