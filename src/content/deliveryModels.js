export const DELIVERY_MODELS = [
  {
    key: 'transfer',
    name: 'Transfer',
    tagline: 'You buy the work outright.',
    body: 'Ownership of everything bespoke we built for you passes to you once the final invoice is paid. You get the source, you can change it, move it, host it wherever you like and hire anybody you like to work on it afterwards. It costs the most of the three, because you are buying the thing rather than the use of it.',
    facts: [
      ['Ownership', 'Passes to you on final payment'],
      ['Source code', 'Delivered in full'],
      ['Where it runs', 'Wherever you choose'],
      ['What you pay', 'A one-off project fee'],
      ['How it ends', 'It does not — the work is yours'],
    ],
  },
  {
    key: 'licence',
    name: 'Licence',
    tagline: 'You pay to use it. We keep the source.',
    body: 'We keep ownership and grant you the right to run the software for the purpose, on the systems and for the term set out in your order. Whether you receive the source at all is a term of that order rather than something this model assumes either way. It costs less than a transfer for the obvious reason: you are buying the use of the work, not the work.',
    facts: [
      ['Ownership', 'Stays with us'],
      ['Source code', 'Only where your order says so'],
      ['Where it runs', 'The servers and domains named in your order'],
      ['What you pay', 'A project fee, plus a licence fee where your order sets one'],
      ['How it ends', 'When the licence term ends, or on material breach'],
    ],
  },
  {
    key: 'hosted',
    name: 'Hosted',
    tagline: 'We run it. You use it.',
    body: 'Nothing is delivered to you to install. We deploy the software on our own infrastructure, keep it running and give you access to it, for a fee that recurs. You own the data inside it and can have it out at any time. This is the model for a client who wants the thing to work and does not want to own a server, a deployment or a codebase.',
    facts: [
      ['Ownership', 'Stays with us'],
      ['Source code', 'Not supplied'],
      ['Where it runs', 'Our infrastructure — the companies involved are listed at /subprocessors'],
      ['What you pay', 'A recurring hosting and maintenance fee'],
      ['How it ends', 'Either of us on thirty days’ notice, with your data exported first'],
    ],
  },
];
