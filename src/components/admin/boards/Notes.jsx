import React from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
} from 'lucide-react';
import { Button } from '../ui';
import { Dialog, SaveMark } from './shared';

export const NOTES_MAX = 2000;

const LINK = /^\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]{1,300})\)/;

const INLINE = [
  { mark: '**', tag: 'strong', className: 'font-semibold text-white' },
  { mark: '__', tag: 'u', className: 'underline underline-offset-2 decoration-neutral-500' },
  { mark: '~~', tag: 's', className: 'text-neutral-500' },
  { mark: '*', tag: 'em', className: 'italic' },
  { mark: '_', tag: 'em', className: 'italic' },
  { mark: '`', tag: 'code', className: 'border border-[#282832] bg-[#111115] px-1 py-[1px] font-mono text-[12px] text-neutral-200' },
];

export const MARKS = [
  { id: 'bold', label: 'Bold', icon: Bold, wrap: '**', sample: 'bold', key: 'b' },
  { id: 'italic', label: 'Italic', icon: Italic, wrap: '*', sample: 'italic', key: 'i' },
  { id: 'underline', label: 'Underline', icon: Underline, wrap: '__', sample: 'underlined', key: 'u' },
  { id: 'strike', label: 'Crossed out', icon: Strikethrough, wrap: '~~', sample: 'gone' },
  { id: 'big', label: 'Big heading', icon: Heading1, line: '# ', sample: 'Heading' },
  { id: 'small', label: 'Smaller heading', icon: Heading2, line: '## ', sample: 'Heading' },
  { id: 'bullets', label: 'Bullets', icon: List, line: '- ', sample: 'Something' },
  { id: 'numbers', label: 'Numbered', icon: ListOrdered, line: '1. ', sample: 'Something' },
  { id: 'quote', label: 'Quote', icon: Quote, line: '> ', sample: 'Quoted' },
  { id: 'code', label: 'Code', icon: Code, wrap: '`', sample: 'code' },
  { id: 'link', label: 'Link', icon: Link2, wrap: null, link: true, sample: 'the label' },
];

