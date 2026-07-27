import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { BrandsModule } from './brands/brands.module';
import { TemplatesModule } from './templates/templates.module';
import { ImageGenerationModule } from './image-generation/image-generation.module';
import { OpenAIModule } from './openai/openai.module';
import { UploadModule } from './upload/upload.module';
import { GeminiModule } from './gemini/gemini.module';
import { VideoGenerationModule } from './video-generation/video-generation.module';
import { ChatbotTrainingModule } from './chatbot-training/chatbot-training.module';
import { CrmModule } from './crm/crm.module';
import { GalleryModule } from './gallery/gallery.module';
import { ReferenceImagesModule } from './reference-images/reference-images.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    BrandsModule,
    TemplatesModule,
    ImageGenerationModule,
    OpenAIModule,
    UploadModule,
    GeminiModule,
    VideoGenerationModule,
    ChatbotTrainingModule,
    CrmModule,
    GalleryModule,
    ReferenceImagesModule,
    SettingsModule,
  ],
})
export class AppModule {}
