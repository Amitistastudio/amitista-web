import React from 'react';
import { Lock, Smartphone, Copy, Check as CheckIcon } from 'lucide-react';
import {
  PASSWORD_MIN,
  PASSWORD_STALE_DAYS,
  changeOwnPassword,
  confirmTwoFactor,
  daysSince,
  disableTwoFactor,
  formatAgo,
  formatStamp,
  startTwoFactor,
} from '../../../lib/admin';
import { Button, Field, Panel, Pill, TextInput } from '../ui';

function PasswordForm({ account, onChanged }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(false);

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = repeat.length > 0 && next !== repeat;
  const reused = next.length > 0 && current.length > 0 && next === current;
  const holdsName =
    next.length > 0 && next.toLowerCase().includes((account?.name ?? '').toLowerCase());
  const ready = current && next.length >= PASSWORD_MIN && next === repeat && !reused;

  async function submit(event) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await changeOwnPassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="px-4 sm:px-6 py-6">
      {done && (
        <div className="border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 mb-5">
          <p className="text-[13px] text-emerald-200/90 font-normal leading-relaxed">
            Password changed. Every other session signed in as you has been ended — this one stays.
          </p>
        </div>
      )}

      <Field label="Current password" htmlFor="current-password">
        <TextInput
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>

      <Field
        label="New password"
        htmlFor="new-password"
        hint={`At least ${PASSWORD_MIN} characters, six of them different, and not your account name.`}
      >
        <TextInput
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>

      <Field label="Repeat new password" htmlFor="repeat-password">
        <TextInput
          id="repeat-password"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Field>

      {tooShort && (
        <p className="text-[13px] text-amber-300 font-normal mb-4">
          Use at least {PASSWORD_MIN} characters.
        </p>
      )}
      {holdsName && (
        <p className="text-[13px] text-amber-300 font-normal mb-4">
          The server refuses a password with your account name inside it.
        </p>
      )}
      {reused && (
        <p className="text-[13px] text-amber-300 font-normal mb-4">
          That is the password you are already using.
        </p>
      )}
      {mismatch && <p className="text-[13px] text-amber-300 font-normal mb-4">Those two do not match.</p>}
      {error && (
        <p role="alert" className="text-[13px] text-rose-400 font-normal mb-4">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" tone="solid" disabled={busy || !ready}>
          <Lock className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border border-emerald-500/40 bg-emerald-500/10 px-4 sm:px-6 py-5">
      <p className="text-[13px] text-emerald-200/90 font-normal leading-relaxed mb-4">
        Two-step is on. Keep these recovery codes somewhere that is not your phone — each one signs
        you in once if you lose the app. They are shown now and never again.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {codes.map((code) => (
          <code
            key={code}
            className="bg-[#060608] border border-[#282832] px-3 py-2 text-[13px] text-white font-mono text-center"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" onClick={copy}>
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button type="button" tone="solid" onClick={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function TwoFactorPanel({ account, onChanged }) {
  const [setup, setSetup] = React.useState(null);
  const [codes, setCodes] = React.useState(null);
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [removing, setRemoving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const state = account.twoFactor ?? {};

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await startTwoFactor());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await confirmTwoFactor(code.trim());
      setCodes(result.recovery ?? []);
      setSetup(null);
      setCode('');
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await disableTwoFactor(password, code.trim());
      setPassword('');
      setCode('');
      setRemoving(false);
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <Panel title="Two-step verification" icon={Smartphone}>
        <div className="px-4 sm:px-6 py-6">
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Two-step verification"
      icon={Smartphone}
      action={state.enabled ? <Pill tone="green">on</Pill> : <Pill tone="amber">off</Pill>}
    >
      <div className="px-4 sm:px-6 py-6">
        {error && (
          <p role="alert" className="text-[13px] text-rose-400 font-normal mb-4">
            {error}
          </p>
        )}

        {state.enabled && !removing && (
          <>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-2">
              A code from your authenticator app is needed as well as your password. Turned on{' '}
              {formatStamp(state.since)}.
            </p>
            <p className="text-[13px] text-neutral-500 font-normal leading-relaxed mb-5">
              {state.recovery} recovery {state.recovery === 1 ? 'code' : 'codes'} left. If you lose
              both your phone and these codes, someone with account access can clear it for you — or
              it can be cleared on the server itself.
            </p>
            <Button type="button" tone="danger" onClick={() => setRemoving(true)}>
              Turn two-step off
            </Button>
          </>
        )}

        {state.enabled && removing && (
          <form onSubmit={remove} noValidate>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-5">
              Confirm with your password and a current code. Turning it off ends your other sessions.
            </p>
            <Field label="Password" htmlFor="twofactor-password">
              <TextInput
                id="twofactor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Code" htmlFor="twofactor-off-code" hint="A recovery code works too.">
              <TextInput
                id="twofactor-off-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" tone="danger" disabled={busy || !password || !code.trim()}>
                {busy ? 'Turning off…' : 'Turn it off'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setRemoving(false);
                  setPassword('');
                  setCode('');
                  setError(null);
                }}
              >
                Keep it on
              </Button>
            </div>
          </form>
        )}

        {!state.enabled && !setup && (
          <>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-5">
              With two-step on, a stolen password is not enough on its own — signing in also needs a
              code from your phone. Strongly worth it for an account that can reach the server.
            </p>
            <Button type="button" tone="solid" onClick={begin} disabled={busy}>
              <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Starting…' : 'Set up two-step'}
            </Button>
          </>
        )}

        {!state.enabled && setup && (
          <form onSubmit={confirm} noValidate>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
              In your authenticator app choose "add account", then "enter a setup key", and type this
              in. The account name can be anything you like.
            </p>
            <code className="block bg-[#060608] border border-[#282832] px-4 py-3 text-[15px] text-white font-mono tracking-[0.15em] break-all mb-2">
              {setup.secret}
            </code>
            <p className="text-[12px] text-neutral-600 font-normal mb-5 break-all">{setup.uri}</p>

            <Field
              label="Code from the app"
              htmlFor="twofactor-code"
              hint="Six digits. If it is refused, check your phone's clock is set automatically."
            >
              <TextInput
                id="twofactor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button type="submit" tone="solid" disabled={busy || !code.trim()}>
                {busy ? 'Checking…' : 'Turn two-step on'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSetup(null);
                  setCode('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

export default function Security({ account, onChanged, onPasswordChanged }) {
  const age = daysSince(account.passwordChanged);
  const stale = age !== null && age >= PASSWORD_STALE_DAYS;

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title="Password"
        icon={Lock}
        action={
          age === null ? null : (
            <Pill tone={stale ? 'amber' : 'neutral'}>{age === 0 ? 'changed today' : `${age}d old`}</Pill>
          )
        }
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
          <p className="text-[13px] text-neutral-500 font-normal leading-relaxed">
            {account.passwordChanged
              ? `Last changed ${formatAgo(account.passwordChanged)}.`
              : 'The panel has no record of when this was last changed.'}{' '}
            Changing it ends every other session signed in as you, and keeps this one.
          </p>
        </div>
        <PasswordForm
          account={account}
          onChanged={() => {
            onChanged();
            onPasswordChanged?.();
          }}
        />
      </Panel>

      <TwoFactorPanel account={account} onChanged={onChanged} />

    </div>
  );
}
