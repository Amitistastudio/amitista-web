const BASE = '/api/admin';
const TIMEOUT_MS = 10000;
const ART_TIMEOUT_MS = 30000;

export const SIGNED_OUT = 'signed-out';
export const SIGNED_IN = 'signed-in';
export const UNAVAILABLE = 'unavailable';

function timeout() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(TIMEOUT_MS)
    : undefined;
}

async function call(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      signal: timeout(),
      headers: { Accept: 'application/json', ...(options.headers ?? {}) },
      ...options,
    });
  } catch {
    return { ok: false, status: 0, body: {} };
  }

  let body = {};
  if (response.status !== 204) {
    body = await response.json().catch(() => ({}));
  }

  return { ok: response.ok, status: response.status, body };
}

function send(path, payload) {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
}

const UPLOAD_TIMEOUT_MS = 180000;

function callLong(path, payload) {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    signal:
      typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
        : undefined,
  });
}

function message(result, fallback) {
  if (result.status === 0) return 'The panel could not be reached.';
  if (typeof result.body.message === 'string' && result.body.message) return result.body.message;
  return fallback;
}

function unwrap(result, fallback) {
  if (result.ok) return result.body;
  throw new Error(message(result, fallback));
}

export async function fetchSession() {
  const result = await call('/session');
  if (!result.ok) return { state: UNAVAILABLE, user: null, configured: false, permissions: [] };
  if (!result.body.signedIn) {
    return {
      state: SIGNED_OUT,
      user: null,
      configured: result.body.configured !== false,
      google: Boolean(result.body.google),
      gate: Boolean(result.body.gate),
      gated: Boolean(result.body.gated),
      permissions: [],
    };
  }
  return {
    state: SIGNED_IN,
    user: result.body.user ?? null,
    role: result.body.role ?? null,
    permissions: result.body.permissions ?? [],
    viewerPermissions: result.body.viewerPermissions ?? [],
    private: result.body.private ?? [],
    mustChange: Boolean(result.body.mustChange),
    remembered: Boolean(result.body.remembered),
    configured: true,
  };
}

export async function passGate(verification) {
  const result = await send('/gate', { 'cf-turnstile-response': verification });
  if (result.ok) return true;
  throw new Error(message(result, 'That check could not be confirmed. Try it once more.'));
}

export async function signIn(username, password, code, remember = true) {
  const payload = code
    ? { username, password, code, remember }
    : { username, password, remember };
  const result = await send('/login', payload);
  if (result.ok) {
    return {
      user: result.body.user ?? username,
      role: result.body.role ?? null,
      permissions: result.body.permissions ?? [],
      viewerPermissions: result.body.viewerPermissions ?? [],
      private: result.body.private ?? [],
      mustChange: Boolean(result.body.mustChange),
      remembered: Boolean(result.body.remembered),
    };
  }
  if (result.body.needs === 'code') {
    const pending = new Error(message(result, 'Enter the code from your authenticator app.'));
    pending.needsCode = true;
    throw pending;
  }
  if (result.body.needs === 'gate') {
    const stale = new Error(message(result, 'That verification has expired.'));
    stale.needsGate = true;
    throw stale;
  }
  throw new Error(message(result, `Sign-in failed (${result.status}).`));
}

export const GOOGLE_START = `${BASE}/login/google/start`;

export function googleStartUrl(remember = true) {
  return remember ? `${GOOGLE_START}?remember=1` : GOOGLE_START;
}

const SIGNIN_NOTICES = {
  cancelled: 'That Google sign-in was cancelled.',
  unlinked: 'That Google account is not linked to any panel account.',
  barred: 'That account is not active. Ask whoever runs the panel.',
  locked: 'Too many failed attempts. Try again later.',
  busy: 'Too many attempts. Try again in a minute.',
  failed: 'That Google sign-in could not be completed.',
};

export function readSignInNotice(search) {
  const value = new URLSearchParams(search ?? '').get('signin');
  if (!value) return null;
  if (value === 'code') return { step: 'google-code' };
  if (value === 'ok') return { step: 'done' };
  if (value === 'gate') return { step: 'gate' };
  return { step: 'error', message: SIGNIN_NOTICES[value] ?? SIGNIN_NOTICES.failed };
}

export async function verifyGoogleCode(code) {
  const result = await send('/login/google/verify', { code });
  if (result.ok) {
    return {
      user: result.body.user ?? null,
      role: result.body.role ?? null,
      permissions: result.body.permissions ?? [],
      viewerPermissions: result.body.viewerPermissions ?? [],
      private: result.body.private ?? [],
      mustChange: Boolean(result.body.mustChange),
      remembered: Boolean(result.body.remembered),
    };
  }
  throw new Error(message(result, `Sign-in failed (${result.status}).`));
}

export async function linkGoogle(email, password) {
  return unwrap(await send('/account/google/link', { email, password }), 'Could not link that Google account.');
}

export async function unlinkGoogle(password) {
  return unwrap(await send('/account/google/unlink', { password }), 'Could not unlink that Google account.');
}

export async function clearGoogle(name) {
  return unwrap(await send('/users/google/clear', { name }), 'Could not clear that Google sign-in.');
}

export async function startDiscordLink(password) {
  return unwrap(await send('/account/discord/start', { password }), 'Could not start that link.');
}

export async function checkDiscordLink() {
  return unwrap(await send('/account/discord/check'), 'Could not check that link.');
}

export async function cancelDiscordLink() {
  return unwrap(await send('/account/discord/cancel'), 'Could not cancel that link.');
}

export async function unlinkDiscord(password) {
  return unwrap(
    await send('/account/discord/unlink', { password }),
    'Could not unlink that Discord account.',
  );
}

export const DISCORD_IMAGE = `${BASE}/account/discord/image`;

export async function fetchDiscordProfile() {
  return unwrap(await send('/account/discord/profile'), 'Could not read your Discord profile.');
}

export async function setDiscordNickname(nickname) {
  return unwrap(
    await send('/account/discord/nickname', { nickname }),
    'Could not change your nickname.',
  );
}

export async function setDiscordPrefs(prefs) {
  return unwrap(await send('/account/discord/prefs', { prefs }), 'Could not save those notices.');
}

export const USER_DISCORD_IMAGE = `${BASE}/users/discord/image`;

export function accountPictureUrl(stamp) {
  return `${BASE}/account/picture${stamp ? `?v=${encodeURIComponent(stamp)}` : ''}`;
}

export function userPictureUrl(name, stamp) {
  const version = stamp ? `&v=${encodeURIComponent(stamp)}` : '';
  return `${BASE}/users/picture?name=${encodeURIComponent(name)}${version}`;
}

export async function setAccountPicture(data) {
  const result = await call('/account/picture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal:
      typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(ART_TIMEOUT_MS)
        : undefined,
  });
  if (result.status === 413) throw new Error('That image is too large to send.');
  return unwrap(result, 'That picture could not be saved.').picture;
}

export async function removeAccountPicture() {
  return unwrap(await send('/account/picture/delete'), 'That picture could not be removed.').picture;
}

export async function clearUserPicture(name) {
  return unwrap(await send('/users/picture/clear', { name }), 'That picture could not be removed.')
    .picture;
}

export async function fetchUserDiscordProfile(name) {
  return unwrap(
    await send('/users/discord/profile', { name }),
    'Could not read that Discord profile.',
  );
}

export async function clearDiscord(name) {
  return unwrap(await send('/users/discord/clear', { name }), 'Could not clear that Discord link.');
}

export async function fetchSupport() {
  return unwrap(await call('/account/support'), 'Could not read your tickets.');
}

export async function fetchSupportTicket(id) {
  return unwrap(
    await call(`/account/support/ticket?id=${encodeURIComponent(id)}`),
    'Could not read that ticket.',
  );
}

export async function openSupportTicket(payload) {
  return unwrap(await send('/account/support/open', payload), 'Could not open that ticket.');
}

export async function replyToSupportTicket(id, body) {
  return unwrap(await send('/account/support/reply', { id, body }), 'Could not send that reply.');
}

export async function closeSupportTicket(id, reason) {
  return unwrap(await send('/account/support/close', { id, reason }), 'Could not close that ticket.');
}

