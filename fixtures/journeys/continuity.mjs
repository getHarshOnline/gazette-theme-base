import { must as check } from "./support.mjs";

async function runCase(options, kind, work) {
  const { env } = options;
  const row = { observations: [], captures: [], issues: [], status: "running" };
  const snap = async (label, target) => {
    const file = await env.snap(label, target);
    row.captures.push({ label, file });
    return file;
  };
  await work({
    ...env,
    row,
    snap,
    base: options.url,
    localURL: env.localURL,
    remaining: () => env.deadline - Date.now(),
    requireTime: env.requireTime,
  });
  if (row.status === "running")
    row.status = row.issues.length ? "failed" : "passed";
  return row;
}

export async function reviewCompleteJourney(options) {
  const {
    seedPath,
    journeyIndex = 0,
    title,
    label = `Reading sequence: ${title}`,
    members,
  } = options;
  check(
    title && seedPath && Array.isArray(members) && members.length >= 2,
    "Supply one complete native journey inventory entry",
  );
  check(
    seedPath === members[0].path &&
      members.every(
        (member) => typeof member.path === "string" && member.title,
      ),
    "Journey inventory requires a first-member seed, native routes and titles",
  );
  const normal = (value) => value.replace(/\s+/g, " ").trim();
  return runCase(
    { ...options, caseId: options.caseId ?? `journey-${title}` },
    "complete-journey",
    async ({ page, row, go, snap, activate, localURL, requireTime }) => {
      row.journey = {
        title,
        members: members.length,
        expectedDirectedEdges: 2 * (members.length - 1),
      };
      row.limitations = [
        "Actual native Next/Previous links and browser history are exercised; this is not prose, visual-composition or full-page link acceptance.",
      ];
      await go(seedPath);
      const matching = () =>
        page
          .locator("details.reading-orientation__journey")
          .filter({
            has: page.getByRole("navigation", {
              name: label,
              exact: true,
              includeHidden: true,
            }),
          });
      check(
        (await page
          .locator("details.reading-orientation__journey")
          .nth(journeyIndex)
          .locator("nav")
          .getAttribute("aria-label")) === label,
        "Seed journey index no longer identifies the declared journey",
      );
      const inspect = async (index, phase) => {
        requireTime();
        check(
          page.url() === localURL(members[index].path),
          `${phase}: landed on the wrong member`,
        );
        check(
          (await page.locator("h1").count()) === 1,
          `${phase}: expected one document H1`,
        );
        const h1 = normal(await page.locator("h1").innerText());
        if (members[index].h1)
          check(
            h1 === members[index].h1,
            `${phase}: document H1 differs from the expected member`,
          );
        check(
          (await matching().count()) === 1,
          `${phase}: missing or ambiguous journey`,
        );
        const state = await matching().evaluate((element) => ({
          entries: [...element.querySelectorAll(".reading-chapters > li")].map(
            (li) => {
              const current = li.querySelector('[aria-current="page"]'),
                link = li.querySelector("a");
              return {
                current: !!current,
                title: li.textContent.replace(/\s+/g, " ").trim(),
                url: current ? location.href : link?.href,
              };
            },
          ),
          prev: [...element.querySelectorAll('a[rel~="prev"]')].map(
            (link) => link.href,
          ),
          next: [...element.querySelectorAll('a[rel~="next"]')].map(
            (link) => link.href,
          ),
        }));
        check(
          state.entries.length === members.length &&
            state.entries.every(
              (entry, at) =>
                entry.title === members[at].title &&
                entry.url === localURL(members[at].path) &&
                entry.current === (at === index),
            ),
          `${phase}: ordered members or current marker disagree`,
        );
        for (const [rel, targetIndex] of [
          ["prev", index - 1],
          ["next", index + 1],
        ]) {
          const expected = members[targetIndex];
          check(
            expected
              ? state[rel].length === 1 &&
                  state[rel][0] === localURL(expected.path)
              : state[rel].length === 0,
            `${phase}: wrong ${rel} edge or boundary`,
          );
        }
        row.observations.push({
          phase,
          index,
          path: members[index].path,
          h1,
          currentMember: true,
          neighboursAndBoundaries: true,
        });
      };
      const follow = async (rel, index, phase) => {
        requireTime();
        if ((await matching().getAttribute("open")) === null)
          await activate(matching().locator(":scope > summary"));
        const link = matching().locator(`a[rel~="${rel}"]`),
          target = localURL(members[index].path);
        check(
          (await link.count()) === 1 &&
            localURL(await link.getAttribute("href")) === target,
          `${phase}: expected one correct ${rel} link`,
        );
        await link.scrollIntoViewIfNeeded();
        await Promise.all([
          page.waitForURL(target, {
            waitUntil: "domcontentloaded",
            timeout: 6500,
          }),
          (options.width ?? 390) <= 768
            ? link.tap({ timeout: 3500 })
            : link.click({ noWaitAfter: true, timeout: 3500 }),
        ]);
        await inspect(index, phase);
      };
      await inspect(0, "first");
      for (let index = 1; index < members.length; index++)
        await follow("next", index, "next");
      for (let index = members.length - 2; index >= 0; index--)
        await follow("prev", index, "prev");
      row.directedEdgesChecked = 2 * (members.length - 1);
      // A real link creates the history entry. Back, Forward and Back then
      // recheck both documents and return to the original first member.
      await follow("next", 1, "history-link");
      for (const [action, index, phase] of [
        ["goBack", 0, "history-back"],
        ["goForward", 1, "history-forward"],
        ["goBack", 0, "history-restored-source"],
      ]) {
        requireTime();
        await page[action]({ waitUntil: "domcontentloaded", timeout: 6500 });
        await inspect(index, phase);
      }
      row.historyRoundtrip = {
        back: true,
        forward: true,
        sourceRestored: members[0].path,
      };
      await snap("restored-source");
    },
  );
}

