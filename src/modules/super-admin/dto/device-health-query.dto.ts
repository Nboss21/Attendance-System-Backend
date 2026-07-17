import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class DeviceHealthQueryDto {
  @ApiPropertyOptional({
    description:
      'Devices that have not sent a heartbeat in this many minutes are considered offline (default: 5)',
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  heartbeatThresholdMinutes?: number;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsOptional()
  @IsString()
  companyId?: string;
}