export async function fetchSupportQueue() {
  return unwrap(await call('/support/queue'), 'Could not read the ticket queue.');
}

export async function fetchSupportQueueTicket(id) {
  return unwrap(
    await call(`/support/queue/ticket?id=${encodeURIComponent(id)}`),
    'Could not read that ticket.',
  );
}

export async function replyToQueueTicket(id, body) {
  return unwrap(await send('/support/queue/reply', { id, body }), 'Could not send that reply.');
}

export async function claimQueueTicket(id) {
  return unwrap(await send('/support/queue/claim', { id }), 'Could not claim that ticket.');
}

export async function closeQueueTicket(id, reason) {
  return unwrap(await send('/support/queue/close', { id, reason }), 'Could not close that ticket.');
}

export async function setQueueTicketStatus(id, status) {
  return unwrap(await send('/support/queue/status', { id, status }), 'Could not change the status.');
}

export async function setQueueTicketPriority(id, priority) {
  return unwrap(
    await send('/support/queue/priority', { id, priority }),
    'Could not change the priority.',
  );
}

export async function fetchOrders() {
  return unwrap(await call('/orders'), 'Could not read the order book.');
}

export async function fetchOrderStats() {
  return unwrap(await call('/orders/stats'), 'Could not read the order figures.');
}

export async function fetchOrder(id) {
  return unwrap(
    await call(`/orders/order?id=${encodeURIComponent(id)}`),
    'Could not read that project.',
  );
}

export async function fetchOrderThread(id) {
  return unwrap(
    await call(`/orders/thread?id=${encodeURIComponent(id)}`),
    'Could not read that project channel.',
  );
}

export async function replyToOrder(id, body) {
  return unwrap(await send('/orders/reply', { id, body }), 'Could not send that reply.');
}

export async function claimOrder(id) {
  return unwrap(await send('/orders/claim', { id }), 'Could not claim that project.');
}

export async function closeOrder(id, reason) {
  return unwrap(await send('/orders/close', { id, reason }), 'Could not close that project.');
}

export async function setOrderStage(id, stage) {
  return unwrap(await send('/orders/stage', { id, stage }), 'Could not move that project.');
}

export async function setOrderPriority(id, priority) {
  return unwrap(
    await send('/orders/priority', { id, priority }),
    'Could not change the priority.',
  );
}

export async function editOrder(id, fields) {
  return unwrap(await send('/orders/edit', { id, fields }), 'Could not save those details.');
}

export async function addOrderNote(id, body, shared) {
  return unwrap(await send('/orders/note', { id, body, shared }), 'Could not save that note.');
}

export async function removeOrderNote(id, note) {
  return unwrap(await send('/orders/note/remove', { id, note }), 'Could not remove that note.');
}

export async function shareOrderNote(id, note, on) {
  return unwrap(await send('/orders/note/share', { id, note, on }), 'Could not change that note.');
}

export async function setOrderShared(id, fields) {
  return unwrap(await send('/orders/share', { id, fields }), 'Could not change what is shared.');
}

export async function setOrderTracking(id, on) {
  return unwrap(await send('/orders/tracking', { id, on }), 'Could not change tracking.');
}

export async function recodeOrder(id) {
  return unwrap(await send('/orders/recode', { id }), 'Could not issue a new code.');
}

export async function setOrderVisibility(id, visibility) {
  return unwrap(
    await send('/orders/visibility', { id, visibility }),
    'Could not change who can see it.',
  );
}

export async function setOrderCustom(id, fields) {
  return unwrap(await send('/orders/custom', { id, fields }), 'Could not save those fields.');
}

export async function setOrderLinks(id, links) {
  return unwrap(await send('/orders/link', { id, links }), 'Could not save those links.');
}

export async function setOrderWorkflow(id, workflow) {
  return unwrap(await send('/orders/workflow', { id, workflow }), 'Could not change the workflow.');
}

export async function fetchWorkflows() {
  return unwrap(await call('/orders/workflows'), 'Could not read the workflows.');
}

export async function saveWorkflow(workflow) {
  return unwrap(await send('/orders/workflow/save', { workflow }), 'Could not save that workflow.');
}

export async function deleteWorkflow(id) {
  return unwrap(await send('/orders/workflow/remove', { id }), 'Could not remove that workflow.');
}

export async function fetchProjectFields() {
  return unwrap(await call('/orders/fields'), 'Could not read the project fields.');
}

export async function saveProjectField(field) {
  return unwrap(await send('/orders/field/save', { field }), 'Could not save that field.');
}

export async function deleteProjectField(key) {
  return unwrap(await send('/orders/field/remove', { key }), 'Could not remove that field.');
}

export async function lookUpProject(query) {
  return unwrap(
    await call(`/orders/lookup?q=${encodeURIComponent(query)}`),
    'Nothing answers to that.',
  );
}

export async function searchEverything(query) {
  return unwrap(await call(`/search?q=${encodeURIComponent(query)}`), 'Could not search.');
}

export async function fetchOrderPulse() {
  const result = await call('/orders/pulse');
  if (!result.ok) throw new Error(message(result, 'Could not read the live feed.'));
  return result.body;
}

export async function hideMyProject(id, hidden) {
  return unwrap(
    await send('/projects/mine/hide', { id, hidden }),
    hidden ? 'That project could not be hidden.' : 'That project could not be shown again.',
  );
}

export async function fetchProjectFiles(id) {
  return unwrap(
    await call(`/projects/files?id=${encodeURIComponent(id)}`),
    'Could not read the files.',
  );
}

export async function addProjectFile(payload) {
  const result = await callLong('/projects/files/add', payload);
  if (result.status === 413) throw new Error('That file is too large to send.');
  return unwrap(result, 'Could not add that file.');
}

export async function addProjectFileVersion(payload) {
  const result = await callLong('/projects/files/version', payload);
  if (result.status === 413) throw new Error('That file is too large to send.');
  return unwrap(result, 'Could not add that version.');
}

export async function editProjectFile(payload) {
  return unwrap(await send('/projects/files/edit', payload), 'Could not change that file.');
}

export async function removeProjectFile(file) {
  return unwrap(await send('/projects/files/remove', { file }), 'Could not remove that file.');
}

export function projectFileUrl(file, version) {
  const query = version ? `&v=${encodeURIComponent(version)}` : '';
  return `${BASE}/projects/file?file=${encodeURIComponent(file)}${query}`;
}

export async function fetchProjectLedger(id) {
  return unwrap(
    await call(`/projects/ledger?id=${encodeURIComponent(id)}`),
    'Could not read the activity log.',
  );
}

export async function fetchMyProjects() {
  return unwrap(await call('/projects/mine'), 'Could not read your projects.');
}

export async function fetchMyProjectFiles(project) {
  return unwrap(
    await call(`/projects/mine/files?id=${encodeURIComponent(project)}`),
    'Could not read those files.',
  );
}

export const ORDER_VISIBILITY = [
  {
    value: 'public',
    label: 'Public',
    note: 'Anyone holding the project ID can see the safe status view.',
  },
  {
    value: 'client',
    label: 'Client limited',
    note: 'Only the client, using the tracking code you gave them.',
  },
  { value: 'private', label: 'Private', note: 'Studio only — no code and no ID work.' },
];

export const ORDER_VISIBILITY_TONE = {
  public: 'amber',
  client: 'purple',
  private: 'neutral',
};

export const FILE_ACCESS = [
  { value: 'studio', label: 'Studio only', note: 'Nobody outside the team can see it.' },
  { value: 'client', label: 'The client', note: 'The person who opened the project.' },
  { value: 'named', label: 'Named people only', note: 'Only the accounts you list below.' },
];

export const FIELD_KINDS = [
  { value: 'text', label: 'Short text' },
  { value: 'long', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'money', label: 'Money' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Pick one' },
  { value: 'url', label: 'Link' },
  { value: 'toggle', label: 'Yes / no' },
];

export const STAGE_TONES = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'reading', label: 'Being looked at' },
  { value: 'sent', label: 'With the client' },
  { value: 'building', label: 'Being built' },
  { value: 'done', label: 'Finished' },
];

