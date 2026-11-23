# Reading and its tools

Gazette hands Base the compiled document and its resolved reading context. Base keeps one body and rearranges its navigation and tools around that body as space changes.

## At a desk and in hand

Article pages use one semantic article and opening header. The native leading H1 is rendered once, followed by its unchanged body. At wide widths, corpus and section navigation share the left track, prose occupies the middle, and one sticky right panel holds label/value metadata, compact keyword disclosure and related reading with a centred heading. Both side panels use the same obstruction and scroll bounds.

An explicitly selected service invitation follows the complete article before the footer, outside both side panels.

In flow, metadata stays in one stack on the prose-width grid track and precedes the prose visually; Notes and collection navigation share that track. Related reading follows the prose, and the one native “On this page” disclosure moves into the header. The same heading links expand beneath that row; no second outline is created. The shared reading-context macro omits destinations already present in primary navigation, preserving non-menu ancestry and native continuation return destinations without a listing fraction. The compact breadcrumb spans the reading header and centres on the same axis as its title, including when its hierarchy wraps on a narrow screen. It retains each real collection or journey ancestor, while the current article appears only as the H1; the native JSON-LD keeps its complete independently generated breadcrumb facts.

Product documentation uses the same reading frame as other articles. Gazette's documentation navigation enters the existing corpus disclosure; the local section guide, metadata, citations, Notes and related reading keep their ordinary composition and responsive behavior. A standalone guide invents no hierarchy.

The configured `base:documentation-contents` label names a documentation collection's child-destination deck. The same authored outline orders its groups and the corpus navigator. A child container keeps its descendants at its own entrance. Implicit collections and journeys retain their supplied membership and order; a product entrance retains its selected composition.

Reading prose uses start alignment, balanced word spacing through `text-wrap: pretty`, and manual hyphenation. Display openings, captions and CTAs may explicitly override that shared default.

The section guide marks the rendered section at the reading line as the page scrolls, without moving focus, changing the URL or opening disclosures. Hidden sections are excluded; the marker describes location, not completion. Native section links remain usable without scripts.

A journey disclosure carries the title, declared position, complete ordered members and an overview link, including on articles without an outline. It opens beside the article at a desk and starts closed above it in hand, independently of section navigation. Manual open/closed choices survive resizing. The selected chapter is marked without a self-link; unrouted chapters remain text in their declared positions. The workspace supplies `base:sequence-overview`; an older context without `members` retains title/position orientation. Native previous/next relations belong to those existing member links, without a second navigation strip at the ending. These use supplied relationships; position is not a completion indicator.

An article's declared subject projects sit with its credit. The primary journey precedes other memberships. Supplied classifications and keywords remain separate metadata. Keywords use one compact native details disclosure, with their count and configured search destinations; only resolved project landing and term destinations become links. A neighbour is not repeated as a related choice. Markdown alternates stay machine discovery outputs. Print restores the complete related list and omits navigation controls.

An article's containing collection supplies direct reading choices in the same orientation position as a journey. These are unordered siblings, not steps; nested containers remain destinations. The current article is marked text. The workspace supplies `base:reading-collection` and `base:collection-overview`; a singleton gets only its overview. Breadcrumbs keep the complete hierarchy independently of these local choices.

`base/partials/section-guide.html` supplies an opt-in compact outline for a reading surface that needs it. It uses compiled H2 fragments, requires at least two sections and preserves the body's full width. Length or heading count does not make a landing or About page a reading surface. The article/documentation outline includes H3s and keeps its normal rail behavior.

## Notes, footnotes and citation

Authored Notes use the shared dialog when available, with one distinct control below the left outline at a desk. It remains separate from the Focus on reading control as the outline moves into the mobile header. Other page families retain an ending control. The original body moves into the panel without a second copy; closing or changing tools restores it and returns to the invoker. The page keeps its reading position, while long notes scroll beneath a reachable title and Close control. Native disclosure remains available without script and for explicit note-fragment navigation.

