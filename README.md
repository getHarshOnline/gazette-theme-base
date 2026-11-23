# gazette-theme-base

Base gives Gazette publications their shared behavior: navigation, reading, Search, controls and the lifecycles of films and other scenes. World themes inherit that behavior and supply type, material, geometry, light and rhythm. Gazette supplies resolved content and destinations; the composing workspace chooses the packages, assets and copy; `design-tokens` supplies the values.

A repair to shared behavior belongs here so the same action keeps the same meaning in every world. Existing accepted compositions remain the reference while that implementation changes. This is a development package: the fixtures cover specific behavior, and crossing previews and further capability tenants remain unfinished.

## Why the parts are shared

**Present supplied meaning.** A collection, an ordered journey, a chronological list and related reading can share a visual recipe without becoming the same relationship. Base uses the engine's facts and the owner's words. Missing identity, testimony, rights, media or service availability stays missing; a component creates none of them.

**Keep one frame.** Navigation and tools retain their place across page families. Compact menus return focus and preserve the reading position. A short page can fill the viewport without making the ending overlap a long one. The frame does not turn every page into an article.

**Keep one document.** Reading tools rearrange around the complete argument. Notes move their original body into the panel and restore it; footnotes keep their individual returns; citation describes the whole work. Tables, equations and code retain their meaning and scale when they need local scrolling.

**Respect ordinary navigation.** A link keeps its exact destination. A mark shows known destination identity; it does not choose the route or invent a relationship. The browser owns history and scroll recovery. Base may restore the exact link or Search context left behind, yielding to new input.

**Choose a component by the relationship.** Independent capabilities, ordered steps, comparisons, questions and attributed accounts need different forms. They share controls and type roles, not invented meaning. Original accessible nodes remain the complete account when enhancement is absent.

**Add motion to a complete page.** The world supplies the scene and meaningful timing. Base supplies decoding, interruption, focus, visibility, preference, print and disposal behavior. A complete still or storyboard remains usable when movement is unavailable; a fixture proving transport does not prove visual continuity or device performance.

**Keep dependencies explicit.** Values come from the token producer, required resources from the package manifest and optional integrations from configured inputs. A generated token capture supports a fixture; it is not another design source. Selection assistance sends nothing until activation, and an external provider link promises no sign-in detection or successful prefill.

## Shared parts and world choices

Change a shared part at its source, then check its consumers against the accepted composition. A repair does not reopen unrelated accepted decisions. When a page is too quiet, give it more presence within its Peak; do not add another restriction.

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

## Find the behavior

| Work | Read |
| --- | --- |
| Page task, About, products, services and comparisons | [Page families and modes](docs/page-families.md) |
| Article, Notes, citation, tables and reading assistance | [Reading and its tools](docs/reading.md) |
| Collections, generated lists, cards and decks | [Listings and cards](docs/listings-and-cards.md) |
| Full-page Search and the command tool | [Search and shell](docs/search-and-shell.md) |
| Header, compact menu and the shared ending | [Navigation and footer](docs/navigation-and-footer.md) |
| Frame delivery, portraits, sequences and ambient openings | [Films and scenes](docs/films-and-scenes.md) |
| Preferences, controls and shared browser helpers | [Settings and states](docs/settings-and-states.md) |
| Destination marks and return visits | [Links between sites](docs/links-between-sites.md) |
| Add a world and verify its binding | [Start a world](docs/start-a-world.md) |
| Page attributes and their writers | [Attributes](docs/attributes.md) |
| Stock, register, light, amplitude, island, enclave and other terms | [Material words](docs/material-words.md) |

The engine owns its theme context, resource and template-selection contract. These pages explain what Base adds to it. Start implementation work with [AGENTS.md](AGENTS.md) and the world's own `WORLD.md`.

## Shared verification entrypoint

Install the pinned browser tools once with `npm ci` and `npx playwright install chromium`. Every self-test then runs from one command against the selected engine build:

```sh
python3 fixtures/check.py --gazette /path/to/gazette --sdk /path/to/gazette/sdk/js/browser-resources.toml
```

