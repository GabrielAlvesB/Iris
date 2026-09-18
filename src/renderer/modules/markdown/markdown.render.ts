function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return out;
}

const TABLE_SEPARATOR_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  const listStack: Array<'ul' | 'ol'> = [];
  let paragraphBuffer: string[] = [];

  function flushParagraph(): void {
    if (paragraphBuffer.length > 0) {
      html.push(`<p>${inlineFormat(paragraphBuffer.join(' '))}</p>`);
      paragraphBuffer = [];
    }
  }

  function closeLists(): void {
    while (listStack.length > 0) {
      html.push(`</${listStack.pop()}>`);
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    const fenceMatch = line.match(/^```/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        flushParagraph();
        closeLists();
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        inCodeBlock = false;
      }
      i += 1;
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeLists();
      i += 1;
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flushParagraph();
      closeLists();
      html.push('<hr />');
      i += 1;
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flushParagraph();
      closeLists();
      const level = headerMatch[1].length;
      html.push(`<h${level}>${inlineFormat(headerMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeLists();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${inlineFormat(quoteLines.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\|.*\|$/.test(line) && lines[i + 1] && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      flushParagraph();
      closeLists();
      const headerCells = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i += 1;
      }
      let table = `<table><thead><tr>${headerCells.map((c) => `<th>${inlineFormat(c)}</th>`).join('')}</tr></thead><tbody>`;
      rows.forEach((row) => {
        table += `<tr>${row.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`;
      });
      table += '</tbody></table>';
      html.push(table);
      continue;
    }

    // Task list items: - [ ] or - [x]
    const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      flushParagraph();
      if (listStack[listStack.length - 1] !== 'ul') {
        closeLists();
        html.push('<ul class="task-list">');
        listStack.push('ul');
      }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      html.push(
        `<li class="task-list-item${isChecked ? ' is-checked' : ''}"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled /> <span>${inlineFormat(taskMatch[2])}</span></li>`,
      );
      i += 1;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (listStack[listStack.length - 1] !== 'ul') {
        closeLists();
        html.push('<ul>');
        listStack.push('ul');
      }
      html.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      i += 1;
      continue;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (listStack[listStack.length - 1] !== 'ol') {
        closeLists();
        html.push('<ol>');
        listStack.push('ol');
      }
      html.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      i += 1;
      continue;
    }

    closeLists();
    paragraphBuffer.push(line.trim());
    i += 1;
  }

  flushParagraph();
  closeLists();
  if (inCodeBlock && codeBuffer.length > 0) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

