import React from 'react';
import { History as HistoryIcon, LogIn, ShieldAlert, RefreshCw, Info } from 'lucide-react';
import { AUDIT_LABELS, formatAgo, formatStamp } from '../../../lib/admin';
import { Button, Empty, Figure, Panel, Pill, Select } from '../ui';

const GROUPS = [
  { id: 'all', label: 'Everything', match: () => true },
  { id: 'signin', label: 'Sign-ins', match: (action) => action.startsWith('signin.') },
  {
    id: 'security',
    label: 'Password & two-step',
    match: (action) =>
      action.startsWith('password.') || action.startsWith('twofactor.') || action === 'user.password',
  },
  { id: 'keys', label: 'API keys', match: (action) => action.startsWith('token.') || action.startsWith('hook.') },
  { id: 'admin', label: 'Things you changed', match: (action) => action.startsWith('user.') || action.startsWith('shield.') || action.startsWith('brand.') || action.startsWith('finding.') },
  { id: 'others', label: 'Done to you by others', match: (action, entry) => entry.byOther },
];

const TONE = {
  'signin.failed': 'rose',
  'signin.barred': 'rose',
  'signin.badCode': 'rose',
  'signin.googleRefused': 'rose',
  'password.failed': 'rose',
  'twofactor.failed': 'rose',
  'signin.ok': 'green',
  'signin.recovery': 'amber',
  'password.changed': 'green',
  'twofactor.on': 'green',
  'twofactor.off': 'amber',
  'user.password': 'amber',
  'user.signedOut': 'amber',
  'twofactor.cleared': 'amber',
};