export const LEDGER_LABELS = {
  'file.add': 'File added',
  'file.version': 'New version',
  'file.edit': 'File changed',
  'file.remove': 'File removed',
  'file.download': 'File downloaded',
  'file.purge': 'Files purged',
};

export const ORDER_STAGES = [
  { value: 'new', label: 'New inquiry' },
  { value: 'review', label: 'In review' },
  { value: 'proposal', label: 'Proposal sent' },
  { value: 'build', label: 'In development' },
  { value: 'delivered', label: 'Delivered' },
];

export const ORDER_HOLDS = [
  { value: 'hold', label: 'On hold' },
  { value: 'awaiting', label: 'Awaiting client' },
  { value: 'declined', label: 'Declined' },
];

export const ORDER_PRIORITY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const ORDER_STAGE_TONE = {
  new: 'amber',
  review: 'purple',
  proposal: 'amber',
  build: 'purple',
  delivered: 'green',
  hold: 'amber',
  awaiting: 'amber',
  declined: 'rose',
};

export const ORDER_SHARE_LABELS = {
  brief: 'The brief',
  budget: 'Budget',
  deadline: 'Timeline',
  pages: 'Scope',
  refs: 'Reference links',
  priority: 'Priority',
  lead: 'Who is leading it',
};

export const ORDER_FIELD_LABELS = {
  name: 'Project name',
  brief: 'The brief',
  deadline: 'Timeline',
  budget: 'Budget',
  pages: 'Scope',
  refs: 'Reference links',
};

export const ORDER_EVENT_LABELS = {
  opened: 'Opened',
  claimed: 'Lead assigned',
  released: 'Lead stepped off',
  stage: 'Stage moved',
  held: 'Put on hold',
  priority: 'Priority changed',
  edited: 'Details edited',
  shared: 'Sharing changed',
  closed: 'Closed',
  retired: 'Channel deleted',
  recoded: 'New tracking code',
  workflow: 'Workflow changed',
  visibility: 'Visibility changed',
  linked: 'Links changed',
  invoiced: 'Invoice issued',
  announced: 'The client was told',
  binned: 'Moved to the bin',
  restored: 'Restored from the bin',
  noted: 'Note added',
  unnoted: 'Note removed',
  'tracking-on': 'Tracking switched on',
  'tracking-off': 'Tracking switched off',
};

export const SUPPORT_STAGES = [
  { value: 'new', label: 'Awaiting staff' },
  { value: 'active', label: 'In progress' },
  { value: 'waiting', label: 'Waiting on them' },
  { value: 'resolved', label: 'Resolved' },
];

export const SUPPORT_PRIORITY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const SEEN_KEY = 'amitista.support.seen';

