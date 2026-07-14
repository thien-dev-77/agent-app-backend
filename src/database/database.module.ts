import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Brand } from '../entities/brand.entity';
import { Template } from '../entities/template.entity';
import { ImageGeneration } from '../entities/image-generation.entity';
import { VideoGeneration } from '../entities/video-generation.entity';
import { TrainingCategory } from '../entities/training-category.entity';
import { TrainingPhrase } from '../entities/training-phrase.entity';
import { TrainingScenario } from '../entities/training-scenario.entity';
import { TrainingFAQ } from '../entities/training-faq.entity';
import { Chatbot } from '../entities/chatbot.entity';
import { Customer } from '../entities/customer.entity';
import { Appointment } from '../entities/appointment.entity';
import { KnowledgeImage } from '../entities/knowledge-image.entity';
import { ReferenceImage } from '../entities/reference-image.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        
        return {
          type: 'postgres',
          url: databaseUrl,
          entities: [
            Brand,
            Template,
            ImageGeneration,
            VideoGeneration,
            TrainingCategory,
            TrainingPhrase,
            TrainingScenario,
            TrainingFAQ,
            Chatbot,
            Customer,
            Appointment,
            KnowledgeImage,
            ReferenceImage,
          ],
          synchronize: true,
          ssl: {
            rejectUnauthorized: false,
          },
          extra: {
            family: 4,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
