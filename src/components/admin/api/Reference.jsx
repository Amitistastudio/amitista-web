import React from 'react';
import { BookOpen, Terminal, ShieldCheck, AlertTriangle } from 'lucide-react';
import { SCOPE_LABELS, SCOPE_NOTES, formatRate } from '../../../lib/admin';
import { Panel } from '../ui';
import { CopyButton } from './shared';
import KeyCheck from './KeyCheck';

const LANGUAGES = [
  { id: 'curl', label: 'curl' },
  { id: 'node', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
];

const SAMPLES = {
  curl: `curl https://amitista.com/api/k/v1 \\
  -H "Authorization: Bearer $AMITISTA_KEY"`,
  node: `const response = await fetch('https://amitista.com/api/k/v1', {
  headers: { Authorization: \`Bearer \${process.env.AMITISTA_KEY}\` },
});

if (!response.ok) {
  throw new Error(\`API said \${response.status}\`);
}

const data = await response.json();`,
  python: `import os
import urllib.request

request = urllib.request.Request(
    "https://amitista.com/api/k/v1",
    headers={"Authorization": "Bearer " + os.environ["AMITISTA_KEY"]},
)

with urllib.request.urlopen(request) as response:
    data = response.read()`,
};

const ERRORS = [
  ['401', 'No key was sent at all.', 'Add the Authorization header. A missing variable usually reads as an empty one.'],
  ['401', 'That token is not recognised.', 'It was mistyped, removed, or rotated away — the old half of a rotated key stops working at once.'],
  ['403', 'That token has been revoked.', 'Restore it from its row if that was a mistake, or rotate it for a fresh one.'],
  ['403', 'That token has expired.', 'Push the date out on its row, or clear the expiry.'],
  ['403', 'The key is real but does not hold that scope.', 'Tick the scope on the key, or call something it already holds.'],
  [
    '403',
    'That token is not allowed from this address.',
    'The key has an allow list and the call came from somewhere else. Add the address on its row, or call from a machine already on the list.',
  ],
  ['429', 'Too many requests for this token.', 'Slow down, or ask for a higher limit on that key.'],
  ['404', 'No such path under /api/k.', 'The reachable paths are the ones listed above.'],
];

function Block({ code }) {
  return (
    <div className="relative">
      <pre className="bg-[#060608] border border-[#282832] px-4 py-3 text-[12px] text-neutral-300 font-mono overflow-x-auto">
        {code}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

export default function Reference({ gateway }) {
  const [language, setLanguage] = React.useState('curl');

  const routes = gateway?.routes ?? {};
  const scopes = gateway?.scopes ?? Object.keys(routes);

  return (
    <div className="w-full flex flex-col gap-6">
      <KeyCheck />

      <Panel title="Getting a call through" icon={Terminal}>
        <div className="px-4 sm:px-6 py-5">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
            Every gated call goes to <span className="font-mono text-neutral-300">/api/k</span> and
            carries the key in an <span className="font-mono text-neutral-300">Authorization</span>{' '}
            header. Keep the key in an environment variable, never in the source you commit.
          </p>

          <div className="flex items-center gap-1 border-b border-[#17171d] mb-4">
            {LANGUAGES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setLanguage(entry.id)}
                className={`px-3 py-2 text-[11px] font-semibold tracking-wide border-b-2 -mb-px transition-colors ${
                  language === entry.id
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <Block code={SAMPLES[language]} />

          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mt-4">
            <span className="font-mono text-neutral-300">{gateway?.free?.[0] ?? '/api/k/whoami'}</span>{' '}
            answers with what a key is allowed to reach and does not need a scope of its own — it is
            the quickest way to tell a working key from a broken one.
          </p>
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mt-3">
            An <span className="font-mono text-neutral-300">X-API-Key</span> header carrying the key
            on its own works just as well, for clients that would rather not build an Authorization
            header.
          </p>
        </div>
      </Panel>

      <Panel title="What each scope opens" icon={ShieldCheck}>
        <div className="rail overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-[#17171d]">
                {['Scope', 'Gives you', 'Paths'].map((head) => (
                  <th
                    key={head}
                    className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopes.map((scope) => (
                <tr key={scope} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3 align-top">
                    <span className="block text-[13px] text-white font-normal">
                      {SCOPE_LABELS[scope] ?? scope}
                    </span>
                    <span className="block text-[11px] text-neutral-600 font-mono">{scope}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 font-normal align-top max-w-md">
                    {SCOPE_NOTES[scope] ?? '—'}
                  </td>
                  <td className="px-4 sm:px-6 py-3 align-top">
                    {(routes[scope] ?? []).map((path) => (
                      <span key={path} className="block text-[12px] text-neutral-400 font-mono">
                        {path}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Limits" icon={AlertTriangle}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            A key may make {formatRate(gateway?.rate ?? 120)} by default, counted over a rolling{' '}
            {gateway?.window ?? 60} seconds. Going over gets a{' '}
            <span className="font-mono text-neutral-300">429</span> — the request is refused, not
            queued, and it still counts against the key&apos;s refused tally.
          </p>
          <p className="mb-3">
            The limit is per key, not per account, so splitting work across two keys doubles it. If
            you need more than the default for one integration, someone with panel access can raise
            that key&apos;s ceiling.
          </p>
          <p>
            You may hold up to {gateway?.perOwner ?? 25} keys at a time. Remove the ones you have
            stopped using rather than letting them sit there.
          </p>
        </div>
      </Panel>

      <Panel title="When it says no" icon={AlertTriangle}>
        <div className="rail overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-[#17171d]">
                {['Status', 'What happened', 'What to do'].map((head) => (
                  <th
                    key={head}
                    className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ERRORS.map(([status, what, fix], index) => (
                <tr key={`${status}-${index}`} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-white font-mono align-top">{status}</td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-300 font-normal align-top">
                    {what}
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-500 font-normal align-top">
                    {fix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Live and test" icon={BookOpen}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Both kinds of key reach exactly the same data — there is no sandbox behind the test one.
            The split is there so you can tell at a glance which key is wired into something that
            matters, and throw the other away without thinking about it.
          </p>
          <p>
            The prefix says which is which:{' '}
            <span className="font-mono text-neutral-300">amk_live_</span> or{' '}
            <span className="font-mono text-neutral-300">amk_test_</span>. That prefix is the only
            part of a key the panel stores in readable form, which is how rows are told apart
            without ever holding the key itself.
          </p>
        </div>
      </Panel>

      <Panel title="The public path" icon={BookOpen}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            <span className="font-mono text-neutral-300">{gateway?.mirror ?? '/api/v1'}</span> is
            the same gateway under a friendlier name. It used to answer anyone; it now takes the
            same key, checks the same scopes and counts against the same rate limit, so either
            spelling of a path behaves identically and one revocation stops both.
          </p>
          <p>
            Treat a key as a credential. It is the only thing standing between a stranger and
            these documents now, so if one gets out, revoke it rather than waiting to see whether
            it is used.
          </p>
        </div>
      </Panel>
    </div>
  );
}
