import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username || '', body.password || '');
  }

  @Get('me')
  me(@Req() request: any) {
    return { user: { username: request.user?.username || 'admin' } };
  }
}
