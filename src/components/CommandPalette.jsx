import React from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  FileText,
  Briefcase,
  Layers,
  GitBranch,
  BookOpen,
  HelpCircle,
  Sparkles,
  Clock,
  CornerDownLeft,
  Loader2,
  X,
} from 'lucide-react';
import { buildSections, highlightRanges, nearestItem, tokenize } from '../lib/search';
import { recentPages, rememberPage, clearRecentPages } from '../lib/recentPages';
import { askAssistant, answerParts, MIN_QUESTION } from '../lib/ask';

const SECTION_ICONS = {
  file: FileText,
  briefcase: Briefcase,
  layers: Layers,
  'git-branch': GitBranch,
  book: BookOpen,
  help: HelpCircle,
  sparkles: Sparkles,
  clock: Clock,
};

const PAGE_JUMP = 5;

const PANEL_WIDTH = 280;

const LIST_MAX = 304;
const SHEET_FRACTION = 0.6;

const EXIT_MS = 220;

const MOVEMENT = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];

function Highlight({ text, ranges }) {
  if (!ranges.length) return text;

  const parts = [];
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(<React.Fragment key={`t${index}`}>{text.slice(cursor, start)}</React.Fragment>);
    parts.push(
      <mark key={`m${index}`} className="bg-transparent text-violet-300 font-semibold">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < text.length) parts.push(<React.Fragment key="tail">{text.slice(cursor)}</React.Fragment>);

  return <>{parts}</>;
}

