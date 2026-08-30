import React from 'react';
import {
  LogOut,
  RefreshCw,
  LayoutDashboard,
  Users,
  UserCircle,
  Activity,
  Footprints,
  KeySquare,
  ShieldHalf,
  BrickWall,
  Bot,
  LifeBuoy,
  Package,
  SquareKanban,
  Construction,
  ScrollText,
  FileSearch,
  Search,
  FolderOpen,
  Eye,
  EyeOff,
  HeartPulse,
  Gauge,
  Rocket,
  BookMarked,
  Zap,
  FolderGit2,
  CircleDot,
  GitPullRequest,
  Building2,
  KeyRound,
  Radar,
  Timer,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Compass,
  Layers,
  Globe,
  Archive,
  Terminal,
  GitBranch,
  UsersRound,
  CircleUserRound,
} from 'lucide-react';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import Reveal from '../components/Reveal';
import { STUDIO_NAME } from '../siteConfig';
import OverviewPanel from '../components/admin/OverviewPanel';
import ActivityPanel from '../components/admin/ActivityPanel';
import AccountsPanel from '../components/admin/AccountsPanel';
import AccountPanel from '../components/admin/AccountPanel';
import ApiPanel from '../components/admin/ApiPanel';
import ApiAdminPanel from '../components/admin/ApiAdminPanel';
import ShieldPanel from '../components/admin/ShieldPanel';
import BotPanel from '../components/admin/BotPanel';
import SupportPanel from '../components/admin/SupportPanel';
import OrdersPanel from '../components/admin/OrdersPanel';
import MyProjectsPanel from '../components/admin/MyProjectsPanel';
import BoardsPanel from '../components/admin/BoardsPanel';
import PagesPanel from '../components/admin/PagesPanel';
import FirewallPanel from '../components/admin/FirewallPanel';
import LogsPanel from '../components/admin/LogsPanel';
import TranscriptsPanel from '../components/admin/TranscriptsPanel';
import SignIn from '../components/admin/SignIn';
import Gate from '../components/admin/Gate';
import { Notice } from '../components/admin/ui';
import GlobalSearch from '../components/admin/GlobalSearch';
import DeveloperPanel, { DEVELOPER_VIEWS } from '../components/admin/DeveloperPanel';
import GithubPanel, { GITHUB_VIEWS } from '../components/admin/GithubPanel';
import {
  fetchSession,
  signOut,
  fetchOverview,
  SIGNED_IN,
  SIGNED_OUT,
  UNAVAILABLE,
} from '../lib/admin';

const CHECKING = 'checking';

const SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    needs: 'overview.read',
    group: 'studio',
    blurb: 'traffic, services and the state of the box',
  },
  {
    id: 'boards',
    label: 'Boards',
    icon: SquareKanban,
    needs: ['boards.read', 'boards.own', 'boards.manage'],
    group: 'studio',
    blurb: 'project boards, cards and seats',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Footprints,
    needs: 'overview.read',
    group: 'studio',
    blurb: 'who visited, from where, over which window',
  },
  {
    id: 'api',
    label: 'API',
    icon: KeySquare,
    needs: 'api.keys',
    group: 'platform',
    blurb: 'your own keys, their alerts and usage',
  },
  {
    id: 'api-admin',
    label: 'API admin',
    icon: Activity,
    needs: 'api.read',
    group: 'platform',
    blurb: 'every key on the gateway, issued or revoked',
  },
  {
    id: 'shield',
    label: 'Shield',
    icon: ShieldHalf,
    needs: 'shield.read',
    group: 'platform',
    blurb: 'the signed ruleset customers pull',
  },
  {
    id: 'bot',
    label: 'Bot',
    icon: Bot,
    needs: 'bot.read',
    group: 'platform',
    blurb: 'the Discord bot, its modules and presence',
  },
  {
    id: 'pages',
    label: 'Pages',
    icon: Construction,
    needs: 'pages.manage',
    group: 'site',
    blurb: 'maintenance covers over public routes',
  },
  {
    id: 'firewall',
    label: 'Firewall',
    icon: BrickWall,
    needs: 'firewall.read',
    group: 'site',
    blurb: 'edge rules and what they turned away',
  },
  {
    id: 'transcripts',
    label: 'Transcripts',
    icon: FileSearch,
    needs: ['transcripts.read', 'transcripts.manage'],
    group: 'logs',
    blurb: 'every closed ticket, project and application, searchable by what was said',
  },
  {
    id: 'c2c',
    label: 'C2C',
    icon: ScrollText,
    needs: 'c2c.logs',
    group: 'logs',
    blurb: 'every swap, gift card and safety trip the exchange bot recorded',
  },
  {
    id: 'dev-health',
    label: 'Health',
    icon: HeartPulse,
    needs: 'developer.read',
    group: 'developer',
    blurb: 'services, timers, disk, certificate and backups, with anything wrong called out',
  },
  {
    id: 'dev-endpoints',
    label: 'Endpoints',
    icon: Gauge,
    needs: 'developer.read',
    group: 'developer',
    blurb: 'per-endpoint traffic, errors and latency, and which 404s are ours',
  },
  {
    id: 'dev-performance',
    label: 'Performance',
    icon: Zap,
    needs: 'developer.read',
    group: 'developer',
    blurb: 'what a real browser measures on five routes, against budget, run after run',
  },
  {
    id: 'dev-releases',
    label: 'Releases',
    icon: Rocket,
    needs: 'developer.read',
    group: 'developer',
    blurb: 'what is serving, what each deploy changed, and what you can roll back to',
  },
  {
    id: 'dev-reference',
    label: 'Reference',
    icon: BookMarked,
    needs: 'developer.read',
    group: 'developer',
    blurb: 'where everything lives on the box, the unit names, the logs and the commands',
  },
  {
    // Kept as 'github' rather than renamed to 'github-repositories': it is the
    // section this group has always opened on, and the hash is a link people
    // may already have.
    id: 'github',
    label: 'Repositories',
    icon: FolderGit2,
    needs: null,
    group: 'github',
    blurb: 'whether what is on main is actually running on this box',
  },
  {
    id: 'github-issues',
    label: 'Issues',
    icon: CircleDot,
    needs: null,
    group: 'github',
    blurb: 'what is open across the three repositories, and what each one says',
  },
  {
    id: 'github-pulls',
    label: 'Pull requests',
    icon: GitPullRequest,
    needs: null,
    group: 'github',
    blurb: 'the review queue oldest first, and every pull request ever raised',
  },
  {
    id: 'github-performance',
    label: 'Performance',
    icon: Gauge,
    needs: null,
    group: 'github',
    blurb: 'what CI says across the three, and what the review queue is costing',
  },
  {
    id: 'github-vitals',
    label: 'Site speed',
    icon: Timer,
    needs: null,
    group: 'github',
    blurb: 'what each release did to the site, and which commit to blame for it',
  },
  {
    id: 'github-tracking',
    label: 'Performance tracking',
    icon: Radar,
    needs: null,
    group: 'github',
    blurb: 'who has committed what, how many lines it was, and when they were doing it',
  },
  {
    id: 'github-security',
    label: 'Security',
    icon: ShieldCheck,
    needs: null,
    group: 'github',
    blurb: 'what is key-shaped in the code, what GitHub is warning about, and what the deploy refuses',
  },
  {
    id: 'github-org',
    label: 'Organisation',
    icon: Building2,
    needs: null,
    group: 'github',
    blurb: 'the health of all three at once, and what has been happening across them',
  },
  {
    id: 'github-people',
    label: 'People & access',
    icon: KeyRound,
    needs: null,
    group: 'github',
    blurb: 'who can reach which repository, at what level, and how to change it',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: Users,
    needs: 'users.read',
    group: 'people',
    blurb: 'people, roles and what each may reach',
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: Package,
    needs: 'orders.read',
    group: 'people',
    blurb: 'the order book, tracking and figures',
  },
  {
    id: 'support',
    label: 'Support',
    icon: LifeBuoy,
    needs: null,
    group: 'people',
    blurb: 'tickets, the team inbox and replies',
  },
  {
    id: 'my-projects',
    label: 'Your projects',
    icon: FolderOpen,
    needs: null,
    group: 'you',
    blurb: 'the projects you opened and the files released to you',
  },
  {
    id: 'account',
    label: 'Your account',
    icon: UserCircle,
    needs: null,
    group: 'you',
    blurb: 'your password, sign-ins and Discord link',
  },
];

