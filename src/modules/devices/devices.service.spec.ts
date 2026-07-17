import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeviceCommandType, DeviceStatus, DeviceType, MatchingMode } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DevicesService } from './devices.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-uuid-001';
const DEVICE_ID = 'device-uuid-001';

function makeDevice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DEVICE_ID,
    companyId: COMPANY_ID,
    serialNumber: 'SN-001',
    type: DeviceType.FACE,
    status: DeviceStatus.ACTIVE,
    branchId: null,
    ipAddress: null,
    firmwareVersion: null,
    matchingMode: MatchingMode.ON_DEVICE,
    lastHeartbeatAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    device: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branch: {
      findFirst: jest.fn(),
    },
    deviceCredential: {
      findUnique: jest.fn(),
    },
    deviceCommand: {
      create: jest.fn(),
    },
  };
}

function makeTenant(companyId = COMPANY_ID) {
  return {
    companyId,
    companyIdOrThrow: jest.fn(() => companyId),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DevicesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let tenant: ReturnType<typeof makeTenant>;
  let eventEmitter: { emit: jest.Mock };
  let service: DevicesService;

  beforeEach(() => {
    prisma = makePrisma();
    tenant = makeTenant();
    eventEmitter = { emit: jest.fn() };
    service = new DevicesService(prisma as any, tenant as any, eventEmitter as any);
    jest.clearAllMocks();
  });

  // ── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      serialNumber: 'SN-001',
      type: DeviceType.FACE,
    };

    it('creates a device and returns a one-time apiKey', async () => {
      prisma.device.findUnique.mockResolvedValue(null); // serial not taken
      const fakeDevice = makeDevice();
      prisma.device.create.mockResolvedValue(fakeDevice);

      const result = await service.register(dto);

      expect(result).toHaveProperty('device');
      expect(result).toHaveProperty('apiKey');
      expect(typeof result.apiKey).toBe('string');
      expect(result.apiKey.length).toBeGreaterThan(0);
      expect(prisma.device.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            serialNumber: 'SN-001',
            type: DeviceType.FACE,
          }),
        }),
      );
    });

    it('throws BadRequestException when serial number is already taken', async () => {
      prisma.device.findUnique.mockResolvedValue(makeDevice());

      await expect(service.register(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.device.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when branchId belongs to another tenant', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.branch.findFirst.mockResolvedValue(null); // not found in tenant scope

      await expect(
        service.register({ ...dto, branchId: 'other-branch-uuid' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates branchId within the current tenant when provided', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-001', companyId: COMPANY_ID });
      prisma.device.create.mockResolvedValue(makeDevice({ branchId: 'branch-001' }));

      const result = await service.register({ ...dto, branchId: 'branch-001' });

      expect(result.device.branchId).toBe('branch-001');
      expect(prisma.branch.findFirst).toHaveBeenCalledWith({
        where: { id: 'branch-001', companyId: COMPANY_ID },
      });
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns tenant-scoped devices', async () => {
      const devices = [makeDevice()];
      prisma.device.findMany.mockResolvedValue(devices);

      const result = await service.findAll();

      expect(result).toEqual(devices);
      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_ID }) }),
      );
    });

    it('filters by status when provided', async () => {
      prisma.device.findMany.mockResolvedValue([]);

      await service.findAll(DeviceStatus.INACTIVE);

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, status: DeviceStatus.INACTIVE }),
        }),
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the device when found', async () => {
      const device = makeDevice();
      prisma.device.findFirst.mockResolvedValue(device);

      await expect(service.findOne(DEVICE_ID)).resolves.toEqual(device);
      expect(prisma.device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: DEVICE_ID, companyId: COMPANY_ID } }),
      );
    });

    it('throws NotFoundException when device is absent', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates device metadata', async () => {
      prisma.device.findFirst.mockResolvedValue(makeDevice()); // assertOwned
      const updated = makeDevice({ status: DeviceStatus.MAINTENANCE });
      prisma.device.update.mockResolvedValue(updated);

      const result = await service.update(DEVICE_ID, { status: DeviceStatus.MAINTENANCE });

      expect(result.status).toBe(DeviceStatus.MAINTENANCE);
      expect(prisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: DEVICE_ID }, data: { status: DeviceStatus.MAINTENANCE } }),
      );
    });

    it('throws NotFoundException for a device from another tenant', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.update('other-device', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── heartbeat ─────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('updates lastHeartbeatAt and firmware version', async () => {
      prisma.device.findFirst.mockResolvedValue(makeDevice());
      const now = new Date();
      prisma.device.update.mockResolvedValue({
        id: DEVICE_ID,
        lastHeartbeatAt: now,
        firmwareVersion: '2.0.0',
        status: DeviceStatus.ACTIVE,
      });

      const result = await service.heartbeat(DEVICE_ID, { firmwareVersion: '2.0.0' });

      expect(result.lastHeartbeatAt).toEqual(now);
      expect(result.firmwareVersion).toBe('2.0.0');
    });

    it('throws NotFoundException for an unknown device', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.heartbeat('unknown', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── sendCommand ───────────────────────────────────────────────────────────

  describe('sendCommand', () => {
    it('persists the command and returns queued=true', async () => {
      prisma.device.findFirst.mockResolvedValue(makeDevice());
      prisma.deviceCommand.create.mockResolvedValue({ id: 'cmd-001', command: DeviceCommandType.REBOOT, payload: null });

      const result = await service.sendCommand(DEVICE_ID, { command: DeviceCommandType.REBOOT });

      expect(result).toEqual({ queued: true, commandId: 'cmd-001' });
      expect(prisma.deviceCommand.create).toHaveBeenCalledWith({
        data: { deviceId: DEVICE_ID, command: DeviceCommandType.REBOOT, payload: undefined },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('device.command.queued', {
        deviceId: DEVICE_ID,
        commandId: 'cmd-001',
        command: DeviceCommandType.REBOOT,
        payload: null,
      });
    });

    it('throws NotFoundException for an unknown device', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.sendCommand('unknown', { command: DeviceCommandType.REBOOT }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns status fields for a known device', async () => {
      const statusRow = {
        id: DEVICE_ID,
        serialNumber: 'SN-001',
        status: DeviceStatus.ACTIVE,
        lastHeartbeatAt: null,
        firmwareVersion: null,
        ipAddress: null,
      };
      prisma.device.findFirst.mockResolvedValue(statusRow);

      await expect(service.getStatus(DEVICE_ID)).resolves.toEqual(statusRow);
    });

    it('throws NotFoundException for a missing device', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.getStatus('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── validateApiKey ────────────────────────────────────────────────────────

  describe('validateApiKey', () => {
    it('returns deviceId on a valid key', async () => {
      // Generate a SHA-256 hash of 'correct-key' to store as the mock credential.
      const keyHash = createHash('sha256').update('correct-key').digest('hex');
      prisma.deviceCredential.findUnique.mockResolvedValue({ deviceId: DEVICE_ID, keyHash });

      await expect(service.validateApiKey(DEVICE_ID, 'correct-key')).resolves.toBe(DEVICE_ID);
    });

    it('throws UnauthorizedException on a wrong key', async () => {
      const keyHash = createHash('sha256').update('correct-key').digest('hex');
      prisma.deviceCredential.findUnique.mockResolvedValue({ deviceId: DEVICE_ID, keyHash });

      await expect(service.validateApiKey(DEVICE_ID, 'wrong-key')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when no credential exists', async () => {
      prisma.deviceCredential.findUnique.mockResolvedValue(null);

      await expect(service.validateApiKey(DEVICE_ID, 'any-key')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
