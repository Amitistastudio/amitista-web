import React from 'react';

const DISCIPLINES = ['WEB DEVELOPMENT', 'APPLICATIONS', 'GAME SERVERS'];
const APPROACH = ['UI / UX DESIGN', 'CUSTOM SYSTEMS', 'ONGOING SUPPORT'];

export default function SubheaderBar() {
  return (
    <div className="w-full border-t border-b border-[#222228] flex justify-center bg-[#060608] relative z-20">
      <div className="w-full max-w-[1480px] border-x border-[#282832] min-h-14 py-3 sm:py-0 px-6 sm:px-10 flex items-center justify-between gap-6 text-[10px] sm:text-xs font-semibold text-neutral-300 tracking-[0.2em]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {DISCIPLINES.map((item, i) => (
            <React.Fragment key={item}>
              {i > 0 && <span className="text-muted select-none">/</span>}
              <span>{item}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-x-3 text-neutral-400 whitespace-nowrap">
          {APPROACH.map((item, i) => (
            <React.Fragment key={item}>
              {i > 0 && <span className="text-muted select-none">/</span>}
              <span>{item}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
