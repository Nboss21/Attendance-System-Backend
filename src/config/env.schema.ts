import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().default('development-only-change-me'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().default(2592000),
  REDIS_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;
