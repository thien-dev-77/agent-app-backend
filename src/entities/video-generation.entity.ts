import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

export enum VideoGenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('video_generations')
export class VideoGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  prompt: string;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  input_image_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  video_url: string | null;

  @Column({
    type: 'enum',
    enum: VideoGenerationStatus,
    default: VideoGenerationStatus.PENDING,
  })
  status: VideoGenerationStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'int', nullable: true })
  duration: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Project, (project) => project.video_generations, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;
}
