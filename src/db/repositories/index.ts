import type { Database } from '../client.js';
import { ApplicationRepository } from './application-repository.js';
import { CompanyRepository } from './company-repository.js';
import { JobRepository } from './job-repository.js';

export { JobRepository, type NewJobInput } from './job-repository.js';
export { CompanyRepository, type CompanyInput } from './company-repository.js';
export {
  ApplicationRepository,
  type CreateApplicationInput,
} from './application-repository.js';

/** The bundle of repositories that make up the entire DB access surface. */
export interface Repositories {
  jobs: JobRepository;
  companies: CompanyRepository;
  applications: ApplicationRepository;
}

/**
 * Construct every repository from a {@link Database} handle (the output of
 * `createDb`). This is the single seam Plan 05's `buildContext` and the Phase
 * 2-4 agents use to obtain DB access without ever touching Drizzle or raw SQL.
 */
export function buildRepositories(handles: Database): Repositories {
  return {
    jobs: new JobRepository(handles.db, handles.sqlite),
    companies: new CompanyRepository(handles.db),
    applications: new ApplicationRepository(handles.db),
  };
}
