import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { askLegal, MIN_QUESTION, MAX_QUESTION, HISTORY_TURNS } from '../../lib/ask';
import { CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

const fieldClasses =
  'w-full bg-[#0d0d12] border border-[#282832] text-white text-sm px-4 py-3 outline-none transition-colors placeholder:text-muted focus:border-neutral-600 disabled:opacity-50';

function Cite({ cite, current }) {
  const heading = [cite.doc && cite.doc !== current ? cite.doc : '', `§${cite.section}`]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={`${cite.href}#s${cite.section}`}
      className="inline-flex items-baseline gap-2 group mt-1"
    >
      <span className="font-tech text-[11px] text-muted tracking-wider group-hover:text-neutral-300 transition-colors">
        {heading}
      </span>
      <span className="text-[13px] text-neutral-300 group-hover:text-white transition-colors underline underline-offset-4 decoration-[#282832]">
        {cite.title || 'Read the section'}
      </span>
      <ArrowUpRight
        size={13}
        strokeWidth={1.5}
        className="text-muted shrink-0 self-center group-hover:text-violet-400 transition-colors duration-300"
      />
    </a>
  );
}

export default function LegalAssistant({ current = '', label = '' }) {
  const [question, setQuestion] = React.useState('');
  const [turns, setTurns] = React.useState([]);
  const [asking, setAsking] = React.useState(false);
  const [error, setError] = React.useState('');

  const inputRef = React.useRef(null);
  const nextId = React.useRef(0);

  const trimmed = question.trim();
  const askable = trimmed.length >= MIN_QUESTION && !asking;

  async function submit(event) {
    event.preventDefault();
    if (!askable) return;

    setAsking(true);
    setError('');

    try {
      const answer = await askLegal(trimmed, turns.slice(-HISTORY_TURNS), current);
      nextId.current += 1;
      setTurns((previous) => [...previous, { id: nextId.current, question: trimmed, ...answer }]);
      setQuestion('');
    } catch (failure) {
      setError(failure.message || 'The assistant is not available right now.');
    } finally {
      setAsking(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }

  function clear() {
    setTurns([]);
    setError('');
    setQuestion('');
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <section id="ask" className="border-t border-[#282832] mt-14 pt-10 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
          {label ? 'ASK ABOUT THIS DOCUMENT' : 'ASK ABOUT THESE DOCUMENTS'}
        </span>
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] font-semibold text-muted hover:text-white tracking-[0.2em] transition-colors shrink-0 cursor-pointer"
          >
            START AGAIN
          </button>
        ) : null}
      </div>

      <div className="border border-[#282832] bg-[#0a0a0d]">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className="border-b border-[#1c1c22] px-5 py-6 sm:px-7 flex flex-col gap-3"
          >
            <p className="text-sm sm:text-[15px] font-medium text-white leading-relaxed">
              {turn.question}
            </p>
            <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
              {turn.text}
            </p>
            {turn.cite ? <Cite cite={turn.cite} current={label} /> : null}
          </div>
        ))}

        {asking ? (
          <div className="border-b border-[#1c1c22] px-5 py-6 sm:px-7">
            <span className="font-tech text-[12px] text-muted tracking-wider">
              Reading the {label ? 'document' : 'documents'}…
            </span>
          </div>
        ) : null}

        <form onSubmit={submit} className="px-5 py-5 sm:px-7 flex flex-col sm:flex-row gap-3">
          <label htmlFor="legal-ask" className="sr-only">
            {label ? `Ask a question about ${label}` : 'Ask a question about the legal documents'}
          </label>
          <input
            id="legal-ask"
            ref={inputRef}
            type="text"
            autoComplete="off"
            maxLength={MAX_QUESTION}
            disabled={asking}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={label ? `Ask about ${label}…` : 'Ask about any of the fourteen…'}
            className={fieldClasses}
          />
          <button
            type="submit"
            disabled={!askable}
            className="border border-[#282832] hover:border-neutral-500 disabled:opacity-40 disabled:hover:border-[#282832] text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer disabled:cursor-default shrink-0"
          >
            ASK
          </button>
        </form>

        {error ? (
          <p className="px-5 pb-5 sm:px-7 text-[13px] text-red-400 font-normal leading-relaxed">
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-[13px] text-muted font-normal leading-relaxed max-w-[640px]">
        Answers are written by a model reading{' '}
        {label ? 'this document' : 'these documents'} and nothing else, and they point at
        the section they came from so you can read it yourself. That section is what binds,
        not the answer: this is a way to find your way around the text, not legal advice.
        For anything that turns on your own situation, write to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </section>
  );
}