export default function CommandPalette({ open, onClose, initialQuery = '', initialAsk = false }) {
  const [query, setQuery] = React.useState(initialQuery);
  const [selected, setSelected] = React.useState(0);
  const [anchor, setAnchor] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  const [listHeight, setListHeight] = React.useState(null);
  const [visible, setVisible] = React.useState(false);
  const [entered, setEntered] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [answer, setAnswer] = React.useState(null);
  const [askError, setAskError] = React.useState('');
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const askedRef = React.useRef(false);
  const keyboardRef = React.useRef(true);
  const pointerRef = React.useRef({ x: 0, y: 0 });

  const found = React.useMemo(() => buildSections(query, recent), [query, recent]);
  const terms = React.useMemo(() => tokenize(query), [query]);
  const askable = query.trim().length >= MIN_QUESTION;

  const sections = found;

  const askItem = React.useMemo(
    () => (askable ? { ask: true, href: '#ask', title: `Ask AI: “${query.trim()}”` } : null),
    [askable, query],
  );

  const flat = React.useMemo(() => {
    const items = sections.flatMap((section) => section.items);
    return askItem ? [...items, askItem] : items;
  }, [sections, askItem]);

  const askIndex = flat.length - 1;
  const empty = found.length === 0;
  const suggestion = React.useMemo(
    () => (empty && terms.length ? nearestItem(query) : null),
    [empty, terms.length, query],
  );
  const answering = asking || Boolean(answer) || Boolean(askError);

  React.useEffect(() => {
    setSelected(0);
    setAnswer(null);
    setAskError('');
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      return undefined;
    }

    setEntered(false);
    const timer = setTimeout(() => setVisible(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open || !visible || entered) return;
    void panelRef.current?.offsetWidth;
    setEntered(true);
  }, [open, visible, entered]);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const measure = () => {
      const button = document.querySelector('header button[aria-label="Search the site"]');
      const rect = button?.getBoundingClientRect();
      if (!rect || !rect.width) {
        setAnchor(null);
        return;
      }
      setAnchor({
        top: Math.max(10, Math.round(rect.top) - 4),
        width: Math.round(rect.width),
        right: Math.max(10, Math.round(document.documentElement.clientWidth - rect.right)),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  React.useLayoutEffect(() => {
    if (!visible) return;
    const content = contentRef.current;
    if (!content) return;

    const cap = anchor ? LIST_MAX : Math.round(window.innerHeight * SHEET_FRACTION);
    setListHeight(Math.min(content.offsetHeight, cap));
  }, [visible, anchor, sections, suggestion, asking, answer, askError]);

  React.useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement;
    setQuery(initialQuery);
    setSelected(0);
    setAnswer(null);
    setAskError('');
    setAsking(false);
    setRecent(recentPages());

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onEscape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onEscape);
      const inside = panelRef.current?.contains(document.activeElement);
      if (inside || !document.activeElement || document.activeElement === document.body) {
        openerRef.current?.focus?.();
      }
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (open && visible) inputRef.current?.focus();
  }, [open, visible]);

  React.useEffect(() => {
    if (!open || !keyboardRef.current) return;
    const row = listRef.current?.querySelector('[data-selected="true"]');
    if (!row) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [selected, open]);

  const runAsk = React.useCallback(async (override) => {
    const question = (typeof override === 'string' ? override : query).trim();
    if (question.length < MIN_QUESTION || asking) return;

    setAsking(true);
    setAskError('');
    setAnswer(null);

    try {
      const reply = await askAssistant(question);
      setAnswer({ question, ...reply });
    } catch (error) {
      setAskError(error.message);
    } finally {
      setAsking(false);
    }
  }, [query, asking]);

  React.useEffect(() => {
    if (!open) {
      askedRef.current = false;
      return;
    }
    if (!initialAsk || askedRef.current) return;
    if (initialQuery.trim().length < MIN_QUESTION) return;
    askedRef.current = true;
    runAsk(initialQuery);
  }, [open, initialAsk, initialQuery, runAsk]);

  const dismissAnswer = React.useCallback(() => {
    setAnswer(null);
    setAskError('');
    inputRef.current?.focus();
  }, []);

  const go = React.useCallback(
    (item, newTab = false) => {
      if (!item) return;

      if (item.ask) {
        runAsk();
        return;
      }

      rememberPage(item);

      if (newTab) {
        window.open(item.href, '_blank', 'noopener');
        return;
      }

      onClose();
      window.location.href = item.href;
    },
    [onClose, runAsk],
  );

  const move = (next) => {
    keyboardRef.current = true;
    setSelected(next);
  };

  const trapTab = (event) => {
    const focusable = panelRef.current?.querySelectorAll(
      'input, button:not([disabled]), a[href]',
    );
    if (!focusable?.length) return;

    const list = Array.from(focusable);
    const index = list.indexOf(document.activeElement);
    const next = event.shiftKey
      ? list[(index - 1 + list.length) % list.length]
      : list[(index + 1) % list.length];

    event.preventDefault();
    next.focus();
  };

  const onKeyDown = (event) => {
    if (!open) return;

    const last = flat.length - 1;

    if (answering && event.key !== 'Escape' && event.key !== 'Tab') {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!asking && answer?.page) {
          onClose();
          window.location.href = answer.page;
        }
        return;
      }

      if (MOVEMENT.includes(event.key)) {
        event.preventDefault();
        return;
      }
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        if (answering && !asking) {
          dismissAnswer();
          return;
        }
        onClose();
        return;

      case 'Tab':
        trapTab(event);
        return;

      case 'ArrowDown':
        event.preventDefault();
        move(flat.length ? (selected + 1) % flat.length : 0);
        return;

      case 'ArrowUp':
        event.preventDefault();
        move(flat.length ? (selected - 1 + flat.length) % flat.length : 0);
        return;

      case 'Home':
      case 'End':
        if (query) return;
        event.preventDefault();
        move(event.key === 'Home' ? 0 : Math.max(0, last));
        return;

      case 'PageDown':
        event.preventDefault();
        move(Math.min(last, selected + PAGE_JUMP));
        return;

      case 'PageUp':
        event.preventDefault();
        move(Math.max(0, selected - PAGE_JUMP));
        return;

      case 'Enter':
        event.preventDefault();
        go(flat[selected] || suggestion, event.metaKey || event.ctrlKey);
        return;

      default:
    }
  };

  const onPointerMove = (event, index) => {
    const { x, y } = pointerRef.current;
    if (event.clientX === x && event.clientY === y) return;

    pointerRef.current = { x: event.clientX, y: event.clientY };
    keyboardRef.current = false;
    setSelected(index);
  };

  const dropRecent = () => {
    clearRecentPages();
    setRecent([]);
    setSelected(0);
    inputRef.current?.focus();
  };

  if (!visible) return null;

  let cursor = -1;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] ${open ? '' : 'pointer-events-none'}`}
      role={open ? 'dialog' : 'presentation'}
      aria-modal={open ? 'true' : undefined}
      aria-label={open ? 'Search the site' : undefined}
    >
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default"
      />

      <div
        ref={panelRef}
        onKeyDown={onKeyDown}
        style={{
          ...(anchor
            ? {
                top: anchor.top,
                right: anchor.right,
                width: entered ? PANEL_WIDTH : anchor.width,
              }
            : null),
          opacity: entered ? 1 : 0,
          transform: anchor || entered ? 'none' : 'translateY(-6px)',
        }}
        className={`absolute border border-[#282832] bg-[#0a0a0d] shadow-2xl shadow-black/50 overflow-hidden palette-panel ${
          anchor ? 'max-w-[calc(100vw-1.25rem)]' : 'origin-top left-3 right-3 top-3'
        }`}
      >
        <div
          className="flex flex-col"
          style={anchor ? { width: PANEL_WIDTH } : { width: '100%' }}
        >
        <div className="flex items-center gap-2.5 px-3.5 h-11 border-b border-[#1a1a20] shrink-0">
          <Search size={14} strokeWidth={2} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or ask a question…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-autocomplete="list"
            aria-activedescendant={flat.length && !answering ? `palette-option-${selected}` : undefined}
            autoComplete="off"
            spellCheck="false"
            enterKeyHint="go"
            className="flex-1 min-w-0 bg-transparent text-white text-[13px] outline-none placeholder:text-muted"
          />
          {anchor ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="shrink-0 text-muted hover:text-white transition-colors cursor-pointer"
            >
              <X size={15} strokeWidth={2} />
            </button>
          )}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {terms.length === 0
            ? ''
            : `${flat.length} ${flat.length === 1 ? 'result' : 'results'} for ${query.trim()}`}
        </p>

        <div
          id="palette-results"
          role={answering ? 'region' : 'listbox'}
          aria-label={answering ? 'Assistant answer' : 'Search results'}
        >
        <div
          ref={listRef}
          style={{ height: entered ? listHeight ?? undefined : 0 }}
          className="overflow-y-auto overscroll-contain palette-scroll palette-list"
        >
          <div
            ref={contentRef}
            style={{ transform: entered ? 'none' : 'translateY(-10px)' }}
            className="palette-rise"
          >
            {answering ? (
              <div className="px-3.5 py-3 flex flex-col gap-2" aria-live="polite">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} strokeWidth={2} className="shrink-0 text-violet-400" />
                  <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-neutral-600">
                    Assistant
                  </span>
                </div>

                {asking && (
                  <p className="flex items-center gap-2 text-[13px] text-neutral-400">
                    <Loader2 size={13} strokeWidth={2} className="shrink-0 text-violet-400 palette-spin" />
                    Thinking…
                  </p>
                )}

                {!asking && askError && <p className="text-[13px] text-neutral-400">{askError}</p>}

                {!asking && !askError && answer && (
                  <p className="text-[13px] leading-relaxed text-neutral-200">
                    {answerParts(answer.text).map((part, index) =>
                      part.href ? (
                        <a
                          key={`p${index}`}
                          href={part.href}
                          onClick={onClose}
                          className="text-violet-300 underline underline-offset-2 decoration-[#3b3b52] hover:decoration-violet-300 transition-colors"
                        >
                          {part.text}
                        </a>
                      ) : (
                        <React.Fragment key={`p${index}`}>{part.text}</React.Fragment>
                      ),
                    )}
                  </p>
                )}

                {!asking && !askError && answer?.page && (
                  <a
                    href={answer.page}
                    onClick={onClose}
                    className="flex items-center gap-2 -mx-1 px-1 py-1 text-[12px] text-neutral-300 hover:text-white transition-colors"
                  >
                    <CornerDownLeft size={11} strokeWidth={2} className="shrink-0 text-neutral-600" />
                    <span className="truncate">
                      Open <span className="text-violet-300">{answer.page}</span>
                    </span>
                  </a>
                )}

                <p className="text-[10px] text-neutral-600">
                  {asking && 'Asking the assistant…'}
                  {!asking && askError && 'Esc goes back.'}
                  {!asking && !askError && 'Answers can be wrong. Esc goes back.'}
                </p>
              </div>
            ) : (
              <>
            {empty && (
              <div className="px-4 py-6 flex flex-col items-center text-center gap-2.5">
                <p className="text-[13px] text-neutral-400">
                  Nothing matches “{query.trim()}”.
                </p>
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => go(suggestion)}
                    className="text-[13px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Did you mean <span className="text-violet-300">{suggestion.title}</span>?
                  </button>
                )}
                <a
                  href="/contact"
                  className="text-[10px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] underline underline-offset-4 decoration-[#282832] hover:decoration-neutral-500 transition-colors"
                >
                  ASK US INSTEAD
                </a>
              </div>
            )}

            {sections.length > 0 && (
              <div className="py-1.5">
                {sections.map((section) => {
                  const Icon = SECTION_ICONS[section.icon] ?? FileText;

                  return (
                    <div key={section.label} role="group" aria-label={section.label}>
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-3.5 pt-2.5 pb-1.5 bg-[#0a0a0d] text-[9px] font-semibold tracking-[0.18em] uppercase">
                        <span aria-hidden="true" className="text-neutral-600">
                          {section.label}
                        </span>
                        {section.clearable && (
                          <button
                            type="button"
                            onClick={dropRecent}
                            aria-label="Clear recent pages"
                            className="text-neutral-700 hover:text-neutral-400 transition-colors cursor-pointer"
                          >
                            clear
                          </button>
                        )}
                      </div>
                      {section.items.map((item) => {
                        cursor += 1;
                        const index = cursor;
                        const active = index === selected;

                        return (
                          <div
                            key={`${section.label}-${item.href}-${item.title}`}
                            id={`palette-option-${index}`}
                            role="option"
                            aria-selected={active}
                            data-selected={active}
                            onMouseMove={(event) => onPointerMove(event, index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => go(item, event.metaKey || event.ctrlKey)}
                            className={`flex items-center gap-2.5 px-3.5 h-9 scroll-mt-8 text-left transition-colors cursor-pointer border-l-2 ${
                              active
                                ? 'bg-[#12121a] border-violet-500'
                                : 'border-transparent hover:bg-[#0f0f14]'
                            }`}
                          >
                            <Icon
                              size={14}
                              strokeWidth={1.75}
                              className={`shrink-0 transition-colors ${
                                active ? 'text-violet-400' : 'text-neutral-600'
                              }`}
                            />
                            <span className="min-w-0 flex-1 text-[13px] text-white truncate">
                              {item.ask ? (
                                item.title
                              ) : (
                                <Highlight text={item.title} ranges={highlightRanges(item.title, terms)} />
                              )}
                            </span>
                            {active && (
                              <CornerDownLeft
                                size={12}
                                strokeWidth={2}
                                className="shrink-0 text-neutral-500"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
              </>
            )}
          </div>
        </div>

        {!answering && (
          <div
            id={askItem ? `palette-option-${askIndex}` : undefined}
            role={askItem ? 'option' : undefined}
            aria-selected={askItem ? selected === askIndex : undefined}
            data-selected={askItem ? selected === askIndex : undefined}
            aria-disabled={askItem ? undefined : 'true'}
            onMouseMove={askItem ? (event) => onPointerMove(event, askIndex) : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={askItem ? () => runAsk() : () => inputRef.current?.focus()}
            style={{ opacity: entered ? 1 : 0 }}
            className={`flex items-center gap-2.5 px-3.5 h-9 border-t border-[#1a1a20] border-l-2 transition-colors ${
              askItem
                ? `cursor-pointer ${
                    selected === askIndex
                      ? 'bg-[#12121a] border-l-violet-500'
                      : 'border-l-transparent hover:bg-[#0f0f14]'
                  }`
                : 'border-l-transparent cursor-text'
            }`}
          >
            <Sparkles
              size={14}
              strokeWidth={1.75}
              className={`shrink-0 transition-colors ${
                askItem && selected === askIndex ? 'text-violet-400' : 'text-neutral-600'
              }`}
            />
            <span
              className={`min-w-0 flex-1 text-[13px] truncate ${
                askItem ? 'text-white' : 'text-neutral-500'
              }`}
            >
              {askItem ? askItem.title : 'Ask AI about the studio'}
            </span>
            {askItem && selected === askIndex && (
              <CornerDownLeft size={12} strokeWidth={2} className="shrink-0 text-neutral-500" />
            )}
          </div>
        )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
