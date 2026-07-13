import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateVideoGenerationDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  input_image_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  input_image_urls?: string[];
}
