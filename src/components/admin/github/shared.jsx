import React from 'react';
import { ExternalLink } from 'lucide-react';

export const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '—');

export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const NOT_PEOPLE = new Set(['claude']);

export const isPerson = (login) => !NOT_PEOPLE.has(String(login ?? '').trim().toLowerCase());

export const commitByPerson = (commit) =>
  commit?.login ? isPerson(commit.login) : isPerson(commit?.author);

export const repositoriesIn = (data) =>
  Array.isArray(data?.repositories) ? data.repositories : [];

export const listOf = (repo, key) => (Array.isArray(repo?.[key]) ? repo[key] : []);

export function GithubLink({ href, children = 'OPEN', title }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? 'Open on GitHub in a new tab'}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors shrink-0"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </a>
  );
}

export const REPO_ROLES = [
  {
    api: 'pull',
    label: 'read',
    writes: false,
    blurb: 'Can see the code and clone it. Cannot change anything at all.',
  },
  {
    api: 'triage',
    label: 'triage',
    writes: false,
    blurb:
      'Read, plus tidying the tracker: closing and reopening issues, labels, milestones, assigning people, requesting reviews. Cannot push a line to any branch, cannot make a branch, and cannot merge a pull request.',
  },
  {
    api: 'push',
    label: 'write',
    writes: true,
    blurb:
      'Can push to any branch that is not protected, make branches, and merge pull requests. The normal level for somebody working on it.',
  },
  {
    api: 'maintain',
    label: 'maintain',
    writes: true,
    blurb: 'Write, plus most of the repository settings. Cannot delete it and cannot change who else can reach it.',
  },
  {
    api: 'admin',
    label: 'admin',
    writes: true,
    controls: true,
    blurb: 'Everything: the settings, deleting the repository, and adding or removing anybody else.',
  },
];

export const roleGist = (level) =>
  level.controls ? 'controls access' : level.writes ? 'can change code' : 'read only';

export const roleTone = (level) => (level.controls ? 'rose' : level.writes ? 'amber' : 'neutral');

const BY_NAME = new Map();
REPO_ROLES.forEach((role, index) => {
  BY_NAME.set(role.api, { ...role, rank: index });
  BY_NAME.set(role.label, { ...role, rank: index });
});

export const role = (value) => BY_NAME.get(value) ?? null;
export const roleLabel = (value) => role(value)?.label ?? '—';
export const roleApi = (value) => role(value)?.api ?? null;
export const roleRank = (value) => role(value)?.rank ?? -1;
export const roleBlurb = (value) => role(value)?.blurb ?? '';

export function pullVerdict(pull) {
  if (pull.looked === false) {
    return {
      tone: 'neutral',
      label: 'not looked at',
      detail:
        'Too many open at once to look into them all this round. It is listed, and gets a verdict ' +
        'once the ones above it are dealt with.',
    };
  }

  if (pull.draft) {
    return {
      tone: 'neutral',
      label: 'draft',
      detail: 'Still a draft, so it is not asking for anything yet.',
    };
  }

  if (pull.mergeable === false || pull.mergeState === 'dirty') {
    return {
      tone: 'rose',
      label: 'conflicts',
      detail: `It no longer applies cleanly to ${pull.base}. The author needs to merge ${pull.base} in or rebase on it before anyone can merge this.`,
    };
  }

  const ci = pull.ci ?? 'unknown';
  if (ci.startsWith('completed/') && ci !== 'completed/success') {
    return {
      tone: 'rose',
      label: 'checks failed',
      detail: `CI did not pass (${ci}). Nothing should go in on a red run — the deploy would refuse it anyway.`,
    };
  }
  if (ci === 'none') {
    return {
      tone: 'amber',
      label: 'no run',
      detail: 'No workflow run has been recorded for the head of this branch.',
    };
  }
  if (ci !== 'unknown' && !ci.startsWith('completed/')) {
    return { tone: 'amber', label: 'checks running', detail: `CI is still going (${ci}). Wait for it.` };
  }

  if (pull.mergeState === 'unstable') {
    return {
      tone: 'amber',
      label: 'a check is unhappy',
      detail:
        'Something GitHub does not treat as required is failing. It can still be merged, but it is ' +
        'worth knowing why before doing so.',
    };
  }
  if (pull.mergeState === 'behind') {
    return {
      tone: 'amber',
      label: 'behind',
      detail: `${pull.base} has moved on since this branched. Update it first so what is tested is what is merged.`,
    };
  }
  if (pull.mergeState === 'blocked') {
    return {
      tone: 'amber',
      label: 'blocked',
      detail: 'GitHub is holding it — usually a required review that has not been given.',
    };
  }
  if (pull.mergeable === null || pull.mergeState === 'unknown') {
    return {
      tone: 'neutral',
      label: 'working it out',
      detail: 'GitHub has not finished deciding whether this merges cleanly. It settles in a moment.',
    };
  }

  return {
    tone: 'green',
    label: 'ready',
    detail: 'It applies cleanly and its checks passed. Nothing is in the way but a decision.',
  };
}
