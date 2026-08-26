import React from 'react';

const WorldMap = React.lazy(() => import('./WorldMap'));

export default function LazyMap(props) {
  return (
    <React.Suspense
      fallback={
        <div className="px-4 sm:px-6 py-5">
          <div className="w-full aspect-[1000/389] bg-[#0f0f14] border border-[#17171d] flex items-center justify-center">
            <span className="text-[12px] text-neutral-600 font-normal">Drawing the map…</span>
          </div>
        </div>
      }
    >
      <WorldMap {...props} />
    </React.Suspense>
  );
}
