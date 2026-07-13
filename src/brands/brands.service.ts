import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { CreateBrandDto, UpdateBrandDto } from './dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
  ) {}

  async findAll(): Promise<Brand[]> {
    return this.brandRepository.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<Brand> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(`Brand with ID "${id}" not found`);
    }
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    const brand = this.brandRepository.create(dto);
    return this.brandRepository.save(brand);
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.brandRepository.save(brand);
  }

  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    await this.brandRepository.remove(brand);
  }
}
