import React from 'react';
import { isMenuModifier } from './platform';

const OPEN_SEARCH_EVENT = 'amitista:open-search';

function readRequest(detail) {
  if (typeof detail === 'string') return { query: detail, ask: false };
  if (detail && typeof detail === 'object' && typeof detail.query === 'string') {
    return { query: detail.query, ask: Boolean(detail.ask) };
  }
  return { query: '', ask: false };
}

export function openSearch(query = '') {
  window.dispatchEvent(
    new CustomEvent(OPEN_SEARCH_EVENT, { detail: typeof query === 'string' ? query : '' }),
  );
}

export function openAsk(question = '') {
  window.dispatchEvent(
    new CustomEvent(OPEN_SEARCH_EVENT, {
      detail: { query: typeof question === 'string' ? question : '', ask: true },
    }),
  );
}

export default function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [seed, setSeed] = React.useState('');
  const [ask, setAsk] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));

      if (event.key.toLowerCase() === 'k' && isMenuModifier(event)) {
        event.preventDefault();
        setSeed('');
        setAsk(false);
        setOpen((value) => !value);
        return;
      }

      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setSeed('');
        setAsk(false);
        setOpen(true);
      }
    };

    const onRequest = (event) => {
      const request = readRequest(event.detail);
      setSeed(request.query);
      setAsk(request.ask);
      setOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onRequest);
    };
  }, []);

  return {
    open,
    seed,
    ask,
    openPalette: React.useCallback((query = '') => {
      setSeed(typeof query === 'string' ? query : '');
      setAsk(false);
      setOpen(true);
    }, []),
    closePalette: React.useCallback(() => setOpen(false), []),
  };
}
