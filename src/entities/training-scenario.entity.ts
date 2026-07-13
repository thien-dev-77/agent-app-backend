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

@Entity('training_scenarios')
export class TrainingScenario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  category_id: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar' })
  trigger_condition: string;

  @Column({ type: 'jsonb' })
  conversation_flow: object;

  @Column({ type: 'varchar', default: 'normal' })
  severity: string;

  @Column({ type: 'text', nullable: true })
  resolution_guide: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => TrainingCategory, (category) => category.scenarios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: TrainingCategory;
}
