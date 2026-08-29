import React from 'react';
import { ExternalLink } from 'lucide-react';

export const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '—');

export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const listOf = (repo, key) => (Array.isArray(repo?.[key]) ? repo[key] : []);

export function GithubLink({ href, children = 'OPEN', title }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? 'Open on GitHub in a new tab'}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors shrink-0"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </a>
  );
}
