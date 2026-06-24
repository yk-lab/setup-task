import * as core from '@actions/core';

/** Parse a non-negative integer input, warning and falling back on invalid values. */
export function parseRetryInput(input: string, defaultValue: number, name: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    return defaultValue;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    core.warning(`Invalid ${name} "${input}"; using default ${defaultValue}.`);
    return defaultValue;
  }
  return parsed;
}
