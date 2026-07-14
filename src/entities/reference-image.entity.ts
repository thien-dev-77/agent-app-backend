import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('reference_images')
export class ReferenceImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'varchar', nullable: true })
  original_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @CreateDateColumn()
  created_at: Date;
}
