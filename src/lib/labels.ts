import { IDENTIFIER_LABEL, MAX_LABEL_LENGTH, MAX_LABELS } from '../defaults';

export function validateLabels(raw: unknown): { valid: true; labels: string[] } | { valid: false; error: string } {
  if (raw === undefined || raw === null) {
    return { valid: true, labels: [] };
  }
  if (!Array.isArray(raw)) {
    return { valid: false, error: 'Invalid labels format. Expected an array of strings.' };
  }
  if (raw.length > MAX_LABELS) {
    return { valid: false, error: `Too many labels. Maximum is ${MAX_LABELS}.` };
  }

  const labels: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { valid: false, error: 'Invalid labels format. Expected an array of strings.' };
    }
    const trimmed = item.trim();
    if (!trimmed || hasControlChars(trimmed)) {
      return { valid: false, error: 'Invalid label value.' };
    }
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return {
        valid: false,
        error: `Label "${trimmed.slice(0, 20)}..." exceeds ${MAX_LABEL_LENGTH} characters.`,
      };
    }
    labels.push(trimmed);
  }

  return { valid: true, labels: uniqueLabels(labels) };
}

export function buildIssueLabels(selectedLabels: string[]): string[] {
  return uniqueLabels([...selectedLabels, IDENTIFIER_LABEL]);
}

export function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)];
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
