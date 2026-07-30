import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

interface AuthTokenPayload {
  sub: string;
  username: string;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  login(username: string, password: string) {
    const expectedUsername = this.configService.get<string>('AUTH_USERNAME') || 'admin';
    const expectedPassword = this.configService.get<string>('AUTH_PASSWORD') || 'admin123';

    if (!this.safeEqual(username, expectedUsername) || !this.safeEqual(password, expectedPassword)) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const expiresInSeconds = 7 * 24 * 60 * 60;
    const payload: AuthTokenPayload = {
      sub: 'admin',
      username: expectedUsername,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    };

    return {
      token: this.signPayload(payload),
      user: { username: expectedUsername },
      expires_in: expiresInSeconds,
    };
  }

  verifyToken(token: string): AuthTokenPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid token');
    }

    const expectedSignature = this.sign(encodedPayload);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid token');
    }

    let payload: AuthTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return payload;
  }

  private signPayload(payload: AuthTokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  private sign(value: string) {
    const secret = this.configService.get<string>('AUTH_TOKEN_SECRET') || this.getFallbackSecret();
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private getFallbackSecret() {
    const password = this.configService.get<string>('AUTH_PASSWORD') || 'admin123';
    return `app-ai-dentist:${password}`;
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a || '');
    const right = Buffer.from(b || '');
    if (left.length !== right.length) {
      timingSafeEqual(left, Buffer.from(randomBytes(left.length)));
      return false;
    }
    return timingSafeEqual(left, right);
  }
}
