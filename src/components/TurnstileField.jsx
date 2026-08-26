import React from 'react';

export default function TurnstileField({ turnstile, className = '' }) {
  if (!turnstile.enabled) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div ref={turnstile.containerRef} />
      {turnstile.state === 'error' ? (
        <p className="text-xs text-red-400 font-normal leading-relaxed">
          The verification check could not load. Turn off any content blocker for this page and reload, or
          write to us directly.
        </p>
      ) : null}
      {turnstile.state === 'expired' ? (
        <p className="text-xs text-muted font-normal leading-relaxed">
          That verification expired. Complete the check once more.
        </p>
      ) : null}
    </div>
  );
}
