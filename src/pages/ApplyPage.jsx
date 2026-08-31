import React from 'react';
import {
  Check,
  Code2,
  PenTool,
  Bug,
  LifeBuoy,
  ShieldCheck,
  ArrowLeft,
  ClipboardList,
  MessagesSquare,
  UserCheck,
} from 'lucide-react';
import DiscordMark from '../components/DiscordMark';
import Silk from '../components/Silk';
import ContourField from '../components/ContourField';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { DISCORD_INVITE, CONTACT_EMAIL, APPLY_ENDPOINT } from '../siteConfig';
import { ROLES, questionsOf } from '../content/applyRoles';
import { submitApplication, UNAVAILABLE } from '../lib/application';
import { useTurnstile, TURNSTILE_FIELD } from '../lib/useTurnstile';
import TurnstileField from '../components/TurnstileField';

const ROLE_ICONS = {
  dev: Code2,
  design: PenTool,
  qa: Bug,
  support: LifeBuoy,
  mod: ShieldCheck,
};

const STEPS = [
  {
    step: '01',
    icon: ClipboardList,
    title: 'You answer the questions',
    blurb: 'Five or six of them, specific to the role. It takes about five minutes.',
  },
  {
    step: '02',
    icon: MessagesSquare,
    title: 'The team reads it',
    blurb: 'It lands with the people who already do that job, not a generic inbox.',
  },
  {
    step: '03',
    icon: UserCheck,
    title: 'We come back to you',
    blurb: 'Either way you get an answer. If it is a yes, we take it to Discord from there.',
  },
];

const DISCORD_LIMIT = 64;
const EMAIL_LIMIT = 160;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

function emptyAnswers(role) {
  const blank = {};
  for (const question of questionsOf(role)) {
    blank[question.id] = question.type === 'multi' ? [] : '';
  }
  return blank;
}

