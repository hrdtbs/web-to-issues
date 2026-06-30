import { runScreenshotCaptureFlow } from './capture-flow';
import {
  injectStyles,
  showFeedbackForm,
  showSuccessModal,
  type FeedbackFormResult,
} from './ui';

interface WidgetConfig {
  repo: string;
  apiUrl: string;
  availableLabels?: string[];
  initialLabels: string[];
  showLabelUI: boolean;
}

interface WebToIssuesAPI {
  open: () => void;
  close: () => void;
}

declare global {
  interface Window {
    WebToIssues?: WebToIssuesAPI;
  }
}

interface FeedbackMetadata {
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

let widgetRoot: HTMLElement | null = null;
let widgetConfig: WidgetConfig | null = null;
let isModalOpen = false;

const script =
  document.currentScript instanceof HTMLScriptElement
    ? document.currentScript
    : (document.querySelector('script[data-repo]') as HTMLScriptElement | null);

function parseJsonArray(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return undefined;
  }
}

function buildConfig(): WidgetConfig | null {
  const repo = script?.dataset.repo?.trim() || '';
  if (!repo) {
    console.error('[WebToIssues] Missing data-repo attribute');
    return null;
  }
  if (!/^[^/]+\/[^/]+$/.test(repo)) {
    console.error(
      `[WebToIssues] Invalid data-repo format "${repo}". Expected "owner/repo".`
    );
    return null;
  }

  const labels = parseJsonArray(script?.dataset.labels);
  const defaultLabels = parseJsonArray(script?.dataset.defaultLabels);
  let availableLabels: string[] | undefined;
  let initialLabels: string[] = [];
  let showLabelUI = false;

  if (labels && labels.length > 0) {
    availableLabels = labels;
    showLabelUI = true;
    if (defaultLabels && defaultLabels.length > 0) {
      initialLabels = defaultLabels.filter(label => labels.includes(label));
    } else {
      initialLabels = [labels[0]];
    }
  } else if (defaultLabels && defaultLabels.length > 0) {
    initialLabels = defaultLabels;
  }

  const apiUrl =
    script?.src.replace(/\/widget(?:\.v[\d.]+)?\.js(?:\?.*)?$/, '/api') ||
    `${window.location.origin}/api`;

  return {
    repo,
    apiUrl,
    availableLabels,
    initialLabels,
    showLabelUI,
  };
}

function parseBrowser(ua: string): { name: string; version: string } {
  const browsers = [
    { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/ },
    { name: 'Opera', pattern: /(?:OPR|Opera)\/(\d+[\d.]*)/ },
    { name: 'Chrome', pattern: /Chrome\/(\d+[\d.]*)/ },
    { name: 'Safari', pattern: /Version\/(\d+[\d.]*).*Safari/ },
    { name: 'Firefox', pattern: /Firefox\/(\d+[\d.]*)/ },
  ];
  for (const { name, pattern } of browsers) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] || 'unknown' };
  }
  return { name: 'Unknown', version: 'unknown' };
}

