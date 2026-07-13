import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TrainingCategory } from './training-category.entity';

@Entity('knowledge_images')
export class KnowledgeImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar' })
  image_url: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => TrainingCategory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: TrainingCategory;
}
