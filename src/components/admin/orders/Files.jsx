import React from 'react';
import {
  Download,
  FileUp,
  History,
  Lock,
  Package,
  Pencil,
  Trash2,
  Unlock,
  Upload,
  Users,
} from 'lucide-react';
import {
  FILE_ACCESS,
  addProjectFile,
  addProjectFileVersion,
  editProjectFile,
  fetchProjectFiles,
  projectFileUrl,
  removeProjectFile,
} from '../../../lib/admin';
import { Button, Empty, Field, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { Label, ago } from './shared';

const ACCESS_TONE = { studio: 'neutral', client: 'purple', named: 'amber' };

export function readableBytes(count) {
  if (!count) return '0 B';
  if (count < 1024) return `${count} B`;
  if (count < 1024 * 1024) return `${Math.round(count / 1024)} KB`;
  return `${(count / (1024 * 1024)).toFixed(count < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function readFile(file) {
  return new Promise((done, fail) => {
    const reader = new window.FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function accessLabel(value) {
  return FILE_ACCESS.find((entry) => entry.value === value)?.label ?? value;
}

function Uploader({ limits, busy, onSend, onCancel }) {
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [access, setAccess] = React.useState('studio');
  const [picked, setPicked] = React.useState(null);
  const [tooBig, setTooBig] = React.useState(false);

  function choose(file) {
    setPicked(file ?? null);
    setTooBig(Boolean(file && file.size > limits.bytes));
    if (file && !name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
  }

  return (
    <div className="flex flex-col gap-5 border-t border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
      <Field label="The file" htmlFor="file-blob" hint={`Up to ${readableBytes(limits.bytes)}.`}>
        <input
          id="file-blob"
          type="file"
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
          className="block w-full text-[13px] text-neutral-300 file:mr-4 file:border file:border-[#282832] file:bg-[#111115] file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-neutral-200 hover:file:border-purple-500/40"
        />
      </Field>

      {picked && (
        <p className="text-[12px] font-normal text-neutral-500">
          {picked.name} · {readableBytes(picked.size)}
          {picked.type ? ` · ${picked.type}` : ''}
        </p>
      )}
      {tooBig && <Notice tone="rose">That file is over the {readableBytes(limits.bytes)} limit.</Notice>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="What it is called" htmlFor="file-name">
          <TextInput
            id="file-name"
            value={name}
            disabled={busy}
            placeholder="Final build"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Who can download it" htmlFor="file-access">
          <Select
            id="file-access"
            value={access}
            disabled={busy}
            onChange={(event) => setAccess(event.target.value)}
          >
            {FILE_ACCESS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="A line about it (optional)" htmlFor="file-note">
        <TextInput
          id="file-note"
          value={note}
          disabled={busy}
          placeholder="Handover build, includes the source"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !picked || tooBig || name.trim().length < 2}
          onClick={() => onSend({ file: picked, name: name.trim(), note: note.trim(), access })}
        >
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Sending…' : 'Add the file'}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Editor({ file, busy, onSave, onCancel }) {
  const [name, setName] = React.useState(file.name);
  const [note, setNote] = React.useState(file.note ?? '');
  const [access, setAccess] = React.useState(file.access);
  const [people, setPeople] = React.useState((file.people ?? []).join(', '));

  return (
    <div className="flex flex-col gap-5 border-t border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor={`edit-name-${file.id}`}>
          <TextInput
            id={`edit-name-${file.id}`}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Who can download it" htmlFor={`edit-access-${file.id}`}>
          <Select
            id={`edit-access-${file.id}`}
            value={access}
            disabled={busy}
            onChange={(event) => setAccess(event.target.value)}
          >
            {FILE_ACCESS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="A line about it" htmlFor={`edit-note-${file.id}`}>
        <TextInput
          id={`edit-note-${file.id}`}
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {access === 'named' && (
        <Field
          label="Who by name"
          htmlFor={`edit-people-${file.id}`}
          hint="Panel usernames or Discord ids, separated by commas."
        >
          <TextInput
            id={`edit-people-${file.id}`}
            value={people}
            disabled={busy}
            placeholder="kostis, 981607036192190534"
            onChange={(event) => setPeople(event.target.value)}
          />
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          tone="solid"
          disabled={busy || name.trim().length < 2}
          onClick={() =>
            onSave({
              file: file.id,
              name: name.trim(),
              note: note.trim(),
              access,
              people: people
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
            })
          }
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Row({ file, canManage, busy, onRun, onRevise }) {
  const [editing, setEditing] = React.useState(false);
  const [showing, setShowing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  return (
    <li className="border-b border-[#17171d] last:border-b-0">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-normal text-neutral-100">{file.name}</span>
              <Pill tone={ACCESS_TONE[file.access] ?? 'neutral'}>{accessLabel(file.access)}</Pill>
              {file.locked && (
                <Pill tone="amber">
                  <Lock className="mr-1 inline h-3 w-3" strokeWidth={2} />
                  held back
                </Pill>
              )}
              {file.versions > 1 && <Pill>v{file.version}</Pill>}
            </div>

            {file.note && (
              <p className="mb-1.5 text-[12px] font-normal leading-snug text-neutral-400">
                {file.note}
              </p>
            )}

            <p className="text-[12px] font-normal text-neutral-600">
              {readableBytes(file.bytes)} · {file.ext.toUpperCase()} · added {ago(file.at)}
              {file.by ? ` by ${file.by}` : ''}
              {file.downloads ? ` · ${file.downloads} download${file.downloads === 1 ? '' : 's'}` : ' · never downloaded'}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href={projectFileUrl(file.id)}
              className="inline-flex items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 transition-colors hover:border-purple-500/40 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Download
            </a>
            {canManage && (
              <>
                <button
                  type="button"
                  title="Add a new version"
                  onClick={() => onRevise(file)}
                  disabled={busy || file.versions >= 20}
                  className="inline-flex items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[11px] font-semibold text-neutral-400 transition-colors hover:border-purple-500/40 hover:text-white disabled:opacity-40"
                >
                  <FileUp className="h-3.5 w-3.5" strokeWidth={2} />
                  New version
                </button>
                <button
                  type="button"
                  title={file.locked ? 'Release it to the client' : 'Hold it back from the client'}
                  disabled={busy}
                  onClick={() =>
                    onRun(
                      () => editProjectFile({ file: file.id, locked: !file.locked }),
                      file.locked ? 'Released.' : 'Held back.',
                    )
                  }
                  className="inline-flex items-center border border-[#282832] p-1.5 text-neutral-500 transition-colors hover:border-purple-500/40 hover:text-white disabled:opacity-40"
                >
                  {file.locked ? (
                    <Unlock className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                </button>
                <button
                  type="button"
                  title="Edit"
                  disabled={busy}
                  onClick={() => setEditing((was) => !was)}
                  className="inline-flex items-center border border-[#282832] p-1.5 text-neutral-500 transition-colors hover:border-purple-500/40 hover:text-white disabled:opacity-40"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  title="Remove"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center border border-[#282832] p-1.5 text-neutral-500 transition-colors hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        </div>

        {file.access === 'named' && (file.people ?? []).length > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-normal text-neutral-500">
            <Users className="h-3 w-3" strokeWidth={2} />
            {file.people.join(', ')}
          </p>
        )}

        {confirming && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border border-rose-500/30 bg-rose-500/5 px-3.5 py-3">
            <span className="text-[12px] font-normal text-rose-200">
              Remove {file.name} and every version of it? Downloads already made are kept in the log.
            </span>
            <Button
              type="button"
              tone="danger"
              disabled={busy}
              onClick={() => onRun(() => removeProjectFile(file.id), 'File removed.')}
            >
              Remove it
            </Button>
            <Button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        )}

        {(file.versions > 1 || (file.log ?? []).length > 0) && canManage && (
          <button
            type="button"
            onClick={() => setShowing((was) => !was)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:text-neutral-300"
          >
            <History className="h-3 w-3" strokeWidth={2} />
            {showing ? 'Hide' : 'Versions and downloads'}
          </button>
        )}
      </div>

      {showing && canManage && (
        <div className="grid grid-cols-1 gap-px border-t border-[#17171d] bg-[#17171d] sm:grid-cols-2">
          <div className="bg-[#08080b] px-5 py-4">
            <Label>Versions</Label>
            <ul className="mt-2.5 flex flex-col gap-2">
              {(file.history ?? [])
                .slice()
                .reverse()
                .map((entry) => (
                  <li key={entry.v} className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] font-normal text-neutral-300">
                      v{entry.v}
                      {entry.note ? ` — ${entry.note}` : ''}
                    </span>
                    <a
                      href={projectFileUrl(file.id, entry.v)}
                      className="shrink-0 font-mono text-[11px] text-neutral-600 hover:text-purple-300"
                    >
                      {readableBytes(entry.bytes)} · {entry.downloads ?? 0}↓
                    </a>
                  </li>
                ))}
            </ul>
          </div>
          <div className="bg-[#08080b] px-5 py-4">
            <Label>Downloads</Label>
            {(file.log ?? []).length === 0 ? (
              <p className="mt-2.5 text-[12px] font-normal text-neutral-600">Nobody yet.</p>
            ) : (
              <ul className="mt-2.5 flex flex-col gap-2">
                {(file.log ?? []).slice(0, 8).map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-[12px] font-normal text-neutral-400">
                    {entry.by} · v{entry.v} · {ago(Date.parse(entry.at))} · {entry.via}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && canManage && (
        <Editor
          file={file}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(patch) =>
            onRun(() => editProjectFile(patch), 'Saved.', () => setEditing(false))
          }
        />
      )}
    </li>
  );
}

export default function Files({ orderId, canManage, onError, onNotice }) {
  const [state, setState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [revising, setRevising] = React.useState(null);
  const [failed, setFailed] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setState(await fetchProjectFiles(orderId));
      setFailed(null);
    } catch (failure) {
      setFailed(failure.message);
    }
  }, [orderId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function run(action, note, after) {
    setBusy(true);
    onError?.(null);
    try {
      await action();
      after?.();
      if (note) onNotice?.(note);
      await load();
    } catch (failure) {
      onError?.(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function send({ file, name, note, access }) {
    await run(
      async () => {
        const data = await readFile(file);
        await addProjectFile({ id: orderId, name, note, access, data });
      },
      'File added — the project channel was told.',
      () => setAdding(false),
    );
  }

  async function revise(file, blob, note) {
    await run(
      async () => {
        const data = await readFile(blob);
        await addProjectFileVersion({ file: file.id, note, data });
      },
      'New version added.',
      () => setRevising(null),
    );
  }

  if (failed) {
    return (
      <Panel title="Purchased files" icon={Package}>
        <Empty>{failed}</Empty>
      </Panel>
    );
  }

  if (!state) {
    return (
      <Panel title="Purchased files" icon={Package}>
        <Empty>Reading the files…</Empty>
      </Panel>
    );
  }

  const files = state.files ?? [];
  const manage = canManage && state.canManage;

  return (
    <Panel
      title={`Purchased files — ${files.length}`}
      icon={Package}
      action={
        manage && !adding ? (
          <Button type="button" onClick={() => setAdding(true)} disabled={files.length >= state.limits.files}>
            <Upload className="h-3.5 w-3.5" strokeWidth={2} />
            Add a file
          </Button>
        ) : null
      }
    >
      {adding && manage && (
        <Uploader limits={state.limits} busy={busy} onSend={send} onCancel={() => setAdding(false)} />
      )}

      {revising && manage && (
        <div className="border-t border-[#17171d] bg-[#08080b] px-4 sm:px-6 py-5">
          <Field
            label={`New version of ${revising.name}`}
            htmlFor="file-revision"
            hint={`It becomes v${revising.version + 1}. Earlier versions stay downloadable.`}
          >
            <input
              id="file-revision"
              type="file"
              disabled={busy}
              onChange={(event) => {
                const blob = event.target.files?.[0];
                if (blob) revise(revising, blob, '');
              }}
              className="block w-full text-[13px] text-neutral-300 file:mr-4 file:border file:border-[#282832] file:bg-[#111115] file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-neutral-200 hover:file:border-purple-500/40"
            />
          </Field>
          <div className="mt-4">
            <Button type="button" disabled={busy} onClick={() => setRevising(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {files.length === 0 && !adding ? (
        <Empty>
          {manage
            ? 'Nothing has been handed over yet. Add the first file when it is ready.'
            : 'No files are shared on this project.'}
        </Empty>
      ) : (
        <ul>
          {files.map((file) => (
            <Row
              key={file.id}
              file={file}
              canManage={manage}
              busy={busy}
              onRun={run}
              onRevise={setRevising}
            />
          ))}
        </ul>
      )}

      {manage && (
        <div className="border-t border-[#17171d] px-4 sm:px-6 py-3.5">
          <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
            Held-back files stay invisible to the client until you release them. Every download is
            recorded against the person who made it.
          </p>
        </div>
      )}
    </Panel>
  );
}
