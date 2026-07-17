import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, ShiftType } from '@prisma/client';
import { ShiftsService } from './shifts.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-uuid-001';
const SHIFT_ID = 'shift-uuid-001';
const EMPLOYEE_ID = 'employee-uuid-001';

function makeShift(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SHIFT_ID,
    companyId: COMPANY_ID,
    name: 'Morning Shift',
    type: ShiftType.FIXED,
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
    gracePeriodMins: 10,
    isOvernight: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    shift: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    scheduleAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function makeTenant(companyId = COMPANY_ID) {
  return {
    companyId,
    companyIdOrThrow: jest.fn(() => companyId),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ShiftsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ShiftsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ShiftsService(prisma as any, makeTenant() as any);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a shift scoped to the tenant', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      prisma.shift.create.mockResolvedValue(makeShift());

      await service.create({ name: 'Morning Shift', startTime: '08:00', endTime: '17:00' });

      expect(prisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID, isOvernight: false }),
        }),
      );
    });

    it('derives isOvernight=true when endTime <= startTime', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      prisma.shift.create.mockResolvedValue(makeShift({ isOvernight: true }));

      await service.create({ name: 'Night Shift', startTime: '22:00', endTime: '06:00' });

      expect(prisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isOvernight: true }) }),
      );
    });

    it('rejects a duplicate shift name within the tenant', async () => {
      prisma.shift.findFirst.mockResolvedValue(makeShift());

      await expect(
        service.create({ name: 'Morning Shift', startTime: '08:00', endTime: '17:00' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });
  });

  // ── findAll / findOne ─────────────────────────────────────────────────────

  describe('findAll', () => {
    it('lists only the tenant shifts', async () => {
      prisma.shift.findMany.mockResolvedValue([makeShift()]);

      await service.findAll();

      expect(prisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFound for a shift outside the tenant', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);

      await expect(service.findOne(SHIFT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('re-derives isOvernight when times change', async () => {
      prisma.shift.findFirst.mockResolvedValue(makeShift());
      prisma.shift.update.mockResolvedValue(makeShift({ isOvernight: true }));

      await service.update(SHIFT_ID, { startTime: '20:00', endTime: '04:00' });

      expect(prisma.shift.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isOvernight: true }) }),
      );
    });

    it('keeps stored isOvernight when times are untouched', async () => {
      prisma.shift.findFirst.mockResolvedValue(makeShift({ isOvernight: false }));
      prisma.shift.update.mockResolvedValue(makeShift());

      await service.update(SHIFT_ID, { gracePeriodMins: 15 });

      expect(prisma.shift.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isOvernight: false }) }),
      );
    });

    it('rejects renaming to an existing shift name', async () => {
      prisma.shift.findFirst
        .mockResolvedValueOnce(makeShift()) // assertOwnedShift
        .mockResolvedValueOnce(makeShift({ id: 'other-shift' })); // name clash

      await expect(service.update(SHIFT_ID, { name: 'Night Shift' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an owned shift', async () => {
      prisma.shift.findFirst.mockResolvedValue(makeShift());
      prisma.shift.delete.mockResolvedValue(makeShift());

      await expect(service.remove(SHIFT_ID)).resolves.toEqual({ deleted: true });
    });

    it('throws NotFound for a shift outside the tenant', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);

      await expect(service.remove(SHIFT_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.shift.delete).not.toHaveBeenCalled();
    });
  });

  // ── assign ────────────────────────────────────────────────────────────────

  describe('assign', () => {
    beforeEach(() => {
      prisma.shift.findFirst.mockResolvedValue(makeShift());
      prisma.employee.findMany.mockResolvedValue([{ id: EMPLOYEE_ID }]);
      prisma.scheduleAssignment.upsert.mockResolvedValue({ id: 'assignment-uuid' });
    });

    it('creates one assignment per employee per day (inclusive range)', async () => {
      const result = await service.assign(SHIFT_ID, {
        employeeIds: [EMPLOYEE_ID],
        from: '2026-07-20',
        to: '2026-07-26',
      });

      expect(result).toEqual({ assigned: 7, employees: 1, days: 7 });
      expect(prisma.scheduleAssignment.upsert).toHaveBeenCalledTimes(7);
      expect(prisma.scheduleAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employeeId_date: { employeeId: EMPLOYEE_ID, date: new Date('2026-07-20T00:00:00Z') },
          },
          create: expect.objectContaining({ shiftId: SHIFT_ID }),
          update: { shiftId: SHIFT_ID, status: 'SCHEDULED' },
        }),
      );
    });

    it('defaults `to` to `from` for a single-day assignment', async () => {
      const result = await service.assign(SHIFT_ID, {
        employeeIds: [EMPLOYEE_ID],
        from: '2026-07-20',
      });

      expect(result.days).toBe(1);
    });

    it('rejects employees that do not belong to the tenant', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await expect(
        service.assign(SHIFT_ID, { employeeIds: [EMPLOYEE_ID], from: '2026-07-20' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scheduleAssignment.upsert).not.toHaveBeenCalled();
    });

    it('rejects a range where `to` precedes `from`', async () => {
      await expect(
        service.assign(SHIFT_ID, {
          employeeIds: [EMPLOYEE_ID],
          from: '2026-07-20',
          to: '2026-07-19',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a range longer than 92 days', async () => {
      await expect(
        service.assign(SHIFT_ID, {
          employeeIds: [EMPLOYEE_ID],
          from: '2026-01-01',
          to: '2026-12-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAssignments ───────────────────────────────────────────────────────

  describe('findAssignments', () => {
    it('scopes the query to the tenant through the employee relation', async () => {
      prisma.scheduleAssignment.findMany.mockResolvedValue([]);

      await service.findAssignments({ from: '2026-07-20', to: '2026-07-26' });

      expect(prisma.scheduleAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: { companyId: COMPANY_ID },
            date: {
              gte: new Date('2026-07-20T00:00:00Z'),
              lte: new Date('2026-07-26T00:00:00Z'),
            },
          }),
        }),
      );
    });
  });

  // ── updateAssignment / removeAssignment ───────────────────────────────────

  describe('updateAssignment', () => {
    it('cancels an owned assignment', async () => {
      prisma.scheduleAssignment.findFirst.mockResolvedValue({ id: 'assignment-uuid' });
      prisma.scheduleAssignment.update.mockResolvedValue({
        id: 'assignment-uuid',
        status: AssignmentStatus.CANCELLED,
      });

      await service.updateAssignment('assignment-uuid', { status: AssignmentStatus.CANCELLED });

      expect(prisma.scheduleAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'assignment-uuid' } }),
      );
    });

    it('throws NotFound for an assignment outside the tenant', async () => {
      prisma.scheduleAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAssignment('assignment-uuid', { status: AssignmentStatus.CANCELLED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('validates the target shift when moving an assignment', async () => {
      prisma.scheduleAssignment.findFirst.mockResolvedValue({ id: 'assignment-uuid' });
      prisma.shift.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAssignment('assignment-uuid', { shiftId: 'foreign-shift' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getActiveShift ────────────────────────────────────────────────────────

  describe('getActiveShift', () => {
    beforeEach(() => {
      // No branch → falls back to Africa/Addis_Ababa (UTC+3).
      prisma.employee.findUnique.mockResolvedValue({ branch: null });
    });

    /** Resolves the two findFirst calls (today, yesterday) in order. */
    function mockAssignments(today: unknown, yesterday: unknown) {
      prisma.scheduleAssignment.findFirst
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce(yesterday);
      prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    }

    it('buckets the punch to the Ethiopian local day, not the UTC day', async () => {
      const shift = makeShift();
      mockAssignments({ id: 'assignment-uuid', shift }, null);

      // 22:30 UTC on the 19th = 01:30 on the 20th in Addis Ababa.
      const result = await service.getActiveShift(EMPLOYEE_ID, new Date('2026-07-19T22:30:00Z'));

      expect(result).toEqual(shift);
      expect(prisma.scheduleAssignment.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ date: new Date('2026-07-20T00:00:00Z') }),
        }),
      );
    });

    it('attributes an early-morning punch to the previous day overnight shift', async () => {
      const nightShift = makeShift({
        id: 'night-shift',
        name: 'Night Shift',
        startTime: '22:00',
        endTime: '06:00',
        isOvernight: true,
      });
      // 22:30 UTC on the 19th = 01:30 local on the 20th; night shift started
      // on the 19th and runs until 06:00 on the 20th.
      mockAssignments(null, { id: 'assignment-uuid', shift: nightShift });

      const result = await service.getActiveShift(EMPLOYEE_ID, new Date('2026-07-19T22:30:00Z'));

      expect(result).toEqual(nightShift);
      expect(prisma.scheduleAssignment.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ date: new Date('2026-07-19T00:00:00Z') }),
        }),
      );
    });

    it('ignores yesterday overnight shift once it has ended (past end + grace)', async () => {
      const nightShift = makeShift({
        id: 'night-shift',
        startTime: '22:00',
        endTime: '06:00',
        gracePeriodMins: 10,
        isOvernight: true,
      });
      const dayShift = makeShift();
      // 06:00 UTC on the 20th = 09:00 local — past 06:10, so the day shift wins.
      mockAssignments({ id: 'a-today', shift: dayShift }, { id: 'a-yesterday', shift: nightShift });

      const result = await service.getActiveShift(EMPLOYEE_ID, new Date('2026-07-20T06:00:00Z'));

      expect(result).toEqual(dayShift);
    });

    it('uses the branch timezone when the employee has one', async () => {
      prisma.employee.findUnique.mockResolvedValue({ branch: { timezone: 'UTC' } });
      const shift = makeShift();
      mockAssignments({ id: 'assignment-uuid', shift }, null);

      // Same instant, but in UTC the local day is still the 19th.
      await service.getActiveShift(EMPLOYEE_ID, new Date('2026-07-19T22:30:00Z'));

      expect(prisma.scheduleAssignment.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ date: new Date('2026-07-19T00:00:00Z') }),
        }),
      );
    });

    it('returns null when nothing is scheduled', async () => {
      mockAssignments(null, null);

      await expect(
        service.getActiveShift(EMPLOYEE_ID, new Date('2026-07-20T09:13:00Z')),
      ).resolves.toBeNull();
    });
  });
});
