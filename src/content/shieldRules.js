export const SHIELD_PACKAGE = '@amitista/shield';

export const SHIELD_VERSION = '0.7.0';

export const RULESET = 6;

export const SHIELD_RUNTIME = 'node >=18';

export const SHIELD_FRAMEWORK = 'express';

export const SHIELD_INSTALL = 'npm i @amitista/shield';

export const SHIELD_USAGE = "app.use(shield.protect({ mode: 'monitor' }))";

export const SHIELD_START = 'node --import @amitista/shield/register server.js';

export const SHIELD_MODES = [
  {
    "id": "monitor",
    "summary": "Every rule reports and nothing is refused. The default, and where every deployment should start."
  },
  {
    "id": "block",
    "summary": "A matched rule refuses the request: 400 for an injection or a malformed shape, 429 once a client is over budget, and a withheld reply when secrets would have left."
  }
];

export const LAYERS = [
  {
    "id": "analysis",
    "name": "Reads your code",
    "blurb": "Runs once, over your source. Finds the problems that are in the code itself rather than in any one request."
  },
  {
    "id": "request",
    "name": "Checks the request",
    "blurb": "Runs before your handler does. Refuses payloads shaped to break things, and holds abusive clients back."
  },
  {
    "id": "runtime",
    "name": "Watches the dangerous call",
    "blurb": "Runs at the moment your code does something risky, and knows whether the argument came from the caller."
  },
  {
    "id": "response",
    "name": "Checks what leaves",
    "blurb": "Runs as the reply is written. Catches data that should never have been in it, and replies that hand an attacker your users."
  },
  {
    "id": "baseline",
    "name": "Learns your traffic",
    "blurb": "Watches real requests until it knows the normal shape of every route, then reports anything that does not fit. This is the layer that catches attacks nobody has written a rule for. It freezes once it has learned, it never learns from a request that tripped a rule, and it never refuses anything until you switch enforcement on. A route that is still learning is judged early and reported one grade down rather than left unwatched."
  }
];

