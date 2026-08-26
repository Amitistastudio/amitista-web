import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function OutboundLink({ icon: Icon, label, href, className = '' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`group/link inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-300 hover:text-white tracking-tight transition-colors min-w-0 ${className}`}
    >
      {Icon && (
        <Icon className="w-3.5 h-3.5 shrink-0 text-muted group-hover/link:text-violet-400 transition-colors duration-300" />
      )}
      <span className="truncate underline underline-offset-4 decoration-[#33333f] group-hover/link:decoration-violet-400 transition-colors duration-300">
        {label}
      </span>
      <ArrowUpRight
        size={12}
        strokeWidth={2}
        className="shrink-0 text-muted group-hover/link:text-violet-400 transition-colors duration-300"
      />
    </a>
  );
}
