import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function SubprocessorTable({ entries }) {
  return (
    <div className="border border-[#282832] mt-2">
      {entries.map((entry, index) => (
        <div
          key={entry.name}
          className={`p-5 bg-[#0a0a0d] flex flex-col gap-2 ${
            index > 0 ? 'border-t border-[#1c1c22]' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-white leading-snug">{entry.name}</span>
            {entry.unconfirmed && (
              <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.15em] text-amber-400/90">
                <AlertTriangle size={11} strokeWidth={2} />
                UNCONFIRMED
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-400 font-normal leading-relaxed">
            {entry.purpose}
          </p>
          {entry.entity && (
            <p className="font-tech text-[11px] text-muted leading-relaxed">
              {entry.entity}
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1 font-tech text-[11px] text-muted">
            <span>Location: {entry.location}</span>
            <span>Applies to: {entry.scope}</span>
          </div>
          {entry.caveat && (
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed border-l-2 border-[#282832] pl-3 mt-1">
              {entry.caveat}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
