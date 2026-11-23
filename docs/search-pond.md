# The Search pond

The Search page can draw a pond behind its form: a decorative field that moves with the visitor and never carries results, never becomes a search data source and never takes a click away from a control. [Search and the shell](search-and-shell.md) describes the page it sits on. Base hosts the pond. The fish engine that draws it is not part of this repository and is not licensed by it; a workspace supplies its own, and without one the Search page has no pond.

## The host and the engine slot

[`search-pond.js`](../scripts/search-pond.js) is the host. It reads the world's tokens, creates the canvas inside `.search-page__field`, sizes it, follows the pointer, runs the animation loop and decides when the pond may move. The engine never reads the document, the motion preference or the clock.

The engine arrives at [`shared/pond-engine.mjs`](../shared/pond-engine.mjs). Base's copy exports `createPond = null`, so Base's own fixtures and any workspace that supplies nothing show the Search page without a pond. A workspace supplies an engine by excluding that file from its Base source and mounting its own module at the same path:

```toml
# The workspace's Base source leaves out the empty slot.
location = { kind = "filtered-filesystem", root = "machine:themes/gazette-theme-base", exclude = [".git", "shared/pond-engine.mjs"] }

# Its Theme binding mounts the workspace's engine there.
resource_inputs = { "shared/pond-engine.mjs" = { input = "pond-engine", entry = "pond-engine.mjs" } }
```

The mounted file must be a single module: it is compiled into `module:search` with Base's other inputs and cannot import files of its own.

## The engine contract

`createPond({ canvas, stage, appearance, ripples })` returns the engine. `canvas` is the field's canvas, `stage` is the field's width over its height, and positions are measured in field heights, so the stage is `stage` wide and one unit tall. `ripples` is Base's shared wave alphabet from [`surface-ripples.js`](../scripts/surface-ripples.js), as `{ energy, glyph }`, so the pond's rings match the portrait reveal's.

`appearance` carries the world's resolved tokens: `cell`, `pace`, `reducedPace`, `gridOpacity`, `font` and `weight`; `colours`, the six world colours as hex; `water`, the paper colour as RGB; `accent` and `shadow` as CSS colours; and `ink`, the grid colour with RGB values for dashes, squares, ripples and wakes.

The engine answers:

| Method | Called when |
| --- | --- |
| `resize(cssWidth, cssHeight, deviceWidth, deviceHeight)` | the field is built or changes size; the backing size is capped at two device pixels per CSS pixel |
| `setTheme('light' or 'dark')` and `setPace(value)` | the colour mode or motion preference changes |
| `step(dt)` then `render(dt)` | each animation frame, with `dt` in seconds and at most 0.05 |
| `render(0)` | the pond is stopped and shows a still |
| `setPointer(x, y)`, `clearPointer()` and `drop(x, y)` | the pointer moves, leaves or taps the open field |
| `scatter()` and `nudge()` | a search is submitted, or someone types |

If `createPond` throws, the host hides its canvas and Search works as before.

## When the pond moves

The host runs at most one animation loop and stops it whenever the pond cannot be seen or should not move: when the field leaves the viewport, the page is hidden or printing, the visitor pauses it, or reduced motion is preferred. A stopped pond shows a still. A new field size, new tokens, a colour-scheme change or a restored context build a new engine. With reduced motion the host ignores the pointer, taps, scatter and nudge.

## World tokens

The host reads `--layout-search-pond-cell`, `--motion-search-pond-pace`, `--motion-reduced-search-pond-pace`, `--world-material-raster-opacity`, the system type family and weight, and `--color-paper`, `--color-sheet`, `--color-ink`, `--color-muted`, `--color-accent` and `--color-line`. If any is missing or invalid, the field stays empty. The field's own opacity comes from `--material-discovery-field-opacity` in Base's stylesheet. These tokens are defined in design-tokens and reach Base and each world through their captured stylesheets; change a value there and recapture.

## Check a change

`npm run test:pond` runs both pond suites. [`search-pond.test.mjs`](../fixtures/search-pond.test.mjs) checks the empty slot, the tokens handed to an engine and the host's loop. Both also run with Base's whole suite in `npm test`. [`pond-browser.test.mjs`](../fixtures/pond-browser.test.mjs) opens the field in Chromium. Without an engine it checks that nothing is drawn or scheduled. With [a stand-in engine](../fixtures/pond-engine-fixture.mjs) it checks that the host makes no requests beyond its page, stops its loop when paused, unseen or destroyed, and paints one still with reduced motion.

To capture a workspace's engine per world, run:

```sh
npm run pond -- --out /path/to/run --engine /path/to/pond-engine.mjs --world NAME=/path/to/world.css,/path/to/system-face.woff2
```

Each `--world` adds one world's captured stylesheet and, where it names one, its system face. The command captures stills in light and dark, with full and reduced motion, on desktop and phone: the first frame, the school at rest, a pointer sweep, taps and a scatter. The browser clock is paused before the page loads and randomness is seeded, so two runs of the same engine give identical stills, and two engine versions can be compared pixel for pixel. It also records real-time videos and timings: module import and mount, time to the first drawn pond, and the cost of each animation frame, unthrottled on desktop and with the CPU slowed four times on the phone.
