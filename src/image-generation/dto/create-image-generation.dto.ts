import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateImageGenerationDto {
  @IsOptional()
  @IsString()
  brand_id?: string;

  @IsOptional()
  @IsUUID()
  template_id?: string;

  @IsString()
  user_input: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reference_images?: string[];

  @IsOptional()
  metadata?: Record<string, any>;
}
