import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { loadResume } from './load.js';
import { type Resume } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const exampleYamlPath = join(here, '..', '..', 'resume', 'master.example.yaml');

const tmpDirs: string[] = [];

function writeTempYaml(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'jf-resume-'));
  tmpDirs.push(dir);
  const file = join(dir, 'master.yaml');
  writeFileSync(file, stringify(obj), 'utf8');
  return file;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('loadResume', () => {
  it('returns a fully typed Resume from a valid YAML master', () => {
    const resume: Resume = loadResume(exampleYamlPath);
    expect(resume.profile.name).toBe('Ada Lovelace');
    expect(Array.isArray(resume.experience)).toBe(true);
    expect(resume.experience.length).toBeGreaterThan(0);
  });

  it('throws a clear validation error naming the missing field (fail-fast)', () => {
    const bad = {
      profile: { email: 'no-name@example.com' }, // missing required name
      summary: 'x',
      experience: [],
    };
    const file = writeTempYaml(bad);
    expect(() => loadResume(file)).toThrow(/profile\.name/);
  });

  it('throws a clear "resume file not found" error for a nonexistent path', () => {
    expect(() => loadResume('/no/such/resume/master.yaml')).toThrow(/not found/i);
  });

  it('reads structured YAML only — the module imports no PDF parser', () => {
    const source = readFileSync(join(here, 'load.ts'), 'utf8');
    // No import/require of any PDF library (pdf-parse, pdfjs, pdf-lib, etc.).
    const importLines = source
      .split('\n')
      .filter((line) => /\b(import|require)\b/.test(line));
    expect(importLines.some((line) => /pdf/i.test(line))).toBe(false);
    // It does read YAML.
    expect(source).toMatch(/from 'yaml'/);
  });
});
