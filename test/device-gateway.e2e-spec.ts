import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { io, Socket } from 'socket.io-client';
import { DeviceGateway } from '../src/gateways/device.gateway';
import { DevicesService } from '../src/modules/devices/devices.service';
import { PrismaService } from '../src/prisma/prisma.service';

const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const API_KEY = 'valid-machine-api-key';

const mockDevicesService = {
  validateApiKey: jest.fn(),
  heartbeat: jest.fn(),
};

const mockPrismaService = {
  deviceCommand: {
    updateMany: jest.fn(),
  },
};

describe('DeviceGateway (E2E WebSockets)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let socket: Socket;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        DeviceGateway,
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0); // dynamic port assignment
    const address = app.getHttpServer().address();
    port = typeof address === 'string' ? 3000 : address.port;

    eventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  });

  it('rejects connection if no credentials are provided', (done) => {
    socket = io(`http://localhost:${port}/devices`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    socket.on('disconnect', () => {
      done();
    });

    socket.connect();
  });

  it('accepts connection and authentication with valid query params', (done) => {
    mockDevicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
    mockDevicesService.heartbeat.mockResolvedValue({});

    socket = io(`http://localhost:${port}/devices`, {
      transports: ['websocket'],
      query: { deviceId: DEVICE_ID, apiKey: API_KEY },
      autoConnect: false,
    });

    socket.on('connect', () => {
      expect(mockDevicesService.validateApiKey).toHaveBeenCalledWith(DEVICE_ID, API_KEY);
      expect(mockDevicesService.heartbeat).toHaveBeenCalledWith(DEVICE_ID, {});
      done();
    });

    socket.connect();
  });

  it('receives command when eventEmitter fires device.command.queued', (done) => {
    mockDevicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
    mockDevicesService.heartbeat.mockResolvedValue({});

    socket = io(`http://localhost:${port}/devices`, {
      transports: ['websocket'],
      query: { deviceId: DEVICE_ID, apiKey: API_KEY },
      autoConnect: false,
    });

    socket.on('connect', () => {
      eventEmitter.emit('device.command.queued', {
        deviceId: DEVICE_ID,
        commandId: 'cmd-111',
        command: 'SYNC_TEMPLATES',
        payload: { test: true },
      });
    });

    socket.on('command', (data: any) => {
      expect(data).toEqual({
        commandId: 'cmd-111',
        command: 'SYNC_TEMPLATES',
        payload: { test: true },
      });
      done();
    });

    socket.connect();
  });

  it('sends heartbeat over socket and receives acknowledgement', (done) => {
    mockDevicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
    mockDevicesService.heartbeat.mockResolvedValue({});

    socket = io(`http://localhost:${port}/devices`, {
      transports: ['websocket'],
      query: { deviceId: DEVICE_ID, apiKey: API_KEY },
      autoConnect: false,
    });

    socket.on('connect', () => {
      socket.emit('heartbeat', { firmwareVersion: '2.0.1' }, (ack: any) => {
        expect(ack).toEqual({ success: true });
        expect(mockDevicesService.heartbeat).toHaveBeenLastCalledWith(DEVICE_ID, {
          firmwareVersion: '2.0.1',
        });
        done();
      });
    });

    socket.connect();
  });

  it('sends command_ack over socket and flags database command row', (done) => {
    mockDevicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
    mockDevicesService.heartbeat.mockResolvedValue({});
    mockPrismaService.deviceCommand.updateMany.mockResolvedValue({ count: 1 });

    socket = io(`http://localhost:${port}/devices`, {
      transports: ['websocket'],
      query: { deviceId: DEVICE_ID, apiKey: API_KEY },
      autoConnect: false,
    });

    socket.on('connect', () => {
      socket.emit('command_ack', { commandId: 'cmd-777' }, (ack: any) => {
        expect(ack).toEqual({ success: true });
        expect(mockPrismaService.deviceCommand.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'cmd-777',
            deviceId: DEVICE_ID,
            sentAt: null,
          },
          data: {
            sentAt: expect.any(Date),
          },
        });
        done();
      });
    });

    socket.connect();
  });
});
