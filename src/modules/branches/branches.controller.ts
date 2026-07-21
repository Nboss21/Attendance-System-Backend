import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@ApiTags('branches')
@Controller('companies/:companyId/branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) { }

  @Post()
  @ApiOperation({ summary: 'Create a branch in the authenticated tenant' })
  @ApiCreatedResponse()
  create(@Param('companyId') companyId: string, @Body() dto: CreateBranchDto) {
    return this.service.create(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List branches in the authenticated tenant' })
  @ApiOkResponse()
  findAll(@Param('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }
}