export const DEFENCES = [
  {
    "id": "missing-authorization",
    "layer": "analysis",
    "severity": "high",
    "name": "Missing authorisation",
    "summary": "A route reached by a caller-supplied id with no authorisation middleware in front of it. High when it changes the record, medium when it only reads."
  },
  {
    "id": "mass-assignment",
    "layer": "analysis",
    "severity": "medium",
    "name": "Mass assignment",
    "summary": "A whole request body handed to a model or an update, so the caller decides which columns get written."
  },
  {
    "id": "hardcoded-secret",
    "layer": "analysis",
    "severity": "critical",
    "name": "Credentials in source",
    "summary": "Live keys committed to files: nine provider formats, private key blocks, database URLs with passwords, and high-entropy values assigned to secret-shaped names."
  },
  {
    "id": "command",
    "layer": "runtime",
    "severity": "critical",
    "name": "Command injection",
    "summary": "Request data carrying shell metacharacters reaching a process spawn."
  },
  {
    "id": "sql",
    "layer": "runtime",
    "severity": "critical",
    "name": "SQL injection",
    "summary": "Request data carrying SQL control syntax concatenated into a query. Values passed as bound parameters are not flagged."
  },
  {
    "id": "filesystem",
    "layer": "runtime",
    "severity": "high",
    "name": "Path traversal",
    "summary": "Request data supplying a parent-directory segment, an absolute path or a null byte to a file call. Tell it where your files live with paths.root and it answers a better question instead: does this resolve inside that directory, whatever the path is spelled like."
  },
  {
    "id": "ssrf",
    "layer": "runtime",
    "severity": "high",
    "name": "Server-side request forgery",
    "summary": "Request data pointing an outbound request at an internal address or a non-HTTP scheme. Covers fetch and http.request alike, so axios, got and node-fetch are watched too, and an address written in decimal, hex or IPv6 is resolved before it is judged."
  },
  {
    "id": "eval",
    "layer": "runtime",
    "severity": "critical",
    "name": "Dynamic evaluation",
    "summary": "Request data reaching eval, new Function or the vm module. Reported by the scanner in your source, and raised at runtime the moment vm is handed a string the caller helped write."
  },
  {
    "id": "render",
    "layer": "runtime",
    "severity": "medium",
    "name": "Template selection",
    "summary": "Request data choosing which template gets rendered."
  },
  {
    "id": "prototype-pollution",
    "layer": "request",
    "severity": "critical",
    "name": "Prototype pollution",
    "summary": "Payload keys that rewrite object prototypes, refused before the handler runs."
  },
  {
    "id": "nosql-operator",
    "layer": "request",
    "severity": "high",
    "name": "Query operator injection",
    "summary": "Database operators smuggled in where a plain value belongs. This is what stops a login body of { password: { $ne: null } }, and at runtime it catches caller data reaching a $where, which the database runs as code."
  },
  {
    "id": "payload-size",
    "layer": "request",
    "severity": "medium",
    "name": "Parse bombs",
    "summary": "Payloads built to be expensive to read: deep nesting, huge arrays, key floods."
  },
  {
    "id": "parameter-pollution",
    "layer": "request",
    "severity": "low",
    "name": "Parameter pollution",
    "summary": "A query parameter supplied repeatedly so it arrives as an array where a string was expected."
  },
  {
    "id": "rate-limit",
    "layer": "request",
    "severity": "high",
    "name": "Rate limiting",
    "summary": "A sliding window per client and route, with escalating temporary blocks. Login-shaped paths get a tighter ceiling with no configuration, an IPv6 client is counted by prefix so it cannot present a fresh address every request, and a process behind a proxy is told to say so rather than silently bucketing the whole internet as one client."
  },
  {
    "id": "burst",
    "layer": "request",
    "severity": "high",
    "name": "Burst and concurrency",
    "summary": "Short-window flood control and a cap on how many requests one client may hold open at once."
  },
  {
    "id": "concurrency",
    "layer": "request",
    "severity": "medium",
    "name": "Load shedding",
    "summary": "When the event loop saturates, the budget drops to a fraction of normal so the server stays answerable instead of collapsing."
  },
  {
    "id": "data-exposure",
    "layer": "response",
    "severity": "critical",
    "name": "Data leaving in a response",
    "summary": "Password hashes, private keys, cloud keys, signed tokens and card numbers on their way out. Catches the SELECT * that returns a password_hash nobody meant to send, whether the reply left through res.json, res.send or a raw write to the socket."
  },
  {
    "id": "xss",
    "layer": "response",
    "severity": "high",
    "name": "Reflected markup",
    "summary": "Request text written into an HTML reply with tags or an event handler still in it, or landing inside a script block where it is code rather than content. Plain reflected text is left alone. Watched on res.send, res.write and res.end, so a template streamed straight to the socket is judged like any other reply."
  },
  {
    "id": "open-redirect",
    "layer": "response",
    "severity": "high",
    "name": "Open redirect",
    "summary": "A caller choosing an absolute redirect target, which turns your domain into a springboard to someone else’s."
  },
  {
    "id": "unexpected-type",
    "layer": "baseline",
    "severity": "high",
    "name": "Value changed shape",
    "summary": "A field that has only ever arrived as one type turning up as another. This is what catches type confusion and operator injection that no signature describes."
  },
  {
    "id": "unexpected-characters",
    "layer": "baseline",
    "severity": "high",
    "name": "Characters never seen here",
    "summary": "A field that has only ever held digits, or a uuid, or an email, suddenly holding quotes or spaces."
  },
  {
    "id": "unexpected-field",
    "layer": "baseline",
    "severity": "medium",
    "name": "Field never sent here",
    "summary": "An input this endpoint has never received across every request it has learned from."
  },
  {
    "id": "unexpected-length",
    "layer": "baseline",
    "severity": "medium",
    "name": "Far longer than ever",
    "summary": "A value several times longer than the longest this field has ever held."
  },
  {
    "id": "unexpected-value",
    "layer": "baseline",
    "severity": "medium",
    "name": "Outside its usual set",
    "summary": "A field that behaves like an enum receiving a value outside the small set it has always held."
  },
  {
    "id": "insecure-cookie",
    "layer": "response",
    "severity": "high",
    "name": "Unprotected session cookies",
    "summary": "Session cookies missing HttpOnly, Secure or SameSite. SameSite and Secure are added for you; HttpOnly is reported rather than forced, because adding it silently would break an app that reads its own cookie."
  },
  {
    "id": "payload-depth",
    "layer": "request",
    "severity": "medium",
    "summary": "A body nested deeper than any real payload needs. Depth is what turns parsing and validation into an expensive operation, so it is capped rather than trusted.",
    "name": "Payload depth"
  },
  {
    "id": "null-byte",
    "layer": "request",
    "severity": "high",
    "name": "Embedded null byte",
    "summary": "A key or value carrying a null byte. Nothing legitimate sends one; it is there to make a string end early somewhere further down, in a path, a filename or a C library."
  },
  {
    "id": "rate-block",
    "layer": "request",
    "severity": "high",
    "name": "Temporarily blocked client",
    "summary": "A client that went over its budget repeatedly is held off for a doubling interval rather than being re-judged from scratch each time. This is the refusal you see while that block is still running."
  },
  {
    "id": "distributed-abuse",
    "layer": "request",
    "severity": "high",
    "name": "Distributed credential stuffing",
    "summary": "A sign-in or token endpoint taking far more traffic than it ever has, spread across many clients that each send only a handful of requests. Every per-client limit stays untouched by an attack shaped like this; the endpoint's own total is what gives it away. Reported and never refused unless you turn enforcement on, because refusing on this one shuts the door on every real user signing in at the time."
  }
];

