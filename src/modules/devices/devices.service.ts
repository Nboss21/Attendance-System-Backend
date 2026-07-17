import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomBytes } from 'node:crypto';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';
import { SendDeviceCommandDto } from './dto/send-device-command.dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Private helpers ──────────────────────────────────────────────────────

  private companyId() {
    return this.tenant.companyIdOrThrow();
  }

  private hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Asserts the device exists and belongs to this tenant. */
  private async assertOwned(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, companyId: this.companyId() },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  private stripCredential<T extends { credential?: unknown }>(device: T): Omit<T, 'credential'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { credential, ...rest } = device as any;
    return rest;
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /**
   * Register a new device under the authenticated tenant.
   * Generates a one-time plain-text API key; stores only its SHA-256 hash.
   * The plain key is returned exactly once and must be stored by the caller.
   */
  async register(dto: RegisterDeviceDto) {
    const companyId = this.companyId();

    // Guard: serial number must be globally unique (enforced by schema unique constraint),
    // but give a friendly message instead of letting Postgres throw.
    const existing = await this.prisma.device.findUnique({
      where: { serialNumber: dto.serialNumber },
    });
    if (existing) {
      throw new BadRequestException(
        `A device with serial number "${dto.serialNumber}" is already registered`,
      );
    }

    // Validate branchId belongs to this tenant if provided.
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId },
      });
      if (!branch) throw new BadRequestException('branchId does not belong to this company');
    }

    const plainApiKey = randomBytes(32).toString('base64url');

    const device = await this.prisma.device.create({
      data: {
        companyId,
        branchId: dto.branchId,
        serialNumber: dto.serialNumber,
        type: dto.type,
        ipAddress: dto.ipAddress,
        matchingMode: dto.matchingMode,
        firmwareVersion: dto.firmwareVersion,
        credential: {
          create: { keyHash: this.hashKey(plainApiKey) },
        },
      },
      include: { branch: true, credential: false },
    });

    return { device, apiKey: plainApiKey };
  }

  /** List all devices for the current tenant, optionally filtered by status. */
  findAll(status?: DeviceStatus) {
    return this.prisma.device.findMany({
      where: {
        companyId: this.companyId(),
        ...(status ? { status } : {}),
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get a single device (tenant-scoped). */
  async findOne(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, companyId: this.companyId() },
      include: { branch: { select: { id: true, name: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  /** Update device metadata (status, IP, matching mode, firmware). */
  async update(id: string, dto: UpdateDeviceDto) {
    await this.assertOwned(id);
    return this.prisma.device.update({
      where: { id },
      data: dto,
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /**
   * Record a heartbeat from the device.
   * Authentication happens in DeviceApiKeyGuard — by the time this method runs,
   * `deviceId` has already been validated against the credential store.
   * We still assert tenant ownership as a second layer of defence.
   */
  async heartbeat(id: string, dto: DeviceHeartbeatDto) {
    await this.assertOwned(id);
    return this.prisma.device.update({
      where: { id },
      data: {
        lastHeartbeatAt: new Date(),
        ...(dto.firmwareVersion !== undefined ? { firmwareVersion: dto.firmwareVersion } : {}),
        ...(dto.ipAddress !== undefined ? { ipAddress: dto.ipAddress } : {}),
      },
      select: { id: true, lastHeartbeatAt: true, firmwareVersion: true, status: true },
    });
  }

  /**
   * Queue a command to be delivered to the device.
   * Commands are persisted in DeviceCommand for poll-based fallback;
   * Feature 6 (DeviceGateway) will also push them over WebSocket.
   */
  async sendCommand(id: string, dto: SendDeviceCommandDto) {
    await this.assertOwned(id);
    const command = await this.prisma.deviceCommand.create({
      data: {
        deviceId: id,
        command: dto.command,
        payload: dto.payload as any,
      },
    });
    this.eventEmitter.emit('device.command.queued', {
      deviceId: id,
      commandId: command.id,
      command: command.command,
      payload: command.payload,
    });
    return { queued: true, commandId: command.id };
  }

  /** Returns current status + last heartbeat timestamp for a device. */
  async getStatus(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, companyId: this.companyId() },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        lastHeartbeatAt: true,
        firmwareVersion: true,
        ipAddress: true,
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  /**
   * Validate a raw API key against a device's stored credential.
   * Used by DeviceApiKeyGuard — returns the deviceId on success.
   */
  async validateApiKey(deviceId: string, rawKey: string): Promise<string> {
    const credential = await this.prisma.deviceCredential.findUnique({
      where: { deviceId },
    });
    if (!credential || credential.keyHash !== this.hashKey(rawKey)) {
      throw new UnauthorizedException('Invalid device API key');
    }
    return deviceId;
  }
}
