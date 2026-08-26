export const DECLINES = [
  {
    icon: 'user-x',
    hard: true,
    title: 'Anything aimed at a specific person',
    body: 'Scrapers pointed at one individual, tools for tracking someone, mass-reporting systems, or a site whose purpose is to make life difficult for a named person. This holds regardless of what they are supposed to have done.',
  },
  {
    icon: 'banknote',
    hard: true,
    title: 'Projects that need somebody to be deceived to work',
    body: 'Fake stores, fake reviews, cloned checkout pages, sites that collect card details or logins under somebody else’s name, and investment schemes that pay out of the next deposit. If the business model needs the user to misunderstand something, the build does not start.',
  },
  {
    icon: 'copy',
    hard: true,
    title: 'Reselling somebody else’s work as yours',
    body: 'Leaked scripts, cracked resources, escrow bypasses, or a rebrand of a product somebody else built and still sells. Somebody made that and still eats from it. If you bring us something to “clean up” and we cannot see where it came from, we will ask, and the answer decides whether we carry on.',
  },
  {
    icon: 'bot',
    title: 'Discord bots, for anybody',
    body: 'The bot in our Discord was written by Blxr, for us, and it runs one server. There is no commission, no source, no white label version and no smaller cut of the one we run. Bot enquiries go to Essential Bots, our premium partner, at discord.gg/ebots, and you deal with them directly. If the bot is one part of something larger, a site, a panel, a store or a game server it has to talk to, that part is ours and worth a conversation.',
  },
  {
    icon: 'file-warning',
    title: 'Work on spec, and competitive pitches',
    body: 'We do not build a version first and find out afterwards whether you liked it. The first stage is paid, short, and yours to keep whatever happens next. If you are choosing between studios, choose on what we have already built rather than on who will work for free the longest.',
  },
  {
    icon: 'ghost',
    title: 'Being your development team without being told so',
    body: 'A fixed project is a fixed project. If what you actually need is somebody on hand every week indefinitely, that is a different arrangement with a different price, and we would rather agree it up front than discover it four months in when the scope stopped having edges.',
  },
  {
    icon: 'wrench',
    title: 'Taking over a codebase we are not allowed to change',
    body: 'We are happy to inherit somebody else’s work — most rebuilds start that way. What does not work is inheriting it while being told which parts are untouchable, when those parts are the reason it is broken. If we cannot fix the cause, we will say so rather than sell you a year of patches.',
  },
  {
    icon: 'clock',
    title: 'Deadlines that were already impossible when you called',
    body: 'We will tell you if a date cannot be hit rather than take the deposit and find out together. Sometimes there is a smaller version that does make the date, and we will say what it is. Sometimes there is not.',
  },
];

export const PREAMBLE =
  'Most studios only publish what they do. That leaves you to find out where the edges are after money has changed hands, which is the expensive way for both of us. Ours is a short list, and short on purpose — we take on almost anything, and where we stop is a person. If the build only works because somebody real is hurt, tracked or misled, it is not ours to make.';

export const HARD_INTRO =
  'These are three versions of the same sentence. Somebody is on the other end of the build, and they did not agree to be there.';

export const CLOSING =
  'Nothing here is a judgement on anyone who asks — plenty of these arrive from people who had not thought about it that way, and that is a fine conversation to have. It is only a list of things we will not be the ones to build. Everything else is a conversation about scope and a date, not about whether we will do it. If your project is not on the list, and you are not sure, ask. The answer is almost always yes.';
