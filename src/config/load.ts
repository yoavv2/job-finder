import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateConfig, type Config } from './schema.js';

export type { Config } from './schema.js';

/**
 * Load, parse, validate, and freeze the application configuration.
 *
 * Flow: read YAML file -> parse with the `yaml` package -> validate against
 * ConfigSchema (fails fast with a field-naming error on invalid input) ->
 * `Object.freeze` the result so callers cannot mutate config at runtime.
 *
 * @param path Path to the YAML config. Defaults to `$CONFIG_PATH` or `config.yaml`.
 */
export function loadConfig(path = process.env.CONFIG_PATH ?? 'config.yaml'): Config {
  const raw = readFileSync(path, 'utf8');
  const parsed = parse(raw);
  const config = validateConfig(parsed);
  return Object.freeze(config);
}

/**
 * Read a required secret/value from the environment.
 *
 * Centralizes all secret access (the LLM plan uses this to fetch API keys from
 * `.env`). Throws a clear error naming the variable if it is unset/empty, so
 * missing secrets fail fast rather than surfacing as opaque provider errors.
 */
export function getEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your .env file (see .env.example). Secrets are never read from config.yaml.`,
    );
  }
  return value;
}
