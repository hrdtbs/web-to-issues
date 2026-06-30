import styles from './styles.css';
import { applyThemeClass, attachSystemThemeListener, resolveTheme } from './theme';
import { escapeHtml, sanitizeUrl } from './sanitize';

export interface FeedbackAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface FeedbackFormResult {
  title: string;
  description: string;
  labels: string[];
  includeScreenshot: boolean;
  attachments: FeedbackAttachment[];
}

interface FeedbackFormOptions {
  availableLabels?: string[];
  initialLabels: string[];
  showLabelUI: boolean;
}

const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export function injectStyles(shadow: ShadowRoot): HTMLElement {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const root = document.createElement('div');
  root.className = 'wti-root';
  const resolved = resolveTheme();
  applyThemeClass(root, resolved);
  shadow.appendChild(root);

  attachSystemThemeListener(next => applyThemeClass(root, next));
  return root;
}

export function redactionNoteHtml(message: string): string {
  return `<div class="wti-redaction-note">${escapeHtml(message)}</div>`;
}

export function createModal(
  container: HTMLElement,
  title: string,
  content: string,
  modalClass = ''
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'wti-overlay';
  const modalClasses = ['wti-modal', modalClass].filter(Boolean).join(' ');

  overlay.innerHTML = `
    <div class="${modalClasses}">
      <div class="wti-header">
        <h2 class="wti-title">${escapeHtml(title)}</h2>
        <button type="button" class="wti-close" aria-label="Close">&times;</button>
      </div>
      <div class="wti-body">${content}</div>
    </div>
  `;

  container.appendChild(overlay);
  return overlay;
}

