import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ProvisionCompanyDto {
  @ApiProperty({ description: 'Company display name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Unique short code (slug) for the company' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ description: 'Subscription plan identifier (e.g. "starter", "enterprise")' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiProperty({ description: 'Email for the first COMPANY_ADMIN user' })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ description: 'Initial password for the admin user (min 8 chars)' })
  @IsString()
  @MinLength(8)
  adminPassword!: string;
}
