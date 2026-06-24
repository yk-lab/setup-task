import { describe, expect, it, vi } from 'vitest';
import { parseRetryInput } from '../src/inputs';

// @actions/core.warning writes to the Actions log; silence it in tests.
vi.mock('@actions/core', () => ({ warning: vi.fn() }));

describe('parseRetryInput', () => {
  it('returns the default for empty input', () => {
    expect(parseRetryInput('', 3, 'retries')).toBe(3);
    expect(parseRetryInput('   ', 1000, 'retry-base-ms')).toBe(1000);
  });

  it('parses a valid integer string', () => {
    expect(parseRetryInput('5', 3, 'retries')).toBe(5);
    expect(parseRetryInput('250', 1000, 'retry-base-ms')).toBe(250);
  });

  it('returns the default for invalid input and warns', () => {
    expect(parseRetryInput('not-a-number', 3, 'retries')).toBe(3);
    expect(parseRetryInput('-1', 3, 'retries')).toBe(3);
    expect(parseRetryInput('3.5', 3, 'retries')).toBe(3);
  });
});
