import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { BranchesModule } from './modules/branches/branches.module';
import { TenantResolutionMiddleware } from './common/middleware/tenant-resolution.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RbacGuard } from './common/auth/rbac.guard';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    CompaniesModule,
    BranchesModule,
    EmployeesModule,
    DevicesModule,
    AuditModule,
    EventEmitterModule.forRoot(),
    SuperAdminModule,
    ShiftsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
