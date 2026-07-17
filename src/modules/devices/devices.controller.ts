import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import { Public, Permissions } from '../../common/auth/auth.decorators';
import { Audited } from '../../common/decorators/audit.decorator';
import { DeviceApiKeyGuard } from '../../common/guards/device-api-key.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';
import { SendDeviceCommandDto } from './dto/send-device-command.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  // ─── Admin-facing endpoints (human JWT required) ──────────────────────────

  @Post('register')
  @Permissions('devices:manage')
  @Audited({ entity: 'Device', action: 'CREATE' })
  @ApiOperation({
    summary: 'Register a new device (Company Admin / HR Manager)',
    description:
      'Provisions a device under the authenticated tenant. ' +
      'Returns a one-time API key that the device must store — it is never retrievable again.',
  })
  @ApiCreatedResponse({
    description: 'Device registered. `apiKey` is shown once only.',
    schema: {
      example: {
        device: { id: 'uuid', serialNumber: 'SN-001', type: 'FACE', status: 'ACTIVE' },
        apiKey: 'base64url-plaintext-key',
      },
    },
  })
  register(@Body() dto: RegisterDeviceDto) {
    return this.service.register(dto);
  }

  @Get()
  @Permissions('devices:read')
  @ApiOperation({ summary: 'List all devices for the current tenant' })
  @ApiQuery({ name: 'status', enum: DeviceStatus, required: false })
  @ApiOkResponse({ description: 'Array of devices (credential hash never exposed)' })
  findAll(@Query('status') status?: DeviceStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  @Permissions('devices:read')
  @ApiOperation({ summary: 'Get a device by ID' })
  @ApiOkResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('devices:manage')
  @Audited({ entity: 'Device', action: 'UPDATE' })
  @ApiOperation({ summary: 'Update device metadata (status, IP, matching mode, firmware)' })
  @ApiOkResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/commands')
  @Permissions('devices:manage')
  @Audited({ entity: 'Device', action: 'COMMAND' })
  @ApiOperation({
    summary: 'Send a command to a device',
    description:
      'Persists the command for poll-based fallback. ' +
      'Feature 6 (DeviceGateway) will also push it immediately via WebSocket if the device is connected.',
  })
  @ApiCreatedResponse({ description: 'Command queued', schema: { example: { queued: true, commandId: 'uuid' } } })
  sendCommand(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendDeviceCommandDto,
  ) {
    return this.service.sendCommand(id, dto);
  }

  @Get(':id/status')
  @Permissions('devices:read')
  @ApiOperation({ summary: 'Get current device status and last heartbeat timestamp' })
  @ApiOkResponse()
  getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStatus(id);
  }

  // ─── Device-facing endpoints (machine API key required) ───────────────────

  @Post(':id/heartbeat')
  @Public()
  @UseGuards(DeviceApiKeyGuard)
  @ApiOperation({
    summary: 'Device heartbeat — authenticated via X-Device-Api-Key',
    description:
      'Called periodically by the physical device to signal it is online. ' +
      'Updates lastHeartbeatAt and optionally refreshes firmware version and IP address. ' +
      'This endpoint uses machine-credential auth, NOT human JWTs.',
  })
  @ApiHeader({
    name: 'X-Device-Api-Key',
    description: 'Device API key issued at registration',
    required: true,
  })
  @ApiOkResponse({
    description: 'Heartbeat acknowledged',
    schema: { example: { id: 'uuid', lastHeartbeatAt: '2026-07-17T07:00:00.000Z', status: 'ACTIVE' } },
  })
  heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeviceHeartbeatDto,
  ) {
    return this.service.heartbeat(id, dto);
  }
}