export function readSeenSupport() {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function markSeenSupport(id) {
  try {
    const seen = readSeenSupport();
    seen[id] = Date.now();
    const ids = Object.keys(seen);
    if (ids.length > 200) {
      ids.sort((a, b) => seen[a] - seen[b]);
      for (const old of ids.slice(0, ids.length - 200)) delete seen[old];
    }
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    return;
  }
}

export const SUPPORT_STAGE_TONE = {
  new: 'amber',
  active: 'purple',
  waiting: 'amber',
  resolved: 'green',
  review: 'purple',
  proposal: 'amber',
  build: 'purple',
  delivered: 'green',
};

export const SUPPORT_PRIORITY_TONE = {
  low: 'neutral',
  normal: 'neutral',
  high: 'amber',
  urgent: 'rose',
};

export function formatMs(ms) {
  return ms ? formatStamp(new Date(ms).toISOString()) : '—';
}

export function formatAgoMs(ms) {
  return ms ? formatAgo(new Date(ms).toISOString()) : 'never';
}

export async function signOut() {
  await send('/logout');
}

export async function fetchOverview() {
  const result = await call('/overview');
  if (result.status === 401) return { expired: true, data: null };
  if (!result.ok) return { expired: false, data: null };
  return { expired: false, data: result.body };
}

export async function fetchDeveloper() {
  return unwrap(await call('/developer'), 'Could not read the developer snapshot.');
}

export async function fetchGithubRepositories() {
  return unwrap(await call('/github/repositories'), 'Could not read the repository snapshot.');
}

export async function fetchGithubReview(repo, number) {
  return unwrap(
    await call(`/github/review?repo=${encodeURIComponent(repo)}&number=${encodeURIComponent(number)}`),
    'Could not get a reading of that pull request.',
  );
}

export function githubAvatarUrl(login) {
  return `${BASE}/github/avatar?login=${encodeURIComponent(login)}`;
}

export async function queueGithubAccess(repo, login, permission) {
  return unwrap(
    await send('/github/access', { repo, login, permission }),
    'Could not ask for that access change.',
  );
}

export async function queueGithubRevoke(repo, login) {
  return unwrap(
    await send('/github/access/remove', { repo, login }),
    'Could not ask for that access to be removed.',
  );
}

export async function queueGithubInviteCancel(repo, invite) {
  return unwrap(
    await send('/github/access/invite/cancel', { repo, invite }),
    'Could not ask for that invitation to be cancelled.',
  );
}

export async function fetchAccount() {
  return unwrap(await call('/account'), 'Could not read your account.');
}

export async function fetchAccountActivity() {
  return unwrap(await call('/account/activity'), 'Could not read your activity.');
}

export async function changeOwnPassword(current, password) {
  return unwrap(await send('/account/password', { current, password }), 'Could not change the password.');
}

export async function fetchUsers() {
  return unwrap(await call('/users'), 'Could not read the accounts.');
}

export async function saveRole(role, permissions) {
  return unwrap(await send('/roles/save', { role, permissions }), 'Could not save that role.');
}

export async function deleteRole(role) {
  return unwrap(await send('/roles/delete', { role }), 'Could not remove that role.');
}

export async function createUser(payload) {
  return unwrap(await send('/users/create', payload), 'Could not create the account.');
}

export async function updateUser(payload) {
  return unwrap(await send('/users/update', payload), 'Could not update the account.');
}

export async function resetUserPassword(name, password, mustChange = true) {
  const payload = password ? { name, password, mustChange } : { name };
  return unwrap(await send('/users/password', payload), 'Could not reset the password.');
}

export async function deleteUser(name) {
  return unwrap(await send('/users/delete', { name }), 'Could not remove the account.');
}

export async function startTwoFactor() {
  return unwrap(await send('/account/2fa/start'), 'Could not start the setup.');
}

export async function confirmTwoFactor(code) {
  return unwrap(await send('/account/2fa/confirm', { code }), 'Could not turn two-step on.');
}

export async function disableTwoFactor(password, code) {
  return unwrap(await send('/account/2fa/disable', { password, code }), 'Could not turn two-step off.');
}

export async function clearTwoFactor(name) {
  return unwrap(await send('/users/2fa/clear', { name }), 'Could not clear their two-step.');
}

export async function signOutUser(name) {
  return unwrap(await send('/users/sign-out', { name }), 'Could not end their sessions.');
}

export async function fetchSecurity() {
  return unwrap(await call('/security'), 'Could not read the activity.');
}

export async function revokeAllSessions() {
  const result = await send('/sessions/revoke-all');
  if (!result.ok) throw new Error(message(result, 'Could not end the sessions.'));
  return true;
}

export async function fetchApiStats() {
  return unwrap(await call('/api-stats'), 'Could not read the API statistics.');
}

export async function fetchTraffic(window) {
  return unwrap(
    await call(`/traffic?window=${encodeURIComponent(window ?? '24h')}`),
    'Could not read the traffic history.',
  );
}

export async function fetchAnalytics(window) {
  return unwrap(
    await call(`/analytics?window=${encodeURIComponent(window ?? '24h')}`),
    'Could not read the visitor figures.',
  );
}

export async function fetchKeyUsage(id, window) {
  return unwrap(
    await call(`/key-usage?id=${encodeURIComponent(id)}&window=${encodeURIComponent(window ?? '24h')}`),
    'Could not read that key’s usage.',
  );
}

export async function fetchBrands() {
  return unwrap(await call('/brands'), 'Could not read the brands.');
}

export async function saveBrand(payload) {
  return unwrap(await send('/brands/save', payload), 'Could not save that brand.');
}

export async function deleteBrand(slug) {
  return unwrap(await send('/brands/delete', { slug }), 'Could not remove that brand.');
}

export async function publishBrands() {
  return unwrap(await send('/brands/publish'), 'Could not publish the brands.');
}

export async function fetchShieldInstalls() {
  return unwrap(await call('/shield/installs'), 'Could not read the installs.');
}

export async function fetchBot() {
  return unwrap(await call('/bot'), 'Could not reach the bot.');
}

export async function setBotPresence(text, emoji) {
  return unwrap(await send('/bot/presence', { text, emoji: emoji ?? '' }), 'Could not set the status.');
}

export async function clearBotPresence() {
  return unwrap(await send('/bot/presence', { clear: true }), 'Could not clear the status.');
}

export async function restartBot(reason) {
  return unwrap(await send('/bot/restart', { reason: reason ?? '' }), 'Could not restart the bot.');
}

export async function fetchPages() {
  return unwrap(await call('/pages'), 'Could not read the page covers.');
}

export async function coverPage(path, mode, message, until, tag) {
  return unwrap(
    await send('/pages/cover', {
      path,
      mode,
      message: message ?? '',
      until: until ?? '',
      tag: tag ?? '',
    }),
    'Could not cover that page.',
  );
}

export async function reopenPage(path) {
  return unwrap(await send('/pages/reopen', { path }), 'Could not reopen that page.');
}

export async function fetchFirewall() {
  return unwrap(await call('/firewall'), 'Could not read the firewall.');
}

export async function saveFirewallRule(rule) {
  const result = await send('/firewall/rule', rule);
  if (result.ok) return result.body;
  const refused = new Error(message(result, 'Could not save that rule.'));
  refused.status = result.status;
  throw refused;
}

export async function deleteFirewallRule(id) {
  return unwrap(await send('/firewall/rule/delete', { id }), 'Could not remove that rule.');
}

export async function setFirewallSettings(settings) {
  return unwrap(await send('/firewall/settings', settings), 'Could not change the firewall.');
}

export async function restageFirewall() {
  return unwrap(await send('/firewall/restage', {}), 'Could not rewrite the edge config.');
}

export function formatUptimeMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export async function fetchShield() {
  return unwrap(await call('/shield'), 'Could not read the Shield state.');
}

export async function setShieldMode(mode) {
  return unwrap(await send('/shield/mode', { mode }), 'Could not change the mode.');
}

export async function clearShieldFlags() {
  return unwrap(await send('/shield/clear'), 'Could not clear the flags.');
}

export async function runShieldSelfTest() {
  return unwrap(await send('/shield/selftest'), 'Could not run the self-test.');
}

export async function evaluateShield(scenario, input) {
  return unwrap(await send('/shield/evaluate', { scenario, input }), 'Could not evaluate that.');
}

export async function setShieldPolicy(id, mode, paths, note) {
  return unwrap(
    await send('/shield/policy', { id, mode, paths: paths ?? [], note: note ?? '' }),
    'Could not change that rule.',
  );
}

export async function fetchKeys() {
  return unwrap(await call('/keys'), 'Could not read your keys.');
}

export async function fetchTokens() {
  return unwrap(await call('/tokens'), 'Could not read the keys.');
}

export async function fetchKeyEvents() {
  return unwrap(await call('/key-events'), 'Could not read the key activity.');
}

export async function saveKeyHook(payload) {
  return unwrap(await send('/keys/webhook', payload), 'Could not save that address.');
}

export async function testKeyHook() {
  return unwrap(await send('/keys/webhook/test'), 'Could not send the test.');
}

export async function deleteKeyHook() {
  return unwrap(await send('/keys/webhook/delete'), 'Could not remove that address.');
}

export async function saveEmbedHook(payload) {
  return unwrap(await send('/keys/embed', payload), 'Could not save that embed.');
}

export async function testEmbedHook() {
  return unwrap(await send('/keys/embed/test'), 'Could not send the test.');
}

export async function deleteEmbedHook() {
  return unwrap(await send('/keys/embed/delete'), 'Could not remove that embed.');
}

export async function previewEmbedHook(template) {
  return unwrap(await send('/keys/embed/preview', { template }), 'Could not draw that embed.');
}

function keyRoutes(mine) {
  const base = mine ? '/keys' : '/tokens';
  return {
    create: `${base}/create`,
    update: `${base}/update`,
    rotate: `${base}/rotate`,
    revoke: `${base}/revoke`,
    restore: `${base}/restore`,
    remove: `${base}/delete`,
  };
}

export async function createKey(payload, mine = true) {
  return unwrap(await send(keyRoutes(mine).create, payload), 'Could not create the key.');
}

export async function updateKey(id, changes, mine = true) {
  return unwrap(await send(keyRoutes(mine).update, { id, ...changes }), 'Could not change the key.');
}

export async function rotateKey(id, mine = true) {
  return unwrap(await send(keyRoutes(mine).rotate, { id }), 'Could not rotate the key.');
}

export async function revokeKey(id, mine = true) {
  return unwrap(await send(keyRoutes(mine).revoke, { id }), 'Could not revoke the key.');
}

export async function restoreKey(id, mine = true) {
  return unwrap(await send(keyRoutes(mine).restore, { id }), 'Could not restore the key.');
}

export async function deleteKey(id, mine = true) {
  return unwrap(await send(keyRoutes(mine).remove, { id }), 'Could not remove the key.');
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

export function formatCount(value) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB');
}

export function formatStamp(value) {
  if (typeof value !== 'string' || !value) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function formatAgo(value) {
  if (typeof value !== 'string' || !value) return 'never';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  const seconds = Math.round((Date.now() - parsed) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const SYSTEMD_STAMP = /^[A-Za-z]{3}\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(?:UTC|GMT)$/;

export function formatUptime(value) {
  if (typeof value !== 'string' || !value) return null;
  const match = SYSTEMD_STAMP.exec(value.trim());
  if (!match) return null;
  const started = Date.parse(`${match[1]}T${match[2]}Z`);
  if (Number.isNaN(started)) return null;
  const minutes = Math.floor((Date.now() - started) / 60000);
  if (minutes < 0) return null;
  if (minutes < 60) return `up ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `up ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `up ${days}d ${hours % 24}h`;
}

export function shareOf(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

export function releaseLabel(name) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(name ?? '');
  if (!match) return name ?? '—';
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute} UTC`;
}

export const PERMISSION_LABELS = {
  'overview.read': 'See the dashboard',
  'releases.read': 'See releases',
  'services.read': 'See services',
  'security.read': 'See sign-ins and lockouts',
  'users.read': 'See accounts',
  'users.manage': 'Create and change accounts',
  'api.keys': 'Hold their own API keys',
  'api.read': 'See API statistics',
  'api.manage': 'Manage everyone’s API keys',
  'shield.read': 'See Shield flags and rules',
  'shield.manage': 'Change the Shield mode and clear flags',
  'bot.read': 'See the bot, its queues and its settings',
  'bot.manage': 'Change the bot, moderate and restart it',
  'support.manage': 'Answer the support queue',
  'orders.read': 'See the order book, its projects and figures',
  'orders.manage': 'Move projects, edit them and share tracking',
  'orders.files': 'Add, version and withdraw purchased project files',
  'pages.manage': 'Cover site pages for maintenance and reopen them',
  'firewall.read': 'See the firewall rules and what they turned away',
  'firewall.manage': 'Change the firewall rules',
  'boards.read': 'See the project boards',
  'boards.own': 'Make their own boards, and run the ones they are on',
  'boards.manage': 'Make and change boards, cards and seats',
  'c2c.logs': 'Read the exchange bot’s logs',
  'transcripts.read': 'Search and read archived transcripts',
  'transcripts.manage': 'Delete an archived transcript for good',
  'developer.read': 'See the developer group — health, endpoints, performance and releases',
  'github.read': 'See the GitHub group — repositories, issues, pull requests and what is moving',
  'github.security': 'See what the scanners and the deploy are warning about in the code',
};

export const PERMISSION_GROUPS = [
  { id: 'panel', label: 'The panel', match: /^(overview|releases|services)\./ },
  { id: 'boards', label: 'Boards', match: /^boards\./ },
  { id: 'api', label: 'API', match: /^api\./ },
  { id: 'shield', label: 'Shield', match: /^shield\./ },
  { id: 'bot', label: 'Bot', match: /^bot\./ },
  { id: 'pages', label: 'Pages', match: /^pages\./ },
  { id: 'firewall', label: 'Firewall', match: /^firewall\./ },
  { id: 'accounts', label: 'Accounts', match: /^users\./ },
  { id: 'support', label: 'Support', match: /^support\./ },
  { id: 'orders', label: 'Projects & orders', match: /^orders\./ },
  { id: 'security', label: 'Security', match: /^security\./ },
  { id: 'c2c', label: 'Exchange bot', match: /^c2c\./ },
  { id: 'transcripts', label: 'Transcripts', match: /^transcripts\./ },
  { id: 'developer', label: 'Developer', match: /^developer\./ },
  { id: 'github', label: 'GitHub', match: /^github\./ },
];

export const PERMISSION_LEVELS = {
  see: { id: 'see', label: 'See', blurb: 'Reads the screen. Changes nothing.' },
  own: { id: 'own', label: 'Their own', blurb: 'Acts, but only on what they made or hold.' },
  change: { id: 'change', label: 'Change', blurb: 'Acts on it for everybody.' },
};

export const PERMISSION_LEVEL_ORDER = ['see', 'own', 'change'];

const PERMISSION_OWN_SCOPED = ['api.keys', 'boards.own'];

export function permissionLevel(permission) {
  if (PERMISSION_OWN_SCOPED.includes(permission)) return 'own';
  return String(permission ?? '').endsWith('.manage') ? 'change' : 'see';
}

export const PERMISSION_SHORT = {
  'overview.read': 'Dashboard',
  'releases.read': 'Releases',
  'services.read': 'Services',
  'security.read': 'Sign-ins',
  'users.read': 'See accounts',
  'users.manage': 'Create and change',
  'api.keys': 'Own keys',
  'api.read': 'Statistics',
  'api.manage': 'Everyone’s keys',
  'shield.read': 'See',
  'shield.manage': 'Change',
  'bot.read': 'See',
  'bot.manage': 'Change',
  'support.manage': 'Answer tickets',
  'orders.read': 'See',
  'orders.manage': 'Change',
  'orders.files': 'Files',
  'pages.manage': 'Cover pages',
  'firewall.read': 'See',
  'firewall.manage': 'Change',
  'boards.read': 'See every board',
  'boards.own': 'Own boards',
  'boards.manage': 'Change every board',
  'developer.read': 'Developer group',
  'github.read': 'GitHub group',
  'github.security': 'Scanners and alerts',
};

export function permissionShort(permission) {
  return PERMISSION_SHORT[permission] ?? PERMISSION_LABELS[permission] ?? permission;
}

export const PERMISSION_NEEDS = {
  'users.manage': ['users.read'],
  'api.manage': ['api.read'],
  'shield.manage': ['shield.read'],
  'bot.manage': ['bot.read'],
  'orders.manage': ['orders.read'],
  'orders.files': ['orders.read'],
  'firewall.manage': ['firewall.read'],
  'github.security': ['github.read'],
};

export const PERMISSION_INCLUDES = {
  'api.manage': ['api.keys'],
  'boards.manage': ['boards.read', 'boards.own'],
};

const PERMISSION_OWN_NOUNS = {
  'api.keys': 'API keys',
  'boards.own': 'boards',
};

export function permissionArea(permission) {
  return PERMISSION_GROUPS.find((group) => group.match.test(permission))?.label ?? 'Other';
}

export function permissionNeeds(permission) {
  return PERMISSION_NEEDS[permission] ?? [];
}

export function permissionIncludes(permission) {
  return PERMISSION_INCLUDES[permission] ?? [];
}

function listWords(items, cap = 3) {
  const kept = items.slice(0, cap);
  const rest = items.length - kept.length;
  if (rest > 0) return `${kept.join(', ')} and ${rest} more`;
  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`;
}

export function describeAccess(held, total) {
  const granted = Array.isArray(held) ? held : [];
  if (granted.length === 0) return 'Nothing yet — this role opens no part of the panel.';
  if (total && granted.length >= total) return 'Everything the panel has, in every area.';

  const areaOf = permissionArea;
  const areas = (level) => [
    ...new Set(
      granted.filter((permission) => permissionLevel(permission) === level).map(areaOf),
    ),
  ];

  const own = granted
    .filter((permission) => permissionLevel(permission) === 'own')
    .map((permission) => PERMISSION_OWN_NOUNS[permission] ?? areaOf(permission).toLowerCase());

  const said = [];
  const seen = areas('see');
  const changed = areas('change');
  if (seen.length) said.push(`Reads ${listWords(seen)}.`);
  if (changed.length) said.push(`Changes ${listWords(changed)}.`);
  if (own.length) said.push(`Their own ${listWords(own)}.`);
  return said.join(' ');
}

export function groupPermissions(held) {
  const granted = Array.isArray(held) ? held : [];
  const groups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: granted.filter((permission) => group.match.test(permission)),
  })).filter((group) => group.permissions.length > 0);
  const claimed = groups.flatMap((group) => group.permissions);
  const rest = granted.filter((permission) => !claimed.includes(permission));
  if (rest.length > 0) groups.push({ id: 'other', label: 'Other', permissions: rest });
  return groups;
}

