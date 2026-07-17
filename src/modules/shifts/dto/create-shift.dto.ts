import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** HH:mm 24-hour clock, e.g. "08:30" or "22:00". */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @ApiProperty({ example: 'Morning Shift' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: ShiftType, default: ShiftType.FIXED })
  @IsOptional()
  @IsEnum(ShiftType)
  type?: ShiftType;

  @ApiProperty({
    example: '08:00',
    description:
      'Shift start time, HH:mm (24h), in the branch local timezone ' +
      '(Africa/Addis_Ababa by default)',
  })
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm 24-hour format' })
  startTime!: string;

  @ApiProperty({
    example: '17:00',
    description:
      'Shift end time, HH:mm (24h), in the branch local timezone ' +
      '(Africa/Addis_Ababa by default)',
  })
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm 24-hour format' })
  endTime!: string;

  @ApiPropertyOptional({ default: 0, description: 'Unpaid break duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @ApiPropertyOptional({
    default: 10,
    description: 'Minutes after startTime before a check-in counts as late',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  gracePeriodMins?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'True when the shift crosses midnight (e.g. 22:00 → 06:00). ' +
      'Derived automatically when endTime <= startTime, but can be set explicitly.',
  })
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}
