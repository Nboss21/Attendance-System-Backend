import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/auth.decorators';
import { ProvisionCompanyDto } from './dto/provision-company.dto';
import { UpdateSuperAdminCompanyDto } from './dto/update-super-admin-company.dto';
import { DeviceHealthQueryDto } from './dto/device-health-query.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('super-admin')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  // ── Company provisioning ──────────────────────────────────────────────────

  @Post('companies')
  @ApiOperation({
    summary: 'Provision a new company and its first admin user',
    description:
      'Creates the company and the initial COMPANY_ADMIN in one atomic transaction. ' +
      'The plain-text password is hashed before storage — it is not stored.',
  })
  @ApiCreatedResponse({ description: 'Company provisioned successfully' })
  provisionCompany(@Body() dto: ProvisionCompanyDto) {
    return this.service.provisionCompany(dto);
  }

  @Get('companies')
  @ApiOperation({ summary: 'List all companies (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated list of companies with aggregate counts' })
  listCompanies(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listCompanies(page, limit);
  }

  @Get('companies/:id')
  @ApiOperation({ summary: 'Get a company by ID with aggregate counts' })
  @ApiOkResponse()
  getCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCompany(id);
  }

  @Patch('companies/:id')
  @ApiOperation({ summary: 'Update company plan, status, or settings' })
  @ApiOkResponse()
  updateCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSuperAdminCompanyDto,
  ) {
    return this.service.updateCompany(id, dto);
  }

  // ── Device health ─────────────────────────────────────────────────────────

  @Get('devices/health')
  @ApiOperation({
    summary: 'Platform-wide device health snapshot',
    description:
      'Returns per-company counts of online / offline / maintenance devices. ' +
      'A device is considered online if its last heartbeat is within the threshold window.',
  })
  @ApiOkResponse()
  deviceHealth(@Query() query: DeviceHealthQueryDto) {
    return this.service.listDeviceHealth(query);
  }

  // ── Impersonation ─────────────────────────────────────────────────────────

  @Post('companies/:id/impersonate')
  @ApiOperation({
    summary: 'Generate an impersonation token for the target company',
    description:
      'Returns a 15-minute access token scoped to the target company as COMPANY_ADMIN. ' +
      'Every call is written to AuditLog. The token cannot be refreshed.',
  })
  @ApiCreatedResponse({
    description: 'Impersonation token',
    schema: {
      example: {
        accessToken: 'eyJ...',
        tokenType: 'Bearer',
        expiresIn: 900,
        impersonating: { companyId: 'uuid', companyName: 'Acme Corp' },
      },
    },
  })
  impersonate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    return this.service.impersonate(id, req.user);
  }
}
