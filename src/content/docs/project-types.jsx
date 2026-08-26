import React from 'react';
import { H2, P, UL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'game-servers': () => (
    <>
      <P>
        This page applies if your project includes a FiveM server, its scripts, or the
        systems behind one. Everything here assumes the server is yours and hosted on
        machines you control.
      </P>
      <H2 id="parts">What the build is made of</H2>
      <Table
        head={['Part', 'What it does']}
        rows={[
          ['Server artifacts', 'The FiveM runtime itself. Updated separately from your build.'],
          ['Resources', 'The scripts and systems — ours, and any third-party ones you use.'],
          ['server.cfg', 'Which resources start, in which order, with which settings.'],
          ['Database', 'Player, character and inventory data. The part you cannot recreate.'],
          ['Keys and licences', 'The server key, plus any paid resource licences bound to it.'],
        ]}
      />
      <H2 id="starting">Starting and stopping</H2>
      <P>
        Start the server through whatever process manager the handover notes describe, so
        that it restarts by itself after a crash or a reboot. Console commands can be typed
        live; changes to <Code>server.cfg</Code> need a restart to take.
      </P>
      <Pre label="Server console">{`refresh              # rescan the resources folder
ensure resource-name # start or restart one resource
stop resource-name   # stop it
restart resource-name`}</Pre>
      <H2 id="updates">Updating artifacts</H2>
      <P>
        Artifact updates fix security issues and occasionally break resources. Update on a
        copy first if you have one, keep the previous artifacts folder until the new one has
        run a full evening, and never do it an hour before a busy session.
      </P>
      <H2 id="database">The database is the project</H2>
      <P>
        Scripts can be reinstalled from the repository. Player data cannot be recreated from
        anything. Take automated backups, keep at least one copy off the server, and restore
        one occasionally to confirm the backups are real — see{' '}
        <A href="/docs/backups">Backups and recovery</A>.
      </P>
      <H2 id="performance">Performance</H2>
      <UL>
        <LI>Watch resource timings in the console; one badly written script can cost more than everything else combined.</LI>
        <LI>Add resources one at a time so you know which one changed the numbers.</LI>
        <LI>Third-party resources vary enormously in quality — we can only support what we can read.</LI>
      </UL>
      <Note title="Rules we work within">
        <p>
          We build servers, systems and scripts. We do not build or support anything that
          breaks a platform&rsquo;s terms — including circumventing licence checks on paid
          resources or evading a ban.
        </p>
      </Note>
    </>
  ),
  'discord-bots': () => (
    <>
      <P>
        A bot is a small program that has to stay running somewhere, holding a token that
        proves it is yours. Most of what goes wrong with one is about those two facts.
      </P>
      <H2 id="ownership">Ownership of the application</H2>
      <P>
        The bot lives under a Discord application in the developer portal. That application
        should belong to your account or to a team you own, not to ours — otherwise the bot
        is only yours for as long as we are reachable.
      </P>
      <H2 id="token">The token</H2>
      <P>
        The token is the bot&rsquo;s password. Anyone holding it can act as the bot in every
        server it has joined. It goes in an environment variable on the machine that runs
        the bot, and nowhere else.
      </P>
      <Pre label=".env on the server">{`DISCORD_TOKEN=your-token-here
CLIENT_ID=your-application-id`}</Pre>
      <P>
        If a token is ever pasted into a channel, a screenshot or a repository, regenerate
        it in the portal. Deleting the message does not help — bots that scrape for leaked
        tokens are faster than you are.
      </P>
      <H2 id="hosting">Hosting</H2>
      <Table
        head={['Where it runs', 'Suits']}
        rows={[
          ['A small VPS', 'Most bots. Cheap, predictable, and yours.'],
          ['A container platform', 'Bots that need to scale or deploy from a repository automatically.'],
          ['A spare machine at home', 'Testing only. Your power cut is the bot going offline.'],
        ]}
      />
      <P>
        Whatever it runs on, use a process manager so the bot restarts after a crash and
        after the machine reboots.
      </P>
      <H2 id="permissions">Permissions and intents</H2>
      <P>
        Invite the bot with the narrowest permissions that let it do its job — an
        administrator bot is one compromised token away from an emptied server. Some
        features also need privileged intents switched on in the portal; if the bot cannot
        see members or read message content, that is usually why.
      </P>
      <Note title="Rate limits">
        <p>
          Discord limits how fast a bot may act, and a bot that ignores that gets
          temporarily blocked. If a command that worked in testing stalls with a busy
          server, rate limiting is the first thing to check.
        </p>
      </Note>
    </>
  ),
  'desktop-apps': () => (
    <>
      <P>
        This page applies if your project includes a desktop tool. Desktop software differs
        from a website in one important way: every copy is a version someone installed, and
        it stays that version until it is replaced.
      </P>
      <H2 id="what-you-get">What is handed over</H2>
      <UL>
        <LI>The installer or portable executable, built for the platforms agreed.</LI>
        <LI>The source, with the command that produces that build.</LI>
        <LI>Notes on any signing certificate, if the build is signed.</LI>
      </UL>
      <H2 id="warnings">Why Windows warns about it</H2>
      <P>
        Unsigned applications get a SmartScreen warning saying the publisher is unknown.
        Nothing is wrong with the build; Windows simply has no proof of who made it. A code
        signing certificate removes the warning, costs money annually, and has to be issued
        to a real business identity. Whether that is worth it depends on who installs it.
      </P>
      <H2 id="updates">Updates</H2>
      <P>
        Unlike a website, an update reaches nobody until they install it. Either build in an
        update check, or accept that you will be supporting whichever old version someone
        still has. Version each release clearly so a support conversation can start with
        which one they are running.
      </P>
      <H2 id="data">Where the app keeps its data</H2>
      <P>
        Settings and local data live in the user&rsquo;s own application data folder, not
        beside the executable — a program that writes to its install directory fails the
        moment it is installed somewhere protected. Your handover notes give the exact path,
        which is what to back up and what to delete for a clean reinstall.
      </P>
      <Note title="Antivirus false positives">
        <p>
          Freshly built, unsigned executables are sometimes flagged by antivirus software
          purely because nobody has seen the file before. If it happens, tell us — we can
          usually submit it for review or adjust how it is packaged.
        </p>
      </Note>
    </>
  ),
  'apis-integrations': () => (
    <>
      <P>
        Most projects talk to something else: a payment provider, a mail service, a CRM, a
        map. Each connection is a dependency with its own keys, its own limits and its own
        outages.
      </P>
      <H2 id="keys">Keys</H2>
      <P>
        Third-party accounts should be registered in your name with us added as
        collaborators, so the keys are yours and stay yours. Where a service issues both a
        public and a secret key, only the public one may reach the browser — see{' '}
        <A href="/docs/configuration">Configuration</A>.
      </P>
      <Table
        head={['Key type', 'Safe in the browser?', 'Typical use']}
        rows={[
          ['Publishable / public', 'Yes', 'Identifying your account to a service from the front end'],
          ['Secret / server', 'No', 'Charging a card, sending mail, reading private data'],
          ['Webhook signing secret', 'No', 'Proving an incoming request really came from the service'],
        ]}
      />
      <H2 id="limits">Rate limits and quotas</H2>
      <P>
        Every API caps how often you may call it, and most free tiers cap how much you may
        use per month. Both are invisible until you cross them, at which point the feature
        stops working while everything else looks fine. Know which of your integrations have
        a free tier and what happens when it runs out.
      </P>
      <H2 id="failure">When a service goes down</H2>
      <P>
        An integration will fail eventually, and the project should survive it: show a clear
        message, keep the rest of the page working, and never lose what someone typed. Check
        the provider&rsquo;s status page before assuming the fault is in your build.
      </P>
      <H2 id="webhooks">Webhooks</H2>
      <P>
        A webhook is the service calling you instead of the other way round — a payment
        succeeded, a form was submitted. Two rules matter: verify the signature so nobody
        can fake one, and handle a repeat of the same event without doing the work twice,
        because providers retry.
      </P>
      <Note title="Changing a key">
        <p>
          Rotating a key takes effect the moment you save it at the provider. Update it on
          the host and redeploy in the same sitting, or the site spends the gap talking to a
          service that no longer recognises it.
        </p>
      </Note>
    </>
  ),
};
