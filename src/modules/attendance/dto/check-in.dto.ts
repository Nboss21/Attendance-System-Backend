import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PunchDirection, PunchMethod } from '@prisma/client';

export class CheckInDto {
  /**
   * Base64-encoded JPEG image captured by the device camera.
   * The backend stores it for audit purposes and future server-side matching.
   */
  @ApiProperty({
    description: 'Base64-encoded face image captured by the mobile device',
    example: '/9j/4AAQSkZJRgABAQAA...',
  })
  @IsString()
  @IsNotEmpty()
  faceImageBase64!: string;

  /** Employee ID resolved locally by the on-device recognizer (optional). */
  @ApiPropertyOptional({ description: 'Employee UUID if known by the device' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: PunchDirection, default: PunchDirection.IN })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;

  @ApiPropertyOptional({ enum: PunchMethod, default: PunchMethod.FACE })
  @IsOptional()
  @IsEnum(PunchMethod)
  method?: PunchMethod;

  /** Recognition confidence score (0.0–1.0) produced by the on-device engine */
  @ApiPropertyOptional({ example: 0.97, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  /** Device UUID that initiated this punch (for traceability) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
