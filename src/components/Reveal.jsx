import React from 'react';

export default function Reveal({ children, className = '', delay = 0, rise = false, id }) {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(true);
  const [immediate, setImmediate_] = React.useState(true);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return undefined;

    if (node.getBoundingClientRect().top < window.innerHeight) return undefined;

    setImmediate_(false);
    setShown(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: 0.05, rootMargin: '0px 0px -6% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      style={shown && !immediate ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${immediate ? '' : 'transition-all duration-700 ease-out'} ${
        shown ? 'opacity-100 translate-y-0' : `opacity-0 ${rise ? 'translate-y-5' : ''}`
      } ${className}`}
    >
      {children}
    </div>
  );
}
