import React from "react";
import { GitMerge, GitPullRequest, History, X } from "lucide-react";
import { formatAgo, githubAvatarUrl } from "../../../lib/admin";
import { Empty, Panel, Pill, SearchInput } from "../ui";
import { GithubLink, listOf, pullVerdict, repositoriesIn } from "./shared";

const STATUS_MARK = { added: "+", removed: "−", renamed: "→", modified: "·" };

const STATES = [
  { id: "all", label: "Everything" },
  { id: "open", label: "Open" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

const STATE_LOOK = {
  open: { tone: "green", icon: GitPullRequest, label: "open" },
  merged: { tone: "purple", icon: GitMerge, label: "merged" },
  closed: { tone: "rose", icon: X, label: "closed" },
};

const REVIEW_LOOK = {
  APPROVED: { tone: "green", label: "approved" },
  CHANGES_REQUESTED: { tone: "rose", label: "changes requested" },
  COMMENTED: { tone: "neutral", label: "commented" },
  DISMISSED: { tone: "amber", label: "dismissed" },
};

const DAY = 86400000;

const ageOf = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? null : Date.now() - parsed;
};

const days = (ms) => (ms === null ? null : Math.floor(ms / DAY));

const spanOf = (from, to) => {
  const a = Date.parse(from ?? "");
  const b = Date.parse(to ?? "");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const hours = Math.max(0, Math.round((b - a) / 3600000));
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const dateOf = (value) => {
  const parsed = Date.parse(value ?? "");
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const ageTone = (ms) => {
  const d = days(ms);
  if (d === null) return "text-neutral-500";
  if (d >= 14) return "text-rose-400";
  if (d >= 7) return "text-amber-300";
  return "text-neutral-400";
};

function reviewsOf(pull) {
  const rows = listOf(pull, "reviews");
  const approved = rows.filter((row) => row.state === "APPROVED");
  const changes = rows.filter((row) => row.state === "CHANGES_REQUESTED");
  const commented = rows.filter((row) => row.state === "COMMENTED");
  const dismissed = rows.filter((row) => row.state === "DISMISSED");
  const spoken = new Set(
    rows.map((row) => String(row.login ?? "").toLowerCase()),
  );
  const pending = (pull.reviewers ?? []).filter(
    (login) => !spoken.has(String(login ?? "").toLowerCase()),
  );
  return {
    rows,
    approved,
    changes,
    commented,
    dismissed,
    pending,
    asked: pull.reviewers ?? [],
  };
}

function waitingOn(pull, review) {
  if (pull.looked === false) {
    return {
      who: [],
      label: "not looked into",
      tone: "neutral",
      why: "Too many open at once to look into them all this round.",
    };
  }
  if (pull.draft) {
    return {
      who: pull.author ? [pull.author] : [],
      label: "the author",
      tone: "neutral",
      why: "Still a draft, so it is not asking anybody for anything yet.",
    };
  }
  if (pull.mergeable === false || pull.mergeState === "dirty") {
    return {
      who: pull.author ? [pull.author] : [],
      label: "the author",
      tone: "rose",
      why: `It no longer applies cleanly to ${pull.base}, so nobody else can move it along.`,
    };
  }
  const ci = pull.ci ?? "unknown";
  if (ci.startsWith("completed/") && ci !== "completed/success") {
    return {
      who: pull.author ? [pull.author] : [],
      label: "the author",
      tone: "rose",
      why: "CI did not pass. Reviewing a red branch is wasted effort.",
    };
  }
  if (review.changes.length > 0) {
    return {
      who: pull.author ? [pull.author] : [],
      label: "the author",
      tone: "amber",
      why: `${review.changes.map((row) => row.login).join(", ")} asked for changes and has not been back since.`,
    };
  }
  if (ci !== "unknown" && ci !== "none" && !ci.startsWith("completed/")) {
    return {
      who: [],
      label: "the checks",
      tone: "neutral",
      why: "CI is still going. There is nothing for a person to do until it lands.",
    };
  }
  if (review.pending.length > 0) {
    return {
      who: review.pending,
      label:
        review.pending.length === 1
          ? review.pending[0]
          : `${review.pending.length} reviewers`,
      tone: "amber",
      why: `Asked to review and has not answered${pull.updated ? ` since ${formatAgo(pull.updated)}` : ""}.`,
    };
  }
  if (review.approved.length > 0) {
    return {
      who: [],
      label: "a merge",
      tone: "green",
      why: `Approved by ${review.approved.map((row) => row.login).join(", ")} with nothing in the way. Somebody just has to press the button.`,
    };
  }
  if (review.asked.length === 0) {
    return {
      who: [],
      label: "somebody to be asked",
      tone: "amber",
      why: "No reviewer has been requested, so it is not in anybody's queue but this one.",
    };
  }
  return {
    who: [],
    label: "a decision",
    tone: "neutral",
    why: "It applies cleanly and its checks passed.",
  };
}

function Face({ login, size = "h-5 w-5" }) {
  const [failed, setFailed] = React.useState(false);
  return !failed && login ? (
    <img
      src={githubAvatarUrl(login)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0`}
    />
  ) : (
    <span
      className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0 flex items-center justify-center text-[9px] font-semibold text-neutral-500 uppercase`}
    >
      {String(login ?? "?").slice(0, 1)}
    </span>
  );
}

function Faces({ logins, tone = "text-neutral-400" }) {
  if (!logins || logins.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {logins.slice(0, 4).map((login) => (
        <span key={login} className="inline-flex items-center gap-1">
          <Face login={login} size="h-4 w-4" />
          <span className={`text-[11px] ${tone}`}>{login}</span>
        </span>
      ))}
      {logins.length > 4 && (
        <span className="text-[11px] text-neutral-600">
          +{logins.length - 4}
        </span>
      )}
    </span>
  );
}

function Figure({ value, label, tone = "text-white" }) {
  return (
    <div className="px-4 sm:px-6 py-4">
      <p
        className={`text-[22px] font-semibold tabular-nums leading-none ${tone}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-neutral-500 mt-1.5 leading-snug">
        {label}
      </p>
    </div>
  );
}

function ReviewStrip({ review }) {
  const bits = [
    { rows: review.approved, look: REVIEW_LOOK.APPROVED },
    { rows: review.changes, look: REVIEW_LOOK.CHANGES_REQUESTED },
    { rows: review.commented, look: REVIEW_LOOK.COMMENTED },
    { rows: review.dismissed, look: REVIEW_LOOK.DISMISSED },
  ].filter((bit) => bit.rows.length > 0);

  if (bits.length === 0 && review.pending.length === 0) {
    return (
      <p className="text-[11px] text-neutral-600">
        Nobody has reviewed it and nobody has been asked to.
      </p>
    );
  }

  const colour = {
    green: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-300",
    neutral: "text-neutral-500",
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {bits.map((bit) => (
        <span key={bit.look.label} className="inline-flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold tracking-[0.12em] uppercase ${colour[bit.look.tone]}`}
          >
            {bit.look.label}
          </span>
          <Faces logins={bit.rows.map((row) => row.login)} />
        </span>
      ))}
      {review.pending.length > 0 && (
        <span className="inline-flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-neutral-600">
            not answered
          </span>
          <Faces logins={review.pending} tone="text-neutral-500" />
        </span>
      )}
    </div>
  );
}

