import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
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

  @Column({ type: 'uuid', nullable: true })
  brand_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  workflow: Record<string, any> | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand | null;

  @OneToMany(() => ImageGeneration, (imageGeneration) => imageGeneration.project)
  image_generations: ImageGeneration[];

  @OneToMany(() => VideoGeneration, (videoGeneration) => videoGeneration.project)
  video_generations: VideoGeneration[];
}