export const SHIELD_LIMITS = [
  "Whether an authorisation check is correct. A missing one is reported; a present one is taken at its word, so a check that returns true for the wrong user reads as protected.",
  "Business logic. A negative quantity, or a price sent by the client, is a valid-looking value.",
  "Race conditions and time-of-check-to-time-of-use bugs.",
  "Weak or missing cryptography. Credentials committed to source are found; how you then use them is not examined.",
  "Volumetric denial of service. A flood consumes your bandwidth before Node sees a packet; that is stopped upstream, not in process.",
  "Anything outside Express, and anything a route reaches without passing through a catalogued sink.",
  "Anything the browser does. There is no client-side agent, so DOM-only cross-site scripting, a tampered script and a hijacked session all look like ordinary requests, and static files answered by your web server never reach the process at all.",
  "Anything that crosses a request boundary. Request data is followed to a sink within the same request; a payload stored now and used in a shell command tomorrow arrives untracked, so stored cross-site scripting is not the same problem as reflected.",
  "Work handed to a queue, a worker or a listener registered at startup, unless it is wrapped in shield.bind — a job that leaves the request's async context runs with every sink hook inert.",
  "A route the baseline has not seen enough traffic on yet. Below a quarter of maturity it stays silent rather than guessing; between there and maturity it reports one grade down and never refuses.",
  "Counting shared between processes. Every limit is per process, so a cluster of four workers means four separate budgets — a decision to block one client can be fanned out with rateLimit.onBlock and shield.block, but the counting itself stays local, because sharing it would put a network round trip on every request.",
  "Anything at all, in an ESM app started without the preload — the package detects this itself and says so loudly rather than reporting a clean bill of health."
];

