import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { CONTACT_EMAIL, DISCORD_INVITE, REPLY_WINDOW } from '../../siteConfig';
import { submitEnquiry, UNAVAILABLE as RELAY_DOWN } from '../../lib/enquiry';
import { signIn, verifyGoogleCode, readSignInNotice } from '../../lib/admin';
import { FIELD_CLASS } from './ui';
import DiscordMark from '../DiscordMark';

const NAME_LIMIT = 256;
const REASON_LIMIT = 1024;

const ACCESS_KINDS = [
  'I am a client of the studio',
  'I work with the studio',
  'I am on the team',
  'Something else',
];

const STEPS = [
  {
    step: '01',
    title: 'You ask for access',
    blurb: 'A couple of lines about who you are and what you need to get to.',
  },
  {
    step: '02',
    title: 'We check it is you',
    blurb: 'Accounts only go to people the studio already works with.',
  },
  {
    step: '03',
    title: 'We send you the keys',
    blurb: 'A username and a first password, which the panel makes you replace.',
  },
];

const EMPTY_REQUEST = {
  name: '',
  email: '',
  kind: ACCESS_KINDS[0],
  reason: '',
};

const labelClass =
  'block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2';

const primaryButtonClass =
  'w-full inline-flex items-center justify-center gap-2 bg-white text-black px-4 sm:px-6 py-3 text-[13px] font-semibold tracking-wide hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

const quietButtonClass =
  'inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-400 hover:text-white transition-colors';

const helpLinkClass =
  'inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-400 hover:text-white transition-colors';

const errorClass = 'text-[13px] text-rose-400 font-normal leading-relaxed';

function Card({ label, icon: Icon, aside, children }) {
  return (
    <div className="w-full border border-[#282832] bg-[#0a0a0d]">
      <div className="h-14 px-4 sm:px-6 sm:px-7 flex items-center justify-between gap-4 border-b border-[#282832]">
        <span className="inline-flex items-center gap-2.5 text-[11px] font-semibold text-neutral-300 tracking-[0.2em] uppercase">
          <Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={1.5} />
          {label}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Field({ label, htmlFor, aside, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className={labelClass} htmlFor={htmlFor}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && (
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-2">{hint}</p>
      )}
    </div>
  );
}

function Step({ step, title, blurb }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2.5 mb-1.5">
        <span className="font-mono text-[11px] text-violet-400/70 select-none">{step}</span>
        <h3 className="text-[13px] font-medium text-white tracking-tight">{title}</h3>
      </div>
      <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">{blurb}</p>
    </div>
  );
}

