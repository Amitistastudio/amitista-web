import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { cardFileUrl } from '../../../lib/admin';
import { sizeWords } from './files';
import { useTopEscape } from './shared';

export default function Viewer({ board, card, files, at, onStep, onClose }) {
  const entry = files[at];
  useTopEscape(onClose);

  React.useEffect(() => {
    function key(event) {
      if (event.key === 'ArrowRight') onStep((at + 1) % files.length);
      if (event.key === 'ArrowLeft') onStep((at - 1 + files.length) % files.length);
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [at, files.length, onStep]);

  if (typeof document === 'undefined' || !entry) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-black/92"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[#1c1c22] px-4 py-3">
        <p className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-normal text-neutral-200">{entry.name}</span>
          <span className="block text-[11px] font-normal text-neutral-500">
            {sizeWords(entry.bytes)} · added by {entry.by}
            {files.length > 1 ? ` · ${at + 1} of ${files.length}` : ''}
          </span>
        </p>
        <a
          href={cardFileUrl(board.id, card.id, entry.id, true)}
          aria-label={`Download ${entry.name}`}
          className="shrink-0 border border-[#282832] p-1.5 text-neutral-400 transition-colors hover:text-white"
        >
          <Download className="h-4 w-4" strokeWidth={2} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the picture"
          className="shrink-0 border border-[#282832] p-1.5 text-neutral-400 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 py-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {files.length > 1 && (
          <button
            type="button"
            aria-label="The one before"
            onClick={() => onStep((at - 1 + files.length) % files.length)}
            className="shrink-0 p-2 text-neutral-500 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2} />
          </button>
        )}
        <img
          src={cardFileUrl(board.id, card.id, entry.id)}
          alt={entry.name}
          className="max-h-full min-h-0 w-auto max-w-full object-contain"
        />
        {files.length > 1 && (
          <button
            type="button"
            aria-label="The next one"
            onClick={() => onStep((at + 1) % files.length)}
            className="shrink-0 p-2 text-neutral-500 transition-colors hover:text-white"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2} />
          </button>
        )}
      </div>

      {files.length > 1 && (
        <div className="quiet-scroll flex shrink-0 justify-center gap-2 overflow-x-auto border-t border-[#1c1c22] px-4 py-3">
          {files.map((held, index) => (
            <button
              key={held.id}
              type="button"
              aria-label={held.name}
              aria-current={index === at}
              onClick={() => onStep(index)}
              className={`h-12 w-16 shrink-0 overflow-hidden border transition-colors ${
                index === at ? 'border-purple-500/70' : 'border-[#282832] hover:border-[#3f3f4c]'
              }`}
            >
              <img
                src={cardFileUrl(board.id, card.id, held.id, false, held.thumb)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
