import { prerender } from 'react-dom/static.edge';
import App, { routeKeyFor } from './App.jsx';
import { preloadPage } from './lib/pageRegistry';
import { preloadDocBody } from './content/docsBodies';

const PRERENDER_CHUNK_SIZE = 1024 * 1024 * 64;

export async function renderPath(path) {
  const key = routeKeyFor(path);
  await preloadPage(key);

  if (key === 'docs') await preloadDocBody(path.slice('/docs/'.length));

  const failures = [];
  const { prelude } = await prerender(<App path={path} />, {
    progressiveChunkSize: PRERENDER_CHUNK_SIZE,
    onError(error) {
      failures.push(error);
    },
  });

  const markup = await new Response(prelude).text();

  if (failures.length) throw failures[0];

  return { key, markup };
}

export { routeKeyFor };
export { jsonLdForPath } from './content/structuredData.js';
