import React from 'react';
import { MessageCircle } from 'lucide-react';
import { setDiscordPrefs, KEY_EVENT_LABEL, KEY_EVENT_NOTE } from '../../../lib/admin';
import { Check, Empty, Field, Notice, Panel, Pill } from '../ui';

export default function DmAlerts({ discord, facts, wide, onChanged }) {
  const linked = Boolean(discord?.linked);
  const prefs = discord?.prefs ?? { signin: false, events: [] };
  const kinds = (facts?.events ?? []).filter(
    (kind) => wide || !(facts?.adminOnly ?? []).includes(kind),
  );

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function toggle(kind, on) {
    const events = on
      ? [...new Set([...(prefs.events ?? []), kind])]
      : (prefs.events ?? []).filter((entry) => entry !== kind);
    setBusy(true);
    setError(null);
    try {
      const payload = await setDiscordPrefs({ ...prefs, events });
      if (onChanged) onChanged(payload.discord);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (!linked) {
    return (
      <Panel title="Straight to your Discord" icon={MessageCircle} action={<Pill>not connected</Pill>}>
        <Empty>
          Connect your Discord account under Account → Discord and the bot can DM you the same
          events, with no webhook to set up.
        </Empty>
      </Panel>
    );
  }

  const on = (prefs.events ?? []).length;

  return (
    <Panel
      title="Straight to your Discord"
      icon={MessageCircle}
      action={<Pill tone={on ? 'green' : 'neutral'}>{on ? `${on} on` : 'off'}</Pill>}
    >
      <div className="px-4 sm:px-6 py-5">
        {error && (
          <p role="alert" className="text-[13px] text-rose-400 font-normal mb-4">
            {error}
          </p>
        )}

        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
          The bot DMs <span className="text-neutral-200">{discord.tag}</span> as these happen — no
          address to paste, nothing to keep working. They are batched the same way the webhooks are.
        </p>

        <Field label="DM me about" hint="Ordinary use fires on every successful call — a busy key will fill your DMs.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {kinds.map((kind) => (
              <Check
                key={kind}
                checked={(prefs.events ?? []).includes(kind)}
                disabled={busy}
                label={KEY_EVENT_LABEL[kind] ?? kind}
                hint={KEY_EVENT_NOTE[kind]}
                onChange={(next) => toggle(kind, next)}
              />
            ))}
          </div>
        </Field>

        {(prefs.events ?? []).includes('used') && (
          <Notice tone="amber">
            <span className="font-semibold">Ordinary use is on.</span> Every successful call to one
            of your keys becomes a DM. Batching collapses bursts, but a live key will still be loud.
          </Notice>
        )}
      </div>
    </Panel>
  );
}