// Groups the server hands out per account rather than per permission. Named
// here only so the nav can hide them; the server decides who is on the list.
const PRIVATE_GROUPS = ['github'];

const GROUPS = [
  { id: 'studio', label: 'Studio', icon: Compass },
  { id: 'platform', label: 'Platform', icon: Layers },
  { id: 'site', label: 'Site', icon: Globe },
  { id: 'logs', label: 'Logs', icon: Archive },
  { id: 'developer', label: 'Developer', icon: Terminal },
  { id: 'github', label: 'GitHub', icon: GitBranch },
  { id: 'people', label: 'People', icon: UsersRound },
  { id: 'you', label: 'You', icon: CircleUserRound },
];

function sectionFromHash() {
  if (typeof window === 'undefined') return 'overview';
  const raw = window.location.hash.replace('#', '').trim().split('/')[0];
  return SECTIONS.some((section) => section.id === raw) ? raw : 'overview';
}

function ViewSwitch({ asUser, onChange }) {
  return (
    <div
      className="inline-flex border border-[#282832] bg-[#0a0a0d]"
      role="group"
      aria-label="Which view of the panel to show"
    >
      {[
        [false, 'Admin', EyeOff],
        [true, 'User', Eye],
      ].map(([value, label, Icon]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={asUser === value}
          className={`tap inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide transition-colors ${
            asUser === value
              ? 'bg-purple-500/15 text-white'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {label}
        </button>
      ))}
    </div>
  );
}

const RAIL_KEY = 'amitista.admin.rail';

function readPinned() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_KEY) === 'open';
  } catch {
    return false;
  }
}

const NavItem = React.memo(function NavItem({
  section,
  shortcut,
  current,
  onPick,
  context,
  blurb,
  nested,
  order,
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={() => onPick(section.id)}
      title={`${section.label} — ${section.blurb}`}
      aria-current={current ? 'page' : undefined}
      aria-keyshortcuts={shortcut ?? undefined}
      data-current={current ? 'true' : undefined}
      style={order == null ? undefined : { '--i': order }}
      className={`tap rail-row group/item relative flex w-full items-center py-[7px] text-left text-[12.5px] font-medium tracking-[0.01em] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-purple-500/50 ${
        nested ? 'rail-kid' : 'transition-colors duration-150'
      } ${
        current
          ? 'bg-purple-500/[0.10] text-white'
          : 'text-neutral-500 hover:bg-white/[0.03] hover:text-neutral-200'
      }`}
    >
      <span
        aria-hidden="true"
        className="rail-edge absolute inset-y-0 left-0 w-[2px] bg-purple-500"
      />
      <span className="relative flex w-[54px] shrink-0 items-center">
        {nested && (
          <span aria-hidden="true" className="absolute inset-y-0 left-[27px] w-px bg-[#1f1f27]" />
        )}
        <span
          className={`relative flex w-full items-center ${nested ? 'pl-[31px]' : 'justify-center'}`}
        >
          <Icon
            className={`h-[13px] w-[13px] shrink-0 transition-colors duration-150 ${
              current ? 'text-purple-400' : 'text-neutral-600 group-hover/item:text-neutral-400'
            }`}
            strokeWidth={1.75}
          />
        </span>
      </span>
      <span className="rail-label min-w-0 flex-1 pr-3">
        <span className="rail-nudge block truncate">
          {context && <span className="font-normal text-neutral-600">{context} · </span>}
          {section.label}
        </span>
        {blurb && (
          <span className="mt-0.5 block truncate text-[11px] font-normal text-neutral-600">
            {section.blurb}
          </span>
        )}
      </span>
    </button>
  );
});

const GroupRow = React.memo(function GroupRow({ cluster, open, holds, onToggle }) {
  const Icon = cluster.icon;
  return (
    <button
      type="button"
      onClick={() => onToggle(cluster.id)}
      aria-expanded={open}
      title={`${cluster.label} — ${cluster.entries.length} sections`}
      className="tap rail-row group/group relative flex w-full items-center py-[9px] text-left transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-purple-500/50 hover:bg-white/[0.03]"
    >
      <span className="flex w-[54px] shrink-0 items-center justify-center">
        <Icon
          className={`h-[15px] w-[15px] shrink-0 transition-colors duration-150 ${
            holds ? 'text-purple-400' : 'text-neutral-500 group-hover/group:text-neutral-300'
          }`}
          strokeWidth={1.75}
        />
      </span>
      <span
        className={`rail-label flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.15em] ${
          holds ? 'text-neutral-300' : 'text-neutral-600 group-hover/group:text-neutral-400'
        }`}
      >
        <span className="rail-nudge block truncate transition-colors duration-150">
          {cluster.label}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className={`rail-label mr-3 h-3.5 w-3.5 shrink-0 text-neutral-700 transition-transform duration-200 ${
          open ? 'rotate-90' : ''
        }`}
        strokeWidth={2}
      />
    </button>
  );
});

function SectionList({ clusters, matches, needle, query, active, opened, onToggle, onPick }) {
  if (needle) {
    return matches.length ? (
      <div className="flex flex-col py-1">
        {matches.map((entry) => (
          <NavItem
            key={entry.section.id}
            section={entry.section}
            current={entry.section.id === active}
            blurb
            context={GROUPS.find((group) => group.id === entry.section.group)?.label}
            onPick={onPick}
          />
        ))}
      </div>
    ) : (
      <p className="rail-label px-3 py-3 text-[12px] font-normal text-neutral-600">
        Nothing here is called “{query.trim()}”.
      </p>
    );
  }

  return (
    <div className="flex flex-col py-1">
      {clusters.map((cluster) => {
        const open = cluster.id === opened;
        const holds = cluster.entries.some((entry) => entry.section.id === active);
        return (
          <div key={cluster.id} className="border-t border-[#17171d] first:border-t-0">
            <GroupRow cluster={cluster} open={open} holds={holds} onToggle={onToggle} />
            <div className="rail-kids" data-open={open ? 'true' : 'false'}>
              <div className="rail-kids-clip">
                <div className="pb-1.5">
                  {cluster.entries.map((entry, order) => (
                    <NavItem
                      key={entry.section.id}
                      section={entry.section}
                      shortcut={entry.index < 9 ? String(entry.index + 1) : null}
                      current={entry.section.id === active}
                      nested
                      order={order}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex w-full shrink-0 items-center border-b border-[#282832] py-3">
      <span className="flex w-[54px] shrink-0 items-center justify-center">
        <img
          src="/amitista-logo.png"
          alt=""
          width="20"
          height="20"
          className="h-5 w-5 shrink-0 select-none object-contain"
        />
      </span>
      <span className="rail-label truncate pr-3 text-[11px] font-bold tracking-[0.22em] text-white">
        AMITISTA
        <span className="ml-1.5 font-medium text-neutral-500">STUDIO</span>
      </span>
    </div>
  );
}

function Filter({ inputRef, query, onQuery, onFirst }) {
  return (
    <div className="flex w-full shrink-0 items-center border-b border-[#282832]">
      <span className="flex w-[54px] shrink-0 items-center justify-center">
        <Search className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={1.75} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onQuery('');
            inputRef.current?.blur();
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            onFirst();
          }
        }}
        placeholder="Find a section  /"
        aria-label="Find a section"
        className="rail-label w-full min-w-0 bg-transparent py-2.5 pr-3 text-[12px] font-normal text-neutral-200 outline-none placeholder-neutral-700"
      />
    </div>
  );
}

function Sidebar({ sections, active, onPick }) {
  const [pinned, setPinned] = React.useState(readPinned);
  const [query, setQuery] = React.useState('');
  const [drawer, setDrawer] = React.useState(false);


  const holding = sections.find((section) => section.id === active)?.group;
  const [opened, setOpened] = React.useState(holding);
  React.useEffect(() => {
    if (holding) setOpened(holding);
  }, [holding]);
  const toggle = React.useCallback((id) => {
    setOpened((current) => (current === id ? null : id));
  }, []);


  const railField = React.useRef(null);
  const drawerField = React.useRef(null);
  const railList = React.useRef(null);
  const drawerList = React.useRef(null);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, pinned ? 'open' : 'icons');
    } catch {}
  }, [pinned]);

  React.useEffect(() => {
    function jump(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!/^[1-9]$/.test(event.key)) return;
      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      const section = sections[Number(event.key) - 1];
      if (!section) return;
      event.preventDefault();
      onPick(section.id);
    }
    window.addEventListener('keydown', jump);
    return () => window.removeEventListener('keydown', jump);
  }, [sections, onPick]);


  React.useEffect(() => {
    function focus(event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setDrawer(true);
      window.requestAnimationFrame(() => {
        drawerField.current?.focus();
        railField.current?.focus();
      });
    }
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);

  React.useEffect(() => {
    for (const rail of [railList.current, drawerList.current]) {
      const current = rail?.querySelector('[data-current="true"]');
      if (!rail || !current) continue;
      const above = current.offsetTop < rail.scrollTop;
      const below = current.offsetTop + current.clientHeight > rail.scrollTop + rail.clientHeight;
      if (above || below) {
        rail.scrollTo({ top: Math.max(0, current.offsetTop - 48), behavior: 'smooth' });
      }
    }
  }, [active]);

  function walk(event) {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const forward = event.key === 'ArrowDown';
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (at + (forward ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  const clusters = React.useMemo(() => {
    const numbered = sections.map((section, index) => ({ section, index }));
    return GROUPS.map((group) => ({
      ...group,
      entries: numbered.filter((entry) => entry.section.group === group.id),
    })).filter((cluster) => cluster.entries.length > 0);
  }, [sections]);

  const needle = query.trim().toLowerCase();
  const matches = React.useMemo(
    () =>
      needle
        ? sections
            .map((section, index) => ({ section, index }))
            .filter(({ section }) =>
              `${section.label} ${section.id} ${section.blurb}`.toLowerCase().includes(needle),
            )
        : [],
    [sections, needle],
  );

  const shown = sections.find((section) => section.id === active);
  const where = GROUPS.find((group) => group.id === shown?.group)?.label;
  const Current = shown?.icon;


  const land = React.useCallback(
    (id) => {
      setQuery('');
      setDrawer(false);
      document.activeElement?.blur?.();
      onPick(id);
    },
    [onPick],
  );

  const first = React.useCallback(() => {
    if (matches[0]) land(matches[0].section.id);
  }, [matches, land]);

  const list = (
    <SectionList
      clusters={clusters}
      matches={matches}
      needle={needle}
      query={query}
      active={active}
      opened={opened}
      onToggle={toggle}
      onPick={land}
    />
  );

  return (
    <nav
      aria-label="Panel sections"
      className={`rail-slot w-full shrink-0 ${pinned ? 'lg:w-[240px]' : 'lg:w-[54px]'}`}
    >
      <div className="border border-[#282832] bg-[#0a0a0d] lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer((open) => !open)}
          aria-expanded={drawer}
          className="tap flex w-full items-center gap-2.5 px-3 py-3 text-left text-[12.5px] font-medium text-white transition-colors hover:bg-white/[0.03]"
        >
          <img
            src="/amitista-logo.png"
            alt=""
            width="18"
            height="18"
            className="h-[18px] w-[18px] shrink-0 select-none object-contain"
          />
          {Current && (
            <Current className="h-[15px] w-[15px] shrink-0 text-purple-400" strokeWidth={1.75} />
          )}
          <span className="min-w-0 flex-1 truncate">
            {where && <span className="font-normal text-neutral-600">{where} · </span>}
            {shown?.label ?? 'Sections'}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 ${
              drawer ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
          />
        </button>

        {drawer && (
          <div className="flex max-h-[60vh] w-full flex-col border-t border-[#282832]">
            <Filter inputRef={drawerField} query={query} onQuery={setQuery} onFirst={first} />
            <div ref={drawerList} onKeyDown={walk} className="rail-y min-h-0 flex-1">
              {list}
            </div>
          </div>
        )}
      </div>

      <div className="relative hidden lg:sticky lg:top-[88px] lg:block lg:h-[calc(100vh-112px)]">
        <div
          data-pinned={pinned ? 'true' : undefined}
          className={`rail-flyout absolute inset-y-0 left-0 z-40 overflow-hidden border border-[#282832] bg-[#0a0a0d] ${
            pinned ? 'w-[240px]' : 'w-[54px] hover:w-[240px] focus-within:w-[240px]'
          }`}
        >
          <div className="flex h-full w-[240px] flex-col">
            <Brand />
            <Filter inputRef={railField} query={query} onQuery={setQuery} onFirst={first} />

            <div ref={railList} onKeyDown={walk} className="rail-y min-h-0 flex-1">
              {list}
            </div>

            <button
              type="button"
              onClick={() => setPinned((open) => !open)}
              aria-pressed={pinned}
              title={pinned ? 'Let the rail close on its own again' : 'Keep the rail open'}
              className="tap flex w-full shrink-0 items-center border-t border-[#282832] py-2.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.03] hover:text-neutral-300"
            >
              <span className="flex w-[54px] shrink-0 items-center justify-center">
                {pinned ? (
                  <PanelLeftClose className="h-[15px] w-[15px]" strokeWidth={1.75} />
                ) : (
                  <PanelLeftOpen className="h-[15px] w-[15px]" strokeWidth={1.75} />
                )}
              </span>
              <span className="rail-label">{pinned ? 'Let it close' : 'Keep it open'}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function AdminPage() {
  const [state, setState] = React.useState(CHECKING);
  const [user, setUser] = React.useState(null);
  const [role, setRole] = React.useState(null);
  const [permissions, setPermissions] = React.useState([]);
  const [privateGroups, setPrivateGroups] = React.useState([]);
  const [viewerPermissions, setViewerPermissions] = React.useState([]);
  const [asUser, setAsUser] = React.useState(false);
  const [mustChange, setMustChange] = React.useState(false);
  const [configured, setConfigured] = React.useState(true);
  const [needsGate, setNeedsGate] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [section, setSection] = React.useState(sectionFromHash);
  const cancelled = React.useRef(false);

  const canPreview = permissions.includes('overview.read');
  const previewing = asUser && canPreview;
  const held = React.useMemo(
    () =>
      previewing ? permissions.filter((entry) => viewerPermissions.includes(entry)) : permissions,
    [previewing, permissions, viewerPermissions],
  );
  const seenAs = previewing ? 'viewer' : role;

  React.useEffect(() => {
    const previous = document.title;
    document.title = `Studio panel — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await fetchOverview();
    if (cancelled.current) return;
    if (result.expired) {
      setState(SIGNED_OUT);
      setUser(null);
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, []);

  const adopt = React.useCallback(
    (session) => {
      setUser(session.user);
      setRole(session.role ?? null);
      setPermissions(session.permissions ?? []);
      setViewerPermissions(session.viewerPermissions ?? []);
      setPrivateGroups(session.private ?? []);
      setAsUser(false);
      setMustChange(Boolean(session.mustChange));
      setState(SIGNED_IN);
      if (!session.mustChange && (session.permissions ?? []).includes('overview.read')) load();
    },
    [load],
  );

  React.useEffect(() => {
    cancelled.current = false;

    fetchSession().then((session) => {
      if (cancelled.current) return;
      setConfigured(session.configured);
      if (session.state === SIGNED_IN) {
        adopt(session);
      } else {
        setNeedsGate(Boolean(session.gate) && !session.gated);
        setState(session.state);
        setUser(null);
      }
    });

    return () => {
      cancelled.current = true;
    };
  }, [adopt]);

  React.useEffect(() => {
    function follow() {
      setSection(sectionFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  React.useEffect(() => {
    if (state !== SIGNED_IN || section !== 'overview' || mustChange) return undefined;
    if (!held.includes('overview.read')) return undefined;
    const poll = setInterval(load, 60000);
    return () => clearInterval(poll);
  }, [state, section, held, mustChange, load]);

  const gateAgain = React.useCallback(() => setNeedsGate(true), []);
  const gatePassed = React.useCallback(() => {
    setNeedsGate(false);
    window.requestAnimationFrame(() => document.getElementById('main')?.focus());
  }, []);

  const forget = React.useCallback(() => {
    setState(SIGNED_OUT);
    setUser(null);
    setRole(null);
    setPermissions([]);
    setData(null);
  }, []);

  async function leave() {
    await signOut();
    if (cancelled.current) return;
    forget();
  }

  function goTo(id, record) {
    if (typeof window !== 'undefined') {
      const trail = id === 'support' ? `#support/queue/${record}` : `#${id}/${record}`;
      window.history.replaceState(null, '', trail);
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    }
    setSection(id);
  }

  function pick(id, sub) {
    setSection(id);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}${sub ? `/${sub}` : ''}`);
    }
  }

  // A private group is hidden from everyone the server did not name, owners
  // included. An empty group also disappears from the nav on its own, so the
  // heading only ever shows for an account that can open something under it.
  const allowed = mustChange
    ? SECTIONS.filter((entry) => entry.id === 'account')
    : SECTIONS.filter(
        (entry) =>
          (!PRIVATE_GROUPS.includes(entry.group) || privateGroups.includes(entry.group)) &&
          (entry.needs === null || [entry.needs].flat().some((need) => held.includes(need))),
      );
  const current = allowed.some((entry) => entry.id === section)
    ? section
    : (allowed[0]?.id ?? 'account');

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none"
      >
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div
            className={`relative z-30 w-full flex flex-col items-center pb-16 sm:pb-24 px-4 sm:px-10 md:px-16 lg:px-20 ${
              state === SIGNED_OUT ? 'pt-20 sm:pt-24' : 'pt-24 sm:pt-32'
            }`}
          >
            {state === CHECKING && <div className="h-40" />}

            {state === UNAVAILABLE && (
              <div className="w-full max-w-[420px] border border-[#282832] bg-[#0a0a0d] p-8 text-left">
                <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                  The panel is not answering. It runs as its own service on the server — if it has
                  just been deployed, it may not be installed yet.
                </p>
              </div>
            )}

            {state === SIGNED_OUT && (
              <Reveal rise className="w-full flex justify-center">
                {needsGate ? (
                  <Gate onPassed={gatePassed} />
                ) : (
                  <SignIn onSignedIn={adopt} configured={configured} onGateExpired={gateAgain} />
                )}
              </Reveal>
            )}

            {state === SIGNED_IN && (
              <div className="w-full max-w-[1320px] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div>
                    <h1 className="text-[28px] sm:text-4xl font-normal text-white tracking-tight leading-none mb-2 sm:mb-3">
                      Studio panel
                    </h1>
                    <p className="text-[13px] text-neutral-400 font-normal">
                      Signed in as <span className="text-neutral-200">{user}</span>
                      {role ? ` · ${role}` : ''}.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0">
                    {!mustChange &&
                      (held.includes('orders.read') || held.includes('support.manage')) && (
                        <GlobalSearch onGo={goTo} />
                      )}
                    {canPreview && !mustChange && (
                      <ViewSwitch asUser={asUser} onChange={setAsUser} />
                    )}
                    {current === 'overview' && held.includes('overview.read') && (
                      <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="tap inline-flex items-center gap-2 whitespace-nowrap border border-[#282832] bg-[#0a0a0d] px-4 py-2.5 text-[12px] font-semibold text-neutral-300 tracking-wide hover:bg-[#111115] disabled:opacity-40 transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        {loading ? 'Refreshing…' : 'Refresh'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={leave}
                      className="tap inline-flex items-center gap-2 whitespace-nowrap border border-[#282832] bg-[#0a0a0d] px-4 py-2.5 text-[12px] font-semibold text-neutral-300 tracking-wide hover:bg-[#111115] transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                      Sign out
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
                  <Sidebar sections={allowed} active={current} onPick={pick} />

                  <div className="flex-1 min-w-0 flex flex-col">
                    {previewing && (
                      <div className="mb-6">
                        <Notice tone="amber" icon={Eye}>
                          This is the panel as a user account sees it. It only hides things from you
                          — the server still answers you as {role ?? 'yourself'}, and nothing has
                          changed for them.{' '}
                          <button
                            type="button"
                            onClick={() => setAsUser(false)}
                            className="underline underline-offset-2 hover:text-white transition-colors"
                          >
                            Back to the admin view.
                          </button>
                        </Notice>
                      </div>
                    )}

                    {mustChange && (
                      <div className="mb-6">
                        <Notice tone="amber">
                          You are still on the password this account was created with, and whoever
                          created it has seen that password. The rest of the panel stays closed
                          until you set your own below.
                        </Notice>
                      </div>
                    )}

                    {current === 'overview' &&
                      (data ? (
                        <div
                          className={`transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
                        >
                          <OverviewPanel data={data} permissions={held} role={seenAs} />
                        </div>
                      ) : (
                        <div className="border border-[#282832] bg-[#0a0a0d] px-6 py-8">
                          <p className="text-[13px] text-neutral-400 font-normal">
                            {loading ? 'Reading the server…' : 'No snapshot could be read.'}
                          </p>
                        </div>
                      ))}

                    {current === 'boards' && <BoardsPanel />}

                    {current === 'activity' && <ActivityPanel />}

                    {current === 'api' && <ApiPanel />}

                    {current === 'api-admin' && (
                      <ApiAdminPanel
                        canManage={held.includes('api.manage')}
                        canSeeHistory={held.includes('security.read')}
                        self={user}
                      />
                    )}

                    {current === 'shield' && (
                      <ShieldPanel canManage={held.includes('shield.manage')} />
                    )}

                    {current === 'bot' && <BotPanel canManage={held.includes('bot.manage')} />}

                    {current === 'transcripts' && <TranscriptsPanel permissions={held} />}

                    {current === 'c2c' && <LogsPanel />}

                    {current === 'pages' && <PagesPanel />}

                    {current === 'firewall' && <FirewallPanel />}

                    {DEVELOPER_VIEWS.includes(current) && <DeveloperPanel view={current} />}

                    {GITHUB_VIEWS.includes(current) && <GithubPanel view={current} />}

                    {current === 'accounts' && (
                      <AccountsPanel
                        canManage={held.includes('users.manage')}
                        canSeeActivity={held.includes('security.read')}
                        self={user}
                        onGoTo={pick}
                        onSignedOut={forget}
                      />
                    )}

                    {current === 'orders' && <OrdersPanel permissions={held} />}

                    {current === 'support' && <SupportPanel onGoTo={pick} permissions={held} />}

                    {current === 'my-projects' && <MyProjectsPanel />}

                    {current === 'account' && (
                      <AccountPanel
                        onGoTo={pick}
                        onPasswordChanged={() =>
                          fetchSession().then((session) => {
                            if (cancelled.current || session.state !== SIGNED_IN) return;
                            adopt(session);
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
