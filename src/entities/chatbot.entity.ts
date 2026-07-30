import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chatbots')
export class Chatbot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  @Column({ type: 'varchar', default: 'gpt-4o-mini' })
  model: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    auto_suggest?: boolean;
    segments?: number;
    opening_questions?: string[];
    rules?: string[];
    idle_settings?: {
      enabled?: boolean;
      delaySeconds?: number;
      maxReminders?: number;
      context?: string;
      reminderScenarios?: Array<{
        title?: string;
        trigger?: string;
        message?: string;
      }>;
    };
    facebook?: {
      page_id?: string;
      page_name?: string;
      page_access_token?: string;
      verify_token?: string;
      app_secret?: string;
      connected_at?: string;
      status?: string;
    };
    facebook_oauth_pages?: Array<{
      id: string;
      name: string;
      access_token: string;
      tasks?: string[];
    }>;
  } | null;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
