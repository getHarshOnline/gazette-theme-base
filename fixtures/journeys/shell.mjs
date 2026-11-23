import { must, normal } from "./support.mjs";
import { controls } from "./media.mjs";

export async function shell(env) {
  const { page, item, run, go, localURL, options } = env;
  const { click, settle } = controls(page);
  await run({
    id: "document",
    kind: "semantics",
    operation: async () => {
      must(
        (await page.locator("main").count()) === 1,
        "Expected one main landmark.",
      );
      must(
        (await page.locator("h1").count()) === 1,
        "Expected one document H1.",
      );
      const heading = page.locator("h1");
      if (item.heading)
        must(
          normal(await heading.innerText()) === item.heading,
          "Document H1 differs from its declared heading.",
        );
      // A composed Home keeps its visual opening, and so its H1, in the body.
      const composedHome =
        (await page.locator('html[data-page-mode="home"]').count()) > 0;
      if (
        item.masthead ||
        item.kind === "search" ||
        (!composedHome &&
          (await page.locator('main[data-family="index"]').count()))
      ) {
        must(
          (await page
            .locator(
              ".frame__brand h1,h1.frame__brand,.frame__title h1,h1.frame__title,.frame__header h1",
            )
            .count()) === 1,
          "Page title is missing from the masthead.",
        );
        must(
          (await heading.locator("a").count()) === 0 &&
            !(await heading.evaluate((e) => !!e.closest("a"))),
          "Masthead H1 must be unlinked.",
        );
      }
      const canonicals = page.locator('link[rel="canonical"]');
      // A not-found page is never indexed, so it names no canonical address.
      if (item.kind === "not-found") {
        must(
          (await canonicals.count()) === 0,
          "A not-found page must not name a canonical link.",
        );
        return { heading: normal(await heading.innerText()), canonical: null };
      }
      must((await canonicals.count()) === 1, "Expected one canonical link.");
      const canonical = await canonicals.getAttribute("href");
      const parsed = new URL(canonical);
      must(
        ["http:", "https:"].includes(parsed.protocol),
        "Canonical is not an absolute HTTP(S) address.",
      );
      if (item.canonical)
        must(
          canonical === item.canonical,
          "Canonical differs from the native expected URL.",
        );
      return { heading: normal(await heading.innerText()), canonical };
    },
  });
  const triggers = page.locator(
    '[data-command-trigger="settings"],[data-command-trigger="preferences"]',
  );
  if (await triggers.count())
    await run({
      id: "settings",
      kind: "preferences",
      operation: async () => {
        const trigger = triggers.first();
        const menu = page.locator(".frame__menu");
        const openedMenu = !(await trigger.isVisible());
        if (openedMenu) {
          must(
            await menu.isVisible(),
            "Settings trigger has no exposed navigation menu.",
          );
          await click(menu);
        }
        await click(trigger);
        const dialog = page.locator("dialog[open]");
        await dialog.waitFor({ state: "visible" });
        const before = await dialog.locator("input,button,select").count();
        must(before > 0, "Settings dialog has no controls.");
        const palette = () =>
          page.evaluate(() => ({
            paper: getComputedStyle(document.documentElement).getPropertyValue(
              "--color-paper",
            ),
            ink: getComputedStyle(document.documentElement).getPropertyValue(
              "--color-ink",
            ),
          }));
        const choice = (value) =>
          dialog.locator(`input[name="color-mode"][value="${value}"]`);
        await choice("system").check();
        await settle();
        const system = await palette();
        const opposite = item.mode === "light" ? "dark" : "light";
        await choice(opposite).check();
        await settle();
        must(
          (await page.locator("html").getAttribute("data-mode")) === opposite,
          "Explicit palette did not override the system.",
        );
        await choice(item.mode).check();
        await settle();
        const explicit = await palette();
        must(
          JSON.stringify(system) === JSON.stringify(explicit),
          "System and explicit selection resolve to different palette tokens.",
        );
        const motion = (value) =>
          dialog.locator(`input[name="motion-preference"][value="${value}"]`);
        await motion("reduce").check();
        await settle();
        const reduced = await page.evaluate(() => ({
          depth: [
            ...document.querySelectorAll(
              "[data-depth-active],[data-search-active]",
            ),
          ].every((e) => !e.style.transform),
          decks: [...document.querySelectorAll(".quote-deck--ready")].every(
            (e) => e.dataset.reduced === "true",
          ),
          videos: [...document.querySelectorAll("video.ambient-video")].every(
            (e) => e.paused && !e.getAttribute("src"),
          ),
        }));
        must(
          reduced.depth && reduced.decks && reduced.videos,
          "Reduced motion retains a moving or transformed enhancement.",
        );
        await motion(item.motion === "reduce" ? "reduce" : "allow").check();
        await settle();
        await page.keyboard.press("Tab");
        must(
          await dialog.evaluate((e) => e.contains(document.activeElement)),
          "Tab escaped the open dialog.",
        );
        await page.keyboard.press("Shift+Tab");
        must(
          await dialog.evaluate((e) => e.contains(document.activeElement)),
          "Reverse Tab escaped the open dialog.",
        );
        await page.keyboard.press("Escape");
        await settle();
        must(!(await dialog.isVisible()), "Settings dialog did not close.");
        must(
          await trigger.evaluate((e) => document.activeElement === e),
          "Settings did not restore focus.",
        );
        // Leave the page as found: a menu opened to reach Settings closes again,
        // so the compact navigation check starts from a closed menu.
        if (
          openedMenu &&
          (await menu.getAttribute("aria-expanded")) === "true"
        ) {
          await click(menu);
          await settle();
        }
        return { controls: before, focusReturned: true };
      },
    });
  else
    env.row.tests.push({
      id: "settings",
      state: "not-applicable",
      reason: "No settings trigger.",
    });
  const menu = page.locator(".frame__menu");
  if ((await menu.count()) && (await menu.isVisible()))
    await run({
      id: "compact-navigation",
      kind: "navigation",
      operation: async () => {
        await click(menu);
        must(
          (await menu.getAttribute("aria-expanded")) === "true",
          "Compact navigation did not open.",
        );
        const nav = page.locator(".frame__nav");
        must(await nav.isVisible(), "Opened navigation is hidden.");
        await page.keyboard.press("Escape");
        await settle();
        must(
          (await menu.getAttribute("aria-expanded")) === "false",
          "Escape did not close compact navigation.",
        );
        return {
          focusReturned: await menu.evaluate(
            (e) => document.activeElement === e,
          ),
        };
      },
    });
  const search = page.locator('[data-command-trigger="search"]');
  if ((await search.count()) && (await search.first().isVisible()))
    await run({
      id: "search-dialog",
      kind: "search",
      operation: async () => {
        await click(search.first());
        const tenant = page.locator('dialog[open] [data-tenant="search"]');
        await tenant.waitFor({ state: "visible" });
        const input = tenant.locator('input[type="search"]');
        must(await input.isVisible(), "Search dialog has no query input.");
        await input.fill(item.queries?.[0]?.text ?? "a");
        await page.waitForTimeout(400);
        await page.keyboard.press("Escape");
        must(!(await tenant.isVisible()), "Search did not close.");
        must(
          await search.first().evaluate((e) => document.activeElement === e),
          "Search did not restore focus.",
        );
        return { focusReturned: true };
      },
    });
  // Exercise every declared internal navigation destination; external/provider actions stay inactive.
  const destinations = await page
    .locator(".frame__nav a[href]")
    .evaluateAll((links) =>
      links.map((a) => ({ href: a.href, label: a.textContent.trim() })),
    );
  for (const [index, destination] of destinations.entries())
    await run({
      id: `navigation:${index}`,
      kind: "navigation",
      operation: async () => {
        localURL(destination.href);
        const key = JSON.stringify([
          new URL(item.url).origin,
          destination.href,
          item.width,
          item.mode,
          item.motion,
        ]);
        const previous = options?.navigationSeen?.get(key);
        if (previous)
          return {
            ...destination,
            state: "not-applicable",
            reason:
              "This native navigation edge was already clicked and returned from in this presentation.",
            coveredBy: previous,
          };
        await go(item.url);
        if (destination.href === page.url())
          return {
            ...destination,
            state: "not-applicable",
            reason: "Current navigation destination.",
          };
        if (
          (await menu.count()) &&
          (await menu.isVisible()) &&
          (await menu.getAttribute("aria-expanded")) !== "true"
        )
          await click(menu);
        const link = page
          .locator(".frame__nav a[href]")
          .filter({ hasText: destination.label })
          .first();
        await env.followAndBack(link).then((journey) => journey.back());
        options?.navigationSeen?.set(key, item.url);
        return destination;
      },
    });
  await go(item.url);
  const toc = page.locator('.reading-outline a[href*="#"]');
  for (let index = 0; index < (await toc.count()); index++)
    await run({
      id: `outline:${index}`,
      kind: "reading",
      operation: async () => {
        const link = toc.nth(index),
          href = await link.getAttribute("href");
        if (!(await link.isVisible())) {
          const details = link.locator("xpath=ancestor::details[1]");
          if (
            (await details.count()) &&
            !(await details.evaluate((e) => e.open))
          )
            await click(details.locator(":scope > summary"));
        }
        await click(link);
        const id = decodeURIComponent(new URL(href, page.url()).hash.slice(1));
        const target = page.locator(`[id=${JSON.stringify(id)}]`);
        must(
          (await target.count()) === 1,
          "Outline anchor has no unique destination.",
        );
        const rect = await target.boundingBox();
        must(
          rect && rect.y >= -2 && rect.y < item.height,
          "Outline target did not enter the viewport.",
        );
        return { id };
      },
    });
}
