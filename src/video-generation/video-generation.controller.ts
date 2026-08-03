import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { VideoGenerationService } from './video-generation.service';
import { CreateVideoGenerationDto } from './dto/create-video-generation.dto';

@Controller('video-generations')
export class VideoGenerationController {
  constructor(private readonly videoGenerationService: VideoGenerationService) {}

  @Get()
  findAll(@Query('project_id') projectId?: string) {
    return this.videoGenerationService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.videoGenerationService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateVideoGenerationDto) {
    return this.videoGenerationService.create(dto);
  }
}
