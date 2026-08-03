import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  workflow?: Record<string, any>;
}
