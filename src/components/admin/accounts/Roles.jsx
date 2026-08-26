import React from 'react';
import {
  ShieldCheck,
  Check as CheckIcon,
  Minus,
  Users,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Save,
} from 'lucide-react';
import {
  PERMISSION_LABELS,
  ROLE_SUMMARIES,
  deleteRole,
  describeAccess,
  groupPermissions,
  permissionLevel,
  permissionShort,
  saveRole,
} from '../../../lib/admin';
import { Button, Empty, Field, Notice, Panel, Pill, TextInput } from '../ui';
import { LevelKey, LevelTally, levelTone } from '../permissions';
import { PermissionGrid, ROLE_TONE, sameSet } from './shared';

function Cell({ granted, level }) {
  return (
    <td className="px-4 py-3 text-center">
      {granted ? (
        <CheckIcon
          className={`h-4 w-4 inline-block ${levelTone(level).text}`}
          strokeWidth={2.5}
        />
      ) : (
        <Minus className="h-4 w-4 text-neutral-700 inline-block" strokeWidth={2} />
      )}
    </td>
  );
}

function Editor({ role, permissions, granted, busy, onCancel, onSave }) {
  const [ticked, setTicked] = React.useState(granted);
  const changed = !sameSet(ticked, granted);

  return (
    <div className="px-4 sm:px-6 py-5 border-t border-[#17171d] bg-[#08080b]">
      <PermissionGrid
        permissions={permissions}
        effective={ticked}
        editable={!busy}
        onToggle={(permission, on) =>
          setTicked((held) =>
            on ? [...held, permission] : held.filter((entry) => entry !== permission),
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3 mt-5">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !changed || ticked.length === 0}
          onClick={() => onSave(ticked)}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Saving…' : `Save ${role}`}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {ticked.length === 0 && (
          <span className="text-[12px] text-amber-300 font-normal">
            A role needs at least one permission.
          </span>
        )}
        {changed && ticked.length > 0 && (
          <span className="text-[12px] text-neutral-500 font-normal">
            Saving rewrites the access of everyone holding {role}.
          </span>
        )}
      </div>
    </div>
  );
}

function NewRole({ permissions, busy, onCancel, onSave }) {
  const [name, setName] = React.useState('');
  const [ticked, setTicked] = React.useState([]);
  const clean = name.trim().toLowerCase();
  const valid = /^[a-z][a-z0-9-]{1,15}$/.test(clean);

  return (
    <div className="px-4 sm:px-6 py-5 border-t border-[#17171d] bg-[#08080b]">
      <div className="max-w-[320px]">
        <Field
          label="Role name"
          htmlFor="new-role-name"
          hint="Two to sixteen characters: lowercase letters, numbers and dashes."
        >
          <TextInput
            id="new-role-name"
            value={name}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>

      <PermissionGrid
        permissions={permissions}
        effective={ticked}
        editable={!busy}
        onToggle={(permission, on) =>
          setTicked((held) =>
            on ? [...held, permission] : held.filter((entry) => entry !== permission),
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !valid || ticked.length === 0}
          onClick={() => onSave(clean, ticked)}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Creating…' : 'Create the role'}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {name.trim() && !valid && (
          <span className="text-[12px] text-amber-300 font-normal">
            Lowercase letters, numbers and dashes only.
          </span>
        )}
      </div>
    </div>
  );
}

