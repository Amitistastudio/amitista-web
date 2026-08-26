import React from 'react';
import {
  Layers,
  LayoutGrid,
  Puzzle,
  PenTool,
  FileText,
  Calendar,
  LifeBuoy,
  Check,
  Info,
  RotateCcw,
  Link2,
} from 'lucide-react';
import Silk from '../components/Silk';
import ContourField from '../components/ContourField';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import {
  QUESTIONS,
  ESTIMATE_READY,
  defaultAnswers,
  estimate,
  formatMoney,
} from '../content/estimate';
import { encode, decode, load, save, clear } from '../lib/estimateState';
import { STUDIO_NAME, CONTACT_EMAIL } from '../siteConfig';
import { submitEnquiry, UNAVAILABLE } from '../lib/enquiry';
import { useTurnstile, TURNSTILE_FIELD } from '../lib/useTurnstile';
import TurnstileField from '../components/TurnstileField';

const ICONS = {
  layers: Layers,
  layout: LayoutGrid,
  puzzle: Puzzle,
  'pen-tool': PenTool,
  'file-text': FileText,
  calendar: Calendar,
  'life-buoy': LifeBuoy,
};

const FIELD_LIMIT = 1024;

const fieldClasses =
  'w-full bg-[#0d0d12] border border-[#282832] text-white text-sm px-4 py-3 outline-none transition-colors placeholder:text-muted focus:border-neutral-600 disabled:opacity-50 [color-scheme:dark]';