function parseOS(ua: string): { name: string; version: string } {
  const osPatterns: Array<{ name: string; pattern: RegExp; versionIndex?: number }> = [
    { name: 'iOS', pattern: /iPhone OS (\d+[_\d]*)/, versionIndex: 1 },
    { name: 'iOS', pattern: /iPad.*OS (\d+[_\d]*)/, versionIndex: 1 },
    { name: 'macOS', pattern: /Mac OS X (\d+[_.\d]*)/, versionIndex: 1 },
    { name: 'Windows', pattern: /Windows NT (\d+\.\d+)/, versionIndex: 1 },
    { name: 'Android', pattern: /Android (\d+[\d.]*)/, versionIndex: 1 },
    { name: 'Linux', pattern: /Linux/ },
    { name: 'Chrome OS', pattern: /CrOS/ },
  ];
  for (const { name, pattern, versionIndex } of osPatterns) {
    const match = ua.match(pattern);
    if (match) {
      const version =
        versionIndex !== undefined && match[versionIndex]
          ? match[versionIndex].replace(/_/g, '.')
          : '';
      return { name, version };
    }
  }
  return { name: 'Unknown', version: '' };
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function getMetadata(
  elementSelector: string | null,
  fullElementSelector: string | null
): FeedbackMetadata {
  const ua = navigator.userAgent;
  return {
    url: redactUrl(window.location.href),
    userAgent: ua,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timestamp: new Date().toISOString(),
    ...(elementSelector ? { elementSelector } : {}),
    ...(fullElementSelector ? { fullElementSelector } : {}),
    browser: parseBrowser(ua),
    os: parseOS(ua),
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
  };
}

function initWidget(config: WidgetConfig): void {
  widgetConfig = config;

  const host = document.createElement('div');
  host.id = 'wti-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const root = injectStyles(shadow);
  widgetRoot = root;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'wti-trigger';
  trigger.textContent = 'Feedback';
  trigger.setAttribute('aria-label', 'Send feedback');
  trigger.addEventListener('click', () => openFeedbackFlow());
  root.appendChild(trigger);

  window.WebToIssues = {
    open: () => {
      if (!isModalOpen) openFeedbackFlow();
    },
    close: () => {
      if (!isModalOpen || !widgetRoot) return;
      widgetRoot.querySelector('.wti-overlay')?.remove();
      isModalOpen = false;
    },
  };
}

async function openFeedbackFlow(): Promise<void> {
  if (!widgetRoot || !widgetConfig || isModalOpen) return;
  isModalOpen = true;

  const installStatus = await checkInstallation(widgetConfig);
  if (installStatus !== 'installed') {
    showInstallPrompt(installStatus === 'not_installed');
    return;
  }

  let formResult: FeedbackFormResult | null = null;
  while (true) {
    formResult = await showFeedbackForm(widgetRoot, {
      availableLabels: widgetConfig.availableLabels,
      initialLabels: widgetConfig.initialLabels,
      showLabelUI: widgetConfig.showLabelUI,
    }, formResult);

    if (!formResult) {
      isModalOpen = false;
      return;
    }

    const screenshotResult = await runScreenshotCaptureFlow(
      widgetRoot,
      {
        screenshotMode: 'optional',
        theme: 'auto',
      },
      formResult.includeScreenshot,
      () => {}
    );

    if (screenshotResult.returnToForm) continue;

    await submitFeedback(formResult, screenshotResult.screenshot, {
      elementSelector: screenshotResult.elementSelector,
      fullElementSelector: screenshotResult.fullElementSelector,
    });
    break;
  }

  isModalOpen = false;
}

async function checkInstallation(config: WidgetConfig): Promise<'installed' | 'not_installed' | 'unreachable'> {
  try {
    const response = await fetch(`${config.apiUrl}/check/${config.repo}`);
    if (!response.ok) return 'unreachable';
    const data = await response.json();
    return data.installed === true ? 'installed' : 'not_installed';
  } catch {
    return 'unreachable';
  }
}

function showInstallPrompt(notInstalled: boolean): void {
  if (!widgetRoot || !widgetConfig) return;

  const title = notInstalled ? 'Install Required' : 'Connection Error';
  const message = notInstalled
    ? 'WebToIssues requires the GitHub App to be installed on this repository.'
    : 'Unable to reach the WebToIssues API. Check your network connection or script tag URL.';

  const overlay = document.createElement('div');
  overlay.className = 'wti-overlay';
  overlay.innerHTML = `
    <div class="wti-modal">
      <div class="wti-header">
        <h2 class="wti-title">${title}</h2>
        <button type="button" class="wti-close" aria-label="Close">&times;</button>
      </div>
      <div class="wti-body">
        <p style="margin: 0 0 16px; color: var(--wti-text-secondary);">${message}</p>
        <div class="wti-actions">
          <button type="button" class="wti-btn wti-btn-secondary" data-action="cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  widgetRoot.appendChild(overlay);

  const close = () => {
    overlay.remove();
    isModalOpen = false;
  };
  overlay.querySelector('.wti-close')?.addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
}

async function submitFeedback(
  form: FeedbackFormResult,
  screenshot: string | null,
  selectors: { elementSelector: string | null; fullElementSelector: string | null }
): Promise<void> {
  if (!widgetRoot || !widgetConfig) return;

  const payload = {
    repo: widgetConfig.repo,
    title: form.title,
    description: form.description,
    labels: form.labels.length > 0 ? form.labels : undefined,
    screenshot: screenshot || undefined,
    attachments: form.attachments.length > 0 ? form.attachments : undefined,
    metadata: getMetadata(selectors.elementSelector, selectors.fullElementSelector),
  };

  const submitting = document.createElement('div');
  submitting.className = 'wti-overlay';
  submitting.innerHTML = `
    <div class="wti-modal">
      <div class="wti-body" style="display:flex;flex-direction:column;align-items:center;padding:32px;">
        <div class="wti-spinner"></div>
        <p class="wti-loading-text" style="margin-top:12px;">Submitting feedback...</p>
      </div>
    </div>
  `;
  widgetRoot.appendChild(submitting);

  try {
    const response = await fetch(`${widgetConfig.apiUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    submitting.remove();

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      showErrorModal(data.error || 'Failed to submit feedback.');
      return;
    }

    const data = await response.json();
    await showSuccessModal(
      widgetRoot,
      data.issueNumber,
      data.issueUrl,
      data.isPublic === true
    );
  } catch {
    submitting.remove();
    showErrorModal('Failed to submit feedback. Please try again.');
  }
}

function showErrorModal(message: string): void {
  if (!widgetRoot) return;
  const overlay = document.createElement('div');
  overlay.className = 'wti-overlay';
  overlay.innerHTML = `
    <div class="wti-modal">
      <div class="wti-header">
        <h2 class="wti-title">Submission Failed</h2>
        <button type="button" class="wti-close" aria-label="Close">&times;</button>
      </div>
      <div class="wti-body">
        <div class="wti-error-message">
          <span class="wti-error-message__text">${message}</span>
        </div>
        <div class="wti-actions">
          <button type="button" class="wti-btn wti-btn-primary" data-action="done">OK</button>
        </div>
      </div>
    </div>
  `;
  widgetRoot.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.wti-close')?.addEventListener('click', close);
  overlay.querySelector('[data-action="done"]')?.addEventListener('click', close);
}

const config = buildConfig();
if (config) {
  initWidget(config);
}
