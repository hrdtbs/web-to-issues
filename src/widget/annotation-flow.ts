import { createAnnotator, type Tool } from './annotator';
import { createModal, redactionNoteHtml } from './ui';

export function showAnnotationStep(
  root: HTMLElement,
  screenshot: string,
  redactionCount = 0,
  opts?: {
    redactionUnavailable?: boolean;
    redactionLimitations?: boolean;
    selectedElementCapture?: boolean;
  }
): Promise<string | 'retake' | 'cancel'> {
  return new Promise(resolve => {
    const redactionMessages: string[] = [];
    if (opts?.redactionUnavailable) {
      redactionMessages.push(
        'This browser viewport capture could not apply automatic private-field masks. Review and cover any sensitive areas before sending.'
      );
    } else {
      if (redactionCount > 0) {
        redactionMessages.push(
          `${redactionCount} private ${redactionCount === 1 ? 'item was' : 'items were'} marked for redaction in this screenshot. Review before sending.`
        );
      }
      if (opts?.redactionLimitations) {
        redactionMessages.push(
          'WebToIssues only covered the measured marked boxes. It does not inspect pixels inside embedded or rendered content such as iframes, canvas, images, SVGs, videos, CSS backgrounds, or custom controls. Confirm the black box fully covers the sensitive region before sending, or retake after marking a larger wrapper.'
        );
      }
    }
    const redactionNote = redactionMessages.length
      ? redactionNoteHtml(redactionMessages.join(' '))
      : '';
    const selectedElementNote = '';
    const modal = createModal(
      root,
      'Review Screenshot',
      `
        ${redactionNote}
        <p style="margin: 0 0 12px; color: var(--wti-text-secondary); font-size: 13px;">
          Check that no sensitive information is visible before sending. Cover sensitive areas before submitting. Redactions are baked into the uploaded image.
        </p>
        ${selectedElementNote}
        <div class="wti-tools">
          <button class="wti-tool active" data-tool="draw">Draw</button>
          <button class="wti-tool" data-tool="arrow">Arrow</button>
          <button class="wti-tool" data-tool="rect">Rectangle</button>
          <button class="wti-tool" data-tool="text">Text</button>
          <button class="wti-tool" data-tool="redact">Redact</button>
          <button class="wti-tool" data-action="undo">Undo</button>
        </div>
        <div id="annotation-canvas" class="wti-annotation-stage"></div>
        <div class="wti-actions">
          <button class="wti-btn wti-btn-secondary" data-action="retake">Retake</button>
          <button class="wti-btn wti-btn-primary" data-action="done">Submit Feedback</button>
        </div>
      `,
      'wti-modal--annotator'
    );

    const canvasContainer = modal.querySelector('#annotation-canvas') as HTMLElement;
    const annotator = createAnnotator(canvasContainer, screenshot);

    const toolButtons = modal.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.currentTarget as HTMLElement;
        const tool = target.dataset.tool;

        if (tool) {
          toolButtons.forEach(b => b.classList.remove('active'));
          target.classList.add('active');
          annotator.setTool(tool as Tool);
        }
      });
    });

    const undoBtn = modal.querySelector('[data-action="undo"]') as HTMLElement | null;
    undoBtn?.addEventListener('click', () => annotator.undo());

    const closeBtn = modal.querySelector('.wti-close') as HTMLElement;
    const retakeBtn = modal.querySelector('[data-action="retake"]') as HTMLElement;
    const doneBtn = modal.querySelector('[data-action="done"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve('cancel');
    });

    retakeBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve('retake');
    });

    doneBtn?.addEventListener('click', () => {
      const annotated = annotator.getImageData();
      annotator.destroy();
      modal.remove();
      resolve(annotated);
    });
  });
}
