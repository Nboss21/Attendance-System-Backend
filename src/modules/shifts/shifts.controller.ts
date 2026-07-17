import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../../common/auth/auth.decorators';
import { Audited } from '../../common/decorators/audit.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto, ScheduleQueryDto, UpdateAssignmentDto } from './dto/assign-shift.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  // ─── Shift CRUD ───────────────────────────────────────────────────────────

  @Post()
  @Permissions('shifts:manage')
  @Audited({ entity: 'Shift', action: 'CREATE' })
  @ApiOperation({ summary: 'Create a shift in the authenticated tenant' })
  @ApiCreatedResponse()
  create(@Body() dto: CreateShiftDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('shifts:read')
  @ApiOperation({ summary: 'List shifts in the authenticated tenant' })
  @ApiOkResponse()
  findAll() {
    return this.service.findAll();
  }

  @Get('schedule')
  @Permissions('shifts:read')
  @ApiOperation({
    summary: 'Query schedule assignments',
    description: 'Filter by date window (`from`/`to`, inclusive), employee, and/or shift.',
  })
  @ApiOkResponse()
  findAssignments(@Query() query: ScheduleQueryDto) {
    return this.service.findAssignments(query);
  }

  @Get(':id')
  @Permissions('shifts:read')
  @ApiOperation({ summary: 'Get a single shift' })
  @ApiOkResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('shifts:manage')
  @Audited({ entity: 'Shift', action: 'UPDATE' })
  @ApiOperation({ summary: 'Update a shift' })
  @ApiOkResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('shifts:manage')
  @Audited({ entity: 'Shift', action: 'DELETE' })
  @ApiOperation({
    summary: 'Delete a shift',
    description: 'Cascades to all of its schedule assignments.',
  })
  @ApiOkResponse()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // ─── Schedule assignments ─────────────────────────────────────────────────

  @Post(':id/assignments')
  @Permissions('shifts:manage')
  @Audited({ entity: 'ScheduleAssignment', action: 'CREATE' })
  @ApiOperation({
    summary: 'Assign employees to a shift over a date range',
    description:
      'Creates one assignment per employee per day (inclusive range). ' +
      'Existing assignments on those days are re-pointed to this shift, ' +
      'so the call is idempotent and safe for re-planning.',
  })
  @ApiCreatedResponse({ schema: { example: { assigned: 14, employees: 2, days: 7 } } })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignShiftDto) {
    return this.service.assign(id, dto);
  }

  @Patch('assignments/:assignmentId')
  @Permissions('shifts:manage')
  @Audited({ entity: 'ScheduleAssignment', action: 'UPDATE' })
  @ApiOperation({ summary: 'Update an assignment (cancel, mark swapped, or move shift)' })
  @ApiOkResponse()
  updateAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.service.updateAssignment(assignmentId, dto);
  }

  @Delete('assignments/:assignmentId')
  @Permissions('shifts:manage')
  @Audited({ entity: 'ScheduleAssignment', action: 'DELETE' })
  @ApiOperation({ summary: 'Delete an assignment' })
  @ApiOkResponse()
  removeAssignment(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.service.removeAssignment(assignmentId);
  }
}
