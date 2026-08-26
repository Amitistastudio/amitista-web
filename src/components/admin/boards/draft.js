import React from 'react';

const IDLE_MS = 1500;

export function useDraft({ values, onSave, clean, delay = IDLE_MS }) {
  const [draft, setDraft] = React.useState(values);
  const [base, setBase] = React.useState(values);
  const [state, setState] = React.useState('rest');
  const [at, setAt] = React.useState(null);
  const focused = React.useRef('');
  const alive = React.useRef(true);
  const timer = React.useRef(null);
  const flight = React.useRef(false);

  const changes = React.useMemo(() => {
    const raw = {};
    Object.keys(base).forEach((key) => {
      if (draft[key] !== base[key]) raw[key] = draft[key];
    });
    return clean ? clean(raw) : raw;
  }, [draft, base, clean]);

  const dirty = Object.keys(changes).length > 0;
  const wanted = React.useRef(changes);
  const hand = React.useRef(onSave);
  wanted.current = changes;
  hand.current = onSave;

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
      if (Object.keys(wanted.current).length) hand.current?.(wanted.current);
    };
  }, []);

  const save = React.useCallback(async () => {
    window.clearTimeout(timer.current);
    const carry = wanted.current;
    if (!Object.keys(carry).length || flight.current) return;
    flight.current = true;
    setState('saving');
    try {
      const done = await hand.current?.(carry);
      if (!alive.current) return;
      if (done === false) {
        setState('failed');
        return;
      }
      setState('saved');
      setAt(Date.now());
    } catch {
      if (alive.current) setState('failed');
    } finally {
      flight.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!dirty) return undefined;
    if (!flight.current) setState('dirty');
    timer.current = window.setTimeout(save, delay);
    return () => window.clearTimeout(timer.current);
  }, [dirty, changes, delay, save]);

  React.useEffect(() => {
    setDraft((held) => {
      const next = {};
      let moved = Object.keys(held).some((key) => !(key in values));
      Object.keys(values).forEach((key) => {
        if (!(key in held)) {
          next[key] = values[key];
          moved = true;
          return;
        }
        const adopt =
          values[key] !== base[key] && focused.current !== key && held[key] === base[key];
        next[key] = adopt ? values[key] : held[key];
        if (adopt) moved = true;
      });
      return moved ? next : held;
    });
    setBase(values);
  }, [values, base]);

  React.useEffect(() => {
    function key(event) {
      if (!(event.key === 's' && (event.metaKey || event.ctrlKey))) return;
      event.preventDefault();
      save();
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [save]);

  const mood = dirty
    ? state === 'saved'
      ? 'dirty'
      : state
    : state === 'failed'
      ? 'rest'
      : state;

  return {
    draft,
    dirty,
    state: mood,
    at,
    save,
    set: (name, value) => setDraft((held) => ({ ...held, [name]: value })),
    hold: (name) => {
      focused.current = name;
    },
    release: (name, revert) => {
      focused.current = '';
      if (revert) setDraft((held) => ({ ...held, [name]: values[name] }));
      else save();
    },
  };
}
