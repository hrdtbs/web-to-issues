import { describe, expect, it } from 'vitest';
import { buildIssueLabels, validateLabels } from '../src/lib/labels';

describe('validateLabels', () => {
  it('accepts empty labels', () => {
    expect(validateLabels(undefined)).toEqual({ valid: true, labels: [] });
    expect(validateLabels([])).toEqual({ valid: true, labels: [] });
  });

  it('accepts valid label strings', () => {
    expect(validateLabels(['bug', 'enhancement'])).toEqual({
      valid: true,
      labels: ['bug', 'enhancement'],
    });
  });

  it('deduplicates labels', () => {
    expect(validateLabels(['bug', 'bug'])).toEqual({
      valid: true,
      labels: ['bug'],
    });
  });

  it('rejects non-array input', () => {
    expect(validateLabels('bug')).toEqual({
      valid: false,
      error: 'Invalid labels format. Expected an array of strings.',
    });
  });

  it('rejects labels that are too long', () => {
    const result = validateLabels(['x'.repeat(51)]);
    expect(result.valid).toBe(false);
  });
});

describe('buildIssueLabels', () => {
  it('adds identifier label', () => {
    expect(buildIssueLabels(['bug'])).toEqual(['bug', 'web-to-issues']);
  });

  it('deduplicates identifier label', () => {
    expect(buildIssueLabels(['web-to-issues'])).toEqual(['web-to-issues']);
  });
});