async function observedPage(page) {
  return page.evaluate(() => ({
    y: scrollY,
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    overflow: document.documentElement.scrollWidth - innerWidth,
    visibleScenes: [
      ...document.querySelectorAll(
        "main section,main [data-film-layout],main [data-portrait-scene]",
      ),
    ].flatMap((el, index) => {
      const target = el.querySelector("h1,h2,h3,p,a") ?? el;
      const b = target.getBoundingClientRect();
      let opacity = 1;
      for (let node = target; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
          opacity = 0;
          break;
        }
        opacity *= Number(style.opacity);
      }
      return opacity > 0.5 && b.bottom > 0 && b.top < innerHeight
        ? [
            {
              index,
              id: el.id,
              className: el.className,
              heading: target.textContent?.trim().slice(0, 100),
              layout: el.dataset.filmLayout,
              state: el.dataset.islandState,
              position: el.dataset.filmPosition,
            },
          ]
        : [];
    }),
    footerVisible: [...document.querySelectorAll("footer")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    }),
  }));
}

// A round trip retains the same document. Long pages can instead be reviewed in
// directional segments; an incomplete segment reports its actual stopping point.
export async function reviewHomePass(options) {
  const {
    direction = "forward",
    startY,
    dwellMs = 180,
    stepShare = 0.55,
  } = options;
  check(
    ["forward", "reverse", "roundtrip"].includes(direction),
    "Direction must be forward, reverse or roundtrip",
  );
  check(
    dwellMs >= 150 && dwellMs <= 1000 && stepShare > 0 && stepShare <= 0.7,
    "Use overlapping viewports and a 150–1000ms dwell",
  );
  return runCase(
    options,
    `home-${direction}`,
    async ({ page, row, go, snap, remaining }) => {
      await go(options.url);
      await page.waitForTimeout(600);
      const initial = await observedPage(page);
      const start = startY ?? (direction === "reverse" ? initial.max : 0);
      await page.evaluate(
        (y) => scrollTo({ top: y, behavior: "instant" }),
        start,
      );
      await page.waitForTimeout(500);
      await snap("start");
      let previous = await observedPage(page),
        still = 0,
        captures = 1;
      const phases =
        direction === "roundtrip" ? ["forward", "reverse"] : [direction];
      row.completedDirections = [];
      for (const phase of phases) {
        const sign = phase === "forward" ? 1 : -1;
        row.observations.push({ direction: phase, ...previous });
        while (remaining() > 4500) {
          const end =
            phase === "forward"
              ? previous.y >= previous.max - 2
              : previous.y <= 2;
          if (end) break;
          await page.mouse.move((options.width ?? 390) * 0.85, 120);
          const distance = await page.evaluate(
            (share) => innerHeight * share,
            stepShare,
          );
          await page.mouse.wheel(0, sign * distance);
          await page.waitForTimeout(dwellMs);
          const current = await observedPage(page);
          row.observations.push({ direction: phase, ...current });
          still = Math.abs(current.y - previous.y) < 1 ? still + 1 : 0;
          check(still < 6, "Repeated wheel input did not move the page");
          if (
            captures < 25 &&
            JSON.stringify(current.visibleScenes) !==
              JSON.stringify(previous.visibleScenes)
          ) {
            await snap(`${phase}-transition-${captures++}`);
          }
          previous = current;
        }
        previous = await observedPage(page);
        const complete =
          phase === "forward"
            ? previous.y >= previous.max - 2
            : previous.y <= 2;
        if (!complete) {
          row.resumeDirection = phase;
          row.status = "incomplete";
          break;
        }
        row.completedDirections.push(phase);
        await snap(`${phase}-end`);
      }
      const final = await observedPage(page);
      row.resumeY = final.y;
      row.reachedEnd = row.completedDirections.length === phases.length;
      await snap(row.reachedEnd ? "end" : "resume");
      row.limitations = [
        "Continuous wheel traversal and selected captures require human inspection for timing, reading holds and complete composition.",
      ];
      if (direction !== "roundtrip")
        row.limitations.push(
          "This call covers one direction in a fresh context; it does not prove return continuity in the same document.",
        );
    },
  );
}

