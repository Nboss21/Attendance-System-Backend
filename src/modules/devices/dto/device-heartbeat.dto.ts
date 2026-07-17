import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIP, IsOptional, IsString } from 'class-validator';

export class DeviceHeartbeatDto {
  @ApiPropertyOptional({ description: 'Current firmware version reported by the device' })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @ApiPropertyOptional({ description: 'Current IP address reported by the device' })
  @IsOptional()
  @IsIP()
  ipAddress?: string;
}
