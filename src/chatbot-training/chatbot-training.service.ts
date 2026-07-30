import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { TrainingCategory } from '../entities/training-category.entity';
import { TrainingPhrase } from '../entities/training-phrase.entity';
import { TrainingScenario } from '../entities/training-scenario.entity';
import { TrainingFAQ } from '../entities/training-faq.entity';
import { Chatbot } from '../entities/chatbot.entity';
import { KnowledgeImage } from '../entities/knowledge-image.entity';
import { OpenAIService } from '../openai/openai.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreatePhraseDto,
  UpdatePhraseDto,
  CreateScenarioDto,
  UpdateScenarioDto,
  CreateFAQDto,
  UpdateFAQDto,
} from './dto';

@Injectable()
export class ChatbotTrainingService {
  private readonly logger = new Logger(ChatbotTrainingService.name);

  constructor(
    @InjectRepository(TrainingCategory)
    private readonly categoryRepo: Repository<TrainingCategory>,
    @InjectRepository(TrainingPhrase)
    private readonly phraseRepo: Repository<TrainingPhrase>,
    @InjectRepository(TrainingScenario)
    private readonly scenarioRepo: Repository<TrainingScenario>,
    @InjectRepository(TrainingFAQ)
    private readonly faqRepo: Repository<TrainingFAQ>,
    @InjectRepository(Chatbot)
    private readonly chatbotRepo: Repository<Chatbot>,
    @InjectRepository(KnowledgeImage)
    private readonly imageRepo: Repository<KnowledgeImage>,
    private readonly openaiService: OpenAIService,
    private readonly configService: ConfigService,
  ) {}

  // ==================== KNOWLEDGE IMAGES ====================

  async findAllImages(categoryId?: string): Promise<KnowledgeImage[]> {
    const where = categoryId ? { category_id: categoryId } : {};
    return this.imageRepo.find({ where, order: { created_at: 'DESC' }, relations: ['category'] });
  }

  async createImage(dto: { title: string; image_url: string; description?: string; tags?: string[]; category_id?: string }): Promise<KnowledgeImage> {
    return this.imageRepo.save(this.imageRepo.create(dto));
  }

  async removeImage(id: string): Promise<void> {
    const img = await this.imageRepo.findOne({ where: { id } });
    if (!img) throw new NotFoundException(`Image "${id}" not found`);
    await this.imageRepo.remove(img);
  }

  // ==================== CHATBOTS ====================

  async findAllChatbots(): Promise<Chatbot[]> {
    return this.chatbotRepo.find({ order: { created_at: 'DESC' } });
  }

  async findOneChatbot(id: string): Promise<Chatbot> {
    const bot = await this.chatbotRepo.findOne({ where: { id } });
    if (!bot) throw new NotFoundException(`Chatbot "${id}" not found`);
    return bot;
  }

  async createChatbot(dto: { name: string; description?: string; prompt?: string; model?: string; settings?: object }): Promise<Chatbot> {
    return this.chatbotRepo.save(this.chatbotRepo.create(dto));
  }

  async updateChatbot(id: string, dto: Partial<Chatbot>): Promise<Chatbot> {
    const bot = await this.findOneChatbot(id);
    Object.assign(bot, dto);
    return this.chatbotRepo.save(bot);
  }

  async removeChatbot(id: string): Promise<void> {
    const bot = await this.findOneChatbot(id);
    await this.chatbotRepo.remove(bot);
  }

  async verifyFacebookWebhook(botId: string, mode: string, verifyToken: string, challenge: string) {
    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      throw new BadRequestException('Invalid Facebook webhook verification request');
    }

