const MAX_PREVIEW = 3;

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function summarise(value) {
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  const keys = Object.keys(value);
  const shown = keys.slice(0, MAX_PREVIEW).join(', ');
  return keys.length > MAX_PREVIEW ? `${shown}, +${keys.length - MAX_PREVIEW}` : shown;
}

export function jsonLines(root) {
  const lines = [];

  function push(line) {
    lines.push({ id: lines.length, ...line });
    return lines.length - 1;
  }

  function walk(node, key, depth, path, comma) {
    const kind = typeOf(node);

    if (kind === 'array' || kind === 'object') {
      const isArray = kind === 'array';
      const entries = isArray
        ? node.map((item, index) => [index, item])
        : Object.entries(node);

      const open = push({
        depth,
        key,
        path,
        kind: 'open',
        type: kind,
        bracket: isArray ? '[' : '{',
        summary: summarise(node),
        empty: entries.length === 0,
        value: node,
      });

      for (const [childKey, childValue] of entries) {
        const childPath = isArray
          ? `${path}[]`
          : path
            ? `${path}.${childKey}`
            : String(childKey);

        walk(
          childValue,
          isArray ? null : String(childKey),
          depth + 1,
          childPath,
          entries[entries.length - 1][0] !== childKey,
        );
      }

      const close = push({
        depth,
        kind: 'close',
        bracket: isArray ? ']' : '}',
        comma,
        opensAt: open,
      });

      lines[open].closesAt = close;
      return;
    }

    push({ depth, key, path, kind: 'leaf', type: kind, value: node, comma });
  }

  walk(root, null, 0, '', false);
  return lines;
}

export function visibleLines(lines, collapsed) {
  if (collapsed.size === 0) return lines;

  const out = [];
  let skipUntil = -1;

  for (const line of lines) {
    if (line.id <= skipUntil) continue;

    out.push(line);

    if (line.kind === 'open' && collapsed.has(line.id) && line.closesAt !== undefined) {
      skipUntil = line.closesAt;
    }
  }

  return out;
}

export function formatLeaf(value, type) {
  if (type === 'string') return `"${value}"`;
  if (type === 'null') return 'null';
  return String(value);
}
