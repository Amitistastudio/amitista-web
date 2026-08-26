import React from 'react';
import {
  Palette,
  Plus,
  Save,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  UploadCloud,
  Eye,
} from 'lucide-react';
import { DEFENCES } from '../../../content/shieldRules';
import { STUDIO_NAME } from '../../../siteConfig';
import { deleteBrand, formatAgo, publishBrands, saveBrand } from '../../../lib/admin';
import {
  Button,
  Check as CheckBox,
  Empty,
  Field,
  Notice,
  Panel,
  Pill,
  Select,
  TextInput,
} from '../ui';
import { Confirm } from '../api/shared';

const BLANK = {
  slug: '',
  name: '',
  accent: '#e0245e',
  contact: '',
  credit: true,
  note: '',
};

const SAMPLE_REFERENCE = 'AMS-4F2A-91C7';

function previewUrl(page, brand, rule, retry) {
  if (typeof page !== 'string' || !((page.startsWith('/') && !page.startsWith('//')) || page.startsWith('https://'))) {
    page = '/block';
  }
  const params = new URLSearchParams();
  params.set('ref', SAMPLE_REFERENCE);
  if (rule) params.set('rule', rule);
  if (retry) params.set('retry', String(retry));
  if (brand) params.set('brand', brand);
  params.set('preview', '1');
  return `${page}?${params.toString()}`;
}

