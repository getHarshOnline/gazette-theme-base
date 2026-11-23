# Measure page loading

Use Base’s profiler to find what a browser waits for while opening a page. It records paint timings, layout shifts, long tasks and requests from the server you choose. Gazette build duration is a separate measurement. This command neither builds the site nor changes its compression, caching, artwork or scripts.

## Prepare the browser and pages

Use Node 22 or newer. From this repository, install the locked dependencies and the matching Chromium build:

```sh
npm ci
npx playwright install chromium
npm run test:profile
```

The last command checks the recorder against local neutral pages, including compressed CSS, a redirect, an unfinished request, a cancellation and a broken image. It closes its browser and server and removes its temporary output. It needs no publication content or sibling checkout. On Linux, provision Playwright’s documented browser dependencies for your environment before running it; the profiler does not install software or change system settings.

Start your Gazette preview or deployed test server through its normal workflow. Pass the exact page URLs to the profiler, and put results outside the theme source tree:

```sh
npm run profile -- --out ../loading-light.json --repeat 3 \
  http://127.0.0.1:8080/ \
  http://127.0.0.1:8080/reading/

npm run profile -- --out ../loading-dark.json --mode dark --repeat 3 \
  http://127.0.0.1:8080/
```

Each navigation gets a fresh browser context with caching disabled and service workers blocked. Pages run sequentially. The browser is Playwright’s managed headless Chromium, not a signed-in desktop profile. Third-party resources requested by the page still load; the command does not rewrite URLs or manufacture successful responses.

The default viewport is 390 × 844 CSS pixels at density 1, with mobile and touch emulation. Light mode is the default; native animation remains enabled. The slow-mobile profile applies fourfold CPU slowdown and 562.5 ms request latency, with download and upload rates of 1474.56 and 675 Kibit/s respectively, approximately 1.51 and 0.69 Mbit/s. These are applied browser conditions, not Lighthouse’s simulated scoring model or a physical device.

Use `--profile unthrottled` for a separate local baseline. `--width`, `--height`, `--mode`, `--repeat`, `--timeout-ms` and `--settle-ms` select other conditions; `npm run profile -- --help` lists their ranges. Viewport changes retain mobile/touch emulation, so this command does not stand in for the desktop interaction matrix.

## Read the result

The JSON records the selected conditions, browser version and every navigation separately. Repeated navigations are not averaged: compare their distribution and investigate outliers before attributing a difference to a code change. Existing output files are refused so a failed new run cannot silently replace an earlier result.

| Field | What it establishes |
| --- | --- |
| `lcp` and `observed.candidates` | The last observed largest-content paint and its preceding candidates, including the element and image URL when available. Times are milliseconds from navigation. |
| `fcpMs` | When the browser first painted text, an image or other content. |
| `observed.cls` | The largest layout-shift session window during this stationary capture, excluding shifts after recent input. This is not a full page-lifetime or field CLS distribution. |
| `observed.longTasks` | Count, total duration and longest task during capture. These are not INP or Lighthouse TBT. |
| `requests` | Discovery, response and completion times, content encoding, protocol and outcome for each recorded request. Redirect hops remain separate. |
| `summary.completedBytes` | Encoded transfer reported for completed requests and redirects, including response headers where Chromium reports them. |
| `summary.partialBodyBytes` | Encoded body bytes reported before pending, cancelled or failed requests ended. It excludes their unreported headers and is not a complete transfer total. |
| `summary.assets` | Request counts and completed/partial encoded bytes grouped by resource type and MIME type, sorted by measured bytes. Each request remains available for per-asset diagnosis. |
| `observed.shiftSources` | Bounded layout-shift source elements and before/after rectangles for finding font and media geometry changes. |
| `capture`, `settled`, `error`, `truncated` | Whether the recorder reached its stopping condition, hit a limit or lost part of the evidence. |

Capture stops after document load, loaded fonts, complete visible images and a stable LCP candidate for 3.5 seconds. The normal limit is 60 seconds per page, with a five-second shutdown allowance for an unresponsive page. Optional background fetches can still be pending when capture stops. Requests retain that state before browser teardown; teardown does not turn them into reported cancellations. A stable candidate is not proof that a delayed animation can never paint something larger later.

Request states are `completed`, `redirected`, `pending`, `cancelled` and `failed`. A cancelled request is neither a successful download nor necessarily an application defect: inspect its initiator and the page’s lifecycle. HTTP error responses and uncancelled network failures remain failures even if the page’s main text appeared. The recorder bounds each page to 1,000 request records, 128 paint candidates and 100 page exceptions; hitting a limit marks the capture incomplete.

The command returns nonzero for a capture that did not settle, lost records, encountered a page exception, an HTTP error or an uncancelled network failure. Pending optional requests and cancellations stay visible without automatically failing a settled capture. A successful exit establishes only those checks, not a performance target, visual acceptance or publication readiness.

## Compare a change without changing the question

Compare the same emitted page and conditions before and after one delivery change. Inspect the actual LCP element and its request chain: reducing an unrelated large asset may save bytes without making that element appear sooner. Request durations overlap, so summing every duration does not explain total load time. Check the delivered `Content-Encoding` when evaluating compression; compressed files on disk alone do not prove the host serves them.

Keep image geometry, fonts, modes and animation in the comparison. A faster result caused by a failed image or a missing stylesheet is a defect, not an optimization. Then use the [capture and interaction workflow](../README.md#shared-verification-entrypoint) to inspect the affected pages and controls across their supported conditions. This stationary loading recorder does not scroll through pages, exercise controls, audit indexing or replace that review.

For the metric definitions and browser prerequisites, see [LCP diagnosis](https://web.dev/articles/optimize-lcp), [CLS session windows](https://web.dev/articles/cls), and [Playwright’s browser installation guide](https://playwright.dev/docs/browsers).
