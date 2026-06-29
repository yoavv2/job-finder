import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { loadConfig, getEnv } from './load.js';
import { validateConfig, type Config } from './schema.js';

const tmpDirs: string[] = [];

function writeTempYaml(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'jf-config-'));
  tmpDirs.push(dir);
  const file = join(dir, 'config.yaml');
  writeFileSync(file, stringify(obj), 'utf8');
  return file;
}

const validConfig = {
  schedule: {
    discovery: '0 */6 * * *',
    matching: '0 7 * * *',
    resume: '0 8 * * *',
  },
  filters: {
    keywords: ['typescript', 'node'],
    countries: ['US', 'IL'],
    seniority: ['senior', 'staff'],
  },
  minimumMatchScore: 70,
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
  },
  database: {
    path: './data/jobs.db',
  },
};

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('loadConfig', () => {
  it('returns a fully typed object for a valid config.yaml', () => {
    const file = writeTempYaml(validConfig);
    const cfg: Config = loadConfig(file);
    expect(cfg.schedule.discovery).toBe('0 */6 * * *');
    expect(cfg.schedule.matching).toBe('0 7 * * *');
    expect(cfg.schedule.resume).toBe('0 8 * * *');
    expect(cfg.filters.keywords).toEqual(['typescript', 'node']);
    expect(cfg.filters.countries).toEqual(['US', 'IL']);
    expect(cfg.filters.seniority).toEqual(['senior', 'staff']);
    expect(cfg.minimumMatchScore).toBe(70);
    expect(cfg.llm.provider).toBe('anthropic');
    expect(cfg.llm.model).toBe('claude-sonnet-4');
    expect(cfg.database.path).toBe('./data/jobs.db');
  });

  it('returns a frozen object that cannot be mutated', () => {
    const file = writeTempYaml(validConfig);
    const cfg = loadConfig(file);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('throws naming minimumMatchScore when it is out of range', () => {
    const bad = { ...validConfig, minimumMatchScore: 150 };
    const file = writeTempYaml(bad);
    expect(() => loadConfig(file)).toThrow(/minimumMatchScore/);
  });

  it('throws naming llm.provider when the provider is not allowed', () => {
    const bad = { ...validConfig, llm: { provider: 'gemini', model: 'x' } };
    const file = writeTempYaml(bad);
    expect(() => loadConfig(file)).toThrow(/llm\.provider/);
  });

  it('throws naming the missing path when a required field is omitted', () => {
    const { database, ...withoutDatabase } = validConfig;
    const file = writeTempYaml(withoutDatabase);
    expect(() => loadConfig(file)).toThrow(/database/);
  });
});

describe('validateConfig', () => {
  it('parses a valid plain object into a typed Config', () => {
    const cfg = validateConfig(validConfig);
    expect(cfg.llm.provider).toBe('anthropic');
  });

  it('throws a field-naming error for an invalid object', () => {
    expect(() => validateConfig({ ...validConfig, minimumMatchScore: -1 })).toThrow(
      /minimumMatchScore/,
    );
  });
});

describe('getEnv', () => {
  it('returns the value when the env var is set', () => {
    process.env.__JF_TEST_KEY = 'present';
    expect(getEnv('__JF_TEST_KEY')).toBe('present');
    delete process.env.__JF_TEST_KEY;
  });

  it('throws a clear error naming the missing env var', () => {
    delete process.env.__JF_MISSING_KEY;
    expect(() => getEnv('__JF_MISSING_KEY')).toThrow(/__JF_MISSING_KEY/);
  });
});
