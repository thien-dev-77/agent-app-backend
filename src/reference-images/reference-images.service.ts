import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferenceImage } from '../entities/reference-image.entity';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ReferenceImagesService {
  constructor(
    @InjectRepository(ReferenceImage)
    private readonly repo: Repository<ReferenceImage>,
    private readonly uploadService: UploadService,
  ) {}

  async uploadAndSave(
    file: Express.Multer.File,
    label?: string,
    tags?: string[],
  ): Promise<ReferenceImage> {
    // Dùng bucket 'uploads' (đã tồn tại trong Supabase)
    const url = await this.uploadService.uploadFile(file, 'uploads');
    const entity = this.repo.create({
      url,
      original_name: file.originalname,
      label: label || file.originalname,
      tags: tags || [],
    });
    return this.repo.save(entity);
  }

  async findAll(): Promise<ReferenceImage[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
