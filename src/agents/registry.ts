import type { Agent } from './agent.js';

/**
 * The open/closed agent registry (ARCHITECTURE.md pattern 1). A simple
 * name -> instance map: adding a new agent is `registry.register(new XAgent())`
 * and requires NO change to any existing agent. Deliberately not a god base
 * class (anti-pattern #5) — the registry only stores and resolves agents.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  /**
   * Register an agent under its `name`. Throws on a duplicate name so two
   * agents can never silently shadow each other.
   */
  register(agent: Agent): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`dup agent: "${agent.name}" is already registered`);
    }
    this.agents.set(agent.name, agent);
  }

  /** Resolve an agent by name. Throws when no agent is registered under it. */
  get(name: string): Agent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`unknown agent: "${name}" is not registered`);
    }
    return agent;
  }

  /** Return every registered agent. */
  list(): Agent[] {
    return [...this.agents.values()];
  }
}