function Option({ question, option, selected, onSelect }) {
  const multi = question.type === 'multi';

  return (
    <label
      className={`text-left p-4 border transition-colors duration-200 cursor-pointer group block has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet-400 ${
        selected
          ? 'border-violet-400/60 bg-violet-500/[0.07]'
          : 'border-[#282832] bg-[#0a0a0d] hover:border-neutral-600 hover:bg-[#0c0c10]'
      }`}
    >
      <input
        type={multi ? 'checkbox' : 'radio'}
        name={question.id}
        value={option.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-white leading-snug">{option.label}</span>
        <span
          className={`w-4 h-4 mt-0.5 shrink-0 border flex items-center justify-center transition-colors duration-200 ${
            selected ? 'border-violet-400 bg-violet-400' : 'border-[#33333f] group-hover:border-neutral-500'
          }`}
        >
          {selected && <Check size={11} strokeWidth={3} className="text-[#0a0a0d]" />}
        </span>
      </span>
      <span className="block text-[13px] text-muted font-normal leading-relaxed mt-1.5">
        {option.detail}
      </span>
    </label>
  );
}

function SummaryPanel({ result, answered, onJump, onCopy, shareState }) {
  return (
    <div className="lg:sticky lg:top-24 border border-[#1a1a20] bg-[#08080b] flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 h-10 border-b border-[#1a1a20] shrink-0">
        <span className="font-mono text-[11px] text-muted select-none">estimate.txt</span>
        <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
          LIVE
        </span>
      </div>

      <div aria-live="polite" className="p-5 border-b border-[#1a1a20]">
        {ESTIMATE_READY ? (
          <>
            <span className="block text-[10px] font-semibold text-muted tracking-[0.2em] mb-3">
              ESTIMATED RANGE
            </span>
            <p className="text-2xl sm:text-[28px] font-normal text-white tracking-tight leading-none tabular-nums">
              {formatMoney(result.low)}
              <span className="text-muted mx-2">—</span>
              {formatMoney(result.high)}
            </p>
            <p className="text-[13px] text-muted font-normal leading-relaxed mt-3">
              Roughly {result.weeksLow} to {result.weeksHigh} weeks of work once it starts.
            </p>
          </>
        ) : (
          <>
            <span className="block text-[10px] font-semibold text-muted tracking-[0.2em] mb-3">
              YOUR PROJECT
            </span>
            <p className="text-lg font-normal text-white tracking-tight leading-snug">
              {answered === 0
                ? 'Nothing answered yet'
                : `${answered} of ${QUESTIONS.length} answered`}
            </p>
            <p className="text-[13px] text-muted font-normal leading-relaxed mt-3">
              Send it below and you will get a price back from a person rather than
              from arithmetic.
            </p>
          </>
        )}
      </div>

      <div className="p-5 font-mono text-[12px] leading-relaxed flex flex-col gap-1 max-h-[300px] overflow-y-auto overscroll-contain">
        {result.chosen.map((option) => (
          <button
            key={`${option.question.id}-${option.id}`}
            type="button"
            onClick={() => onJump(option.question.id)}
            className="flex gap-3 text-left -mx-2 px-2 py-0.5 cursor-pointer hover:bg-[#101017] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 transition-colors"
          >
            <span className="text-neutral-700 select-none shrink-0 w-[74px] truncate">
              {option.question.key}
            </span>
            <span className="min-w-0 break-words text-neutral-300">{option.label}</span>
          </button>
        ))}
      </div>

      {result.notes.length > 0 && (
        <div className="px-5 py-4 border-t border-[#1a1a20] flex flex-col gap-3">
          {result.notes.map((option) => (
            <p
              key={`note-${option.id}`}
              className="flex items-start gap-2.5 text-[12px] text-muted font-normal leading-relaxed"
            >
              <Info size={13} strokeWidth={1.5} className="text-muted mt-0.5 shrink-0" />
              {option.note}
            </p>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-[#1a1a20] shrink-0 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2.5 border border-[#282832] hover:border-neutral-500 text-neutral-300 hover:text-white font-semibold text-[10px] tracking-[0.2em] px-4 py-2.5 transition-all cursor-pointer self-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          {shareState === 'copied' ? (
            <Check size={12} strokeWidth={2} className="text-violet-400" />
          ) : (
            <Link2 size={12} strokeWidth={1.5} />
          )}
          {shareState === 'copied' ? 'LINK COPIED' : 'COPY AS A LINK'}
        </button>
        <span aria-live="polite" className="font-mono text-[10px] text-neutral-700 leading-relaxed">
          {shareState === 'manual'
            ? 'Copying was blocked — the link is in your address bar.'
            : 'Nothing leaves this page until you send it.'}
        </span>
      </div>
    </div>
  );
}

export default function EstimatePage() {
  const [answers, setAnswers] = React.useState(defaultAnswers);
  const [touched, setTouched] = React.useState(() => new Set());
  const [shareState, setShareState] = React.useState('idle');
  const [form, setForm] = React.useState({ name: '', email: '', notes: '' });
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState('');
  const turnstile = useTurnstile('estimate');

  React.useEffect(() => {
    const restored = decode(window.location.search) ?? load();
    if (!restored) return;
    setAnswers(restored);
    setTouched(new Set(QUESTIONS.map((question) => question.id)));
  }, []);

  React.useEffect(() => {
    const previous = document.title;
    document.title = `Estimate — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  const result = React.useMemo(() => estimate(answers), [answers]);
  const query = React.useMemo(() => encode(answers), [answers]);

  React.useEffect(() => {
    save(answers);
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
    setShareState('idle');
  }, [answers, query]);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
    } catch {
      setShareState('manual');
    }
  };

  const jumpTo = (questionId) => {
    document.getElementById(`q-${questionId}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center',
    });
  };

  const choose = (question, optionId) => {
    setTouched((current) => new Set(current).add(question.id));
    setAnswers((current) => {
      if (question.type !== 'multi') return { ...current, [question.id]: optionId };
      const chosen = current[question.id];
      return {
        ...current,
        [question.id]: chosen.includes(optionId)
          ? chosen.filter((id) => id !== optionId)
          : [...chosen, optionId],
      };
    });
    if (status === 'error') setStatus('idle');
  };

  const isSelected = (question, optionId) => {
    const answer = answers[question.id];
    return Array.isArray(answer) ? answer.includes(optionId) : answer === optionId;
  };

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (status === 'error') setStatus('idle');
  };

  const summaryLines = QUESTIONS.map((question) => {
    const picked = result.chosen.filter((option) => option.question.id === question.id);
    return `${question.label} ${picked.map((option) => option.label).join(', ') || 'nothing selected'}`;
  });

  const rangeLine = ESTIMATE_READY
    ? `${formatMoney(result.low)} — ${formatMoney(result.high)} · ${result.weeksLow}–${result.weeksHigh} weeks`
    : 'Not shown — estimator numbers are not configured yet';

  const buildMailto = () => {
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Estimate shown: ${rangeLine}`,
      '',
      ...summaryLines,
      '',
      form.notes,
    ].join('\n');
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `Estimate — ${form.name || 'Amitista'}`,
    )}&body=${encodeURIComponent(body)}`;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'sending') return;

    if (event.currentTarget.botcheck?.checked) return;
    if (turnstile.blocking) return;

    setStatus('sending');
    setError('');

    try {
      const outcome = await submitEnquiry({
        form: 'estimate',
        name: form.name,
        email: form.email,
        estimate: rangeLine,
        configuration: summaryLines.join('\n'),
        notes: form.notes,
        botcheck: '',
        [TURNSTILE_FIELD]: turnstile.token,
      });

      if (outcome === UNAVAILABLE) {
        window.location.href = buildMailto();
        setStatus('mailto');
        return;
      }

      setStatus('sent');
    } catch (submitError) {
      setError(submitError.message);
      setStatus('error');
    } finally {
      turnstile.reset();
    }
  };

  const sending = status === 'sending';
  const answered = touched.size;

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans pb-[76px] lg:pb-0">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-left overflow-x-clip">
          <div className="absolute top-0 right-0 w-full lg:w-[62%] h-[520px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.5}
              noiseIntensity={1.4}
              rotation={-0.35}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/20 via-[#060608]/70 to-[#060608]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#060608] via-[#060608]/40 to-transparent" />
          </div>

          <div className="absolute inset-x-0 top-[460px] bottom-0 z-0 pointer-events-none">
            <ContourField />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full max-w-5xl flex flex-col items-start mb-14">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                ESTIMATE
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                What it
                <br />
                would cost
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[520px] leading-relaxed tracking-tight">
                Answer what you can and the estimate builds as you go. It is a range,
                not a quote — the real price is agreed in writing after we have
                understood the brief, and it has never yet been set by a form.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-8 lg:gap-10">
              <div className="flex flex-col gap-8 min-w-0">
                {QUESTIONS.map((question, index) => {
                  const Icon = ICONS[question.icon] ?? Layers;
                  return (
                    <Reveal
                      key={question.id}
                      id={`q-${question.id}`}
                      delay={index * 40}
                      className="border border-[#282832] bg-[#08080b] scroll-mt-28"
                    >
                      <div className="flex items-start gap-3 px-6 py-5 border-b border-[#1a1a20]">
                        <Icon size={18} strokeWidth={1.5} className="text-muted mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-medium text-white tracking-tight">
                            {question.label}
                          </h2>
                          <p className="text-[13px] text-muted font-normal leading-relaxed mt-1">
                            {question.hint}
                          </p>
                        </div>
                      </div>

                      <div
                        role={question.type === 'multi' ? 'group' : 'radiogroup'}
                        aria-label={question.label}
                        className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                      >
                        {question.options.map((option) => (
                          <Option
                            key={option.id}
                            question={question}
                            option={option}
                            selected={isSelected(question, option.id)}
                            onSelect={() => choose(question, option.id)}
                          />
                        ))}
                      </div>
                    </Reveal>
                  );
                })}

                <div className="flex">
                  <button
                    type="button"
                    onClick={() => {
                      clear();
                      setAnswers(defaultAnswers());
                      setTouched(new Set());
                    }}
                    className="inline-flex items-center gap-2.5 border border-[#282832] hover:border-neutral-500 text-neutral-400 hover:text-white font-semibold text-[11px] tracking-[0.2em] px-5 py-3 transition-all cursor-pointer"
                  >
                    <RotateCcw size={13} strokeWidth={1.5} />
                    START OVER
                  </button>
                </div>
              </div>

              <aside className="min-w-0 hidden lg:block">
                <SummaryPanel
                  result={result}
                  answered={answered}
                  onJump={jumpTo}
                  onCopy={copyLink}
                  shareState={shareState}
                />
              </aside>
            </div>

            <div className="w-full max-w-5xl mt-10 flex flex-col">
              <div
                id="send"
                className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center scroll-mt-20"
              >
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  {status === 'sent' ? 'ESTIMATE SENT' : 'SEND IT TO US'}
                </span>
              </div>

              <div className="w-full border border-[#282832]">
                {status === 'sent' ? (
                  <div className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col items-start text-left">
                    <div className="w-10 h-10 border border-[#282832] flex items-center justify-center mb-6">
                      <Check size={18} strokeWidth={1.5} className="text-violet-400" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight mb-3">
                      Sent, with your answers attached
                    </h2>
                    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[520px] mb-8">
                      We have everything you picked, so the reply will be about your
                      project rather than a request for more detail. If you want to add
                      something, write to{' '}
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="text-neutral-200 underline underline-offset-4 decoration-neutral-600 hover:decoration-neutral-300 transition-colors"
                      >
                        {CONTACT_EMAIL}
                      </a>
                      .
                    </p>
                    <button
                      type="button"
                      onClick={() => setStatus('idle')}
                      className="border border-[#282832] hover:border-neutral-500 text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
                    >
                      CHANGE THE ANSWERS
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col gap-5">
                    <input
                      type="checkbox"
                      name="botcheck"
                      tabIndex={-1}
                      autoComplete="off"
                      className="hidden"
                      aria-hidden="true"
                    />

                    <p className="text-sm text-neutral-400 font-normal leading-relaxed max-w-[560px]">
                      Everything you picked above goes with this, so there is no brief to
                      write out again.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label
                          htmlFor="estimate-name"
                          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.2em] mb-2"
                        >
                          NAME
                        </label>
                        <input
                          id="estimate-name"
                          type="text"
                          required
                          disabled={sending}
                          value={form.name}
                          onChange={update('name')}
                          placeholder="Your name"
                          className={fieldClasses}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="estimate-email"
                          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.2em] mb-2"
                        >
                          EMAIL
                        </label>
                        <input
                          id="estimate-email"
                          type="email"
                          required
                          disabled={sending}
                          value={form.email}
                          onChange={update('email')}
                          placeholder="you@example.com"
                          className={fieldClasses}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="estimate-notes"
                        className="block text-[11px] font-semibold text-neutral-400 tracking-[0.2em] mb-2"
                      >
                        ANYTHING THE QUESTIONS MISSED
                      </label>
                      <textarea
                        id="estimate-notes"
                        rows={5}
                        maxLength={FIELD_LIMIT}
                        disabled={sending}
                        value={form.notes}
                        onChange={update('notes')}
                        placeholder="What it is for, who uses it, anything that already exists."
                        className={`${fieldClasses} resize-y leading-relaxed`}
                      />
                    </div>

                    <TurnstileField turnstile={turnstile} className="pt-1" />

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                      <button
                        type="submit"
                        disabled={sending || turnstile.blocking}
                        className="border border-white hover:bg-white hover:text-black disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer disabled:cursor-wait shrink-0"
                      >
                        {sending ? 'SENDING…' : 'SEND MY ANSWERS'}
                      </button>
                      <p
                        aria-live="polite"
                        className={`text-xs font-normal leading-relaxed ${
                          status === 'error' ? 'text-red-400' : 'text-muted'
                        }`}
                      >
                        {status === 'error' && (
                          <>
                            That did not go through ({error}). Please write to{' '}
                            <a
                              href={`mailto:${CONTACT_EMAIL}`}
                              className="underline underline-offset-4"
                            >
                              {CONTACT_EMAIL}
                            </a>{' '}
                            instead.
                          </>
                        )}
                        {status === 'mailto' &&
                          'Your email app should have opened with the answers filled in. Nothing is sent until you send it there.'}
                        {(status === 'idle' || sending) &&
                          'We reply to the address you give us. No obligation either way.'}
                      </p>
                    </div>

                    <p className="text-xs text-muted font-normal leading-relaxed">
                      What happens to the details you send is set out in the{' '}
                      <a
                        href="/privacy"
                        className="underline underline-offset-4 hover:text-neutral-400 transition-colors"
                      >
                        privacy policy
                      </a>
                      .
                    </p>
                  </form>
                )}
              </div>

              <Reveal className="w-full border-x border-b border-[#282832] bg-[#08080b] p-6 sm:p-8">
                <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] mb-5">
                  HOW HONEST THIS NUMBER IS
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                    It is arithmetic on the answers above, not a person reading your
                    brief. It cannot know the one detail that makes your project harder
                    than it looks.
                  </p>
                  <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                    Nothing here is binding on you or on us. The price that counts is the
                    fixed one written down after the brief, before any work starts.
                  </p>
                  <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                    If it comes out higher than you expected, send it anyway and say so —
                    scope is the part we can move, and that conversation is free.
                  </p>
                </div>
              </Reveal>

              <div className="w-full mt-10">
                <CtaPanel
                  title="Rather just ask?"
                  body="Skip the questions and tell us what you need in your own words."
                  label="CONTACT US"
                  href="/contact"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {status !== 'sent' && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#282832] bg-[#08080b]/95 backdrop-blur-sm px-5 py-3 flex items-center justify-between gap-4">
          <span aria-live="polite" className="min-w-0">
            {ESTIMATE_READY ? (
              <>
                <span className="block text-[10px] font-semibold text-muted tracking-[0.2em]">
                  ESTIMATE
                </span>
                <span className="block text-[15px] text-white tracking-tight tabular-nums truncate">
                  {formatMoney(result.low)} — {formatMoney(result.high)}
                </span>
              </>
            ) : (
              <>
                <span className="block text-[10px] font-semibold text-muted tracking-[0.2em]">
                  YOUR PROJECT
                </span>
                <span className="block text-[15px] text-white tracking-tight truncate">
                  {answered === 0
                    ? 'Nothing answered yet'
                    : `${answered} of ${QUESTIONS.length} answered`}
                </span>
              </>
            )}
          </span>
          <a
            href="#send"
            className="shrink-0 border border-white hover:bg-white hover:text-black text-white font-semibold text-[10px] tracking-[0.2em] px-4 py-2.5 transition-all"
          >
            SEND IT
          </a>
        </div>
      )}

      <Footer />
    </div>
  );
}
