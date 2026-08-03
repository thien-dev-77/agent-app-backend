import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Query('brand_id') brandId?: string) {
    return this.projectsService.findAll(brandId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(id);
  }
}
