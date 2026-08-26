import React from 'react';
import { GripVertical, ListChecks, Plus, Route, Save, Trash2, X } from 'lucide-react';
import {
  FIELD_KINDS,
  STAGE_TONES,
  deleteProjectField,
  deleteWorkflow,
  fetchProjectFields,
  fetchWorkflows,
  saveProjectField,
  saveWorkflow,
} from '../../../lib/admin';
import { Button, Check, Empty, Field, Panel, Pill, Select, TextInput } from '../ui';
import { Label } from './shared';

const SLUG = /^[a-z][a-z0-9-]*$/;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function StageEditor({ stages, onChange, disabled }) {
  function set(index, patch) {
    onChange(stages.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
  }

  function move(index, by) {
    const next = stages.slice();
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => (
        <div
          key={index}
          className="flex flex-wrap items-end gap-3 border border-[#282832] bg-[#08080b] px-3.5 py-3"
        >
          <div className="flex shrink-0 flex-col items-center gap-0.5 pb-1.5">
            <button
              type="button"
              aria-label="Move up"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className="text-neutral-700 transition-colors hover:text-neutral-300 disabled:opacity-30"
            >
              ▲
            </button>
            <GripVertical className="h-3 w-3 text-neutral-700" strokeWidth={2} />
            <button
              type="button"
              aria-label="Move down"
              disabled={disabled || index === stages.length - 1}
              onClick={() => move(index, 1)}
              className="text-neutral-700 transition-colors hover:text-neutral-300 disabled:opacity-30"
            >
              ▼
            </button>
          </div>

          <div className="min-w-[150px] flex-1">
            <Field label="Name" htmlFor={`stage-label-${index}`}>
              <TextInput
                id={`stage-label-${index}`}
                value={stage.label}
                disabled={disabled}
                placeholder="In development"
                onChange={(event) =>
                  set(index, {
                    label: event.target.value,
                    key: stage.touched ? stage.key : slugify(event.target.value),
                  })
                }
              />
            </Field>
          </div>

          <div className="w-[130px]">
            <Field label="Key" htmlFor={`stage-key-${index}`}>
              <TextInput
                id={`stage-key-${index}`}
                value={stage.key}
                disabled={disabled}
                onChange={(event) =>
                  set(index, { key: slugify(event.target.value), touched: true })
                }
                className="font-mono text-[12px]"
              />
            </Field>
          </div>

          <div className="w-[150px]">
            <Field label="Feels like" htmlFor={`stage-tone-${index}`}>
              <Select
                id={`stage-tone-${index}`}
                value={stage.tone}
                disabled={disabled}
                onChange={(event) => set(index, { tone: event.target.value })}
              >
                {STAGE_TONES.map((tone) => (
                  <option key={tone.value} value={tone.value}>
                    {tone.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-[180px] flex-1">
            <Field label="What it means to the client" htmlFor={`stage-note-${index}`}>
              <TextInput
                id={`stage-note-${index}`}
                value={stage.note}
                disabled={disabled}
                placeholder="Approved and actively being built."
                onChange={(event) => set(index, { note: event.target.value })}
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 pb-2">
            <Check
              checked={Boolean(stage.terminal)}
              disabled={disabled}
              label="Finishes it"
              onChange={(next) => set(index, { terminal: next })}
            />
            <button
              type="button"
              aria-label="Remove stage"
              disabled={disabled || stages.length <= 2}
              onClick={() => onChange(stages.filter((_, at) => at !== index))}
              className="text-neutral-700 transition-colors hover:text-rose-300 disabled:opacity-30"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          disabled={disabled || stages.length >= 12}
          onClick={() =>
            onChange([...stages, { key: '', label: '', note: '', tone: 'reading', terminal: false }])
          }
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add a stage
        </Button>
      </div>
    </div>
  );
}

const BLANK_WORKFLOW = {
  id: '',
  name: '',
  stages: [
    { key: 'start', label: 'Started', note: '', tone: 'waiting', terminal: false },
    { key: 'finished', label: 'Finished', note: '', tone: 'done', terminal: true },
  ],
};

function Workflows({ workflows, busy, onRun }) {
  const [draft, setDraft] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);

  const bad =
    draft &&
    (!SLUG.test(draft.id) ||
      draft.name.trim().length < 2 ||
      draft.stages.length < 2 ||
      draft.stages.some((stage) => !SLUG.test(stage.key) || stage.label.trim().length < 2) ||
      new Set(draft.stages.map((stage) => stage.key)).size !== draft.stages.length);

  return (
    <Panel
      title="Workflows"
      icon={Route}
      action={
        !draft ? (
          <Button type="button" onClick={() => setDraft({ ...BLANK_WORKFLOW })}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New workflow
          </Button>
        ) : null
      }
    >
      {draft && (
        <div className="flex flex-col gap-5 border-b border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="workflow-name">
              <TextInput
                id="workflow-name"
                value={draft.name}
                disabled={busy}
                placeholder="Retainer"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name: event.target.value,
                    id: draft.touched ? draft.id : slugify(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Id" htmlFor="workflow-id" hint="Lowercase letters, numbers and dashes.">
              <TextInput
                id="workflow-id"
                value={draft.id}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, id: slugify(event.target.value), touched: true })
                }
                className="font-mono text-[12px]"
              />
            </Field>
          </div>

          <div>
            <Label>Its stages, in order</Label>
            <div className="mt-3">
              <StageEditor
                stages={draft.stages}
                disabled={busy}
                onChange={(stages) => setDraft({ ...draft, stages })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              tone="solid"
              disabled={busy || bad}
              onClick={() =>
                onRun(
                  () =>
                    saveWorkflow({
                      id: draft.id,
                      name: draft.name.trim(),
                      stages: draft.stages.map(({ touched: _touched, ...stage }) => ({
                        ...stage,
                        label: stage.label.trim(),
                        note: stage.note.trim(),
                      })),
                    }),
                  'Workflow saved.',
                  () => setDraft(null),
                )
              }
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Saving…' : 'Save the workflow'}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {bad && (
              <span className="text-[12px] font-normal text-amber-300">
                Every stage needs a unique key and a name, and there must be at least two.
              </span>
            )}
          </div>
        </div>
      )}

      <ul>
        {workflows.map((workflow) => (
          <li key={workflow.id} className="border-b border-[#17171d] px-4 sm:px-6 py-4 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-normal text-neutral-100">{workflow.name}</span>
                  <span className="font-mono text-[11px] text-neutral-600">{workflow.id}</span>
                  {workflow.builtin && <Pill>built in</Pill>}
                  {workflow.inUse > 0 && (
                    <Pill tone="purple">
                      {workflow.inUse} project{workflow.inUse === 1 ? '' : 's'}
                    </Pill>
                  )}
                </div>
                <p className="text-[12px] font-normal text-neutral-500">
                  {workflow.stages.map((stage) => stage.label).join(' → ')}
                </p>
              </div>

              {!workflow.builtin && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDraft({
                        ...workflow,
                        touched: true,
                        stages: workflow.stages.map((stage) => ({ ...stage, touched: true })),
                      })
                    }
                  >
                    Edit
                  </Button>
                  {confirming === workflow.id ? (
                    <>
                      <Button
                        type="button"
                        tone="danger"
                        disabled={busy}
                        onClick={() =>
                          onRun(() => deleteWorkflow(workflow.id), 'Workflow removed.', () =>
                            setConfirming(null),
                          )
                        }
                      >
                        Really remove
                      </Button>
                      <Button type="button" disabled={busy} onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label="Remove workflow"
                      disabled={busy || workflow.inUse > 0}
                      title={
                        workflow.inUse > 0
                          ? 'Move its projects to another workflow first.'
                          : 'Remove this workflow'
                      }
                      onClick={() => setConfirming(workflow.id)}
                      className="inline-flex items-center border border-[#282832] p-1.5 text-neutral-500 transition-colors hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-[#17171d] px-4 sm:px-6 py-3.5">
        <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
          A project keeps the workflow it is on. Moving it to another one lands it at the same
          position in the new run of stages, and the client's track page follows.
        </p>
      </div>
    </Panel>
  );
}

const BLANK_FIELD = { key: '', label: '', kind: 'text', help: '', options: '', share: false };

function Fields({ fields, busy, onRun }) {
  const [draft, setDraft] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);

  const options = draft
    ? draft.options
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const bad =
    draft &&
    (!SLUG.test(draft.key) ||
      draft.label.trim().length < 2 ||
      (draft.kind === 'choice' && options.length < 2));

  return (
    <Panel
      title="Project fields"
      icon={ListChecks}
      action={
        !draft ? (
          <Button type="button" onClick={() => setDraft({ ...BLANK_FIELD })}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New field
          </Button>
        ) : null
      }
    >
      {draft && (
        <div className="flex flex-col gap-5 border-b border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Label" htmlFor="field-label">
              <TextInput
                id="field-label"
                value={draft.label}
                disabled={busy}
                placeholder="Hosting tier"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    label: event.target.value,
                    key: draft.touched ? draft.key : slugify(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Key" htmlFor="field-key">
              <TextInput
                id="field-key"
                value={draft.key}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, key: slugify(event.target.value), touched: true })}
                className="font-mono text-[12px]"
              />
            </Field>
            <Field label="Kind" htmlFor="field-kind">
              <Select
                id="field-kind"
                value={draft.kind}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
              >
                {FIELD_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {draft.kind === 'choice' && (
            <Field label="The options" htmlFor="field-options" hint="Separated by commas.">
              <TextInput
                id="field-options"
                value={draft.options}
                disabled={busy}
                placeholder="Bronze, Silver, Gold"
                onChange={(event) => setDraft({ ...draft, options: event.target.value })}
              />
            </Field>
          )}

          <Field label="A hint for whoever fills it in" htmlFor="field-help">
            <TextInput
              id="field-help"
              value={draft.help}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, help: event.target.value })}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              tone="solid"
              disabled={busy || bad}
              onClick={() =>
                onRun(
                  () =>
                    saveProjectField({
                      key: draft.key,
                      label: draft.label.trim(),
                      kind: draft.kind,
                      help: draft.help.trim(),
                      options,
                      share: Boolean(draft.share),
                    }),
                  'Field saved.',
                  () => setDraft(null),
                )
              }
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Saving…' : 'Save the field'}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {bad && (
              <span className="text-[12px] font-normal text-amber-300">
                A key, a label, and — for a pick-one — at least two options.
              </span>
            )}
          </div>
        </div>
      )}

      {fields.length === 0 && !draft ? (
        <Empty>No extra fields yet. Add the ones your projects actually need.</Empty>
      ) : (
        <ul>
          {fields.map((entry) => (
            <li
              key={entry.key}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[#17171d] px-4 sm:px-6 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-normal text-neutral-100">{entry.label}</span>
                  <span className="font-mono text-[11px] text-neutral-600">{entry.key}</span>
                  <Pill>{FIELD_KINDS.find((kind) => kind.value === entry.kind)?.label ?? entry.kind}</Pill>
                </div>
                {entry.help && (
                  <p className="mt-1 text-[12px] font-normal text-neutral-500">{entry.help}</p>
                )}
                {entry.options.length > 0 && (
                  <p className="mt-1 text-[12px] font-normal text-neutral-600">
                    {entry.options.join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setDraft({ ...entry, touched: true, options: entry.options.join(', ') })
                  }
                >
                  Edit
                </Button>
                {confirming === entry.key ? (
                  <>
                    <Button
                      type="button"
                      tone="danger"
                      disabled={busy}
                      onClick={() =>
                        onRun(
                          () => deleteProjectField(entry.key),
                          'Field removed everywhere.',
                          () => setConfirming(null),
                        )
                      }
                    >
                      Remove it
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label="Remove field"
                    disabled={busy}
                    onClick={() => setConfirming(entry.key)}
                    className="inline-flex items-center border border-[#282832] p-1.5 text-neutral-500 transition-colors hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div className="border-t border-[#17171d] px-4 sm:px-6 py-3">
          <p className="text-[12px] font-normal text-amber-300">
            Removing a field also clears its value on every project. That cannot be undone.
          </p>
        </div>
      )}
    </Panel>
  );
}

export default function Settings({ canManage, onError, onNotice }) {
  const [workflows, setWorkflows] = React.useState(null);
  const [fields, setFields] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const [flows, extra] = await Promise.all([fetchWorkflows(), fetchProjectFields()]);
      setWorkflows(flows.workflows ?? []);
      setFields(extra.fields ?? []);
      setFailed(null);
    } catch (failure) {
      setFailed(failure.message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function run(action, note, after) {
    setBusy(true);
    onError?.(null);
    try {
      const answer = await action();
      if (answer?.workflows) setWorkflows(answer.workflows);
      if (answer?.fields) setFields(answer.fields);
      after?.();
      if (note) onNotice?.(note);
    } catch (failure) {
      onError?.(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <Empty>{failed}</Empty>;
  if (!workflows || !fields) return <Empty>Reading the settings…</Empty>;

  if (!canManage) {
    return (
      <Empty>Changing workflows and project fields needs the “Change” permission on projects.</Empty>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <Workflows workflows={workflows} busy={busy} onRun={run} />
      <Fields fields={fields} busy={busy} onRun={run} />
    </div>
  );
}
