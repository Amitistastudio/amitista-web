import React from 'react';

export function H2({ id, children }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 text-[19px] font-semibold text-neutral-900 dark:text-white tracking-tight mt-14 mb-4 first:mt-0"
    >
      {children}
    </h2>
  );
}

export function H3({ children }) {
  return (
    <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 mt-8 mb-2">
      {children}
    </h3>
  );
}

export function P({ children }) {
  return (
    <p className="text-[15px] leading-[1.8] text-neutral-600 dark:text-neutral-400 mb-5">
      {children}
    </p>
  );
}

export function UL({ children }) {
  return (
    <ul className="flex flex-col gap-2.5 mb-6 pl-5 list-disc marker:text-neutral-500 dark:marker:text-muted">
      {children}
    </ul>
  );
}

export function OL({ children }) {
  return (
    <ol className="flex flex-col gap-2.5 mb-6 pl-5 list-decimal marker:text-neutral-500 dark:marker:text-muted">
      {children}
    </ol>
  );
}

export function LI({ children }) {
  return (
    <li className="text-[15px] leading-[1.8] text-neutral-600 dark:text-neutral-400 pl-1.5">
      {children}
    </li>
  );
}

export function Code({ children }) {
  return (
    <code className="font-mono text-[13px] text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

export function Pre({ children, label }) {
  return (
    <figure className="mb-6">
      {label && (
        <figcaption className="text-[13px] text-neutral-500 dark:text-muted mb-2">
          {label}
        </figcaption>
      )}
      <pre className="overflow-x-auto p-5 rounded-lg bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.06]">
        <code className="font-mono text-[13px] leading-[1.7] text-neutral-700 dark:text-neutral-300 whitespace-pre">
          {children}
        </code>
      </pre>
    </figure>
  );
}

export function Note({ title, children }) {
  return (
    <aside className="mb-6 pl-5 border-l border-neutral-200 dark:border-white/10">
      {title && (
        <p className="text-[15px] font-medium text-neutral-900 dark:text-neutral-200 mb-1.5">
          {title}
        </p>
      )}
      <div className="text-[15px] leading-[1.8] text-neutral-500 dark:text-neutral-500 [&>p]:mb-0">
        {children}
      </div>
    </aside>
  );
}

export function Table({ head, rows }) {
  return (
    <div className="mb-7 overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="py-2.5 pr-6 text-[13px] font-medium text-neutral-500 dark:text-muted whitespace-nowrap border-b border-neutral-200 dark:border-white/10"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-neutral-100 dark:border-white/[0.06]">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`py-3 pr-6 text-[14px] leading-[1.7] align-top ${
                    cellIndex === 0
                      ? 'text-neutral-800 dark:text-neutral-200'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function A({ href, children }) {
  return (
    <a
      href={href}
      className="text-neutral-900 dark:text-neutral-100 underline decoration-neutral-300 dark:decoration-neutral-600 underline-offset-[3px] hover:decoration-neutral-900 dark:hover:decoration-neutral-200 transition-colors"
    >
      {children}
    </a>
  );
}