export const PASSWORD_STALE_DAYS = 180;

export const RECOVERY_CODES_LOW = 3;

export const ROLE_SUMMARIES = {
  owner: 'Everything, including making and unmaking other owners. Only an owner can hand this out.',
  admin: 'Runs the panel day to day, but cannot add or remove accounts.',
  dev: 'Builds and ships: the boards, the bot, the API and the GitHub group, without touching accounts.',
  viewer: 'Reads the dashboard and nothing else.',
  custom: 'Exactly what you tick below, nothing implied.',
};

export const AUDIT_LABELS = {
  'signin.ok': 'signed in',
  'signin.failed': 'failed sign-in',
  'signin.barred': 'was turned away — the account is not active',
  'signin.badCode': 'gave a wrong two-step code',
  'signin.recovery': 'signed in with a recovery code',
  'user.signedOut': 'ended the sessions of',
  'twofactor.started': 'began setting up two-step',
  'twofactor.on': 'turned two-step on',
  'twofactor.off': 'turned two-step off',
  'twofactor.failed': 'failed to turn two-step off',
  'twofactor.cleared': 'cleared two-step for',
  'password.changed': 'changed their password',
  'password.failed': 'gave the wrong current password',
  'sessions.revokedAll': 'ended every session',
  'sessions.replayed': 'had an out-of-date session cookie come back — that session was closed',
  'sessions.moved': 'had a session cookie turn up on another device — that session was closed',
  'user.created': 'created an account',
  'user.updated': 'changed an account',
  'user.ownerGranted': 'made an owner',
  'user.ownerRemoved': 'took the owner role from',
  'user.password': 'set an account password',
  'user.deleted': 'removed an account',
  'role.saved': 'changed what a role may do',
  'role.reset': 'put a role back to its shipped permissions',
  'role.deleted': 'removed a role',
  'token.created': 'created an API key',
  'token.updated': 'changed an API key',
  'token.rotated': 'rotated an API key',
  'token.revoked': 'revoked an API key',
  'token.restored': 'restored an API key',
  'token.deleted': 'removed an API key',
  'hook.saved': 'set where their key alerts go',
  'hook.tested': 'sent a test to their key alerts',
  'hook.removed': 'stopped their key alerts',
  'shield.mode': 'set the Shield mode to',
  'shield.cleared': 'cleared the Shield flags',
  'shield.selfTest': 'ran the Shield self-test',
  'signin.googleRefused': 'was refused a Google sign-in',
  'google.linked': 'linked a Google sign-in',
  'google.confirmed': 'confirmed their Google sign-in',
  'google.unlinked': 'unlinked their Google sign-in',
  'google.cleared': 'cleared the Google sign-in for',
  'discord.codeIssued': 'asked for a Discord link code',
  'discord.linked': 'linked a Discord account',
  'discord.unlinked': 'unlinked their Discord account',
  'discord.cleared': 'cleared the Discord link for',
  'discord.renamed': 'changed their Discord nickname',
  'discord.prefs': 'changed their Discord notices',
  'picture.set': 'set their profile picture',
  'picture.removed': 'removed their profile picture',
  'picture.cleared': 'removed the profile picture of',
  'embed.saved': 'set up their own embed',
  'embed.tested': 'sent a test to their embed',
  'embed.removed': 'removed their embed',
  'brand.saved': 'saved a block page brand',
  'brand.deleted': 'removed a block page brand',
  'brand.published': 'republished the block page brands',
  'finding.saved': 'recorded a scan finding',
  'finding.deleted': 'removed a scan finding',
  'bot.presenceSet': 'set the bot status',
  'bot.presenceCleared': 'cleared the bot status',
  'bot.queueClosed': 'closed a bot queue entry',
  'bot.queueDeleted': 'removed a bot queue record',
  'bot.setupChanged': 'changed the bot server setup',
  'bot.levelChanged': 'changed someone’s level',
  'bot.giveawayDrawn': 'drew a giveaway',
  'bot.moderation': 'used the bot to moderate',
  'bot.restarted': 'restarted the bot',
  'page.covered': 'covered a site page',
  'page.reopened': 'reopened a site page',
};

