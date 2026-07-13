import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TrainingPhrase } from './training-phrase.entity';
import { TrainingScenario } from './training-scenario.entity';
import { TrainingFAQ } from './training-faq.entity';

@Entity('training_categories')
export class TrainingCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => TrainingPhrase, (phrase) => phrase.category)
  phrases: TrainingPhrase[];

  @OneToMany(() => TrainingScenario, (scenario) => scenario.category)
  scenarios: TrainingScenario[];

  @OneToMany(() => TrainingFAQ, (faq) => faq.category)
  faqs: TrainingFAQ[];
}
