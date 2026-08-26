import React from 'react';
import { ArrowLeft, Send, Paperclip } from 'lucide-react';
import { Button, Check, Field, Notice, Panel, TextArea, TextInput } from '../ui';

function answerFor(category) {
  const start = {};
  for (const field of category.fields) start[field.id] = '';
  return start;
}

function defaultUrgency(category) {
  if (!category.urgency) return '';
  return (category.urgency.find((entry) => entry.default) || category.urgency[1] || category.urgency[0])
    .value;
}

export default function NewTicket({ categories, busy, error, onOpen, onCancel }) {
  const [picked, setPicked] = React.useState(categories[0]?.key ?? '');
  const category = categories.find((entry) => entry.key === picked) ?? categories[0];

  const [answers, setAnswers] = React.useState(() => answerFor(category));
  const [urgency, setUrgency] = React.useState(() => defaultUrgency(category));
  const [checks, setChecks] = React.useState([]);

  const choose = (key) => {
    const next = categories.find((entry) => entry.key === key);
    if (!next) return;
    setPicked(key);
    setAnswers(answerFor(next));
    setUrgency(defaultUrgency(next));
    setChecks([]);
  };

  const toggle = (value) =>
    setChecks((held) => (held.includes(value) ? held.filter((v) => v !== value) : [...held, value]));

  const missing = category.fields.some((field) => field.required && !answers[field.id]?.trim());
  const undeclared = Boolean(category.checks?.required) && checks.length === 0;

  function submit(event) {
    event.preventDefault();
    if (missing || undeclared || busy) return;
    onOpen({
      category: category.key,
      ...answers,
      ...(category.urgency ? { urgency } : {}),
      ...(category.checks ? { checks } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-wide text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to your tickets
        </button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      <Panel title="What do you need?">
        <div className="grid gap-3 sm:grid-cols-2 p-6">
          {categories.map((entry) => {
            const current = entry.key === category.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => choose(entry.key)}
                aria-pressed={current}
                className={`text-left border px-4 py-3 transition-colors ${
                  current
                    ? 'border-purple-500/60 bg-purple-500/10'
                    : 'border-[#282832] bg-[#0a0a0d] hover:bg-[#111115]'
                }`}
              >
                <span className="block text-[13px] font-semibold text-white">{entry.label}</span>
                <span className="block text-[12px] text-neutral-400 font-normal mt-1">
                  {entry.blurb}
                </span>
                {entry.confidential && (
                  <span className="block text-[11px] text-amber-300 font-normal mt-2">
                    Only senior staff can see this one.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={category.label}>
        <div className="flex flex-col gap-5 p-6">
          {category.fields.map((field) => (
            <Field key={field.id} label={field.label} hint={field.hint} htmlFor={`tk-${field.id}`}>
              {field.para ? (
                <TextArea
                  id={`tk-${field.id}`}
                  rows={5}
                  maxLength={field.max}
                  required={field.required}
                  placeholder={field.placeholder ?? ''}
                  value={answers[field.id] ?? ''}
                  onChange={(event) =>
                    setAnswers((held) => ({ ...held, [field.id]: event.target.value }))
                  }
                />
              ) : (
                <TextInput
                  id={`tk-${field.id}`}
                  maxLength={field.max}
                  required={field.required}
                  placeholder={field.placeholder ?? ''}
                  value={answers[field.id] ?? ''}
                  onChange={(event) =>
                    setAnswers((held) => ({ ...held, [field.id]: event.target.value }))
                  }
                />
              )}
            </Field>
          ))}

          {category.urgency && (
            <Field
              label="How urgent is this?"
              hint="Staff can change this, so pick what is actually true."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {category.urgency.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setUrgency(entry.value)}
                    aria-pressed={urgency === entry.value}
                    className={`text-left border px-4 py-2.5 transition-colors ${
                      urgency === entry.value
                        ? 'border-purple-500/60 bg-purple-500/10'
                        : 'border-[#282832] bg-[#0a0a0d] hover:bg-[#111115]'
                    }`}
                  >
                    <span className="block text-[12px] font-semibold text-white">{entry.label}</span>
                    <span className="block text-[11px] text-neutral-500 font-normal mt-0.5">
                      {entry.description}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {category.checks && (
            <Field label={category.checks.label} hint={category.checks.hint}>
              <div className="flex flex-col gap-2">
                {category.checks.options.map((option) => (
                  <Check
                    key={option.value}
                    checked={checks.includes(option.value)}
                    onChange={() => toggle(option.value)}
                    label={option.label}
                  />
                ))}
              </div>
            </Field>
          )}

          {category.uploads && (
            <div className="flex items-start gap-3 border border-[#282832] bg-[#0a0a0d] px-4 py-3">
              <Paperclip className="h-3.5 w-3.5 text-neutral-500 mt-0.5 shrink-0" strokeWidth={2} />
              <p className="text-[12px] text-neutral-400 font-normal leading-relaxed">
                Files cannot be attached from here yet. Open the ticket, then drop screenshots or
                logs into its channel in Discord.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" tone="solid" disabled={busy || missing || undeclared}>
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Opening…' : 'Open the ticket'}
            </Button>
            <p className="text-[12px] text-neutral-500 font-normal">
              This opens a private channel in the studio server with the team.
            </p>
          </div>
        </div>
      </Panel>
    </form>
  );
}
