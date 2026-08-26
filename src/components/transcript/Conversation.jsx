import React from 'react';
import { Paperclip } from 'lucide-react';

const GROUP_WINDOW_MS = 4 * 60 * 1000;

export function formatStamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatClock(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDay(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iso(ms) {
  if (!ms) return undefined;
  const when = new Date(ms);
  return Number.isNaN(when.getTime()) ? undefined : when.toISOString();
}

export function Avatar({ name, avatar, className }) {
  if (avatar) {
    return <img src={avatar} alt="" loading="lazy" className={`${className} object-cover bg-[#111118]`} />;
  }
  return (
    <span
      className={`${className} flex items-center justify-center bg-[#111118] text-[12px] font-semibold text-neutral-500`}
      aria-hidden="true"
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Chip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[#282832] bg-[#0a0a0d] px-3 py-1.5 text-[12px] font-normal text-neutral-400">
      {Icon && <Icon className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />}
      {children}
    </span>
  );
}

function Time({ ts }) {
  return (
    <time
      dateTime={iso(ts)}
      className="shrink-0 select-none pt-[3px] font-mono text-[11px] tabular-nums leading-[1.5] text-neutral-600"
    >
      {formatClock(ts)}
    </time>
  );
}

function Attachments({ files }) {
  if (!files?.length) return null;

  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {files.map((file, index) =>
        file.isImage && file.src ? (
          <li key={`${file.name}-${index}`}>
            <a href={file.src} target="_blank" rel="noopener noreferrer" className="block w-fit">
              <img
                src={file.src}
                alt={file.name}
                loading="lazy"
                className="max-h-[280px] w-auto max-w-full border border-[#282832] bg-[#0a0a0d]"
              />
            </a>
            <span className="mt-1 block font-mono text-[11px] text-neutral-600">
              {file.name} · {formatSize(file.size)}
            </span>
          </li>
        ) : (
          <li
            key={`${file.name}-${index}`}
            className="flex w-fit items-center gap-2 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
            <span className="font-mono text-[11.5px] text-neutral-300">{file.name}</span>
            <span className="font-mono text-[11px] text-neutral-600">{formatSize(file.size)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

function Embed({ embed }) {
  return (
    <div className="mt-2 max-w-[560px] border border-[#282832] border-l-2 border-l-[#3d3d4a] bg-[#0a0a0d] px-3.5 py-2.5">
      {embed.author && <p className="text-[11px] uppercase tracking-[0.1em] text-neutral-600">{embed.author}</p>}
      {embed.title && (
        <p className="text-[13px] text-neutral-100">
          {embed.url ? (
            <a href={embed.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
              {embed.title}
            </a>
          ) : (
            embed.title
          )}
        </p>
      )}
      {embed.description && (
        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-neutral-400">{embed.description}</p>
      )}
      {embed.image && (
        <img src={embed.image} alt="" loading="lazy" className="mt-2 max-h-[220px] w-auto max-w-full border border-[#282832]" />
      )}
      {embed.footer && <p className="mt-2 text-[11px] text-neutral-600">{embed.footer}</p>}
    </div>
  );
}

function Entry({ message, name, grouped }) {
  const files = message.attachments || [];
  const embeds = message.embeds || [];

  return (
    <li className={`flex gap-4 px-1 ${grouped ? 'py-0.5' : 'border-t border-[#141419] pt-3 pb-1 first:border-t-0'}`}>
      <Time ts={message.ts} />

      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="mb-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-200">{name}</span>
            {message.author?.bot && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">app</span>
            )}
          </p>
        )}

        {message.reply && (
          <p className="mb-1.5 truncate border-l border-[#282832] pl-3 text-[11.5px] text-neutral-600">
            in reply to <span className="text-neutral-500">{message.reply.author}</span> — {message.reply.snippet}
          </p>
        )}

        {message.html && (
          <div
            className="tx-body max-w-[75ch] break-words text-[13.5px] leading-[1.65] text-neutral-300"
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        )}

        <Attachments files={files} />
        {embeds.map((embed, index) => (
          <Embed key={`${message.id}-embed-${index}`} embed={embed} />
        ))}
      </div>
    </li>
  );
}

function Event({ message }) {
  return (
    <li className="flex gap-4 border-t border-[#141419] px-1 pt-2 pb-1">
      <Time ts={message.ts} />
      <span
        className="tx-body min-w-0 flex-1 text-[12px] italic leading-[1.6] text-neutral-600"
        dangerouslySetInnerHTML={{ __html: message.system?.html || '' }}
      />
    </li>
  );
}

export function Conversation({ messages }) {
  const rows = [];
  let last = null;
  let day = '';

  for (const message of messages) {
    const stamped = formatDay(message.ts);
    if (stamped && stamped !== day) {
      rows.push({ kind: 'day', key: `day-${message.id}`, label: stamped });
      day = stamped;
      last = null;
    }

    if (message.kind !== 'message') {
      rows.push({ kind: 'event', key: message.id, message });
      last = null;
      continue;
    }

    const name = message.author?.name || 'Unknown';
    const grouped =
      Boolean(last) &&
      last.name === name &&
      Math.abs(Number(message.ts) - Number(last.ts)) < GROUP_WINDOW_MS &&
      !message.reply;

    rows.push({ kind: 'entry', key: message.id, message, name, grouped });
    last = { name, ts: message.ts };
  }

  return (
    <ol className="flex flex-col px-5 py-4 sm:px-7">
      {rows.map((row) => {
        if (row.kind === 'day') {
          return (
            <li key={row.key} className="flex items-center gap-3 pb-2 pt-7 first:pt-1">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                {row.label}
              </span>
              <span className="h-px flex-1 bg-[#1c1c22]" aria-hidden="true" />
            </li>
          );
        }
        if (row.kind === 'event') return <Event key={row.key} message={row.message} />;
        return <Entry key={row.key} message={row.message} name={row.name} grouped={row.grouped} />;
      })}
    </ol>
  );
}
