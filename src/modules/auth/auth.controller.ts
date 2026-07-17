import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
@ApiTags('auth') @Controller('auth') export class AuthController {
 constructor(private readonly service: AuthService) {}
 @Public() @Post('login') login(@Body() dto: LoginDto) { return this.service.login(dto.email, dto.password); }
 @Public() @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.service.refresh(dto.refreshToken); }
 @Post('logout') logout(@Headers('authorization') authorization: string, @Body() dto: Partial<RefreshDto>) { return this.service.logout(authorization.replace(/^Bearer\s+/i, ''), dto.refreshToken); }
}
