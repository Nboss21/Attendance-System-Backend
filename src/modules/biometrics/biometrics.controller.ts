import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { BiometricsService } from './biometrics.service';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';

@ApiTags('biometrics')
@ApiBearerAuth()
@Controller('employees/:employeeId/biometrics')
export class BiometricsController {
  constructor(private readonly service: BiometricsService) {}

  /**
   * POST /api/v1/employees/:employeeId/biometrics/enroll
   *
   * Mobile app enrollment flow:
   * 1. Capture 5 face images from different angles.
   * 2. Send as a JSON array of base64 strings in embeddingData.
   * 3. Backend stores the template and returns a success response.
   *
   * Response matches the Flutter PRD registration contract:
   * { status: "success", message: "Face registered successfully" }
   */
  @Post('enroll')
  @Permissions('biometrics:manage')
  @Audited({ entity: 'EmployeeBiometricTemplate', action: 'CREATE' })
  @ApiOperation({
    summary: 'Enroll or re-enroll a face template for an employee',
    description:
      'Accepts base64-encoded face image data (or embedding vector) for the given employee. ' +
      'If a template already exists it is replaced. ' +
      'Response: { status, message, employeeName, templateId, enrolledAt }',
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        status: 'success',
        message: 'Face registered successfully',
        employeeId: 'uuid',
        employeeName: 'John Doe',
        templateId: 'uuid',
        enrolledAt: '2026-07-21T08:00:00.000Z',
        modelVersion: 'v1',
      },
    },
  })
  enroll(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: EnrollBiometricDto,
  ) {
    return this.service.enroll(employeeId, dto);
  }

  @Get()
  @Permissions('biometrics:read')
  @ApiOperation({ summary: 'Get biometric enrollment status for an employee' })
  @ApiOkResponse()
  getTemplate(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.service.getTemplate(employeeId);
  }

  @Delete()
  @Permissions('biometrics:manage')
  @Audited({ entity: 'EmployeeBiometricTemplate', action: 'DELETE' })
  @ApiOperation({ summary: 'Delete the biometric template for an employee (GDPR / termination)' })
  @ApiOkResponse()
  deleteTemplate(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.service.deleteTemplate(employeeId);
  }
}

/** Separate flat controller for listing all enrolled employees (admin view) */
@ApiTags('biometrics')
@ApiBearerAuth()
@Controller('biometrics')
export class BiometricsListController {
  constructor(private readonly service: BiometricsService) {}

  @Get('enrolled')
  @Permissions('biometrics:read')
  @ApiOperation({ summary: 'List all employees with enrolled biometric templates' })
  @ApiOkResponse()
  listEnrolled() {
    return this.service.listEnrolled();
  }
}
