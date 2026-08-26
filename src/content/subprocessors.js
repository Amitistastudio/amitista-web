export const SUBPROCESSORS = [
  {
    name: 'Discord Inc.',
    entity: '444 De Haro St, Suite 200, San Francisco, CA 94107, United States',
    purpose: 'Receives enquiries and estimates sent from this website',
    location: 'United States — outside Europe, covered by section 11',
    scope: 'Our website only',
  },
  {
    name: 'Datalix',
    entity: 'Florian Kolb, Theodor-Heuss-Str. 1, 97230 Estenfeld, Germany · VAT DE339774035',
    purpose: 'Provides the virtual servers this site and the projects we deploy run on',
    location: 'Germany — data centres in Frankfurt am Main (Equinix FR5, FR7, FR8 and Cogent)',
    scope: 'Our website and client projects',
  },
  {
    name: 'Google (Firebase)',
    entity: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland — or Google LLC, depending on the contracting entity',
    purpose: 'Database, authentication and hosting for projects built on Firebase',
    location: 'Not fixed to one region',
    caveat:
      'Firebase does not commit to a storage region by default — Google’s terms allow customer data to be processed in any country where Google or its own subprocessors have facilities. Where a project has to stay in Europe, we either agree a data location commitment with Google first or do not build it on Firebase.',
    scope: 'Client projects built on Firebase',
  },
];

export const SELF_HOSTED = [
  {
    name: 'MySQL',
    purpose: 'Relational database for projects built on it',
    location: 'On our Datalix servers in Frankfurt am Main, Germany',
    scope: 'Client projects using MySQL',
  },
  {
    name: 'MongoDB',
    purpose: 'Document database for projects built on it',
    location: 'On our Datalix servers in Frankfurt am Main, Germany',
    scope: 'Client projects using MongoDB',
  },
];

export const HAS_UNCONFIRMED = SUBPROCESSORS.some((entry) => entry.unconfirmed);
