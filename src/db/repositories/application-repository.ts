import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { applications, type Application } from '../schema.js';

/** The Drizzle ORM instance type taken from the {@link Database} handle. */
type DrizzleDb = Database['db'];

/** Input for creating an application row. */
export interface CreateApplicationInput {
  jobId: string;
  status?: string | null;
  scoreSnapshot?: number | null;
}

/**
 * Repository for the Applications table — produced when a job reaches the
 * tailoring stage (Phase 4). Records the generated resume artifact path and a
 * snapshot of the score at application time.
 */
export class ApplicationRepository {
  constructor(private readonly db: DrizzleDb) {}

  /** Create an application row for a job. */
  create(input: CreateApplicationInput): Application {
    const inserted = this.db
      .insert(applications)
      .values({
        jobId: input.jobId,
        status: input.status ?? null,
        scoreSnapshot: input.scoreSnapshot ?? null,
      })
      .returning()
      .get();
    return inserted!;
  }

  /** Return a single application by id, or undefined when none exists. */
  getById(id: string): Application | undefined {
    return this.db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .get();
  }

  /** Record the path to the generated, job-tailored resume artifact. */
  setResumePath(id: string, resumePath: string): void {
    this.db
      .update(applications)
      .set({ resumePath, updatedAt: new Date() })
      .where(eq(applications.id, id))
      .run();
  }

  /** Update the application status (e.g. PENDING -> SUBMITTED). */
  updateStatus(id: string, status: string): void {
    this.db
      .update(applications)
      .set({ status, updatedAt: new Date() })
      .where(eq(applications.id, id))
      .run();
  }
}
