import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';

@Injectable()
export class BiometricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Enroll or re-enroll a face template for an employee.
   * If a previous template exists it is replaced (upsert).
   */
  async enroll(employeeId: string, dto: EnrollBiometricDto) {
    const companyId = this.tenant.companyIdOrThrow();

    // Verify the employee belongs to this tenant
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found in this tenant`);
    }

    const template = await this.prisma.employeeBiometricTemplate.upsert({
      where: { employeeId },
      create: {
        employeeId,
        embeddingData: dto.embeddingData,
        modelVersion: dto.modelVersion ?? 'v1',
      },
      update: {
        embeddingData: dto.embeddingData,
        modelVersion: dto.modelVersion ?? 'v1',
        updatedAt: new Date(),
      },
    });

    return {
      status: 'success',
      message: 'Face registered successfully',
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      templateId: template.id,
      enrolledAt: template.enrolledAt,
      modelVersion: template.modelVersion,
    };
  }

  /**
   * Retrieve the biometric template for an employee (metadata only, no raw data).
   */
  async getTemplate(employeeId: string) {
    const companyId = this.tenant.companyIdOrThrow();

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found in this tenant`);
    }

    const template = await this.prisma.employeeBiometricTemplate.findUnique({
      where: { employeeId },
      select: { id: true, modelVersion: true, enrolledAt: true, updatedAt: true },
    });

    return {
      enrolled: !!template,
      ...(template ?? {}),
    };
  }

  /**
   * Remove a biometric template (e.g. on employee termination or GDPR request).
   */
  async deleteTemplate(employeeId: string) {
    const companyId = this.tenant.companyIdOrThrow();

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    await this.prisma.employeeBiometricTemplate.deleteMany({ where: { employeeId } });

    return { status: 'success', message: 'Biometric template deleted' };
  }

  /**
   * List all enrolled employees for the current tenant.
   * Useful for the admin dashboard enrollment status view.
   */
  async listEnrolled() {
    const companyId = this.tenant.companyIdOrThrow();

    const templates = await this.prisma.employeeBiometricTemplate.findMany({
      where: { employee: { companyId } },
      select: {
        id: true,
        modelVersion: true,
        enrolledAt: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });

    return templates;
  }
}
