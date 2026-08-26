import React from 'react';
import { Download, Eye, EyeOff, FolderOpen, Link2, Package } from 'lucide-react';
import {
  fetchMyProjectFiles,
  fetchMyProjects,
  hideMyProject,
  projectFileUrl,
} from '../../lib/admin';
import { Empty, Notice, Panel, Pill } from './ui';
import { StageRail, TrackCode, ago, on } from './orders/shared';
import { IdChip } from './orders/ids';
import { readableBytes } from './orders/Files';

function Files({ project }) {
  const [files, setFiles] = React.useState(null);
  const [failed, setFailed] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setFiles(null);
    setFailed(null);
    fetchMyProjectFiles(project)
      .then((answer) => {
        if (alive) setFiles(answer.files ?? []);
      })
      .catch((failure) => {
        if (alive) setFailed(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [project]);

  if (failed) {
    return <p className="text-[12px] font-normal text-neutral-500">{failed}</p>;
  }
  if (!files) {
    return <p className="text-[12px] font-normal text-neutral-600">Looking for your files…</p>;
  }
  if (!files.length) {
    return (
      <p className="text-[12px] font-normal text-neutral-600">
        Nothing has been handed over yet. Files appear here the moment the studio releases them.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-normal text-neutral-100">
              {file.name}
              {file.versions > 1 ? ` · v${file.version}` : ''}
            </span>
            <span className="block text-[12px] font-normal text-neutral-600">
              {readableBytes(file.bytes)} · {file.ext.toUpperCase()} · updated {ago(Date.parse(file.updatedAt))}
              {file.note ? ` · ${file.note}` : ''}
            </span>
          </span>
          <a
            href={projectFileUrl(file.id)}
            className="inline-flex shrink-0 items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 transition-colors hover:border-purple-500/40 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}

function Row({ project, busy, onHide }) {
  const [showing, setShowing] = React.useState(false);
  const closed = project.status === 'closed';

  return (
    <li className={`border-b border-[#17171d] px-4 sm:px-6 py-5 last:border-b-0 ${project.hidden ? 'opacity-60' : ''}`}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <IdChip code={project.project ?? project.ref} />
        <Pill tone={closed ? 'neutral' : project.held ? 'amber' : 'purple'}>
          {project.stageLabel}
        </Pill>
        {project.held && <Pill tone="amber">paused</Pill>}
        {project.hidden && <Pill tone="neutral">hidden</Pill>}

        <button
          type="button"
          disabled={busy}
          onClick={() => onHide(project, !project.hidden)}
          title={project.hidden ? 'Show this project again' : 'Hide this project from your list'}
          className="tap ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-neutral-600 transition-colors hover:text-neutral-200 disabled:opacity-40"
        >
          {project.hidden ? (
            <>
              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
              Show again
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
              Hide
            </>
          )}
        </button>
      </div>

      <p className="text-[15px] font-normal leading-snug text-neutral-100">
        {project.name || 'Untitled project'}
      </p>
      <p className="mt-1 text-[12px] font-normal text-neutral-500">
        {project.categoryLabel} · started {on(project.createdAt)}
        {closed ? ` · closed ${on(project.closedAt)}` : ` · last moved ${ago(project.updatedAt)}`}
      </p>

      <div className="mt-4 max-w-[420px]">
        <StageRail
          step={project.step}
          steps={project.steps}
          held={project.held}
          closed={closed}
          delivered={Boolean(project.finished)}
        />
        <p className="mt-2 text-[12px] font-normal text-neutral-500">
          Step {project.step} of {project.steps}
          {project.stageNote ? ` · ${project.stageNote}` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowing((was) => !was)}
        className="mt-3.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-neutral-200"
      >
        <FolderOpen className="h-3.5 w-3.5" strokeWidth={2} />
        {showing ? 'Hide files and tracking' : 'Files and tracking'}
      </button>

      {showing && (
        <div className="mt-4 flex flex-col gap-5 border-t border-[#17171d] pt-4">
          <div>
            <span className="mb-2.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Your files
            </span>
            <Files project={project.project} />
          </div>

          {!project.trackOff && project.track && (
            <div>
              <span className="mb-2.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
                Your tracking code
              </span>
              <TrackCode code={project.track} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function MyProjectsPanel() {
  const [state, setState] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  const [showHidden, setShowHidden] = React.useState(false);
  const [busy, setBusy] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    fetchMyProjects()
      .then((answer) => {
        if (alive) setState(answer);
      })
      .catch((failure) => {
        if (alive) setFailed(failure.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hide = React.useCallback(async (project, hidden) => {
    setBusy(project.id);
    setFailed(null);
    const mark = (value) =>
      setState((current) =>
        current
          ? {
              ...current,
              projects: (current.projects ?? []).map((entry) =>
                entry.id === project.id ? { ...entry, hidden: value } : entry,
              ),
            }
          : current,
      );

    mark(hidden);
    try {
      await hideMyProject(project.id, hidden);
    } catch (failure) {
      mark(!hidden);
      setFailed(failure.message);
    } finally {
      setBusy(null);
    }
  }, []);

  if (failed) return <Notice tone="rose">{failed}</Notice>;
  if (!state) {
    return (
      <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 py-8">
        <p className="text-[13px] font-normal text-neutral-400">Looking for your projects…</p>
      </div>
    );
  }

  if (!state.discord?.linked) {
    return (
      <Panel title="Your projects" icon={Package}>
        <div className="px-4 sm:px-6 py-6">
          <p className="max-w-xl text-[13px] font-normal leading-relaxed text-neutral-400">
            Link your Discord account under{' '}
            <span className="text-neutral-200">Your account → Discord</span> and the projects you
            opened with the studio will appear here, with any files that have been handed over.
          </p>
        </div>
      </Panel>
    );
  }

  const projects = state.projects ?? [];
  const kept = projects.filter((project) => !project.hidden);
  const tucked = projects.filter((project) => project.hidden);
  const open = kept.filter((project) => project.status !== 'closed');
  const done = kept.filter((project) => project.status === 'closed');
  const shown = showHidden ? [...open, ...done, ...tucked] : [...open, ...done];

  return (
    <div className="flex w-full flex-col gap-6">
      {state.botDown && <Notice tone="amber">{state.botDown}</Notice>}
      {failed && <Notice tone="rose">{failed}</Notice>}

      <Panel title={`Your projects — ${kept.length}`} icon={Package}>
        {shown.length === 0 ? (
          <Empty>
            {projects.length === 0
              ? 'Nothing yet. Projects you open with the studio on Discord show up here automatically.'
              : 'Everything here is hidden. Show them again below.'}
          </Empty>
        ) : (
          <ul>
            {shown.map((project) => (
              <Row key={project.id} project={project} busy={busy === project.id} onHide={hide} />
            ))}
          </ul>
        )}

        {tucked.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#17171d] px-4 sm:px-6 py-3">
            <p className="text-[12px] font-normal text-neutral-500">
              {tucked.length} hidden project{tucked.length === 1 ? '' : 's'} — only you see this, and
              nothing about the project itself changes.
            </p>
            <button
              type="button"
              onClick={() => setShowHidden((was) => !was)}
              className="tap inline-flex shrink-0 items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white"
            >
              {showHidden ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                  Tuck them away
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                  Show hidden
                </>
              )}
            </button>
          </div>
        )}

        <div className="flex items-start gap-2 border-t border-[#17171d] px-4 sm:px-6 py-3.5">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
          <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
            You only see projects opened under your own Discord account, and only the files the
            studio has released to you.
          </p>
        </div>
      </Panel>
    </div>
  );
}
