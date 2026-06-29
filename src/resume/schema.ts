import { z } from 'zod';

/**
 * The single source of truth for the resume's structured data contract (RES-01).
 *
 * IMPORTANT — input boundary: the resume lives as structured YAML data. PDFs are
 * OUTPUTS ONLY and are NEVER parsed as input anywhere in this module. The loader
 * (./load.ts) reads YAML and validates it against this schema; downstream
 * tailoring is structured-in/structured-out against this exact shape.
 *
 * Mirrors the Phase 1 config pattern: one Zod schema as source of truth, the
 * type via `z.infer`, and a fail-fast loader that reuses the same error format.
 */

/** Contact + identity. `name` is the only hard requirement. */
const ProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
});

/**
 * A named, addressable skill group. Tailoring reorders these, so they are kept
 * grouped + addressable (rather than a single flat list).
 */
const SkillGroupSchema = z.object({
  category: z.string().optional(),
  items: z.array(z.string()),
});

/** One role. Company, title and bullets are required; dates are opaque strings. */
const ExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  current: z.boolean().optional(),
  bullets: z.array(z.string()),
});

/** A project. `name` required; bullets optional (some projects are one-liners). */
const ProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  url: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

/** An education entry. Only the institution is required. */
const EducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  details: z.string().optional(),
});

/** A certificate / credential. Only the name is required. */
const CertificateSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  date: z.string().optional(),
  url: z.string().optional(),
});

/** A spoken/written language. Only the name is required. */
const LanguageSchema = z.object({
  name: z.string().min(1),
  proficiency: z.string().optional(),
});

/**
 * The complete structured resume across all eight sections. Array sections
 * default to `[]` when omitted so a minimal master (profile + summary +
 * experience) validates cleanly.
 */
export const ResumeSchema = z.object({
  profile: ProfileSchema,
  summary: z.string().min(1),
  skills: z.array(SkillGroupSchema).default([]),
  experience: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema).default([]),
  education: z.array(EducationSchema).default([]),
  certificates: z.array(CertificateSchema).default([]),
  languages: z.array(LanguageSchema).default([]),
});

/**
 * The inferred, typed resume consumed by every downstream consumer (renderer,
 * validator, tailoring). This is the single source of truth for the shape.
 */
export type Resume = z.infer<typeof ResumeSchema>;

/**
 * Validate an already-parsed plain object against the schema.
 *
 * On failure, throws an Error whose message names each offending field path
 * (e.g. `profile.name: ...`, `experience.0.company: ...`) so an invalid master
 * resume is obvious at load time. Mirrors `validateConfig` in src/config/schema.ts
 * so error formatting is consistent across the codebase.
 */
export function validateResume(input: unknown): Resume {
  const result = ResumeSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid resume: ${issues}`);
  }
  return result.data;
}
