import { describe, expect, it } from 'vitest';
import { formatIssueBody } from '../src/lib/issue-body';
import type { FeedbackPayload } from '../src/types';

const basePayload: FeedbackPayload = {
  repo: 'owner/repo',
  title: 'Test',
  description: 'Something broke',
  metadata: {
    url: 'https://example.com/page',
    userAgent: 'Mozilla/5.0',
    viewport: { width: 1280, height: 720 },
    timestamp: '2026-01-01T00:00:00.000Z',
    browser: { name: 'Chrome', version: '120' },
    os: { name: 'Windows', version: '11' },
  },
};

describe('formatIssueBody', () => {
  it('includes description and system info', () => {
    const body = formatIssueBody(basePayload);
    expect(body).toContain('## Description');
    expect(body).toContain('Something broke');
    expect(body).toContain('System Info');
    expect(body).toContain('https://example.com/page');
  });

  it('includes screenshot URL when provided', () => {
    const body = formatIssueBody(basePayload, 'https://github.com/screenshot.png');
    expect(body).toContain('## Screenshot');
    expect(body).toContain('https://github.com/screenshot.png');
  });
});
