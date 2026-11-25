#!/usr/bin/env node
/** Exercise served pages without modifying their content or starting a preview server. */
import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { runCase } from "./journeys/case.mjs";
import { must } from "./journeys/support.mjs";
import { httpURL, integers, readOptions } from "./lib/args.mjs";
import { launch, runPale } from "./lib/browser.mjs";
import { profilePage, failedCapture, profiles } from "./profile.mjs";

export const suites = [
  "interactions",
  "motion",
  "nojs",
  "print",
  "loading",
  "delayed",
];
const help = `npm run journeys -- --manifest FILE --out DIRECTORY [options]

Start the preview separately. Install the pinned browser with npm ci and
npx playwright install chromium. The manifest supplies explicit served URLs.
Every route runs at 390, 768, 1280 and 1920 pixels in light and dark by default.
Checks run sequentially in isolated headless contexts; no user profile is used.

  --suites LIST       Comma-separated suites; default interactions (see docs/journeys.md)
  --timeout-ms MS     Limit for each suite/cell, default 120000; 5000–600000
  --budget-ms MS      Overall run budget, default 1800000; unfinished cells stay unrun
  --offset INDEX     First planned case, default 0; omitted cases remain explicit
  --limit COUNT      Maximum cases to execute; default all
  --capture-tool FILE   Existing Pale capture.mjs (requires --capture-profile)
  --capture-profile FILE  Pale viewport/profile configuration

Output contains the complete plan, per-case results, failure captures and scope.
A failure, incomplete case or selected subset returns nonzero; it is not approval.
No form submission, external provider mutation or system setting change is made.
`;
export function journeyArguments(args) {
  const result = {
    timeoutMs: 120000,
    budgetMs: 1800000,
    offset: 0,
    limit: Number.MAX_SAFE_INTEGER,
    suites: ["interactions"],
    ...readOptions(
      args,
      {
        "--manifest": "manifest",
        "--out": "out",
        "--suites": "suites",
        "--timeout-ms": "timeoutMs",
        "--budget-ms": "budgetMs",
        "--offset": "offset",
        "--limit": "limit",
        "--capture-tool": "captureTool",
        "--capture-profile": "captureProfile",
      },
      { sentenceCase: true },
    ),
  };
  must(
    result.manifest && result.out,
    "Pass --manifest FILE and --out DIRECTORY.",
  );
  integers(
    result,
    [
      ["timeoutMs", 5000, 600000],
      ["budgetMs", 5000, 86400000],
      ["offset", 0, Number.MAX_SAFE_INTEGER],
      ["limit", 1, Number.MAX_SAFE_INTEGER],
    ],
    (name) => `Invalid ${name}.`,
  );
  if (typeof result.suites === "string")
    result.suites = result.suites.split(",");
  must(
    result.suites.length &&
      new Set(result.suites).size === result.suites.length &&
      result.suites.every((value) => suites.includes(value)),
    "Unknown or duplicate suite.",
  );
  must(
    !!result.captureTool === !!result.captureProfile,
    "Pass both --capture-tool and --capture-profile.",
  );
  for (const key of ["manifest", "out", "captureTool", "captureProfile"])
    if (result[key]) result[key] = resolve(result[key]);
  return result;
}
export function journeyManifest(input) {
  must(
    input?.version === 1 && Array.isArray(input.routes) && input.routes.length,
    "Manifest version 1 requires routes.",
  );
  const widths = input.widths ?? [390, 768, 1280, 1920],
    modes = input.modes ?? ["light", "dark"],
    motions = input.motions ?? ["no-preference"];
  must(
    widths.length &&
      widths.every(
        (value) => Number.isSafeInteger(value) && value >= 240 && value <= 7680,
      ) &&
      new Set(widths).size === widths.length,
    "Invalid or duplicate widths.",
  );
  must(
    modes.length &&
      modes.every((value) => ["light", "dark"].includes(value)) &&
      new Set(modes).size === modes.length,
    "Invalid or duplicate colour modes.",
  );
  must(
    motions.length &&
      motions.every((value) => ["reduce", "no-preference"].includes(value)) &&
      new Set(motions).size === motions.length,
    "Invalid or duplicate motion modes.",
  );
  const height = input.height ?? 960;
  must(
    Number.isSafeInteger(height) && height >= 240 && height <= 7680,
    "Invalid height.",
  );
  const routes = input.routes.map((route) => {
    must(route && typeof route === "object", "Each route must be an object.");
    const url = httpURL(route.url);
    must(
      !new URL(url).hash,
      "Route inventory must name documents without fragments.",
    );
    must(
      ["home", "article", "search", "page", "alias", "not-found"].includes(
        route.kind ?? "page",
      ),
      "Unknown page kind.",
    );
    if (route.authoredControls !== undefined)
      must(
        typeof route.authoredControls === "boolean",
        "Authored controls require a boolean selection.",
      );
    if (route.figures)
      must(
        Array.isArray(route.figures) &&
          route.figures.every((value) => typeof value === "string" && value),
        "figures must contain CSS selectors.",
      );
    if (route.canonical) httpURL(route.canonical);
    must(
      !route.checks,
      "Run world/content-specific checks in their owning repository; check modules are not loaded here.",
    );
    if (route.queries)
      must(
        Array.isArray(route.queries) &&
          route.queries.every(
            (query) => typeof query.text === "string" && query.text,
          ),
        "queries require text.",
      );
    if (route.films)
      must(
        Array.isArray(route.films) &&
          route.films.every(
            (film) =>
              Number.isSafeInteger(film.sceneIndex) &&
              film.sceneIndex >= 0 &&
              film.film &&
              Number.isFinite(film.progress) &&
              film.progress >= 0 &&
              film.progress <= 1,
          ),
        "films require sceneIndex, film recipe and progress.",
      );
    return { ...route, url, kind: route.kind ?? "page" };
  });
  must(
    new Set(routes.map((route) => route.url)).size === routes.length,
    "Duplicate route.",
  );
  const allowedOrigins = [
    ...new Set([
      ...routes.map((route) => new URL(route.url).origin),
      ...(input.allowedOrigins ?? []).map(
        (value) => new URL(httpURL(value)).origin,
      ),
    ]),
  ];
  return { ...input, widths, modes, motions, height, routes, allowedOrigins };
}
export function planCases(manifest, selected = ["interactions"]) {
  return manifest.routes.flatMap((route) =>
    manifest.widths.flatMap((width) =>
      manifest.modes.flatMap((mode) =>
        selected.flatMap((suite) => {
          const motions = ["interactions", "motion"].includes(suite)
            ? manifest.motions
            : ["no-preference"];
          return motions.map((motion) => ({
            ...route,
            width,
            height: manifest.height,
            mode,
            motion,
            suite,
            applicable: suite !== "motion" || route.kind === "home",
          }));
        }),
      ),
    ),
  );
}
async function capture(options, manifest) {
  if (!options.captureTool)
    return {
      state: "unrun",
      reason:
        "Run the existing Pale capture or Base capture command for layout and visual comparison.",
    };
  const output = join(options.out, "layout");
  const run = await runPale({
    tool: options.captureTool,
    profile: options.captureProfile,
    out: output,
    urls: manifest.routes.map((route) => route.url),
    timeoutMs: options.budgetMs,
  });
  const code = run.signal ? 1 : (run.code ?? 1);
  return {
    state: code === 0 ? "captured" : "failed",
    exitCode: code,
    output,
    scope: "Pale measured capture; human review still required.",
  };
}
export async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(help);
    return 0;
  }
  const options = journeyArguments(args),
    raw = await readFile(options.manifest, "utf8"),
    manifest = journeyManifest(JSON.parse(raw));
  const plan = planCases(manifest, options.suites),
    selection = new Set(options.suites);
  const completedJourneys = new Map(),
    navigationSeen = new Map(),
    searchCorpora = new Map();
  await mkdir(dirname(options.out), { recursive: true });
  await mkdir(options.out);
  const report = {
    version: 1,
    startedAt: new Date().toISOString(),
    manifestSha256: createHash("sha256").update(raw).digest("hex"),
    conditions: manifest,
    scope:
      "Automated page interactions and loading observations. No design acceptance, field Web Vitals, provider submission or publication approval.",
    omittedOptionalSuites: suites.filter((suite) => !selection.has(suite)),
    planned: plan.length,
    cases: plan.map((item, index) => ({ index, ...item, state: "unrun" })),
    layout: { state: "unrun" },
  };
  const path = join(options.out, "report.json");
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  const began = Date.now();
  let browser;
  try {
    browser = await launch();
    report.browser = browser.version();
    let executed = 0;
    for (let index = 0; index < plan.length; index++) {
      const item = plan[index];
      if (!item.applicable) {
        report.cases[index] = {
          index,
          ...item,
          state: "not-applicable",
          reason: "Motion checks require a home surface.",
        };
        continue;
      }
      if (
        index < options.offset ||
        !selection.has(item.suite) ||
        executed >= options.limit
      )
        continue;
      const remaining = options.budgetMs - (Date.now() - began);
      if (remaining < 5000) break;
      const bounded = {
        ...options,
        completedJourneys,
        navigationSeen,
        searchCorpora,
        timeoutMs: Math.min(options.timeoutMs, remaining),
        allowedOrigins: manifest.allowedOrigins,
      };
      let row;
      if (["loading", "delayed"].includes(item.suite)) {
        const loaded = await profilePage(browser, item.url, {
          ...item,
          ...bounded,
          settleMs: 1500,
          delayMs: item.suite === "delayed" ? 1500 : 0,
          delayKinds: ["font", "image"],
          network: profiles.unthrottled,
        });
        row = {
          ...item,
          state: failedCapture(loaded) ? "failed" : "passed",
          profile: loaded,
        };
      } else row = await runCase(browser, item, item.suite, bounded);
      report.cases[index] = { index, ...row };
      executed++;
      await appendFile(
        join(options.out, "cases.jsonl"),
        JSON.stringify(report.cases[index]) + "\n",
      );
      if (executed % 10 === 0)
        await writeFile(path, JSON.stringify(report, null, 2) + "\n");
      console.log(
        `${row.state.toUpperCase()} ${index + 1}/${plan.length} ${item.suite} ${item.width} ${item.mode} ${item.motion} ${item.url}`,
      );
    }
  } catch (error) {
    report.error = error.message;
  } finally {
    await browser?.close();
  }
  if (options.captureTool)
    report.layout = await capture(
      {
        ...options,
        budgetMs: Math.max(1000, options.budgetMs - (Date.now() - began)),
      },
      manifest,
    );
  report.finishedAt = new Date().toISOString();
  report.counts = Object.fromEntries(
    ["passed", "failed", "incomplete", "unrun", "not-applicable"].map(
      (state) => [
        state,
        report.cases.filter((row) => row.state === state).length,
      ],
    ),
  );
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`Read ${path}`);
  return report.error ||
    report.counts.failed ||
    report.counts.incomplete ||
    report.counts.unrun ||
    report.layout.state === "failed"
    ? 1
    : 0;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
