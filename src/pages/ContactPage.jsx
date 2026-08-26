import React from 'react';
import {
  Mail,
  FileText,
  Check,
  HelpCircle,
  Send,
  MessagesSquare,
  FileCheck2,
} from 'lucide-react';
import DiscordMark from '../components/DiscordMark';
import Silk from '../components/Silk';
import ContourField from '../components/ContourField';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import AvailabilityBand from '../components/AvailabilityBand';
import { CONTACT_EMAIL, DISCORD_INVITE, CONTACT_ENDPOINT } from '../siteConfig';
import { submitEnquiry, UNAVAILABLE } from '../lib/enquiry';
import { openAsk } from '../lib/useCommandPalette';
import { MIN_QUESTION, MAX_QUESTION } from '../lib/askLimits';
import { useTurnstile, TURNSTILE_FIELD } from '../lib/useTurnstile';
import TurnstileField from '../components/TurnstileField';

const FIELD_LIMIT = 1024;

const PROJECT_TYPES = [
  'Website',
  'Web application',
  'Interface / UI design',
  'Game server',
  'Something else',
];

const TIMELINES = [
  'As soon as possible',
  'Within a month',
  'One to three months',
  'No fixed deadline',
];

const STEPS = [
  {
    step: '01',
    icon: Send,
    title: 'You send the details',
    blurb: 'What you want built, and anything you already have — designs, a domain, an old site.',
  },
  {
    step: '02',
    icon: MessagesSquare,
    title: 'We come back with questions',
    blurb: 'Usually a short back and forth to pin down what the project actually involves.',
  },
  {
    step: '03',
    icon: FileCheck2,
    title: 'You get a scope and a price',
    blurb: 'Written down before any work starts, so there are no surprises later.',
  },
];

const EMPTY_FORM = {
  name: '',
  email: '',
  projectType: PROJECT_TYPES[0],
  timeline: TIMELINES[0],
  message: '',
};

const fieldClasses =
  'w-full bg-[#0d0d12] border border-[#282832] text-white text-sm px-4 py-3 outline-none transition-colors placeholder:text-muted focus:border-neutral-600 disabled:opacity-50 [color-scheme:dark]';

const labelClasses = 'block text-[11px] font-semibold text-neutral-400 tracking-[0.2em] mb-2';

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className={labelClasses}>
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function buildMailto(form) {
  const subject = `Project enquiry — ${form.name || 'Amitista'}`;
  const body = [
    `Name: ${form.name}`,
    `Email: ${form.email}`,
    `Project: ${form.projectType}`,
    `Timeline: ${form.timeline}`,
    '',
    form.message,
  ].join('\n');

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const REQUIRED = ['name', 'email', 'message'];

function PreviewLine({ label, value, placeholder }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-700 select-none shrink-0 w-[58px]">{label}</span>
      <span
        className={`min-w-0 break-words ${value ? 'text-neutral-200' : 'text-neutral-700'}`}
      >
        {value || placeholder}
      </span>
    </div>
  );
}

