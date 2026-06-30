import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, FeedbackAttachment, FeedbackPayload } from '../types';
import { IDENTIFIER_LABEL, MAX_ATTACHMENTS } from '../defaults';
import {
  createIssue,
  getInstallationToken,
  GitHubLabelError,
  isRepoPublic,
  uploadAttachmentAsAsset,
  uploadScreenshotAsAsset,
} from '../lib/github';
import { formatIssueBody } from '../lib/issue-body';
import { buildIssueLabels, validateLabels } from '../lib/labels';
import { rateLimit, rateLimitByRepo } from '../middleware/rateLimit';

const api = new Hono<{ Bindings: Env }>();

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

api.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS || '*';
  const originList =
    allowedOrigins === '*'
      ? ['*']
      : allowedOrigins
          .split(',')
          .map(o => o.trim())
          .filter(Boolean);

  const corsMiddleware = cors({
    origin: origin => {
      if (!origin) return '*';
      if (originList.includes('*')) return origin;
      return originList.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  });

  return corsMiddleware(c, next);
});

api.use(
  '/feedback',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'ip',
  })
);

api.use(
  '/feedback',
  rateLimitByRepo({
    windowMs: 60 * 60 * 1000,
    maxRequests: 50,
  })
);

api.get('/health', c => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

api.get('/check/:owner/:repo', async c => {
  const { owner, repo } = c.req.param();
  const token = await getInstallationToken(c.env, owner, repo);
  return c.json({
    installed: !!token,
    repo: `${owner}/${repo}`,
    appName: c.env.GITHUB_APP_NAME || undefined,
  });
});

api.post('/feedback', async c => {
  let payload: FeedbackPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!payload.repo || !payload.title) {
    return c.json({ error: 'Missing required fields: repo, title' }, 400);
  }

  const maxSizeMB = parseInt(c.env.MAX_SCREENSHOT_SIZE_MB || '5', 10);
  if (payload.screenshot) {
    const validation = validateScreenshotDataUrl(payload.screenshot, maxSizeMB);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }
  }

  const attachmentValidation = validateAttachments(payload.attachments, maxSizeMB);
  if (!attachmentValidation.valid) {
    return c.json({ error: attachmentValidation.error }, 400);
  }

  const labelValidation = validateLabels(payload.labels);
  if (!labelValidation.valid) {
    return c.json({ error: labelValidation.error }, 400);
  }

  const [owner, repo] = payload.repo.split('/');
  if (!owner || !repo) {
    return c.json({ error: 'Invalid repo format. Expected: owner/repo' }, 400);
  }

  try {
    const token = await getInstallationToken(c.env, owner, repo);
    if (!token) {
      const appName = c.env.GITHUB_APP_NAME || 'web-to-issues';
      return c.json(
        {
          error: 'GitHub App not installed on this repository',
          installUrl: `https://github.com/apps/${appName}/installations/new`,
        },
        403
      );
    }

    let screenshotUrl: string | undefined;
    if (payload.screenshot) {
      try {
        screenshotUrl = await uploadScreenshotAsAsset(token, owner, repo, payload.screenshot);
      } catch (error) {
        console.error('Failed to upload screenshot:', error);
      }
    }

    const uploadedAttachments: Array<FeedbackAttachment & { url: string }> = [];
    for (const attachment of payload.attachments ?? []) {
      try {
        const url = await uploadAttachmentAsAsset(token, owner, repo, attachment);
        uploadedAttachments.push({ ...attachment, url });
      } catch (error) {
        console.error('Failed to upload attachment:', error);
      }
    }

    const isPublic = await isRepoPublic(token, owner, repo);
    const body = formatIssueBody(payload, screenshotUrl, uploadedAttachments);
    const labels = buildIssueLabels(labelValidation.labels);

    let issue;
    try {
      issue = await createIssue(token, owner, repo, payload.title, body, labels);
    } catch (error) {
      if (!(error instanceof GitHubLabelError)) {
        throw error;
      }
      issue = await createIssue(token, owner, repo, payload.title, body, [IDENTIFIER_LABEL]);
    }

    return c.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      isPublic,
    });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to create issue' },
      500
    );
  }
});

export default api;

type ValidationResult = { valid: true } | { valid: false; error: string };

function validateScreenshotDataUrl(dataUrl: string, maxSizeMB: number): ValidationResult {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match?.[1]) {
    return { valid: false, error: 'Invalid screenshot format. Expected a PNG data URL.' };
  }

  const base64 = match[1];
  const estimatedSizeBytes =
    Math.floor((base64.length * 3) / 4) -
    (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);
  if (estimatedSizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Screenshot too large: ${estimatedSizeMB.toFixed(1)}MB exceeds ${maxSizeMB}MB limit`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return { valid: false, error: 'Invalid screenshot format. Expected valid base64 PNG data.' };
  }

  if (!hasPngSignature(bytes)) {
    return { valid: false, error: 'Invalid screenshot format. Expected PNG image data.' };
  }

  return { valid: true };
}

function validateAttachments(
  attachments: FeedbackAttachment[] | undefined,
  maxSizeMB: number
): ValidationResult {
  if (attachments === undefined) return { valid: true };
  if (!Array.isArray(attachments)) {
    return { valid: false, error: 'Invalid upload format. Expected a list of files.' };
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return { valid: false, error: `Too many files. Upload up to ${MAX_ATTACHMENTS} files.` };
  }

  for (const attachment of attachments) {
    const validation = validateAttachment(attachment, maxSizeMB);
    if (!validation.valid) return validation;
  }

  return { valid: true };
}

function validateAttachment(attachment: FeedbackAttachment, maxSizeMB: number): ValidationResult {
  if (
    typeof attachment.name !== 'string' ||
    !attachment.name.trim() ||
    typeof attachment.type !== 'string' ||
    typeof attachment.dataUrl !== 'string' ||
    typeof attachment.size !== 'number' ||
    !Number.isFinite(attachment.size)
  ) {
    return { valid: false, error: 'Invalid upload format. Expected file name, type, and data.' };
  }

  if (!ALLOWED_ATTACHMENT_TYPES.has(attachment.type)) {
    return { valid: false, error: `Unsupported file type: ${attachment.type || 'unknown'}.` };
  }

  const sizeMB = attachment.size / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `File "${attachment.name}" exceeds ${maxSizeMB}MB limit.`,
    };
  }

  if (!/^data:[^;]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(attachment.dataUrl)) {
    return { valid: false, error: 'Invalid upload format. Expected base64 file data.' };
  }

  return { valid: true };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
