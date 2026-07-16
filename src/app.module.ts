import { MiddlewareConsumer, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { BranchesModule } from './modules/branches/branches.module';
import { TenantResolutionMiddleware } from './common/middleware/tenant-resolution.middleware';
@Module({ imports: [PrismaModule, TenantModule, CompaniesModule, BranchesModule] }) export class AppModule { configure(consumer: MiddlewareConsumer) { consumer.apply(TenantResolutionMiddleware).forRoutes('*'); } }
