import { z } from "zod";

export const EnvSchema = z.object({
  TYPESENSE_HOST: z.string().default("localhost"),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_API_KEY: z.string().default("flyfairlysecret"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/flyairports"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export const validateEnv = (config: Record<string, unknown>) => {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Config validation error: ${result.error.message}`);
  }
  return result.data;
};
