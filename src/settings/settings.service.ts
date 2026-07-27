import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity';
import { UpdateApiKeysDto } from './dto/update-api-keys.dto';

type ApiKeyName = 'openai_api_key' | 'gemini_api_key';

const ENV_BY_KEY: Record<ApiKeyName, string> = {
  openai_api_key: 'OPENAI_API_KEY',
  gemini_api_key: 'GEMINI_API_KEY',
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingsRepository: Repository<AppSetting>,
    private readonly configService: ConfigService,
  ) {}

  async getApiKeyStatus() {
    const [openaiKey, geminiKey] = await Promise.all([
      this.getApiKey('openai_api_key'),
      this.getApiKey('gemini_api_key'),
    ]);

    return {
      openai_api_key: this.describeKey(openaiKey),
      gemini_api_key: this.describeKey(geminiKey),
    };
  }

  async updateApiKeys(dto: UpdateApiKeysDto) {
    const updates: Promise<unknown>[] = [];

    if (dto.openai_api_key !== undefined) {
      updates.push(this.setValue('openai_api_key', dto.openai_api_key.trim() || null));
    }

    if (dto.gemini_api_key !== undefined) {
      updates.push(this.setValue('gemini_api_key', dto.gemini_api_key.trim() || null));
    }

    await Promise.all(updates);
    return this.getApiKeyStatus();
  }

  async getOpenAIApiKey(): Promise<string> {
    return this.getApiKey('openai_api_key');
  }

  async getGeminiApiKey(): Promise<string> {
    return this.getApiKey('gemini_api_key');
  }

  private async getApiKey(key: ApiKeyName): Promise<string> {
    const saved = await this.settingsRepository.findOne({ where: { key } });
    return saved?.value || this.configService.get<string>(ENV_BY_KEY[key]) || '';
  }

  private async setValue(key: ApiKeyName, value: string | null): Promise<AppSetting> {
    const existing = await this.settingsRepository.findOne({ where: { key } });

    if (existing) {
      existing.value = value;
      return this.settingsRepository.save(existing);
    }

    return this.settingsRepository.save(this.settingsRepository.create({ key, value }));
  }

  private describeKey(value: string) {
    return {
      configured: Boolean(value),
      masked: value ? this.maskKey(value) : '',
    };
  }

  private maskKey(value: string): string {
    if (value.length <= 10) {
      return `${value.slice(0, 3)}...`;
    }
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }
}
