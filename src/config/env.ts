import { envSchema } from './env.schema';

export const ENV = envSchema.parse(process.env);
