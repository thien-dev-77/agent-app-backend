import { IsString, IsOptional, IsInt, IsArray, IsUUID } from 'class-validator';

export class CreatePhraseDto {
  @IsUUID()
  category_id: string;

  @IsString()
  intent: string;

  @IsString()
  user_message: string;

  @IsString()
  bot_response: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdatePhraseDto {
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  user_message?: string;

  @IsOptional()
  @IsString()
  bot_response?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  priority?: number;
}
