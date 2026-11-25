import { createHash } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { must, observeInteractions } from "./support.mjs";
import { httpURL } from "../lib/args.mjs";
import { shell } from "./shell.mjs";
import { interactions } from "./interactions.mjs";
import { search } from "./search.mjs";
import { fallback } from "./fallback.mjs";
import {
  reviewCompleteJourney,
  reviewHomePass,
  reviewFilmResize,
  reviewPortraitContinuity,
} from "./continuity.mjs";

export async function runCase(browser, item, suite, options) {
  const started = Date.now(),
    deadline = started + options.timeoutMs;
  const row = {
    ...item,
    suite,
    state: "running",
    tests: [],
    timings: [],
    issues: [],
    blockedRequests: [],
    visuallyReviewed: false,
  };
  const allowed = new Set(options.allowedOrigins);
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    deviceScaleFactor: 1,
    colorScheme: item.mode,
    reducedMotion: item.motion,
    hasTouch: item.width <= 768,
    javaScriptEnabled: suite !== "nojs",
    serviceWorkers: "block",
  });
  let expired = false,
    page;
  const timer = setTimeout(() => {
    expired = true;
    void context.close().catch(() => {});
  }, options.timeoutMs);
  timer.unref();
  const requireTime = () =>
    must(
      !expired && Date.now() < deadline - 1000,
      "Case deadline reached; remaining checks are incomplete.",
    );
  try {
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (allowed.has(url.origin) && ["GET", "HEAD"].includes(request.method()))
      )
        return route.continue();
      row.blockedRequests.push({
        url: url.origin + url.pathname,
        method: request.method(),
      });
      return route.abort("blockedbyclient");
    });
    if (suite !== "nojs")
      await context.addInitScript(
        ({ mode, motion }) => {
          localStorage.setItem("color-mode", mode);
          localStorage.setItem(
            "motion-preference",
            motion === "reduce" ? "reduce" : "allow",
          );
        },
        { mode: item.mode, motion: item.motion },
      );
    page = await context.newPage();
    page.setDefaultTimeout(3500);
    page.setDefaultNavigationTimeout(15000);
    page.on("pageerror", (error) =>
      row.issues.push({ kind: "runtime", message: error.message }),
    );
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        !(
          item.kind === "not-found" &&
          response.status() === 404 &&
          response.request().isNavigationRequest()
        )
      )
        row.issues.push({
          kind: "http",
          url: response.url(),
          status: response.status(),
        });
    });
    const timing = (sample) => {
      if (!sample) return;
      const at = row.timings.findIndex(
        (value) => value.documentId === sample.documentId,
      );
      if (at >= 0) row.timings[at] = sample;
      else if (row.timings.length < 128) row.timings.push(sample);
      else
        row.issues.push({
          kind: "timing-capacity",
          message: "Timing document limit reached.",
        });
    };
    await page.exposeBinding("__recordJourneyTiming", ({ frame }, sample) => {
      if (frame === page.mainFrame()) timing(sample);
    });
    await page.addInitScript(observeInteractions);
    if (suite === "print") await page.emulateMedia({ media: "print" });
    const localURL = (value) => {
      const url = httpURL(value, item.url);
      must(
        allowed.has(new URL(url).origin),
        "Destination is outside the supplied origins.",
      );
      return url;
    };
    const go = async (value) => {
      requireTime();
      const response = await page.goto(localURL(value), {
        waitUntil: "domcontentloaded",
      });
      must(
        response?.ok() ||
          (item.kind === "not-found" && response?.status() === 404),
        `Navigation returned ${response?.status()}.`,
      );
      const fonts = page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]),
      );
      await (suite === "nojs" ? Promise.race([fonts, delay(1500)]) : fonts);
    };
    const snap = async (label, target) => {
      requireTime();
      if (target) await target.scrollIntoViewIfNeeded();
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            item.url,
            item.width,
            item.mode,
            item.motion,
            suite,
            label,
          ]),
        )
        .digest("hex")
        .slice(0, 20);
      const name = `${key}.png`;
      await page.screenshot({ path: join(options.out, name), timeout: 3000 });
      return name;
    };
    const activate = async (target, clickOptions) => {
      requireTime();
      await target.scrollIntoViewIfNeeded();
      if (item.width <= 768) await target.tap();
      else await target.click(clickOptions);
    };
    const awaitEnquiryTarget = async (link) => {
      const expected = await link.evaluate((anchor) => {
        const data = JSON.parse(
          document.querySelector("#enquiry-context")?.textContent ?? "null",
        );
        const { source, destination } = data ?? {};
        if (
          !source ||
          !destination ||
          (source.content === destination.content &&
            source.site === destination.site)
        )
          return null;
        if (
          anchor.dataset.gazetteDestinationContent !== destination.content ||
          anchor.dataset.gazetteDestinationSite !== destination.site
        )
          return null;
        return {
          site: source.site,
          content: source.content,
          page: source.url,
          button: anchor.dataset.enquiryButton ?? "services-link",
        };
      });
      if (expected) {
        await page.waitForFunction(
          ({ anchor, expected }) => {
            const query = new URL(anchor.href).searchParams;
            return Object.entries(expected).every(([field, value]) => {
              const matches = query.getAll("g_from_" + field);
              return matches.length === 1 && matches[0] === value;
            });
          },
          { anchor: await link.elementHandle(), expected },
          { timeout: 3500 },
        );
      }
    };
    const followAndBack = async (link) => {
      requireTime();
      if (suite === "nojs") {
        // Native links can move during a finite CSS entrance, even with scripts off.
        const settledBy = Date.now() + 3500;
        const moving = () => link.evaluate((anchor) => {
          for (let node = anchor; node; node = node.parentElement) {
            if (node.getAnimations().some((animation) =>
              animation.playState === "running" &&
              Number.isFinite(animation.effect?.getComputedTiming().endTime),
            )) return true;
          }
          return false;
        });
        while (await moving()) {
          requireTime();
          must(Date.now() < settledBy, "Native navigation did not settle.");
          await delay(50);
        }
      } else await awaitEnquiryTarget(link);
      const source = page.url(),
        target = localURL(await link.getAttribute("href"));
      await Promise.all([
        page.waitForURL(target, { waitUntil: "domcontentloaded" }),
        activate(link, { noWaitAfter: true }),
      ]);
      must(
        page.url() === target,
        "Native link did not reach its declared destination.",
      );
      return {
        source,
        target,
        async back() {
          await page.goBack({ waitUntil: suite === "nojs" ? "load" : "domcontentloaded" });
          must(page.url() === source, "Back lost the source page.");
        },
      };
    };
    const run = async ({ id, kind, operation }) => {
      requireTime();
      const result = { id, kind, state: "passed" };
      try {
        const value = await operation();
        Object.assign(result, value);
        if (value?.status) result.state = value.status;
      } catch (error) {
        result.state =
          expired || Date.now() >= deadline - 1000 ? "incomplete" : "failed";
        result.reason = error.message;
        if (result.state === "failed")
          try {
            result.capture = await snap(id);
          } catch {
            /* Preserve the original failure. */
          }
      }
      row.tests.push(result);
      if (result.state === "incomplete") throw new Error(result.reason);
      return true;
    };
    const env = {
      page,
      context,
      row,
      item: { ...item },
      suite,
      allowed,
      deadline,
      requireTime,
      go,
      snap,
      activate,
      localURL,
      followAndBack,
      run,
      options,
    };
    if (item.kind === "alias") {
      // A route alias only leads to its canonical page, so it is checked as a
      // document rather than exercised; following it would leave the preview.
      await run({
        id: "alias",
        kind: "semantics",
        operation: async () => {
          const response = await page.request.get(localURL(item.url), {
            maxRedirects: 0,
          });
          must(response.ok(), `Alias returned ${response.status()}.`);
          const html = await response.text(),
            decode = (value) =>
              value?.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
                String.fromCodePoint(parseInt(hex, 16)),
              ),
            canonical = decode(
              html.match(/<link rel="canonical" href="([^"]*)"/)?.[1],
            ),
            target = decode(
              html.match(/http-equiv="refresh" content="0; url=([^"]*)"/i)?.[1],
            );
          must(
            canonical && target === canonical,
            "An alias must refresh to its canonical page.",
          );
          return { target };
        },
      });
      row.state = row.tests.some((test) => test.state !== "passed")
        ? "failed"
        : "passed";
      return row;
    }
    await go(item.url);
    if (item.kind === "page") {
      const surface = await page.evaluate(() =>
        document.querySelector(".search-page")
          ? "search"
          : document.querySelector("article.reading-document")
            ? "article"
            : "page",
      );
      env.item.kind = surface;
      row.detectedKind = surface;
    }
    const collections = async () => {
      const journeys = await page
        .locator("details.reading-orientation__journey")
        .evaluateAll((nodes) =>
          nodes.map((node, journeyIndex) => ({
            journeyIndex,
            label: node.querySelector("nav")?.getAttribute("aria-label"),
            members: [...node.querySelectorAll(".reading-chapters > li")].map(
              (li) => ({
                title: li.textContent.replace(/\s+/g, " ").trim(),
                path: li.querySelector('[aria-current="page"]')
                  ? location.href
                  : li.querySelector("a")?.href,
              }),
            ),
          })),
        );
      for (const journey of journeys)
        await run({
          id: `collection:${journey.journeyIndex}`,
          kind: "collection",
          operation: async () => {
            must(
              journey.members.every((member) => member.path),
              "Journey member has no route.",
            );
            if (journey.members.length < 2)
              return {
                state: "not-applicable",
                reason: "Journey contains fewer than two members.",
              };
            const key = JSON.stringify([
              journey.label,
              journey.members.map((member) => member.path),
              item.width,
              item.mode,
              item.motion,
            ]);
            const previous = options.completedJourneys?.get(key);
            if (previous)
              return {
                state: "not-applicable",
                reason:
                  "This ordered reading sequence was already exercised in this run.",
                coveredBy: previous,
              };
            // Native member labels are checked independently from the destination H1.
            const result = await reviewCompleteJourney({
              ...item,
              ...journey,
              env,
              title: journey.label,
              seedPath: journey.members[0].path,
            });
            if (result.status === "passed")
              options.completedJourneys?.set(key, {
                url: item.url,
                suite,
                width: item.width,
                mode: item.mode,
                motion: item.motion,
              });
            return result;
          },
        });
    };
    if (suite === "interactions") {
      await shell(env);
      await go(item.url);
      await interactions(env);
      if (env.item.kind === "search")
        await run({
          id: "search-refinement",
          kind: "search",
          operation: async () => {
            await go(item.url);
            const result = await search(env);
            must(!result.issues.length, result.issues.join("; "));
            return result;
          },
        });
      await go(item.url);
      await collections();
    } else if (suite === "motion") {
      if (item.kind === "home") {
        await run({
          id: "scroll-roundtrip",
          kind: "motion",
          operation: () =>
            reviewHomePass({ ...item, env, direction: "roundtrip" }),
        });
        await go(item.url);
        if (
          item.motion !== "reduce" &&
          (await page.locator("[data-portrait-scene]").count())
        )
          await run({
            id: "portrait-continuity",
            kind: "motion",
            operation: () => reviewPortraitContinuity({ ...item, env }),
          });
        const recipes = item.motion === "reduce" ? [] : item.films ?? await page
          .locator("[data-film-layout]")
          .evaluateAll(nodes => nodes.flatMap((node, sceneIndex) => {
            if (node.dataset.filmLayout !== "pinned" || !node.dataset.filmTiming) return [];
            const [approach, departureAt] = node.dataset.filmTiming.split(",").map(Number);
            return [{ sceneIndex, film: { layout: "pinned", approach, departureAt }, toHeight: innerHeight + 64 }];
          }));
        for (const recipe of recipes)
          await run({
            id: `film-resize:${recipe.sceneIndex}`,
            kind: "motion",
            operation: () => reviewFilmResize({ ...item, ...recipe, env }),
          });
      }
      if (!row.tests.length)
        row.tests.push({
          id: "continuity",
          state: "not-applicable",
          reason: "No reading sequence or home motion surface.",
        });
    } else
      await run({
        id: suite,
        kind: "fallback",
        operation: () => fallback(env),
      });
    if (suite !== "nojs")
      timing(await page.evaluate(() => window.__journeyTiming?.()));
    row.geometry = await page.evaluate(() => ({
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - document.documentElement.clientWidth,
      mode: document.documentElement.dataset.mode,
    }));
    if (row.geometry.overflow > 2)
      row.issues.push({
        kind: "document-overflow",
        pixels: row.geometry.overflow,
      });
    row.state =
      row.issues.length ||
      row.tests.some(
        (test) => test.state === "failed" || test.state === "issues",
      )
        ? "failed"
        : row.tests.some((test) =>
              ["incomplete", "unexercised"].includes(test.state),
            )
          ? "incomplete"
          : "passed";
  } catch (error) {
    row.state = expired ? "incomplete" : "failed";
    row.issues.push({
      kind: expired ? "deadline" : "case",
      message: error.message,
    });
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
    row.elapsedMs = Date.now() - started;
  }
  return row;
}
