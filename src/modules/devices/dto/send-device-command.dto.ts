import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCommandType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional } from 'class-validator';

export class SendDeviceCommandDto {
  @ApiProperty({
    enum: DeviceCommandType,
    description:
      'Command to send to the device. ' +
      'SYNC_TEMPLATES — push updated biometric templates; ' +
      'REBOOT — restart the device; ' +
      'ENROLL_START — trigger enrolment mode (payload should include employeeId).',
  })
  @IsEnum(DeviceCommandType)
  command!: DeviceCommandType;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON payload for the command (e.g. { employeeId } for ENROLL_START)',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
