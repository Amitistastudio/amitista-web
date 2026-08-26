import React from 'react';
import { ImagePlus, Trash2, Upload, AlertTriangle, Crop, Loader2 } from 'lucide-react';
import { Button } from '../ui';
import { focusOf, initials, shade } from './shared';
import { ART_KINDS, ART_TYPES, loadArtSource, openArt, readableSize } from './art';
import Cropper from './Cropper';
import { boardArtUrl } from '../../../lib/admin';

const CENTRE = { x: 50, y: 50 };

export default function ArtField({ kind, board, pending, colour, disabled, onPick, onClear }) {
  const spec = ART_KINDS[kind] ?? ART_KINDS.logo;
  const held = board?.art?.[kind];
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const input = React.useRef(null);

  const preview = pending?.data ?? (held && board?.id ? boardArtUrl(board.id, kind, held.hash) : null);
  const bytes = pending?.bytes ?? held?.bytes;
  const spot = focusOf(pending ?? held);

  const take = React.useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await openArt(file);
      setEditing({
        source: opened.source,
        image: opened.image,
        animated: opened.type === 'image/gif',
        raw: { data: opened.source, bytes: opened.size, type: opened.type },
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }, []);

  const reframe = React.useCallback(async () => {
    if (!preview || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const image = await loadArtSource(preview);
      setEditing({ source: preview, image, animated: false, raw: null });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, [preview, disabled]);

  const keep = React.useCallback(
    async (result) => {
      setError(null);
      setBusy(true);
      try {
        await onPick({ ...result, focus: CENTRE });
        setEditing(null);
      } catch (failure) {
        setError(failure.message);
        setEditing(null);
      } finally {
        setBusy(false);
      }
    },
    [onPick],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={`min-w-0 flex-1 basis-full ${
            kind === 'banner' ? 'sm:basis-[420px]' : 'sm:basis-auto'
          }`}
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (disabled) return;
            take(event.dataTransfer?.files?.[0]);
          }}
        >
          {preview ? (
            <>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={reframe}
                aria-label={`Frame the ${spec.label.toLowerCase()}`}
                className={`group relative block w-full overflow-hidden border border-[#282832] bg-[#111115] text-left transition-colors hover:border-[#3f3f4c] disabled:cursor-not-allowed ${
                  kind === 'banner' ? 'aspect-[3/1]' : 'aspect-square max-w-[168px]'
                }`}
              >
                <img
                  src={preview}
                  alt=""
                  style={{ objectPosition: spot }}
                  className="h-full w-full object-cover"
                />
                {kind === 'banner' && (
                  <>
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0d] via-[#0a0a0d]/30 to-transparent" />
                    <span className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-2">
                      <span className={`h-4 w-1 ${shade(colour ?? board?.colour).stripe}`} />
                      <span className="text-[13px] font-normal text-white">
                        {board?.name || 'This board'}
                      </span>
                    </span>
                  </>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span className="inline-flex items-center gap-1.5 border border-[#3f3f4c] bg-[#0a0a0d]/90 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-neutral-100">
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                    ) : (
                      <Crop className="h-3 w-3" strokeWidth={2} />
                    )}
                    Move and zoom
                  </span>
                </span>
              </button>

              {kind === 'logo' && (
                <span className="mt-2 flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[#282832] bg-[#111115]">
                      <img
                        src={preview}
                        alt=""
                        style={{ objectPosition: spot }}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="text-[15px] font-medium text-white">
                      {board?.name || 'This board'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-[#282832] bg-[#111115]">
                      <img
                        src={preview}
                        alt=""
                        style={{ objectPosition: spot }}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="text-[11px] font-normal text-neutral-500">
                      on a card row and the board list
                    </span>
                  </span>
                </span>
              )}

              <span className="mt-1.5 block text-[11px] font-normal text-neutral-600">
                Click it to move and zoom, the way you would a Discord avatar.
              </span>
            </>
          ) : (
            <>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Without one
              </span>
              {kind === 'logo' ? (
                <span className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-14 w-14 shrink-0 items-center justify-center text-[15px] font-semibold text-black/70 ${
                      shade(colour ?? board?.colour).stripe
                    }`}
                  >
                    {initials(board?.name || 'New board')}
                  </span>
                  <span className="text-[12px] font-normal leading-relaxed text-neutral-500">
                    The board shows its initials in the board colour. Drop an image here to replace
                    them.
                  </span>
                </span>
              ) : (
                <span
                  className={`relative flex h-20 items-end justify-start overflow-hidden border px-3 py-2 ${
                    over ? 'border-purple-500/60 bg-purple-500/10' : 'border-[#282832] bg-[#0a0a0d]'
                  }`}
                >
                  <span
                    className={`absolute inset-x-0 top-0 h-1 ${shade(colour ?? board?.colour).stripe}`}
                  />
                  <span className="flex items-center gap-2 text-[12px] font-normal text-neutral-500">
                    <ImagePlus className="h-4 w-4 text-neutral-700" strokeWidth={1.5} />
                    Just the colour stripe until you drop an image here.
                  </span>
                </span>
              )}
            </>
          )}
        </div>

        <div className="min-w-[180px] flex-1 space-y-2">
          <p className="text-[12px] font-normal leading-relaxed text-neutral-500">{spec.hint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" strokeWidth={2} />
              {busy
                ? 'Working…'
                : preview
                  ? `Replace ${spec.label.toLowerCase()}`
                  : `Upload ${spec.label.toLowerCase()}`}
            </Button>
            {preview && (
              <>
                <Button type="button" disabled={disabled || busy} onClick={reframe}>
                  <Crop className="h-3.5 w-3.5" strokeWidth={2} />
                  Move and zoom
                </Button>
                <Button
                  type="button"
                  disabled={disabled || busy}
                  onClick={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                      await onClear();
                    } catch (failure) {
                      setError(failure.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Remove
                </Button>
              </>
            )}
          </div>
          <p className="text-[11px] font-normal text-neutral-600">
            PNG, JPEG, WebP or GIF. What you frame is what gets sent, at
            {` ${spec.width}×${spec.height}`} at most.
            {bytes ? ` Stored: ${readableSize(bytes)}.` : ''}
          </p>
          <input
            ref={input}
            type="file"
            accept={ART_TYPES.join(',')}
            className="hidden"
            onChange={(event) => take(event.target.files?.[0])}
          />
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-[12px] font-normal text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}

      {editing && (
        <Cropper
          kind={kind}
          source={editing.source}
          image={editing.image}
          animated={editing.animated}
          name={board?.name}
          colour={colour ?? board?.colour}
          busy={busy}
          onApply={keep}
          onKeep={editing.raw ? () => keep(editing.raw) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
