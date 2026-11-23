# AGENTS.md: gazette-theme-base

Shared physics for all Gazette themes. Behaviour defined here is identical in every world; world themes may restyle it, never re-implement or alter it.

## Shared parts and world choices

Change a shared part at its source, then check its consumers against the accepted composition. Base's consumers are the six world themes, each used by one publication: Chronicle for getHarsh, Carrier for RawThoughts, Lattice for Causality, Folio for Post-AGI Economics, Nocturne for Sleepwalker and Chassis for DAO Studio. A change to a shared part reaches all six, so check each one's accepted pages, and a change to `design-tokens` reaches those six and Base's neutral fixture. A repair does not reopen unrelated accepted decisions. When a page is too quiet, give it more presence within its Peak; do not add another restriction.

| Shared part | Defined once in Base | What a world changes |
| --- | --- | --- |
| Header surface, including over a film | [Frame](styles/_frame.scss), [navigation](styles/_navigation.scss) and the scene's existing header placement | `--frame-surface` changes the bed where the shared recipes read it. Unifying all film-header placement is still unfinished; retain each scene's accepted geometry until that repair. |
| Optical cards | [Optical surface](styles/_optical.scss) | `--card-surface-bed`, `--card-surface-fill` and `--card-surface-filter`; the shared recipe keeps contrast and preference fallbacks. |
| Dialog shell | [Shell](templates/partials/shell.html), [physics](styles/physics.scss) and [Settings surface](styles/_settings.scss) | Existing world surface styles remain for now. A single `world.material.shell` choice for every tenant is planned, not implemented. |
| Search field | [Search controls](styles/_search.scss) | `--control-radius` works today. Planned `--field-face`, `--field-border`, `--field-rule`, `--field-radius`, `--field-inset` and `--field-size` will replace repeated world selectors while preserving the pill and horizon treatments. |
| Footer | [One footer](templates/partials/footer.html) and [frame styles](styles/_frame.scss) | Material within the existing `quiet` or `colophon` context; no change to roles or placement. A `world.surface.footer` token is planned; current world surface styles still supply that choice. |
| Stacked opening | [Ambient hero](styles/ambient-hero.scss) | Read `--ambient-media-height` for a fade or other material treatment. Base computes the height; a world does not repeat or override the calculation. |
| Page title and About | [Frame](templates/page.html), [landing](templates/landing.html) and [About](templates/about.html) | No replacement title or About assembly. Inherit the composition; an About with a different dominant task may override `page_mode` and record the reason in `WORLD.md`. |
| Page mode, Baseline and Peak | [Page-mode macro](templates/macros/page_mode.html) and the inherited frame block | A scoped `page_mode` override and the world's recorded expressive range. Token values carry expression; Baseline and Peak are design requirements, not a runtime switch that paints a page. |
| Destination marks | [Link signatures](styles/_links.scss) | Crossing colour and mask tokens. The token build supplies per-destination geometry; Base keeps one recipe for content links, actions and title-only card marks. Do not add another mark implementation in a world. |
| Fonts | [Type-role mixins](styles/_typography.scss) | The world's display face, weight and width tokens; keep reading, system and code roles complete. Current font resource declarations remain necessary. |
| Colour and reduced motion | [Settings](scripts/settings.js), [motion preference](scripts/motion-preference.js) and the shared component recipes | Colour and motion token values. Base owns preference selection and the reduced form of each interaction. The token output selects expressive, preview and deck-fade values for that preference; components keep their static forms and lifecycle gates. |
| Prose and figure spacing | [Prose flow](styles/physics.scss) and [reading](styles/_reading.scss) | `--prose-space` and `--prose-heading-space` exist. Planned `--prose-figure-interval` and `--prose-caption-gap` will preserve today's defaults and let only the worlds already using figure tokens opt into them. The framed figure sheet also needs a named shared choice; it remains world styling today. |
| Reading focus, index rows, Notes and primary actions | [Focus](styles/_focus.scss), [reading](styles/_reading.scss) and [controls](styles/_controls.scss) | Planned `--focus-glow`, `--index-row`, `--notes-open-ink`, `--notes-rule`, a section-heading gap and a primary-lift token will replace repeated styles without changing the accepted defaults. Those controls are not available yet. |

Planned controls describe the shared repair to make, not settings a world can already use. Keep an existing accepted treatment until its shared replacement has been checked; do not copy that treatment into another world as a new implementation.

## Before changing anything