export function showFeedbackForm(
  root: HTMLElement,
  options: FeedbackFormOptions,
  initialValues?: Partial<FeedbackFormResult> | null
): Promise<FeedbackFormResult | null> {
  return new Promise(resolve => {
    const labelChipsHtml = options.showLabelUI
      ? `
        <div class="wti-form-group">
          <label class="wti-label">Labels</label>
          <div class="wti-chips" id="label-chips">
            ${options.availableLabels
              ?.map(label => {
                const active = options.initialLabels.includes(label) ? ' active' : '';
                return `<button type="button" class="wti-chip${active}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
              })
              .join('')}
          </div>
        </div>
      `
      : '';

    const modal = createModal(
      root,
      'Send Feedback',
      `
        <form id="feedback-form">
          <div class="wti-form-group">
            <label class="wti-label" for="title">Title *</label>
            <input class="wti-input" id="title" required value="${escapeHtml(initialValues?.title || '')}" />
          </div>
          <div class="wti-form-group">
            <label class="wti-label" for="description">Description</label>
            <textarea class="wti-textarea" id="description">${escapeHtml(initialValues?.description || '')}</textarea>
          </div>
          ${labelChipsHtml}
          <div class="wti-evidence-block">
            <div class="wti-evidence-row">
              <div class="wti-screenshot-control">
                <input type="checkbox" id="include-screenshot" class="wti-checkbox" ${initialValues?.includeScreenshot ? 'checked' : ''} />
                <label for="include-screenshot" class="wti-checkbox-label">Include screenshot</label>
              </div>
              <div class="wti-upload-group">
                <div class="wti-upload-row">
                  <button type="button" class="wti-btn wti-btn-secondary wti-upload-button" data-action="choose-uploads">Upload</button>
                  <input type="file" id="attachment-upload" class="wti-upload-input" multiple accept="${ACCEPTED_UPLOAD_TYPES.join(',')}" />
                </div>
              </div>
            </div>
            <div id="attachment-error" class="wti-upload-error" hidden></div>
            <div id="attachment-list" class="wti-upload-list"></div>
          </div>
          <div class="wti-actions">
            <button type="button" class="wti-btn wti-btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="wti-btn wti-btn-primary">Continue</button>
          </div>
        </form>
      `
    );

    const form = modal.querySelector('#feedback-form') as HTMLFormElement;
    const titleInput = modal.querySelector('#title') as HTMLInputElement;
    const descInput = modal.querySelector('#description') as HTMLTextAreaElement;
    const screenshotCheckbox = modal.querySelector('#include-screenshot') as HTMLInputElement;
    const uploadInput = modal.querySelector('#attachment-upload') as HTMLInputElement;
    const uploadButton = modal.querySelector('[data-action="choose-uploads"]') as HTMLButtonElement;
    const uploadList = modal.querySelector('#attachment-list') as HTMLElement;
    const uploadError = modal.querySelector('#attachment-error') as HTMLElement;
    const closeBtn = modal.querySelector('.wti-close') as HTMLElement;
    const cancelBtn = modal.querySelector('[data-action="cancel"]') as HTMLElement;
    const chips = modal.querySelector('#label-chips');

    let selectedLabels = [...options.initialLabels];
    let attachments = [...(initialValues?.attachments ?? [])];

    const closeModal = () => {
      modal.remove();
      resolve(null);
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    chips?.querySelectorAll('.wti-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const label = (chip as HTMLElement).dataset.label;
        if (!label) return;
        if (selectedLabels.includes(label)) {
          selectedLabels = selectedLabels.filter(item => item !== label);
          chip.classList.remove('active');
        } else {
          selectedLabels = [...selectedLabels, label];
          chip.classList.add('active');
        }
      });
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!titleInput.value.trim()) {
        titleInput.classList.add('wti-input--error');
        titleInput.focus();
        return;
      }
      modal.remove();
      resolve({
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        labels: selectedLabels,
        includeScreenshot: screenshotCheckbox.checked,
        attachments,
      });
    });

    titleInput.addEventListener('input', () => titleInput.classList.remove('wti-input--error'));

    const rerenderUploads = () => {
      renderUploadList(uploadList, attachments, index => {
        attachments = attachments.filter((_, itemIndex) => itemIndex !== index);
        rerenderUploads();
      });
    };

    uploadButton.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const files = Array.from(uploadInput.files ?? []);
      uploadInput.value = '';
      uploadError.textContent = '';
      uploadError.hidden = true;

      const remainingSlots = MAX_UPLOAD_FILES - attachments.length;
      if (files.length > remainingSlots) {
        showUploadError(
          uploadError,
          `Upload up to ${MAX_UPLOAD_FILES} files. Remove a file before adding another.`
        );
        return;
      }

      for (const file of files) {
        const validationError = validateUploadFile(file);
        if (validationError) {
          showUploadError(uploadError, validationError);
          return;
        }
      }

      try {
        const nextAttachments = await Promise.all(files.map(fileToAttachment));
        attachments = [...attachments, ...nextAttachments];
        rerenderUploads();
      } catch {
        showUploadError(uploadError, 'Could not read that file. Try another one.');
      }
    });

    rerenderUploads();
  });
}

export function showSuccessModal(
  container: HTMLElement,
  issueNumber: number,
  issueUrl: string,
  isPublic: boolean
): Promise<void> {
  return new Promise(resolve => {
    const safeIssueUrl = sanitizeUrl(issueUrl);
    const issueLink =
      isPublic && safeIssueUrl
        ? `<a href="${escapeHtml(safeIssueUrl)}" target="_blank" rel="noopener noreferrer" class="wti-issue-link">View on GitHub</a>`
        : '';
    const issueInfo = isPublic
      ? `<p class="wti-success-issue">Issue #${issueNumber} has been created.</p>${issueLink}`
      : `<p class="wti-success-issue">Your feedback has been submitted successfully.</p>`;

    const modal = createModal(
      container,
      'Feedback Submitted!',
      `
        <div class="wti-success-content">
          <div class="wti-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          ${issueInfo}
          <div class="wti-actions wti-success-actions">
            <button type="button" class="wti-btn wti-btn-primary" data-action="done">Done</button>
          </div>
        </div>
      `
    );

    const closeBtn = modal.querySelector('.wti-close') as HTMLElement;
    const doneBtn = modal.querySelector('[data-action="done"]') as HTMLElement;
    const closeModal = () => {
      modal.remove();
      resolve();
    };
    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);
  });
}

function validateUploadFile(file: File): string | null {
  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
    return 'That file type is not supported. Upload an image, PDF, or short video.';
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File is too large. Upload files up to ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.`;
  }
  return null;
}

function showUploadError(target: HTMLElement, message: string): void {
  target.textContent = message;
  target.hidden = false;
}

function renderUploadList(
  target: HTMLElement,
  attachments: FeedbackAttachment[],
  onRemove: (index: number) => void
): void {
  target.innerHTML = attachments
    .map(
      (attachment, index) => `
        <div class="wti-upload-item">
          <span class="wti-upload-item__name">${escapeHtml(attachment.name)}</span>
          <span class="wti-upload-item__meta">${formatFileSize(attachment.size)}</span>
          <button type="button" class="wti-upload-remove" data-index="${index}" aria-label="Remove file">&times;</button>
        </div>
      `
    )
    .join('');

  target.querySelectorAll('.wti-upload-remove').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number((button as HTMLElement).dataset.index);
      if (Number.isInteger(index)) onRemove(index);
    });
  });
}

function fileToAttachment(file: File): Promise<FeedbackAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read file.'));
        return;
      }
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
      });
    });
    reader.addEventListener('error', () => reject(new Error('Could not read file.')));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
