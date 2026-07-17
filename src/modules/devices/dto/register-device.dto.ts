import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIP, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DeviceType, MatchingMode } from '@prisma/client';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Unique hardware serial number of the device' })
  @IsString()
  @MinLength(1)
  serialNumber!: string;

  @ApiProperty({ enum: DeviceType, description: 'Hardware type of the device' })
  @IsEnum(DeviceType)
  type!: DeviceType;

  @ApiPropertyOptional({ description: 'Branch the device belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Static IP address of the device on the local network' })
  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({
    enum: MatchingMode,
    default: MatchingMode.ON_DEVICE,
    description:
      'Whether face matching happens on the device or is delegated to the server. ' +
      'ON_DEVICE is recommended for facilities with unreliable connectivity.',
  })
  @IsOptional()
  @IsEnum(MatchingMode)
  matchingMode?: MatchingMode;

  @ApiPropertyOptional({ description: 'Firmware version string reported by the device' })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}
