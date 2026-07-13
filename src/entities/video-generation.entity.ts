import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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
}