| Command | Checks | Does not check |
| --- | --- | --- |
| `python3 fixtures/check.py --gazette PATH [--sdk PATH]` | The [attribute inventory](docs/attributes.md#check-a-change) against source writers, the whole Node suite below, and neutral Gazette fixtures for reading (with the preferred-source invitation), documentation, About, Search, services, deployment (missing page and manifest discovery), frames, resolved links and feeds. `--sdk` adds native analytics and WebMCP with the actual SDK; without it the run says they were left out. | A world's composition, a served publication or visual acceptance |
| `npm test` | Every `fixtures/*.test.mjs`: script and command unit tests, and browser self-tests that run the journey runner, loading profiler, pond host and rendered components in Chromium against neutral local pages. It needs no Gazette build. | Gazette output. Two browser checks need compiled inputs and are reported as skipped without them: the compact header (`GAZETTE_SASS_MODULE`, `GAZETTE_HEADER_DISPLAY_FONT`, `GAZETTE_HEADER_READING_FONT`) and the cinematic still fallback (`GAZETTE_BASE_STYLESHEET`, `GAZETTE_FILM_STYLESHEET`). |
| `npm run test:capture`, `test:journeys`, `test:profile`, `test:pond` | The part of `npm test` that covers one command, for quick iteration | Anything outside that command |

A world composition runs through its world's own fixtures, which reuse Base's reading fixture with the world's resource bindings and expectations; [Start a world](docs/start-a-world.md#check-the-binding) explains those inputs. The commands below run against served pages and are not self-tests.

For a Base, world or token change, compare the affected rendered pages with the workspace's accepted captures:

```sh
npm run capture -- --tool /path/to/pale/tools/design-verification/capture.mjs --profile /path/to/capture-profile.json --baseline /path/to/accepted/cells.json --out /path/to/new-capture
```

The reference manifest supplies the actual page URLs; publication names and addresses belong to the workspace. All profile widths, light/dark and full/reduced motion run by default, with web and compact touch contexts. The command uses Base's declared Playwright even when called from another directory. Pale scrolls through lazy content and fails text that never becomes visible. Native animations keep running. Remaining options pass to Pale, so a deliberately narrower run remains identifiable in its records.

For an explicit viewport image, pass `--viewport`; it still traverses the page before returning to the top, but records only that viewport. Long full-page touch captures currently fail Chromium’s pointer-emulation check. Use `--contexts web` for the full-page matrix and `--contexts mobile --widths phone --viewport` for a separately labelled touch viewport run. That run does not establish full-page touch appearance.

Open the generated `comparison.html` and inspect the reference and current image for each page at native scale. Missing reference cells, missing images, earlier measurement failures and current failures remain visible; a comparison never supplies new acceptance for those gaps. A fresh output directory is required, and a failed or skipped capture keeps its nonzero exit status.

To walk served pages and check their controls and navigation (a browser route check; it has no relation to the journeys an author declares in Gazette content, which are ordered reading sequences), run `npm run journeys -- --manifest /path/to/journeys.json --out /path/to/new-run`. The [journey guide](docs/journeys.md) describes the complete route matrix, shared interaction checks, optional fallback/loading suites and explicit incomplete coverage.

For the Search pond, `npm run pond -- --out /path/to/run --engine /path/to/pond-engine.mjs` captures a workspace's engine per world, with stills that repeat exactly between runs. The [pond guide](docs/search-pond.md) explains the engine contract, tokens and capture options.

For loading delays, run `npm run profile -- --out /path/to/loading.json URL` against the actual preview or test host. The [page-loading guide](docs/performance.md) explains the cold browser conditions, request records and incomplete captures. It measures observed loading separately from Gazette build time and the visual capture workflow.

For a visual or interaction change, open the affected page and exercise its relevant widths, modes, motion preferences and controls. In a Pale checkout, `tools/design-verification/README.md` supplies source scans and browser capture. Check a changed shared attribute at its template, script, style and world consumers.

A passing fixture establishes the behavior it exercises. Browser inspection establishes the inspected rendering and interaction; design review judges the composition. Neither grants publication approval or establishes every device, external destination or journey. Record failures and limits with the result; preserve the owner's existing approval scope.

## Licence

Base is licensed under the MIT License with an attribution term: a site built with it keeps a footer credit stating that it was made using Gazette, such as "Made using Gazette", linking to [rawthoughts.in/gazette](https://rawthoughts.in/gazette/), and a link to this repository. [LICENSE](LICENSE) gives the full terms and the files that keep their own: Gazette's [search module](scripts/vendor/gazette-search/) is under the Apache License, Version 2.0 and its Elasticlunr dependency under MIT.

The search pond's fish engine is not part of this repository and is not licensed by it.
