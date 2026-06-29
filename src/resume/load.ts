import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateResume, type Resume } from './schema.js';

export type { Resume } from './schema.js';

/**
 * Load, parse, and validate the structured resume master (RES-01).
 *
 * Flow: read YAML file -> parse with the `yaml` package -> validate against
 * ResumeSchema (fails fast with a field-naming error on invalid input).
 *
 * IMPORTANT — input boundary: this is structured-input-ONLY. The resume master
 * is YAML; PDFs are OUTPUTS ONLY and are NEVER read or parsed here. There is
 * deliberately no PDF code path in this module (locked RES-01 decision).
 *
 * @param path Path to the YAML resume master. Defaults to `resume/master.yaml`.
 */
export function loadResume(path = 'resume/master.yaml'): Resume {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Resume file not found at ${path}. ` +
          `Copy resume/master.example.yaml to resume/master.yaml and edit it.`,
      );
    }
    throw err;
  }
  const parsed = parse(raw);
  return validateResume(parsed);
}
