export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  GITHUB_APP_NAME: string;
  MAX_SCREENSHOT_SIZE_MB: string;
  ASSETS: Fetcher;
  RATE_LIMIT?: KVNamespace;
}

export interface FeedbackPayload {
  repo: string;
  title: string;
  description: string;
  labels?: string[];
  screenshot?: string;
  attachments?: FeedbackAttachment[];
  metadata: FeedbackMetadata;
}

export interface FeedbackMetadata {
  url: string;
  userAgent: string;
  viewport: { width: number; height: number };
  timestamp: string;
  elementSelector?: string;
  fullElementSelector?: string;
  browser?: { name: string; version: string };
  os?: { name: string; version: string };
  devicePixelRatio?: number;
  language?: string;
}

export interface FeedbackAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface GitHubIssue {
  number: number;
  html_url: string;
}
