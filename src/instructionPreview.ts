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
  const head = rows[0].map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const body = rows
    .slice(1)
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('');
  return { html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, next: index };
}

function lineIndent(line: string): number {
  return /^(\s*)/.exec(line)?.[1].length ?? 0;
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
