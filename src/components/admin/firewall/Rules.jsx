import React from 'react';
import { Ban, Eye, Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { Button, Empty, Field, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { Confirm } from '../api/shared';

const KIND_LABEL = {
  ip: 'Address or range',
  country: 'Country',
  agent: 'User agent',
  path: 'Path',
  method: 'Method',
  signature: 'Signature',
};

const KIND_HINT = {
  ip: 'One address or a CIDR range, like 203.0.113.4 or 198.51.100.0/24.',
  country: 'A two-letter code, like DE. Needs the country table the Activity tab uses.',
  agent: 'Matched against the user agent. * and ? are wildcards; anything else is a substring.',
  path: 'Matched against the request path. * and ? are wildcards; anything else is a substring.',
  method: 'Refuses a whole HTTP method.',
  signature: 'A built-in pattern set, kept in step at both layers.',
};

const MODE_PILL = {
  block: { tone: 'rose', label: 'Blocking' },
  monitor: { tone: 'amber', label: 'Watching' },
};

function Value({ rule, signatures }) {
  if (rule.kind === 'signature') {
    const entry = signatures.find((item) => item.id === rule.value);
    return (
      <span>
        {entry?.label ?? rule.value}
        <span className="text-neutral-600 font-mono ml-2">{rule.value}</span>
      </span>
    );
  }
  return <span className="font-mono">{rule.value}</span>;
}

function blank(defaultMode) {
  return { id: '', kind: 'ip', value: '', mode: defaultMode || 'monitor', note: '', enabled: true };
}

export default function Rules({ data, canManage, busy, onSave, onDelete }) {
  const [draft, setDraft] = React.useState(() => blank(data.settings.defaultMode));
  const [open, setOpen] = React.useState(false);

  const signatures = data.signatures ?? [];
  const rules = data.rules ?? [];

  const set = (fields) => setDraft((current) => ({ ...current, ...fields }));

  const edit = (rule) => {
    setDraft({
      id: rule.id,
      kind: rule.kind,
      value: rule.value,
      mode: rule.mode,
      note: rule.note ?? '',
      enabled: rule.enabled,
    });
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSave(draft);
    if (saved) {
      setDraft(blank(data.settings.defaultMode));
      setOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <Panel
          title={draft.id ? 'Edit rule' : 'New rule'}
          icon={Plus}
          action={
            <Button type="button" onClick={() => (open ? setOpen(false) : setOpen(true))}>
              {open ? 'Close' : 'Add a rule'}
            </Button>
          }
        >
          {open && (
            <form className="px-4 sm:px-6 py-5" onSubmit={submit}>
              <div className="grid gap-x-6 md:grid-cols-2">
                <Field label="What to match" htmlFor="fw-kind">
                  <Select
                    id="fw-kind"
                    value={draft.kind}
                    onChange={(event) => set({ kind: event.target.value, value: '' })}
                  >
                    {(data.kinds ?? []).map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABEL[kind] ?? kind}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Mode" htmlFor="fw-mode">
                  <Select
                    id="fw-mode"
                    value={draft.mode}
                    onChange={(event) => set({ mode: event.target.value })}
                  >
                    <option value="monitor">Watch — log it, let it through</option>
                    <option value="block">Block — refuse with 403</option>
                  </Select>
                </Field>
              </div>

              <Field label={KIND_LABEL[draft.kind] ?? 'Value'} hint={KIND_HINT[draft.kind]} htmlFor="fw-value">
                {draft.kind === 'signature' ? (
                  <Select
                    id="fw-value"
                    value={draft.value}
                    onChange={(event) => set({ value: event.target.value })}
                  >
                    <option value="">Pick a signature…</option>
                    {signatures.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label} — {entry.patterns} patterns
                      </option>
                    ))}
                  </Select>
                ) : draft.kind === 'method' ? (
                  <Select
                    id="fw-value"
                    value={draft.value}
                    onChange={(event) => set({ value: event.target.value })}
                  >
                    <option value="">Pick a method…</option>
                    {(data.methods ?? []).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <TextInput
                    id="fw-value"
                    value={draft.value}
                    onChange={(event) => set({ value: event.target.value })}
                    placeholder={draft.kind === 'ip' ? '198.51.100.0/24' : ''}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </Field>

              <Field label="Note" hint="Why this rule exists. Shown beside it in the list." htmlFor="fw-note">
                <TextInput
                  id="fw-note"
                  value={draft.note}
                  onChange={(event) => set({ note: event.target.value })}
                  maxLength={200}
                  autoComplete="off"
                />
              </Field>

              {draft.kind === 'signature' && draft.value === 'tooling' && (
                <Notice tone="amber">
                  Scripted clients covers curl, wget and the standard HTTP libraries. Blocking it
                  refuses legitimate API customers as well as scrapers.
                </Notice>
              )}

              {draft.kind === 'country' && !data.geo?.available && (
                <Notice tone="amber">
                  The country table is not on disk, so country rules match nothing until
                  amitista-admin-geo.timer has run.
                </Notice>
              )}

              <div className="flex items-center gap-3 mt-5">
                <Button type="submit" tone="solid" disabled={busy || !draft.value}>
                  {draft.id ? 'Save changes' : 'Add rule'}
                </Button>
                {draft.id ? (
                  <Button type="button" onClick={() => setDraft(blank(data.settings.defaultMode))}>
                    New instead
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </Panel>
      )}

      <Panel title={`Rules (${rules.length} of ${data.limit})`} icon={Ban}>
        {rules.length === 0 ? (
          <Empty>No rules yet. Nothing is being blocked or watched.</Empty>
        ) : (
          <ul className="divide-y divide-[#282832]">
            {rules.map((rule) => {
              const pill = MODE_PILL[rule.mode] ?? MODE_PILL.monitor;
              return (
                <li key={rule.id} className="px-4 sm:px-6 py-4 flex flex-wrap items-start gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-200">
                      <span className="text-neutral-500 text-[11px] uppercase tracking-[0.12em]">
                        {KIND_LABEL[rule.kind] ?? rule.kind}
                      </span>
                      <Value rule={rule} signatures={signatures} />
                      {!rule.enabled && <Pill>Off</Pill>}
                      {rule.enabled && <Pill tone={pill.tone}>{pill.label}</Pill>}
                      {rule.layer === 'edge' && <Pill tone="purple">nginx</Pill>}
                    </div>
                    {rule.note && (
                      <p className="text-[12px] text-neutral-500 font-normal mt-1">{rule.note}</p>
                    )}
                    <p className="text-[11px] text-neutral-600 font-mono mt-1">
                      {rule.seen > 0
                        ? `${rule.seen} hit${rule.seen === 1 ? '' : 's'} in the panel's window`
                        : 'no hits recorded'}
                      {rule.setBy ? ` · added by ${rule.setBy}` : ''}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => onSave({ ...rule, enabled: !rule.enabled })}
                      >
                        {rule.enabled ? (
                          <PowerOff className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <Power className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                        {rule.enabled ? 'Turn off' : 'Turn on'}
                      </Button>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onSave({ ...rule, mode: rule.mode === 'block' ? 'monitor' : 'block' })
                        }
                      >
                        {rule.mode === 'block' ? (
                          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                        {rule.mode === 'block' ? 'Watch only' : 'Block'}
                      </Button>
                      <Button type="button" disabled={busy} onClick={() => edit(rule)}>
                        Edit
                      </Button>
                      <Confirm
                        label="Remove"
                        icon={Trash2}
                        danger
                        disabled={busy}
                        onConfirm={() => onDelete(rule.id)}
                      >
                        Remove this rule? Traffic it was catching goes back to normal.
                      </Confirm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
