import React from 'react';
import { AlertTriangle, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import {
  daysSince,
  daysUntil,
  formatDate,
  formatCount,
  keyWorks,
  KEY_EXPIRING_DAYS,
  KEY_IDLE_DAYS,
} from '../../../lib/admin';
import { Button, Empty, Panel, Pill } from '../ui';

function buildFindings(tokens, accounts) {
  const known = new Set(accounts ?? []);
  const working = tokens.filter(keyWorks);

  const findings = [
    {
      id: 'orphan',
      tone: 'rose',
      title: 'Held by an account that is gone',
      why: 'Removing an account leaves its keys behind, still working. Reassign them or remove them.',
      names:
        known.size === 0
          ? []
          : working.filter((token) => token.owner && !known.has(token.owner)).map((t) => t.name),
    },
    {
      id: 'expired',
      tone: 'rose',
      title: 'Expired but not revoked',
      why: 'The gateway already turns these away, but the row still looks live at a glance. Remove them or push the date out.',
      names: tokens.filter((token) => token.expired && !token.revoked).map((t) => t.name),
    },
    {
      id: 'refused',
      tone: 'amber',
      title: 'Refused more often than accepted',
      why: 'Something is calling with the wrong scope, past an expiry, or too fast. Either the key is misconfigured or something is hammering it.',
      names: tokens
        .filter((token) => (token.rejected ?? 0) > (token.requests ?? 0) && (token.rejected ?? 0) > 0)
        .map((t) => `${t.name} (${formatCount(t.rejected)} refused)`),
    },
    {
      id: 'never',
      tone: 'amber',
      title: 'Never used',
      why: 'A key nobody calls is a key nobody would notice being stolen. If it was made by mistake, remove it.',
      names: working.filter((token) => !token.lastUsed).map((t) => t.name),
    },
    {
      id: 'idle',
      tone: 'amber',
      title: `Not used in ${KEY_IDLE_DAYS} days`,
      why: 'Access nobody is exercising is access nobody is watching.',
      names: working
        .filter((token) => {
          const since = daysSince(token.lastUsed);
          return since !== null && since >= KEY_IDLE_DAYS;
        })
        .map((t) => t.name),
    },
    {
      id: 'forever',
      tone: 'neutral',
      title: 'Live keys with no expiry',
      why: 'Nothing forces a look at these again. An end date turns a forgotten key into one that quietly retires itself.',
      names: working
        .filter((token) => !token.expires && (token.environment ?? 'live') === 'live')
        .map((t) => t.name),
    },
    {
      id: 'ending',
      tone: 'neutral',
      title: `Ending within ${KEY_EXPIRING_DAYS} days`,
      why: 'Whatever uses these stops working on that date, without warning. Push the date out now if they are still needed.',
      names: working
        .filter((token) => {
          if (!token.expires || token.expired) return false;
          const left = daysUntil(token.expires);
          return left !== null && left <= KEY_EXPIRING_DAYS;
        })
        .map((t) => `${t.name} (${formatDate(t.expires)})`),
    },
    {
      id: 'everything',
      tone: 'neutral',
      title: 'Holds every scope',
      why: 'Give a key only what its job needs. A key that can read everything is a bigger loss than one that cannot.',
      names: working
        .filter((token) => (token.scopes ?? []).length >= 3)
        .map((t) => t.name),
    },
    {
      id: 'undocumented',
      tone: 'neutral',
      title: 'No note saying what it is for',
      why: 'In six months nobody will remember what this one runs, and nobody will dare revoke it.',
      names: working.filter((token) => !token.note).map((t) => t.name),
    },
    {
      id: 'revoked',
      tone: 'neutral',
      title: 'Revoked but still listed',
      why: 'These are already refused. Keep them if you want the counters, remove them if you want a shorter list.',
      names: tokens.filter((token) => token.revoked).map((t) => t.name),
    },
  ];

  return findings.filter((finding) => finding.names.length > 0);
}

function download(tokens) {
  const payload = JSON.stringify(
    {
      exported: new Date().toISOString(),
      keys: tokens.map((token) => ({ ...token, paths: undefined })),
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `amitista-api-keys-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ApiReview({ data }) {
  const tokens = data?.tokens ?? [];
  const findings = buildFindings(tokens, data?.accounts);

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={findings.length === 0 ? 'Nothing needs attention' : `Worth a look — ${findings.length}`}
        icon={findings.length === 0 ? CheckCircle2 : AlertTriangle}
      >
        {findings.length === 0 && (
          <Empty>
            Every key is held by somebody real, has been used, carries a note, and holds only the
            scopes it needs.
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
            Download every key as JSON — names, holders, scopes, environments, expiry, limits and
            counters. No key material is included; the server has none to give.
          </p>
          <Button type="button" onClick={() => download(tokens)}>
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export keys
          </Button>
        </div>
      </Panel>

      <Panel title="What a key can and cannot do" icon={ShieldCheck}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            A key reaches the gated API and nothing else. It cannot sign in, cannot read this panel,
            and cannot change anything — every path behind it is read-only JSON that is also served
            openly at the unkeyed address.
          </p>
          <p className="mb-3">
            So a leaked key is a nuisance rather than a breach: what it exposes is already public.
            What it costs you is the counting, the rate limit, and the ability to cut one caller off
            without cutting off the rest.
          </p>
          <p>
            Scopes are checked by the gateway on every call, not by this panel. Unticking one here
            takes effect wherever the key is, within about a minute.
          </p>
        </div>
      </Panel>
    </div>
  );
}
