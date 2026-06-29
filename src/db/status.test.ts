import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  JOB_STATUSES,
  assertTransition,
  canTransition,
  type JobStatus,
} from './status.js';

describe('JOB_STATUSES', () => {
  it('enumerates all seven states', () => {
    expect([...JOB_STATUSES].sort()).toEqual(
      [
        'ERROR',
        'NEW',
        'REJECTED_LOW_SCORE',
        'SCORED',
        'SCORING',
        'TAILORED',
        'TAILORING',
      ].sort(),
    );
  });
});

describe('canTransition — legal happy path', () => {
  it('walks NEW -> SCORING -> SCORED -> TAILORING -> TAILORED', () => {
    expect(canTransition('NEW', 'SCORING')).toBe(true);
    expect(canTransition('SCORING', 'SCORED')).toBe(true);
    expect(canTransition('SCORED', 'TAILORING')).toBe(true);
    expect(canTransition('TAILORING', 'TAILORED')).toBe(true);
  });
});

describe('canTransition — illegal skips', () => {
  it('rejects skipping straight from NEW to TAILORED', () => {
    expect(canTransition('NEW', 'TAILORED')).toBe(false);
  });

  it('rejects skipping from NEW to SCORED', () => {
    expect(canTransition('NEW', 'SCORED')).toBe(false);
  });

  it('rejects going backwards', () => {
    expect(canTransition('SCORED', 'SCORING')).toBe(false);
    expect(canTransition('TAILORED', 'SCORING')).toBe(false);
  });
});

describe('canTransition — rejection branch', () => {
  it('allows SCORING -> REJECTED_LOW_SCORE', () => {
    expect(canTransition('SCORING', 'REJECTED_LOW_SCORE')).toBe(true);
  });

  it('allows SCORED -> REJECTED_LOW_SCORE', () => {
    expect(canTransition('SCORED', 'REJECTED_LOW_SCORE')).toBe(true);
  });

  it('does not allow NEW -> REJECTED_LOW_SCORE (only after scoring)', () => {
    expect(canTransition('NEW', 'REJECTED_LOW_SCORE')).toBe(false);
  });
});

describe('canTransition — ERROR is reachable from any non-terminal state', () => {
  const nonTerminal: JobStatus[] = ['NEW', 'SCORING', 'SCORED', 'TAILORING'];

  it.each(nonTerminal)('allows %s -> ERROR', (from) => {
    expect(canTransition(from, 'ERROR')).toBe(true);
  });
});

describe('canTransition — terminal states accept no transitions', () => {
  const terminal: JobStatus[] = ['TAILORED', 'REJECTED_LOW_SCORE', 'ERROR'];

  it.each(terminal)('%s has no outgoing transitions', (from) => {
    expect(ALLOWED_TRANSITIONS[from]).toEqual([]);
    for (const to of JOB_STATUSES) {
      expect(canTransition(from, to)).toBe(false);
    }
  });
});

describe('assertTransition', () => {
  it('no-ops on a legal transition', () => {
    expect(() => assertTransition('NEW', 'SCORING')).not.toThrow();
  });

  it('throws a clear error on an illegal transition', () => {
    expect(() => assertTransition('NEW', 'TAILORED')).toThrowError(
      'illegal status transition: NEW -> TAILORED',
    );
  });

  it('throws for transitions out of a terminal state', () => {
    expect(() => assertTransition('TAILORED', 'NEW')).toThrowError(
      'illegal status transition: TAILORED -> NEW',
    );
  });
});

describe('ALLOWED_TRANSITIONS invariants', () => {
  it('every non-terminal state can transition to ERROR', () => {
    for (const from of JOB_STATUSES) {
      const targets = ALLOWED_TRANSITIONS[from];
      if (targets.length > 0) {
        expect(targets).toContain('ERROR');
      }
    }
  });
});
