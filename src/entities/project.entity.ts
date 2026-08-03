import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ImageGeneration } from './image-generation.entity';
import { VideoGeneration } from './video-generation.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  workflow: Record<string, any> | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ImageGeneration, (imageGeneration) => imageGeneration.project)
  image_generations: ImageGeneration[];

  @OneToMany(() => VideoGeneration, (videoGeneration) => videoGeneration.project)
  video_generations: VideoGeneration[];
}
