import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateApiKeysDto } from './dto/update-api-keys.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('api-keys')
  getApiKeys() {
    return this.settingsService.getApiKeyStatus();
  }

  @Put('api-keys')
  updateApiKeys(@Body() dto: UpdateApiKeysDto) {
    return this.settingsService.updateApiKeys(dto);
  }
}
