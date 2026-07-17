import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSuperAdminCompanyDto {
  @ApiPropertyOptional({ description: 'Subscription plan identifier' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: CompanyStatus })
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @ApiPropertyOptional({ description: 'Arbitrary settings JSON' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