function buildRequestMailto(form) {
  const subject = `Studio panel — access request from ${form.name.trim() || 'a visitor'}`;
  const body = [
    `Name: ${form.name}`,
    `Email: ${form.email}`,
    `Relationship: ${form.kind}`,
    '',
    form.reason,
  ].join('\n');

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function SignInPanel({ configured, notice, onSignedIn, onRequest, onGateExpired }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState('password');
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const codeField = React.useRef(null);

  const viaGoogle = step === 'google-code';

  React.useEffect(() => {
    if ((step === 'code' || step === 'google-code') && codeField.current) codeField.current.focus();
  }, [step]);

  React.useEffect(() => {
    if (!notice) return;
    if (notice.step === 'google-code') setStep('google-code');
    else if (notice.step === 'error') setError(notice.message);
  }, [notice]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const session = viaGoogle
        ? await verifyGoogleCode(code.trim())
        : await signIn(username.trim(), password, step === 'code' ? code.trim() : undefined);
      setPassword('');
      setCode('');
      onSignedIn(session);
    } catch (failure) {
      if (failure.needsGate) {
        onGateExpired();
      } else if (failure.needsCode) {
        setStep('code');
        setError(null);
      } else {
        setError(failure.message);
        setCode('');
        if (step === 'password') setPassword('');
      }
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep('password');
    setPassword('');
    setCode('');
    setError(null);
  }

  const onCodeStep = step === 'code' || viaGoogle;

  return (
    <Card
      label={onCodeStep ? 'Two-step' : 'Sign in'}
      icon={onCodeStep ? ShieldCheck : Lock}
      aside={
        onCodeStep ? (
          <button type="button" onClick={restart} className={quietButtonClass}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Start again
          </button>
        ) : null
      }
    >
      <div className="p-6 sm:p-7">
        {!configured && (
          <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-6 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-[2px]" strokeWidth={1.5} />
            <p className="text-[12px] text-amber-200/80 font-normal leading-relaxed">
              The panel has no owner account yet, so sign-in will be refused.
            </p>
          </div>
        )}

        {onCodeStep ? (
          <form onSubmit={submit} noValidate className="space-y-6">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
              {viaGoogle
                ? 'Google confirmed who you are. This account also has two-step on, so it still needs a code.'
                : 'One more step. Open your authenticator app and type the six digits it shows.'}
            </p>

            <Field
              label="Two-step code"
              htmlFor="admin-code"
              hint="A recovery code works here too, and can only be used once."
            >
              <input
                id="admin-code"
                ref={codeField}
                name="one-time-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="000000"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className={`${FIELD_CLASS} font-mono tracking-[0.3em]`}
              />
            </Field>

            {error && (
              <p role="alert" className={errorClass}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !code.trim()}
              className={primaryButtonClass}
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              {busy ? 'Checking…' : 'Confirm'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="space-y-5">
              <Field label="Username" htmlFor="admin-username">
                <input
                  id="admin-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="The name we gave you"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className={FIELD_CLASS}
                />
              </Field>

              <Field label="Password" htmlFor="admin-password">
                <div className="relative">
                  <input
                    id="admin-password"
                    name="password"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${FIELD_CLASS} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((shown) => !shown)}
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    className="absolute right-0 top-0 h-full px-4 text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {reveal ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </Field>
            </div>

            {error && (
              <p role="alert" className={`${errorClass} mt-5`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className={`${primaryButtonClass} mt-6`}
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

          </form>
        )}
      </div>

      {!onCodeStep && (
        <div className="border-t border-[#282832] px-4 sm:px-6 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-neutral-500 font-normal">No account yet?</p>
          <button type="button" onClick={onRequest} className={quietButtonClass}>
            Ask for one
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
    </Card>
  );
}

function RequestPanel({ onBack }) {
  const [form, setForm] = React.useState(EMPTY_REQUEST);
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState('');
  const [sentTo, setSentTo] = React.useState('');

  const sending = status === 'sending';

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (status === 'error') setStatus('idle');
  };

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    if (event.currentTarget.botcheck?.checked) return;

    setStatus('sending');
    setError('');

    const payload = {
      form: 'contact',
      name: form.name,
      email: form.email,
      projectType: 'Studio panel — account request',
      timeline: form.kind,
      message: form.reason,
    };

    try {
      const outcome = await submitEnquiry(payload);

      if (outcome === RELAY_DOWN) {
        window.location.href = buildRequestMailto(form);
        setStatus('mailto');
        return;
      }

      setSentTo(form.email.trim());
      setForm(EMPTY_REQUEST);
      setStatus('sent');
    } catch (failure) {
      setError(failure.message);
      setStatus('error');
    }
  }

  if (status === 'sent' || status === 'mailto') {
    return (
      <Card label="Request sent" icon={Check}>
        <div className="p-6 sm:p-8">
          <div className="w-10 h-10 border border-[#282832] flex items-center justify-center mb-6">
            <Check className="h-[18px] w-[18px] text-violet-400" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-medium text-white tracking-tight mb-3">
            {status === 'mailto' ? 'Finish it in your email' : 'That is with us'}
          </h2>
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-6">
            {status === 'mailto' ? (
              <>
                The form could not reach us just now, so we opened a draft to{' '}
                <span className="text-neutral-200">{CONTACT_EMAIL}</span> with everything you typed.
                Send it and we will pick it up from there.
              </>
            ) : (
              <>
                We read these by hand. If access makes sense we will create the account and write
                back to{' '}
                {sentTo ? (
                  <span className="font-mono text-[12px] text-neutral-200 break-all">{sentTo}</span>
                ) : (
                  'the address you gave us'
                )}{' '}
                within {REPLY_WINDOW}, with a username and a first password.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 border border-[#282832] hover:border-neutral-500 text-white font-semibold text-[11px] tracking-[0.2em] px-4 sm:px-6 py-3 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            BACK TO SIGN IN
          </button>
        </div>
      </Card>
    );
  }

  const ready = form.name.trim() && form.email.trim() && form.reason.trim();

  return (
    <Card
      label="Request access"
      icon={UserPlus}
      aside={
        <button type="button" onClick={onBack} className={quietButtonClass}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Sign in
        </button>
      }
    >
      <form onSubmit={submit} className="p-6 sm:p-7" noValidate>
        <input
          type="checkbox"
          name="botcheck"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />

        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-6">
          Tell us who you are. Nothing is created by sending this — a person reads it and decides.
        </p>

        <div className="space-y-5">
          <Field label="Your name" htmlFor="request-name">
            <input
              id="request-name"
              type="text"
              autoComplete="name"
              maxLength={NAME_LIMIT}
              placeholder="First and last"
              required
              disabled={sending}
              value={form.name}
              onChange={update('name')}
              className={FIELD_CLASS}
            />
          </Field>

          <Field
            label="Email"
            htmlFor="request-email"
            hint="Use the address the studio already knows you by — it is how we tell it is really you."
          >
            <input
              id="request-email"
              type="email"
              autoComplete="email"
              maxLength={NAME_LIMIT}
              placeholder="you@example.com"
              required
              disabled={sending}
              value={form.email}
              onChange={update('email')}
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="How you know us" htmlFor="request-kind">
            <div className="relative">
              <select
                id="request-kind"
                disabled={sending}
                value={form.kind}
                onChange={update('kind')}
                className={`${FIELD_CLASS} [color-scheme:dark] appearance-none pr-10`}
              >
                {ACCESS_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <ArrowRight
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rotate-90 text-neutral-500"
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
          </Field>

          <Field
            label="What you need to get to"
            htmlFor="request-reason"
            aside={
              form.reason.length > REASON_LIMIT * 0.6 ? (
                <span
                  className={`font-mono text-[11px] mb-2 ${
                    form.reason.length >= REASON_LIMIT ? 'text-amber-400' : 'text-neutral-500'
                  }`}
                >
                  {form.reason.length}/{REASON_LIMIT}
                </span>
              ) : null
            }
          >
            <textarea
              id="request-reason"
              rows={4}
              maxLength={REASON_LIMIT}
              placeholder="Which project you are on, and what you are trying to see or do in the panel."
              required
              disabled={sending}
              value={form.reason}
              onChange={update('reason')}
              className={`${FIELD_CLASS} resize-none`}
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className={`${errorClass} mt-5`}>
            {error}
          </p>
        )}

        <button type="submit" disabled={sending || !ready} className={`${primaryButtonClass} mt-6`}>
          <Mail className="h-4 w-4" strokeWidth={2} />
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </Card>
  );
}

export default function SignIn({ onSignedIn, configured, onGateExpired }) {
  const [mode, setMode] = React.useState('signin');
  const [notice, setNotice] = React.useState(null);

  React.useEffect(() => {
    const found = readSignInNotice(window.location.search);
    if (!found) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (found.step === 'gate') onGateExpired();
    else setNotice(found);
  }, [onGateExpired]);

  const requesting = mode === 'request';

  return (
    <div className="w-full max-w-[720px] flex flex-col items-center text-center">
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-[11px] font-semibold text-neutral-400 tracking-[0.2em] uppercase mb-6 select-none">
        <Lock className="h-3 w-3" strokeWidth={1.5} />
        Studio panel
      </div>

      <h1 className="text-3xl sm:text-4xl md:text-[42px] font-normal text-white tracking-tight leading-[1.05] mb-4">
        {requesting ? 'Ask for an account' : 'Welcome back'}
      </h1>

      <p className="text-[13px] sm:text-sm text-neutral-400 font-normal max-w-[420px] leading-relaxed tracking-tight mb-10">
        There is no sign-up here, and that is on purpose — accounts are made one at a time by the
        studio.
      </p>

      <div className="w-full max-w-[440px] text-left">
        {requesting ? (
          <RequestPanel onBack={() => setMode('signin')} />
        ) : (
          <SignInPanel
            configured={configured}
            notice={notice}
            onSignedIn={onSignedIn}
            onGateExpired={onGateExpired}
            onRequest={() => setMode('request')}
          />
        )}
      </div>

      <div className="w-full border-t border-[#282832] mt-14 pt-8 grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6 text-left">
        {STEPS.map((entry) => (
          <Step key={entry.step} {...entry} />
        ))}
      </div>

      <div className="w-full border-t border-[#282832] mt-8 pt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <p className="text-[12px] text-neutral-500 font-normal">
          Locked out? We can reset a password from our side.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <a href={`mailto:${CONTACT_EMAIL}`} className={helpLinkClass}>
            <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
            {CONTACT_EMAIL}
          </a>
          {DISCORD_INVITE && (
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className={helpLinkClass}
            >
              <DiscordMark className="h-3.5 w-3.5" />
              Open a ticket
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
