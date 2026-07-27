import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateApiKeysDto {
  @IsOptional()
  @IsString()
  @Matches(/^$|^sk-[A-Za-z0-9_-]+$/, {
    message: 'OpenAI API key must start with sk-',
  })
  openai_api_key?: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^AIza[A-Za-z0-9_-]+$/, {
    message: 'Gemini API key must start with AIza',
  })
  gemini_api_key?: string;
}