function CopyLink({ value }) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }, [value]);

  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 min-w-0 border border-[#282832] bg-[#060608] px-3 py-2.5 text-[12px] text-neutral-300 font-mono break-all">
        {value}
      </code>
      <Button type="button" onClick={copy} className="shrink-0">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function Editor({ brand, facts, onSaved, onError, onCancel }) {
  const [form, setForm] = React.useState(() => ({ ...BLANK, ...(brand ?? {}) }));
  const [busy, setBusy] = React.useState(false);
  const fresh = !brand;

  const set = (name, value) => setForm((held) => ({ ...held, [name]: value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const answer = await saveBrand({
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        accent: form.accent,
        contact: form.contact.trim(),
        credit: form.credit,
        note: form.note.trim(),
      });
      onSaved(answer);
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const url = form.slug.trim()
    ? `${facts?.page ?? 'https://amitista.com/block'}?brand=${form.slug.trim().toLowerCase()}`
    : null;

  return (
    <form onSubmit={submit} noValidate className="px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <Field
          label="Reference"
          htmlFor="brand-slug"
          hint="Lowercase letters, digits and hyphens. This is what goes in the customer's URL, so it is visible to their blocked visitors — use their product name, not an internal one."
        >
          <TextInput
            id="brand-slug"
            value={form.slug}
            readOnly={!fresh}
            maxLength={32}
            autoComplete="off"
            spellCheck="false"
            onChange={(event) => set('slug', event.target.value)}
          />
        </Field>

        <Field
          label="Shown as"
          htmlFor="brand-name"
          hint="The name a blocked visitor reads. Their name, not yours."
        >
          <TextInput
            id="brand-name"
            value={form.name}
            maxLength={48}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>

        <Field label="Accent" htmlFor="brand-accent" hint="Used for the refusal banner.">
          <div className="flex items-center gap-3">
            <input
              id="brand-accent"
              type="color"
              value={form.accent}
              onChange={(event) => set('accent', event.target.value)}
              className="h-11 w-14 shrink-0 border border-[#282832] bg-[#111115] cursor-pointer"
            />
            <TextInput
              value={form.accent}
              maxLength={7}
              spellCheck="false"
              onChange={(event) => set('accent', event.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Where to complain"
          htmlFor="brand-contact"
          hint="An https link or a mailto: address of theirs. Empty sends false positives to the studio instead."
        >
          <TextInput
            id="brand-contact"
            value={form.contact}
            maxLength={200}
            spellCheck="false"
            placeholder="https://example.com/support"
            onChange={(event) => set('contact', event.target.value)}
          />
        </Field>

        <Field label="Note" htmlFor="brand-note" hint="Yours. Never published.">
          <TextInput
            id="brand-note"
            value={form.note}
            maxLength={500}
            onChange={(event) => set('note', event.target.value)}
          />
        </Field>
      </div>

      <div className="border-t border-[#17171d] pt-4">
        <CheckBox
          checked={form.credit}
          onChange={(value) => set('credit', value)}
          label={`Keep the "screened by" line at the foot of the page`}
          hint="Turning it off removes the studio's name from their refusal, not the page itself."
        />
      </div>

      {url && (
        <div className="border-t border-[#17171d] pt-5 mt-4">
          <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
            What they put in their config
          </p>
          <pre className="border border-[#282832] bg-[#060608] px-4 py-3 text-[12px] text-neutral-300 font-mono overflow-x-auto">
            {`protect({ blockPage: '${url}' })`}
          </pre>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-5">
        {!fresh && (
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          tone="solid"
          disabled={busy || !form.slug.trim() || !form.name.trim()}
        >
          {fresh ? (
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {busy ? 'Saving…' : fresh ? 'Add brand' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function Preview({ facts, brands }) {
  const [brand, setBrand] = React.useState('');
  const [rule, setRule] = React.useState(DEFENCES[0]?.id ?? '');
  const [retry, setRetry] = React.useState('120');
  const [open, setOpen] = React.useState(false);

  const page = facts?.page ?? 'https://amitista.com/block';
  const url = previewUrl(page, brand, rule, Number(retry) || 0);

  return (
    <Panel
      title="Block page preview"
      icon={Eye}
      action={
        <Button
          type="button"
          onClick={() => setOpen((shown) => !shown)}
          aria-expanded={open}
          className="shrink-0"
        >
          {open ? 'Hide the page' : 'Show the page'}
        </Button>
      }
    >
      <div className="px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
          <Field label="As which customer" htmlFor="preview-brand">
            <Select id="preview-brand" value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="">{STUDIO_NAME} — the default</option>
              {brands.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Which rule refused it" htmlFor="preview-rule">
            <Select id="preview-rule" value={rule} onChange={(event) => setRule(event.target.value)}>
              <option value="">not supplied</option>
              {DEFENCES.map((defence) => (
                <option key={defence.id} value={defence.id}>
                  {defence.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Retry after" htmlFor="preview-retry" hint="Seconds. Empty hides the countdown.">
            <TextInput
              id="preview-retry"
              type="number"
              min={0}
              max={86400}
              value={retry}
              onChange={(event) => setRetry(event.target.value)}
            />
          </Field>
        </div>

        <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
          The link a refused visitor follows
        </p>
        <CopyLink value={url} />

        <div className="flex items-center gap-3 mt-4">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[12px] text-neutral-400 hover:text-white transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            Open it in a new tab
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#282832]">
          <iframe
            key={url}
            src={url}
            title="Block page preview"
            className="w-full h-[720px] bg-[#060608]"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </Panel>
  );
}

export default function Brands({ data, canManage, onChanged, onError, onNotice }) {
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const brands = data?.brands ?? [];
  const facts = data?.facts ?? null;

  async function remove(slug) {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const answer = await deleteBrand(slug);
      onNotice(
        answer.warning ??
          `${slug} is gone. Any install still pointing at it falls back to the studio page.`,
      );
      onChanged();
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function republish() {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const answer = await publishBrands();
      onNotice(answer.warning ?? 'The public brand list has been rewritten.');
      onChanged();
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <Notice>
        By default every customer&apos;s blocked visitor lands on a page carrying the studio&apos;s
        name, which tells them who screens that site. A brand here replaces the name, the accent and
        the complaints link with the customer&apos;s own. The page itself stays on amitista.com —
        only a brand recorded here is ever rendered, so an unknown reference in a URL falls back to
        the studio rather than showing whatever it was given.
      </Notice>

      <Preview facts={facts} brands={brands} />

      <Panel
        title={`Brands — ${brands.length}`}
        icon={Palette}
        action={
          canManage && (
            <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
              <Button type="button" onClick={republish} disabled={busy}>
                <UploadCloud className="h-3.5 w-3.5" strokeWidth={2} />
                Republish
              </Button>
              <Button
                type="button"
                tone="solid"
                onClick={() => {
                  setAdding((open) => !open);
                  setEditing(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {adding ? 'Close' : 'Add a brand'}
              </Button>
            </div>
          )
        }
      >
        {adding && canManage && (
          <div className="border-b border-[#282832] bg-[#060608]">
            <Editor
              facts={facts}
              onError={onError}
              onSaved={(answer) => {
                setAdding(false);
                onNotice(answer.warning ?? `${answer.brand.name} is live on the block page.`);
                onChanged();
              }}
            />
          </div>
        )}

        {brands.length === 0 && !adding && (
          <Empty>
            No brands yet, so every refusal reads as {STUDIO_NAME}.
          </Empty>
        )}

        {brands.map((brand) => (
          <div key={brand.slug} className="border-b border-[#17171d] last:border-b-0">
            <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-[#282832]"
                    style={{ backgroundColor: brand.accent }}
                    aria-hidden="true"
                  />
                  <span className="text-[14px] text-white font-normal">{brand.name}</span>
                  <code className="text-[11px] text-neutral-500 font-mono">{brand.slug}</code>
                  {!brand.credit && <Pill tone="amber">no credit line</Pill>}
                </div>
                <p className="text-[12px] text-neutral-500 font-normal">
                  {brand.contact ? `complaints to ${brand.contact}` : 'complaints come to the studio'}
                  {brand.changed
                    ? ` · changed ${formatAgo(brand.changed)}`
                    : brand.created
                      ? ` · added ${formatAgo(brand.created)}`
                      : ''}
                </p>
                {brand.note && (
                  <p className="text-[12px] text-neutral-600 font-normal mt-1">{brand.note}</p>
                )}
              </div>

              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    onClick={() => {
                      setEditing(editing === brand.slug ? null : brand.slug);
                      setAdding(false);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={2} />
                    Edit
                  </Button>
                  <Confirm
                    label="Remove"
                    danger
                    icon={Trash2}
                    onConfirm={() => remove(brand.slug)}
                  >
                    Their blocked visitors go back to seeing {STUDIO_NAME}.
                  </Confirm>
                </div>
              )}
            </div>

            {editing === brand.slug && canManage && (
              <div className="border-t border-[#17171d] bg-[#060608]">
                <Editor
                  brand={brand}
                  facts={facts}
                  onError={onError}
                  onCancel={() => setEditing(null)}
                  onSaved={(answer) => {
                    setEditing(null);
                    onNotice(answer.warning ?? `${answer.brand.name} has been updated.`);
                    onChanged();
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </Panel>

      {facts && (
        <Panel title="How the page reads a brand" icon={Palette}>
          <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
            <p className="mb-3">
              Saving here rewrites{' '}
              <code className="text-neutral-300 font-mono text-[12px]">{facts.published}</code>,
              which nginx serves at{' '}
              <code className="text-neutral-300 font-mono text-[12px]">{facts.endpoint}</code>. The
              block page fetches it once and applies the brand named in its{' '}
              <code className="text-neutral-300 font-mono text-[12px]">?brand=</code> query.
            </p>
            <p>
              If that file cannot be written the panel says so rather than pretending — the brand is
              still saved here, but blocked visitors keep seeing the studio until it is republished.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
