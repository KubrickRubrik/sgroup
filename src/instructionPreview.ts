import { ReviewFixRow } from './reviewAgent';

/** Rendered instruction page for a Syn3 editor tab. */

export function instructionTitle(markdown: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  return heading?.[1]?.trim() || 'Syn3';
}

export function instructionPageHtml(markdown: string): string {
  const title = escapeHtml(instructionTitle(markdown));
  const body = markdownToHtml(markdown);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>${title}</title>
<style>
  body {
    margin: 0;
    padding: 20px 28px 48px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-markdown-font-family, var(--vscode-font-family));
    font-size: var(--vscode-markdown-font-size, 14px);
    line-height: 1.55;
  }
  main { max-width: 760px; }
  h1, h2, h3 { font-weight: 600; line-height: 1.3; }
  h1 { font-size: 1.6em; margin: 0 0 0.6em; }
  h2 { font-size: 1.25em; margin: 1.4em 0 0.5em; }
  h3 { font-size: 1.05em; margin: 1.2em 0 0.4em; }
  p { margin: 0.6em 0; }
  a { color: var(--vscode-textLink-foreground); }
  a:hover { color: var(--vscode-textLink-activeForeground); }
  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.92em;
    background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.2));
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }
  ul, ol { margin: 0.4em 0 0.8em; padding-left: 1.4em; }
  li { margin: 0.25em 0; }
  li > ul, li > ol { margin: 0.2em 0 0.3em; }
  table { border-collapse: collapse; margin: 0.8em 0 1em; }
  th, td {
    border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.4));
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }
  td.review-level { vertical-align: middle; white-space: nowrap; width: 1%; }
  .review-level-mark { align-items: center; display: inline-flex; gap: 8px; }
  .review-level-dot { border-radius: 50%; flex: none; height: 6px; width: 6px; }
  .review-level-high { background: #a53d3f; }
  .review-level-medium { background: #d68b42; }
  .review-level-low { background: #8b9396; }
  th { background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.15)); }
</style>
</head>
<body>
<main>${body}</main>
<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!(link instanceof HTMLAnchorElement) || !link.href) return;
    event.preventDefault();
    vscode.postMessage({ type: 'openLink', href: link.href });
  });
</script>
</body>
</html>`;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith('|')) {
      const table = readTable(lines, index);
      blocks.push(table.html);
      index = table.next;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }
    if (isListLine(line)) {
      const list = readList(lines, index);
      blocks.push(list.html);
      index = list.next;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }
  return blocks.join('\n');
}

function isBlockStart(line: string): boolean {
  return line.startsWith('|') || /^(#{1,3})\s+/.test(line) || isListLine(line);
}

function isListLine(line: string): boolean {
  return /^(\s*)(?:\d+\.|[-*])\s+\S/.test(line);
}

function readList(lines: string[], start: number): { html: string; next: number } {
  const indent = lineIndent(lines[start]);
  const ordered = /^\s*\d+\./.test(lines[start]);
  const items: string[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      const next = lines[index + 1];
      if (next && lineIndent(next) >= indent && isListLine(next)) {
        index += 1;
        continue;
      }
      break;
    }
    const current = lineIndent(line);
    if (current < indent || !isListLine(line)) {
      break;
    }
    if (current > indent) {
      break;
    }
    const text = line.replace(/^\s*(?:\d+\.|[-*])\s+/, '');
    index += 1;
    let nested = '';
    if (
      index < lines.length &&
      lines[index].trim() &&
      lineIndent(lines[index]) > indent &&
      isListLine(lines[index])
    ) {
      const child = readList(lines, index);
      nested = child.html;
      index = child.next;
    }
    items.push(`<li>${renderInline(text)}${nested}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.join('')}</${tag}>`, next: index };
}

function readTable(lines: string[], start: number): { html: string; next: number } {
  const rows: string[][] = [];
  let index = start;
  while (index < lines.length && lines[index].trim().startsWith('|')) {
    const cells = lines[index]
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      rows.push(cells);
    }
    index += 1;
  }
  if (rows.length === 0) {
    return { html: '', next: index };
  }
  const levelCol = rows[0].findIndex((cell) => cell.trim().toLowerCase() === 'уровень');
  const whereCol = rows[0].findIndex((cell) => cell.trim().toLowerCase() === 'где');
  const head = rows[0].map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const body = rows
    .slice(1)
    .map((row) => {
      const cells = row.map((cell, index) => {
        if (index === levelCol) {
          return reviewLevelCell(cell);
        }
        if (index === whereCol) {
          return `<td>${renderWhere(cell)}</td>`;
        }
        return `<td>${renderInline(cell)}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return { html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, next: index };
}

type ReviewLevel = { tone: 'high' | 'medium' | 'low'; label: string };

/** Column «Уровень»: a colored dot and one letter, H, M or L. */
function reviewLevel(cell: string): ReviewLevel | undefined {
  const value = cell.trim().toLowerCase();
  if (value === 'h' || value === 'high') {
    return { tone: 'high', label: 'H' };
  }
  if (value === 'm' || value === 'medium') {
    return { tone: 'medium', label: 'M' };
  }
  if (value === 'l' || value === 'low' || value === 's' || value === 'simple') {
    return { tone: 'low', label: 'L' };
  }
  return undefined;
}

