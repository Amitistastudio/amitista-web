import { REPLY_WINDOW } from '../siteConfig.js';

export const FAQ = [
  {
    id: 'starting',
    label: 'Starting a project',
    questions: [
      {
        q: 'What kind of work do you take on?',
        a: 'Websites, web applications, interface design, and game servers, FiveM included. Most projects land in one of those. If yours sits somewhere in between, ask anyway and we will tell you straight if we are the right fit.',
      },
      {
        q: 'How does a project actually start?',
        a: 'You send us a short description of what you need. We come back with questions, usually a short back and forth to pin down what the project really involves. Then you get a scope and a price, written down before any work starts.',
        more: { href: '/contact', label: 'SEND AN ENQUIRY' },
      },
      {
        q: 'Do I need a finished brief before I write to you?',
        a: 'No. A couple of sentences is enough to start with. Working out the detail is what the conversation after your first message is for, and we would rather hear from you early than receive a document you spent a fortnight on that points in the wrong direction.',
      },
      {
        q: 'Who will I be talking to?',
        a: 'The people building it. There are no account managers in the middle — the same small team scopes your project, writes it, and supports it once it is live.',
        more: { href: '/team', label: 'MEET THE TEAM' },
      },
    ],
  },
  {
    id: 'money',
    label: 'Money and scope',
    questions: [
      {
        q: 'How much does a project cost?',
        a: 'There is no price list, because no two of these are the same job. Every project is quoted on its own, and the price is agreed in writing before anything starts — it is not a meter that runs while we work. If you want a figure before you write to us, the estimator asks what the job involves and gives you a range.',
        more: { href: '/estimate', label: 'ESTIMATE A PROJECT' },
      },
      {
        q: 'How does payment work?',
        a: 'Unless we agree otherwise in writing, there is a deposit before work starts and the balance on completion. Larger projects are split into milestones, each invoiced as it is reached. Invoices are payable within fourteen days.',
        more: { href: '/terms', label: 'READ THE TERMS' },
      },
      {
        q: 'What if I want to change something halfway through?',
        a: 'Revisions inside the agreed scope are included. Reworking something already signed off, or changing direction after approval, is new work — we quote it before doing it rather than absorbing it quietly and then running late.',
        more: { href: '/terms', label: 'READ THE TERMS' },
      },
      {
        q: 'Can I get a refund?',
        a: 'Usually not, and it is fairer to say so plainly than to imply otherwise. Once work on a project has started nothing paid is refundable, at any stage; licensed files are not refundable once handed over; and a hosting period that has begun runs to its end. Money comes back mainly where we are the ones who ended it, or where a deliverable is unusable and we cannot fix it. The refund policy sets out each case rather than leaving it to a conversation.',
        more: { href: '/refund', label: 'REFUND POLICY' },
      },
    ],
  },
  {
    id: 'work',
    label: 'The work itself',
    questions: [
      {
        q: 'Who owns the code when it is finished?',
        a: 'It depends which of the three ways you bought it. Buy the work outright and it is yours once we have been paid in full. Take a licence and we keep the source while you pay to run it — cheaper, for the obvious reason. Let us host it and you use the running system without owning or installing anything. Your quote says which one it is before you accept it, and our own pre-existing tools stay ours under all three.',
        more: { href: '/terms', label: 'HOW DELIVERY WORKS' },
      },
      {
        q: 'Do I have to buy the source code?',
        a: 'No. Plenty of clients want the thing to work and have no use for a codebase, so you can license it instead, or have us host and run it for a recurring fee. Both cost less than buying it outright. You can convert to full ownership later for the difference in price — it does not run the other way, so nothing is lost by starting smaller.',
        more: { href: '/eula', label: 'LICENCE TERMS' },
      },
      {
        q: 'Will you show my project to other people?',
        a: 'We may show it as our work and name you as a client, and so may the developers who built it, in their own portfolios — we name the people who work here, and pointing at what you have made is how a developer gets their next job. Only the finished, public-facing result: never your code, your data or anything you told us in confidence. The showcase on this site is curated on top of that, so being built by us does not mean it appears there. If you would rather we showed none of it, say so at any point — it is a normal request, we do not argue about it, and it costs nothing.',
        more: { href: '/terms', label: 'READ THE TERMS' },
      },
      {
        q: 'What happens after it goes live?',
        a: 'Fixes, changes and help once the project is live are the last stage of how we work, not an afterthought. Exactly what that covers is agreed with your project rather than assumed, so it is written into the scope like everything else.',
      },
      {
        q: 'Where do I look things up after handover?',
        a: 'The documentation covers most handover questions — how the thing is put together, and what to do with it. If it does not answer yours, write to us and we will both answer it and add it there.',
        more: { href: '/docs', label: 'OPEN THE DOCS' },
      },
    ],
  },
  {
    id: 'contact',
    label: 'Getting in touch',
    questions: [
      {
        q: 'How do I reach you?',
        a: 'The contact form is the quickest way, and there is an email address and a Discord server if you would rather use one of those. All three reach the same people.',
        more: { href: '/contact', label: 'CONTACT US' },
      },
      {
        q: 'How quickly do you reply?',
        a: `We normally come back to you within ${REPLY_WINDOW}. If something is urgent, say so in the message.`,
      },
      {
        q: 'What happens to what I send you?',
        a: 'The contact form posts straight from your browser to a private channel in our Discord server, where the team reads it. If you would rather your enquiry did not pass through Discord, email us instead and it will not.',
        more: { href: '/privacy', label: 'PRIVACY POLICY' },
      },
    ],
  },
];
