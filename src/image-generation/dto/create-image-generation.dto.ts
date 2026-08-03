import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateImageGenerationDto {
  @IsOptional()
  @IsString()
  brand_id?: string;

  @IsOptional()
  @IsUUID()
  template_id?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsString()
  user_input: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reference_images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  input_images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  style_reference_images?: string[];

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  quality?: string;

  @IsOptional()
  variation_index?: number;

  @IsOptional()
  metadata?: Record<string, any>;
}
