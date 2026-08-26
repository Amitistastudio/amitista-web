import React from 'react';
import { ArrowRight, ScanSearch, ShieldCheck } from 'lucide-react';
import { lookUpProject } from '../../../lib/admin';
import { Button, Empty, Field, Panel, Pill, TextInput } from '../ui';
import { StageRail, ago, on } from './shared';
import { IdChip, KIND_WORDS } from './ids';

const MIN = 6;

function Card({ card, onOpen }) {
  const closed = card.status === 'closed';

  return (
    <div className="border-t border-[#17171d]">
      <div className="px-4 sm:px-6 py-5">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <IdChip code={card.matched} label={KIND_WORDS[String(card.matched).slice(0, 3)]} />
          <Pill tone={closed ? 'neutral' : card.held ? 'amber' : 'purple'}>{card.stageLabel}</Pill>
          {card.held && <Pill tone="amber">not moving</Pill>}
          {card.retired && <Pill>channel gone</Pill>}
        </div>

        <h3 className="text-[17px] font-light leading-tight text-white break-words">
          {card.name || 'Untitled project'}
        </h3>
        <p className="mt-1.5 text-[12px] font-normal text-neutral-500">
          {card.category}
          {card.client ? ` · ${card.client}` : ''}
          {card.lead ? ` · led by ${card.lead}` : ' · no lead yet'}
        </p>

        <div className="mt-4 max-w-[420px]">
          <StageRail
            step={card.step}
            steps={card.steps}
            held={card.held}
            closed={closed}
            delivered={Boolean(card.finished)}
          />
          <p className="mt-2 text-[12px] font-normal text-neutral-500">
            Step {card.step} of {card.steps}
            {card.stageNote ? ` · ${card.stageNote}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#17171d] lg:grid-cols-4">
        <Cell label="Opened" value={on(card.openedAt)} />
        <Cell label="Last moved" value={ago(card.updatedAt)} />
        <Cell label={closed ? 'Closed' : 'State'} value={closed ? on(card.closedAt) : 'Open'} />
        <Cell label="Who can see it" value={card.visibility} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#17171d] px-4 sm:px-6 py-4">
        <Button type="button" tone="solid" onClick={() => onOpen(card.id)}>
          Open the full project
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Button>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-normal text-neutral-600">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
          Brief, budget, notes and files are not shown here.
        </span>
      </div>
    </div>
  );
}

function Cell({ label, value }) {
  return (
    <div className="bg-[#0a0a0d] px-5 py-4">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
        {label}
      </span>
      <p className="mt-1.5 text-[13px] font-normal leading-snug text-neutral-200">{value || '—'}</p>
    </div>
  );
}

export default function Lookup({ onOpen }) {
  const [query, setQuery] = React.useState('');
  const [card, setCard] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const bare = query.replace(/[^0-9A-Za-z]/g, '');
  const ready = bare.length >= MIN;

  async function look(event) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const found = await lookUpProject(query.trim());
      setCard(found.card);
    } catch (failure) {
      setCard(null);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Quick lookup" icon={ScanSearch}>
      <form onSubmit={look} className="px-4 sm:px-6 py-5 flex flex-col gap-4">
        <Field
          label="Project, order or request ID"
          htmlFor="order-lookup"
          hint="The first six characters are enough — PRJ-4K2M or just 4K2M9Q."
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-[280px]">
              <TextInput
                id="order-lookup"
                value={query}
                autoComplete="off"
                spellCheck={false}
                placeholder="PRJ-4K2M-9QX7"
                disabled={busy}
                onChange={(event) => setQuery(event.target.value.toUpperCase())}
                className="font-mono tracking-[0.12em]"
              />
            </div>
            <Button type="submit" tone="solid" disabled={!ready || busy}>
              {busy ? 'Looking…' : 'Look it up'}
            </Button>
            {query && !ready && (
              <span className="text-[12px] font-normal text-neutral-500">
                {MIN - bare.length} more character{MIN - bare.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </Field>

        <p className="max-w-xl text-[12px] font-normal leading-relaxed text-neutral-500">
          A compact, safe view for answering “where is my project?” without opening the whole
          record. It never shows the brief, the budget, internal notes or files.
        </p>
      </form>

      {error && !card && <Empty>{error}</Empty>}
      {card && <Card card={card} onOpen={onOpen} />}
    </Panel>
  );
}
