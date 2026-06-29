import { describe, expect, it } from 'vitest';
import type { Agent, AgentContext, AgentResult } from './agent.js';
import { AgentRegistry } from './registry.js';

/**
 * Two distinct fake agents. The point of the registry is open/closed: adding a
 * new agent is `register(new XAgent())` and never touches any existing agent.
 * These fakes prove two unrelated agents coexist and resolve independently.
 */
function fakeResult(agent: string): AgentResult {
  return { agent, processed: 0, succeeded: 0, failed: 0 };
}

class AlphaAgent implements Agent {
  readonly name = 'alpha';
  async run(_ctx: AgentContext): Promise<AgentResult> {
    return fakeResult(this.name);
  }
}

class BetaAgent implements Agent {
  readonly name = 'beta';
  async run(_ctx: AgentContext): Promise<AgentResult> {
    return fakeResult(this.name);
  }
}

describe('AgentRegistry', () => {
  it('register/get/list returns registered agents', () => {
    const registry = new AgentRegistry();
    const alpha = new AlphaAgent();
    registry.register(alpha);

    expect(registry.get('alpha')).toBe(alpha);
    expect(registry.list()).toEqual([alpha]);
  });

  it('throws "dup agent" when a name is registered twice', () => {
    const registry = new AgentRegistry();
    registry.register(new AlphaAgent());
    expect(() => registry.register(new AlphaAgent())).toThrow(/dup agent/);
  });

  it('throws "unknown agent" when getting a name that was never registered', () => {
    const registry = new AgentRegistry();
    expect(() => registry.get('unknown')).toThrow(/unknown agent/);
  });

  it('two distinct agents register without touching each other (open/closed)', () => {
    const registry = new AgentRegistry();
    const alpha = new AlphaAgent();
    const beta = new BetaAgent();

    // Registering beta does not require modifying or re-registering alpha.
    registry.register(alpha);
    registry.register(beta);

    expect(registry.get('alpha')).toBe(alpha);
    expect(registry.get('beta')).toBe(beta);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()).toEqual(expect.arrayContaining([alpha, beta]));
  });
});
