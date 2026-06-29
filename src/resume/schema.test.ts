import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { ResumeSchema, type Resume } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const exampleYamlPath = join(here, '..', '..', 'resume', 'master.example.yaml');

const validResume = {
  profile: {
    name: 'Grace Hopper',
    email: 'grace@example.com',
  },
  summary: 'Pioneering computer scientist and compiler author.',
  skills: [{ category: 'Languages', items: ['COBOL', 'FORTRAN'] }],
  experience: [
    {
      company: 'US Navy',
      title: 'Rear Admiral',
      startDate: '1944-01',
      bullets: ['Invented the first compiler.'],
    },
  ],
  projects: [],
  education: [],
  certificates: [],
  languages: [],
};

describe('ResumeSchema', () => {
  it('parses a valid resume into a fully typed object with all sections', () => {
    const resume: Resume = ResumeSchema.parse(validResume);
    expect(resume.profile.name).toBe('Grace Hopper');
    expect(resume.summary).toContain('compiler');
    expect(Array.isArray(resume.skills)).toBe(true);
    expect(resume.experience[0].company).toBe('US Navy');
    expect(resume.experience[0].bullets).toEqual(['Invented the first compiler.']);
    expect(Array.isArray(resume.projects)).toBe(true);
    expect(Array.isArray(resume.education)).toBe(true);
    expect(Array.isArray(resume.certificates)).toBe(true);
    expect(Array.isArray(resume.languages)).toBe(true);
  });

  it('throws a ZodError when a required field (profile.name) is missing', () => {
    const { name, ...profileWithoutName } = validResume.profile;
    const bad = { ...validResume, profile: profileWithoutName };
    expect(() => ResumeSchema.parse(bad)).toThrow();
  });

  it('throws when summary is missing', () => {
    const { summary, ...withoutSummary } = validResume;
    expect(() => ResumeSchema.parse(withoutSummary)).toThrow();
  });

  it('requires company, title and bullets on each experience entry', () => {
    const bad = {
      ...validResume,
      experience: [{ company: 'X' }],
    };
    expect(() => ResumeSchema.parse(bad)).toThrow();
  });

  it('defaults array sections to empty arrays when omitted', () => {
    const minimal = {
      profile: { name: 'Min', email: 'min@example.com' },
      summary: 'Minimal resume.',
      experience: [],
    };
    const resume = ResumeSchema.parse(minimal);
    expect(resume.skills).toEqual([]);
    expect(resume.projects).toEqual([]);
    expect(resume.education).toEqual([]);
    expect(resume.certificates).toEqual([]);
    expect(resume.languages).toEqual([]);
  });

  it('validates the shipped example master.example.yaml against the schema', () => {
    const raw = readFileSync(exampleYamlPath, 'utf8');
    const parsed = parse(raw);
    const resume = ResumeSchema.parse(parsed);
    expect(resume.profile.name).toBe('Ada Lovelace');
    expect(resume.experience.length).toBeGreaterThan(0);
    expect(resume.skills.length).toBeGreaterThan(0);
    expect(resume.certificates.length).toBeGreaterThan(0);
    expect(resume.languages.length).toBeGreaterThan(0);
  });
});