export async function reviewFilmResize(options) {
  const { sceneIndex, progress, film, toHeight = 600 } = options;
  check(
    Number.isInteger(sceneIndex) &&
      progress >= 0 &&
      progress <= 1 &&
      film &&
      film.layout !== "flow",
    "Supply the actual pinned film recipe, sceneIndex and reading progress",
  );
  check(
    (film.departureAt ?? 1) > 0 &&
      (film.departureAt ?? 1) <= 1 &&
      (film.approach ?? 0) >= 0,
    "Film timing must match the valid native recipe",
  );
  return runCase(options, "film-resize", async ({ page, row, go, snap }) => {
    await go(options.url);
    const scene = page.locator("[data-film-layout]").nth(sceneIndex);
    check(await scene.count(), "Requested scene missing");
    await page.waitForFunction(
      (index) => {
        const el = document.querySelectorAll("[data-film-layout]")[index];
        return (
          el &&
          parseFloat(getComputedStyle(el).getPropertyValue("--film-distance")) >
            0
        );
      },
      sceneIndex,
      { timeout: 4000 },
    );
    const geometry = {
      progress,
      approach: film.approach ?? 0,
      departureAt: film.departureAt ?? 1,
    };
    const target = await scene.evaluate((el, recipe) => {
      const b = el.getBoundingClientRect(),
        d = parseFloat(
          getComputedStyle(el).getPropertyValue("--film-distance"),
        );
      if (!(d > 0)) return null;
      const lead = recipe.approach * innerHeight;
      const p = recipe.progress,
        end = recipe.departureAt;
      const offset =
        p <= end
          ? (p / end) * (d + lead) - lead
          : d + ((p - end) / (1 - end)) * Math.max(1, b.height - d);
      return scrollY + b.top + offset;
    }, geometry);
    check(Number.isFinite(target), "Scene has not reserved a pinned distance");
    await page.evaluate(
      (y) => scrollTo({ top: y, behavior: "instant" }),
      target,
    );
    await page.waitForFunction(
      (index) =>
        document.querySelectorAll("[data-film-layout]")[index]?.dataset
          .islandState === "drawn",
      sceneIndex,
      { timeout: 6000 },
    );
    await page.waitForTimeout(900);
    const measure = () =>
      scene.evaluate((el, recipe) => {
        const b = el.getBoundingClientRect(),
          d = parseFloat(
            getComputedStyle(el).getPropertyValue("--film-distance"),
          );
        const lead = recipe.approach * innerHeight;
        const position =
          b.top >= -d
            ? Math.min(1, Math.max(0, (lead - b.top) / (d + lead))) *
              recipe.departureAt
            : recipe.departureAt +
              (1 - recipe.departureAt) *
                Math.min(1, (-b.top - d) / Math.max(1, b.height - d));
        return {
          y: scrollY,
          viewport: innerHeight,
          position,
          state: el.dataset.islandState,
          layout: el.dataset.filmLayout,
          top: b.top,
          bottom: b.bottom,
        };
      }, geometry);
    const before = await measure();
    check(
      before.state === "drawn" &&
        before.layout === "pinned" &&
        before.top <= 0 &&
        before.bottom >= options.height,
      "Requested point is not an occupied pinned hold",
    );
    await snap("before");
    await page.setViewportSize({ width: options.width, height: toHeight });
    await page.waitForTimeout(1000);
    const after = await measure();
    row.observations.push({ before, after });
    await snap("after");
    if (after.state === "drawn" && after.layout === "pinned")
      check(
        Math.abs(after.position - before.position) < 0.015,
        "Resize changed the occupied film position",
      );
    else {
      row.status = "incomplete";
      row.limitations = [
        "Scene fell back after resize; static completeness requires visual review and pinned restoration was not established.",
      ];
    }
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(450);
    const moved = await measure();
    check(
      moved.y > after.y + 10,
      "Ordinary forward scrolling failed after resize",
    );
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(450);
    row.observations.push({ forward: moved, reversed: await measure() });
    await snap("reversed");
  });
}

