import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DEFAULT_TIMEZONE, localDateFor, localTimeFor, previousDay } from '../../utils/timezone';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto, ScheduleQueryDto, UpdateAssignmentDto } from './dto/assign-shift.dto';

/** Longest range a single bulk-assign call may span (inclusive), in days. */
const MAX_ASSIGNMENT_RANGE_DAYS = 92;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ─── Private helpers ──────────────────────────────────────────────────────

  private companyId() {
    return this.tenant.companyIdOrThrow();
  }

  /** Asserts the shift exists and belongs to this tenant. */
  private async assertOwnedShift(id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, companyId: this.companyId() },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  /**
   * A shift crosses midnight when its end time is not after its start time
   * (e.g. 22:00 → 06:00). "HH:mm" strings compare correctly lexicographically.
   */
  private deriveOvernight(startTime: string, endTime: string): boolean {
    return endTime <= startTime;
  }

  /** Parses an ISO "YYYY-MM-DD" string to a UTC date (matches the @db.Date column). */
  private toUtcDate(iso: string): Date {
    const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid date: ${iso}`);
    return date;
  }

  /** Expands an inclusive [from, to] range into one Date per day. */
  private expandRange(from: string, to: string): Date[] {
    const start = this.toUtcDate(from);
    const end = this.toUtcDate(to);
    if (end < start) throw new BadRequestException('`to` must not be before `from`');

    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > MAX_ASSIGNMENT_RANGE_DAYS) {
      throw new BadRequestException(
        `Assignment range may not exceed ${MAX_ASSIGNMENT_RANGE_DAYS} days`,
      );
    }

    return Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  }

  // ─── Shift CRUD ───────────────────────────────────────────────────────────

  async create(dto: CreateShiftDto) {
    const companyId = this.companyId();

    const existing = await this.prisma.shift.findFirst({
      where: { companyId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`A shift named "${dto.name}" already exists`);
    }

    return this.prisma.shift.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        startTime: dto.startTime,
        endTime: dto.endTime,
        breakMinutes: dto.breakMinutes,
        gracePeriodMins: dto.gracePeriodMins,
        isOvernight: dto.isOvernight ?? this.deriveOvernight(dto.startTime, dto.endTime),
      },
    });
  }

  findAll() {
    return this.prisma.shift.findMany({
      where: { companyId: this.companyId() },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.assertOwnedShift(id);
  }

  async update(id: string, dto: UpdateShiftDto) {
    const shift = await this.assertOwnedShift(id);

    if (dto.name && dto.name !== shift.name) {
      const clash = await this.prisma.shift.findFirst({
        where: { companyId: this.companyId(), name: dto.name, NOT: { id } },
      });
      if (clash) throw new BadRequestException(`A shift named "${dto.name}" already exists`);
    }

    const startTime = dto.startTime ?? shift.startTime;
    const endTime = dto.endTime ?? shift.endTime;

    return this.prisma.shift.update({
      where: { id },
      data: {
        ...dto,
        // Re-derive overnight when times change, unless the caller pinned it.
        isOvernight:
          dto.isOvernight ??
          (dto.startTime !== undefined || dto.endTime !== undefined
            ? this.deriveOvernight(startTime, endTime)
            : shift.isOvernight),
      },
    });
  }

  /** Deleting a shift cascades to its assignments (schema onDelete: Cascade). */
  async remove(id: string) {
    await this.assertOwnedShift(id);
    await this.prisma.shift.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Schedule assignments ─────────────────────────────────────────────────

  /**
   * Bulk-assign employees to a shift over an inclusive date range.
   * One row per employee per day (unique on [employeeId, date]).
   * Days where an employee already has an assignment are re-pointed to this
   * shift (upsert) so re-planning a week is a single idempotent call.
   */
  async assign(shiftId: string, dto: AssignShiftDto) {
    const companyId = this.companyId();
    await this.assertOwnedShift(shiftId);

    // Every employee must belong to this tenant.
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: dto.employeeIds }, companyId },
      select: { id: true },
    });
    const known = new Set(employees.map((e) => e.id));
    const unknown = dto.employeeIds.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new BadRequestException(`Unknown employees for this company: ${unknown.join(', ')}`);
    }

    const dates = this.expandRange(dto.from, dto.to ?? dto.from);

    const assignments = await this.prisma.$transaction(
      dto.employeeIds.flatMap((employeeId) =>
        dates.map((date) =>
          this.prisma.scheduleAssignment.upsert({
            where: { employeeId_date: { employeeId, date } },
            create: { employeeId, shiftId, date },
            update: { shiftId, status: 'SCHEDULED' },
          }),
        ),
      ),
    );

    return {
      assigned: assignments.length,
      employees: dto.employeeIds.length,
      days: dates.length,
    };
  }

  /** Query the schedule for the tenant, filtered by window/employee/shift. */
  findAssignments(query: ScheduleQueryDto) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.from) dateFilter.gte = this.toUtcDate(query.from);
    if (query.to) dateFilter.lte = this.toUtcDate(query.to);

    return this.prisma.scheduleAssignment.findMany({
      where: {
        employee: { companyId: this.companyId() },
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.shiftId ? { shiftId: query.shiftId } : {}),
        ...(query.from || query.to ? { date: dateFilter } : {}),
      },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    });
  }

  /** Update a single assignment (cancel it, mark swapped, or move to another shift). */
  async updateAssignment(id: string, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: { id, employee: { companyId: this.companyId() } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (dto.shiftId) await this.assertOwnedShift(dto.shiftId);

    return this.prisma.scheduleAssignment.update({
      where: { id },
      data: dto,
      include: { shift: { select: { id: true, name: true } } },
    });
  }

  async removeAssignment(id: string) {
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: { id, employee: { companyId: this.companyId() } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.prisma.scheduleAssignment.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Attendance Engine integration ────────────────────────────────────────
 
  async getActiveShift(employeeId: string, punchAt: Date) {
    const timeZone = await this.timezoneFor(employeeId);
    const day = localDateFor(punchAt, timeZone);
    const time = localTimeFor(punchAt, timeZone);

    const [today, yesterday] = await this.prisma.$transaction([
      this.prisma.scheduleAssignment.findFirst({
        where: { employeeId, date: day, status: 'SCHEDULED' },
        include: { shift: true },
      }),
      this.prisma.scheduleAssignment.findFirst({
        where: { employeeId, date: previousDay(day), status: 'SCHEDULED' },
        include: { shift: true },
      }),
    ]);

    if (yesterday?.shift.isOvernight && time <= this.plusGrace(yesterday.shift)) {
      return yesterday.shift;
    }
    return today?.shift ?? null;
  }

  private async timezoneFor(employeeId: string): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { branch: { select: { timezone: true } } },
    });
    return employee?.branch?.timezone ?? DEFAULT_TIMEZONE;
  }

  private plusGrace(shift: { endTime: string; gracePeriodMins: number }): string {
    const [h, m] = shift.endTime.split(':').map(Number);
    const total = (h * 60 + m + shift.gracePeriodMins) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
}
