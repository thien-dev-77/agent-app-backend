import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  brand_id?: string | null;

  @IsOptional()
  workflow?: Record<string, any> | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
