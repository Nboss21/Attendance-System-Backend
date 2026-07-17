import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller'; import { AuthService } from './auth.service';
import { PasswordService } from '../../common/auth/password.service'; import { JwtService } from '../../common/auth/jwt.service'; import { TokenBlacklistService } from '../../common/auth/token-blacklist.service';
@Module({ controllers: [AuthController], providers: [AuthService, PasswordService, JwtService, TokenBlacklistService], exports: [JwtService, TokenBlacklistService] }) export class AuthModule {}
