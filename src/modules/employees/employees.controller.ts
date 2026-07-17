import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { Permissions } from '../../common/auth/auth.decorators';
import { Audited } from '../../common/decorators/audit.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
@Permissions('employees:manage')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Post()
  @Audited({ entity: 'Employee', action: 'CREATE' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Get()
  all(@Query('status') status?: EmployeeStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Audited({ entity: 'Employee', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Audited({ entity: 'Employee', action: 'DELETE' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('import/csv')
  @Audited({ entity: 'Employee', action: 'IMPORT' })
  importCsv(@Body('csv') csv: string) {
    return this.service.bulkImport(csv);
  }
}