function Line({ entry }) {
  return (
    <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] text-neutral-300 font-normal">
          {entry.byOther ? (
            <span className="text-white">{entry.actor || 'someone'}</span>
          ) : (
            <span className="text-white">You</span>
          )}{' '}
          {AUDIT_LABELS[entry.action] ?? entry.action}
          {entry.byOther ? <span className="text-neutral-400"> — your account</span> : null}
          {entry.detail?.mode ? <span className="text-neutral-400"> {entry.detail.mode}</span> : null}
          {entry.detail?.email ? <span className="text-neutral-400"> {entry.detail.email}</span> : null}
          {typeof entry.detail?.remaining === 'number' ? (
            <span className="text-neutral-500"> ({entry.detail.remaining} left)</span>
          ) : null}
          {Array.isArray(entry.detail?.changes) && entry.detail.changes.length > 0 ? (
            <span className="text-neutral-500"> ({entry.detail.changes.join(', ')})</span>
          ) : null}
        </p>
        <p className="text-[11px] text-neutral-600 font-normal mt-1">
          {formatStamp(entry.at)}
          {entry.ip ? ` · ${entry.ip}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {TONE[entry.action] && <Pill tone={TONE[entry.action]}>{entry.action}</Pill>}
        <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
          {formatAgo(entry.at)}
        </span>
      </div>
    </div>
  );
}

export default function History({ activity, error, loading, onRefresh }) {
  const [group, setGroup] = React.useState('all');

  const chosen = GROUPS.find((entry) => entry.id === group) ?? GROUPS[0];
  const all = activity?.entries ?? [];
  const entries = all.filter((entry) => chosen.match(entry.action ?? '', entry));
  const signIns = activity?.signIns ?? [];
  const refused = activity?.refused ?? [];
  const previous = activity?.previousSignIn ?? null;
  const sincePrevious = previous
    ? refused.filter((entry) => (entry.at ?? '') > previous).length
    : refused.length;

  const addresses = [];
  for (const entry of signIns) {
    if (entry.ip && !addresses.includes(entry.ip)) addresses.push(entry.ip);
  }

  if (!activity && error) {
    return (
      <Panel
        title="History"
        icon={HistoryIcon}
        action={
          <Button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Reading…' : 'Try again'}
          </Button>
        }
      >
        <Empty>{error}</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Figure label="Sign-ins" value={signIns.length} hint="in the log this view holds" />
        <Figure
          label="Refused"
          value={activity?.refusedTotal ?? refused.length}
          tone={(activity?.refusedTotal ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
          hint="attempts turned away under your name"
        />
        <Figure
          label="Since previous"
          value={sincePrevious}
          tone={sincePrevious > 0 ? 'text-rose-400' : 'text-white'}
          hint={previous ? `since ${formatAgo(previous)}` : 'nothing earlier to compare with'}
        />
        <Figure
          label="Addresses"
          value={addresses.length}
          hint={addresses.length > 1 ? 'you have signed in from more than one' : 'you sign in from one'}
        />
      </div>

      {sincePrevious > 0 && (
        <Panel title="Worth a look" icon={ShieldAlert}>
          <div className="px-4 sm:px-6 py-5">
            <p className="text-[13px] text-neutral-300 font-normal leading-relaxed">
              {sincePrevious} attempt{sincePrevious === 1 ? '' : 's'} under your name{' '}
              {sincePrevious === 1 ? 'was' : 'were'} refused since your previous sign-in. If the
              addresses below are not yours, change your password and turn two-step on.
            </p>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title={`Recent sign-ins — ${signIns.length}`} icon={LogIn}>
          {signIns.length === 0 && <Empty>{loading ? 'Reading the log…' : 'No sign-in is recorded yet.'}</Empty>}
          {signIns.map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex items-start justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-neutral-300 font-normal">
                  {formatStamp(entry.at)}
                  {index === 0 ? <span className="text-neutral-500"> · this session</span> : null}
                </p>
                <p className="text-[11px] text-neutral-600 font-mono mt-1 break-all">
                  {entry.ip ?? 'address not recorded'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {entry.action === 'signin.recovery' && <Pill tone="amber">recovery code</Pill>}
                {entry.detail?.method === 'google' && <Pill tone="purple">google</Pill>}
                <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
                  {formatAgo(entry.at)}
                </span>
              </div>
            </div>
          ))}
        </Panel>

        <Panel
          title={`Refused attempts — ${refused.length}`}
          icon={ShieldAlert}
          action={refused.length > 0 ? <Pill tone="amber">check these</Pill> : null}
        >
          {refused.length === 0 && (
            <Empty>
              {loading ? 'Reading the log…' : 'Nothing under your name has been turned away.'}
            </Empty>
          )}
          {refused.map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex items-start justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-neutral-300 font-normal">
                  {AUDIT_LABELS[entry.action] ?? entry.action}
                </p>
                <p className="text-[11px] text-neutral-600 font-normal mt-1 break-all">
                  {formatStamp(entry.at)}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                </p>
              </div>
              <span className="text-[12px] text-neutral-600 font-normal tabular-nums shrink-0">
                {formatAgo(entry.at)}
              </span>
            </div>
          ))}
        </Panel>
      </div>

      <Panel
        title={`Everything on your account — ${entries.length}`}
        icon={HistoryIcon}
        action={
          <Button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Reading…' : 'Refresh'}
          </Button>
        }
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] max-w-[320px]">
          <Select
            value={group}
            aria-label="Filter your activity"
            onChange={(event) => setGroup(event.target.value)}
          >
            {GROUPS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        {!activity && <Empty>{loading ? 'Reading the log…' : 'The log could not be read.'}</Empty>}
        {activity && entries.length === 0 && <Empty>Nothing recorded under that filter.</Empty>}

        {entries.map((entry, index) => (
          <Line key={`${entry.at}-${index}`} entry={entry} />
        ))}
      </Panel>

      <Panel title="What this shows" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Only lines that name your account: what you did, and what someone else did to your
            account. Everyone else's activity stays in the Accounts section, which needs permission
            to open.
          </p>
          <p>
            The panel keeps its own append-only log on the server, separate from the system journal.
            It holds the last {(activity?.kept ?? 4000).toLocaleString('en-GB')} lines in total, so a
            busy panel will age the oldest of yours out.
          </p>
        </div>
      </Panel>
    </div>
  );
}
