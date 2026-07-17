import { DeviceGateway } from './device.gateway';

const DEVICE_ID = 'device-123';
const SOCKET_ID = 'socket-abc';

function makeDevicesService() {
  return {
    validateApiKey: jest.fn(),
    heartbeat: jest.fn(),
  };
}

function makePrismaService() {
  return {
    deviceCommand: {
      updateMany: jest.fn(),
    },
  };
}

function makeSocket(query: Record<string, string> = {}) {
  return {
    id: SOCKET_ID,
    handshake: {
      query,
      auth: {},
    },
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

describe('DeviceGateway', () => {
  let gateway: DeviceGateway;
  let devicesService: ReturnType<typeof makeDevicesService>;
  let prisma: ReturnType<typeof makePrismaService>;

  beforeEach(() => {
    devicesService = makeDevicesService();
    prisma = makePrismaService();
    gateway = new DeviceGateway(devicesService as any, prisma as any);
  });

  describe('handleConnection', () => {
    it('authenticates and registers device connection room on valid key', async () => {
      const socket = makeSocket({ deviceId: DEVICE_ID, apiKey: 'valid-key' });
      devicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
      devicesService.heartbeat.mockResolvedValue({});

      await gateway.handleConnection(socket as any);

      expect(devicesService.validateApiKey).toHaveBeenCalledWith(DEVICE_ID, 'valid-key');
      expect(devicesService.heartbeat).toHaveBeenCalledWith(DEVICE_ID, {});
      expect(socket.join).toHaveBeenCalledWith(`device:${DEVICE_ID}`);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('rejects connection if credentials are missing', async () => {
      const socket = makeSocket({}); // empty query params

      await gateway.handleConnection(socket as any);

      expect(devicesService.validateApiKey).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects connection on validation failure', async () => {
      const socket = makeSocket({ deviceId: DEVICE_ID, apiKey: 'wrong-key' });
      devicesService.validateApiKey.mockRejectedValue(new Error('Auth failed'));

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleHeartbeat', () => {
    it('returns success: true and triggers heartbeat in service', async () => {
      // Connect first to populate mapping
      const socket = makeSocket({ deviceId: DEVICE_ID, apiKey: 'valid-key' });
      devicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
      await gateway.handleConnection(socket as any);

      devicesService.heartbeat.mockResolvedValue({});

      const res = await gateway.handleHeartbeat(socket as any, { firmwareVersion: '1.2.3' });

      expect(res).toEqual({ success: true });
      expect(devicesService.heartbeat).toHaveBeenCalledWith(DEVICE_ID, { firmwareVersion: '1.2.3' });
    });
  });

  describe('handleCommandAck', () => {
    it('calls prisma.deviceCommand.updateMany to flag command receipt', async () => {
      const socket = makeSocket({ deviceId: DEVICE_ID, apiKey: 'valid-key' });
      devicesService.validateApiKey.mockResolvedValue(DEVICE_ID);
      await gateway.handleConnection(socket as any);

      prisma.deviceCommand.updateMany.mockResolvedValue({ count: 1 });

      const res = await gateway.handleCommandAck(socket as any, { commandId: 'cmd-999' });

      expect(res).toEqual({ success: true });
      expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'cmd-999',
          deviceId: DEVICE_ID,
          sentAt: null,
        },
        data: {
          sentAt: expect.any(Date),
        },
      });
    });
  });

  describe('handleCommandQueued', () => {
    it('emits command payload over WebSocket server to device room', () => {
      const mockServer = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      gateway.server = mockServer as any;

      gateway.handleCommandQueued({
        deviceId: DEVICE_ID,
        commandId: 'cmd-555',
        command: 'SYNC_TEMPLATES',
        payload: { size: 10 },
      });

      expect(mockServer.to).toHaveBeenCalledWith(`device:${DEVICE_ID}`);
      expect(mockServer.emit).toHaveBeenCalledWith('command', {
        commandId: 'cmd-555',
        command: 'SYNC_TEMPLATES',
        payload: { size: 10 },
      });
    });
  });
});
