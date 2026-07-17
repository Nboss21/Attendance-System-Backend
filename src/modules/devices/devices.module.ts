import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceApiKeyGuard } from '../../common/guards/device-api-key.guard';
import { DeviceGateway } from '../../gateways/device.gateway';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DeviceApiKeyGuard, DeviceGateway],
  exports: [DevicesService],
})
export class DevicesModule {}