function isAnswered(question, value) {
  if (question.type === 'multi') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function labelFor(question, value) {
  if (question.type === 'multi') {
    return question.options
      .filter((option) => value.includes(option.value))
      .map((option) => option.label)
      .join(', ');
  }
  if (question.type === 'choice') {
    const picked = question.options.find((option) => option.value === value);
    return picked ? picked.label : value;
  }
  return value.trim();
}

function RoleCard({ role, selected, onSelect }) {
  const Icon = ROLE_ICONS[role.key] || Code2;

  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      aria-pressed={selected}
      className={`bg-[#0a0a0d] p-7 flex flex-col text-left min-h-[300px] transition-colors duration-300 cursor-pointer group focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 ${
        selected ? 'bg-[#101017]' : 'hover:bg-[#0c0c10]'
      }`}
    >
      <div className="flex items-center justify-between mb-5">
        <Icon
          size={26}
          strokeWidth={1.5}
          className={`transition-all duration-300 ${
            selected ? 'text-violet-400' : 'text-muted group-hover:text-violet-400 group-hover:scale-105'
          }`}
        />
        <span
          className={`text-[10px] font-semibold tracking-[0.18em] transition-colors ${
            selected ? 'text-violet-400' : 'text-neutral-700 group-hover:text-muted'
          }`}
        >
          {selected ? 'SELECTED' : 'APPLY'}
        </span>
      </div>

      <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-2">{role.name}</h3>
      <p className="text-sm text-neutral-400 font-normal leading-relaxed mb-5">{role.hook}</p>

      <ul className="mt-auto flex flex-col gap-2">
        {role.needs.map((need) => (
          <li key={need} className="flex gap-2.5 text-[13px] text-neutral-500 leading-relaxed">
            <span className="text-neutral-700 select-none shrink-0">·</span>
            <span>{need}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

function TextQuestion({ question, value, disabled, onChange }) {
  const id = `apply-${question.id}`;
  const long = question.type === 'para';
  const showCount = long && value.length > question.max * 0.6;

  return (
    <Field
      label={question.label.toUpperCase()}
      htmlFor={id}
      hint={
        showCount ? (
          <span
            className={`font-mono text-[11px] mb-2 ${
              value.length >= question.max ? 'text-amber-400' : 'text-muted'
            }`}
          >
            {value.length}/{question.max}
          </span>
        ) : null
      }
    >
      {long ? (
        <textarea
          id={id}
          rows={6}
          required={question.required}
          maxLength={question.max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          className={`${fieldClasses} resize-y leading-relaxed`}
        />
      ) : (
        <input
          id={id}
          type="text"
          required={question.required}
          maxLength={question.max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          className={fieldClasses}
        />
      )}
      <p className="text-xs text-muted font-normal leading-relaxed mt-2">{question.hint}</p>
    </Field>
  );
}

function ChoiceQuestion({ question, value, disabled, onChange }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={labelClasses}>{question.label.toUpperCase()}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
        {question.options.map((option) => {
          const active = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-4 cursor-pointer transition-colors duration-200 ${
                active ? 'bg-[#101017]' : 'bg-[#0d0d12] hover:bg-[#0f0f15]'
              }`}
            >
              <input
                type="radio"
                name={`apply-${question.id}`}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={`w-3.5 h-3.5 mt-0.5 shrink-0 rounded-full border transition-colors ${
                  active ? 'border-violet-400 bg-violet-400/25' : 'border-[#3a3a46]'
                }`}
              >
                {active && <span className="block w-1.5 h-1.5 m-[3px] rounded-full bg-violet-400" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-white font-medium">{option.label}</span>
                {option.description && (
                  <span className="block text-[13px] text-neutral-500 leading-relaxed mt-0.5">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted font-normal leading-relaxed mt-2">{question.hint}</p>
    </fieldset>
  );
}

function MultiQuestion({ question, value, disabled, onChange }) {
  const toggle = (option) => {
    onChange(
      value.includes(option) ? value.filter((entry) => entry !== option) : [...value, option],
    );
  };

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={labelClasses}>{question.label.toUpperCase()}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
        {question.options.map((option) => {
          const active = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-4 cursor-pointer transition-colors duration-200 ${
                active ? 'bg-[#101017]' : 'bg-[#0d0d12] hover:bg-[#0f0f15]'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              <span
                className={`w-3.5 h-3.5 mt-0.5 shrink-0 border flex items-center justify-center transition-colors ${
                  active ? 'border-violet-400 bg-violet-400/25' : 'border-[#3a3a46]'
                }`}
              >
                {active && <Check size={10} strokeWidth={3} className="text-violet-400" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-white font-medium">{option.label}</span>
                {option.description && (
                  <span className="block text-[13px] text-neutral-500 leading-relaxed mt-0.5">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted font-normal leading-relaxed mt-2">{question.hint}</p>
    </fieldset>
  );
}

function Question({ question, value, disabled, onChange }) {
  if (question.type === 'multi') {
    return <MultiQuestion question={question} value={value} disabled={disabled} onChange={onChange} />;
  }
  if (question.type === 'choice') {
    return <ChoiceQuestion question={question} value={value} disabled={disabled} onChange={onChange} />;
  }
  return <TextQuestion question={question} value={value} disabled={disabled} onChange={onChange} />;
}

export default function ApplyPage() {
  const [role, setRole] = React.useState(null);
  const [discord, setDiscord] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [answers, setAnswers] = React.useState({});
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState('');
  const turnstile = useTurnstile('apply');
  const formRef = React.useRef(null);

  const questions = questionsOf(role);
  const sending = status === 'sending';

  const chooseRole = (next) => {
    setRole(next);
    setAnswers(emptyAnswers(next));
    setStatus('idle');
    setError('');
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  };

  const setAnswer = (id) => (value) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    if (status === 'error') setStatus('idle');
  };

  const answered = questions.filter((question) => isAnswered(question, answers[question.id])).length;
  const total = questions.length;
  const ready = discord.trim().length > 0 && answered === total;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending || !role) return;

    if (event.currentTarget.botcheck?.checked) return;
    if (turnstile.blocking) return;

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setError('that email address does not look right');
      setStatus('error');
      return;
    }

    const missing = questions.find((question) => !isAnswered(question, answers[question.id]));
    if (missing) {
      setError(`${missing.label.toLowerCase()} is still empty`);
      setStatus('error');
      return;
    }

    setStatus('sending');
    setError('');

    try {
      const outcome = await submitApplication({
        form: 'application',
        role: role.key,
        roleName: role.name,
        discord: discord.trim(),
        email: trimmedEmail,
        answers: questions.map((question) => ({
          id: question.id,
          label: question.label,
          value: labelFor(question, answers[question.id]),
        })),
        botcheck: '',
        [TURNSTILE_FIELD]: turnstile.token,
      });

      if (outcome === UNAVAILABLE) {
        setStatus('unavailable');
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

  const restart = () => {
    setRole(null);
    setDiscord('');
    setEmail('');
    setAnswers({});
    setStatus('idle');
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none"
      >
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
                  APPLICATIONS
                </div>
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                  Join the
                  <br />
                  studio
                </h1>
                <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[460px] leading-relaxed tracking-tight">
                  We take on people who can already do the work. Pick the role that
                  fits, answer honestly, and the people who do that job here will
                  read it themselves.
                </p>
              </div>

              <aside className="border border-[#282832] bg-[#0a0a0d] p-6 sm:p-7 flex flex-col hover:bg-[#0c0c10] transition-colors duration-300">
                <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] mb-6">
                  BEFORE YOU START
                </h2>

                <ul className="flex flex-col gap-4">
                  {[
                    'Every role is unpaid until there is client work to share — we say so up front rather than in the reply.',
                    'One application at a time. A second one for a different role is fine once you have heard back.',
                    'Anything rushed gets closed without a reply, so give it the five minutes.',
                  ].map((line) => (
                    <li key={line} className="flex gap-3 text-[13px] text-neutral-400 leading-relaxed">
                      <span className="text-neutral-700 select-none shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                {DISCORD_INVITE && (
                  <a
                    href={DISCORD_INVITE}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-start gap-3 group/link border-t border-[#222228] mt-7 pt-5"
                  >
                    <DiscordMark
                      size={18}
                      strokeWidth={1.5}
                      className="text-muted mt-0.5 shrink-0 group-hover/link:text-violet-400 transition-colors duration-300"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white mb-0.5">
                        Rather do it in Discord?
                      </span>
                      <span className="block text-[13px] text-neutral-400 group-hover/link:text-neutral-200 transition-colors">
                        The same application runs in the server, with a channel of your own
                      </span>
                    </span>
                  </a>
                )}
              </aside>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              <div className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  {status === 'sent' ? 'APPLICATION SENT' : role ? 'THE ROLE' : 'PICK A ROLE'}
                </span>
                {role && status !== 'sent' && (
                  <button
                    type="button"
                    onClick={() => setRole(null)}
                    className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowLeft size={13} strokeWidth={1.8} />
                    CHANGE
                  </button>
                )}
              </div>

              {status === 'sent' ? (
                <div className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-6 sm:p-8 flex flex-col items-start justify-center text-left min-h-[360px]">
                  <div className="w-10 h-10 border border-[#282832] flex items-center justify-center mb-6">
                    <Check size={18} strokeWidth={1.5} className="text-violet-400" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight mb-3">
                    Application sent
                  </h2>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[460px] mb-8">
                    It has gone through to the team as{' '}
                    <span className="font-mono text-[13px] text-neutral-200 break-all">{discord}</span>
                    . Someone who already does that job will read it. If you are in the
                    Discord, keep your DMs open — that is where the answer comes.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={restart}
                      className="border border-[#282832] hover:border-neutral-500 text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
                    >
                      APPLY FOR ANOTHER
                    </button>
                    {DISCORD_INVITE && (
                      <a
                        href={DISCORD_INVITE}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer text-center"
                      >
                        JOIN THE DISCORD
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {!role && (
                    <Reveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                      {ROLES.map((entry) => (
                        <RoleCard
                          key={entry.key}
                          role={entry}
                          selected={false}
                          onSelect={chooseRole}
                        />
                      ))}
                      <div className="bg-[#0a0a0d] p-7 flex flex-col justify-center min-h-[300px]">
                        <h3 className="text-lg font-medium text-white tracking-tight mb-2">
                          None of these?
                        </h3>
                        <p className="text-sm text-neutral-400 font-normal leading-relaxed mb-5">
                          If you do something we have not listed and you think we need it,
                          say so directly rather than forcing yourself into the closest box.
                        </p>
                        <a
                          href="/contact"
                          className="text-[11px] font-semibold tracking-[0.2em] text-white underline underline-offset-8 decoration-neutral-600 hover:decoration-neutral-300 transition-colors self-start"
                        >
                          WRITE TO US
                        </a>
                      </div>
                    </Reveal>
                  )}

                  {role && (
                    <div ref={formRef} className="w-full border-t border-x border-[#282832]">
                      <div className="bg-[#0a0a0d] p-6 sm:p-8 border-b border-[#1a1a20] grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8">
                        <div className="min-w-0">
                          <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-3">
                            {role.name}
                          </h2>
                          <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                            {role.blurb}
                          </p>
                        </div>
                        <div className="min-w-0 lg:border-l lg:border-[#1a1a20] lg:pl-8">
                          <h3 className="text-[11px] font-semibold text-muted tracking-[0.2em] mb-4">
                            WHAT YOU WOULD DO
                          </h3>
                          <ul className="flex flex-col gap-2.5">
                            {role.does.map((line) => (
                              <li
                                key={line}
                                className="flex gap-2.5 text-[13px] text-neutral-400 leading-relaxed"
                              >
                                <span className="text-neutral-700 select-none shrink-0">·</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <form onSubmit={handleSubmit} className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col gap-7">
                        <input
                          type="checkbox"
                          name="botcheck"
                          tabIndex={-1}
                          autoComplete="off"
                          className="hidden"
                          aria-hidden="true"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <Field label="DISCORD USERNAME" htmlFor="apply-discord">
                            <input
                              id="apply-discord"
                              type="text"
                              required
                              maxLength={DISCORD_LIMIT}
                              disabled={sending}
                              value={discord}
                              onChange={(event) => setDiscord(event.target.value)}
                              placeholder="yourname"
                              className={fieldClasses}
                            />
                            <p className="text-xs text-muted font-normal leading-relaxed mt-2">
                              How we find you. The handle, not the display name.
                            </p>
                          </Field>
                          <Field label="EMAIL (OPTIONAL)" htmlFor="apply-email">
                            <input
                              id="apply-email"
                              type="email"
                              maxLength={EMAIL_LIMIT}
                              disabled={sending}
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="you@example.com"
                              className={fieldClasses}
                            />
                            <p className="text-xs text-muted font-normal leading-relaxed mt-2">
                              Only used if we cannot reach you on Discord.
                            </p>
                          </Field>
                        </div>

                        {questions.map((question) => (
                          <Question
                            key={question.id}
                            question={question}
                            value={answers[question.id]}
                            disabled={sending}
                            onChange={setAnswer(question.id)}
                          />
                        ))}

                        <TurnstileField turnstile={turnstile} />

                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t border-[#1a1a20] mt-1 pt-6">
                          <button
                            type="submit"
                            disabled={sending || !ready || turnstile.blocking}
                            className="border border-white hover:bg-white hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                          >
                            {sending ? 'SENDING…' : 'SEND APPLICATION'}
                          </button>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="hidden sm:flex items-center gap-1.5">
                              {questions.map((question, index) => (
                                <span
                                  key={question.id}
                                  className={`w-6 h-0.5 rounded-sm transition-colors duration-300 ${
                                    index < answered ? 'bg-violet-400' : 'bg-[#282832]'
                                  }`}
                                />
                              ))}
                            </span>
                            <span className="font-mono text-[11px] text-muted select-none">
                              {answered}/{total}
                            </span>
                          </span>
                        </div>

                        <p
                          aria-live="polite"
                          className={`text-xs font-normal leading-relaxed ${
                            status === 'error' ? 'text-red-400' : 'text-muted'
                          }`}
                        >
                          {status === 'error' && `That did not go through (${error}).`}
                          {status === 'unavailable' && (
                            <>
                              Applications are not being accepted through the site right
                              now. Apply in the{' '}
                              {DISCORD_INVITE ? (
                                <a
                                  href={DISCORD_INVITE}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="underline underline-offset-4"
                                >
                                  Discord
                                </a>
                              ) : (
                                'Discord'
                              )}{' '}
                              instead, or write to{' '}
                              <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="underline underline-offset-4"
                              >
                                {CONTACT_EMAIL}
                              </a>
                              .
                            </>
                          )}
                          {(status === 'idle' || sending) &&
                            (APPLY_ENDPOINT
                              ? 'Your answers go straight to the team. What happens to them is set out in the privacy policy.'
                              : 'Applications are handled in the Discord server.')}
                        </p>
                      </form>
                    </div>
                  )}
                </>
              )}

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
                      Who you would be working with
                    </h3>
                    <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-[380px]">
                      The people already doing these jobs, and what each of them
                      focuses on.
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
