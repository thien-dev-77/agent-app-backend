import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ImageGeneration } from './image-generation.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  logo_url: string | null;

  @Column({ type: 'varchar' })
  primary_color: string;

  @Column({ type: 'varchar', nullable: true })
  secondary_color: string | null;

  @Column({ type: 'varchar', nullable: true })
  accent_color: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ImageGeneration, (ig) => ig.brand)
  image_generations: ImageGeneration[];
}
