import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PasswordService } from '../../common/auth/password.service';
import { JwtService } from '../../common/auth/jwt.service';

@Module({
  controllers: [SuperAdminController],
  providers: [SuperAdminService, PasswordService, JwtService],
})
export class SuperAdminModule {}
