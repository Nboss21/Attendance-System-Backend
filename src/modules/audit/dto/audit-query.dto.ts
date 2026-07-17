import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by entity type (e.g. Employee)' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter by actor User ID' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
