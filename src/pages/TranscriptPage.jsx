import React from 'react';
import { Download, FileText, Link2, Lock, MessagesSquare, Paperclip, Search, Users } from 'lucide-react';
import { Avatar, Chip, Conversation, formatDay, formatStamp } from '../components/transcript/Conversation';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { STUDIO_NAME } from '../siteConfig';

const ENDPOINT = '/api/transcript';
const KIND_LABELS = {
  ticket: 'Support ticket',
  project: 'Project',
  application: 'Application',
  channel: 'Channel',
};

function codeFromLocation() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname.replace(/\/+$/, '');
  const found = /^\/t\/([A-Za-z0-9-]{5,80})$/.exec(path);
  return found ? found[1] : '';
}

function Result({ doc, code }) {
  const [copied, setCopied] = React.useState(false);
  const meta = doc.transcript || {};
  const stats = doc.stats || {};

  const copy = React.useCallback(async () => {
    const link = meta.url || (typeof window !== 'undefined' ? window.location.href : '');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [meta.url]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="border border-[#282832] bg-[#0a0a0d]">
        <div className="border-b border-[#17171d] px-6 py-7 sm:px-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {meta.ref && <span className="font-mono text-[12px] tracking-wider text-purple-300/90">{meta.ref}</span>}
            <span className="inline-flex items-center border border-[#282832] bg-[#111118] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-neutral-400">
              {KIND_LABELS[meta.kind] || 'Transcript'}
            </span>
          </div>

          <h1 className="break-words text-[26px] font-light leading-tight text-white sm:text-[30px]">
            {meta.subject || `#${doc.channel?.name || 'conversation'}`}
          </h1>

          <p className="mt-3 text-[13px] font-normal leading-relaxed text-neutral-500">
            {doc.guild?.name ? `${doc.guild.name} · ` : ''}
            {doc.channel?.name ? `#${doc.channel.name}` : ''}
            {meta.closedAt ? ` · closed ${formatStamp(meta.closedAt)}` : ''}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Chip icon={MessagesSquare}>
              {stats.messages ?? meta.messages ?? 0} message{(stats.messages ?? meta.messages) === 1 ? '' : 's'}
            </Chip>
            <Chip icon={Users}>
              {stats.participants ?? meta.participants ?? 0} {(stats.participants ?? meta.participants) === 1 ? 'person' : 'people'}
            </Chip>
            {Boolean(meta.attachments) && <Chip icon={Paperclip}>{meta.attachments} file{meta.attachments === 1 ? '' : 's'}</Chip>}
            {Boolean(meta.openedAt) && <Chip icon={FileText}>opened {formatDay(meta.openedAt)}</Chip>}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`${ENDPOINT}/file?code=${encodeURIComponent(code)}`}
              className="inline-flex items-center justify-center gap-2 border border-purple-500/40 bg-purple-500/15 px-5 py-2.5 text-[13px] font-semibold tracking-wide text-white transition-colors hover:bg-purple-500/25"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Download a copy
            </a>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center justify-center gap-2 border border-[#282832] bg-[#0a0a0d] px-5 py-2.5 text-[13px] font-semibold tracking-wide text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white"
            >
              <Link2 className="h-4 w-4" strokeWidth={2} />
              {copied ? 'Link copied' : 'Copy the link'}
            </button>
          </div>
        </div>

        {doc.participants?.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-3 border-b border-[#17171d] px-6 py-5 sm:px-8">
            {doc.participants.map((person) => (
              <span key={person.id} className="inline-flex items-center gap-2.5">
                <Avatar name={person.name} avatar={person.avatar} className="h-6 w-6 rounded-full" />
                <span className="text-[13px] text-neutral-300">{person.name}</span>
                <span className="text-[12px] text-neutral-600 tabular-nums">{person.count}</span>
              </span>
            ))}
          </div>
        )}

        <Conversation messages={doc.messages || []} />
      </div>

      <p className="text-[13px] font-normal leading-relaxed text-neutral-500">
        This page is the whole conversation, kept by {STUDIO_NAME}. Anyone holding the link can read it, so treat it
        the way you would the ticket itself. Something look wrong?{' '}
        <a href="/contact" className="text-neutral-300 underline underline-offset-4 hover:text-white">
          Get in touch
        </a>
        {meta.ref ? ` quoting ${meta.ref}.` : '.'}
      </p>
    </div>
  );
}

export default function TranscriptPage() {
  const [code] = React.useState(codeFromLocation);
  const [doc, setDoc] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(true);

  React.useEffect(() => {
    let live = true;

    if (!code) {
      setBusy(false);
      setError('That is not a transcript link.');
      return undefined;
    }

    (async () => {
      try {
        const response = await fetch(`${ENDPOINT}?code=${encodeURIComponent(code)}`, {
          headers: { Accept: 'application/json' },
        });
        const body = await response.json().catch(() => ({}));
        if (!live) return;

        if (response.ok && body.transcript) {
          setDoc(body);
          setError(null);
        } else {
          setDoc(null);
          setError(
            response.status === 429
              ? 'That is a lot of lookups. Give it a few minutes and try again.'
              : typeof body.message === 'string' && body.message
                ? body.message
                : 'No transcript matches that link.',
          );
        }
      } catch {
        if (live) {
          setDoc(null);
          setError('We could not reach the archive. Try again in a moment.');
        }
      } finally {
        if (live) setBusy(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [code]);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#060608] font-sans text-white">
      <Header />

      <main id="main" tabIndex={-1} className="flex w-full flex-1 justify-center bg-[#060608] focus:outline-none">
        <section className="relative flex w-full max-w-[1480px] flex-col border-x border-[#282832]">
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10 px-6 py-16 sm:px-8 sm:py-24">
            <Reveal>
              <div>
                <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                  {STUDIO_NAME} transcript
                </p>
                {!doc && (
                  <h1 className="mt-5 text-[34px] font-light leading-[1.1] text-white sm:text-[44px]">
                    {busy ? 'Opening the transcript…' : 'This transcript'}
                  </h1>
                )}
              </div>
            </Reveal>

            {busy && (
              <div className="border border-[#282832] bg-[#0a0a0d] px-6 py-10">
                <p className="text-[14px] font-normal text-neutral-500">Fetching the conversation…</p>
              </div>
            )}

            {!busy && error && (
              <Reveal>
                <div className="flex gap-3.5 border border-[#282832] bg-[#0a0a0d] px-6 py-6">
                  <Search className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" strokeWidth={2} />
                  <div>
                    <p className="text-[14px] font-normal text-neutral-200">{error}</p>
                    <p className="mt-1.5 text-[13px] font-normal leading-relaxed text-neutral-500">
                      Transcript links are long and easy to break in half when they are pasted. Check the whole link,
                      or{' '}
                      <a href="/contact" className="text-neutral-300 underline underline-offset-4 hover:text-white">
                        ask us
                      </a>{' '}
                      to send it again.
                    </p>
                  </div>
                </div>
              </Reveal>
            )}

            {!busy && doc && <Result doc={doc} code={code} />}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
