import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TrainingCategory } from './training-category.entity';

@Entity('training_faqs')
export class TrainingFAQ {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  category_id: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'simple-array', nullable: true })
  related_questions: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  keywords: string[] | null;

  @Column({ type: 'int', default: 0 })
  view_count: number;

  @Column({ type: 'int', default: 0 })
  helpful_count: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => TrainingCategory, (category) => category.faqs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: TrainingCategory;
}
