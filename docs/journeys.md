# Check publication journeys

The journey runner is a browser route check: it walks pages a Gazette preview already serves and checks that their controls and navigation work, with Base’s pinned Playwright browser. A journey here means that scripted walk. It is a different thing from the journeys an author declares in Gazette content, which are ordered reading sequences, and the command keeps its name until it is renamed. It checks controls and navigation in the actual rendered document. It does not start a preview server, rewrite responses, use a personal browser profile or change system settings.

From this repository, install the existing package dependencies and the pinned headless browser:

```sh
npm ci
npx playwright install chromium
npm run test:journeys
```

Prepare a manifest outside tracked source, then start the publication’s ordinary preview server. The workspace that selects publications owns their URL inventory and independent content expectations. Base contains no publication names or local port map.

```json
{
  "version": 1,
  "routes": [
    { "url": "http://localhost:4310/", "kind": "home" },
    {
      "url": "http://localhost:4310/about/",
      "kind": "page",
      "heading": "About",
      "masthead": true,
      "canonical": "https://example.org/about/"
    }
  ]
}
```

```sh
npm run journeys -- --manifest /path/to/journeys.json --out /path/to/new-run
```

The output directory must be new. Run `npm run journeys -- --help` for the command’s options. Its default plan has eight cells per route: widths of 390, 768, 1280 and 1920 pixels, each in light and dark. The default height is 960 pixels and the pixel density is 1. Compact cells enable touch input; they do not establish behavior on physical devices. Full motion is the default. Set `widths`, `height`, `modes` or `motions` in the manifest to declare another matrix; `motions` accepts `no-preference` and `reduce`.

## What the primary check exercises

Every page receives its own semantic, shell and applicable control checks. Search refinement runs in the Search page’s existing context. A reading sequence is traversed once per ordered member list, width, palette and motion setting; later member pages reference that exact observation instead of repeating the whole sequence. Repeated header destinations similarly reference the first successful click and Back check within the same origin and presentation.

| Surface | Checks |
| --- | --- |
| Document and chrome | One main and H1, optional independent heading/canonical expectations, unlinked masthead title on declared special pages, internal navigation and Back, compact menu, dialog focus and Escape |
| Preferences | System palette versus the same explicit palette, explicit opposite palette, reduced-motion behavior and restoration |
| Reading | Every native disclosure, nested disclosure access, Notes dialog, every outline anchor, all reading-sequence Next and Previous edges, boundaries, current markers, Back and Forward |
| Cards | Every real slide in quote, catalogue, article, Search and discovery decks; active state, arrow boundaries, looping, link hit targets, image loading/source/geometry and drag where supported |
| Media | Each exposed viewer, current palette’s declared image, live vector identity, rendered zoom size, fit restoration, Escape and trigger focus |
| Process and views | Every process step and radio-selected view, panel visibility and media |
| Search | Native corpus identity, date and same-day timestamp ordering, undated results, author refinement, query/result/Back state, empty results and pagination reset |

A route’s optional `figures` array names local calculator containers whose select options, radio/checkbox controls, range endpoints and ordinary buttons should be operated. These controls must have no external effects. Their output is recorded; that does not verify the scientific or business model. Keep those numerical assertions with the owning content or world’s tests. Unknown controls remain explicitly unexercised rather than being clicked indiscriminately.

Optional `queries` contain `{ "text": "query", "first": "expected URL", "includes": ["expected URL"] }`. Expected ranking comes from the workspace’s reviewed examples; no query, site or score is hardcoded in Base. Omit `first` or `includes` when no such claim is intended.

## Additional checks

Use `--suites` to select one or more suites. These add their own cells and contexts; omitted suites are listed in the report.

| Suite | Scope |
| --- | --- |
| `interactions` | The primary checks above; selected by default |
| `motion` | Home-page wheel traversal forward and back, portrait introduction/focus continuity, declared film resize points; other page kinds are recorded as not applicable without opening a browser context |
| `nojs` | Native navigation, disclosures, images, readable home scenes, Search catalogue pagination and article content with scripts disabled |
| `print` | Emulated print styles, complete static scenes, code wrapping, tables, figures, notes and removal of screen-only controls |
| `loading` | Cold stationary navigation through the real server, using the shared [loading profiler](performance.md) without network throttling |
| `delayed` | The same observation with a 1.5-second delay on image/font requests, including layout-shift source geometry |

```sh
npm run journeys -- --manifest /path/to/journeys.json --out /path/to/new-run \
  --suites interactions,motion,nojs,print,loading,delayed
```

Pinned film resize checks require the route’s `films` entries: `{ "sceneIndex": 0, "progress": 0.5, "film": { "layout": "pinned", "approach": 0, "departureAt": 0.9 } }`. Supply the native authored timing recipe, not values fitted to a screenshot. A pinned scene without that input is explicitly unexercised. Detailed reading holds, numeric models and world-specific narrative expectations remain in their owning repositories.

The print suite observes browser print-media emulation, not native print pagination or exported PDF quality. Loading results establish completion and measurements, not field Web Vitals scores. Interaction timings report actual observed browser input; missing or sub-threshold entries are not zero latency and are not field INP.

## Layout and visual review

Use the existing [capture command](../README.md#shared-verification-entrypoint) for Pale’s traversal, text visibility and geometry checks, with accepted reference images where available. To invoke Pale’s capture directly after the journey run, supply both `--capture-tool /path/to/capture.mjs` and `--capture-profile /path/to/profile.json`. Base passes its pinned Playwright module to that tool; it does not maintain another layout scanner. Without those options, the report identifies the separate layout gate as unrun.

Inspect failure captures and the resulting pages. Automated checks do not approve composition, motion timing, crops or copy. A successful cell establishes only its recorded operations.

## Bounds and evidence

The default overall budget is 30 minutes; each suite/cell has a two-minute maximum. `--budget-ms`, `--timeout-ms`, `--offset` and `--limit` make a bounded run explicit. The complete selected plan remains in `report.json`; unfinished and omitted cells are `unrun`, never borrowed from an earlier candidate. Any failed, incomplete or unrun selected cell returns nonzero. Every completed case is also appended immediately to `cases.jsonl`; the summary is refreshed periodically and at normal completion.

Browsers run one context at a time. A deadline closes only the owned context. Requests are limited to HTTP GET/HEAD on the manifest’s route origins and optional `allowedOrigins`; external actions remain blocked and listed. A loading capture distinguishes pending, cancelled, failed and completed requests. The runner never submits forms or gives publication approval.

For a duration estimate, run a few representative cells with `--limit` and use their reported elapsed times alongside the complete planned count. That subset remains incomplete. Pages with many controls or reading-sequence edges cost more than ordinary pages; a fixed promise for a large publication would hide that difference.

`npm run test:journeys` checks the option parser and plan, then exercises a neutral local server with native disclosures, complete reading-sequence edges, browser history and script-free/print fallbacks in the pinned browser. It closes its server, contexts and temporary output. `npm test` and `fixtures/check.py` run the same tests with the rest of Base's suite. The self-test has no carousel, media or Search page, so those checks run only against a real manifest.
