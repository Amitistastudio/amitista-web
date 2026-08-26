import React from 'react';

const SilkCanvas = React.lazy(() => import('./SilkCanvas'));

function containerClasses(className) {
  return `silk-surface w-full h-full overflow-hidden pointer-events-none ${
    className.includes('absolute') ? '' : 'relative'
  } ${className}`.trim();
}

export default function Silk(props) {
  const { className = '' } = props;
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn) => window.setTimeout(fn, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => setReady(true), { timeout: 1500 });
    return () => cancel(handle);
  }, []);

  const placeholder = <div aria-hidden="true" className={containerClasses(className)} />;

  if (!ready) return placeholder;

  return <React.Suspense fallback={placeholder}>
    <SilkCanvas {...props} />
  </React.Suspense>;
}
