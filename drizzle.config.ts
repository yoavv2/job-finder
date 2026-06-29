import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration for migration generation.
 *
 * The runtime DB path comes from validated config (`config.database.path`) via
 * `createDbFromConfig` in `src/db/client.ts`. For drizzle-kit CLI operations we
 * read `DATABASE_PATH` from the environment, falling back to a local dev file.
 * Migrations live in `src/db/migrations` and are applied on connection open.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? './data/job-finder.db',
  },
});
