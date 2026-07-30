import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('facebook_messages')
@Index(['page_id', 'sender_id', 'created_at'])
export class FacebookMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  chatbot_id: string;

  @Column({ type: 'varchar' })
  page_id: string;

  @Column({ type: 'varchar' })
  sender_id: string;

  @Column({ type: 'varchar' })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  created_at: Date;
}
