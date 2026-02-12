import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
