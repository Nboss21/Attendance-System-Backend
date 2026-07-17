import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../common/auth/password.service';
import { JwtService } from '../../common/auth/jwt.service';
import { AuditService } from '../audit/audit.service';
import { ProvisionCompanyDto } from './dto/provision-company.dto';
import { UpdateSuperAdminCompanyDto } from './dto/update-super-admin-company.dto';
import { DeviceHealthQueryDto } from './dto/device-health-query.dto';

const IMPERSONATION_TTL_SECONDS = 15 * 60; // 15 minutes

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Provision a new company and its first COMPANY_ADMIN user atomically.
   */
  async provisionCompany(dto: ProvisionCompanyDto) {
    const existingCode = await this.prisma.company.findUnique({ where: { code: dto.code } });
    if (existingCode) {
      throw new BadRequestException(`Company code "${dto.code}" is already taken`);
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.adminEmail } });
    if (existingEmail) {
      throw new BadRequestException(`Email "${dto.adminEmail}" is already in use`);
    }

    const passwordHash = await this.passwords.hash(dto.adminPassword);

    const company = await this.prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name: dto.name,
          code: dto.code,
          plan: dto.plan,
        },
      });

      await tx.user.create({
        data: {
          companyId: newCompany.id,
          email: dto.adminEmail,
          passwordHash,
          role: 'COMPANY_ADMIN',
        },
      });

      return newCompany;
    });

    await this.auditService.logAction({
      action: 'PROVISION',
      entity: 'Company',
      entityId: company.id,
      after: { name: company.name, code: company.code },
    });

    return company;
  }

  /**
   * Paginated list of all companies with tenant aggregates.
   */
  async listCompanies(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { employees: true, devices: true, users: true },
          },
        },
      }),
      this.prisma.company.count(),
    ]);
    return { data: companies, total, page, limit };
  }

  /**
   * Single company detail with full aggregate counts.
   */
  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: { employees: true, devices: true, users: true, branches: true },
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Update company plan, status, or settings.
   */
  async updateCompany(id: string, dto: UpdateSuperAdminCompanyDto) {
    await this.getCompany(id); // assert exists
    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings as any } : {}),
      },
    });
    await this.auditService.logAction({
      action: 'UPDATE',
      entity: 'Company',
      entityId: id,
      after: dto as any,
    });
    return updated;
  }

  /**
   * Platform-wide device health dashboard.
   * Returns per-company counts: total, online (recent heartbeat), offline, maintenance.
   */
  async listDeviceHealth(query: DeviceHealthQueryDto) {
    const thresholdMinutes = query.heartbeatThresholdMinutes ?? 5;
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const companies = await this.prisma.company.findMany({
      where: query.companyId ? { id: query.companyId } : undefined,
      select: {
        id: true,
        name: true,
        code: true,
        devices: {
          select: {
            id: true,
            status: true,
            lastHeartbeatAt: true,
          },
        },
      },
    });

    return companies.map((company) => {
      const total = company.devices.length;
      const maintenance = company.devices.filter((d) => d.status === 'MAINTENANCE').length;
      const online = company.devices.filter(
        (d) => d.status === 'ACTIVE' && d.lastHeartbeatAt && d.lastHeartbeatAt >= cutoff,
      ).length;
      const offline = total - online - maintenance;

      return {
        companyId: company.id,
        companyName: company.name,
        companyCode: company.code,
        devices: { total, online, offline, maintenance },
      };
    });
  }

  /**
   * Generate a short-lived impersonation JWT for a company admin user.
   * Every call is audited in AuditLog.
   *
   * @param companyId  Target tenant to impersonate within.
   * @param superAdmin The SUPER_ADMIN making the request (from JwtAuthGuard).
   */
  async impersonate(companyId: string, superAdmin: { id: string; email: string }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    if (company.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot impersonate an inactive company');
    }

    // Craft an impersonation token — note it uses role COMPANY_ADMIN within the target tenant.
    const impersonationToken = this.jwt.sign(
      {
        id: superAdmin.id,
        email: superAdmin.email,
        companyId,
        role: 'COMPANY_ADMIN' as any,
      },
      IMPERSONATION_TTL_SECONDS,
    );

    // Mandatory audit trail
    await this.auditService.logAction({
      companyId,
      actorId: superAdmin.id,
      action: 'IMPERSONATE',
      entity: 'Company',
      entityId: companyId,
      after: { impersonatedBy: superAdmin.email, targetCompanyId: companyId },
    });

    return {
      accessToken: impersonationToken,
      tokenType: 'Bearer',
      expiresIn: IMPERSONATION_TTL_SECONDS,
      impersonating: { companyId, companyName: company.name },
    };
  }
}
