import React from 'react';
import { TURNSTILE_SITEKEY } from '../siteConfig';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const TURNSTILE_FIELD = 'cf-turnstile-response';

export const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITEKEY);

let loader = null;

function loadScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('turnstile needs a browser'));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const settle = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile did not load'));
    };
    const fail = () => {
      loader = null;
      reject(new Error('turnstile was blocked'));
    };

    const existing = document.querySelector(`script[data-turnstile="1"]`);
    if (existing) {
      existing.addEventListener('load', settle, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = '1';
    script.addEventListener('load', settle, { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.appendChild(script);
  });

  return loader;
}

export function useTurnstile(action) {
  const containerRef = React.useRef(null);
  const widgetRef = React.useRef(null);
  const [token, setToken] = React.useState('');
  const [state, setState] = React.useState(TURNSTILE_ENABLED ? 'loading' : 'off');

  React.useEffect(() => {
    if (!TURNSTILE_ENABLED) return undefined;

    let cancelled = false;

    loadScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetRef.current !== null) return;
        widgetRef.current = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITEKEY,
          action,
          callback: (value) => {
            setToken(value);
            setState('ready');
          },
          'error-callback': () => {
            setToken('');
            setState('error');
          },
          'expired-callback': () => {
            setToken('');
            setState('expired');
          },
          'timeout-callback': () => {
            setToken('');
            setState('expired');
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      const id = widgetRef.current;
      widgetRef.current = null;
      if (id !== null && typeof window !== 'undefined' && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          setState('error');
        }
      }
    };
  }, [action]);

  const reset = React.useCallback(() => {
    setToken('');
    if (widgetRef.current === null || typeof window === 'undefined' || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetRef.current);
      setState('loading');
    } catch {
      setState('error');
    }
  }, []);

  return {
    containerRef,
    token,
    reset,
    state,
    enabled: TURNSTILE_ENABLED,
    blocking: TURNSTILE_ENABLED && !token,
  };
}