export default function Roles({ data, canManageOwners, onChanged }) {
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);

  const permissions = data?.permissions ?? [];
  const rolePermissions = data?.rolePermissions ?? {};
  const accounts = data?.users ?? [];
  const builtin = data?.builtinRoles ?? ['owner', 'admin', 'dev', 'viewer'];
  const locked = data?.lockedRoles ?? ['owner'];

  const names = Object.keys(rolePermissions).sort((one, two) => {
    if (one === 'owner') return -1;
    if (two === 'owner') return 1;
    return one.localeCompare(two);
  });

  const holders = {};
  accounts.forEach((account) => {
    const key = account.role ?? 'custom';
    holders[key] = [...(holders[key] ?? []), account.name];
  });

  async function run(action, message) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setEditing(null);
      setAdding(false);
      setConfirming(null);
      setNotice(message);
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {error && <Notice tone="rose">{error}</Notice>}
      {notice && !error && <Notice tone="emerald" icon={CheckIcon}>{notice}</Notice>}

      <Panel
        title={`Roles — ${names.length}`}
        icon={ShieldCheck}
        action={
          canManageOwners && !adding ? (
            <Button type="button" tone="solid" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New role
            </Button>
          ) : null
        }
      >
        {adding && (
          <NewRole
            permissions={permissions}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={(name, ticked) =>
              run(() => saveRole(name, ticked), `${name} is ready to hand out.`)
            }
          />
        )}

        {names.map((role) => {
          const granted = rolePermissions[role] ?? [];
          const held = holders[role] ?? [];
          const isLocked = locked.includes(role);
          const isBuiltin = builtin.includes(role);
          const overridden = isBuiltin && !isLocked;

          return (
            <div key={role} className="border-b border-[#17171d] last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-4 px-4 sm:px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                    <Pill tone={ROLE_TONE[role] ?? 'neutral'}>{role}</Pill>
                    <LevelTally held={granted} />
                    <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
                      {granted.length} of {permissions.length}
                    </span>
                    {isLocked && <Pill>always everything</Pill>}
                    {!isBuiltin && <Pill tone="purple">yours</Pill>}
                  </div>
                  <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-xl">
                    {ROLE_SUMMARIES[role] ?? describeAccess(granted, permissions.length)}
                  </p>
                  <p className="text-[12px] text-neutral-600 font-normal mt-1.5">
                    {held.length === 0 ? 'Nobody holds it' : `Held by ${held.join(', ')}`}
                  </p>
                </div>

                {canManageOwners && !isLocked && (
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAdding(false);
                        setEditing((current) => (current === role ? null : role));
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      {editing === role ? 'Close' : 'Edit'}
                    </Button>

                    {confirming === role && (
                      <Button type="button" onClick={() => setConfirming(null)}>
                        Keep it
                      </Button>
                    )}
                    <Button
                      type="button"
                      tone={overridden ? 'quiet' : 'danger'}
                      disabled={busy || (!overridden && held.length > 0)}
                      title={
                        overridden
                          ? 'Put this role back to the permissions it ships with'
                          : 'Remove this role'
                      }
                      onClick={() => {
                        if (confirming !== role) {
                          setConfirming(role);
                          return;
                        }
                        run(
                          () => deleteRole(role),
                          overridden
                            ? `${role} is back to its shipped permissions.`
                            : `${role} is gone.`,
                        );
                      }}
                    >
                      {overridden ? (
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                      {confirming === role
                        ? overridden
                          ? 'Really reset it'
                          : 'Really remove it'
                        : overridden
                          ? 'Reset'
                          : 'Remove'}
                    </Button>
                  </div>
                )}
              </div>

              {editing === role && (
                <Editor
                  role={role}
                  permissions={permissions}
                  granted={granted}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(ticked) =>
                    run(() => saveRole(role, ticked), `${role} saved.`)
                  }
                />
              )}
            </div>
          );
        })}
      </Panel>

      <Panel title="Side by side" icon={Users}>
        {permissions.length === 0 ? (
          <Empty>No permissions reported.</Empty>
        ) : (
          <>
            <div className="px-4 sm:px-6 pt-4">
              <LevelKey />
            </div>
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-[#282832]">
                  <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase">
                    Permission
                  </th>
                  {names.map((role) => (
                    <th key={role} className="px-4 py-3 text-center">
                      <Pill tone={ROLE_TONE[role] ?? 'neutral'}>{role}</Pill>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupPermissions(permissions).map((group) => (
                  <React.Fragment key={group.id}>
                    <tr className="border-b border-[#17171d] bg-[#0a0a0d]">
                      <td
                        colSpan={names.length + 1}
                        className="px-4 sm:px-6 py-1.5 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.permissions.map((permission) => (
                      <tr key={permission} className="border-b border-[#17171d] last:border-b-0">
                        <td className="px-4 sm:px-6 py-2.5">
                          <span className="flex items-baseline gap-2">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] ${levelTone(permissionLevel(permission)).dot}`}
                            />
                            <span className="text-[13px] text-neutral-200 font-normal leading-tight">
                              {permissionShort(permission)}
                            </span>
                          </span>
                          <span
                            className="block text-[11px] text-neutral-600 font-normal mt-0.5 pl-3.5"
                            title={permission}
                          >
                            {PERMISSION_LABELS[permission] ?? permission}
                          </span>
                        </td>
                        {names.map((role) => (
                          <Cell
                            key={role}
                            level={permissionLevel(permission)}
                            granted={(rolePermissions[role] ?? []).includes(permission)}
                          />
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>

      <Panel title="How roles behave" icon={ShieldCheck}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Every permission is one of three strengths, and the colour is the whole story.{' '}
            <span className="text-emerald-300">See</span> reads a screen and changes nothing.{' '}
            <span className="text-purple-300">Their own</span> acts, but only on the things that
            person made or holds — their own boards, their own API keys.{' '}
            <span className="text-amber-300">Change</span> acts on it for everybody, so a role with
            amber on it is a role you hand out carefully.
          </p>
          <p className="mb-3">
            A role is a shorthand, not a container. Setting one replaces the account's permissions
            with that role's list, and editing a role rewrites the access of everyone already
            holding it — there is no third step where you re-apply it person by person.
          </p>
          <p className="mb-3">
            <span className="text-neutral-200">Owner</span> is the exception: it always resolves to
            every permission, cannot be edited or removed, and is the only role that can hand out
            the owner role. An admin who can manage accounts still cannot make one, promote one, or
            touch an owner's account — that check is on the server, not in this screen.
          </p>
          <p className="mb-3">
            <span className="text-neutral-200">Custom</span> keeps its own ticks per account.
            Everything else is resolved from the table above every time.
          </p>
          <p>
            Resetting a built-in role drops your changes and puts back the permissions it ships
            with. A role you invented can be removed once nobody holds it.
          </p>
        </div>
      </Panel>
    </div>
  );
}
