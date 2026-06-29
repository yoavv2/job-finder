import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../client.js';
import {
  ApplicationRepository,
  buildRepositories,
  CompanyRepository,
  JobRepository,
} from './index.js';

describe('buildRepositories', () => {
  let dir: string;
  let handle: Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-repos-'));
    handle = createDb({ path: join(dir, 'test.db') });
  });

  afterEach(() => {
    handle.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('constructs all three repositories from a createDb handle', () => {
    const repos = buildRepositories(handle);
    expect(repos.jobs).toBeInstanceOf(JobRepository);
    expect(repos.companies).toBeInstanceOf(CompanyRepository);
    expect(repos.applications).toBeInstanceOf(ApplicationRepository);
  });

  it('repositories built by the factory are wired to the same db', () => {
    const repos = buildRepositories(handle);
    const job = repos.jobs.insertNew({ title: 'A', source: 's', externalId: '1' });
    expect(repos.jobs.getById(job.id)?.id).toBe(job.id);
  });
});
