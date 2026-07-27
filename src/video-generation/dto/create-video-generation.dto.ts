import { IsString, IsOptional, IsArray, IsIn, IsInt, Min, Max } from 'class-validator';

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

  @IsOptional()
  @IsIn(['16:9', '9:16'])
  aspect_ratio?: '16:9' | '9:16';

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(10)
  duration_seconds?: number;

  @IsOptional()
  @IsString()
  voice_style?: string;

  @IsOptional()
  @IsIn(['tvc', 'intro'])
  video_style?: 'tvc' | 'intro';
}
