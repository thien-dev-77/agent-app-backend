import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { VideoGenerationService } from './video-generation.service';
import { CreateVideoGenerationDto } from './dto/create-video-generation.dto';

@Controller('video-generations')
export class VideoGenerationController {
  constructor(private readonly videoGenerationService: VideoGenerationService) {}

  @Get()
  findAll() {
    return this.videoGenerationService.findAll();
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
