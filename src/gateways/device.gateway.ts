import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { DevicesService } from '../modules/devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real-time WebSocket Gateway for device connections.
 * namespace: '/devices'
 *
 * Devices authenticate during handshake by supplying deviceId and apiKey.
 * Active devices are grouped into rooms labeled `device:<deviceId>` to allow targeted command pushes.
 */
@WebSocketGateway({
  namespace: '/devices',
  cors: { origin: '*' },
})
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Internal mapping of deviceId -> socketId
  private readonly connectedDevices = new Map<string, string>();

  constructor(
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticates connecting device via handshake query or auth parameters.
   */
  async handleConnection(client: Socket) {
    const deviceId =
      (client.handshake.query.deviceId as string) || (client.handshake.auth?.deviceId as string);
    const apiKey =
      (client.handshake.query.apiKey as string) || (client.handshake.auth?.apiKey as string);

    if (!deviceId || !apiKey) {
      console.warn(`[DeviceGateway] Rejected connection: Credentials missing for socket ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      // Authenticate device API key
      await this.devicesService.validateApiKey(deviceId, apiKey);

      // Record first heartbeat to update DB status
      await this.devicesService.heartbeat(deviceId, {});

      // Join targeted device room
      const room = `device:${deviceId}`;
      await client.join(room);

      this.connectedDevices.set(deviceId, client.id);
      console.log(`[DeviceGateway] Device ${deviceId} connected and authenticated on socket ${client.id}`);
    } catch (err: any) {
      console.warn(`[DeviceGateway] Rejected device ${deviceId} on socket ${client.id}:`, err.message);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [deviceId, socketId] of this.connectedDevices.entries()) {
      if (socketId === client.id) {
        this.connectedDevices.delete(deviceId);
        console.log(`[DeviceGateway] Device ${deviceId} disconnected`);
        break;
      }
    }
  }

  /**
   * Listen for incoming heartbeat checks over WebSocket.
   */
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { firmwareVersion?: string; ipAddress?: string },
  ) {
    const deviceId = this.getDeviceId(client);
    if (!deviceId) return { success: false, error: 'Unauthorized' };

    try {
      await this.devicesService.heartbeat(deviceId, data || {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Listen for device command receipts and mark them as delivered.
   */
  @SubscribeMessage('command_ack')
  async handleCommandAck(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { commandId: string },
  ) {
    const deviceId = this.getDeviceId(client);
    if (!deviceId) return { success: false, error: 'Unauthorized' };

    try {
      await this.prisma.deviceCommand.updateMany({
        where: {
          id: data.commandId,
          deviceId,
          sentAt: null,
        },
        data: {
          sentAt: new Date(),
        },
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Event listener routing queued commands directly to device rooms.
   */
  @OnEvent('device.command.queued')
  handleCommandQueued(event: {
    deviceId: string;
    commandId: string;
    command: string;
    payload?: any;
  }) {
    const room = `device:${event.deviceId}`;
    this.server.to(room).emit('command', {
      commandId: event.commandId,
      command: event.command,
      payload: event.payload,
    });
    console.log(`[DeviceGateway] Pushed command ${event.command} (${event.commandId}) to room ${room}`);
  }

  private getDeviceId(client: Socket): string | null {
    for (const [deviceId, socketId] of this.connectedDevices.entries()) {
      if (socketId === client.id) {
        return deviceId;
      }
    }
    return null;
  }
}