function reviewLevelCell(cell: string): string {
  const level = reviewLevel(cell);
  if (!level) {
    return `<td>${renderInline(cell)}</td>`;
  }
  return (
    `<td class="review-level"><span class="review-level-mark">` +
    `<span class="review-level-dot review-level-${level.tone}" aria-hidden="true"></span>` +
    `${level.label}</span></td>`
  );
}

function lineIndent(line: string): number {
  return /^(\s*)/.exec(line)?.[1].length ?? 0;
}

type InlineOpts = { shortFile?: boolean };

function renderInline(text: string, opts?: InlineOpts): string {
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let html = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    html += linkifyFileRefs(text.slice(last, match.index), opts);
    if (match[1] !== undefined) {
      html += renderLink(match[1], match[2], opts);
    } else if (match[3] !== undefined) {
      const file = workspaceFile(match[3], match[3]);
      const shown = file && opts?.shortFile ? fileChipLabel(file) : match[3];
      html += file ? fileAnchor(file, shown) : `<code>${escapeHtml(match[3])}</code>`;
    } else {
      html += `<strong>${renderInline(match[4], opts)}</strong>`;
    }
    last = match.index + match[0].length;
  }
  html += linkifyFileRefs(text.slice(last), opts);
  return html;
}

/** Column «Где»: the link still opens the full path, the label is `File.kt:130`. */
function renderWhere(text: string): string {
  const trimmed = text.trim().replace(/^`+|`+$/g, '');
  const whole = workspaceFile(trimmed, trimmed);
  if (whole && !/[\[\]*]/.test(trimmed)) {
    return fileAnchor(whole, fileChipLabel(whole));
  }
  return renderInline(text, { shortFile: true });
}

/** `media/map.js:13832` and `` `media/map.js:13832` `` become the same file link. */
function linkifyFileRefs(raw: string, opts?: InlineOpts): string {
  const re = /(^|[^\w./@+-])((?:[\w.+@-]+\/)*[\w.+@-]+\.[A-Za-z][\w]*:\d+)(?![\w])/g;
  let html = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    html += escapeHtml(raw.slice(last, match.index) + match[1]);
    const file = workspaceFile(match[2], match[2]);
    const shown = file && opts?.shortFile ? fileChipLabel(file) : match[2];
    html += file ? fileAnchor(file, shown) : escapeHtml(match[2]);
    last = match.index + match[0].length;
  }
  html += escapeHtml(raw.slice(last));
  return html;
}

function renderLink(label: string, href: string, opts?: InlineOpts): string {
  if (/^https?:\/\//i.test(href)) {
    return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }
  const file = workspaceFile(href, label);
  if (!file) {
    return escapeHtml(`[${label}](${href})`);
  }
  const shown = opts?.shortFile ? fileChipLabel(file) : label;
  return fileAnchor(file, shown);
}

/** Visible file label: basename and line, without the directory. */
function fileChipLabel(file: WorkspaceFile): string {
  const name = file.rel.split('/').pop() || file.rel;
  return file.line ? `${name}:${file.line}` : name;
}

type WorkspaceFile = { rel: string; line?: number };

/** Href is a project-relative path. The line comes from `#L123`, `:123`, or the label. */
function workspaceFile(href: string, label: string): WorkspaceFile | undefined {
  let raw = href.trim();
  if (!raw || /^(?:https?|file|vscode|command):/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) {
    return undefined;
  }
  let line: number | undefined;
  const hashAt = raw.indexOf('#');
  if (hashAt >= 0) {
    const hashLine = /^L(\d+)$/i.exec(raw.slice(hashAt + 1));
    if (hashLine) {
      line = Number(hashLine[1]);
    }
    raw = raw.slice(0, hashAt);
  }
  const colon = /:(\d+)$/.exec(raw);
  if (colon) {
    line = line ?? Number(colon[1]);
    raw = raw.slice(0, colon.index);
  }
  if (raw.startsWith('./')) {
    raw = raw.slice(2);
  }
  if (!raw || raw.endsWith('/')) {
    return undefined;
  }
  const parts = raw.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || !/^[\w.+@-]+$/.test(part))) {
    return undefined;
  }
  const name = parts[parts.length - 1];
  if (!name.includes('.') && parts.length < 2) {
    return undefined;
  }
  if (line === undefined) {
    const labelLine = /:(\d+)\s*$/.exec(label.trim());
    if (labelLine) {
      line = Number(labelLine[1]);
    }
  }
  return { rel: parts.join('/'), line: line && line > 0 ? line : undefined };
}