function inline(raw, depth = 0) {
  const nodes = [];
  let plain = '';
  let index = 0;
  let key = 0;

  const flush = () => {
    if (plain) nodes.push(plain);
    plain = '';
  };

  while (index < raw.length) {
    const rest = raw.slice(index);
    const link = LINK.exec(rest);
    if (link) {
      flush();
      nodes.push(
        <a
          key={`l${key}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-purple-300 underline underline-offset-2 transition-colors hover:text-purple-200"
        >
          {link[1]}
        </a>,
      );
      key += 1;
      index += link[0].length;
      continue;
    }
    const found =
      depth < 3
        ? INLINE.find(
            (entry) =>
              rest.startsWith(entry.mark) &&
              rest.indexOf(entry.mark, entry.mark.length) > entry.mark.length,
          )
        : undefined;
    if (found) {
      const end = rest.indexOf(found.mark, found.mark.length);
      const inner = rest.slice(found.mark.length, end);
      flush();
      nodes.push(
        React.createElement(
          found.tag,
          { key: `m${key}`, className: found.className },
          found.tag === 'code' ? inner : inline(inner, depth + 1),
        ),
      );
      key += 1;
      index += end + found.mark.length;
      continue;
    }
    plain += raw[index];
    index += 1;
  }
  flush();
  return nodes;
}

function paragraph(lines, key) {
  return (
    <p key={key} className="text-[13px] font-normal leading-relaxed text-neutral-300">
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && <br />}
          {inline(line)}
        </React.Fragment>
      ))}
    </p>
  );
}

export function renderNotes(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let held = [];
  let kind = null;
  let key = 0;

  const close = () => {
    if (!held.length) {
      kind = null;
      return;
    }
    if (kind === 'bullets' || kind === 'numbers') {
      const Tag = kind === 'bullets' ? 'ul' : 'ol';
      blocks.push(
        React.createElement(
          Tag,
          {
            key: `b${key}`,
            className: `ml-4 space-y-1 text-[13px] font-normal leading-relaxed text-neutral-300 ${
              kind === 'bullets' ? 'list-disc' : 'list-decimal'
            }`,
          },
          held.map((line, index) => (
            <li key={index} className="pl-1">
              {inline(line)}
            </li>
          )),
        ),
      );
    } else if (kind === 'quote') {
      blocks.push(
        <blockquote
          key={`b${key}`}
          className="border-l-2 border-purple-500/40 pl-3 text-[13px] font-normal italic leading-relaxed text-neutral-400"
        >
          {held.map((line, index) => (
            <React.Fragment key={index}>
              {index > 0 && <br />}
              {inline(line)}
            </React.Fragment>
          ))}
        </blockquote>,
      );
    } else {
      blocks.push(paragraph(held, `b${key}`));
    }
    key += 1;
    held = [];
    kind = null;
  };

  const push = (next, line) => {
    if (kind !== next) close();
    kind = next;
    held.push(line);
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      close();
      return;
    }
    if (line.startsWith('# ')) {
      close();
      blocks.push(
        <h4 key={`b${key}`} className="text-[17px] font-medium leading-snug text-white">
          {inline(line.slice(2))}
        </h4>,
      );
      key += 1;
      return;
    }
    if (line.startsWith('## ')) {
      close();
      blocks.push(
        <h5 key={`b${key}`} className="text-[14px] font-semibold leading-snug text-neutral-200">
          {inline(line.slice(3))}
        </h5>,
      );
      key += 1;
      return;
    }
    if (line.startsWith('> ')) {
      push('quote', line.slice(2));
      return;
    }
    if (/^[-*] /.test(line)) {
      push('bullets', line.slice(2));
      return;
    }
    if (/^\d+[.)] /.test(line)) {
      push('numbers', line.replace(/^\d+[.)] /, ''));
      return;
    }
    push('text', line);
  });
  close();
  return blocks;
}

export function NotesBody({ text, className = '' }) {
  const blocks = renderNotes(text);
  if (!blocks.length) return null;
  return <div className={`space-y-2.5 ${className}`}>{blocks}</div>;
}

function place(node, next, from, to) {
  window.requestAnimationFrame(() => {
    node.focus();
    node.setSelectionRange(from, to);
  });
  return next;
}

export function applyMark(node, mark, url) {
  const value = node.value;
  const start = node.selectionStart ?? value.length;
  const end = node.selectionEnd ?? start;
  const chosen = value.slice(start, end);

  if (mark.link) {
    const label = chosen || mark.sample;
    const target = url || 'https://';
    const made = `[${label}](${target})`;
    const next = value.slice(0, start) + made + value.slice(end);
    const at = start + label.length + 3;
    return place(node, next, at, at + target.length);
  }

  if (mark.line) {
    const head = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const tailAt = value.indexOf('\n', end);
    const tail = tailAt === -1 ? value.length : tailAt;
    const body = value.slice(head, tail) || mark.sample;
    const already = body.split('\n').every((line) => line.startsWith(mark.line));
    const lines = body
      .split('\n')
      .map((line) => (already ? line.slice(mark.line.length) : mark.line + line))
      .join('\n');
    const next = value.slice(0, head) + lines + value.slice(tail);
    return place(node, next, head, head + lines.length);
  }

  const body = chosen || mark.sample;
  const wrapped = value.slice(start, end).startsWith(mark.wrap) && value.slice(start, end).endsWith(mark.wrap);
  if (wrapped && chosen.length > mark.wrap.length * 2) {
    const bare = chosen.slice(mark.wrap.length, -mark.wrap.length);
    const next = value.slice(0, start) + bare + value.slice(end);
    return place(node, next, start, start + bare.length);
  }
  const made = `${mark.wrap}${body}${mark.wrap}`;
  const next = value.slice(0, start) + made + value.slice(end);
  const at = start + mark.wrap.length;
  return place(node, next, at, at + body.length);
}

export function NoteEditor({ title, value, disabled, state, at, onChange, onSave, onClose }) {
  const box = React.useRef(null);
  const left = NOTES_MAX - (value ?? '').length;

  const fire = React.useCallback(
    (mark) => {
      const node = box.current;
      if (!node || disabled) return;
      onChange(applyMark(node, mark));
    },
    [disabled, onChange],
  );

  return (
    <Dialog
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="flex flex-wrap items-center gap-3">
            <span
              className={`text-[11px] tabular-nums ${left < 100 ? 'text-amber-300' : 'text-neutral-600'}`}
            >
              {(value ?? '').length} of {NOTES_MAX}
            </span>
            <SaveMark state={state} at={at} disabled={disabled} onSave={onSave} />
          </span>
          <Button type="button" tone="solid" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 border border-[#282832] bg-[#0a0a0d] p-1.5">
          {MARKS.map((mark) => {
            const Icon = mark.icon;
            return (
              <button
                key={mark.id}
                type="button"
                disabled={disabled}
                title={mark.key ? `${mark.label} (⌘/Ctrl + ${mark.key.toUpperCase()})` : mark.label}
                aria-label={mark.label}
                onClick={() => fire(mark)}
                className="inline-flex h-7 w-7 items-center justify-center text-neutral-500 transition-colors hover:bg-[#141419] hover:text-neutral-100 disabled:opacity-40"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            );
          })}
        </div>

        <textarea
          ref={box}
          value={value}
          autoFocus
          rows={20}
          maxLength={NOTES_MAX}
          disabled={disabled}
          spellCheck
          placeholder={'What is this about?\n\n# A heading\n**bold**, __underlined__, *italic*\n- a list\n> a quote'}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey)) return;
            const mark = MARKS.find((entry) => entry.key && entry.key === event.key.toLowerCase());
            if (!mark) return;
            event.preventDefault();
            fire(mark);
          }}
          className="w-full resize-y border border-[#282832] bg-[#111115] px-4 py-3 text-[13px] leading-relaxed text-white placeholder-neutral-700 outline-none transition-colors focus:border-purple-500/60"
        />

        <p className="text-[11px] font-normal leading-relaxed text-neutral-600">
          Select some words and press a button, or use ⌘/Ctrl + B, I and U. It saves itself as you
          type — Done just closes this.
        </p>
      </div>
    </Dialog>
  );
}
