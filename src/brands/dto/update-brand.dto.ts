import { IsString, IsOptional } from 'class-validator';

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  primary_color?: string;

  @IsOptional()
  @IsString()
  secondary_color?: string;

  @IsOptional()
  @IsString()
  accent_color?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