function fileAnchor(file: WorkspaceFile, label: string): string {
  const line = file.line ? ` data-syn3-line="${file.line}"` : '';
  return `<a class="review-file-link" href="#" data-syn3-file="${escapeHtml(file.rel)}"${line}>${escapeHtml(label)}</a>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type ReviewCounts = { h: number; m: number; s: number };

/** Severity counts from review file line 3, with or without the kind/depth prefix. */
function reviewCounts(markdown: string): ReviewCounts | undefined {
  const line = markdown.replace(/\r\n/g, '\n').split('\n')[2] || '';
  const match = line.match(/H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*[LS]:\s*(\d+)/i);
  if (!match) {
    return undefined;
  }
  return { h: Number(match[1]), m: Number(match[2]), s: Number(match[3]) };
}

/**
 * Preview starts at the first `# ` heading. Lines above it are the chip stamp
 * and the H/M/S groups; the parser still reads the full file.
 */
function reviewReadable(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const start = lines.findIndex((line) => /^#\s+\S/.test(line.trim()));
  return start < 0 ? normalized : lines.slice(start).join('\n');
}

/** Body under `## Сначала`, up to the next heading. */
function reviewLead(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^##\s+Сначала\s*$/.test(line.trim()));
  if (start < 0) {
    return '';
  }
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s+\S/.test(line.trim())) {
      break;
    }
    body.push(line);
  }
  return body.join('\n').trim();
}

function withoutReviewSummary(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let skippingLead = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (skippingLead) {
      if (/^#{1,3}\s+\S/.test(trimmed)) {
        skippingLead = false;
      } else {
        continue;
      }
    }
    if (/^##\s+Сначала\s*$/.test(trimmed)) {
      skippingLead = true;
      continue;
    }
    if (/^High\s+\d+\s*·\s*Medium\s+\d+\s*·\s*Low\s+\d+\s*$/i.test(trimmed)) {
      continue;
    }
    if (/^Состав находок(?:\s|:|$)/i.test(trimmed)) {
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

function reviewSummaryHtml(counts: ReviewCounts | undefined, lead: string): string {
  const parts: string[] = [];
  const total = counts ? counts.h + counts.m + counts.s : 0;
  if (counts && total > 0) {
    parts.push(
      `<div class="review-stats">` +
        statHtml('high', counts.h, 'High') +
        statHtml('medium', counts.m, 'Medium') +
        statHtml('low', counts.s, 'Low') +
        `</div>`,
    );
    const segs = [
      counts.h ? `<span class="review-usage-seg review-usage-high" data-count="${counts.h}"></span>` : '',
      counts.m ? `<span class="review-usage-seg review-usage-medium" data-count="${counts.m}"></span>` : '',
      counts.s ? `<span class="review-usage-seg review-usage-low" data-count="${counts.s}"></span>` : '',
    ].join('');
    parts.push(
      `<div class="review-usage">` +
        `<div class="review-usage-top"><span>Состав находок по уровню</span>` +
        `<span>${counts.h} high · ${counts.m} medium · ${counts.s} low</span></div>` +
        `<div class="review-usage-bar">${segs}</div></div>`,
    );
  }
  if (lead) {
    parts.push(
      `<div class="review-callout"><div class="review-callout-title">Сначала</div>` +
        `<div class="review-callout-body">${markdownToHtml(lead)}</div></div>`,
    );
  }
  return parts.join('\n');
}

function statHtml(tone: 'high' | 'medium' | 'low', value: number, label: string): string {
  return (
    `<div class="review-stat review-stat-${tone}">` +
    `<span class="review-stat-value">${value}</span>` +
    `<span class="review-stat-label">${label}</span></div>`
  );
}

/** Place the summary after the title and the first paragraph under it. */
function insertReviewSummary(html: string, summary: string): string {
  if (!summary) {
    return html;
  }
  const h1End = html.indexOf('</h1>');
  if (h1End < 0) {
    return summary + html;
  }
  const afterH1 = h1End + '</h1>'.length;
  const pEnd = html.indexOf('</p>', afterH1);
  const between = pEnd < 0 ? '' : html.slice(afterH1, pEnd);
  const cut =
    pEnd >= 0 && !/<(h\d|ul|ol|table)\b/.test(between) ? pEnd + '</p>'.length : afterH1;
  return html.slice(0, cut) + summary + html.slice(cut);
}

/**
 * Review pane HTML: markdown plus the summary block from the canvas
 * (counts, composition bar, «Сначала»).
 */
/** Green-chip panel: the fixed bullets only, four columns, file paths stay links. */
export function reviewFixTableHtml(rows: ReviewFixRow[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr>${reviewLevelCell(row.level)}<td>${renderInline(row.broken)}</td>` +
        `<td>${renderInline(row.fix)}</td><td>${renderWhere(row.where)}</td></tr>`,
    )
    .join('');
  return (
    `<table><thead><tr><th>Уровень</th><th>Что сломано</th><th>Что чинить</th><th>Где</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

export function reviewFileHtml(markdown: string): string {
  const counts = reviewCounts(markdown);
  const readable = reviewReadable(markdown);
  const lead = reviewLead(readable);
  const html = markdownToHtml(withoutReviewSummary(readable));
  return insertReviewSummary(html, reviewSummaryHtml(counts, lead));
}