A notebook the page selects joins its Notes after the authored `notes.md`. Gazette hands each notebook to the Theme as cells in `notes.notebooks`, and [the notebook partial](../templates/partials/notebooks.html) writes them in one `gazette-notebook` section: `notebook-markdown` cells, and `notebook-code` cells with their source and stored outputs, each keeping its `data-cell-id`. The essay body, its outline and its search text no longer contain the notebook. When the page offers the file and Gazette's pre-public scan passes, the section ends with a download link labelled by the workspace's `base:notebook-download`; without that label, no link appears.

Printing temporarily returns the commentary to that disclosure; afterward the same panel, body, focus and reading positions are restored if still active.

Native Markdown footnotes remain separate: their numbered markers, definitions and individual return links retain the compiler's anchors, including repeated references.

Optional authored `citation` adds a closed “cite” disclosure to the right reading tools, including on articles without an outline, Notes or a Markdown alternate. Text and labelled formats remain plain selectable text; BibTeX/PDF destinations come from the resolved page view. The workspace supplies `base:citation`, `base:citation-bibtex` and `base:citation-pdf`; absent inputs add no tool.

Manual disclosure state survives resizing. Printing opens the supplied citation and restores its prior state afterward; native print pagination remains unverified.

## Prose flow

The `prose-flow` implementation class owns the internal rhythm of an explicit continuous-copy group. It normalizes only direct block margins, separates adjacent blocks with `--prose-space` and gives non-first direct H2/H3 headings a boundary through `--prose-heading-space`. Each flow root establishes its own defaults from shared spacing tokens. Worlds may bind these roles; typography rules do not reset the same margins. Outer section intervals, reading measures and layout gaps remain with their region. Grid comparisons, controls and media planes do not become prose flows. `about-copy` and `about-context` use this shared recipe; world copy adapters may opt in without a second template or source parser. Article and Notes root flow retains its own existing reading contract.

## Tables, code and equations

Notes with four or more table cells in a row use the wider comparison field, while prose keeps its reading measure. Overflowing article and Notes tables, code planes and display equations gain a keyboard tab stop and native arrow scrolling. Fitting or hidden regions add none, and authored focus attributes remain unchanged. The same observer recalculates when content moves into the dialog, resizes or finishes loading its fonts; it preserves the native table, code and MathML content.

Long display equations scroll within their paragraph, with room for mathematical ascenders and descenders. Their native MathML and font size remain intact.

`reading-comparison` retains an accessible authored label around its original Markdown comparison. Rows retain their table form on phones, with no repeated injected cell labels. Native tables remain two-dimensional at every width, including Notes, without changing headers, cells, spans, captions, links or inline markup.

The engine emits one neutral `data-gazette-table` boundary. Base gives its native table the full available reading width, with automatic column sizing, shared cell spacing and borders. Explicit native left/right/centre cell alignment retains its meaning in both writing directions. Only content wider than that boundary scrolls horizontally. The shared overflow helper adds keyboard focus and the configured hint only for measured overflow, removes both when it fits, and preserves authored focus choices. It wraps legacy unmarked tables once without replacing the table or interpreting its content. Print restores ordinary flow. No JavaScript is needed for the native boundary, width or local scrolling.

`fixtures/reading-overflow.test.mjs` checks conditional focus, hints and preservation; `fixtures/reading.py` covers native comparison and Notes output. Browser width, overflow, keyboard and print checks remain separate from those structural tests.

## Images

Gazette marks standalone image paragraphs with `data-gazette-image-block`. Base centres those images and puts their enlargement control beneath the drawing; inline images in text retain their placement.

The `figure` component groups one Markdown image with its authored `figure-caption`. The caption remains rich Markdown in a native `figcaption`; Gazette carries its text into that image’s structured data. Alt text describes the image for someone who cannot see it. A caption explains what the reader should take from it. Neither is copied into the other, and following article paragraphs remain prose unless explicitly placed in the caption.

```text
::::figure

![A red line rises while a blue line stays level.](comparison.svg)

:::figure-caption
The two models respond differently to the same increase in demand.
:::

::::
```

