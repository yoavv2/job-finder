import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../client.js';
import { ApplicationRepository } from './application-repository.js';
import { JobRepository } from './job-repository.js';

describe('ApplicationRepository', () => {
  let dir: string;
  let handle: Database;
  let apps: ApplicationRepository;
  let jobs: JobRepository;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-apprepo-'));
    handle = createDb({ path: join(dir, 'test.db') });
    apps = new ApplicationRepository(handle.db);
    jobs = new JobRepository(handle.db, handle.sqlite);
    jobId = jobs.insertNew({ title: 'Engineer', source: 's', externalId: '1' }).id;
  });

  afterEach(() => {
    handle.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('create inserts an application row', () => {
    const app = apps.create({ jobId, status: 'PENDING', scoreSnapshot: 91 });
    expect(app.id).toBeTruthy();
    expect(app.jobId).toBe(jobId);
    expect(app.status).toBe('PENDING');
    expect(app.scoreSnapshot).toBe(91);
  });

  it('setResumePath records the artifact path', () => {
    const app = apps.create({ jobId, status: 'PENDING', scoreSnapshot: 91 });
    apps.setResumePath(app.id, '/artifacts/resume-1.pdf');

    const updated = apps.getById(app.id)!;
    expect(updated.resumePath).toBe('/artifacts/resume-1.pdf');
  });

  it('updateStatus changes the application status', () => {
    const app = apps.create({ jobId, status: 'PENDING', scoreSnapshot: 91 });
    apps.updateStatus(app.id, 'SUBMITTED');

    const updated = apps.getById(app.id)!;
    expect(updated.status).toBe('SUBMITTED');
  });
});