export const ACCOUNT_ACTIONS = /^(signin|password|sessions|user|twofactor)\./;

export const PASSWORD_MIN = 12;

export const DORMANT_DAYS = 60;

export const EXPIRING_SOON_DAYS = 14;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(date) {
  if (typeof date !== 'string' || !date) return null;
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const start = Date.parse(`${todayIso()}T00:00:00Z`);
  return Math.round((target - start) / 86400000);
}

export function daysSince(stamp) {
  if (typeof stamp !== 'string' || !stamp) return null;
  const parsed = Date.parse(stamp);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86400000);
}

export function formatDate(date) {
  if (typeof date !== 'string' || !date) return '—';
  const parsed = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Date(parsed).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function generatePassword(length = 20) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const source = new Uint32Array(length);
  crypto.getRandomValues(source);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += alphabet[source[index] % alphabet.length];
  }
  return out;
}

export const SCOPE_LABELS = {
  'api.index': 'Index',
  'api.shield': 'Shield',
  'api.status': 'Status',
};

export const SCOPE_NOTES = {
  'api.index': 'The list of everything the API offers, and the version it is on.',
  'api.shield': 'The Shield package details and the full rule list it ships with.',
  'api.status': 'Live availability — the same reading the status page shows.',
};

export const KEY_EXPIRING_DAYS = 14;

export const KEY_IDLE_DAYS = 30;

export function keyState(key) {
  if (!key) return 'active';
  if (key.revoked) return 'revoked';
  if (key.expired) return 'expired';
  const left = daysUntil(key.expires);
  if (left !== null && left <= KEY_EXPIRING_DAYS) return 'expiring';
  return 'active';
}

export const KEY_STATE_TONE = {
  active: 'green',
  expiring: 'amber',
  expired: 'rose',
  revoked: 'rose',
};

export const KEY_STATE_LABEL = {
  active: 'active',
  expiring: 'ending soon',
  expired: 'expired',
  revoked: 'revoked',
};

export function keyWorks(key) {
  const state = keyState(key);
  return state === 'active' || state === 'expiring';
}

export function formatRate(perMinute) {
  if (!Number.isFinite(perMinute)) return '—';
  return `${formatCount(perMinute)}/min`;
}

export function topPaths(paths, limit = 6) {
  if (!paths || typeof paths !== 'object') return [];
  return Object.entries(paths)
    .map(([path, count]) => ({ path, count: Number(count) || 0 }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function keyExample(prefix, environment) {
  const shown = prefix ? `${prefix}…` : `amk_${environment ?? 'live'}_…`;
  return `curl https://amitista.com/api/k/v1 \\
  -H "Authorization: Bearer ${shown}"`;
}

export const KEY_EVENT_LABEL = {
  used: 'used',
  newIp: 'new address',
  denied: 'scope refused',
  limited: 'rate limited',
  revoked: 'revoked key used',
  expired: 'expired key used',
  changed: 'key changed',
  unknown: 'unknown key',
};

export const KEY_EVENT_TONE = {
  used: 'neutral',
  newIp: 'purple',
  denied: 'amber',
  limited: 'amber',
  revoked: 'rose',
  expired: 'rose',
  changed: 'green',
  unknown: 'rose',
};

export const KEY_EVENT_NOTE = {
  used: 'Every accepted call. The busiest of them by far — leave it off unless you are chasing something.',
  newIp: 'The first call a key gets from an address it has never been used from before.',
  denied: 'A key asked for something its scopes do not cover.',
  limited: 'A key went over its requests-a-minute limit and was turned away.',
  revoked: 'Something is still calling with a key you revoked.',
  expired: 'Something is still calling with a key that has run out.',
  changed: 'One of your keys was created, changed, rotated, revoked, restored or removed.',
  unknown: 'A key nobody recognises was presented to the gateway. Needs the API admin permission.',
};

export const KEY_EVENT_REFUSED = ['denied', 'limited', 'revoked', 'expired', 'unknown'];

export function isRefusal(event) {
  return KEY_EVENT_REFUSED.includes(event?.kind);
}

export const HOOK_FORMAT_LABEL = {
  discord: 'Discord',
  slack: 'Slack',
  generic: 'Plain endpoint',
};

export const HOOK_FORMAT_NOTE = {
  discord: 'An embed per event, posted by a channel webhook.',
  slack: 'A message with a line per event, posted by an incoming webhook.',
  generic: 'A JSON POST to anything you run, signed so you can tell it is us.',
};

export const HOOK_FORMAT_HINT = {
  discord: 'Channel settings → Integrations → Webhooks → Copy webhook URL.',
  slack: 'api.slack.com → your app → Incoming Webhooks → Add New Webhook to Workspace.',
  generic: 'Any https address you control. It has to be reachable from the internet.',
};

export const HOOK_PLACEHOLDER = {
  discord: 'https://discord.com/api/webhooks/…',
  slack: 'https://hooks.slack.com/services/…',
  generic: 'https://example.com/hooks/amitista',
};

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export const SEVERITY_TONE = {
  critical: 'rose',
  high: 'rose',
  medium: 'amber',
  low: 'neutral',
};

export const SEVERITY_TEXT = {
  critical: 'text-rose-400',
  high: 'text-rose-400',
  medium: 'text-amber-300',
  low: 'text-neutral-400',
};

export const SHIELD_MODE_LABEL = {
  monitor: 'Monitor',
  block: 'Block',
};

export const SHIELD_MODE_NOTE = {
  monitor: 'Everything is judged and recorded, and nothing is refused.',
  block: 'Critical and high findings are refused, and the caller gets a reference code.',
};

export const VERDICT_TONE = {
  blocked: 'rose',
  flagged: 'amber',
  allowed: 'green',
};

export function severityOrder(left, right) {
  const a = SEVERITY_RANK[left?.severity] ?? 3;
  const b = SEVERITY_RANK[right?.severity] ?? 3;
  return a - b;
}

export function countBySeverity(flags) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const flag of flags ?? []) {
    if (out[flag?.severity] !== undefined) out[flag.severity] += 1;
  }
  return out;
}

export function flagKey(flag, index) {
  return `${flag?.time ?? ''}-${flag?.id ?? ''}-${flag?.path ?? ''}-${index}`;
}

export const REFERENCE = /^AMS-[0-9A-F]{4}-[0-9A-F]{4}$/;

export function normaliseReference(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const fromUrl = /[?&]ref=([^&\s]+)/i.exec(raw);
  const candidate = (fromUrl ? decodeURIComponent(fromUrl[1]) : raw).toUpperCase();
  const bare = candidate.startsWith('AMS-') ? candidate : `AMS-${candidate}`;
  const tidied = bare.replace(/\s+/g, '');
  return REFERENCE.test(tidied) ? tidied : null;
}

export function requestKey(flag) {
  if (flag?.reference) return flag.reference;
  return `${flag?.method ?? ''} ${flag?.path ?? ''} ${String(flag?.time ?? '').slice(0, 19)}`;
}

export function groupFlags(flags) {
  const order = [];
  const byKey = new Map();

  for (const flag of flags ?? []) {
    const key = requestKey(flag);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        reference: flag?.reference ?? null,
        method: flag?.method ?? null,
        path: flag?.path ?? null,
        ip: flag?.ip ?? null,
        time: flag?.time ?? null,
        blocked: false,
        flags: [],
      };
      byKey.set(key, group);
      order.push(group);
    }
    group.flags.push(flag);
    if (flag?.blocked) group.blocked = true;
    if (!group.ip && flag?.ip) group.ip = flag.ip;
    if (flag?.time && (!group.time || flag.time < group.time)) group.time = flag.time;
  }

  for (const group of order) {
    group.flags.sort(severityOrder);
    group.severity = group.flags[0]?.severity ?? 'low';
  }
  return order;
}

