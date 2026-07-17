import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard for device-facing endpoints (heartbeat).
 * Devices are machine identities — they are never issued human JWTs.
 * Authentication is via a static API key generated at registration,
 * passed as the `X-Device-Api-Key` request header.
 *
 * The key is SHA-256 hashed before comparison so the plaintext never
 * touches the database.
 *
 * Apply this guard at the method level alongside @Public() so that
 * JwtAuthGuard is bypassed for these device-only routes.
 */
@Injectable()
export class DeviceApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ params: { id?: string }; device?: { id: string } }>();
    const rawKey = (context.switchToHttp().getRequest().headers as Record<string, string>)[
      'x-device-api-key'
    ];

    if (!rawKey) {
      throw new UnauthorizedException('X-Device-Api-Key header is required');
    }

    // The device id comes from the route param :id
    const deviceId = req.params?.id;
    if (!deviceId) {
      throw new UnauthorizedException('Device id is required');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const credential = await this.prisma.deviceCredential.findUnique({
      where: { deviceId },
      include: { device: { select: { id: true, status: true, companyId: true } } },
    });

    if (!credential || credential.keyHash !== keyHash) {
      throw new UnauthorizedException('Invalid device API key');
    }

    // Attach the authenticated device to the request so downstream
    // handlers and the TenantMiddleware can use it if needed.
    req.device = { id: credential.device.id };

    return true;
  }
}
