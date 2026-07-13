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

@Entity('training_phrases')
export class TrainingPhrase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  category_id: string;

  @Column({ type: 'varchar' })
  intent: string;

  @Column({ type: 'text' })
  user_message: string;

  @Column({ type: 'text' })
  bot_response: string;

  @Column({ type: 'simple-array', nullable: true })
  keywords: string[] | null;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => TrainingCategory, (category) => category.phrases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: TrainingCategory;
}
