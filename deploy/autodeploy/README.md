# Deploying from main

What is on `main` becomes what is running, without anyone typing a deploy
command. Merge, wait a few minutes, it is live.

## Install

```sh
install -m 644 deploy/autodeploy/amitista-autodeploy.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now amitista-autodeploy.timer
```

Check it before trusting it:

```sh
deploy/autodeploy/amitista-autodeploy.sh --dry-run
```

## How it decides

Pull-based. The server asks GitHub every five minutes; GitHub never reaches in.
No credential that can touch this machine is stored off it, and no port is
opened.

Three things have to be true before anything is touched:

1. `origin/main` has moved since the last deploy.
2. **CI is green for that exact commit.** A commit CI has not reported on yet is
   left alone and picked up on a later run. This is the whole gate — there is no
   human approval step, because with one person holding the account, approving
   your own diff catches nothing a passing suite does not. What it stops is a
   broken build going live because it was merged at two in the morning.
3. The change actually touches that component. A copy edit on the website never
   restarts the exchange bot.

## What it deploys, and how

| Component | How | If it fails |
| --- | --- | --- |
| website | `deploy-local.sh` — build, artefact checks, new release, symlink swap | symlink goes back to the release that was serving |
| studio bot | repo *is* the runtime, so `npm ci` and restart | reported; the bot units are left for you |
| enchange | source copied to `/opt/enchange`, `npm ci` as the `enchange` user, restart | previous source restored from a snapshot and restarted |
| admin-api, api-gateway | each service's own `install.sh` | previous tree restored from a snapshot and restarted |
| shield | `feed/install.sh` and `evaluator/install.sh` | reported |

`ai-relay` and `contact-relay` have no `install.sh`. If a deploy sees changes
under them it says so and leaves them; they are still copy-and-restart by hand.

### Why enchange is copied rather than pulled

It runs as its own user, which cannot read into the bot's directory and should
not be able to — `data/house-keys.json` is the house wallet and that separation
is what keeps the studio bot away from it. So the repository holds the source
and `/opt/enchange` receives it. `data/`, `.env` and `node_modules` are never
overwritten: state, secrets and installed packages belong to the live host.

## Redeploying one thing

The timer only reacts to `main` moving. If the deployed tree drifts on its own —
someone edits `/opt` by hand, or a component was behind before this existed —
nothing triggers, because nothing changed in git. That is what `--only` is for:

```sh
deploy/autodeploy/amitista-autodeploy.sh --only enchange
```

Components: `website`, `studio-bot`, `enchange`, `admin-api`, `api-gateway`,
`shield`. It deploys from the current checkout and takes the same snapshot and
rollback path as an automatic run.

## Which commit made the site slower

A release directory is a timestamp and nothing in it says where it came from, so
a measurement of the live site could be dated but never blamed. Publishing a
release now writes a line naming the commit it was built from:

```
/var/www/amitista.com/releases.jsonl
```

Beside the releases rather than inside one, because the prune keeps only the
newest five directories and would take the record with it — and outside what
nginx serves, which is why the full sha can be written down at all. Only a
release that passed verification is recorded: one that was rolled back never
served anybody, and a commit in the ledger that no measurement can belong to is
worse than a gap.

Publishing also kicks off `amitista-perf.service` detached, so every release is
measured rather than whichever ones the six-hourly timer happens to land on.
`github-state.py` then joins the three sides — the monitor's readings, this
ledger, and the commits and pull requests it already collects — into the
snapshot the panel reads, under **GitHub → Site speed**. Nothing extra is asked
of GitHub for any of it.

The join declines to guess. A release measured while the checkout was dirty is
flagged and nobody is named for it; a reading taken before the ledger existed is
counted but not attributed; a change smaller than both an absolute floor and a
tenth of what it was is not called a regression at all.

## Watching it

```sh
systemctl list-timers amitista-autodeploy.timer
journalctl -u amitista-autodeploy.service -n 50
systemctl start amitista-autodeploy.service     # deploy now, do not wait
```

Build output and installer logs land in `/var/lib/amitista/autodeploy/`, one
file per component per run, alongside the rollback snapshots.

## Turning it off

```sh
systemctl disable --now amitista-autodeploy.timer
```

Deploys then go back to being the manual commands in each component's own
directory. Nothing else changes.

## Working straight on main

The maintainer does not open a pull request to themselves. What gates a deploy
is CI going green on the commit, not a review, so pushing to `main` is a
supported way to work and loses nothing while one person holds the account:

```sh
git config amitista.allowMainPush true      # once per clone
```

The suites and the credential scan still run on every push — those are what
actually stop a bad push, and turning them off is a different decision entirely.
The guard stays on by default for anyone who has not set the flag.

A direct push that fails CI leaves `main` red and **deploys nothing**: the gate
holds and production stays on the last commit that passed. Fix forward.

## The thing to know

Auto-deploy means merging to `main` runs code as root on this server. `main` has
no server-side protection on GitHub's Free plan, so the gate is CI plus the
pre-push hook in each repository — the hook is advisory and `--no-verify` walks
past it. If GitHub access ever widens beyond one person, that is the moment to
put required status checks on `main` rather than relying on this.
