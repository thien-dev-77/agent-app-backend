import { IsString, IsOptional, IsArray, IsUUID, IsObject } from 'class-validator';

export class CreateScenarioDto {
  @IsUUID()
  category_id: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  trigger_condition: string;

  @IsObject()
  conversation_flow: object;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  resolution_guide?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateScenarioDto {
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  trigger_condition?: string;

  @IsOptional()
  @IsObject()
  conversation_flow?: object;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  resolution_guide?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  status?: string;
}
