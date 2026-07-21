import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, PunchDirection, PunchMethod, PunchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CheckInDto } from './dto/check-in.dto';
import { SubmitPunchDto } from './dto/submit-punch.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ─── Mobile face check-in ──────────────────────────────────────────────────

  /**
   * Called by the Flutter mobile app after on-device face recognition.
   * 1. Optionally verifies the employee exists in the tenant.
   * 2. Writes an immutable AttendancePunch record.
   * 3. Upserts the daily AttendanceLog (check-in or check-out).
   * 4. Returns a response shaped to match the Flutter PRD success payload.
   */
  async checkIn(dto: CheckInDto) {
    const companyId = this.tenant.companyIdOrThrow();

    // Resolve employee if provided
    let employee: { id: string; firstName: string; lastName: string; employeeCode: string } | null = null;
    if (dto.employeeId) {
      employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, companyId },
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
      });
      if (!employee) {
        throw new NotFoundException(`Employee ${dto.employeeId} not found in this tenant`);
      }
    }

    const now = new Date();

    // Determine punch status based on confidence threshold
    const CONFIDENCE_THRESHOLD = 0.7;
    const punchStatus =
      dto.confidence !== undefined && dto.confidence < CONFIDENCE_THRESHOLD
        ? PunchStatus.UNVERIFIED
        : PunchStatus.VERIFIED;

    // Write immutable punch record
    const punch = await this.prisma.attendancePunch.create({
      data: {
        companyId,
        employeeId: dto.employeeId ?? null,
        deviceId: dto.deviceId ?? null,
        timestamp: now,
        direction: dto.direction ?? PunchDirection.IN,
        method: dto.method ?? PunchMethod.FACE,
        confidence: dto.confidence ?? null,
        status: punchStatus,
        // Store a note that this was a base64 image upload (not a path)
        rawImagePath: dto.faceImageBase64 ? 'mobile-upload' : null,
      },
    });

    // Upsert daily attendance log if we know the employee
    if (employee) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await this.prisma.attendanceLog.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: today } },
      });

      if (!existing) {
        // First punch of the day → create check-in record
        await this.prisma.attendanceLog.create({
          data: {
            companyId,
            employeeId: employee.id,
            date: today,
            checkIn: now,
            status: AttendanceStatus.PRESENT,
            punchId: punch.id,
          },
        });
      } else if (!existing.checkOut && existing.checkIn) {
        // Subsequent punch → record check-out
        const checkInTime = existing.checkIn!;
        const diffMs = now.getTime() - checkInTime.getTime();
        const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        await this.prisma.attendanceLog.update({
          where: { id: existing.id },
          data: {
            checkOut: now,
            totalHours,
          },
        });
      }
    }

    // Build response matching Flutter PRD contract
    const hour = now.getHours();
    const minute = now.getMinutes().toString().padStart(2, '0');
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const timeStr = `${displayHour}:${minute} ${period}`;
    const isCheckOut = punch.direction === PunchDirection.OUT;

    return {
      status: punchStatus === PunchStatus.VERIFIED ? 'success' : 'unverified',
      employeeName: employee
        ? `${employee.firstName} ${employee.lastName}`
        : 'Unknown',
      employeeCode: employee?.employeeCode ?? null,
      attendanceType: isCheckOut ? 'Check Out' : 'Check In',
      time: timeStr,
      punchId: punch.id,
      confidence: punch.confidence,
    };
  }

  // ─── Device punch submission (hardware devices) ────────────────────────────

  async submitPunch(dto: SubmitPunchDto) {
    const companyId = this.tenant.companyIdOrThrow();

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.attendancePunch.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return { queued: false, duplicate: true, punchId: existing.id };
      }
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    const punch = await this.prisma.attendancePunch.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        deviceId: dto.deviceId ?? null,
        timestamp: new Date(dto.timestamp),
        direction: dto.direction ?? PunchDirection.IN,
        method: dto.method ?? PunchMethod.FACE,
        confidence: dto.confidence ?? null,
        status: PunchStatus.VERIFIED,
        idempotencyKey: dto.idempotencyKey ?? null,
      },
    });

    return { queued: true, duplicate: false, punchId: punch.id };
  }

  // ─── Attendance Log Query ──────────────────────────────────────────────────

  async findLogs(query: AttendanceQueryDto) {
    const companyId = this.tenant.companyIdOrThrow();

    const where: any = { companyId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    return this.prisma.attendanceLog.findMany({
      where,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  // ─── Today's Summary ───────────────────────────────────────────────────────

  async todaySummary() {
    const companyId = this.tenant.companyIdOrThrow();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [presentCount, lateCount, absentCount, totalEmployees] = await Promise.all([
      this.prisma.attendanceLog.count({ where: { companyId, date: today, status: AttendanceStatus.PRESENT } }),
      this.prisma.attendanceLog.count({ where: { companyId, date: today, status: AttendanceStatus.LATE } }),
      this.prisma.attendanceLog.count({ where: { companyId, date: today, status: AttendanceStatus.ABSENT } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
    ]);

    return {
      date: today.toISOString().split('T')[0],
      totalEmployees,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      notYetRecorded: totalEmployees - presentCount - lateCount - absentCount,
    };
  }
}
