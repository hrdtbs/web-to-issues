import { generateGitHubAppJWT } from './jwt';
import { SCREENSHOT_BRANCH } from '../defaults';
import type { Env, FeedbackAttachment, GitHubIssue } from '../types';

const GITHUB_API = 'https://api.github.com';

export class GitHubLabelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubLabelError';
    this.status = status;
  }
}

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'web-to-issues/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function getInstallationId(env: Env, owner: string, repo: string): Promise<number | null> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    return null;
  }

  const jwt = await generateGitHubAppJWT(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/installation`, {
    headers: githubHeaders(jwt),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { id: number };
  return data.id;
}

export async function getInstallationToken(
  env: Env,
  owner: string,
  repo: string
): Promise<string | null> {
  const installationId = await getInstallationId(env, owner, repo);
  if (!installationId) return null;

  const jwt = await generateGitHubAppJWT(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: githubHeaders(jwt),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<GitHubIssue> {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 422 && isLabelValidationFailure(errorText)) {
      throw new GitHubLabelError(`GitHub rejected labels: ${errorText}`, response.status);
    }
    throw new Error(`Failed to create issue: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<GitHubIssue>;
}

function isLabelValidationFailure(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ field?: unknown }> };
    return Array.isArray(parsed.errors) && parsed.errors.some(e => e?.field === 'labels');
  } catch {
    return false;
  }
}

export async function isRepoPublic(token: string, owner: string, repo: string): Promise<boolean> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(token),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { private: boolean };
    return !data.private;
  } catch {
    return false;
  }
}

async function ensureScreenshotBranch(token: string, owner: string, repo: string): Promise<void> {
  const check = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${SCREENSHOT_BRANCH}`,
    { headers: githubHeaders(token) }
  );
  if (check.ok) return;

  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: githubHeaders(token),
  });
  if (!repoRes.ok) {
    throw new Error(`Failed to get repo info: ${repoRes.status}`);
  }
  const repoData = (await repoRes.json()) as { default_branch: string };

  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${repoData.default_branch}`,
    { headers: githubHeaders(token) }
  );
  if (!refRes.ok) {
    throw new Error(`Failed to get default branch ref: ${refRes.status}`);
  }
  const refData = (await refRes.json()) as { object: { sha: string } };

  const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref: `refs/heads/${SCREENSHOT_BRANCH}`,
      sha: refData.object.sha,
    }),
  });
  if (!createRes.ok) {
    const error = await createRes.text();
    throw new Error(`Failed to create screenshot branch: ${createRes.status} - ${error}`);
  }
}

export async function uploadScreenshotAsAsset(
  token: string,
  owner: string,
  repo: string,
  base64DataUrl: string
): Promise<string> {
  const content = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const timestamp = Date.now();
  const filename = `.web-to-issues/screenshots/${timestamp}.png`;
  return uploadBase64Asset(token, owner, repo, filename, content, `Add screenshot ${timestamp}`);
}

export async function uploadAttachmentAsAsset(
  token: string,
  owner: string,
  repo: string,
  attachment: FeedbackAttachment
): Promise<string> {
  const timestamp = Date.now();
  const filename = `.web-to-issues/uploads/${timestamp}-${sanitizeFilename(attachment.name)}`;
  const content = attachment.dataUrl.replace(/^data:[^;]+;base64,/, '');
  return uploadBase64Asset(token, owner, repo, filename, content, `Add upload ${timestamp}`);
}

async function uploadBase64Asset(
  token: string,
  owner: string,
  repo: string,
  filename: string,
  content: string,
  message: string
): Promise<string> {
  await ensureScreenshotBranch(token, owner, repo);

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filename}`, {
    method: 'PUT',
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content,
      branch: SCREENSHOT_BRANCH,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload asset: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { content: { html_url: string } };
  return `${data.content.html_url}?raw=true`;
}

function sanitizeFilename(name: string): string {
  const safe = name
    .trim()
    .replace(/[/\\]/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || 'upload';
}
