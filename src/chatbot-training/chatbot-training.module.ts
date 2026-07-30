import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingCategory } from '../entities/training-category.entity';
import { TrainingPhrase } from '../entities/training-phrase.entity';
import { TrainingScenario } from '../entities/training-scenario.entity';
import { TrainingFAQ } from '../entities/training-faq.entity';
import { Chatbot } from '../entities/chatbot.entity';
import { KnowledgeImage } from '../entities/knowledge-image.entity';
import { FacebookConversation } from '../entities/facebook-conversation.entity';
import { FacebookMessage } from '../entities/facebook-message.entity';
import { OpenAIModule } from '../openai/openai.module';
import { ChatbotTrainingController } from './chatbot-training.controller';
import { ChatbotTrainingService } from './chatbot-training.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrainingCategory,
      TrainingPhrase,
      TrainingScenario,
      TrainingFAQ,
      Chatbot,
      KnowledgeImage,
      FacebookConversation,
      FacebookMessage,
    ]),
    OpenAIModule,
  ],
  controllers: [ChatbotTrainingController],
  providers: [ChatbotTrainingService],
  exports: [ChatbotTrainingService],
})
export class ChatbotTrainingModule implements OnModuleInit {
  private readonly logger = new Logger(ChatbotTrainingModule.name);

  constructor(private readonly service: ChatbotTrainingService) {}

  async onModuleInit() {
    try {
      const stats = await this.service.getStats();
      // Auto seed nếu chưa có dữ liệu
      if (stats.phrases === 0 && stats.scenarios === 0 && stats.faqs === 0) {
        this.logger.log('Không có dữ liệu đào tạo, tự động import từ maucau.md...');
        const result = await this.service.seedData();
        this.logger.log(`Auto-seed hoàn tất: ${result.created.categories} danh mục, ${result.created.phrases} mẫu câu, ${result.created.scenarios} tình huống, ${result.created.faqs} FAQ`);
      } else {
        this.logger.log(`Dữ liệu đào tạo đã có: ${stats.phrases} mẫu câu, ${stats.scenarios} tình huống, ${stats.faqs} FAQ`);
      }
    } catch (err) {
      this.logger.warn(`Auto-seed failed: ${err.message}`);
    }
  }
}
