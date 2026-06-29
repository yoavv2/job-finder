import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { companies, type Company, type NewCompany } from '../schema.js';

/** The Drizzle ORM instance type taken from the {@link Database} handle. */
type DrizzleDb = Database['db'];

/**
 * Fields a caller may supply when upserting a company. `firstSeenAt` /
 * `lastSeenAt` are owned by the repository.
 */
export type CompanyInput = Omit<NewCompany, 'firstSeenAt' | 'lastSeenAt'>;

/**
 * Repository for the Companies emergent knowledge base (COMP-01/COMP-03). The
 * companies table has no DB-level unique constraint on identity, so upsert
 * resolves identity in app code: prefer (ats, boardToken) when both are present,
 * otherwise fall back to name. This keeps the bootstrap-seeded v1 companies and
 * (future) Company-Discovery writes idempotent on a stable identity.
 */
export class CompanyRepository {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Insert a company or, if one with the same identity already exists, bump its
   * `lastSeenAt` without changing `firstSeenAt` or `id`. Identity is
   * (ats, boardToken) when both present, else name.
   *
   * @param now Clock injection point so callers/tests can control timestamps.
   */
  upsert(company: CompanyInput, now: Date = new Date()): Company {
    const existing = this.findByIdentity(company);

    if (existing) {
      const updated = this.db
        .update(companies)
        .set({ lastSeenAt: now })
        .where(eq(companies.id, existing.id))
        .returning()
        .get();
      return updated!;
    }

    const inserted = this.db
      .insert(companies)
      .values({ ...company, firstSeenAt: now, lastSeenAt: now })
      .returning()
      .get();
    return inserted!;
  }

  /** Return all companies with `active = true`. */
  findActive(): Company[] {
    return this.db
      .select()
      .from(companies)
      .where(eq(companies.active, true))
      .all();
  }

  /** Update only the `lastSeenAt` timestamp for a company. */
  touchLastSeen(id: string, now: Date = new Date()): void {
    this.db
      .update(companies)
      .set({ lastSeenAt: now })
      .where(eq(companies.id, id))
      .run();
  }

  /**
   * Resolve a company by its identity: (ats, boardToken) when both are present,
   * otherwise by name. Returns undefined when no match exists.
   */
  private findByIdentity(company: CompanyInput): Company | undefined {
    if (company.ats && company.boardToken) {
      return this.db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.ats, company.ats),
            eq(companies.boardToken, company.boardToken),
          ),
        )
        .get();
    }
    return this.db
      .select()
      .from(companies)
      .where(eq(companies.name, company.name))
      .get();
  }
}
