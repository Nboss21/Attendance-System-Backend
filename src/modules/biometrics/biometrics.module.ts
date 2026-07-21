import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TenantModule } from '../../common/tenant/tenant.module';
import { BiometricsController, BiometricsListController } from './biometrics.controller';
import { BiometricsService } from './biometrics.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [BiometricsController, BiometricsListController],
  providers: [BiometricsService],
  exports: [BiometricsService],
})
export class BiometricsModule {}
