import React from 'react';
import {
  ArrowLeft,
  Eye,
  History,
  Link2,
  Lock,
  Pencil,
  RefreshCw,
  Route,
  Save,
  ScrollText,
  Share2,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import {
  LEDGER_LABELS,
  ORDER_EVENT_LABELS,
  ORDER_FIELD_LABELS,
  ORDER_HOLDS,
  ORDER_PRIORITY_LEVELS,
  ORDER_SHARE_LABELS,
  ORDER_VISIBILITY,
  ORDER_VISIBILITY_TONE,
  claimOrder,
  closeOrder,
  editOrder,
  fetchProjectLedger,
  recodeOrder,
  setOrderCustom,
  setOrderLinks,
  setOrderPriority,
  setOrderShared,
  setOrderStage,
  setOrderTracking,
  setOrderVisibility,
  setOrderWorkflow,
} from '../../../lib/admin';
import {
  Button,
  Check,
  Empty,
  Field,
  Panel,
  Pill,
  Select,
  SubNav,
  TextArea,
  TextInput,
} from '../ui';
import { Fact, Label, StageRail, StatePill, TrackCode, ago, on } from './shared';
import { IdChip, IdSet, KIND_WORDS } from './ids';
import Notes from './Notes';
import Files from './Files';

const LONG = new Set(['brief', 'pages', 'refs']);

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'files', label: 'Files' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'activity', label: 'Activity' },
];

function Editor({ order, editable, busy, onSave, onCancel }) {
  const [draft, setDraft] = React.useState(() =>
    Object.fromEntries(editable.map((key) => [key, order[key] ?? ''])),
  );

  const changed = editable.some((key) => (draft[key] ?? '') !== (order[key] ?? ''));

  return (
    <div className="px-4 sm:px-6 py-5 border-t border-[#17171d] bg-[#08080b] flex flex-col gap-5">
      {editable.map((key) => (
        <Field key={key} label={ORDER_FIELD_LABELS[key] ?? key} htmlFor={`order-${key}`}>
          {LONG.has(key) ? (
            <TextArea
              id={`order-${key}`}
              rows={key === 'brief' ? 6 : 3}
              value={draft[key] ?? ''}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          ) : (
            <TextInput
              id={`order-${key}`}
              value={draft[key] ?? ''}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          )}
        </Field>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !changed || !(draft.name ?? '').trim()}
          onClick={() => onSave(draft)}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Saving…' : 'Save the details'}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {changed && (
          <span className="text-[12px] text-neutral-500 font-normal">
            The pinned card in Discord is redrawn to match.
          </span>
        )}
      </div>
    </div>
  );
}

