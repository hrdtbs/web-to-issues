import {
  beginViewportCapture,
  canCaptureViewportNatively,
  getRedactionCount,
  isFullPageDisabled,
} from './screenshot';
import { createModal, redactionNoteHtml } from './ui';

export type ScreenshotChoice =
  | { kind: 'skip' }
  | { kind: 'capture' }
  | { kind: 'element' }
  | { kind: 'area' }
  | { kind: 'cancel' }
  | { kind: 'viewport'; capture: Promise<string> };

export function showScreenshotOptions(
  root: HTMLElement,
  opts?: { allowSkip?: boolean }
): Promise<ScreenshotChoice> {
  const fullPageDisabled = isFullPageDisabled();
  const nativeViewportAvailable = fullPageDisabled && canCaptureViewportNatively();
  const allowSkip = opts?.allowSkip !== false;

  let redactionNote = '';
  if (nativeViewportAvailable) {
    redactionNote = redactionNoteHtml(
      'Browser viewport capture cannot apply automatic private-field masks. Select Element to preserve automatic masking, or review and cover sensitive areas before sending.'
    );
  } else if (getRedactionCount() > 0) {
    redactionNote = redactionNoteHtml(
      'This site marked some fields for redaction. Review the screenshot before sending.'
    );
  }

  return new Promise(resolve => {
    const complexNote = fullPageDisabled
      ? `<p style="margin: 0 0 12px; padding: 8px 12px; background: var(--wti-bg-secondary, #f5f5f5); border-radius: 6px; font-size: 13px; color: var(--wti-text-secondary);">${nativeViewportAvailable ? 'This page is too complex for full-page or area capture. Capture the visible viewport or select a specific element instead.' : 'This page is too complex for full-page or area capture. Select a specific element instead.'}</p>`
      : '';

    let primaryCaptureButton = '';
    if (!fullPageDisabled) {
      primaryCaptureButton =
        '<button class="wti-btn wti-btn-primary" data-action="capture">Full Page</button>';
    } else if (nativeViewportAvailable) {
      primaryCaptureButton =
        '<button class="wti-btn wti-btn-primary" data-action="viewport">Capture Viewport</button>';
    }

    const modal = createModal(
      root,
      'Capture Screenshot',
      `
        <p style="margin: 0 0 16px; color: var(--wti-text-secondary);">Choose what to capture:</p>
        ${complexNote}
        ${redactionNote}
        <div class="wti-actions wti-screenshot-actions">
          ${primaryCaptureButton}
          ${fullPageDisabled ? '' : '<button class="wti-btn wti-btn-secondary" data-action="area">Select Area</button>'}
          <button class="wti-btn wti-btn-secondary" data-action="element">Select Element</button>
          ${allowSkip ? '<button class="wti-btn wti-btn-quiet" data-action="skip">Skip Screenshot</button>' : ''}
        </div>
      `
    );

    const closeBtn = modal.querySelector('.wti-close') as HTMLElement;
    const skipBtn = modal.querySelector('[data-action="skip"]') as HTMLElement | null;
    const elementBtn = modal.querySelector('[data-action="element"]') as HTMLElement;
    const areaBtn = modal.querySelector('[data-action="area"]') as HTMLElement;
    const captureBtn = modal.querySelector('[data-action="capture"]') as HTMLElement;
    const viewportBtn = modal.querySelector('[data-action="viewport"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'cancel' });
    });

    skipBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'skip' });
    });

    elementBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'element' });
    });

    areaBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'area' });
    });

    captureBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'capture' });
    });

    viewportBtn?.addEventListener('click', () => {
      modal.remove();
      // beginViewportCapture must run synchronously inside the click handler to
      // preserve the user gesture required by getDisplayMedia. The in-flight
      // promise is then handed to capture-flow for awaiting.
      const capture = beginViewportCapture();
      capture.catch(() => {
        // Attach a handler immediately so an early rejection does not surface
        // as 'Unhandled promise rejection' in the brief window before the
        // caller awaits this promise. The real error is still raised on await.
      });
      resolve({ kind: 'viewport', capture });
    });
  });
}
