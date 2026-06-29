/**
 * Job-status state machine — the idempotency backbone of the DB-as-message-bus
 * pipeline (Pitfall #8). This module is deliberately **pure**: it imports no
 * database or config code so it stays trivially unit-testable and reusable by
 * the repository layer (Plan 04) and the agent contract (Plan 05).
 *
 * The machine:
 *   NEW -> SCORING -> SCORED -> TAILORING -> TAILORED   (the happy path)
 *   SCORING | SCORED -> REJECTED_LOW_SCORE              (rejection branch)
 *   any non-terminal state -> ERROR                     (failure escape hatch)
 *
 * Terminal states (no outgoing transitions): TAILORED, REJECTED_LOW_SCORE, ERROR.
 */

/** The complete set of job lifecycle states. */
export type JobStatus =
  | 'NEW'
  | 'SCORING'
  | 'SCORED'
  | 'TAILORING'
  | 'TAILORED'
  | 'REJECTED_LOW_SCORE'
  | 'ERROR';

/** Every job status as a readonly array (handy for iteration/validation). */
export const JOB_STATUSES = [
  'NEW',
  'SCORING',
  'SCORED',
  'TAILORING',
  'TAILORED',
  'REJECTED_LOW_SCORE',
  'ERROR',
] as const satisfies readonly JobStatus[];

/**
 * The allowed-transition map encoding the state machine above.
 *
 * Invariants enforced by tests:
 * - Terminal states map to `[]`.
 * - Every non-terminal state includes `'ERROR'` as a target.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  NEW: ['SCORING', 'ERROR'],
  SCORING: ['SCORED', 'REJECTED_LOW_SCORE', 'ERROR'],
  SCORED: ['TAILORING', 'REJECTED_LOW_SCORE', 'ERROR'],
  TAILORING: ['TAILORED', 'ERROR'],
  TAILORED: [],
  REJECTED_LOW_SCORE: [],
  ERROR: [],
};

/**
 * Returns `true` if `from -> to` is a legal transition in the state machine.
 * Self-transitions and transitions out of terminal states are not allowed.
 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Throws a clear `Error` when `from -> to` is illegal; no-ops when it is legal.
 * Use this at every status write so out-of-order or duplicate processing is
 * rejected loudly rather than silently corrupting state.
 */
export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal status transition: ${from} -> ${to}`);
  }
}
