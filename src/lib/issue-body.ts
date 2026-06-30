import type { FeedbackAttachment, FeedbackPayload } from '../types';

type UploadedAttachment = FeedbackAttachment & { url: string };

export function formatIssueBody(
  payload: FeedbackPayload,
  screenshotUrl?: string,
  uploadedAttachments: UploadedAttachment[] = []
): string {
  const sections: string[] = [];

  if (payload.description) {
    sections.push('## Description');
    sections.push(payload.description);
    sections.push('');
  }

  if (screenshotUrl) {
    sections.push('## Screenshot');
    sections.push(`![Screenshot](${screenshotUrl})`);
    if (payload.metadata.elementSelector) {
      sections.push('');
      sections.push(`_Selected element: \`${payload.metadata.elementSelector}\`_`);
    }
    sections.push('');
  }

  if (uploadedAttachments.length > 0) {
    sections.push('## Attachments');
    for (const attachment of uploadedAttachments) {
      const safeName = attachment.name.replace(/`/g, "'");
      if (attachment.type.startsWith('image/')) {
        sections.push(`![${safeName}](${attachment.url})`);
      } else {
        sections.push(`- [${safeName}](${attachment.url})`);
      }
    }
    sections.push('');
  }

  sections.push('<details>');
  sections.push('<summary>System Info</summary>');
  sections.push('');
  sections.push('| Property | Value |');
  sections.push('|----------|-------|');

  if (payload.metadata.browser) {
    sections.push(
      `| Browser | ${payload.metadata.browser.name} ${payload.metadata.browser.version} |`
    );
  }
  if (payload.metadata.os) {
    sections.push(`| OS | ${payload.metadata.os.name} ${payload.metadata.os.version} |`);
  }

  sections.push(`| URL | ${payload.metadata.url} |`);
  sections.push(
    `| Viewport | ${payload.metadata.viewport.width} × ${payload.metadata.viewport.height} |`
  );

  if (payload.metadata.devicePixelRatio) {
    sections.push(`| Device Pixel Ratio | ${payload.metadata.devicePixelRatio} |`);
  }
  if (payload.metadata.language) {
    sections.push(`| Language | ${payload.metadata.language} |`);
  }

  sections.push(`| Timestamp | ${payload.metadata.timestamp} |`);
  sections.push('');
  sections.push('</details>');

  return sections.join('\n');
}
