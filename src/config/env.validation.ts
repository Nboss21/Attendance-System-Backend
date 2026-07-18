import { ZodError } from 'zod';
import { envSchema } from './env.schema';

export function validateEnv(config: Record<string, unknown>) {
  try {
    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues
        .map(({ path, message }) => `- ${path.join('.')}: ${message}`)
        .join('\n');

      throw new Error(`Environment validation failed\n\n${message}`);
    }

    throw error;
  }
}
