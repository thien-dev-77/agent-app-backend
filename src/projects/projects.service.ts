import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { CreateProjectDto, UpdateProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  findAll(brandId?: string): Promise<Project[]> {
    return this.projectRepository.find({
      where: {
        is_active: true,
        ...(brandId ? { brand_id: brandId } : {}),
      },
      relations: ['brand'],
      order: { updated_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepository.create({
      name: dto.name,
      description: dto.description || null,
      brand_id: dto.brand_id || null,
      workflow: dto.workflow || null,
      is_active: true,
    });
    return this.projectRepository.save(project);
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);
    if (project.brand_id && dto.brand_id !== undefined && project.brand_id !== dto.brand_id) {
      throw new BadRequestException('Project already belongs to another brand');
    }
    const nextProject = this.projectRepository.merge(project, dto);
    return this.projectRepository.save(nextProject);
  }

  async remove(id: string): Promise<void> {
    const project = await this.findOne(id);
    project.is_active = false;
    await this.projectRepository.save(project);
  }
}