function EnquiryPreview({ form, sending }) {
  const message = form.message.trim();

  return (
    <div className="lg:sticky lg:top-24 border border-[#1a1a20] bg-[#08080b] flex flex-col max-h-[520px]">
      <div className="flex items-center justify-between gap-3 px-4 h-10 border-b border-[#1a1a20] shrink-0">
        <span className="font-mono text-[11px] text-muted select-none">
          enquiry.txt
        </span>
        <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-muted">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              sending ? 'bg-amber-400 motion-safe:animate-pulse' : 'bg-emerald-400/70'
            }`}
          />
          {sending ? 'SENDING' : 'DRAFT'}
        </span>
      </div>

      <div className="p-4 font-mono text-[12px] leading-relaxed flex flex-col gap-2 overflow-y-auto overscroll-contain">
        <PreviewLine label="from" value={form.name} placeholder="your name" />
        <PreviewLine label="reply" value={form.email} placeholder="your email" />
        <PreviewLine label="wants" value={form.projectType} />
        <PreviewLine label="when" value={form.timeline} />

        <div className="border-t border-[#141419] mt-1 pt-3">
          <span className="block text-neutral-700 select-none mb-2">details</span>
          <p
            className={`whitespace-pre-wrap break-words ${
              message ? 'text-neutral-300' : 'text-neutral-700'
            }`}
          >
            {message || 'What are you building, and who is it for?'}
            <span className="inline-block w-[7px] h-[13px] align-middle ml-0.5 bg-violet-400/70 motion-safe:animate-pulse" />
          </p>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-[#1a1a20] shrink-0">
        <span className="font-mono text-[10px] text-neutral-700 leading-relaxed">
          Nothing leaves this page until you press send.
        </span>
      </div>
    </div>
  );
}

function DirectLink({ icon: Icon, title, detail, href, external }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className="flex items-start gap-3 group/link"
    >
      <Icon
        size={18}
        strokeWidth={1.5}
        className="text-muted mt-0.5 shrink-0 group-hover/link:text-violet-400 transition-colors duration-300"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white mb-0.5">{title}</span>
        <span className="block text-[13px] text-neutral-400 break-words group-hover/link:text-neutral-200 transition-colors">
          {detail}
        </span>
      </span>
    </a>
  );
}

function AskFirst() {
  const [question, setQuestion] = React.useState('');
  const trimmed = question.trim();

  const submit = (event) => {
    event.preventDefault();
    if (trimmed.length < MIN_QUESTION) return;
    openAsk(trimmed);
  };

  return (
    <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d]">
      <div className="h-14 px-6 sm:px-8 flex items-center justify-between gap-4 border-b border-[#1a1a20]">
        <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
          A QUESTION FIRST
        </span>
        <span className="hidden sm:block font-mono text-[11px] text-neutral-700 select-none">
          read from this site
        </span>
      </div>

      <form onSubmit={submit} className="px-6 sm:px-8 py-5 flex flex-col sm:flex-row gap-3">
        <label htmlFor="contact-ask" className="sr-only">
          Ask a question about the studio
        </label>
        <input
          id="contact-ask"
          type="text"
          autoComplete="off"
          maxLength={MAX_QUESTION}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What do you build, how long does it take, who owns the result…"
          className={fieldClasses}
        />
        <button
          type="submit"
          disabled={trimmed.length < MIN_QUESTION}
          className="border border-[#282832] hover:border-neutral-500 disabled:opacity-40 disabled:hover:border-[#282832] text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer disabled:cursor-default shrink-0"
        >
          ASK
        </button>
      </form>

      <p className="px-6 sm:px-8 pb-5 text-xs text-muted font-normal leading-relaxed">
        Answered on the spot from what the site already says, and nothing is sent to us.
        For anything it does not cover, the form below reaches a person.
      </p>
    </Reveal>
  );
}

export default function ContactPage() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [sentTo, setSentTo] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState('');
  const turnstile = useTurnstile('contact');

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (status === 'error') setStatus('idle');
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
        form: 'contact',
        name: form.name,
        email: form.email,
        projectType: form.projectType,
        timeline: form.timeline,
        message: form.message,
        botcheck: '',
        [TURNSTILE_FIELD]: turnstile.token,
      });

      if (outcome === UNAVAILABLE) {
        window.location.href = buildMailto(form);
        setStatus('mailto');
        return;
      }

      setSentTo(form.email.trim());
      setForm(EMPTY_FORM);
      setStatus('sent');
    } catch (submitError) {
      setError(submitError.message);
      setStatus('error');
    } finally {
      turnstile.reset();
    }
  };

  const sending = status === 'sending';
  const completed = REQUIRED.filter((key) => form[key].trim()).length;

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />
      <AvailabilityBand />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-left overflow-hidden">
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
            <Reveal
              rise
              className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-10 lg:gap-16 items-end mb-14"
            >
              <div className="flex flex-col items-start">
                <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                  CONTACT
                </div>
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                  Start a<br />
                  project
                </h1>
                <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[460px] leading-relaxed tracking-tight">
                  Tell us roughly what you need. You do not need a finished brief — a
                  couple of sentences is enough to start, and we will ask the rest.
                </p>
              </div>

              <aside className="border border-[#282832] bg-[#0a0a0d] p-6 sm:p-7 flex flex-col hover:bg-[#0c0c10] transition-colors duration-300">
                <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] mb-6">
                  OR REACH US DIRECTLY
                </h2>

                <div className="flex flex-col gap-5">
                  <DirectLink
                    icon={Mail}
                    title="Email"
                    detail={CONTACT_EMAIL}
                    href={`mailto:${CONTACT_EMAIL}`}
                  />
                  {DISCORD_INVITE && (
                    <DirectLink
                      icon={DiscordMark}
                      title="Discord"
                      detail="Join the server and open a ticket"
                      href={DISCORD_INVITE}
                      external
                    />
                  )}
                  <DirectLink
                    icon={HelpCircle}
                    title="Questions first"
                    detail="The FAQ covers cost, scope and who owns the result"
                    href="/faq"
                  />
                  <DirectLink
                    icon={FileText}
                    title="Already a client"
                    detail="The documentation covers most handover questions"
                    href="/docs"
                  />
                </div>

                <p className="text-[13px] text-muted font-normal leading-relaxed border-t border-[#222228] mt-7 pt-5">
                  Whichever you use, the same people read it — there is no inbox it
                  sits in waiting to be passed along.
                </p>
              </aside>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              <AskFirst />

              <div className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  {status === 'sent' ? 'ENQUIRY SENT' : 'PROJECT ENQUIRY'}
                </span>
                {status !== 'sent' && (
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:flex items-center gap-1.5">
                      {REQUIRED.map((key, index) => (
                        <span
                          key={key}
                          className={`w-6 h-0.5 rounded-sm transition-colors duration-300 ${
                            index < completed ? 'bg-violet-400' : 'bg-[#282832]'
                          }`}
                        />
                      ))}
                    </span>
                    <span className="font-mono text-[11px] text-muted select-none">
                      {completed}/{REQUIRED.length}
                    </span>
                  </span>
                )}
              </div>

              <div className="w-full border-t border-x border-[#282832]">
                {status === 'sent' ? (
                  <div className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col items-start justify-center text-left min-h-[360px]">
                    <div className="w-10 h-10 border border-[#282832] flex items-center justify-center mb-6">
                      <Check size={18} strokeWidth={1.5} className="text-violet-400" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight mb-3">
                      Message sent
                    </h2>
                    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[460px] mb-8">
                      It came through to the team. We will reply to{' '}
                      {sentTo ? (
                        <span className="font-mono text-[13px] text-neutral-200 break-all">
                          {sentTo}
                        </span>
                      ) : (
                        'the address you gave us'
                      )}
                      . If you need to add something in the meantime, write to{' '}
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
                      SEND ANOTHER
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmit}
                    className="bg-[#0a0a0d] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-8 text-left"
                  >
                    <div className="flex flex-col gap-5 min-w-0">
                    <input
                      type="checkbox"
                      name="botcheck"
                      tabIndex={-1}
                      autoComplete="off"
                      className="hidden"
                      aria-hidden="true"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <Field label="NAME" htmlFor="contact-name">
                        <input
                          id="contact-name"
                          type="text"
                          required
                          disabled={sending}
                          value={form.name}
                          onChange={update('name')}
                          placeholder="Your name"
                          className={fieldClasses}
                        />
                      </Field>
                      <Field label="EMAIL" htmlFor="contact-email">
                        <input
                          id="contact-email"
                          type="email"
                          required
                          disabled={sending}
                          value={form.email}
                          onChange={update('email')}
                          placeholder="you@example.com"
                          className={fieldClasses}
                        />
                      </Field>
                      <Field label="PROJECT" htmlFor="contact-type">
                        <select
                          id="contact-type"
                          disabled={sending}
                          value={form.projectType}
                          onChange={update('projectType')}
                          className={fieldClasses}
                        >
                          {PROJECT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="TIMELINE" htmlFor="contact-timeline">
                        <select
                          id="contact-timeline"
                          disabled={sending}
                          value={form.timeline}
                          onChange={update('timeline')}
                          className={fieldClasses}
                        >
                          {TIMELINES.map((timeline) => (
                            <option key={timeline} value={timeline}>
                              {timeline}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field
                      label="DETAILS"
                      htmlFor="contact-message"
                      hint={
                        form.message.length > FIELD_LIMIT * 0.6 ? (
                          <span
                            className={`font-mono text-[11px] mb-2 ${
                              form.message.length >= FIELD_LIMIT
                                ? 'text-amber-400'
                                : 'text-muted'
                            }`}
                          >
                            {form.message.length}/{FIELD_LIMIT}
                          </span>
                        ) : null
                      }
                    >
                      <textarea
                        id="contact-message"
                        required
                        rows={7}
                        maxLength={FIELD_LIMIT}
                        disabled={sending}
                        value={form.message}
                        onChange={update('message')}
                        placeholder="What are you building, who is it for, and is there a budget you are working to?"
                        className={`${fieldClasses} resize-y leading-relaxed`}
                      />
                    </Field>

                    <TurnstileField turnstile={turnstile} className="pt-1" />

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                      <button
                        type="submit"
                        disabled={sending || turnstile.blocking}
                        className="border border-white hover:bg-white hover:text-black disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer disabled:cursor-wait shrink-0"
                      >
                        {sending ? 'SENDING…' : 'SEND ENQUIRY'}
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
                          'Your email app should have opened with the message ready. Nothing is sent until you send it there.'}
                        {(status === 'idle' || sending) &&
                          (CONTACT_ENDPOINT
                            ? 'We reply to the address you give us.'
                            : 'This opens your email app with the details filled in.')}
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
                    </div>

                    <aside className="min-w-0 lg:border-l lg:border-[#1a1a20] lg:pl-8">
                      <EnquiryPreview form={form} sending={sending} />
                    </aside>
                  </form>
                )}
              </div>

              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  WHAT HAPPENS NEXT
                </span>
              </Reveal>

              <Reveal
                delay={80}
                className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]"
              >
                {STEPS.map((item) => (
                  <div
                    key={item.step}
                    className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[240px] hover:bg-[#0c0c10] transition-colors duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <item.icon
                        size={26}
                        strokeWidth={1.5}
                        className="text-muted group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                      />
                      <span className="text-2xl font-light text-neutral-700 select-none group-hover:text-muted transition-colors duration-300">
                        {item.step}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-3">
                      {item.title}
                    </h3>
                    <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                      {item.blurb}
                    </p>
                  </div>
                ))}
              </Reveal>

              <Reveal className="w-full flex">
              <a
                href="/team"
                className="relative w-full border border-[#282832] bg-[#0a0a0d] overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-8 py-12 group cursor-pointer"
              >
                <Silk
                  color="#8864f2"
                  speed={4.5}
                  scale={1.4}
                  noiseIntensity={1.4}
                  rotation={-0.2}
                  fadeEdge={true}
                  className="absolute inset-0 w-full h-full z-0 opacity-60 group-hover:opacity-90 transition-opacity duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#060608] via-[#060608]/85 to-[#060608]/45 z-1 pointer-events-none" />

                <div className="relative z-10 text-left">
                  <h3 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
                    Who picks it up
                  </h3>
                  <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-[380px]">
                    Your enquiry goes to the people who would build it. See who
                    they are before you send it.
                  </p>
                </div>

                <span className="relative z-10 inline-flex items-center gap-3 border border-white bg-transparent group-hover:bg-white group-hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all shrink-0 self-start sm:self-auto">
                  MEET THE TEAM
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                    />
                  </svg>
                </span>
              </a>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
