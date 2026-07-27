import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { GeminiService } from './gemini.service';

@Module({
  imports: [SettingsModule],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
