import React from 'react';
import DocsLayout from '../components/docs/DocsLayout';
import { DOC_META } from '../content/docsMeta';
import { docBody, docIndexFor } from '../content/docsBodies';

export default function DocsPage({ slug }) {
  const index = docIndexFor(slug);
  const page = DOC_META[index];

  const body = docBody(page.slug);

  return (
    <DocsLayout
      page={{ ...page, body }}
      previous={DOC_META[index - 1]}
      next={DOC_META[index + 1]}
    />
  );
}