export function countBy(flags, pick) {
  const tally = new Map();
  for (const flag of flags ?? []) {
    const value = pick(flag);
    if (value === null || value === undefined || value === '') continue;
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

function hourLabel(stamp) {
  return new Date(stamp).toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function hourlyFlags(flags, hours = 24, now = Date.now()) {
  const end = Math.floor(now / 3600000) * 3600000;
  const points = new Array(hours).fill(0);
  const labels = [];

  for (let index = 0; index < hours; index += 1) {
    labels.push(hourLabel(end - (hours - 1 - index) * 3600000));
  }

  for (const flag of flags ?? []) {
    const at = Date.parse(flag?.time ?? '');
    if (Number.isNaN(at)) continue;
    const slot = hours - 1 - Math.floor((end - Math.floor(at / 3600000) * 3600000) / 3600000);
    if (slot >= 0 && slot < hours) points[slot] += 1;
  }

  return { points, labels };
}

export const TUNING_LABEL = {
  enforce: 'Enforcing',
  record: 'Record only',
  silence: 'Silenced',
};

export const TUNING_TONE = {
  enforce: 'green',
  record: 'amber',
  silence: 'neutral',
};

export const TUNING_NOTE = {
  enforce: 'Judged normally. Critical and high findings are refused in block mode.',
  record: 'Still written to the flag list, never refuses. What to reach for on a false positive.',
  silence: 'Not recorded and not refused. The rule may as well not exist here.',
};

export const TRAFFIC_WINDOWS = [
  { id: '1h', label: '1h', title: 'the last hour' },
  { id: '6h', label: '6h', title: 'the last six hours' },
  { id: '24h', label: '24h', title: 'the last 24 hours' },
  { id: '7d', label: '7d', title: 'the last seven days' },
  { id: '30d', label: '30d', title: 'the last thirty days' },
];

export const TRAFFIC_DEFAULT = '24h';

export function pointLabel(point, step) {
  const value = point?.at;
  if (typeof value !== 'string' || !value) return '—';
  if (step === 'day') {
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed)) return value;
    return new Date(parsed).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
  }
  return formatStamp(value);
}

export function seriesOf(points, field) {
  return (points ?? []).map((point) => Number(point?.[field] ?? 0));
}

export function peakOf(points, field) {
  const values = seriesOf(points, field);
  if (values.length === 0) return { value: 0, at: null };
  const top = Math.max(...values);
  return { value: top, at: top > 0 ? points[values.indexOf(top)] : null };
}

export function swingOf(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const half = Math.floor(values.length / 2);
  const recent = values.slice(half).reduce((sum, value) => sum + value, 0);
  const earlier = values.slice(0, half).reduce((sum, value) => sum + value, 0);
  if (earlier <= 0) return null;
  return Math.round(((recent - earlier) / earlier) * 100);
}

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryName(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return 'Unknown';
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function countryFlag(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return '·';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

export function deltaOf(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function ratioOf(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function perVisit(pageviews, sessions) {
  if (!Number.isFinite(pageviews) || !Number.isFinite(sessions) || sessions <= 0) return null;
  return Math.round((pageviews / sessions) * 10) / 10;
}

export const SOURCE_LABEL = {
  direct: 'Typed or bookmarked',
  internal: 'Another page here',
  search: 'Search engines',
  social: 'Social and chat',
  other: 'Other sites',
};

export const SOURCE_NOTE = {
  direct: 'No referrer at all — a typed address, a bookmark, a QR code, or a link from an app that strips it.',
  internal: 'Moving between pages on this site. Not a way in, but it says the navigation works.',
  search: 'Google, Bing, DuckDuckGo and the rest.',
  social: 'Links shared on social networks, chat apps and forums.',
  other: 'Anywhere else that linked here.',
};

export const SOURCE_TONE = {
  direct: 'bg-neutral-600',
  internal: 'bg-purple-500/40',
  search: 'bg-emerald-500/70',
  social: 'bg-sky-500/70',
  other: 'bg-purple-500/70',
};

export const DEVICE_LABEL = {
  desktop: 'Desktop',
  mobile: 'Phone',
  tablet: 'Tablet',
  robot: 'Robot',
  unknown: 'Unknown',
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const GEO_STALE_DAYS = 45;

export function parseAllowList(text) {
  return String(text ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function allowListText(values) {
  return (values ?? []).join('\n');
}

export function shortUri(value, keep = 64) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  if (text.length <= keep) return text;
  return `${text.slice(0, keep)}…`;
}

export function installState(install, now = Date.now()) {
  const last = Date.parse(install?.last ?? '');
  if (Number.isNaN(last)) return 'unknown';
  const age = now - last;
  if (age <= 12 * 3600000) return 'active';
  if (age <= 7 * 86400000) return 'quiet';
  return 'gone';
}

export const INSTALL_STATE_LABEL = {
  active: 'Polling',
  quiet: 'Quiet',
  gone: 'Not seen',
  unknown: 'Unknown',
};

export const INSTALL_STATE_TONE = {
  active: 'green',
  quiet: 'amber',
  gone: 'neutral',
  unknown: 'neutral',
};

export async function fetchBoards(archived = false) {
  return unwrap(
    await call(archived ? '/boards?archived=1' : '/boards'),
    'The boards could not be read.',
  );
}

export async function fetchBoard(id) {
  return unwrap(
    await call(`/boards/board?id=${encodeURIComponent(id)}`),
    'That board could not be read.',
  );
}

export async function createBoard(payload) {
  return unwrap(await send('/boards/create', payload), 'That board could not be created.').board;
}

export async function updateBoard(id, changes) {
  return unwrap(await send('/boards/update', { id, ...changes }), 'That board could not be changed.').board;
}

export async function deleteBoard(id) {
  return unwrap(await send('/boards/delete', { id }), 'That board could not be deleted.');
}

export async function testBoardReminder(id) {
  return unwrap(await send('/boards/remind/test', { id }), 'That test DM could not be sent.');
}

export async function setBoardMember(id, name, role) {
  return unwrap(await send('/boards/members', { id, name, role }), 'That change could not be saved.').board;
}

export async function setBoardMembers(id, people) {
  return unwrap(await send('/boards/members', { id, people }), 'That change could not be saved.').board;
}

export async function askBoardMember(id, name, role) {
  return unwrap(await send('/boards/members/ask', { id, name, role }), 'That request could not be sent.').board;
}

export async function cancelBoardAsk(id, name) {
  return unwrap(
    await send('/boards/members/ask/cancel', { id, name }),
    'That request could not be withdrawn.',
  ).board;
}

export async function answerBoardAsk(id, accept) {
  return unwrap(
    await send('/boards/members/ask/reply', { id, accept }),
    'That request could not be answered.',
  );
}

export async function removeBoardMember(id, name) {
  return unwrap(await send('/boards/members/remove', { id, name }), 'They could not be removed.');
}

export function boardFaceUrl(name) {
  return `${BASE}/boards/face?name=${encodeURIComponent(name)}`;
}

export function boardArtUrl(id, kind, stamp) {
  const version = stamp ? `&v=${encodeURIComponent(stamp)}` : '';
  return `${BASE}/boards/art?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}${version}`;
}

export async function setBoardArt(id, kind, data, focus) {
  const result = await call('/boards/art', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, kind, data, focus }),
    signal:
      typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(ART_TIMEOUT_MS)
        : undefined,
  });
  if (result.status === 413) throw new Error('That image is too large to send.');
  return unwrap(result, 'That image could not be saved.').board;
}

export async function placeBoardArt(id, kind, focus) {
  return unwrap(
    await send('/boards/art/focus', { id, kind, focus }),
    'That image could not be moved.',
  ).board;
}

export async function deleteBoardArt(id, kind) {
  return unwrap(await send('/boards/art/delete', { id, kind }), 'That image could not be removed.').board;
}

export async function createBoardList(id, name) {
  return unwrap(await send('/boards/lists/create', { id, name }), 'That column could not be added.').board;
}

export async function updateBoardList(id, list, changes) {
  return unwrap(
    await send('/boards/lists/update', { id, list, ...changes }),
    'That column could not be changed.',
  ).board;
}

export async function deleteBoardList(id, list) {
  return unwrap(await send('/boards/lists/delete', { id, list }), 'That column could not be deleted.').board;
}

export async function moveBoardList(id, list, index) {
  return unwrap(await send('/boards/lists/move', { id, list, index }), 'That column could not be moved.').board;
}

export async function sortBoardList(id, list, by) {
  return unwrap(await send('/boards/lists/sort', { id, list, by }), 'That column could not be sorted.').board;
}

export async function createCard(id, list, title) {
  return unwrap(await send('/boards/cards/create', { id, list, title }), 'That card could not be added.');
}

export async function updateCard(id, card, changes) {
  return unwrap(
    await send('/boards/cards/update', { id, card, ...changes }),
    'That card could not be changed.',
  ).card;
}

export async function moveCard(id, card, list, index) {
  return unwrap(
    await send('/boards/cards/move', { id, card, list, index }),
    'That card could not be moved.',
  ).board;
}

export async function fetchMyWork() {
  return unwrap(await call('/boards/mine'), 'Your work could not be read.');
}

export async function fetchBoardPulse(board) {
  return unwrap(
    await call(board ? `/boards/pulse?board=${encodeURIComponent(board)}` : '/boards/pulse'),
    'The boards could not be checked.',
  );
}

export async function duplicateCard(id, card) {
  return unwrap(await send('/boards/cards/duplicate', { id, card }), 'That card could not be copied.');
}

export async function deleteCard(id, card) {
  return unwrap(await send('/boards/cards/delete', { id, card }), 'That card could not be deleted.');
}

export async function undeleteCard(id, card) {
  return unwrap(await send('/boards/cards/undelete', { id, card }), 'That card could not be put back.');
}

export async function bulkCards(id, cards, action, value) {
  return unwrap(
    await send('/boards/cards/bulk', { id, cards, action, value }),
    'Those cards could not be changed.',
  );
}

export async function transferCard(id, card, to, list) {
  return unwrap(
    await send('/boards/cards/transfer', { id, card, to, list: list ?? null }),
    'That card could not be moved.',
  );
}

export async function commentOnCard(id, card, body) {
  return unwrap(
    await send('/boards/cards/comment', { id, card, body }),
    'That comment could not be added.',
  ).card;
}

export async function deleteCardComment(id, card, comment) {
  return unwrap(
    await send('/boards/cards/comment/delete', { id, card, comment }),
    'That comment could not be deleted.',
  ).card;
}

export async function addCardStep(id, card, text) {
  return unwrap(await send('/boards/cards/check', { id, card, text }), 'That step could not be added.').card;
}

export async function setCardStep(id, card, step, changes) {
  return unwrap(
    await send('/boards/cards/check/update', { id, card, step, ...changes }),
    'That step could not be changed.',
  ).card;
}

export async function deleteCardStep(id, card, step) {
  return unwrap(
    await send('/boards/cards/check/delete', { id, card, step }),
    'That step could not be deleted.',
  ).card;
}

export async function addCardLink(id, card, label, url) {
  return unwrap(
    await send('/boards/cards/link', { id, card, label, url }),
    'That link could not be added.',
  ).card;
}

export async function deleteCardLink(id, card, link) {
  return unwrap(
    await send('/boards/cards/link/delete', { id, card, link }),
    'That link could not be deleted.',
  ).card;
}

export function cardFileUrl(id, card, file, download, thumb) {
  const save = download ? '&get=1' : '';
  const small = thumb ? '&thumb=1' : '';
  return `${BASE}/boards/cards/file?id=${encodeURIComponent(id)}&card=${encodeURIComponent(
    card,
  )}&file=${encodeURIComponent(file)}${save}${small}`;
}

export async function attachCardFile(id, card, name, data, thumb) {
  const result = await call('/boards/cards/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, card, name, data, thumb: thumb || undefined }),
    signal:
      typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(ART_TIMEOUT_MS)
        : undefined,
  });
  if (result.status === 413) throw new Error('That file is too large to send.');
  return unwrap(result, 'That file could not be attached.').card;
}

export async function deleteCardFile(id, card, file) {
  return unwrap(
    await send('/boards/cards/file/delete', { id, card, file }),
    'That file could not be taken off.',
  ).card;
}

export async function setBoardLabel(id, label, name, colour) {
  return unwrap(await send('/boards/labels', { id, label, name, colour }), 'That label could not be saved.').board;
}

export async function deleteBoardLabel(id, label) {
  return unwrap(await send('/boards/labels/delete', { id, label }), 'That label could not be deleted.').board;
}

export const BOARD_COLOUR = {
  purple: { stripe: 'bg-purple-500', dot: 'bg-purple-400', chip: 'border-purple-500/40 bg-purple-500/10 text-purple-200' },
  sky: { stripe: 'bg-sky-500', dot: 'bg-sky-400', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  emerald: { stripe: 'bg-emerald-500', dot: 'bg-emerald-400', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  amber: { stripe: 'bg-amber-400', dot: 'bg-amber-300', chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  rose: { stripe: 'bg-rose-500', dot: 'bg-rose-400', chip: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  slate: { stripe: 'bg-slate-400', dot: 'bg-slate-300', chip: 'border-slate-400/40 bg-slate-400/10 text-slate-200' },
};

export const BOARD_ROLE_LABEL = {
  owner: 'Board owner',
  editor: 'Can edit',
  viewer: 'Read only',
};

export const BOARD_ROLE_HINT = {
  owner: 'Adds and removes people, changes who can see it, deletes the board.',
  editor: 'Adds, moves and finishes cards.',
  viewer: 'Reads the board and nothing else.',
};

export const TRANSCRIPT_KINDS = [
  { id: '', label: 'Everything' },
  { id: 'ticket', label: 'Support' },
  { id: 'project', label: 'Projects' },
  { id: 'application', label: 'Applications' },
];

export const TRANSCRIPT_KIND_LABELS = {
  ticket: 'Support',
  project: 'Project',
  application: 'Application',
  channel: 'Channel',
};

export async function fetchTranscripts(filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return unwrap(await call(`/transcripts${suffix ? `?${suffix}` : ''}`), 'The transcripts could not be read.');
}

export async function fetchTranscriptSummary() {
  return unwrap(await call('/transcripts/summary'), 'The transcripts could not be read.');
}

export async function fetchTranscript(id) {
  return unwrap(
    await call(`/transcripts/entry?id=${encodeURIComponent(id)}`),
    'That transcript could not be opened.',
  );
}

export async function deleteTranscript(id) {
  return unwrap(await send('/transcripts/delete', { id }), 'That transcript could not be deleted.');
}

export async function fetchC2cLogSummary(since) {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return unwrap(await call(`/c2c/logs/summary${query}`), 'The exchange logs could not be read.');
}

export async function fetchC2cLogs(filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return unwrap(
    await call(`/c2c/logs${suffix ? `?${suffix}` : ''}`),
    'The exchange logs could not be read.',
  );
}

export const C2C_SEVERITIES = [
  { id: 'security', label: 'Security', tone: 'rose' },
  { id: 'important', label: 'Important', tone: 'purple' },
  { id: 'medium', label: 'Notice', tone: 'neutral' },
];

export const C2C_SEVERITY_TONE = {
  security: 'rose',
  important: 'purple',
  medium: 'neutral',
};
