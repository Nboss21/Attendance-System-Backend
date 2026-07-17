import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
@Injectable()
export class EmployeesService {
 constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContextService) {}
 private companyId() { return this.tenant.companyIdOrThrow(); }
 private scope() { return { companyId: this.companyId() }; }
 private async ensureReferences(dto: any) { const companyId = this.companyId(); for (const [model, id] of [['branch', dto.branchId], ['department', dto.departmentId], ['position', dto.positionId]] as const) if (id && !await (this.prisma as any)[model].findFirst({ where: { id, companyId } })) throw new BadRequestException(`${model} does not belong to this company`); }
 async create(dto: CreateEmployeeDto) { await this.ensureReferences(dto); return this.prisma.employee.create({ data: { ...dto, ...this.scope(), hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined } }); }
 findAll(status?: EmployeeStatus) { return this.prisma.employee.findMany({ where: { ...this.scope(), ...(status ? { status } : {}) }, include: { department: true, position: true, branch: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }); }
 async findOne(id: string) { const employee = await this.prisma.employee.findFirst({ where: { id, ...this.scope() }, include: { department: true, position: true, branch: true } }); if (!employee) throw new NotFoundException('Employee not found'); return employee; }
 async update(id: string, dto: UpdateEmployeeDto) { await this.findOne(id); await this.ensureReferences(dto); const data: any = { ...dto, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined }; if (dto.status === EmployeeStatus.TERMINATED) data.terminatedAt = new Date(); if (dto.status === EmployeeStatus.ACTIVE) data.terminatedAt = null; return this.prisma.employee.update({ where: { id }, data }); }
 async remove(id: string) { const employee = await this.findOne(id); if (employee.status !== EmployeeStatus.TERMINATED) throw new ForbiddenException('Only terminated employees may be deleted'); await this.prisma.employee.delete({ where: { id } }); return { success: true }; }
 async bulkImport(csv: string) { const lines = csv.trim().split(/\r?\n/); if (!lines.length) throw new BadRequestException('CSV is empty'); const headers = lines.shift()!.split(',').map(x => x.trim()); const required = ['employeeCode', 'firstName', 'lastName']; if (required.some(key => !headers.includes(key))) throw new BadRequestException('CSV must include employeeCode, firstName, lastName'); const results: any[] = []; for (const [index, line] of lines.entries()) { if (!line.trim()) continue; const row = Object.fromEntries(line.split(',').map((value, i) => [headers[i], value.trim()])); try { results.push({ row: index + 2, employee: await this.create(row as unknown as CreateEmployeeDto) }); } catch (error: any) { results.push({ row: index + 2, error: error.message }); } } return { imported: results.filter(r => r.employee).length, failed: results.filter(r => r.error).length, results }; }
}
