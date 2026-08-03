import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
import { Template } from './template.entity';
import { Project } from './project.entity';

export enum ImageGenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('image_generations')
export class ImageGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  brand_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  template_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', nullable: true })
  result_url: string | null;

  @Column({
    type: 'enum',
    enum: ImageGenerationStatus,
    default: ImageGenerationStatus.PENDING,
  })
  status: ImageGenerationStatus;

  @Column({ type: 'jsonb', nullable: true })
  reference_images: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Brand, (brand) => brand.image_generations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @ManyToOne(() => Template, (template) => template.image_generations, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: Template | null;

  @ManyToOne(() => Project, (project) => project.image_generations, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;
}
