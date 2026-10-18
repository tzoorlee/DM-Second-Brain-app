import React from 'react';
import { isDmSecretsHeading, splitDmSecrets } from '../utils/secrets';

// A small markdown renderer for wiki pages. It covers what the page templates
// use (headings, lists, quotes, rules, bold/italic/code, [[wikilinks]]) and
// nothing more, so no markdown dependency is needed.

interface LinkProps {
  // Returns the page path for a [[target]], or undefined if no visible page matches
  resolveLink: (target: string) => string | undefined;
  onOpenLink: (relativePath: string) => void;
}

interface WikiMarkdownProps extends LinkProps {
  body: string;
  title: string;
  dmMode: boolean;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; nested: boolean }[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let afterBlank = false;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];

    if (!line.trim()) {
      flush();
      afterBlank = true;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const numbered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);

    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flush();
      blocks.push({ kind: 'hr' });
    } else if (bullet || numbered) {
      flush();
      const [, indent, text] = (bullet ?? numbered)!;
      const ordered = !bullet;
      const item = { text, nested: indent.length >= 2 };
      if (last?.kind === 'list' && (last.ordered === ordered || item.nested)) last.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
    } else if (line.startsWith('>')) {
      flush();
      const text = line.replace(/^>\s?/, '');
      if (last?.kind === 'quote' && !afterBlank) last.text += ' ' + text;
      else blocks.push({ kind: 'quote', text });
    } else if (!paragraph.length && !afterBlank && last?.kind === 'list' && /^\s/.test(raw)) {
      // Indented line right after a list item: the item wrapped
      last.items[last.items.length - 1].text += ' ' + line.trim();
    } else {
      // Consecutive lines are one paragraph, as in standard markdown
      paragraph.push(line.trim());
    }
    afterBlank = false;
  }
  flush();
  return blocks;
}

const INLINE_TOKEN = /(`[^`]+`)|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/g;

function renderInline(text: string, links: LinkProps, keyPrefix = ''): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index;
    const key = `${keyPrefix}${index}`;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const [token, code, wikilink, bold] = match;

    if (code) {
      nodes.push(<code key={key}>{code.slice(1, -1)}</code>);
    } else if (wikilink) {
      const inner = wikilink.slice(2, -2);
      const pipe = inner.indexOf('|');
      const target = pipe === -1 ? inner : inner.slice(0, pipe);
      const label = pipe === -1 ? inner : inner.slice(pipe + 1);
      const resolved = links.resolveLink(target);
      nodes.push(
        resolved ? (
          <button key={key} type="button" className="wikilink" onClick={() => links.onOpenLink(resolved)}>
            {label}
          </button>
        ) : (
          <span key={key} className="wikilink-missing" title={`No page for "${target}" in this view`}>
            {label}
          </span>
        )
      );
    } else if (bold) {
      nodes.push(<strong key={key}>{renderInline(bold.slice(2, -2), links, `${key}-`)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), links, `${key}-`)}</em>);
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Inline markdown only, for single values such as a frontmatter `location`
export function WikiInline({ text, ...links }: LinkProps & { text: string }) {
  return <>{renderInline(text, links)}</>;
}

export default function WikiMarkdown({ body, title, dmMode, ...links }: WikiMarkdownProps) {
  // The server already strips the DM-only section in Player Safe; strip it here
  // too so a page fetched in DM View never shows secrets after switching
  const visibleBody = dmMode ? body : splitDmSecrets(body).publicBody;
  const blocks = parseBlocks(visibleBody);

  // The sheet already shows the title, so skip a leading H1 that repeats it
  const first = blocks[0];
  if (first?.kind === 'heading' && first.level === 1 && first.text.trim().toLowerCase() === title.trim().toLowerCase()) {
    blocks.shift();
  }

  return (
    <div className="markdown">
      {blocks.map((block, idx) => {
        const inline = (text: string) => renderInline(text, links, `${idx}-`);
        switch (block.kind) {
          case 'heading': {
            const isSecrets = block.level === 2 && isDmSecretsHeading(`## ${block.text}`);
            const Tag = `h${Math.min(block.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
            return (
              <Tag key={idx} className={isSecrets ? 'secrets-heading' : undefined}>
                {inline(block.text)}
              </Tag>
            );
          }
          case 'paragraph':
            return <p key={idx}>{inline(block.text)}</p>;
          case 'quote':
            return <blockquote key={idx}>{inline(block.text)}</blockquote>;
          case 'hr':
            return <hr key={idx} />;
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag key={idx}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} style={item.nested ? { marginLeft: '18px' } : undefined}>
                    {renderInline(item.text, links, `${idx}-${itemIdx}-`)}
                  </li>
                ))}
              </ListTag>
            );
          }
        }
      })}
    </div>
  );
}