export const SINKS = [
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "exec",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "execSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "execFile",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "execFileSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "spawn",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "spawnSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "command",
    "severity": "critical",
    "label": "shell command",
    "module": "child_process",
    "method": "fork",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": "vm",
    "method": "runInNewContext",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": "vm",
    "method": "runInThisContext",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": "vm",
    "method": "runInContext",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": "vm",
    "method": "compileFunction",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": "vm",
    "method": "Script",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readFile",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readFileSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "writeFile",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "writeFileSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "appendFile",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "appendFileSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "unlink",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "unlinkSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "rm",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "rmSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "rmdir",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "rmdirSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "mkdir",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "mkdirSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readdir",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readdirSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "open",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "openSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "rename",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "renameSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "copyFile",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "copyFileSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "cp",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "cpSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "link",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "linkSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "symlink",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "symlinkSync",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "createReadStream",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "createWriteStream",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "stat",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "statSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "lstat",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "lstatSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "access",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "accessSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readlink",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "readlinkSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "realpath",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "realpathSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "opendir",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "opendirSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "chmod",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "chmodSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "truncate",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "truncateSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "glob",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": "fs",
    "method": "globSync",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "ssrf",
    "severity": "high",
    "label": "outbound request",
    "module": "http",
    "method": "request",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "ssrf",
    "severity": "high",
    "label": "outbound request",
    "module": "http",
    "method": "get",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "ssrf",
    "severity": "high",
    "label": "outbound request",
    "module": "https",
    "method": "request",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "ssrf",
    "severity": "high",
    "label": "outbound request",
    "module": "https",
    "method": "get",
    "injectionArgs": [
      0,
      1
    ]
  },
  {
    "id": "eval",
    "severity": "critical",
    "label": "dynamic evaluation",
    "module": null,
    "method": "eval",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "ssrf",
    "severity": "high",
    "label": "outbound request",
    "module": null,
    "method": "fetch",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "sql",
    "severity": "critical",
    "label": "database query",
    "module": null,
    "method": "query",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "sql",
    "severity": "critical",
    "label": "database query",
    "module": null,
    "method": "raw",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "sql",
    "severity": "critical",
    "label": "database query",
    "module": null,
    "method": "unprepared",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "sql",
    "severity": "high",
    "label": "database query",
    "module": null,
    "method": "execute",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "render",
    "severity": "medium",
    "label": "template render",
    "module": null,
    "method": "render",
    "injectionArgs": [
      0
    ]
  },
  {
    "id": "redirect",
    "severity": "medium",
    "label": "redirect target",
    "module": null,
    "method": "redirect",
    "injectionArgs": null
  },
  {
    "id": "filesystem",
    "severity": "high",
    "label": "filesystem path",
    "module": null,
    "method": "sendFile",
    "injectionArgs": [
      0
    ]
  }
];

export const RESPONSE_METHODS = [
  "send",
  "write",
  "end"
];

export const SHAPE_RULES = {
  "pollutionKeys": [
    "__proto__",
    "constructor",
    "prototype"
  ],
  "queryOperators": [
    "$accumulator",
    "$and",
    "$elemMatch",
    "$exists",
    "$expr",
    "$function",
    "$gt",
    "$gte",
    "$in",
    "$jsonSchema",
    "$lt",
    "$lte",
    "$ne",
    "$nin",
    "$nor",
    "$not",
    "$or",
    "$regex",
    "$text",
    "$where"
  ],
  "limits": {
    "maxDepth": 12,
    "maxKeys": 300,
    "maxArray": 1000,
    "maxStringLength": 65536
  }
};

export const RATE_LIMITS = {
  "defaults": {
    "windowMs": 60000,
    "max": 120,
    "sensitiveMax": 10,
    "burstWindowMs": 1000,
    "burstMax": 20,
    "concurrency": 24,
    "blockMs": 60000,
    "maxBlockMs": 3600000,
    "lagThresholdMs": 250,
    "lagSampleMs": 100,
    "sheddingFactor": 0.35,
    "distributedWindowMs": 60000,
    "distributedMax": 300,
    "distributedMinClients": 20,
    "distributedEnforce": false
  },
  "sensitivePathPattern": "(^|\\/)(login|signin|sign-in|register|signup|sign-up|auth|token|password|reset|forgot|verify|otp|2fa|mfa)(\\/|$)"
};