    const bot = await this.findOneChatbot(botId);
    const expectedToken = bot.settings?.facebook?.verify_token;
    if (!expectedToken || expectedToken !== verifyToken) {
      throw new BadRequestException('Invalid verify token');
    }
    return challenge;
  }

  async handleFacebookWebhook(botId: string, body: any) {
    const bot = await this.findOneChatbot(botId);
    const facebook = bot.settings?.facebook;
    if (!facebook?.page_access_token) {
      throw new BadRequestException('Facebook page is not connected');
    }

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of events) {
        const senderId = event?.sender?.id;
        const text = event?.message?.text;
        const isEcho = Boolean(event?.message?.is_echo);
        if (!senderId || !text || isEcho) continue;

        try {
          const { reply } = await this.chat(text, [], bot.prompt || undefined);
          await this.sendFacebookMessage(facebook.page_access_token, senderId, reply);
        } catch (err) {
          this.logger.error(`Facebook message handling failed: ${err.message}`);
        }
      }
    }

    return { status: 'ok' };
  }

  getFacebookOAuthUrl(botId: string, request: Request, returnUrl?: string) {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    if (!appId) {
      throw new BadRequestException('FACEBOOK_APP_ID is not configured');
    }

    const redirectUri = this.getFacebookRedirectUri(request);
    const state = this.signFacebookState({
      botId,
      nonce: randomBytes(12).toString('hex'),
      returnUrl: this.getSafeReturnUrl(returnUrl),
    });
    const graphVersion = this.getFacebookGraphVersion();
    const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [
      'pages_show_list',
      'pages_manage_metadata',
      'pages_messaging',
      'pages_read_engagement',
    ].join(','));

    return { url: url.toString() };
  }

  async handleFacebookOAuthCallback(code: string, state: string) {
    if (!code || !state) {
      throw new BadRequestException('Missing Facebook OAuth code or state');
    }

    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException('FACEBOOK_APP_ID or FACEBOOK_APP_SECRET is not configured');
    }

    const statePayload = this.verifyFacebookState(state);
    const bot = await this.findOneChatbot(statePayload.botId);
    const redirectUri = this.getFacebookRedirectUri();
    const graphVersion = this.getFacebookGraphVersion();

    const tokenResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      },
      timeout: 30000,
    });
    const userAccessToken = tokenResponse.data?.access_token;
    if (!userAccessToken) {
      throw new BadRequestException('Facebook did not return a user access token');
    }

    const pagesResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/me/accounts`, {
      params: {
        fields: 'id,name,access_token,tasks',
        access_token: userAccessToken,
      },
      timeout: 30000,
    });
    const pages = Array.isArray(pagesResponse.data?.data) ? pagesResponse.data.data : [];
    const page = pages.find((item) => item?.access_token);
    if (!page) {
      throw new BadRequestException('No manageable Facebook page with access token was returned');
    }

    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${page.id}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: 'messages,messaging_postbacks',
          access_token: page.access_token,
        },
        timeout: 30000,
      },
    );

    bot.settings = {
      ...(bot.settings || {}),
      facebook: {
        ...(bot.settings?.facebook || {}),
        page_id: page.id,
        page_name: page.name || '',
        page_access_token: page.access_token,
        verify_token: bot.settings?.facebook?.verify_token || randomBytes(16).toString('hex'),
        app_secret: appSecret,
        connected_at: new Date().toISOString(),
        status: 'connected',
      },
    };
    await this.chatbotRepo.save(bot);

    const redirectUrl = new URL(statePayload.returnUrl || this.getFrontendUrl());
    redirectUrl.searchParams.set('bot', statePayload.botId);
    redirectUrl.searchParams.set('facebook', 'connected');
    redirectUrl.searchParams.set('page', page.name || page.id);
    return redirectUrl.toString();
  }

  private async sendFacebookMessage(pageAccessToken: string, recipientId: string, text: string) {
    await axios.post(
      'https://graph.facebook.com/me/messages',
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: text.slice(0, 1900) },
      },
      {
        params: { access_token: pageAccessToken },
        timeout: 30000,
      },
    );
  }

  private getFacebookGraphVersion() {
    return this.configService.get<string>('FACEBOOK_GRAPH_VERSION') || 'v22.0';
  }

  private getFacebookRedirectUri(request?: Request) {
    const configured = this.configService.get<string>('FACEBOOK_OAUTH_REDIRECT_URI');
    if (configured) return configured;

    const backendUrl = this.configService.get<string>('BACKEND_PUBLIC_URL');
    if (backendUrl) {
      const baseUrl = backendUrl.replace(/\/$/, '');
      const apiBaseUrl = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      return `${apiBaseUrl}/chatbot-training/facebook/oauth/callback`;
    }

    if (request) {
      const proto = (request.headers['x-forwarded-proto'] as string) || request.protocol || 'http';
      const host = request.headers['x-forwarded-host'] || request.headers.host;
      return `${proto}://${host}/api/chatbot-training/facebook/oauth/callback`;
    }

    throw new BadRequestException('FACEBOOK_OAUTH_REDIRECT_URI or BACKEND_PUBLIC_URL is required');
  }

  private getFrontendUrl() {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000/chatbot-training';
  }

  private getSafeReturnUrl(returnUrl?: string) {
    const fallback = this.getFrontendUrl();
    if (!returnUrl) return fallback;
    try {
      const parsed = new URL(returnUrl);
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  private signFacebookState(payload: { botId: string; nonce: string; returnUrl: string }) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${this.signFacebookValue(encodedPayload)}`;
  }

  private verifyFacebookState(state: string): { botId: string; nonce: string; returnUrl: string } {
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) {
      throw new BadRequestException('Invalid Facebook OAuth state');
    }
    const expectedSignature = this.signFacebookValue(encodedPayload);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new BadRequestException('Invalid Facebook OAuth state signature');
    }
    try {
      return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Facebook OAuth state payload');
    }
  }

  private signFacebookValue(value: string) {
    const secret = this.configService.get<string>('FACEBOOK_APP_SECRET')
      || this.configService.get<string>('AUTH_TOKEN_SECRET')
      || 'app-ai-dentist-facebook-state';
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a || '');
    const right = Buffer.from(b || '');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  // ==================== CATEGORIES ====================

  async findAllCategories(): Promise<TrainingCategory[]> {
    return this.categoryRepo.find({
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
  }

  async findOneCategory(id: string): Promise<TrainingCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['phrases', 'scenarios', 'faqs'],
    });
    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }
    return category;
  }

  async createCategory(dto: CreateCategoryDto): Promise<TrainingCategory> {
    const category = this.categoryRepo.create(dto);
    return this.categoryRepo.save(category);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<TrainingCategory> {
    const category = await this.findOneCategory(id);
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async removeCategory(id: string): Promise<void> {
    const category = await this.findOneCategory(id);
    await this.categoryRepo.remove(category);
  }

  // ==================== PHRASES ====================

  async findAllPhrases(categoryId?: string): Promise<TrainingPhrase[]> {
    const where = categoryId ? { category_id: categoryId } : {};
    return this.phraseRepo.find({
      where,
      relations: ['category'],
      order: { priority: 'DESC', created_at: 'DESC' },
    });
  }

  async findOnePhrase(id: string): Promise<TrainingPhrase> {
    const phrase = await this.phraseRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!phrase) {
      throw new NotFoundException(`Phrase with ID "${id}" not found`);
    }
    return phrase;
  }

  async createPhrase(dto: CreatePhraseDto): Promise<TrainingPhrase> {
    const phrase = this.phraseRepo.create(dto);
    return this.phraseRepo.save(phrase);
  }

  async updatePhrase(id: string, dto: UpdatePhraseDto): Promise<TrainingPhrase> {
    const phrase = await this.findOnePhrase(id);
    Object.assign(phrase, dto);
    return this.phraseRepo.save(phrase);
  }

  async removePhrase(id: string): Promise<void> {
    const phrase = await this.findOnePhrase(id);
    await this.phraseRepo.remove(phrase);
  }

  // ==================== SCENARIOS ====================

  async findAllScenarios(categoryId?: string): Promise<TrainingScenario[]> {
    const where = categoryId ? { category_id: categoryId } : {};
    return this.scenarioRepo.find({
      where,
      relations: ['category'],
      order: { created_at: 'DESC' },
    });
  }

  async findOneScenario(id: string): Promise<TrainingScenario> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID "${id}" not found`);
    }
    return scenario;
  }

  async createScenario(dto: CreateScenarioDto): Promise<TrainingScenario> {
    const scenario = this.scenarioRepo.create(dto);
    return this.scenarioRepo.save(scenario);
  }

  async updateScenario(id: string, dto: UpdateScenarioDto): Promise<TrainingScenario> {
    const scenario = await this.findOneScenario(id);
    Object.assign(scenario, dto);
    return this.scenarioRepo.save(scenario);
  }

  async removeScenario(id: string): Promise<void> {
    const scenario = await this.findOneScenario(id);
    await this.scenarioRepo.remove(scenario);
  }

  // ==================== FAQs ====================

  async findAllFAQs(categoryId?: string): Promise<TrainingFAQ[]> {
    const where = categoryId ? { category_id: categoryId } : {};
    return this.faqRepo.find({
      where,
      relations: ['category'],
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
  }

  async findOneFAQ(id: string): Promise<TrainingFAQ> {
    const faq = await this.faqRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!faq) {
      throw new NotFoundException(`FAQ with ID "${id}" not found`);
    }
    return faq;
  }

  async createFAQ(dto: CreateFAQDto): Promise<TrainingFAQ> {
    const faq = this.faqRepo.create(dto);
    return this.faqRepo.save(faq);
  }

  async updateFAQ(id: string, dto: UpdateFAQDto): Promise<TrainingFAQ> {
    const faq = await this.findOneFAQ(id);
    Object.assign(faq, dto);
    return this.faqRepo.save(faq);
  }

  async removeFAQ(id: string): Promise<void> {
    const faq = await this.findOneFAQ(id);
    await this.faqRepo.remove(faq);
  }

  // ==================== STATS ====================

  async getStats() {
    const [categories, phrases, scenarios, faqs] = await Promise.all([
      this.categoryRepo.count(),
      this.phraseRepo.count(),
      this.scenarioRepo.count(),
      this.faqRepo.count(),
    ]);
    return { categories, phrases, scenarios, faqs };
  }

  // ==================== CHATBOT AI (ChatGPT) ====================

  async chat(
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    customSystemPrompt?: string,
  ): Promise<{ reply: string }> {
    // Lấy toàn bộ dữ liệu training để build system prompt
    const [phrases, scenarios, faqs, categories, images] = await Promise.all([
      this.phraseRepo.find({ where: { status: 'active' }, relations: ['category'] }),
      this.scenarioRepo.find({ where: { status: 'active' }, relations: ['category'] }),
      this.faqRepo.find({ where: { status: 'active' }, relations: ['category'] }),
      this.categoryRepo.find({ where: { status: 'active' } }),
      this.imageRepo.find(),
    ]);

    // Build system prompt từ dữ liệu đào tạo
    const trainingPrompt = this.buildSystemPrompt(phrases, scenarios, faqs, categories, images);
    const systemPrompt = customSystemPrompt?.trim()
      ? `${customSystemPrompt.trim()}\n\n${trainingPrompt}`
      : trainingPrompt;

    // Gọi ChatGPT
    const messages = [
      ...history,
      { role: 'user' as const, content: message },
    ];

    const reply = await this.openaiService.chatCompletion(systemPrompt, messages);
    return { reply };
  }

  async suggestQuestions(
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<{ suggestions: string[] }> {
    if (history.length === 0) return { suggestions: [] };

    const suggestPrompt = `Considering the AI's character settings, the user's previous chat history with the AI assistant, think about the user's scenario, intention, background in their last inquiry, and generate the questions that the user is most likely to ask the AI assistant (you) next.

Rules:
1. Do not generate questions that the user may already know the answer, or unrelated to the current topics.
2. Always generate very brief and clear questions (less than 15 words) that the user may ask the AI assistant (you), NOT questions that the AI assistant (you) asks the user.
3. DO NOT generate the same or similar questions.
4. Generate exactly 3 questions.
5. Return ONLY a JSON array of 3 strings, no explanation.

Example output: ["Niềng răng có đau không?", "Thời gian niềng bao lâu?", "Có trả góp được không?"]`;

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history,
      { role: 'user', content: 'Generate 3 follow-up questions based on our conversation.' },
    ];

    try {
      const result = await this.openaiService.chatCompletion(suggestPrompt, messages);
      // Parse JSON array from response
      const match = result.match(/\[[\s\S]*?\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]) as string[];
        return { suggestions: suggestions.slice(0, 3) };
      }
      return { suggestions: [] };
    } catch {
      return { suggestions: [] };
    }
  }

  private buildSystemPrompt(
    phrases: TrainingPhrase[],
    scenarios: TrainingScenario[],
    faqs: TrainingFAQ[],
    categories: TrainingCategory[],
    images: KnowledgeImage[] = [],
  ): string {
    let prompt = `Bạn là tư vấn viên nha khoa chuyên nghiệp. Hãy trả lời khách hàng dựa trên kiến thức được đào tạo bên dưới.

## QUY TẮC:
- Trả lời bằng tiếng Việt, thân thiện, chuyên nghiệp
- Dựa trên kiến thức đã được đào tạo để trả lời
- Nếu không biết câu trả lời, hãy nói "Em chưa có thông tin về vấn đề này, để em chuyển cho bác sĩ tư vấn trực tiếp ạ"
- Luôn giữ giọng điệu tư vấn viên nha khoa
- Không tự nhận mình là chatbot, AI, robot hoặc trợ lý ảo. Nếu khách hỏi bạn là ai hoặc có phải chatbot không, hãy giới thiệu là tư vấn viên/chăm sóc khách hàng của phòng khám theo cấu hình chatbot, rồi hỏi khách cần hỗ trợ gì.
- Không trả lời lặp lại nguyên văn câu vừa gửi trước đó. Nếu khách hỏi lại cùng ý, hãy trả lời ngắn hơn hoặc đổi cách diễn đạt, có thể xác nhận lại ý chính rồi chuyển sang hỗ trợ nhu cầu cụ thể.
- Luôn đọc TOÀN BỘ lịch sử chat trước khi trả lời. Sau khi trả lời ý chính, hãy hỏi tiếp đúng 1 câu cụ thể dựa trên thông tin khách đã nói và thông tin còn thiếu.
- Không kết thúc bằng các câu chung chung như "cần thêm thông tin cứ hỏi em", "cần hỗ trợ gì cứ nói em", "anh/chị cần em hỗ trợ thông tin gì" nếu lịch sử đã cho thấy khách đang quan tâm chủ đề cụ thể.
- Nếu khách đang hỏi liên tiếp về cùng dịch vụ, hãy chuyển câu hỏi cuối sang bước tư vấn tiếp theo: tình trạng răng, độ tuổi, đã thăm khám/chụp phim chưa, mong muốn niềng, chi nhánh, thời gian rảnh, hoặc số điện thoại để tư vấn. Chỉ hỏi 1 thông tin còn thiếu quan trọng nhất.
- Khi khách hỏi xem hình ảnh/kết quả/ví dụ, hãy gửi link ảnh phù hợp từ danh sách HÌNH ẢNH THAM KHẢO bên dưới
- Xưng hô nhất quán. Nếu chưa biết giới tính/độ tuổi, dùng "anh/chị" trung tính, không tự đổi qua chỉ "anh" hoặc chỉ "chị".
- Nếu chưa biết nên xưng hô thế nào, trong thời điểm phù hợp hãy hỏi nhẹ một lần: "Em nên xưng hô với mình là anh/chị hay gọi em cho tiện ạ?". Không hỏi lặp lại nếu khách đã trả lời hoặc cuộc trò chuyện đang cần xử lý yêu cầu chính.
- Nếu khách nói mình nhỏ tuổi hơn, còn đi học, hoặc cung cấp tuổi nhỏ hơn tư vấn viên, có thể gọi khách là "em" và bot vẫn xưng "em" nếu phù hợp văn phong phòng khám; tránh xưng hô gây lẫn như "em/em" quá nhiều bằng cách dùng "mình" khi cần.
- Nếu khách tự xưng "anh", "chị", "cô", "chú", "em" hoặc cho biết tuổi, hãy giữ cách xưng hô đó trong các tin nhắn sau.

## KIỂM TRA THÔNG TIN TRƯỚC KHI XÁC NHẬN:
Khi khách muốn đặt lịch, đăng ký tư vấn, để lại thông tin, hoặc cung cấp từng phần thông tin cá nhân, hãy tự đọc TOÀN BỘ lịch sử hội thoại và trích xuất các trường sau:
- Họ tên khách
- Số điện thoại hợp lệ
- Dịch vụ quan tâm
- Ngày/giờ muốn hẹn hoặc khung thời gian rảnh
- Chi nhánh/phòng khám muốn đến nếu có nhiều chi nhánh
- Vấn đề/tình trạng chính nếu cần tư vấn nha khoa

Luôn phân loại thông tin thành:
- ĐÃ CÓ: các thông tin khách đã cung cấp rõ ràng
- CÒN THIẾU: các thông tin bắt buộc chưa có hoặc chưa rõ

Quy tắc bắt buộc:
- Với mọi câu trả lời tư vấn, trước khi gửi hãy tự xác định:
  1. Khách đã cung cấp thông tin gì trong lịch sử?
  2. Khách còn thiếu thông tin gì để tư vấn/chốt lịch?
  3. Câu hỏi tiếp theo cụ thể nhất là gì?
- Chỉ xác nhận đặt lịch/thành công khi đủ tối thiểu: họ tên, số điện thoại, dịch vụ, ngày/giờ hoặc khung thời gian, chi nhánh/phòng khám.
- Nếu thiếu thông tin, KHÔNG được nói "đặt hẹn thành công", "xác nhận lịch hẹn thành công", "đã tạo lịch".
- Nếu khách chỉ gửi tên + số điện thoại, hãy cảm ơn và hỏi tiếp phần còn thiếu như ngày/giờ muốn hẹn, chi nhánh, dịch vụ nếu chưa rõ.
- Không tự bịa ngày/giờ, chi nhánh, dịch vụ, tên khách, giới tính, hoặc tình trạng răng.
- Nếu một phần thông tin mơ hồ, hãy hỏi lại ngắn gọn để xác nhận.
- Khi hỏi bổ sung, chỉ hỏi các trường còn thiếu, không bắt khách nhập lại thông tin đã có.
- Khi khách hỏi về giá/chi phí/phát sinh/nhổ răng cho niềng, sau khi trả lời hãy hỏi tiếp một câu cụ thể như: "Anh/chị đã từng thăm khám hoặc chụp phim răng gần đây chưa ạ?" hoặc "Anh/chị muốn em giữ lịch kiểm tra để bác sĩ xác định có cần nhổ răng không ạ?"
- Nếu khách yêu cầu không nhắn nữa hoặc không muốn tiếp tục, hãy tôn trọng và không thúc ép.

Ví dụ:
Bot hỏi: "Anh/chị cho em xin số điện thoại và tên để đặt lịch."
Khách: "Sang 090000000"
Phản hồi đúng: "Em cảm ơn anh/chị. Em đã nhận được tên Sang và số điện thoại 090000000. Anh/chị cho em xin thêm ngày/giờ muốn hẹn và chi nhánh muốn đến để em hỗ trợ giữ lịch ạ."
Phản hồi sai: "Em xác nhận đặt hẹn thành công..."

`;

    // Thêm danh mục
    if (categories.length > 0) {
      prompt += `## DANH MỤC KIẾN THỨC:\n`;
      categories.forEach((cat) => {
        prompt += `- ${cat.name}: ${cat.description || ''}\n`;
      });
      prompt += '\n';
    }

    // Thêm mẫu câu (intent + response)
    if (phrases.length > 0) {
      prompt += `## MẪU CÂU HỎI - TRẢ LỜI:\n`;
      phrases.forEach((p) => {
        prompt += `### Intent: ${p.intent} (${p.category?.name || ''})\n`;
        prompt += `Khách hỏi: "${p.user_message}"\n`;
        prompt += `Trả lời: "${p.bot_response}"\n\n`;
      });
    }

    // Thêm tình huống
    if (scenarios.length > 0) {
      prompt += `## TÌNH HUỐNG XỬ LÝ:\n`;
      scenarios.forEach((s) => {
        prompt += `### ${s.title} (Mức độ: ${s.severity})\n`;
        prompt += `Khi: ${s.trigger_condition}\n`;
        if (s.resolution_guide) {
          prompt += `Cách xử lý: ${s.resolution_guide}\n`;
        }
        if (Array.isArray(s.conversation_flow) && s.conversation_flow.length > 0) {
          prompt += `Kịch bản mẫu:\n`;
          (s.conversation_flow as any[]).forEach((step) => {
            prompt += `  ${step.role === 'user' ? 'Khách' : 'Bot'}: ${step.message}\n`;
          });
        }
        prompt += '\n';
      });
    }

    // Thêm FAQ
    if (faqs.length > 0) {
      prompt += `## CÂU HỎI THƯỜNG GẶP:\n`;
      faqs.forEach((f) => {
        prompt += `Q: ${f.question}\n`;
        prompt += `A: ${f.answer}\n`;
        if (f.related_questions && f.related_questions.length > 0) {
          prompt += `(Câu hỏi tương tự: ${f.related_questions.join(', ')})\n`;
        }
        prompt += '\n';
      });
    }

    // Thêm hình ảnh tham khảo
    if (images.length > 0) {
      prompt += `## HÌNH ẢNH THAM KHẢO:\nKhi khách hỏi xem hình, kết quả, ví dụ minh họa, hãy gửi link ảnh phù hợp.\n`;
      images.forEach((img) => {
        prompt += `- "${img.title}"${img.description ? ` (${img.description})` : ''}${img.tags && img.tags.length > 0 ? ` [tags: ${img.tags.join(', ')}]` : ''}: ${img.image_url}\n`;
      });
      prompt += '\nKhi gửi ảnh cho khách, hãy gửi trực tiếp URL ảnh (không markdown). VD:\nĐây là hình ảnh kết quả niềng răng trước và sau:\nhttps://example.com/image.png\n';
    }

    return prompt;
  }

  // ==================== KNOWLEDGE UPLOAD ====================

  async processKnowledgeFile(
    file: Express.Multer.File,
    categoryId?: string,
  ): Promise<{ message: string; phrases_created: number }> {
    // Parse file content
    let content = '';
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      content = file.buffer.toString('utf-8');
    } else {
      // For .doc/.docx - extract raw text (simple approach)
      content = file.buffer.toString('utf-8').replace(/[^\x20-\x7E\u00C0-\u024F\u1E00-\u1EFF\n\r\t]/g, ' ');
    }

    return this.addKnowledgeText(content, file.originalname, categoryId);
  }

  async addKnowledgeText(
    content: string,
    title?: string,
    categoryId?: string,
  ): Promise<{ message: string; phrases_created: number }> {
    // Nếu không có category, tạo mới
    let catId = categoryId;
    if (!catId) {
      const cat = await this.categoryRepo.save(
        this.categoryRepo.create({
          name: title || 'Kiến thức upload',
          description: `Upload lúc ${new Date().toLocaleString('vi-VN')}`,
        }),
      );
      catId = cat.id;
    }

    let phrasesCreated = 0;

    // Detect format: kịch bản dạng "B1:", "B2:", "BƯỚC 1:", etc.
    const stepPattern = /^(B\d+|BƯỚC\s*\d+|B\d+\s*:)/i;
    // Detect format: Q&A dạng "Q:" / "A:"
    const qaPattern = /^Q:/i;
    const lines = content.split('\n');
    const hasStepFormat = lines.some((l) => stepPattern.test(l.trim()));
    const hasQAFormat = lines.some((l) => qaPattern.test(l.trim()));

    if (hasQAFormat) {
      // Parse Q&A format
      let currentQ = '';
      let currentA = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (/^Q:/i.test(trimmed)) {
          // Save previous pair
          if (currentQ && currentA) {
            await this.faqRepo.save(
              this.faqRepo.create({
                category_id: catId,
                question: currentQ,
                answer: currentA,
              }),
            );
            phrasesCreated++;
          }
          currentQ = trimmed.replace(/^Q:\s*/i, '').trim();
          currentA = '';
        } else if (/^A:/i.test(trimmed)) {
          currentA = trimmed.replace(/^A:\s*/i, '').trim();
        } else if (currentA) {
          currentA += '\n' + trimmed;
        }
      }
      // Save last pair
      if (currentQ && currentA) {
        await this.faqRepo.save(
          this.faqRepo.create({ category_id: catId, question: currentQ, answer: currentA }),
        );
        phrasesCreated++;
      }
    } else if (hasStepFormat) {
      // Parse theo format kịch bản bước
      const scenarios: { step: string; title: string; content: string }[] = [];
      let currentStep = '';
      let currentTitle = '';
      let currentContent = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (stepPattern.test(trimmed)) {
          // Save previous step
          if (currentStep && currentContent.trim()) {
            scenarios.push({ step: currentStep, title: currentTitle, content: currentContent.trim() });
          }
          // Parse step header: "B2: HỎI TÌNH TRẠNG" or "B2: HỎI TÌNH TRẠNG  <content>"
          const match = trimmed.match(/^(B\d+|BƯỚC\s*\d+)[:\s]*(.*)$/i);
          currentStep = match?.[1] || trimmed;
          const rest = match?.[2]?.trim() || '';
          // Title might be the first part before tab or double space
          const parts = rest.split(/\t+|\s{2,}/);
          currentTitle = parts[0] || '';
          currentContent = parts.slice(1).join('\n') + '\n';
        } else {
          currentContent += trimmed + '\n';
        }
      }
      // Save last step
      if (currentStep && currentContent.trim()) {
        scenarios.push({ step: currentStep, title: currentTitle, content: currentContent.trim() });
      }

      // Create scenario entries
      for (const s of scenarios) {
        const stepName = `${s.step}${s.title ? ': ' + s.title : ''}`;
        const messages = s.content.split('\n').filter((l) => l.trim());

        // Tạo như scenario (conversation flow)
        if (messages.length > 1) {
          const flow = messages.map((msg) => ({
            role: 'bot' as const,
            message: msg.trim(),
          }));

          await this.scenarioRepo.save(
            this.scenarioRepo.create({
              category_id: catId,
              title: stepName,
              description: `Kịch bản ${s.step}`,
              trigger_condition: s.title || stepName,
              conversation_flow: flow,
              severity: 'normal',
              tags: [s.step.toLowerCase(), 'kịch bản'],
            }),
          );
        } else {
          // Single response → save as phrase
          await this.phraseRepo.save(
            this.phraseRepo.create({
              category_id: catId,
              intent: s.step.toLowerCase().replace(/\s+/g, '_'),
              user_message: s.title || stepName,
              bot_response: messages[0] || s.content,
              keywords: [s.step.toLowerCase()],
            }),
          );
        }
        phrasesCreated++;
      }
    } else {
      // Parse generic: theo paragraphs/chunks
      const chunks: string[] = [];
      let currentChunk = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentChunk.trim()) { chunks.push(currentChunk.trim()); currentChunk = ''; }
          continue;
        }
        currentChunk += trimmed + '\n';
        if (currentChunk.length > 300) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());

      // Tạo entries từ chunks
      for (const chunk of chunks.slice(0, 50)) {
        if (chunk.length < 10) continue;

        const firstLine = chunk.split('\n')[0].trim();
        const rest = chunk.split('\n').slice(1).join('\n').trim();

        if (rest) {
          await this.faqRepo.save(
            this.faqRepo.create({
              category_id: catId,
              question: firstLine.replace(/^[#\-*>]+\s*/, ''),
              answer: rest,
            }),
          );
        } else {
          await this.phraseRepo.save(
            this.phraseRepo.create({
              category_id: catId,
              intent: 'knowledge',
              user_message: firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine,
              bot_response: chunk,
            }),
          );
        }
        phrasesCreated++;
      }
    }

    return {
      message: `Đã xử lý "${title || 'text'}" thành công`,
      phrases_created: phrasesCreated,
    };
  }

  // ==================== SEED DATA ====================

  async seedData(): Promise<{ message: string; created: { categories: number; phrases: number; scenarios: number; faqs: number } }> {
    const {
      SEED_CATEGORIES,
      SEED_PHRASES,
      SEED_PHRASES_GIA,
      SEED_PHRASES_KIENTHUC,
      SEED_PHRASES_TINHUONG,
      SEED_PHRASES_CSKH,
      SEED_PHRASES_NHAKHOA,
      SEED_SCENARIOS,
      SEED_FAQS,
    } = await import('./seed');

    // 1. Tạo categories
    const categoryMap: Record<string, string> = {};
    for (const cat of SEED_CATEGORIES) {
      const existing = await this.categoryRepo.findOne({ where: { name: cat.name } });
      if (existing) {
        categoryMap[cat.name] = existing.id;
      } else {
        const created = await this.categoryRepo.save(this.categoryRepo.create(cat));
        categoryMap[cat.name] = created.id;
      }
    }

    // 2. Tạo phrases
    const allPhrases = [
      ...SEED_PHRASES,
      ...SEED_PHRASES_GIA,
      ...SEED_PHRASES_KIENTHUC,
      ...SEED_PHRASES_TINHUONG,
      ...SEED_PHRASES_CSKH,
      ...SEED_PHRASES_NHAKHOA,
    ];

    let phrasesCreated = 0;
    for (const p of allPhrases) {
      const categoryId = categoryMap[p.category];
      if (!categoryId) continue;
      const exists = await this.phraseRepo.findOne({
        where: { category_id: categoryId, intent: p.intent },
      });
      if (!exists) {
        await this.phraseRepo.save(
          this.phraseRepo.create({
            category_id: categoryId,
            intent: p.intent,
            user_message: p.user_message,
            bot_response: p.bot_response,
            keywords: p.keywords,
          }),
        );
        phrasesCreated++;
      }
    }

    // 3. Tạo scenarios
    let scenariosCreated = 0;
    for (const s of SEED_SCENARIOS) {
      const categoryId = categoryMap[s.category];
      if (!categoryId) continue;
      const exists = await this.scenarioRepo.findOne({
        where: { category_id: categoryId, title: s.title },
      });
      if (!exists) {
        await this.scenarioRepo.save(
          this.scenarioRepo.create({
            category_id: categoryId,
            title: s.title,
            description: s.description,
            trigger_condition: s.trigger_condition,
            conversation_flow: s.conversation_flow,
            severity: s.severity,
            resolution_guide: s.resolution_guide,
            tags: s.tags,
          }),
        );
        scenariosCreated++;
      }
    }

    // 4. Tạo FAQs
    let faqsCreated = 0;
    for (const f of SEED_FAQS) {
      const categoryId = categoryMap[f.category];
      if (!categoryId) continue;
      const exists = await this.faqRepo.findOne({
        where: { category_id: categoryId, question: f.question },
      });
      if (!exists) {
        await this.faqRepo.save(
          this.faqRepo.create({
            category_id: categoryId,
            question: f.question,
            answer: f.answer,
            related_questions: f.related_questions,
            keywords: f.keywords,
          }),
        );
        faqsCreated++;
      }
    }

    return {
      message: 'Import dữ liệu mẫu câu thành công!',
      created: {
        categories: Object.keys(categoryMap).length,
        phrases: phrasesCreated,
        scenarios: scenariosCreated,
        faqs: faqsCreated,
      },
    };
  }
}
