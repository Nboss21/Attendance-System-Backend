import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public, Permissions } from '../../common/auth/auth.decorators';
import { Audited } from '../../common/decorators/audit.decorator';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { SubmitPunchDto } from './dto/submit-punch.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ─── Mobile / on-device face check-in ────────────────────────────────────

  /**
   * POST /api/v1/attendance/check
   *
   * Called by the Flutter mobile app (bayn_attendance) after the on-device
   * ML face recognizer returns a match. The call is tenant-scoped via the JWT
   * (the mobile device logs in as a DEVICE role or an EMPLOYEE role first).
   *
   * Response shape mirrors the Flutter PRD contract:
   * { status, employeeName, attendanceType, time, punchId, confidence }
   */
  @Post('check')
  @Permissions('attendance:checkin')
  @Audited({ entity: 'AttendancePunch', action: 'CREATE' })
  @ApiOperation({
    summary: 'Mobile face check-in',
    description:
      'Accepts a base64 face image + recognition result from the Flutter app. ' +
      'Creates an immutable AttendancePunch and upserts the daily AttendanceLog. ' +
      'Returns the standard PRD response: { status, employeeName, attendanceType, time }.',
  })
  @ApiCreatedResponse({
    description: 'Punch recorded',
    schema: {
      example: {
        status: 'success',
        employeeName: 'John Doe',
        employeeCode: 'EMP001',
        attendanceType: 'Check In',
        time: '08:30 AM',
        punchId: 'uuid',
        confidence: 0.97,
      },
    },
  })
  checkIn(@Body() dto: CheckInDto) {
    return this.service.checkIn(dto);
  }

  // ─── Hardware device batch punch submission ───────────────────────────────

  /**
   * POST /api/v1/attendance/punches
   *
   * Called by hardware biometric devices (face terminals, RFID readers, etc.)
   * to submit a single punch. Supports idempotency keys for offline-sync safety.
   * Requires the device JWT or the X-Device-Api-Key header.
   */
  @Post('punches')
  @Permissions('attendance:checkin')
  @Audited({ entity: 'AttendancePunch', action: 'CREATE' })
  @ApiOperation({
    summary: 'Submit a device attendance punch',
    description:
      'Used by hardware biometric devices. Idempotency key prevents duplicate ' +
      'records when the device replays buffered offline punches on reconnect.',
  })
  @ApiCreatedResponse({
    schema: { example: { queued: true, duplicate: false, punchId: 'uuid' } },
  })
  submitPunch(@Body() dto: SubmitPunchDto) {
    return this.service.submitPunch(dto);
  }

  // ─── Attendance log queries ───────────────────────────────────────────────

  @Get('logs')
  @Permissions('attendance:read')
  @ApiOperation({
    summary: 'Query attendance logs',
    description:
      'Filter by employee, date window (from/to), and/or attendance status. ' +
      'All results are scoped to the authenticated tenant.',
  })
  @ApiOkResponse({ description: 'Array of AttendanceLog records' })
  findLogs(@Query() query: AttendanceQueryDto) {
    return this.service.findLogs(query);
  }

  // ─── Today summary (dashboard widget) ────────────────────────────────────

  @Get('today')
  @Permissions('attendance:read')
  @ApiOperation({
    summary: "Today's attendance summary for the tenant",
    description:
      'Returns present/late/absent counts and total active employees. ' +
      'Designed for the HR dashboard overview widget.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        date: '2026-07-21',
        totalEmployees: 120,
        present: 97,
        late: 8,
        absent: 5,
        notYetRecorded: 10,
      },
    },
  })
  todaySummary() {
    return this.service.todaySummary();
  }
}
