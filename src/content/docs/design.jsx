import React from 'react';
import { H2, P, UL, LI, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'design-handover': () => (
    <>
      <P>
        On projects that include design, you receive the working file as well as the built
        result. It is meant to be used after we finish, not archived.
      </P>
      <H2 id="contents">What the file contains</H2>
      <UL>
        <LI>The screens, at the sizes agreed — usually a desktop and a mobile width.</LI>
        <LI>Components: buttons, inputs, cards and the rest, built to be reused rather than copied.</LI>
        <LI>Styles for colour, type and spacing, so a change to one updates everywhere it is used.</LI>
        <LI>The states that are easy to forget — empty, loading, error, and the long-text case.</LI>
      </UL>
      <H2 id="access">Access</H2>
      <P>
        The file is transferred to your account or team, not shared from ours. Check you can
        open it with your own login before the project closes, and that you can duplicate it
        — view-only access is not ownership.
      </P>
      <H2 id="using">Using it later</H2>
      <P>
        When you need a new page, build it from the existing components rather than drawing
        it fresh. That is what keeps a product looking like one product. If you need
        something the system does not cover, it is usually a sign a new component is worth
        adding properly.
      </P>
      <H2 id="to-build">Handing it to a developer</H2>
      <P>
        The file is arranged so someone can build from it: named layers, real spacing values,
        exportable assets. Whoever builds it should ask about behaviour the file cannot show
        — what animates, what happens on a slow connection, what a validation message says.
      </P>
      <Note title="The build is the source of truth">
        <p>
          Once a design is built, the live product is what people use. If the design file
          and the site disagree six months later, believe the site — and tell us if they
          should be brought back together.
        </p>
      </Note>
    </>
  ),
  'brand-assets': () => (
    <>
      <P>
        Whatever the project used — logo files, fonts, colours, icons — is handed over with
        it, along with what you are permitted to do with each.
      </P>
      <H2 id="logo">Logo files</H2>
      <Table
        head={['Format', 'Use']}
        rows={[
          ['SVG', 'Anything on screen. Scales to any size without losing quality.'],
          ['PNG with transparency', 'Where SVG is not accepted — some social profiles, some documents.'],
          ['Favicon', 'The browser tab. A simplified mark, because it renders at 16 pixels.'],
          ['Monochrome version', 'Dark backgrounds, print, embroidery, anywhere colour is unavailable.'],
        ]}
      />
      <H2 id="fonts">Fonts and licensing</H2>
      <P>
        A font is licensed, not owned, and web use is a separate licence from desktop use.
        Open source families cover both freely; commercial ones are usually priced by page
        views. If the project uses a paid font, the licence is in your name and renewing it
        is yours to track.
      </P>
      <H2 id="colour">Colour</H2>
      <P>
        Colours are recorded as hex values with a stated role — background, text, accent,
        border — rather than as a swatch grid. The roles are what keep a redesign coherent
        later. Contrast pairs were checked when the design was made; a new colour dropped in
        afterwards needs checking too, per <A href="/docs/accessibility">Accessibility</A>.
      </P>
      <H2 id="storage">Keep the originals</H2>
      <P>
        Store the source files somewhere your whole team can reach, not only on the machine
        of whoever received them. An exported PNG cannot be turned back into a vector, and
        re-creating a logo from a screenshot is a job we have been asked to do more than
        once.
      </P>
    </>
  ),
};