- **Start from the neutral fixture.** For a page, component or shell change, read the fixture and the contract below. Open Pale’s [design guidance](https://github.com/getHarshOnline/pale/blob/main/packages/design/INDEX.md) for the method that fits the change, and its [independent review](https://github.com/getHarshOnline/pale/blob/main/packages/design/independent.md) for critique. The owner decides whether to accept the result.
- **Use the engine contract.** Open Gazette’s `docs/` for the build under review and read `theme-reference.md` and `tera.md`. Each world’s repository owns its `WORLD.md` brief.
- **Read values from design-tokens.** Follow that repository’s build and capture instructions. Base declares the captured `dist/css/base.css` for its neutral binding. Only the base-alone fixture uses that copy. World packages supply their own captured outputs.
- **Check the result.** Follow the [shared verification entrypoint](README.md#shared-verification-entrypoint) for the neutral Gazette fixtures and `npm run capture` against the workspace’s accepted pages. Keep the reference manifest in its owning workspace; compare every Base, world or token change with those captures, including running transitions. Pale Design supplies the source and browser checks. Render with `theme:base` as the root and use fictional content. Open the actual page to inspect the layout and interaction.
- **Design rationale:** the [README](README.md) and the pages under `docs/` explain current choices. Update a lasting decision in place; routine repairs and checks belong to Git and review evidence. Approval retains its owner's scope and source.

## The shared opening

The stacked opening's geometry is defined in [styles/ambient-hero.scss](styles/ambient-hero.scss). Below the wide breakpoint, `--ambient-media-height` on `.ambient-hero` gives the media height used by the poster, video, copy clearance and playback control. A world reads that same value for its material treatment, such as a fade; it does not repeat the height calculation. Preserve the approved composition while repairing this shared behaviour.

## The block contract

The frame computes the authored headings once. [landing.html](templates/landing.html) keeps a composed page's visual opening in its body and supplies a visually hidden document title only when that body has no H1. Reading and collection openings retain the ordinary frame's heading extraction. [about.html](templates/about.html) adds the shared colophon. The frame renders a services closing once when the workspace selects that page in `invitations`; footer links do not select it. [article-closing.html](templates/article-closing.html) inherits that frame for existing bindings. About uses `sequence` by default. A composition serving another purpose can override its inherited `page_mode` block; the article closing leaves the frame’s mode unchanged. Worlds inherit these compositions and retain only their fonts and any purpose-based exceptions. Inert image-resource templates belong in `head_extra`, alongside other page resources.

The base frame (`templates/page.html`) opens these blocks and no others. Landmarks (`header`, `nav`, `main`, `footer`), the skip link and the command shell are outside every block.

| Block | Role | A world may |
| --- | --- | --- |
| `page_mode` | the value of `data-page-mode` | re-map a family and fall back to `super()`, as its `WORLD.md` records |
| `footer_treatment` | the value of `data-footer-treatment`: `quiet` or `colophon` | opt an authored landing or account into its world’s compact colophon without changing page mode; projects default to `colophon` |
| `head_extra` | head resources only that world's pages need | extend with `super()` |
| `title_group` | the page's title group | inherit the appropriate Base composition; authored visual openings belong in Content |
| `lead` | the lead beneath the title group | fill; wrap it with `data-amplitude`, the 0 to 4 expression ceiling, when it is the peak region |
| `publication_body` | the one compiled Content body wrapper | Base family layouts select a shared account class; worlds inherit it and do not parse, reorder or replace Content |
| `outline` | corpus and section orientation in the shared reading navigation track | select the base section guide for an appropriate reading surface, never merely because a landing has headings or is long |
| `listing` | the resolved listing and its pagination | select a base listing composition without changing membership, order, titles or destinations |
| `apparatus` | canonical Notes body and its native disclosure fallback | restyle only; its disclosure behaviour stays base |
| `closing` | how the page ends: journey neighbours, the next step | fill |

The footer is one Base-owned assembly in `partials/footer.html`, used by page and graph render entries. Identity/description, copyright/generator credit and social/supporting destinations occupy the three shared columns and two rows; phones stack complete groups. One labelled email action and supplied social destinations share the connection row; legal, discovery and emitted feeds sit beneath. The email uses supplied discovery contact, or correspondence when discovery is absent. Worlds compose these same groups with styles; they do not relocate them by page family. `footer_treatment` selects a surface context only, never a different anatomy. Authored enquiries belong with their instruction and action in Content.

## Owns

Template contract, shared components and their states, the dialog shell and tenants, search, cross-world previews, reading apparatus, keyboard/focus/dismissal models, productive motion, reduced-motion and no-JS behaviour, and the page-level attributes every world reads:

- **Colour mode and motion preference:** the base's settings tenant and its one restore script are the only writers of `data-mode` and `data-motion`.
- **Page mode:** the base frame sets `data-page-mode` through one macro. A world re-maps by block.
- **Page frame:** `data-palette`, `data-structure` and `data-family` from the template context.
- **Command shell:** the base frame loads its browser module on every page. Keep it outside component islands, the scripts that each enhance one component (see [Material words](docs/material-words.md)).

See the [Base README](README.md) for the shared component attributes and state contracts.

## Does not own

World identity and its axes, token values (`design-tokens`), content or site identity (supplied by the composing workspace), publishing mechanics.

## Target constraints (Gazette engine)

If the engine cannot carry an approved face, glyph or asset, report the gap to the Gazette owner. Keep the approved treatment pending the owner’s decision.

- **Base composition:** a separately captured Theme package with its own stable namespace. The workspace binds its exact source and each world package declares it as an explicit dependency; worlds extend its namespaced templates through that dependency. Keep one copy of Base templates and let the workspace choose the Base version.
- **Crossing marks:** draw them as CSS geometry or use a delivered face that contains the glyph.
- **Springs:** use the CSS easings and durations the token build emits.

## Rules

1. No site names, domains, people, companies or real copy. Fixtures are neutral.
2. Read values from `design-tokens`; never hard-code them.
3. Every visible affordance works, is deliberately disabled, or is labelled as a static specimen.
4. Approval, implementation and verification stay separate; never self-approve.
5. Git: work in this repository. The composing workspace chooses what renders.