function CustomFields({ order, fields, canManage, busy, onRun }) {
  const [draft, setDraft] = React.useState(null);

  if (!fields.length) return null;

  const held = order.custom ?? {};
  const editing = draft !== null;
  const changed =
    editing && fields.some((field) => (draft[field.key] ?? '') !== (held[field.key] ?? ''));

  return (
    <Panel
      title="Project fields"
      icon={Sparkles}
      action={
        canManage && !editing ? (
          <Button
            type="button"
            onClick={() =>
              setDraft(Object.fromEntries(fields.map((field) => [field.key, held[field.key] ?? ''])))
            }
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            Edit
          </Button>
        ) : null
      }
    >
      {editing ? (
        <div className="flex flex-col gap-5 border-t border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {fields.map((field) => (
              <Field key={field.key} label={field.label} hint={field.help} htmlFor={`custom-${field.key}`}>
                {field.kind === 'choice' ? (
                  <Select
                    id={`custom-${field.key}`}
                    value={draft[field.key] ?? ''}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  >
                    <option value="">—</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                ) : field.kind === 'long' ? (
                  <TextArea
                    id={`custom-${field.key}`}
                    rows={3}
                    value={draft[field.key] ?? ''}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                ) : field.kind === 'toggle' ? (
                  <Check
                    checked={Boolean(draft[field.key])}
                    disabled={busy}
                    label="Yes"
                    onChange={(next) => setDraft({ ...draft, [field.key]: next ? 'yes' : '' })}
                  />
                ) : (
                  <TextInput
                    id={`custom-${field.key}`}
                    type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
                    value={draft[field.key] ?? ''}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              tone="solid"
              disabled={busy || !changed}
              onClick={() =>
                onRun(() => setOrderCustom(order.id, draft), 'Fields saved.', () => setDraft(null))
              }
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Saving…' : 'Save the fields'}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-[#17171d] sm:grid-cols-2">
          {fields.map((field) => (
            <Fact
              key={field.key}
              label={field.label}
              value={
                field.kind === 'toggle'
                  ? held[field.key]
                    ? 'Yes'
                    : 'No'
                  : held[field.key] ?? ''
              }
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Links({ order, links, canManage, busy, onRun }) {
  const [editing, setEditing] = React.useState(false);
  const [ticket, setTicket] = React.useState(links.ticket ?? '');
  const [about, setAbout] = React.useState(links.about ?? '');

  return (
    <Panel
      title="How it connects"
      icon={Link2}
      action={
        canManage && !editing ? (
          <Button
            type="button"
            onClick={() => {
              setTicket(links.ticket ?? '');
              setAbout(links.about ?? '');
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            Edit links
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 px-4 sm:px-6 py-5">
        <div>
          <Label>This record</Label>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <IdSet order={order} />
            {links.legacyRef && <IdChip code={links.legacyRef} label="Old ref" />}
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Came from ticket"
              htmlFor="link-ticket"
              hint="A support ticket ID like TKT-XXXX-XXXX. Leave empty to unlink."
            >
              <TextInput
                id="link-ticket"
                value={ticket}
                disabled={busy}
                placeholder="TKT-4K2M-9QX7"
                onChange={(event) => setTicket(event.target.value.toUpperCase())}
                className="font-mono tracking-[0.1em]"
              />
            </Field>
            <Field
              label="About project"
              htmlFor="link-about"
              hint="For a question or a report: which project it concerns."
            >
              <TextInput
                id="link-about"
                value={about}
                disabled={busy}
                placeholder="PRJ-4K2M-9QX7"
                onChange={(event) => setAbout(event.target.value.toUpperCase())}
                className="font-mono tracking-[0.1em]"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button
                type="button"
                tone="solid"
                disabled={busy}
                onClick={() =>
                  onRun(
                    () => setOrderLinks(order.id, { ticket, about }),
                    'Links saved.',
                    () => setEditing(false),
                  )
                }
              >
                <Save className="h-3.5 w-3.5" strokeWidth={2} />
                {busy ? 'Saving…' : 'Save the links'}
              </Button>
              <Button type="button" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {links.ticket && (
              <div>
                <Label>Came from</Label>
                <div className="mt-2">
                  <IdChip code={links.ticket} label={KIND_WORDS.TKT} />
                </div>
              </div>
            )}
            {links.about && (
              <div>
                <Label>About</Label>
                <div className="mt-2">
                  <IdChip code={links.about} label={KIND_WORDS.PRJ} />
                </div>
              </div>
            )}
            {links.requests.length > 0 && (
              <div>
                <Label>Questions and reports about it</Label>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {links.requests.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-2">
                      <IdChip code={entry.code} />
                      <span className="text-[12px] font-normal text-neutral-400">{entry.name}</span>
                      <Pill tone={entry.status === 'closed' ? 'neutral' : 'purple'}>{entry.status}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {links.invoices.length > 0 && (
              <div>
                <Label>Invoices raised</Label>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {links.invoices.map((entry) => (
                    <li key={entry.number} className="flex flex-wrap items-center gap-2">
                      <IdChip code={entry.number} />
                      <span className="text-[12px] font-normal text-neutral-400">
                        {entry.total != null ? `${entry.total} ${entry.currency}` : ''} · {on(entry.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!links.ticket && !links.about && !links.requests.length && !links.invoices.length && (
              <p className="text-[12px] font-normal text-neutral-500">
                Nothing else points at this one yet.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Timeline({ events }) {
  if (!events?.length) return <Empty>Nothing has happened yet.</Empty>;

  return (
    <ol className="px-4 sm:px-6 py-5 flex flex-col gap-4">
      {events.map((event, index) => (
        <li key={`${event.kind}-${event.at}-${index}`} className="flex gap-3.5">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              event.kind === 'closed'
                ? 'bg-neutral-600'
                : event.kind === 'opened'
                  ? 'bg-emerald-500/80'
                  : 'bg-purple-500/70'
            }`}
          />
          <div className="min-w-0">
            <p className="text-[13px] text-neutral-200 font-normal leading-snug">
              {ORDER_EVENT_LABELS[event.kind] ?? event.kind}
              {event.from && event.to && (
                <span className="text-neutral-500"> · {event.from} → {event.to}</span>
              )}
            </p>
            <p className="text-[12px] text-neutral-600 font-normal mt-0.5">
              {[event.byName, ago(event.at)].filter(Boolean).join(' · ')}
              {event.note ? ` · ${event.note}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Ledger({ orderId }) {
  const [entries, setEntries] = React.useState(null);
  const [failed, setFailed] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    fetchProjectLedger(orderId)
      .then((answer) => {
        if (alive) setEntries(answer.entries ?? []);
      })
      .catch((failure) => {
        if (alive) setFailed(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (failed) return <Empty>{failed}</Empty>;
  if (!entries) return <Empty>Reading the file log…</Empty>;
  if (!entries.length) return <Empty>No file has been touched on this project.</Empty>;

  return (
    <ol className="flex flex-col gap-3 px-4 sm:px-6 py-5">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[11px] text-neutral-600">
            {new Date(entry.at).toLocaleString(undefined, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="text-[13px] font-normal text-neutral-200">
            {LEDGER_LABELS[entry.action] ?? entry.action}
          </span>
          <span className="text-[12px] font-normal text-neutral-500">
            by {entry.actor}
            {entry.detail?.version ? ` · v${entry.detail.version}` : ''}
            {entry.detail?.name ? ` · ${entry.detail.name}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Project({
  detail,
  canManage,
  canFiles,
  startOn = 'overview',
  onBack,
  onChanged,
  onError,
  onNotice,
  onTab,
}) {
  const order = detail.order;
  const [tab, setTab] = React.useState(() =>
    TABS.some((entry) => entry.id === startOn) ? startOn : 'overview',
  );

  function goTab(next) {
    setTab(next);
    onTab?.(next);
  }
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(null);
  const [reason, setReason] = React.useState('');

  const shareable = detail.shareable ?? [];
  const stages = detail.stages ?? [];
  const workflows = detail.workflows ?? [];
  const fields = detail.fields ?? [];
  const visibilities = detail.visibilities ?? ORDER_VISIBILITY;
  const editable = (detail.editable ?? []).filter((key) => key !== 'notes' || canManage);
  const closed = order.status === 'closed';
  const links = order.links ?? { requests: [], invoices: [] };

  const holdKeys = new Set(ORDER_HOLDS.map((hold) => hold.value));
  const steps = stages.filter((stage) => !holdKeys.has(stage.value));
  const holds = stages.filter((stage) => holdKeys.has(stage.value));

  async function run(action, note, after) {
    setBusy(true);
    onError(null);
    try {
      await action();
      setEditing(false);
      setConfirming(null);
      after?.();
      if (note) onNotice(note);
      await onChanged();
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-wide text-neutral-500 hover:text-neutral-300 transition-colors self-start"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to the order book
      </button>

      <section className="border border-[#282832] bg-[#0a0a0d]">
        <div className="px-4 sm:px-6 py-6 border-b border-[#17171d]">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <StatePill order={order} />
            {order.priority !== 'normal' && (
              <Pill tone={order.priority === 'urgent' ? 'rose' : 'amber'}>
                {order.priorityLabel}
              </Pill>
            )}
            <Pill tone={ORDER_VISIBILITY_TONE[order.visibility] ?? 'neutral'}>
              {visibilities.find((entry) => entry.value === order.visibility)?.label ?? order.visibility}
            </Pill>
            {order.workflow !== 'studio' && (
              <Pill tone="purple">{order.workflowName || order.workflow}</Pill>
            )}
            {order.retired && <Pill>channel deleted</Pill>}
          </div>

          <h2 className="text-[20px] font-light text-white leading-tight break-words">
            {order.name || 'Untitled project'}
          </h2>

          <p className="text-[13px] text-neutral-500 font-normal mt-2">
            {order.categoryLabel} · opened by {order.user?.name ?? 'unknown'} {ago(order.createdAt)}
            {order.claimed ? ` · led by ${order.claimedByName ?? 'a developer'}` : ' · no lead yet'}
          </p>

          <div className="mt-4">
            <IdSet order={order} />
          </div>

          <div className="mt-5 max-w-[420px]">
            <StageRail
              step={order.step}
              steps={order.steps}
              held={order.held}
              closed={closed}
              delivered={Boolean(order.finished)}
            />
            <p className="mt-2 text-[12px] text-neutral-500 font-normal">
              {closed && !order.finished
                ? `Closed at step ${order.step} of ${order.steps} — ${order.stageLabel.toLowerCase()}`
                : `Step ${order.step} of ${order.steps} · ${order.stageNote}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#17171d]">
          <Fact label="Client" value={order.user?.tag || order.user?.name} />
          <Fact label="Budget" value={order.budget} />
          <Fact label="Timeline" value={order.deadline} />
          <Fact
            label={closed ? 'Closed' : 'Last moved'}
            value={closed ? on(order.closedAt) : ago(order.updatedAt)}
          />
        </div>
      </section>

      <SubNav tabs={TABS} active={tab} onPick={goTab} label="This project" />

      {tab === 'overview' && (
        <>
          {canManage && !closed && (
            <Panel title="Move it along" icon={UserRoundCheck}>
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Stage" htmlFor="order-stage" hint="The client sees this on the track page.">
                    <Select
                      id="order-stage"
                      value={order.stage}
                      disabled={busy}
                      onChange={(event) =>
                        run(() => setOrderStage(order.id, event.target.value), 'Stage moved.')
                      }
                    >
                      <optgroup label="Steps">
                        {steps.map((stage) => (
                          <option key={stage.value} value={stage.value}>
                            {stage.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Not moving">
                        {holds.map((hold) => (
                          <option key={hold.value} value={hold.value}>
                            {hold.label}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>

                  <Field label="Priority" htmlFor="order-priority" hint="Internal only — never shared.">
                    <Select
                      id="order-priority"
                      value={order.priority}
                      disabled={busy}
                      onChange={(event) =>
                        run(() => setOrderPriority(order.id, event.target.value), 'Priority changed.')
                      }
                    >
                      {ORDER_PRIORITY_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {workflows.length > 1 && (
                  <Field
                    label="Workflow"
                    htmlFor="order-workflow"
                    hint="Changing it lands the project at the same position in the new run of stages."
                  >
                    <Select
                      id="order-workflow"
                      value={order.workflow}
                      disabled={busy}
                      onChange={(event) =>
                        run(() => setOrderWorkflow(order.id, event.target.value), 'Workflow changed.')
                      }
                    >
                      {workflows.map((workflow) => (
                        <option key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => claimOrder(order.id),
                        order.claimed ? 'You stepped off.' : 'You are the lead.',
                      )
                    }
                  >
                    <UserRoundCheck className="h-3.5 w-3.5" strokeWidth={2} />
                    {order.claimed ? 'Step off' : 'Take the lead'}
                  </Button>

                  {confirming === 'close' ? (
                    <>
                      <div className="w-full sm:w-[280px]">
                        <TextInput
                          value={reason}
                          disabled={busy}
                          placeholder="Why is it closing? (optional)"
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        tone="danger"
                        disabled={busy}
                        onClick={() => run(() => closeOrder(order.id, reason), 'Project closed.')}
                      >
                        <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                        Really close it
                      </Button>
                      <Button type="button" disabled={busy} onClick={() => setConfirming(null)}>
                        Keep it open
                      </Button>
                    </>
                  ) : (
                    <Button type="button" tone="danger" disabled={busy} onClick={() => setConfirming('close')}>
                      <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                      Close the project
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <Notes
            orderId={order.id}
            notes={order.noteLog}
            canManage={canManage}
            busy={busy}
            onRun={run}
          />

          {closed && order.closedReason && (
            <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 py-5">
              <Label>Closing note</Label>
              <p className="mt-2 text-[13px] text-neutral-300 font-normal leading-relaxed whitespace-pre-wrap">
                {order.closedReason}
              </p>
            </div>
          )}
        </>
      )}

      {tab === 'details' && (
        <>
          <Panel
            title="The details"
            icon={ScrollText}
            action={
              canManage && !editing ? (
                <Button type="button" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  Edit
                </Button>
              ) : null
            }
          >
            {editing ? (
              <Editor
                order={order}
                editable={editable}
                busy={busy}
                onCancel={() => setEditing(false)}
                onSave={(draft) => run(() => editOrder(order.id, draft), 'Details saved.')}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#17171d]">
                <Fact label="Project name" value={order.name} />
                <Fact label="Budget" value={order.budget} />
                <Fact label="Timeline" value={order.deadline} />
                <Fact label="Scope" value={order.pages} />
                <div className="sm:col-span-2">
                  <Fact label="The brief" value={order.brief} />
                </div>
                <div className="sm:col-span-2">
                  <Fact label="Reference links" value={order.refs} />
                </div>
              </div>
            )}
          </Panel>

          <CustomFields
            order={order}
            fields={fields}
            canManage={canManage}
            busy={busy}
            onRun={run}
          />

          <Links order={order} links={links} canManage={canManage} busy={busy} onRun={run} />
        </>
      )}

      {tab === 'files' && (
        <Files
          orderId={order.id}
          canManage={canFiles}
          onError={onError}
          onNotice={onNotice}
        />
      )}

      {tab === 'sharing' && (
        <>
          <Panel title="Who can see this project" icon={Share2}>
            <div className="px-4 sm:px-6 py-5 flex flex-col gap-4">
              {visibilities.map((entry) => (
                <label
                  key={entry.value}
                  className={`flex cursor-pointer items-start gap-3 border px-3.5 py-3 transition-colors ${
                    order.visibility === entry.value
                      ? 'border-purple-500/40 bg-purple-500/10'
                      : 'border-[#282832] hover:border-[#3f3f4c]'
                  } ${canManage ? '' : 'cursor-default opacity-70'}`}
                >
                  <input
                    type="radio"
                    name="order-visibility"
                    value={entry.value}
                    checked={order.visibility === entry.value}
                    disabled={busy || !canManage}
                    onChange={() =>
                      run(
                        () => setOrderVisibility(order.id, entry.value),
                        `Now ${entry.label.toLowerCase()}.`,
                      )
                    }
                    className="mt-0.5 accent-purple-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-neutral-100">
                      {entry.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] font-normal leading-relaxed text-neutral-500">
                      {entry.note}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Tracking" icon={Link2}>
            <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">
              <div>
                <Label>The code you give the client</Label>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <TrackCode code={order.track} />
                  {order.visibility === 'private' && <Pill tone="amber">switched off</Pill>}
                </div>
                <p className="mt-2.5 text-[12px] text-neutral-500 font-normal leading-relaxed max-w-xl">
                  Anyone holding this code can follow the project at{' '}
                  <span className="text-neutral-300">amitista.com/track</span> — including after it is
                  finished or closed. The project ID {order.project} is not enough on its own unless
                  this project is public.
                </p>
              </div>

              {canManage && (
                <>
                  <div className="border-t border-[#17171d] pt-5">
                    <Label>What the client can see</Label>
                    <p className="mt-2 mb-3.5 text-[12px] text-neutral-500 font-normal max-w-xl">
                      The reference, the project name, the stage and the dates are always shown. Tick
                      anything else you are happy to share.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {shareable.map((key) => (
                        <Check
                          key={key}
                          checked={(order.shared ?? []).includes(key)}
                          disabled={busy}
                          label={ORDER_SHARE_LABELS[key] ?? key}
                          onChange={(next) => {
                            const held = new Set(order.shared ?? []);
                            if (next) held.add(key);
                            else held.delete(key);
                            run(
                              () => setOrderShared(order.id, [...held]),
                              next
                                ? `${ORDER_SHARE_LABELS[key] ?? key} is now shared.`
                                : `${ORDER_SHARE_LABELS[key] ?? key} is hidden again.`,
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#17171d] pt-5 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => setOrderTracking(order.id, order.trackOff),
                          order.trackOff ? 'Tracking is back on.' : 'Tracking is off for this project.',
                        )
                      }
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                      {order.trackOff ? 'Switch tracking on' : 'Switch tracking off'}
                    </Button>

                    {confirming === 'recode' ? (
                      <>
                        <Button
                          type="button"
                          tone="danger"
                          disabled={busy}
                          onClick={() =>
                            run(() => recodeOrder(order.id), 'A new code is ready — send it to the client.')
                          }
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                          Really replace it
                        </Button>
                        <Button type="button" disabled={busy} onClick={() => setConfirming(null)}>
                          Keep the code
                        </Button>
                        <span className="text-[12px] text-amber-300 font-normal">
                          The old code stops working immediately.
                        </span>
                      </>
                    ) : (
                      <Button type="button" disabled={busy} onClick={() => setConfirming('recode')}>
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        Issue a new code
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Panel>
        </>
      )}

      {tab === 'activity' && (
        <>
          <Panel title="What happened" icon={History}>
            <Timeline events={order.events} />
          </Panel>
          <Panel title="Files, in full" icon={Route}>
            <Ledger orderId={order.id} />
          </Panel>
        </>
      )}
    </div>
  );
}
