import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/auth/auth.decorators';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@Permissions('audit:read')
export class AuditController {
  constructor(
    private readonly service: AuditService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get audit logs for the current company (tenant-scoped)' })
  @ApiOkResponse({ description: 'Array of audit logs' })
  findAll(@Query() query: AuditQueryDto) {
    const companyId = this.tenant.companyIdOrThrow();
    return this.service.findAll(companyId, query);
  }
}
