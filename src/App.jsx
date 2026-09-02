import React, { useState, useEffect } from 'react';
import { findProject } from './content/projects';
import { initialPath, normalizePath, PathContext } from './lib/routePath';
import { useMaintenance } from './lib/maintenance';
import { page } from './lib/pageRegistry';
import MaintenancePage from './pages/MaintenancePage';
import ClosedCover from './components/ClosedCover';

const HomePage = page('/', () => import('./pages/HomePage'));
const LegalIndexPage = page('/legal', () => import('./pages/legal/LegalIndexPage'));
const EulaPage = page('/eula', () => import('./pages/legal/EulaPage'));
const TermsPage = page('/terms', () => import('./pages/legal/TermsPage'));
const RefundPage = page('/refund', () => import('./pages/legal/RefundPage'));
const PrivacyPage = page('/privacy', () => import('./pages/legal/PrivacyPage'));
const DocsPage = page('docs', () => import('./pages/DocsPage'));
const ContactPage = page('/contact', () => import('./pages/ContactPage'));
const TeamPage = page('/team', () => import('./pages/TeamPage'));
const FaqPage = page('/faq', () => import('./pages/FaqPage'));
const WorkPage = page('/work', () => import('./pages/WorkPage'));
const ProjectPage = page('project', () => import('./pages/ProjectPage'));
const ServicesPage = page('/services', () => import('./pages/ServicesPage'));
const ProcessPage = page('/process', () => import('./pages/ProcessPage'));
const DeclinesPage = page('/what-we-dont-take-on', () => import('./pages/DeclinesPage'));
const DpaPage = page('/dpa', () => import('./pages/legal/DpaPage'));
const SubprocessorsPage = page('/subprocessors', () => import('./pages/legal/SubprocessorsPage'));
const SecurityPage = page('/security', () => import('./pages/legal/SecurityPage'));
const AccessibilityPage = page('/accessibility', () => import('./pages/legal/AccessibilityPage'));
const AcceptableUsePage = page('/acceptable-use', () => import('./pages/legal/AcceptableUsePage'));
const BillingPage = page('/billing', () => import('./pages/legal/BillingPage'));
const ContentModerationPage = page('/content-moderation', () => import('./pages/legal/ContentModerationPage'));
const CopyrightPage = page('/copyright', () => import('./pages/legal/CopyrightPage'));
const CookiesPage = page('/cookies', () => import('./pages/legal/CookiesPage'));
const OpenSourcePage = page('/open-source', () => import('./pages/legal/OpenSourcePage'));
const ExchangeFeesPage = page('/exchange-fees', () => import('./pages/ExchangeFeesPage'));
const StatusPage = page('/status', () => import('./pages/StatusPage'));
const ApiPage = page('/api', () => import('./pages/ApiPage'));
const ShieldPage = page('/shield', () => import('./pages/ShieldPage'));
const BotsPage = page('/bots', () => import('./pages/BotsPage'));
const ApplyPage = page('/apply', () => import('./pages/ApplyPage'));
const AdminPage = page('/admin', () => import('./pages/AdminPage'));
const BlockedPage = page('/block', () => import('./pages/BlockedPage'));
const TrackPage = page('/track', () => import('./pages/TrackPage'));
const TranscriptPage = page('transcript', () => import('./pages/TranscriptPage'));
const NotFoundPage = page('notFound', () => import('./pages/NotFoundPage'));

const ROUTES = {
  '/': HomePage,
  '/contact': ContactPage,
  '/apply': ApplyPage,
  '/team': TeamPage,
  '/work': WorkPage,
  '/services': ServicesPage,
  '/process': ProcessPage,
  '/status': StatusPage,
  '/api': ApiPage,
  '/shield': ShieldPage,
  '/bots': BotsPage,
  '/block': BlockedPage,
  '/track': TrackPage,
  '/faq': FaqPage,
  '/what-we-dont-take-on': DeclinesPage,
  '/legal': LegalIndexPage,
  '/eula': EulaPage,
  '/terms': TermsPage,
  '/refund': RefundPage,
  '/privacy': PrivacyPage,
  '/dpa': DpaPage,
  '/subprocessors': SubprocessorsPage,
  '/security': SecurityPage,
  '/accessibility': AccessibilityPage,
  '/acceptable-use': AcceptableUsePage,
  '/billing': BillingPage,
  '/content-moderation': ContentModerationPage,
  '/copyright': CopyrightPage,
  '/cookies': CookiesPage,
  '/open-source': OpenSourcePage,
  '/exchange-fees': ExchangeFeesPage,
  '/admin': AdminPage,
};

const normalize = normalizePath;

const pageFallback = <div className="min-h-screen" />;

export function routeKeyFor(path) {
  const currentPath = normalize(path);

  if (currentPath === '/docs' || currentPath.startsWith('/docs/')) return 'docs';

  if (currentPath.startsWith('/work/') && findProject(currentPath.slice('/work/'.length))) {
    return 'project';
  }

  if (/^\/t(\/[A-Za-z0-9-]{5,80})?$/.test(currentPath)) return 'transcript';

  return ROUTES[currentPath] ? currentPath : 'notFound';
}

function routeElement(currentPath) {
  switch (routeKeyFor(currentPath)) {
    case 'docs':
      return <DocsPage slug={currentPath.slice('/docs/'.length)} />;
    case 'project':
      return <ProjectPage project={findProject(currentPath.slice('/work/'.length))} />;
    case 'transcript':
      return <TranscriptPage />;
    case 'notFound':
      return <NotFoundPage path={currentPath} />;
    default: {
      const Page = ROUTES[currentPath];
      return <Page />;
    }
  }
}

export default function App({ path }) {
  const [currentPath, setCurrentPath] = useState(path ?? initialPath);
  const [peek, setPeek] = useState(false);
  const cover = useMaintenance(currentPath);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalize(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (cover && cover.mode === 'closed') {
    return (
      <PathContext.Provider value={currentPath}>
        <div aria-hidden="true" inert className="fixed inset-0 overflow-hidden pointer-events-none select-none">
          <div className={`h-full scale-[1.03] frost frost-in ${peek ? 'frost-peek' : ''}`}>
            <React.Suspense fallback={null}>{routeElement(currentPath)}</React.Suspense>
          </div>
        </div>
        <ClosedCover
          path={currentPath}
          message={cover.message ?? ''}
          since={cover.since ?? null}
          until={cover.until ?? null}
          tag={cover.tag ?? ''}
          onPeek={setPeek}
        />
      </PathContext.Provider>
    );
  }

  return (
    <PathContext.Provider value={currentPath}>
      <React.Suspense fallback={pageFallback}>
        {cover ? (
          <MaintenancePage
            path={currentPath}
            mode={cover.mode}
            message={cover.message ?? ''}
            since={cover.since ?? null}
            until={cover.until ?? null}
            tag={cover.tag ?? ''}
          />
        ) : (
          routeElement(currentPath)
        )}
      </React.Suspense>
    </PathContext.Provider>
  );
}
