import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceStatus, MatchingMode } from '@prisma/client';
import { IsEnum, IsIP, IsOptional, IsString } from 'class-validator';

export class UpdateDeviceDto {
  @ApiPropertyOptional({ description: 'Static IP address of the device on the local network' })
  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ enum: MatchingMode })
  @IsOptional()
  @IsEnum(MatchingMode)
  matchingMode?: MatchingMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}
