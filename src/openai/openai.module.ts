import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SettingsModule } from '../settings/settings.module';
import { OpenAIService } from './openai.service';

@Module({
  imports: [ConfigModule, SettingsModule],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
