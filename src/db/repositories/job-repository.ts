import type BetterSqlite3 from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { jobs, type Job, type NewJob } from '../schema.js';
import { assertTransition, type JobStatus } from '../status.js';

/** The Drizzle ORM instance type taken from the {@link Database} handle. */
type DrizzleDb = Database['db'];

/**
 * Fields a caller may supply when creating a NEW job. `status`, `claimedBy`,
 * `claimedAt` and the timestamps are owned by the repository, so they are not
 * part of the input.
 */
export type NewJobInput = Omit<
  NewJob,
  'status' | 'claimedBy' | 'claimedAt' | 'lastError' | 'scoredAt' | 'createdAt' | 'updatedAt'
>;

/** Raw row shape returned by the better-sqlite3 `RETURNING *` (snake_case). */
interface RawJobRow {
  id: string;
  company_id: string | null;
  external_id: string | null;
  source: string | null;
  title: string;
  location: string | null;
  url: string | null;
  description: string | null;
  posted_date: number | null;
  status: string;
  score: number | null;
  claimed_by: string | null;
  claimed_at: number | null;
  last_error: string | null;
  discovered_at: number | null;
  scored_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Convert an epoch-millis integer (or null) into a JS Date (or null). */
function toDate(ms: number | null): Date | null {
  return ms == null ? null : new Date(ms);
}

/**
 * Map a raw better-sqlite3 row (snake_case columns, integer timestamps) onto the
 * Drizzle-inferred {@link Job} shape (camelCase, `Date` objects) so callers see a
 * single, consistent row type regardless of which access path produced it.
 */
function mapRawJob(row: RawJobRow): Job {
  return {
    id: row.id,
    companyId: row.company_id,
    externalId: row.external_id,
    source: row.source,
    title: row.title,
    location: row.location,
    url: row.url,
    description: row.description,
    postedDate: toDate(row.posted_date),
    status: row.status as JobStatus,
    score: row.score,
    claimedBy: row.claimed_by,
    claimedAt: toDate(row.claimed_at),
    lastError: row.last_error,
    discoveredAt: toDate(row.discovered_at),
    scoredAt: toDate(row.scored_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * The single sanctioned access path for the `jobs` table (Pattern 5). Drizzle
 * lives only here; agents and consumers depend on this class, never on the ORM
 * or raw SQL.
 *
 * The heart of the class is {@link claimByStatus}: an atomic `BEGIN IMMEDIATE`
 * claim that moves rows out of their `from` status in one statement, so two
 * overlapping/back-to-back claim passes can never grab the same job (Pattern 2,
 * Pitfall #8).
 */
export class JobRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly sqlite: BetterSqlite3.Database,
  ) {}

  /**
   * Insert a NEW job. Idempotent on the unique (source, externalId) index: a
   * second insert for the same identity is a no-op that returns the existing
   * row (Pitfall #4 dedup).
   */
  insertNew(job: NewJobInput): Job {
    const inserted = this.db
      .insert(jobs)
      .values({ ...job, status: 'NEW' })
      .onConflictDoNothing()
      .returning()
      .all();

    if (inserted.length > 0) {
      return inserted[0]!;
    }

    // Conflict on (source, externalId): the row already exists — return it.
    const existing = this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.source, job.source as string),
          eq(jobs.externalId, job.externalId as string),
        ),
      )
      .get();

    if (!existing) {
      throw new Error('insertNew: conflict reported but existing row not found');
    }
    return existing;
  }

  /** Return all jobs currently in the given status. */
  findByStatus(status: JobStatus): Job[] {
    return this.db.select().from(jobs).where(eq(jobs.status, status)).all();
  }

  /** Return a single job by id, or undefined when no such job exists. */
  getById(id: string): Job | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  /**
   * Atomically claim up to `limit` jobs in status `from`, moving them to `to`
   * and stamping `claimedBy`/`claimedAt`. Returns the claimed rows.
   *
   * The claim is a single `UPDATE ... WHERE id IN (SELECT ... LIMIT) RETURNING *`
   * wrapped in `BEGIN IMMEDIATE` on the raw better-sqlite3 handle. Because the
   * update both filters on and moves rows out of `from`, an overlapping claim can
   * never re-select the same rows — this is the no-double-processing guarantee.
   *
   * The transition is validated against the state machine before any write, so
   * an illegal `from -> to` throws instead of touching the DB.
   */
  claimByStatus(
    from: JobStatus,
    to: JobStatus,
    claimedBy: string,
    limit: number,
  ): Job[] {
    assertTransition(from, to);

    const now = Date.now();
    const claim = this.sqlite.transaction((): RawJobRow[] => {
      const stmt = this.sqlite.prepare(
        `UPDATE jobs
            SET status = @to,
                claimed_by = @by,
                claimed_at = @now,
                updated_at = @now
          WHERE id IN (
            SELECT id FROM jobs WHERE status = @from LIMIT @limit
          )
        RETURNING *`,
      );
      return stmt.all({ to, by: claimedBy, now, from, limit }) as RawJobRow[];
    });

    // better-sqlite3 exposes an immediate-mode transaction runner; BEGIN
    // IMMEDIATE takes the write lock up front so the claim is serialized.
    const rows = claim.immediate();
    return rows.map(mapRawJob);
  }

  /**
   * Move a job to a new status, validated against the state machine. Optional
   * `fields` are written alongside (e.g. `score`, `lastError`). Transitioning to
   * SCORED stamps `scoredAt`; transitioning to ERROR requires a `lastError`.
   *
   * @throws if the job does not exist or the transition is illegal.
   */
  transition(id: string, to: JobStatus, fields?: Partial<Job>): void {
    const current = this.getById(id);
    if (!current) {
      throw new Error(`transition: job not found: ${id}`);
    }
    assertTransition(current.status, to);

    if (to === 'ERROR' && !fields?.lastError) {
      throw new Error('transition to ERROR requires a lastError');
    }

    const now = new Date();
    const patch: Partial<Job> = {
      ...fields,
      status: to,
      updatedAt: now,
    };
    if (to === 'SCORED') {
      patch.scoredAt = fields?.scoredAt ?? now;
    }

    this.db.update(jobs).set(patch).where(eq(jobs.id, id)).run();
  }
}
