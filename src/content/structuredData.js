import { FAQ } from './faq';
import { API_BASE, ENDPOINTS } from './apiMeta.js';
import { DEFENCES, SHIELD_PACKAGE, SHIELD_VERSION, SHIELD_RUNTIME } from './shieldRules.js';
import { labelForPath } from './routeMeta.js';
import {
  CONTACT_EMAIL,
  DISCORD_INVITE,
  GITHUB_ORG,
  JURISDICTION,
  STUDIO_NAME,
} from '../siteConfig';

const ORGANIZATION = '#organization';
const WEBSITE = '#website';

import { DEFAULT_DESCRIPTION } from './routeMeta.js';

function organisation(siteUrl) {
  const sameAs = [DISCORD_INVITE, GITHUB_ORG && `https://github.com/${GITHUB_ORG}`].filter(Boolean);

  const node = {
    '@type': 'Organization',
    '@id': `${siteUrl}/${ORGANIZATION}`,
    name: STUDIO_NAME,
    url: `${siteUrl}/`,
    logo: `${siteUrl}/amitista-logo.png`,
    image: `${siteUrl}/og.png`,
    description: DEFAULT_DESCRIPTION,
    email: CONTACT_EMAIL,
    address: { '@type': 'PostalAddress', addressCountry: JURISDICTION },
  };

  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

function website(siteUrl) {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/${WEBSITE}`,
    url: `${siteUrl}/`,
    name: STUDIO_NAME,
    inLanguage: 'en',
    publisher: { '@id': `${siteUrl}/${ORGANIZATION}` },
  };
}

function breadcrumb(path, siteUrl) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const parent = `/${segments[0]}`;
  const parentLabel = labelForPath(parent);
  const ownLabel = labelForPath(path);

  if (!parentLabel || !ownLabel) {
    throw new Error(
      `structuredData: no route metadata for ${!parentLabel ? parent : path}, ` +
        `which ${path} needs for its breadcrumb. Add it to routeMeta.js.`,
    );
  }

  const suffix = ` — ${parentLabel}`;
  const leaf = ownLabel.endsWith(suffix) ? ownLabel.slice(0, -suffix.length) : ownLabel;

  return {
    '@type': 'BreadcrumbList',
    '@id': `${siteUrl}${path}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: parentLabel, item: `${siteUrl}${parent}` },
      { '@type': 'ListItem', position: 3, name: leaf, item: `${siteUrl}${path}` },
    ],
  };
}

function faqPage(siteUrl) {
  const questions = FAQ.flatMap((group) => group.questions);

  if (!questions.length) {
    throw new Error('structuredData: FAQ is empty — /faq would ship an FAQPage with no questions');
  }

  return {
    '@type': 'FAQPage',
    '@id': `${siteUrl}/faq#faq`,
    mainEntity: questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function webApi(siteUrl) {
  return {
    '@type': 'WebAPI',
    '@id': `${siteUrl}/api#webapi`,
    name: `${STUDIO_NAME} public API`,
    url: `${siteUrl}/api`,
    description:
      'Read-only JSON describing Shield, an application security package for Express: its detection catalogue, the request shapes it treats as abuse, the rate limits it applies, and the live status of the server. Bearer token on every endpoint but the signed feed, open to any origin.',
    documentation: `${siteUrl}/api`,
    endpointDescription: `${siteUrl}${API_BASE}/openapi.json`,
    endpointURL: `${siteUrl}${API_BASE}`,
    provider: { '@id': `${siteUrl}/${ORGANIZATION}` },
    termsOfService: `${siteUrl}/terms`,
    isAccessibleForFree: true,
    inLanguage: 'en',
    potentialAction: ENDPOINTS.map((endpoint) => ({
      '@type': 'ConsumeAction',
      name: endpoint.name,
      description: endpoint.blurb,
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}${endpoint.path}`,
        httpMethod: 'GET',
        contentType: 'application/json',
      },
    })),
  };
}

function shieldApplication(siteUrl) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}/shield#software`,
    name: SHIELD_PACKAGE,
    alternateName: 'Shield',
    url: `${siteUrl}/shield`,
    softwareVersion: SHIELD_VERSION,
    applicationCategory: 'SecurityApplication',
    operatingSystem: SHIELD_RUNTIME,
    runtimePlatform: 'Node.js',
    description:
      'A security package for Express applications. It maps every route and the dangerous calls each one reaches, refuses malformed and abusive requests before the handler runs, tracks caller-supplied data into shells, queries, file paths and outbound requests, and checks what leaves in the response. Analysis and enforcement run inside the customer process; no source code is uploaded.',
    featureList: DEFENCES.map((defence) => defence.name),
    publisher: { '@id': `${siteUrl}/${ORGANIZATION}` },
    isAccessibleForFree: true,
    inLanguage: 'en',
  };
}

export function jsonLdForPath(path, { siteUrl }) {
  const graph = [];

  if (path === '/') {
    graph.push(organisation(siteUrl), website(siteUrl));
  }

  const crumbs = breadcrumb(path, siteUrl);
  if (crumbs) graph.push(crumbs);

  if (path === '/faq') graph.push(faqPage(siteUrl));

  if (path === '/api') graph.push(organisation(siteUrl), webApi(siteUrl));

  if (path === '/shield') graph.push(organisation(siteUrl), shieldApplication(siteUrl));

  if (!graph.length) return null;
  return { '@context': 'https://schema.org', '@graph': graph };
}
