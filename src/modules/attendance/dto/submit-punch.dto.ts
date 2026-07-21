import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PunchDirection, PunchMethod } from '@prisma/client';

/**
 * Used by hardware devices to batch-submit attendance punches.
 * Supports an idempotency key so retries after offline sync don't duplicate records.
 */
export class SubmitPunchDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'Device UUID that captured the punch' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the punch was captured by the device',
    example: '2026-07-21T08:00:00.000Z',
  })
  @IsDateString()
  timestamp!: string;

  @ApiPropertyOptional({ enum: PunchDirection, default: 'IN' })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;

  @ApiPropertyOptional({ enum: PunchMethod, default: 'FACE' })
  @IsOptional()
  @IsEnum(PunchMethod)
  method?: PunchMethod;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  /**
   * Unique key (e.g. deviceId + employeeId + timestamp) that the device
   * generates. The backend uses this to de-duplicate retries from offline sync.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
