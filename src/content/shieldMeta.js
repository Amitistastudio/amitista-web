export const SHIELD_NAME = 'Shield';

export const SHIELD_TAGLINE = 'Application security that lives inside your app';

export const SHIELD_INTRO = [
  'Shield is a package you install into an Express application. It reads your routes once, then stays in the process and watches what happens when a request arrives — the shape of the payload, the shell command your handler builds, the query it concatenates, the data it writes back out. Given a little traffic it also learns what an ordinary request to each route looks like, which is how it catches the attack nobody wrote a rule for.',
  'It is not a scanner you run before a release and it is not a firewall sitting in front of you. Both of those only ever see one half of the picture: a scanner sees the code but never the traffic, and a proxy sees the traffic but has no idea what your code is about to do with it. Shield is in the same process as your handler, so it sees a value arrive from the caller and sees the same value reach a shell.',
  'Your source never leaves your machine. There is no upload step, no account, and no endpoint here that accepts code. The only thing that travels is the rule catalogue, and it travels downwards.',
];

export const STAGE_ORDER = ['analysis', 'request', 'runtime', 'response', 'baseline'];

export const STAGE_TIMING = {
  analysis: 'Once, at startup',
  request: 'Before your handler runs',
  runtime: 'While your handler runs',
  response: 'As the reply is written',
  baseline: 'Once the route has been seen enough',
};

export const STAGE_DETAIL = {
  analysis:
    'It parses your source and builds a map of every route, every middleware in front of it, and every dangerous call it can reach. That map is what makes the difference between a route that checks who is asking and one that takes an id from the URL and trusts it.',
  request:
    'The payload is checked before your code sees it. Keys that rewrite prototypes, database operators in a field that should hold a string, a body nested twelve levels deep to make parsing expensive — all of it is refused at the door, and the client is held to a budget while it happens. The budget knows what it is counting: an IPv6 caller is counted by prefix rather than by address, a forwarded chain is read from the proxy side, and a sign-in endpoint taking traffic from hundreds of clients that each try twice is reported even though no single one of them went over anything.',
  runtime:
    'Anything that arrived with the request is marked — the body and the query, but also the cookies, the headers, the name on an uploaded file and the path itself — and the mark follows the value through your handler, including through a decode your own code does on the way. When it reaches something that matters, Shield already knows the argument came from the caller rather than from you. That is the whole trick, and it is why it can tell a hard-coded command apart from an injected one. It watches process spawns, file paths, SQL and document-store queries, the vm module, and outbound requests through both fetch and http.request, which is how axios, got and node-fetch actually leave.',
  response:
    'The reply is read on its way out. A password hash in a JSON body, a private key in an error message, a redirect target the caller chose, a session cookie missing its flags — the last chance to catch something that should never have left the building. It does not matter which way the reply was written: res.json, res.send with a string, a template streamed straight to the socket and a file handed to sendFile are all judged, because an attacker does not care which method your handler happened to use.',
  baseline:
    'Every layer above it is a rule somebody wrote down in advance. This one is not: it watches real traffic until it knows what normal looks like on each route — which fields arrive, what type they are, how long they get, which characters they contain — and then reports the request that does not fit. It stops learning the moment it has learned, and it never learns from a request that tripped a rule, so nobody can spend a fortnight teaching it that their payload is ordinary. A route it has not seen enough of is judged provisionally rather than not at all: reported one grade down, never enforced, and said to be provisional in the finding itself. It reports only, until you turn its enforcement on by name.',
};

export const SHIELD_PRINCIPLES = [
  {
    title: 'Your code never leaves your machine',
    body: 'Analysis runs locally, inside the package. Nobody sends proprietary source to a small studio, and storing it would make one server the single thing worth breaking into for every customer at once. We would rather not hold it.',
  },
  {
    title: 'It reports before it refuses',
    body: 'Monitor mode is the default and every deployment should start there. A security tool that blocks a real request on its first day gets removed on its second, so you watch what it would have done for a week before you let it do anything.',
  },
  {
    title: 'Our server going down cannot take yours with it',
    body: 'Enforcement happens in your process, on rules already on your disk. The catalogue is polled on a timer and fails open, so if this site is unreachable your app keeps defending itself on the last set it holds.',
  },
  {
    title: 'A refusal is a refusal',
    body: 'Nearly every handler wraps its own file and database calls in a try/catch, and that catch will happily swallow a refusal along with the errors it was written for. So the refusal is remembered as well as thrown: the request can be caught, but it cannot then be served. Reported and blocked mean the same thing here, which is the only way the log is worth reading.',
  },
  {
    title: 'It says when it is not working',
    body: 'An ESM app started without the preload gets no runtime cover at all, because the builtins were linked before the package could reach them. Shield tests itself for this at startup and prints a loud degraded banner rather than sitting there looking healthy.',
  },
];

export const SHIELD_AUDIENCE = [
  'A Node and Express service holding data that belongs to somebody else.',
  'A team without a security engineer, which is most teams.',
  'An application that grew faster than the review of it did.',
  'A handover, where somebody needs to know what is in the code before they own it.',
];