export const SECRET_PATTERNS = [
  {
    "id": "aws-access-key",
    "severity": "critical",
    "label": "AWS access key id",
    "pattern": "\\bAKIA[0-9A-Z]{16}\\b"
  },
  {
    "id": "github-token",
    "severity": "critical",
    "label": "GitHub token",
    "pattern": "\\bgh[pousr]_[A-Za-z0-9]{36,}\\b"
  },
  {
    "id": "slack-token",
    "severity": "critical",
    "label": "Slack token",
    "pattern": "\\bxox[baprs]-[A-Za-z0-9-]{10,}"
  },
  {
    "id": "stripe-key",
    "severity": "critical",
    "label": "Stripe live secret key",
    "pattern": "\\bsk_live_[A-Za-z0-9]{16,}\\b"
  },
  {
    "id": "google-api-key",
    "severity": "high",
    "label": "Google API key",
    "pattern": "\\bAIza[0-9A-Za-z_-]{35}\\b"
  },
  {
    "id": "private-key",
    "severity": "critical",
    "label": "private key block",
    "pattern": "-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"
  },
  {
    "id": "discord-token",
    "severity": "critical",
    "label": "Discord bot token",
    "pattern": "\\b[MNO][A-Za-z0-9_-]{23,}\\.[A-Za-z0-9_-]{6}\\.[A-Za-z0-9_-]{27,}\\b"
  },
  {
    "id": "jwt",
    "severity": "medium",
    "label": "hardcoded JSON web token",
    "pattern": "\\beyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b"
  },
  {
    "id": "postgres-url",
    "severity": "critical",
    "label": "database URL with a password",
    "pattern": "\\b(?:postgres|postgresql|mysql|mongodb(?:\\+srv)?|redis|amqp):\\/\\/[^\\s:'\"]+:[^\\s@'\"]{3,}@"
  }
];

export const DENIAL = {
  "blockPage": "https://amitista.com/block",
  "referenceFormat": "^AMS-[0-9A-F]{4}-[0-9A-F]{4}$",
  "referenceExample": "AMS-4F2A-9C71",
  "referenceHeader": "X-Shield-Reference",
  "query": {
    "ref": "the reference for this refusal",
    "rule": "the id of the rule that refused it, as published in defends[].id"
  },
  "behaviour": [
    {
      "when": "a browser navigating to a page",
      "response": "303 to the block page, carrying ref and rule in the query"
    },
    {
      "when": "fetch, XHR or a subresource",
      "response": "400 JSON with error, reason, reference and page — never a redirect, because turning an image request into an HTML page only hides the failure"
    },
    {
      "when": "a client over its budget",
      "response": "429 JSON with retryAfter, and a Retry-After header"
    }
  ],
  "notes": [
    "One reference per request, not per finding. A visitor who trips three rules quotes one code, and it matches one line in your log.",
    "The rule ids in the query are the same ids as defends[].id here. That is a contract between the package and whatever renders the block page, so it is published rather than left implicit.",
    "The block page is configurable. Left at its default it carries this studio’s name, which is wrong for anyone else running the package."
  ]
};

export const FEED = {
  "url": "https://amitista.com/api/v1/shield/feed",
  "catalogue": "https://amitista.com/api/v1/shield/rules",
  "format": 1,
  "algorithm": "ed25519",
  "keyId": "ams-b0d2c36155e7",
  "publicKey": "MCowBQYDK2VwAyEAH7zP3kKoIl6sMypdAGg2+wspRty2GXK3R6W61BlSp98=",
  "minPackage": "0.5.0",
  "defaultIntervalHours": 6,
  "minIntervalMinutes": 5,
  "ttlDays": 30,
  "envelope": {
    "document": "the signed document, as a JSON string — the signature covers these exact bytes, so nothing has to agree on a canonical serialisation",
    "signature": { "alg": "ed25519", "keyId": "the signing key, pinned in the package", "value": "base64" }
  },
  "checks": [
    "the signature verifies against a key pinned in the package, never against the host it was downloaded from",
    "the serial never goes backwards, so replaying an older signed document achieves nothing",
    "the document has not expired, so a signer that goes quiet expires out rather than being trusted indefinitely",
    "the format is the one this package reads, and the document names this package",
    "every published pattern is refused unless it compiles, avoids repeating a group, and stays inside a time budget on a backtracking probe"
  ],
  "canAdd": [
    "secretPatterns", "responseValues", "pathPatterns", "shellMeta", "sqlMeta",
    "urlSchemes", "internalHosts", "sensitivePaths", "queryOperators",
    "pollutionKeys", "sinks", "sqlDrivers"
  ],
  "canSetPolicy": ["disabled", "severity"],
  "notes": [
    "Detections are additive only. A feed can lengthen a list; there is no way for it to shorten a built-in one, so a compromised signer cannot quietly delete a defence and leave the package reporting itself healthy.",
    "Policy is the exception and the sharp edge: it can switch a rule off or re-grade it. protect({ feed: { policy: false } }) takes the detections and refuses the policy, and every policy change is written to the host application's own stderr rather than only being visible here.",
    "A published sink names a module and method to watch, and picks one of the judges that already shipped in the package. A document cannot describe new behaviour, only new places to apply reviewed behaviour.",
    "Every failure fails open. No network, a bad signature, a replayed serial, an expired document — the rules already in force stay in force. amitista.com being unreachable is never a customer outage.",
    "The package sends nothing. The poll is a GET; no source, no traffic, no telemetry and no identifier leaves the customer's machine, and the feed service keeps no per-caller state at its end either.",
    "protect({ feed: false }) turns the whole mechanism off, and the package runs on the rules it shipped with."
  ]
};

