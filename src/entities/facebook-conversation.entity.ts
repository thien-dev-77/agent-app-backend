import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('facebook_conversations')
@Index(['page_id', 'sender_id'], { unique: true })
export class FacebookConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  chatbot_id: string;

  @Column({ type: 'varchar' })
  page_id: string;

  @Column({ type: 'varchar' })
  sender_id: string;

  @Column({ type: 'text', nullable: true })
  last_user_message: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_user_message_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_bot_message_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'boolean', default: false })
  awaiting_user_reply: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
