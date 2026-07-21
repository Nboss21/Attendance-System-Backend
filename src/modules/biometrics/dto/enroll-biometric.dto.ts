import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Payload sent when the mobile app or an admin UI enrolls an employee's face.
 *
 * The backend stores the embedding (or the raw base64 image as the embedding
 * data in this MVP version). In production you would pass the raw bytes to a
 * dedicated face-recognition service that generates and returns the embedding
 * vector, then store only the vector here.
 */
export class EnrollBiometricDto {
  @ApiProperty({
    description:
      'Base64-encoded face image(s) — up to 5 frames, serialized as a JSON array string. ' +
      'In MVP this is stored as the template. In production a face-embedding service ' +
      'converts the image to a compact vector before storage.',
    example: '["data:image/jpeg;base64,/9j/4AAQ..."]',
  })
  @IsString()
  @IsNotEmpty()
  embeddingData!: string;

  @ApiPropertyOptional({ default: 'v1', description: 'Model/algorithm version tag' })
  @IsOptional()
  @IsString()
  modelVersion?: string;
}