export const VERIFICATION = {
  "runsAtStartup": true,
  "method": "a functional probe, not a heuristic",
  "detects": "runtime hooks that are attached to the package but not to the application — what happens in an ESM app started without the preload",
  "onFailure": "a named warning on stderr listing exactly which protections are inactive, and health() reports unhealthy",
  "why": "the dangerous state is not being unprotected, it is being unprotected while every log line says otherwise"
};

export const BASELINE_RULES = {
  "valueClasses": [
    {
      "name": "empty",
      "rank": 0
    },
    {
      "name": "digits",
      "rank": 1
    },
    {
      "name": "hex",
      "rank": 2
    },
    {
      "name": "uuid",
      "rank": 2
    },
    {
      "name": "alpha",
      "rank": 2
    },
    {
      "name": "alnum",
      "rank": 3
    },
    {
      "name": "slug",
      "rank": 4
    },
    {
      "name": "email",
      "rank": 4
    },
    {
      "name": "path",
      "rank": 5
    },
    {
      "name": "text",
      "rank": 6
    }
  ],
  "defaults": {
    "minSamples": 200,
    "warmupSamples": 50,
    "enforce": false,
    "frozenAtMaturity": true
  }
};

export const SHIELD_OPTIONS = [
  {
    "name": "mode",
    "default": "'monitor'",
    "purpose": "'monitor' or 'block'. Anything else throws at startup rather than quietly doing nothing."
  },
  {
    "name": "paths",
    "default": "null",
    "purpose": "Where your files legitimately live, as a path or a list of them. Declaring it changes the filesystem rule from \"does this look like traversal\" to \"does this resolve inside the directory you named\", which is the question with a right answer."
  },
  {
    "name": "blockPage",
    "default": "https://amitista.com/block",
    "purpose": "Where a refused browser navigation is sent. Change this — the default carries our name, on your refusal."
  },
  {
    "name": "headers",
    "default": "true",
    "purpose": "Applies a baseline set of security response headers, and HSTS when the request arrived over TLS."
  },
  {
    "name": "onFinding",
    "default": "stderr reporter",
    "purpose": "Called with every finding and the request that caused it. Point it at your own logger."
  },
  {
    "name": "ignore",
    "default": "() => false",
    "purpose": "Called with the finding and the request; return true to drop it. For the one route that legitimately does the alarming thing."
  },
  {
    "name": "rateLimit",
    "default": "enabled",
    "purpose": "An object of overrides, or false to turn the limiter off. Set trustProxy here if anything sits in front of you."
  },
  {
    "name": "shape",
    "default": "enabled",
    "purpose": "Payload rules: nesting depth, key count, array length, pollution keys, query operators."
  },
  {
    "name": "response",
    "default": "enabled",
    "purpose": "Leak, XSS, redirect, cookie and sendFile checks on the way out. Each can be switched off by name, and the scan limits are tunable."
  },
  {
    "name": "learn",
    "default": "enabled",
    "purpose": "The baseline layer. Reports only until you turn its enforcement on, and false disables it."
  },
  {
    "name": "verify",
    "default": "true",
    "purpose": "The startup self-test, and the one-time notice if your server still has node's default timeouts. Leave it on."
  },
  {
    "name": "feed",
    "default": "enabled",
    "purpose": "The signed rules feed. An object of overrides, or false for an install that never calls home."
  }
];