Gazette’s declared image renditions follow the existing colour preference, including a world’s starting mode and later System, Light or Dark choices. Each occurrence keeps its original alt text, link and caption. A supplied display width is constrained by the available reading width. Missing renditions use the declared default; ordinary images keep their source and dimensions.

The enlargement control appears after a loaded, described image when a larger view is available. It uses the same rendition and follows preference changes while open. The viewer opens with the complete image fitted to the available pane. Zoom in reveals detail through native scrolling; Fit figure restores the whole image. Captions and live controls retain their normal text size. An overflowing pane gains a named keyboard stop for native scrolling. Print selects the declared default and restores the current screen preference afterward. Without scripts, the original default image remains in the document.

A scene component can set `data-media-inspection="off"` on its image container when the image belongs to the composition. The image keeps its description and colour renditions without a separate enlargement action.

An interactive drawing can replace that image while retaining it as a fallback. Its complete styled wrapper carries `data-gazette-image-ref` with the original image’s `data-gazette-image` address; the fallback stays outside the wrapper. The viewer enlarges that exact wrapper, preserving its controls, state and SVG references, and leaves a measured placeholder in the article. It restores the drawing on close and before print. Only one visible wrapper may refer to an image occurrence. A hidden fallback does not offer a separate enlargement action.

Inline SVG labels that select `--world-type-display-family` or `--world-type-numeric-family` receive the complete shared type role, including the world's width and weight. Numeric labels use tabular figures. Authored drawings keep their sizes and reading labels; each world supplies the face through its tokens.

Worlds can supply `--shell-padding` for their ordinary dialog inset. Media keeps that block spacing while Base gives the image a narrower side inset; the world’s material remains unchanged.

## Read-only browser tools

When the workspace selects WebMCP and the browser supports it, Base registers only the selected current-page and search tools. The current-page answer is Gazette's public projection; search loads its emitted corpus lazily through the existing SDK. There is no DOM scrape, private source context or alternate resolver. Leaving the page closes its registrations; returning through the browser cache restores them. Without the API, HTML, Markdown and ordinary search remain usable.

## Local reading tools

When chrome supplies `base:reading-tools`, one native local disclosure groups the actual contents, Notes trigger, citation and alternate destinations. The existing outline label still names the contents navigation. Wide sticky placement opens the group; in-flow reading consults it on demand. Without that label, the existing individual tools remain complete. Print expands the outer group and citation, restoring both after print; native Notes retain their own canonical body and shell lifecycle.

## Related reading and source preferences

The related-reading panel presents Gazette's selected recommendations in their supplied order and omits journey neighbours already shown. Existing older-context support can use the supplied related list. One original list becomes a relationship preview with selection and previous/next controls; each item keeps its destination. Cards omit author/date metadata. Graph selection, keyboard and horizontal gestures share one selected item; print and no script retain the full list. Related reading complements the article without replacing documentation navigation or changing product and service closings. Markdown alternates stay machine discovery outputs. Graph generation remains a workspace choice.

Preferred-source eligibility and URLs come from the engine. The shared link follows related reading in the reading rail, which flows after the article on narrower screens. A page explicitly selected without a reading rail uses the footer's supporting links. The link helper carries no provider script or site list.

## Selected-passage assistance

Gazette supplies the configured reading-assistance policy. Base binds the page and publication context once on articles, documentation, collections and journeys. After a real body-text selection, the shell reveals separate links that open in a new tab; Tab enters them, and Escape, an outside press or scrolling dismisses them. Selection uses the world’s signal roles. The handoff bounds the selected passage and source context before building its link; nothing is sent until activation. Content remains complete without the enhancement and does not repeat the provider list or controller.

The web handoffs are configured adapters, not provider APIs or guaranteed composer-prefill contracts. Provider sign-in and interpretation of the URL remain outside the publication. No browser-native assistant API, account detection, clipboard write or private preferences are implied. `node --test fixtures/selection-assistance.test.mjs` verifies request encoding, bounded source context and interaction lifecycle; rendered presentation is checked separately.

[Back to Base](../README.md).