export async function reviewPortraitContinuity(options) {
  return runCase(options, "portrait", async ({ page, row, go, snap }) => {
    await go(options.url);
    const copy = page.locator(".encounter-copy").first();
    check(await copy.count(), "Portrait introduction missing");
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".portrait-canvas,.portrait-reveal-canvas")
          .length === 2,
      null,
      { timeout: 6000 },
    );
    const observe = async (label) => {
      const value = await copy.evaluate((el) => ({
        text: el.innerText,
        opacity: Number(getComputedStyle(el).opacity),
        revealOpacity: getComputedStyle(el).getPropertyValue(
          "--portrait-copy-opacity",
        ),
        focused: el.contains(document.activeElement),
        canvasCount: document.querySelectorAll(
          ".portrait-canvas,.portrait-reveal-canvas",
        ).length,
      }));
      row.observations.push({ label, ...value });
      await snap(label);
      return value;
    };
    const readable = async () =>
      page.waitForFunction(
        () => {
          const el = document.querySelector(".encounter-copy"),
            style = el && getComputedStyle(el);
          return (
            style &&
            Number(style.opacity) >= 0.99 &&
            Number(style.getPropertyValue("--portrait-copy-opacity") || 1) >=
              0.99
          );
        },
        null,
        { timeout: 3500 },
      );
    await readable();
    await observe("initial");
    const header = await page.locator(".frame__header").boundingBox();
    await page.mouse.move(
      header.x + header.width * 0.5,
      header.y + header.height * 0.5,
    );
    await page.waitForTimeout(550);
    await readable();
    await observe("header-pointer");
    const scene = await page
      .locator("[data-portrait-scene]")
      .first()
      .boundingBox();
    await page.mouse.move(
      scene.x + scene.width * 0.7,
      Math.min(
        (options.height ?? 960) - 40,
        Math.max(header.height + 80, scene.y + scene.height * 0.55),
      ),
    );
    await page.waitForTimeout(650);
    await observe("scene-pointer");
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(350);
    await page.mouse.wheel(0, -650);
    await page.waitForTimeout(450);
    await readable();
    await observe("scroll-return");
    // Actual Tab traversal reaches the introduction; focus() would skip that journey.
    let reached = false;
    for (let i = 0; i < 32; i++) {
      await page.keyboard.press("Tab");
      if (await copy.evaluate((el) => el.contains(document.activeElement))) {
        reached = true;
        break;
      }
    }
    check(
      reached,
      "Keyboard did not reach an introduction control within 32 tab stops",
    );
    await readable();
    await page.mouse.move(
      scene.x + scene.width * 0.6,
      Math.min((options.height ?? 960) - 40, header.height + 180),
    );
    await page.waitForTimeout(550);
    await readable();
    await observe("keyboard-with-pointer");
  });
}