function Changed({ files, total }) {
  const [open, setOpen] = React.useState(false);
  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((held) => !held)}
        aria-expanded={open}
        className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
      >
        {open
          ? "Hide what changed"
          : `What changed · ${files.length} file${files.length === 1 ? "" : "s"}`}
      </button>

      {open && (
        <ul className="mt-2 border border-[#1c1c22] bg-[#0d0d11] divide-y divide-[#17171d] max-h-72 overflow-y-auto">
          {files.map((file) => (
            <li key={file.path} className="flex items-baseline gap-3 px-3 py-2">
              <span className="text-neutral-600 w-3 shrink-0 text-center">
                {STATUS_MARK[file.status] ?? "·"}
              </span>
              <span className="font-mono text-[11px] text-neutral-400 break-all flex-1">
                {file.path}
              </span>
              <span className="text-[11px] tabular-nums shrink-0">
                <span className="text-emerald-400">+{file.added}</span>{" "}
                <span className="text-rose-400">−{file.removed}</span>
              </span>
            </li>
          ))}
          {typeof total === "number" && total > files.length && (
            <li className="px-3 py-2 text-[11px] text-neutral-600">
              and {total - files.length} more — open it on GitHub for the rest.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Queued({ pull, place }) {
  const state = pullVerdict(pull);
  const review = reviewsOf(pull);
  const wait = waitingOn(pull, review);
  const age = ageOf(pull.created);
  const old = days(age);

  return (
    <div className="px-4 sm:px-6 py-5 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-start gap-4">
        <span className="text-[11px] font-mono text-neutral-700 tabular-nums pt-0.5 w-5 shrink-0">
          {place}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] text-neutral-500 font-mono">
              {pull.repo} #{pull.number}
            </span>
            <Pill tone={state.tone}>{state.label}</Pill>
            {pull.draft && <Pill tone="neutral">draft</Pill>}
            <span className={`text-[11px] tabular-nums ${ageTone(age)}`}>
              open {old === null ? "—" : old === 0 ? "today" : `${old}d`}
            </span>
          </div>

          <p className="text-[13px] text-white font-medium leading-snug break-words">
            {pull.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
            <span className="inline-flex items-center gap-1.5">
              <Face login={pull.author} size="h-4 w-4" />
              <span className="text-[11px] text-neutral-400">
                {pull.author ?? "unknown"}
              </span>
            </span>
            <span className="text-[11px] text-neutral-600 font-mono break-all">
              {pull.head} → {pull.base}
            </span>
            {typeof pull.additions === "number" && (
              <span className="text-[11px] tabular-nums">
                <span className="text-emerald-400">+{pull.additions}</span>{" "}
                <span className="text-rose-400">−{pull.deletions}</span>
              </span>
            )}
          </div>

          <div className="mt-3 border-l-2 border-[#282832] pl-3">
            <p className="text-[11px] tracking-[0.12em] uppercase text-neutral-600 font-semibold">
              waiting on
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {wait.who.length > 0 ? (
                <Faces logins={wait.who} tone="text-white" />
              ) : (
                <span className="text-[13px] text-white font-medium">
                  {wait.label}
                </span>
              )}
              <Pill tone={wait.tone}>
                {wait.who.length > 0 ? wait.label : "nobody in particular"}
              </Pill>
            </div>
            <p className="text-[12px] text-neutral-400 leading-relaxed mt-1.5">
              {wait.why}
            </p>
          </div>

          <div className="mt-3">
            <p className="text-[11px] tracking-[0.12em] uppercase text-neutral-600 font-semibold mb-1.5">
              review
            </p>
            <ReviewStrip review={review} />
          </div>

          <p className="text-[12px] text-neutral-500 leading-relaxed mt-3">
            {state.detail}
          </p>

          <Changed files={listOf(pull, "changed")} total={pull.files} />
        </div>

        <GithubLink
          href={pull.url}
          title={`Open pull request #${pull.number} on GitHub`}
        />
      </div>
    </div>
  );
}

function Past({ row }) {
  const look = STATE_LOOK[row.state] ?? STATE_LOOK.closed;
  const Icon = look.icon;
  const lived = spanOf(row.created, row.merged ?? row.closed);

  return (
    <div className="px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon
          className={`h-4 w-4 shrink-0 mt-0.5 ${
            row.state === "merged"
              ? "text-purple-400"
              : row.state === "open"
                ? "text-emerald-400"
                : "text-rose-400"
          }`}
          strokeWidth={2}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-500 font-mono">
              {row.repo} #{row.number}
            </span>
            <Pill tone={look.tone}>{look.label}</Pill>
            {row.draft && row.state === "open" && (
              <Pill tone="neutral">draft</Pill>
            )}
          </div>

          <p className="text-[13px] text-white leading-snug break-words mt-1">
            {row.title}
          </p>

          <p className="text-[11px] text-neutral-500 mt-1.5">
            {row.author ?? "unknown"} opened it {dateOf(row.created) ?? "—"}
            {row.state === "merged" && (
              <>
                {" · "}
                merged{row.mergedBy ? ` by ${row.mergedBy}` : ""}{" "}
                {dateOf(row.merged)}
                {lived ? ` · open for ${lived}` : ""}
              </>
            )}
            {row.state === "closed" && (
              <>
                {" · "}
                closed without merging {dateOf(row.closed)}
                {lived ? ` after ${lived}` : ""}
              </>
            )}
            {row.state === "open" &&
              ` · last touched ${formatAgo(row.updated)}`}
          </p>

          <p className="text-[11px] text-neutral-600 mt-1 font-mono break-all">
            {row.head} → {row.base}
          </p>

          {row.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {row.labels.map((label) => (
                <span
                  key={label.name}
                  className="text-[10px] px-1.5 py-[2px] border border-[#282832] text-neutral-500"
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <GithubLink
          href={row.url}
          title={`Open pull request #${row.number} on GitHub`}
        />
      </div>
    </div>
  );
}

function everyPull(repositories) {
  const seen = new Map();
  repositories.forEach((repo) => {
    listOf(repo, "history").forEach((row) => {
      seen.set(`${repo.name}#${row.number}`, { ...row, repo: repo.name });
    });
  });
  repositories.forEach((repo) => {
    listOf(repo, "pulls").forEach((pull) => {
      const id = `${repo.name}#${pull.number}`;
      seen.set(id, {
        state: "open",
        ...(seen.get(id) ?? {}),
        ...pull,
        repo: repo.name,
      });
    });
  });
  return [...seen.values()].sort((a, b) =>
    String(b.updated ?? b.created ?? "").localeCompare(
      String(a.updated ?? a.created ?? ""),
    ),
  );
}

function Ledger({ rows }) {
  const [term, setTerm] = React.useState("");
  const [state, setState] = React.useState("all");
  const [shown, setShown] = React.useState(25);

  const wanted = term.trim().toLowerCase();
  const found = rows.filter((row) => {
    if (state !== "all" && row.state !== state) return false;
    if (!wanted) return true;
    const hay = [
      row.title,
      row.author,
      row.repo,
      row.head,
      row.base,
      row.mergedBy,
      `#${row.number}`,
      ...(row.labels ?? []).map((label) => label.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return wanted.split(/\s+/).every((word) => hay.includes(word));
  });

  const tally = {
    all: rows.length,
    open: rows.filter((row) => row.state === "open").length,
    merged: rows.filter((row) => row.state === "merged").length,
    closed: rows.filter((row) => row.state === "closed").length,
  };

  return (
    <Panel
      title="Every pull request raised"
      icon={History}
      action={<Pill tone="neutral">{rows.length}</Pill>}
    >
      <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] space-y-3">
        <SearchInput
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setShown(25);
          }}
          placeholder="Search titles, people, branches, labels, #number"
          aria-label="Search pull requests"
        />
        <div className="flex flex-wrap gap-2">
          {STATES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setState(option.id);
                setShown(25);
              }}
              className={`border px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors ${
                state === option.id
                  ? "border-purple-500/60 text-white bg-purple-500/10"
                  : "border-[#282832] text-neutral-500 hover:text-white hover:border-neutral-600"
              }`}
            >
              {option.label}
              <span className="ml-2 text-neutral-600 tabular-nums">
                {tally[option.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {found.length === 0 ? (
        <Empty>
          {wanted
            ? `Nothing matches "${term.trim()}". The search covers titles, who raised it, the branches, the labels and the number.`
            : "Nothing has been raised in that state yet."}
        </Empty>
      ) : (
        <>
          <div className="px-4 sm:px-6 py-2.5 text-[11px] text-neutral-600 border-b border-[#17171d]">
            {found.length === rows.length
              ? `${found.length} pull request${found.length === 1 ? "" : "s"}, newest first.`
              : `${found.length} of ${rows.length} shown.`}
          </div>
          {found.slice(0, shown).map((row) => (
            <Past key={`${row.repo}#${row.number}`} row={row} />
          ))}
          {found.length > shown && (
            <div className="px-4 sm:px-6 py-4">
              <button
                type="button"
                onClick={() => setShown((held) => held + 25)}
                className="border border-[#282832] px-4 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
              >
                Show {Math.min(25, found.length - shown)} more
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export default function Pulls({ data }) {
  const repositories = repositoriesIn(data);
  const past = everyPull(repositories);

  const open = repositories
    .flatMap((repo) =>
      listOf(repo, "pulls").map((pull) => ({ ...pull, repo: repo.name })),
    )
    .map((pull) => {
      const review = reviewsOf(pull);
      return {
        pull,
        review,
        wait: waitingOn(pull, review),
        age: ageOf(pull.created),
      };
    })
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));

  const onAuthor = open.filter((row) => row.wait.label === "the author").length;
  const onReviewer = open.filter(
    (row) => row.wait.who.length > 0 && row.wait.label !== "the author",
  ).length;
  const mergeable = open.filter((row) => row.wait.label === "a merge").length;
  const unasked = open.filter(
    (row) => row.wait.label === "somebody to be asked",
  ).length;
  const oldest = open.length > 0 ? days(open[0].age) : null;

  if (open.length === 0 && past.length === 0) {
    return (
      <Panel title="Review queue" icon={GitPullRequest}>
        <Empty>
          Nothing has been raised across the three repositories. Work here lands
          straight on main, so an empty queue is the normal state rather than a
          sign anything failed.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Review queue" icon={GitPullRequest}>
        {open.length === 0 ? (
          <Empty>
            Nothing is open. Everything raised has been dealt with — the record
            of it is below.
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-[#17171d] border-b border-[#17171d]">
              <Figure
                value={open.length}
                label="open across the organisation"
              />
              <Figure
                value={onReviewer}
                label="waiting on a reviewer"
                tone={onReviewer > 0 ? "text-amber-300" : "text-white"}
              />
              <Figure
                value={onAuthor}
                label="waiting on the author"
                tone={onAuthor > 0 ? "text-rose-400" : "text-white"}
              />
              <Figure
                value={mergeable}
                label="approved and ready to merge"
                tone={mergeable > 0 ? "text-emerald-400" : "text-white"}
              />
              <Figure
                value={oldest === null ? "—" : `${oldest}d`}
                label="the oldest has been open this long"
                tone={
                  oldest !== null && oldest >= 7
                    ? "text-amber-300"
                    : "text-white"
                }
              />
            </div>

            <div className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 leading-relaxed border-b border-[#17171d]">
              Oldest first, because the one nobody has looked at longest is the
              one that needs deciding.{" "}
              {mergeable > 0 && (
                <span className="text-emerald-400">
                  {mergeable} {mergeable === 1 ? "is" : "are"} approved with
                  nothing in the way.{" "}
                </span>
              )}
              {onAuthor > 0 && (
                <span className="text-rose-400">
                  {onAuthor} {onAuthor === 1 ? "needs" : "need"} the author
                  before anybody else can help.{" "}
                </span>
              )}
              {unasked > 0 && (
                <span className="text-amber-300">
                  {unasked} {unasked === 1 ? "has" : "have"} no reviewer
                  requested at all.
                </span>
              )}
            </div>

            {open.map((row, index) => (
              <Queued
                key={`${row.pull.repo}#${row.pull.number}`}
                pull={row.pull}
                place={index + 1}
              />
            ))}
          </>
        )}
      </Panel>

      <Ledger rows={past} />
    </div>
  );
}
