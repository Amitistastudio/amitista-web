import React from 'react';
import { Plus, Save } from 'lucide-react';
import {
  allowListText,
  createKey,
  formatRate,
  parseAllowList,
  todayIso,
  updateKey,
} from '../../../lib/admin';
import { Button, Field, Select, TextArea, TextInput } from '../ui';
import { ScopeGrid } from './shared';

function AllowField({ id, value, onChange, gateway, readOnly, locked }) {
  const count = parseAllowList(value).length;
  return (
    <Field
      label="Allowed addresses"
      htmlFor={id}
      hint={
        locked
          ? 'Set by whoever runs the panel. Ask them to change it.'
          : `One address or range a line — 203.0.113.4 or 203.0.113.0/24. Leave it empty and the key works from anywhere. Up to ${gateway?.maxAllowed ?? 24}.${count > 0 ? ` ${count} listed.` : ''}`
      }
    >
      <TextArea
        id={id}
        rows={3}
        value={value}
        readOnly={readOnly}
        spellCheck="false"
        placeholder="203.0.113.0/24"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function OwnerPicker({ id, accounts, value, onChange }) {
  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {accounts.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </Select>
  );
}

export function CreateKey({ scopes, gateway, admin, accounts, self, onCreated, onError }) {
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [environment, setEnvironment] = React.useState('live');
  const [granted, setGranted] = React.useState([]);
  const [expires, setExpires] = React.useState('');
  const [owner, setOwner] = React.useState(self ?? '');
  const [rate, setRate] = React.useState('');
  const [allowed, setAllowed] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const canPickOwner = admin && (accounts ?? []).length > 0;
  const forSomeoneElse = canPickOwner && owner && owner !== self;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const payload = {
        name: name.trim(),
        note: note.trim(),
        scopes: granted,
        environment,
        expires: expires || null,
        allowed: parseAllowList(allowed),
      };
      if (admin) {
        if (canPickOwner && owner) payload.owner = owner;
        if (rate.trim()) payload.rate = Number(rate.trim());
      }
      const made = await createKey(payload, !admin);
      setName('');
      setNote('');
      setGranted([]);
      setExpires('');
      setRate('');
      setAllowed('');
      onCreated(made);
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="px-4 sm:px-6 py-6">
      <div className={`grid grid-cols-1 gap-x-6 ${admin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Field label="Name" htmlFor="new-key-name" hint="What is going to use it.">
          <TextInput
            id="new-key-name"
            value={name}
            autoComplete="off"
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Environment"
          htmlFor="new-key-env"
          hint="Both reach the same data. Test keys are the ones you throw away."
        >
          <Select
            id="new-key-env"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </Select>
        </Field>

        {admin && (
          <Field label="Holder" htmlFor="new-key-owner" hint="Whose list this key appears in.">
            {canPickOwner ? (
              <OwnerPicker id="new-key-owner" accounts={accounts} value={owner} onChange={setOwner} />
            ) : (
              <TextInput id="new-key-owner" value={self ?? ''} readOnly />
            )}
          </Field>
        )}

        <Field
          label="Expires"
          htmlFor="new-key-expires"
          hint="Leave empty and it never expires."
        >
          <TextInput
            id="new-key-expires"
            type="date"
            min={todayIso()}
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
          />
        </Field>

        {admin && (
          <Field
            label="Request limit"
            htmlFor="new-key-rate"
            hint={`Per minute. Empty means the default, ${formatRate(gateway?.rate ?? 120)}.`}
          >
            <TextInput
              id="new-key-rate"
              type="number"
              min={1}
              max={gateway?.maxRate ?? 6000}
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </Field>
        )}

        <Field label="Note" htmlFor="new-key-note" hint="Optional. Where it runs, who to ask.">
          <TextInput
            id="new-key-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      <div className="border-t border-[#17171d] pt-5 mt-1">
        <AllowField
          id="new-key-allowed"
          value={allowed}
          onChange={setAllowed}
          gateway={gateway}
        />
      </div>

      <div className="border-t border-[#17171d] pt-5 mt-1">
        <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
          What it may read
        </p>
        <ScopeGrid
          scopes={scopes}
          granted={granted}
          onToggle={(scope, on) =>
            setGranted((current) =>
              on ? [...current, scope] : current.filter((entry) => entry !== scope),
            )
          }
        />
      </div>

      {forSomeoneElse && (
        <p className="text-[12px] text-amber-300 font-normal leading-relaxed mt-4">
          The key itself will be shown to you, not to {owner}. Hand it over yourself, and rotate it if
          it goes anywhere it should not.
        </p>
      )}

      <div className="flex justify-end pt-5">
        <Button type="submit" tone="solid" disabled={busy || !name.trim() || granted.length === 0}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Creating…' : 'Create key'}
        </Button>
      </div>
    </form>
  );
}

export function KeyEditor({ token, scopes, gateway, admin, accounts, onSaved, onError }) {
  const [name, setName] = React.useState(token.name ?? '');
  const [note, setNote] = React.useState(token.note ?? '');
  const [expires, setExpires] = React.useState(token.expires ?? '');
  const [granted, setGranted] = React.useState(token.scopes ?? []);
  const [owner, setOwner] = React.useState(token.owner ?? '');
  const [rate, setRate] = React.useState(token.rate ? String(token.rate) : '');
  const [allowed, setAllowed] = React.useState(allowListText(token.allowed));
  const [busy, setBusy] = React.useState(false);

  const canPickOwner = admin && (accounts ?? []).length > 0;
  const locked = !admin && Boolean(token.managed);

  async function save() {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const changes = { name: name.trim(), note: note.trim() };
      if (!locked) {
        changes.expires = expires || null;
        changes.scopes = granted;
        changes.allowed = parseAllowList(allowed);
      }
      if (admin) {
        changes.rate = rate.trim() ? Number(rate.trim()) : null;
        if (canPickOwner && owner) changes.owner = owner;
      }
      await updateKey(token.id, changes, !admin);
      onSaved();
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={`grid grid-cols-1 gap-x-6 ${admin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Field label="Name" htmlFor={`edit-name-${token.id}`}>
          <TextInput
            id={`edit-name-${token.id}`}
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Expires"
          htmlFor={`edit-expires-${token.id}`}
          hint={locked ? 'Set by whoever runs the panel.' : 'Empty means never.'}
        >
          <TextInput
            id={`edit-expires-${token.id}`}
            type="date"
            value={expires ?? ''}
            readOnly={locked}
            min={todayIso()}
            onChange={(event) => setExpires(event.target.value)}
          />
        </Field>

        {admin && (
          <Field label="Holder" htmlFor={`edit-owner-${token.id}`}>
            {canPickOwner ? (
              <OwnerPicker
                id={`edit-owner-${token.id}`}
                accounts={accounts}
                value={owner}
                onChange={setOwner}
              />
            ) : (
              <TextInput id={`edit-owner-${token.id}`} value={owner} readOnly />
            )}
          </Field>
        )}

        {admin && (
          <Field
            label="Request limit"
            htmlFor={`edit-rate-${token.id}`}
            hint={`Empty means the default, ${formatRate(gateway?.rate ?? 120)}.`}
          >
            <TextInput
              id={`edit-rate-${token.id}`}
              type="number"
              min={1}
              max={gateway?.maxRate ?? 6000}
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </Field>
        )}

        <Field label="Note" htmlFor={`edit-note-${token.id}`}>
          <TextInput
            id={`edit-note-${token.id}`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      <div className="border-t border-[#17171d] pt-4 mt-1">
        <AllowField
          id={`edit-allowed-${token.id}`}
          value={allowed}
          onChange={setAllowed}
          gateway={gateway}
          readOnly={locked}
          locked={locked}
        />
      </div>

      <div className="border-t border-[#17171d] pt-4 mt-1">
        <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
          What it may read
        </p>
        <ScopeGrid
          scopes={scopes}
          granted={granted}
          disabled={locked}
          onToggle={(scope, on) =>
            setGranted((current) =>
              on ? [...current, scope] : current.filter((entry) => entry !== scope),
            )
          }
        />
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-3">
          {locked
            ? 'This key was issued to you by whoever runs the panel. They set what it may read and when it ends — ask them if either needs to change. The name and note are yours to edit.'
            : 'Scope changes take hold within a minute — the gateway rereads the key store as it changes.'}
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !name.trim() || granted.length === 0}
          onClick={save}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
