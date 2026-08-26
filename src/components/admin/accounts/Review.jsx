import React from 'react';
import { AlertTriangle, CheckCircle2, LogOut, Download, ShieldCheck } from 'lucide-react';
import {
  revokeAllSessions,
  daysSince,
  daysUntil,
  formatDate,
  DORMANT_DAYS,
  EXPIRING_SOON_DAYS,
} from '../../../lib/admin';
import { Button, Empty, Panel, Pill } from '../ui';

function buildFindings(accounts) {
  const managed = accounts.filter((account) => !account.protected);

  const findings = [
    {
      id: 'expired',
      tone: 'rose',
      title: 'Expired but still enabled',
      why: 'They are refused at sign-in, but the account is still listed. Remove it or clear the date.',
      names: managed.filter((account) => account.expired && !account.disabled).map((a) => a.name),
    },
    {
      id: 'no-two-step',
      tone: 'amber',
      title: 'No two-step verification',
      why: 'A stolen or guessed password is the whole of the defence for these accounts. Each person turns it on themselves under Your account.',
      names: accounts.filter((account) => !account.twoFactor).map((a) => a.name),
    },
    {
      id: 'first-password',
      tone: 'amber',
      title: 'Still on the password they were given',
      why: 'Whoever created the account has seen that password. It is not theirs alone until they change it.',
      names: managed.filter((account) => account.mustChange && account.lastSignIn).map((a) => a.name),
    },
    {
      id: 'never',
      tone: 'amber',
      title: 'Never signed in',
      why: 'An account nobody has used is an account nobody would miss. If it was a mistake, remove it.',
      names: managed.filter((account) => !account.lastSignIn).map((a) => a.name),
    },
    {
      id: 'dormant',
      tone: 'amber',
      title: `Not used in ${DORMANT_DAYS} days`,
      why: 'Access that is not being used is access that is not being watched.',
      names: managed
        .filter((account) => {
          const since = daysSince(account.lastSignIn);
          return since !== null && since >= DORMANT_DAYS && !account.disabled;
        })
        .map((a) => a.name),
    },
    {
      id: 'expiring',
      tone: 'neutral',
      title: `Access ends within ${EXPIRING_SOON_DAYS} days`,
      why: 'They will be turned away at sign-in once the date passes. Extend it now if they still need it.',
      names: managed
        .filter((account) => {
          if (account.expired || !account.expires) return false;
          const left = daysUntil(account.expires);
          return left !== null && left <= EXPIRING_SOON_DAYS;
        })
        .map((account) => `${account.name} (${formatDate(account.expires)})`),
    },
    {
      id: 'undocumented',
      tone: 'neutral',
      title: 'No note saying who they are',
      why: 'In a year nobody will remember why this account exists. A line now saves an awkward guess later.',
      names: managed.filter((account) => !account.note).map((a) => a.name),
    },
    {
      id: 'managers',
      tone: 'neutral',
      title: 'Can add and remove accounts',
      why: 'Anyone here can grant themselves anything else. Keep the list as short as it can be.',
      names: accounts
        .filter((account) => (account.permissions ?? []).includes('users.manage'))
        .map((a) => a.name),
    },
  ];

  return findings.filter((finding) => finding.names.length > 0);
}

function download(accounts) {
  const payload = JSON.stringify(
    { exported: new Date().toISOString(), accounts },
    null,
    2,
  );
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `amitista-accounts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Review({ data, canManage, onError, onSignedOut }) {
  const [ending, setEnding] = React.useState(false);
  const accounts = data?.users ?? [];
  const findings = buildFindings(accounts);

  async function endEverySession() {
    setEnding(false);
    onError(null);
    try {
      await revokeAllSessions();
      if (onSignedOut) onSignedOut();
    } catch (failure) {
      onError(failure.message);
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={findings.length === 0 ? 'Nothing needs attention' : `Worth a look — ${findings.length}`}
        icon={findings.length === 0 ? CheckCircle2 : AlertTriangle}
      >
        {findings.length === 0 && (
          <Empty>
            Every account has been used, has a note, and is on a password only its owner knows.
          </Empty>
        )}
        {findings.map((finding) => (
          <div key={finding.id} className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <Pill tone={finding.tone}>{finding.names.length}</Pill>
              <span className="text-[14px] text-white font-medium">{finding.title}</span>
            </div>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-2">
              {finding.why}
            </p>
            <p className="text-[12px] text-neutral-500 font-normal">{finding.names.join(', ')}</p>
          </div>
        ))}
      </Panel>

      <Panel title="Records" icon={Download}>
        <div className="px-4 sm:px-6 py-6 flex items-start justify-between gap-6 flex-wrap">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-lg">
            Download the account list as JSON — names, roles, permissions, notes, expiry and last
            sign-in. No passwords or hashes are included; the server never hands those out.
          </p>
          <Button type="button" onClick={() => download(accounts)}>
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export accounts
          </Button>
        </div>
      </Panel>

      {canManage && (
        <Panel title="Sessions" icon={LogOut}>
          <div className="px-4 sm:px-6 py-6 flex items-start justify-between gap-6 flex-wrap">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-lg">
              Ending every session signs out every account, including yours, on every device. Use it
              if a laptop goes missing or a password has been shared by accident. Nobody is locked
              out — everyone simply signs in again. To sign out one person only, use{' '}
              <span className="text-neutral-200">Sign out everywhere</span> on their row.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {ending && (
                <Button type="button" onClick={() => setEnding(false)}>
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                tone="danger"
                onClick={() => (ending ? endEverySession() : setEnding(true))}
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                {ending ? 'Yes, sign everyone out' : 'Sign everyone out'}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="How access works" icon={ShieldCheck}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Every permission is checked on the server for each request. Hiding a tab only tidies the
            screen — it is not what keeps anyone out.
          </p>
          <p className="mb-3">
            Owner accounts are stored like any other, and only another owner can change, demote or
            remove one. The panel always keeps one owner who can sign in — the server refuses the
            change that would take the last one away. Everyone changes their own password and
            two-step under Your account.
          </p>
          <p className="mb-3">
            A password you set yourself is sent once, hashed with scrypt and never written down in
            readable form. Nobody, including this panel, can read it back — losing it means setting a
            new one.
          </p>
          <p>
            Disabling an account, setting its password, expiring it, signing it out or removing it
            all end its sessions immediately, not at the next sign-in.
          </p>
        </div>
      </Panel>
    </div>
  );
}