export const SHIELD_SETTINGS = [
  {
    "name": "rateLimit.trustProxy",
    "default": "false",
    "purpose": "true to read the leftmost forwarded address, or a number of proxies to count back from the right — the form a client cannot spoof by appending its own header. Behind nginx with this off, every request in the world is one client."
  },
  {
    "name": "rateLimit.onBlock",
    "default": "none",
    "purpose": "Called once when a client earns a temporary block. This is the hook that lets several workers share a decision without sharing a counter."
  },
  {
    "name": "rateLimit.distributedEnforce",
    "default": "false",
    "purpose": "Whether an endpoint-wide credential-stuffing verdict refuses as well as reports. Off by default: the finding is about the endpoint, not about the client in front of you."
  },
  {
    "name": "response.maxNodes",
    "default": "20000",
    "purpose": "How much of a reply the leak scan walks before it stops. Raise it for bulk endpoints, where the interesting row is not the first one."
  },
  {
    "name": "response.maxArray",
    "default": "1000",
    "purpose": "How many items of any one array the leak scan reads."
  },
  {
    "name": "learn.minSamples",
    "default": "200",
    "purpose": "How many requests a route needs before its profile freezes and judges at full severity."
  },
  {
    "name": "learn.warmupSamples",
    "default": "50",
    "purpose": "When a route starts being judged provisionally — reported one grade down, never enforced — instead of not at all."
  },
  {
    "name": "learn.enforce",
    "default": "false",
    "purpose": "Whether a mature route's deviations refuse in block mode. The highest false-positive risk in the package, so it stays off until you name it."
  }
];

export const SHIELD_SURFACE = [
  {
    "call": "protect(options)",
    "purpose": "The middleware. Mount it after your body parser and before your routes."
  },
  {
    "call": "errorHandler()",
    "purpose": "Shapes the refusal that the runtime layer throws from inside your handler. Mount it last."
  },
  {
    "call": "harden(server)",
    "purpose": "Header, request and keep-alive timeouts on the http server, where a slowloris is stopped. Nothing in a middleware can do this."
  },
  {
    "call": "bind(fn)",
    "purpose": "Wraps a callback so it keeps this request's context across a boundary the async context does not follow — a job queue, a worker, a listener registered at startup. Without it that work runs uninspected."
  },
  {
    "call": "block(client, ms)",
    "purpose": "Applies a temporary block by hand, or one another worker decided on and announced through rateLimit.onBlock."
  },
  {
    "call": "findings()",
    "purpose": "The recent findings, newest last. A ring buffer of 500, so on a busy process it is a window rather than the whole history."
  },
  {
    "call": "stats()",
    "purpose": "Totals since the process started, which the ring buffer cannot roll away: reported, blocked, suppressed, counts by rule and severity, and dropped — how many findings have aged out of findings()."
  },
  {
    "call": "health()",
    "purpose": "The last self-test result: whether the hooks are attached to your application, and which protections are inactive if they are not."
  },
  {
    "call": "baselines()",
    "purpose": "What the learning layer knows: how many routes it is watching, how many have matured, how many are still warming up."
  },
  {
    "call": "feed() / refreshFeed()",
    "purpose": "The rules feed's status — serial, last fetch, what it added — and a way to pull it now instead of on the timer."
  },
  {
    "call": "scan(dir) / render(report)",
    "purpose": "The one-off source analysis, and its human-readable report. The same thing the shield command runs, callable from a script."
  },
  {
    "call": "stop()",
    "purpose": "Removes every hook, stops the timers and saves what the baseline learned. For tests, and for a process that unmounts cleanly."
  }
];

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
