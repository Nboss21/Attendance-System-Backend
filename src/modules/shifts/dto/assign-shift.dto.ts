import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AssignmentStatus } from "@prisma/client";
import {
	ArrayNotEmpty,
	IsArray,
	IsEnum,
	IsISO8601,
	IsOptional,
	IsUUID,
} from "class-validator";

export class AssignShiftDto {
	@ApiProperty({
		type: [String],
		description: "Employees to assign to the shift",
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsUUID(undefined, { each: true })
	employeeIds!: string[];

	@ApiProperty({
		example: "2026-07-20",
		description: "First day of the assignment (inclusive)",
	})
	@IsISO8601({ strict: true })
	from!: string;

	@ApiPropertyOptional({
		example: "2026-07-26",
		description:
			"Last day of the assignment (inclusive). Defaults to `from` (single day).",
	})
	@IsOptional()
	@IsISO8601({ strict: true })
	to?: string;
}

export class UpdateAssignmentDto {
	@ApiPropertyOptional({ enum: AssignmentStatus })
	@IsOptional()
	@IsEnum(AssignmentStatus)
	status?: AssignmentStatus;

	@ApiPropertyOptional({
		description: "Move the assignment to a different shift",
	})
	@IsOptional()
	@IsUUID()
	shiftId?: string;
}

export class ScheduleQueryDto {
	@ApiPropertyOptional({
		example: "2026-07-20",
		description: "Start of the date window (inclusive)",
	})
	@IsOptional()
	@IsISO8601({ strict: true })
	from?: string;

	@ApiPropertyOptional({
		example: "2026-07-26",
		description: "End of the date window (inclusive)",
	})
	@IsOptional()
	@IsISO8601({ strict: true })
	to?: string;

	@ApiPropertyOptional({ description: "Filter by employee" })
	@IsOptional()
	@IsUUID()
	employeeId?: string;

	@ApiPropertyOptional({ description: "Filter by shift" })
	@IsOptional()
	@IsUUID()
	shiftId?: string;
}
