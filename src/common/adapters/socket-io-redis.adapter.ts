import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ENV } from 'src/config/env';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: any;

  async connectToRedis(): Promise<void> {
    const redisUrl = ENV.REDIS_URL;
    if (!redisUrl) {
      console.log('[RedisIoAdapter] REDIS_URL not configured. WebSocket falling back to local in-memory adapter.');
      return;
    }

    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      console.log('[RedisIoAdapter] Successfully connected to Redis for WebSocket scaling.');
    } catch (err) {
      console.error('[RedisIoAdapter] Redis connection failed for WebSocket adapter. Falling back to local.', err);
    }
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
