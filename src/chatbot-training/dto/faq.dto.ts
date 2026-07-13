import { IsString, IsOptional, IsArray, IsUUID, IsInt } from 'class-validator';

export class CreateFAQDto {
  @IsUUID()
  category_id: string;

  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  related_questions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdateFAQDto {
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  related_questions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
