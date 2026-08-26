import React from 'react';

const INLINE =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

const LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;

function inline(text, key) {
  const parts = String(text).split(INLINE).filter((part) => part !== undefined && part !== '');

  return parts.map((part, index) => {
    const id = `${key}-${index}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={id} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return (
        <strong key={id} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <span key={id} className="line-through opacity-70">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={id} className="font-mono text-[12px] text-purple-200 bg-[#16161c] px-1 py-[1px]">
          {part.slice(1, -1)}
        </code>
      );
    }

    const link = LINK.exec(part);
    if (link) {
      return (
        <a
          key={id}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-purple-300 underline underline-offset-2 hover:text-purple-200 break-all"
        >
          {link[1]}
        </a>
      );
    }

    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return (
        <em key={id} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <React.Fragment key={id}>{part}</React.Fragment>;
  });
}

export default function Rich({ text, tone = 'text-neutral-300' }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null;

  const flush = () => {
    if (!list) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="flex flex-col gap-1 pl-4">
        {list.map((item, index) => (
          <li key={index} className="list-disc marker:text-neutral-600">
            {inline(item, `li${blocks.length}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    list = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `b${index}`;

    if (/^\s*[-*•]\s+/.test(line) && !line.startsWith('-# ')) {
      list = list || [];
      list.push(line.replace(/^\s*[-*•]\s+/, ''));
      return;
    }
    flush();

    if (!line.trim()) {
      blocks.push(<div key={key} className="h-2" />);
      return;
    }

    if (line.startsWith('-# ')) {
      blocks.push(
        <p key={key} className="text-[11px] text-neutral-500 leading-relaxed">
          {inline(line.slice(3), key)}
        </p>,
      );
      return;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={key} className="text-[13px] font-semibold text-white leading-snug">
          {inline(heading[2], key)}
        </p>,
      );
      return;
    }

    if (line.startsWith('> ') || line === '>') {
      blocks.push(
        <p key={key} className="border-l-2 border-[#282832] pl-3 text-neutral-400 leading-relaxed">
          {inline(line.replace(/^>\s?/, ''), key)}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={key} className="leading-relaxed">
        {inline(line, key)}
      </p>,
    );
  });

  flush();

  return <div className={`text-[13px] ${tone} font-normal break-words`}>{blocks}</div>;
}
