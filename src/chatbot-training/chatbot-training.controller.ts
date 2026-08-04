import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatbotTrainingService } from './chatbot-training.service';
import { Public } from '../auth/public.decorator';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreatePhraseDto,
  UpdatePhraseDto,
  CreateScenarioDto,
  UpdateScenarioDto,
  CreateFAQDto,
  UpdateFAQDto,
  ChatRequestDto,
} from './dto';

@Controller('chatbot-training')
export class ChatbotTrainingController {
  constructor(private readonly service: ChatbotTrainingService) {}

  // ==================== KNOWLEDGE IMAGES ====================

  @Get('images')
  findAllImages(@Query('category_id') categoryId?: string) {
    return this.service.findAllImages(categoryId);
  }

  @Post('images')
  createImage(@Body() dto: { title: string; image_url: string; description?: string; tags?: string[]; category_id?: string }) {
    return this.service.createImage(dto);
  }

  @Delete('images/:id')
  removeImage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeImage(id);
  }

  // ==================== CHATBOTS ====================

  @Get('chatbots')
  findAllChatbots() {
    return this.service.findAllChatbots();
  }

  @Get('chatbots/:id')
  findOneChatbot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneChatbot(id);
  }

  @Post('chatbots')
  createChatbot(@Body() dto: { name: string; description?: string; prompt?: string; model?: string; settings?: object }) {
    return this.service.createChatbot(dto);
  }

  @Put('chatbots/:id')
  updateChatbot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.service.updateChatbot(id, dto);
  }

  @Delete('chatbots/:id')
  removeChatbot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeChatbot(id);
  }

  // ==================== FACEBOOK PAGE WEBHOOK ====================

  @Public()
  @Get('facebook/webhook/:botId')
  async verifyFacebookWebhook(
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() response: Response,
  ) {
    const verifiedChallenge = await this.service.verifyFacebookWebhook(botId, mode, verifyToken, challenge);
    return response.status(200).send(verifiedChallenge);
  }

  @Public()
  @Get('facebook/webhook')
  async verifyFacebookAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() response: Response,
  ) {
    const verifiedChallenge = this.service.verifyFacebookAppWebhook(mode, verifyToken, challenge);
    return response.status(200).send(verifiedChallenge);
  }

  @Public()
  @Post('facebook/webhook/:botId')
  handleFacebookWebhook(
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() body: any,
  ) {
    return this.service.handleFacebookWebhook(botId, body);
  }

  @Public()
  @Post('facebook/webhook')
  handleFacebookAppWebhook(@Body() body: any) {
    return this.service.handleFacebookAppWebhook(body);
  }

  @Get('facebook/oauth-url/:botId')
  getFacebookOAuthUrl(
    @Param('botId', ParseUUIDPipe) botId: string,
    @Req() request: Request,
    @Query('return_url') returnUrl?: string,
  ) {
    return this.service.getFacebookOAuthUrl(botId, request, returnUrl);
  }

  @Public()
  @Get('facebook/oauth/callback')
  async handleFacebookOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    const redirectUrl = await this.service.handleFacebookOAuthCallback(code, state);
    return response.redirect(redirectUrl);
  }

  @Get('facebook/oauth-pages/:botId')
  getFacebookOAuthPages(@Param('botId', ParseUUIDPipe) botId: string) {
    return this.service.getFacebookOAuthPages(botId);
  }

  @Post('facebook/connect-page/:botId')
  connectFacebookOAuthPage(
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() body: { page_id: string },
  ) {
    return this.service.connectFacebookOAuthPage(botId, body.page_id);
  }

  @Post('facebook/sync-profile/:botId')
  syncFacebookProfile(@Param('botId', ParseUUIDPipe) botId: string) {
    return this.service.syncConnectedFacebookProfile(botId);
  }

  @Get('facebook/connected-pages')
  getConnectedFacebookPages() {
    return this.service.getConnectedFacebookPages();
  }

  @Post('facebook/publish-post')
  publishFacebookPost(@Body() body: {
    page_id: string;
    message: string;
    image_url?: string;
  }) {
    return this.service.publishFacebookPost(body);
  }

  // ==================== UPLOAD KNOWLEDGE ====================

  @Post('knowledge/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, callback) => {
        const allowed = [
          'text/plain',
          'text/markdown',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new BadRequestException(`File type không hỗ trợ: ${file.mimetype}. Chỉ hỗ trợ .txt, .md, .doc, .docx`), false);
        }
      },
    }),
  )
  async uploadKnowledge(
    @UploadedFile() file: Express.Multer.File,
    @Body('category_id') categoryId?: string,
  ) {
    return this.service.processKnowledgeFile(file, categoryId);
  }

  @Post('knowledge/text')
  async addKnowledgeText(
    @Body() body: { content: string; title?: string; category_id?: string },
  ) {
    return this.service.addKnowledgeText(body.content, body.title, body.category_id);
  }

  // ==================== CHAT AI ====================

  @Post('chat')
  chat(@Body() dto: ChatRequestDto) {
    return this.service.chat(dto.message, dto.history || [], dto.system_prompt);
  }

  @Post('chat/suggest')
  suggest(@Body() body: { history: { role: 'user' | 'assistant'; content: string }[] }) {
    return this.service.suggestQuestions(body.history || []);
  }

  // ==================== SEED DATA ====================

  @Post('seed')
  seed() {
    return this.service.seedData();
  }

  // ==================== STATS ====================

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  // ==================== CATEGORIES ====================

  @Get('categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Get('categories/:id')
  findOneCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneCategory(id);
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Put('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeCategory(id);
  }

  // ==================== PHRASES ====================

  @Get('phrases')
  findAllPhrases(@Query('category_id') categoryId?: string) {
    return this.service.findAllPhrases(categoryId);
  }

  @Get('phrases/:id')
  findOnePhrase(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOnePhrase(id);
  }

  @Post('phrases')
  createPhrase(@Body() dto: CreatePhraseDto) {
    return this.service.createPhrase(dto);
  }

  @Put('phrases/:id')
  updatePhrase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePhraseDto,
  ) {
    return this.service.updatePhrase(id, dto);
  }

  @Delete('phrases/:id')
  removePhrase(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePhrase(id);
  }

  // ==================== SCENARIOS ====================

  @Get('scenarios')
  findAllScenarios(@Query('category_id') categoryId?: string) {
    return this.service.findAllScenarios(categoryId);
  }

  @Get('scenarios/:id')
  findOneScenario(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneScenario(id);
  }

  @Post('scenarios')
  createScenario(@Body() dto: CreateScenarioDto) {
    return this.service.createScenario(dto);
  }

  @Put('scenarios/:id')
  updateScenario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScenarioDto,
  ) {
    return this.service.updateScenario(id, dto);
  }

  @Delete('scenarios/:id')
  removeScenario(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeScenario(id);
  }

  // ==================== FAQs ====================

  @Get('faqs')
  findAllFAQs(@Query('category_id') categoryId?: string) {
    return this.service.findAllFAQs(categoryId);
  }

  @Get('faqs/:id')
  findOneFAQ(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneFAQ(id);
  }

  @Post('faqs')
  createFAQ(@Body() dto: CreateFAQDto) {
    return this.service.createFAQ(dto);
  }

  @Put('faqs/:id')
  updateFAQ(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFAQDto,
  ) {
    return this.service.updateFAQ(id, dto);
  }

  @Delete('faqs/:id')
  removeFAQ(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeFAQ(id);
  }
}
