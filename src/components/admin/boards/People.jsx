import React from 'react';
import { Globe, Hourglass, LockKeyhole, LogOut, Search, UserPlus, X } from 'lucide-react';
import { Button, Select, Empty, Notice, SearchInput, Pill } from '../ui';
import { Avatar, GeneralTag, isGeneral } from './shared';
import { BOARD_ROLE_HINT, BOARD_ROLE_LABEL } from '../../../lib/admin';

const ROLES = ['owner', 'editor', 'viewer'];

function Asker({ accounts, taken, choices, generals, busy, room, onAsk }) {
  const [name, setName] = React.useState('');
  const [seat, setSeat] = React.useState('editor');
  const [picked, setPicked] = React.useState(0);
  const [said, setSaid] = React.useState('');
  const typed = name.trim();
  const matches = typed
    ? (accounts ?? [])
        .filter((entry) => !taken.has(entry) && entry.toLowerCase().includes(typed.toLowerCase()))
        .slice(0, 6)
    : [];

  async function ask(who) {
    const wanted = String(who ?? '').trim();
    if (!wanted || !room) return;
    setSaid('');
    const done = await onAsk(wanted, seat);
    if (!done) return;
    setName('');
    setPicked(0);
    setSaid(`Asked ${wanted} — they land on the board once they accept.`);
  }

  function typing(event) {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setPicked((held) => (held + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setPicked((held) => (held - 1 + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      ask(matches[picked] ?? typed);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600"
            strokeWidth={2}
          />
          <input
            value={name}
            maxLength={40}
            spellCheck={false}
            autoComplete="off"
            disabled={busy || !room}
            placeholder="Type a username"
            aria-label="Username to ask"
            onChange={(event) => {
              setName(event.target.value);
              setPicked(0);
              setSaid('');
            }}
            onKeyDown={typing}
            className="w-full border border-[#282832] bg-[#111115] py-2 pl-8 pr-3 text-[12px] text-white placeholder-neutral-600 outline-none transition-colors focus:border-purple-500/60 disabled:opacity-40"
          />
        </div>
        <div className="w-[150px] shrink-0">
          <Select
            value={seat}
            disabled={busy || !room}
            aria-label="What they can do"
            onChange={(event) => setSeat(event.target.value)}
          >
            {choices.map((role) => (
              <option key={role} value={role}>
                {BOARD_ROLE_LABEL[role] ?? role}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" tone="solid" disabled={busy || !typed || !room} onClick={() => ask(matches[picked] ?? typed)}>
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Ask to join
        </Button>
      </div>

      {typed.length > 0 && (
        <ul className="quiet-scroll mt-2 max-h-48 space-y-1 overflow-y-auto">
          {matches.map((person, index) => (
            <li key={person}>
              <button
                type="button"
                disabled={busy || !room}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => ask(person)}
                className={`flex w-full items-center gap-2.5 border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  index === picked
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-[#282832] bg-[#0a0a0d] hover:border-[#3a3a46]'
                }`}
              >
                <Avatar name={person} crowned={isGeneral(generals, person)} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-200">
                  {person}
                </span>
                {isGeneral(generals, person) && <GeneralTag short />}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="flex items-center gap-2 px-1 py-1 text-[12px] font-normal text-neutral-500">
              <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              No account here goes by that — the request is sent as typed.
            </li>
          )}
        </ul>
      )}

      <p className="mt-2 text-[11px] font-normal text-neutral-600">
        {said || 'They are asked first and only join once they accept.'}
        {said ? '' : ` · ${BOARD_ROLE_HINT[seat]}`}
      </p>
    </>
  );
}

function workload(cards, name) {
  return Object.values(cards ?? {}).filter(
    (card) => !card.archived && !card.done && (card.assignees ?? []).includes(name),
  ).length;
}

export default function People({
  members,
  asks,
  accounts,
  you,
  roles,
  visibility,
  cards,
  canAdmin,
  busy,
  limit,
  pinned,
  keyholders,
  generals,
  here,
  onAdd,
  onAsk,
  onWithdraw,
  onSet,
  onDrop,
  onLeave,
}) {
  const [search, setSearch] = React.useState('');
  const [picked, setPicked] = React.useState([]);
  const [seat, setSeat] = React.useState('editor');
  const choices = roles ?? ROLES;
  const seated = members ?? {};
  const listed = Object.entries(seated).sort(([a], [b]) => a.localeCompare(b));
  const owners = listed.filter(([, held]) => held === 'owner').map(([name]) => name);
  const free = (accounts ?? []).filter((name) => !(name in seated));
  const wanted = search.trim().toLowerCase();
  const keys = (keyholders ?? []).map((name) => name.toLowerCase());
  const everywhere = (name) => keys.includes(name.toLowerCase());
  const matching = free.filter(
    (name) => !everywhere(name) && (!wanted || name.toLowerCase().includes(wanted)),
  );
  const waiting = asks ?? [];
  const taken = new Set([...Object.keys(seated), ...waiting.map((entry) => entry.who)]);
  const room = Math.max(0, (limit ?? 40) - listed.length - waiting.length);

  const toggle = (name) =>
    setPicked((held) => (held.includes(name) ? held.filter((entry) => entry !== name) : [...held, name]));

  return (
    <div className="space-y-4">
      {listed.length === 0 ? (
        <Empty>Nobody is named on this board yet.</Empty>
      ) : (
        <ul className="divide-y divide-[#17171d] border border-[#282832] bg-[#0a0a0d]">
          {listed.map(([person, held]) => {
            const keeper = everywhere(person);
            const fixed = keeper || (pinned ?? []).includes(person);
            const last = fixed || (held === 'owner' && owners.length < 2);
            const open = workload(cards, person);
            const looking = (here ?? []).includes(person);
            return (
              <li key={person} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={person} size="lg" crowned={isGeneral(generals, person)} />
                <span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-neutral-200">
                      {person}
                      {person === you ? ' (you)' : ''}
                    </span>
                    {isGeneral(generals, person) && <GeneralTag />}
                    {keeper && <Pill tone="purple">On every board</Pill>}
                    {looking && <Pill tone="green">Here now</Pill>}
                    {open > 0 && <Pill tone="neutral">{open} open</Pill>}
                  </span>
                  <span className="block text-[11px] font-normal text-neutral-500">
                    {keeper
                      ? 'Holds the keys to the whole panel, so every board — this one included — is already theirs. Cannot be added or taken off.'
                      : (pinned ?? []).includes(person)
                        ? 'You own this board — that cannot be handed over until it exists.'
                        : last
                          ? 'The only owner — make somebody else an owner first.'
                          : BOARD_ROLE_HINT[held]}
                  </span>
                </span>
                {canAdmin && !keeper ? (
                  <>
                    <div className="min-w-0 basis-[calc(100%-2.75rem)] sm:w-[150px] sm:flex-none sm:shrink-0 sm:basis-auto">
                      <Select
                        value={held}
                        disabled={busy || last}
                        aria-label={`What ${person} can do`}
                        onChange={(event) => onSet(person, event.target.value)}
                      >
                        {choices.map((role) => (
                          <option key={role} value={role}>
                            {BOARD_ROLE_LABEL[role] ?? role}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <button
                      type="button"
                      aria-label={`Take ${person} off this board`}
                      disabled={busy || last}
                      onClick={() => onDrop(person)}
                      className="text-neutral-600 transition-colors hover:text-rose-400 disabled:opacity-30"
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </>
                ) : (
                  <span className="text-[12px] text-neutral-500">{BOARD_ROLE_LABEL[held]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <div className="border border-dashed border-amber-400/30 bg-amber-400/[0.06]">
          <h4 className="flex items-center gap-2 border-b border-amber-400/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <Hourglass className="h-3.5 w-3.5" strokeWidth={2} />
            Asked, not answered
          </h4>
          <ul className="divide-y divide-amber-400/10">
            {waiting.map((entry) => (
              <li key={entry.id ?? entry.who} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={entry.who} size="lg" crowned={isGeneral(generals, entry.who)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-neutral-200">{entry.who}</span>
                    <Pill tone="amber">Waiting</Pill>
                  </span>
                  <span className="block text-[11px] font-normal text-neutral-500">
                    {entry.by === you ? 'You asked them' : `Asked by ${entry.by}`} · joins as{' '}
                    {BOARD_ROLE_LABEL[entry.role] ?? entry.role}
                  </span>
                </span>
                {canAdmin && onWithdraw && (
                  <button
                    type="button"
                    aria-label={`Withdraw the request to ${entry.who}`}
                    disabled={busy}
                    onClick={() => onWithdraw(entry.who)}
                    className="text-neutral-600 transition-colors hover:text-rose-400 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibility === 'team' && (
        <p className="flex items-start gap-2 text-[12px] font-normal leading-relaxed text-neutral-500">
          <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
          This board is team-wide, so every other account can open it and move cards. Name somebody
          here as read-only to hold them to reading.
        </p>
      )}

      {visibility === 'sealed' && (
        <p className="flex items-start gap-2 text-[12px] font-normal leading-relaxed text-purple-200/80">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" strokeWidth={2} />
          This board is sealed, so this list is the whole of who can reach it. Take somebody off and
          the board disappears for them.
        </p>
      )}

      {canAdmin && (
        <div className="border border-[#282832] bg-[#0a0a0d] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
              {onAsk ? 'Ask someone to join' : 'Add people'}
            </h4>
            <span className="text-[11px] font-normal text-neutral-600">
              {!onAsk && picked.length ? `${picked.length} picked · ` : ''}
              {room} seat{room === 1 ? '' : 's'} left
            </span>
          </div>

          {onAsk && (
            <Asker
              accounts={accounts}
              taken={taken}
              choices={choices}
              generals={generals}
              busy={busy}
              room={room}
              onAsk={onAsk}
            />
          )}

          {onAsk ? null : (accounts ?? []).length === 0 ? (
            <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
              This account is not shown the list of panel accounts, so people have to be added by an
              administrator.
            </p>
          ) : free.length === 0 ? (
            <p className="text-[12px] font-normal text-neutral-500">
              Every account on the panel is already named here.
            </p>
          ) : (
            <>
              {free.length > 6 && (
                <div className="mb-3">
                  <SearchInput
                    value={search}
                    placeholder="Search accounts"
                    aria-label="Search accounts"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              )}

              {matching.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] font-normal text-neutral-500">
                  <Search className="h-3.5 w-3.5" strokeWidth={2} />
                  No account matches that.
                </p>
              ) : (
                <ul className="quiet-scroll mb-3 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                  {matching.map((name) => {
                    const on = picked.includes(name);
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          disabled={busy || (!on && picked.length >= room)}
                          aria-pressed={on}
                          onClick={() => toggle(name)}
                          className={`flex w-full items-center gap-2.5 border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                            on
                              ? 'border-purple-500/50 bg-purple-500/10'
                              : 'border-[#282832] bg-[#0a0a0d] hover:border-[#3a3a46]'
                          }`}
                        >
                          <Avatar name={name} crowned={isGeneral(generals, name)} />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-200">
                            {name}
                          </span>
                          {isGeneral(generals, name) && <GeneralTag short />}
                          <span
                            className={`h-3.5 w-3.5 shrink-0 border ${
                              on ? 'border-purple-400 bg-purple-500' : 'border-[#3a3a46]'
                            }`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[150px] shrink-0">
                  <Select
                    value={seat}
                    aria-label="What they can do"
                    onChange={(event) => setSeat(event.target.value)}
                  >
                    {choices.map((role) => (
                      <option key={role} value={role}>
                        {BOARD_ROLE_LABEL[role] ?? role}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  tone="solid"
                  disabled={busy || picked.length === 0}
                  onClick={async () => {
                    const chosen = picked;
                    setPicked([]);
                    setSearch('');
                    await onAdd(chosen.map((name) => ({ name, role: seat })));
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                  {picked.length > 1 ? `Add ${picked.length} people` : 'Add'}
                </Button>
                {picked.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="text-[11px] font-semibold tracking-wide text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-200"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[11px] font-normal text-neutral-600">
                  {BOARD_ROLE_HINT[seat]}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {onLeave && seated[you] && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={busy || (seated[you] === 'owner' && owners.length < 2)}
            onClick={onLeave}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
            Leave this board
          </Button>
          {seated[you] === 'owner' && owners.length < 2 && (
            <span className="text-[11px] font-normal text-neutral-600">
              You are the only owner — hand it to somebody else first.
            </span>
          )}
        </div>
      )}

      {canAdmin && room === 0 && (
        <Notice tone="amber">
          This board is at its limit of {limit ?? 40} named people. Take somebody off before adding
          anyone else.
        </Notice>
      )}
    </div>
  );
}
