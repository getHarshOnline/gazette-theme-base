import { must as requireState } from "./support.mjs";
import { imageSettled } from "../lib/browser.mjs";
export async function fallback(env) {
  const { page, item, allowed, requireTime: time, followAndBack } = env;
  const printing = env.suite === "print";
  const row = { checks: [], captures: [] };
  const capture = async (label, target) => {
    const file = await env.snap(label, target);
    row.captures.push({ label, file });
    return file;
  };
  item.kind = (printing ? "print-" : "nojs-") + item.kind;
  // Scroll visible native images into the load range before judging their pixels.
  const images = page.locator("main img");
  for (let index = 0; index < (await images.count()); index++) {
    time();
    const image = images.nth(index);
    const visible = await image.evaluate((element) => {
      if (
        !element.getClientRects().length ||
        getComputedStyle(element).visibility !== "visible"
      )
        return false;
      element.scrollIntoView({ block: "nearest", behavior: "instant" });
      return true;
    });
    if (!visible) continue;
    await imageSettled(image, 1000);
    const value = await image.evaluate((image) => ({
      src: image.currentSrc || image.src,
      loaded: image.complete && image.naturalWidth > 0,
      alt: image.alt,
    }));
    requireState(
      value.loaded,
      `Visible native image did not load: ${value.src}`,
    );
  }
  if (item.kind.endsWith("home")) {
    const scenes = page.locator(
      "main .cinematic-beat,main .sequence-document__beat,main [data-portrait-scene],main .ambient-hero",
    );
    const count = await scenes.count();
    row.sceneCount = count;
    for (let index = 0; index < count; index++) {
      time();
      const scene = scenes.nth(index);
      const result = await scene.evaluate((scene, printing) => {
        const rect = (element) =>
          element?.getBoundingClientRect().toJSON() ?? null;
        const contains = (outer, inner) =>
          outer &&
          inner &&
          inner.width > 0 &&
          inner.height > 0 &&
          inner.left >= outer.left - 2 &&
          inner.right <= outer.right + 2 &&
          inner.top >= outer.top - 2 &&
          inner.bottom <= outer.bottom + 2;
        const visible = (element) => {
          if (
            !element.getBoundingClientRect().width ||
            !element.getBoundingClientRect().height
          )
            return false;
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (
              style.display === "none" ||
              style.visibility !== "visible" ||
              Number(style.opacity) < 0.99
            )
              return false;
          }
          return true;
        };
        const copy = [
          ...scene.querySelectorAll(
            "h1,h2,h3,.cinematic-premise > p,.sequence-document__copy p,.encounter-copy p,.ambient-content p",
          ),
        ].filter(
          (element) =>
            element.textContent.trim() &&
            !element.closest('[aria-hidden="true"]'),
        );
        const wrapper = scene.closest("[data-gazette-component]"),
          story = scene.closest(".cinematic-story");
        const stage = scene.closest(".cinematic-stage"),
          reserve = rect(story),
          wrapperBox = rect(wrapper);
        // Flow films keep their native illustration box. An absolute beat
        // inside that reserved box is different from a pinned storyboard.
        const flow = wrapper?.getAttribute("data-film-layout") === "flow";
        const flowImages = [
          ...scene.querySelectorAll(".cinematic-still img"),
        ].filter(visible);
        const unclipped = (image) => {
          const box = rect(image);
          for (
            let parent = image.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent),
              boundary = rect(parent);
            if (
              ["hidden", "clip", "auto", "scroll"].includes(style.overflowX) &&
              (box.left < boundary.left - 2 || box.right > boundary.right + 2)
            )
              return false;
            if (
              ["hidden", "clip", "auto", "scroll"].includes(style.overflowY) &&
              (box.top < boundary.top - 2 || box.bottom > boundary.bottom + 2)
            )
              return false;
            if (parent === wrapper) break;
          }
          return true;
        };
        const stills = [
          ...scene.querySelectorAll(
            ".cinematic-still,.sequence-document__still",
          ),
        ].map((still) => {
          const shown = [...still.querySelectorAll("img")].filter(visible),
            first = still.querySelector("img");
          return {
            count: shown.length,
            firstSelected: shown[0] === first,
            images: shown.map((image) => {
              const rect = image.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                fit: getComputedStyle(image).objectFit,
              };
            }),
          };
        });
        return {
          position: getComputedStyle(scene).position,
          storyPosition: story ? getComputedStyle(story).position : null,
          stagePosition: stage ? getComputedStyle(stage).position : null,
          copy: copy.map((element) => ({
            text: element.textContent.trim(),
            readable: visible(element),
          })),
          stills,
          flow: flow
            ? {
                reserve,
                wrapper: wrapperBox,
                aspectRatio: getComputedStyle(story).aspectRatio,
                wrapperPosition: getComputedStyle(wrapper).position,
                reserved: contains(wrapperBox, reserve),
                sceneContained: contains(reserve, rect(scene)),
                mediaContained:
                  flowImages.length > 0 &&
                  flowImages.every(
                    (image) =>
                      contains(reserve, rect(image)) && unclipped(image),
                  ),
                copyContained: copy.every((element) =>
                  contains(reserve, rect(element)),
                ),
              }
            : null,
          enhancementVisible:
            printing &&
            [
              ...(wrapper?.querySelectorAll(":scope > [data-gazette-mount]") ??
                []),
            ].some(visible),
        };
      }, printing);
      requireState(
        result.copy.every((copy) => copy.readable),
        "A native scene loses readable authored copy.",
      );
      requireState(
        result.copy.length > 0 ||
          result.stills.some((still) => still.count > 0),
        "A native scene has neither authored copy nor a visible still.",
      );
      if (printing) {
        requireState(
          !result.enhancementVisible,
          "Print scene retains its mounted moving overlay.",
        );
        if (result.flow) {
          requireState(
            !["fixed", "sticky"].includes(result.position) &&
              !["fixed", "sticky", "absolute"].includes(result.storyPosition) &&
              !["fixed", "sticky", "absolute"].includes(
                result.flow.wrapperPosition,
              ) &&
              result.flow.reserved &&
              result.flow.sceneContained &&
              result.flow.mediaContained &&
              result.flow.copyContained,
            "Printed flow study lacks an in-flow box containing its complete native media and copy.",
          );
        } else
          requireState(
            [result.position, result.storyPosition, result.stagePosition].every(
              (position) => !["fixed", "sticky", "absolute"].includes(position),
            ),
            "Pinned print storyboard has not returned to native document flow.",
          );
        requireState(
          result.stills.every(
            (still) => still.count === 1 && still.firstSelected,
          ),
          "Print must select the first complete still once.",
        );
        requireState(
          result.stills
            .flatMap((still) => still.images)
            .every(
              (image) =>
                Math.abs(
                  image.width / image.height -
                    image.naturalWidth / image.naturalHeight,
                ) < 0.03 || image.fit === "contain",
            ),
          "Print still appears cropped.",
        );
      }
      row.checks.push({ kind: "native-scene", index, ...result });
      await capture(`scene-${index}`, scene);
    }
    if (!count) {
      requireState(
        (await page.locator("main").innerText()).trim().length > 0,
        "Home has no readable native account.",
      );
      row.checks.push({
        kind: "native-home",
        scenes: "not applicable",
        textPresent: true,
      });
    }
  }

  if (!printing) {
    const nav = page.locator(".frame__nav"),
      menu = page.locator(".frame__menu");
    requireState(
      await nav.isVisible(),
      "Native navigation is unavailable without scripts.",
    );
    requireState(
      !(await menu.count()) || !(await menu.isVisible()),
      "Inoperative script menu is exposed without scripts.",
    );
    const navLinks = nav.locator("a[href]");
    requireState(
      (await navLinks.count()) > 0,
      "Native navigation has no destinations.",
    );
    for (let index = 0; index < (await navLinks.count()); index++)
      requireState(
        await navLinks.nth(index).isVisible(),
        "Native navigation hides a destination.",
      );
    const headerPosition = await page
      .locator(".frame__header")
      .evaluate((element) => getComputedStyle(element).position);
    requireState(
      !["fixed", "sticky"].includes(headerPosition),
      "Script-free navigation is not in document flow.",
    );
    row.checks.push({
      kind: "native-navigation",
      destinations: await navLinks.count(),
      menuHidden: true,
      headerPosition,
    });
    if (item.kind === "nojs-home") {
      const destination = await navLinks.evaluateAll((links) =>
        links.findIndex((link) => {
          const to = new URL(link.href);
          return (
            to.origin === location.origin && to.pathname !== location.pathname
          );
        }),
      );
      requireState(
        destination >= 0,
        "No native navigation destination distinct from Home.",
      );
      const link = navLinks.nth(destination);
      const journey = await followAndBack(link);
      await journey.back();
      row.checks.push({
        kind: "native-link-and-back",
        target: journey.target,
        returned: page.url(),
      });
    }
    if (item.kind === "nojs-search") {
      const fallback = page.locator(".search-page__fallback");
      requireState(
        (await fallback.isVisible()) &&
          !(await page.locator(".search-page form").isVisible()),
        "Search did not retain its native catalogue.",
      );
      const before = await fallback
        .locator(".reading-list__title a")
        .evaluateAll((links) => links.map((link) => link.href));
      requireState(before.length > 0, "Native Search has no result links.");
      const next = fallback
        .locator('.listing-pagination a[rel~="next"]')
        .first();
      if (!(await next.isVisible())) {
        row.checks.push({
          kind: "native-search-pagination",
          state: "not-applicable",
          reason: "No next page in the native catalogue.",
        });
        return row;
      }
      const journey = await followAndBack(next);
      const after = await page
        .locator(".search-page__fallback .reading-list__title a")
        .evaluateAll((links) => links.map((link) => link.href));
      requireState(
        after.length > 0 && JSON.stringify(before) !== JSON.stringify(after),
        "Native pagination did not change result entries.",
      );
      requireState(
        Number(
          await page
            .locator(".search-page")
            .getAttribute("data-search-initial-page"),
        ) > 1,
        "Native continuation has no later ordinal.",
      );
      await capture("native-next-page");
      await journey.back();
      requireState(
        JSON.stringify(
          await fallback
            .locator(".reading-list__title a")
            .evaluateAll((links) => links.map((link) => link.href)),
        ) === JSON.stringify(before),
        "Back changed the original result entries.",
      );
      row.checks.push({
        kind: "native-search-pagination",
        firstCount: before.length,
        nextCount: after.length,
        target: journey.target,
        returned: page.url(),
      });
    }
  }
  if (item.kind.endsWith("article")) {
    const expected = item.expect ?? [];
    const counts = {
      code: await page.locator("main pre").count(),
      table: await page.locator("main table").count(),
      figure: await page.locator("main figure").count(),
      notes: await page.locator("main #article-notes").count(),
    };
    for (const type of expected)
      requireState(
        counts[type] > 0,
        `Expected representative ${type} is absent.`,
      );
    const details = page.locator("main details");
    if (!printing)
      for (let index = 0; index < (await details.count()); index++) {
        time();
        const detail = details.nth(index),
          summary = detail.locator(":scope > summary");
        requireState(
          await summary.isVisible(),
          "Native article summary is not exposed.",
        );
        const initiallyOpen = await detail.evaluate((element) => element.open);
        await summary.click();
        requireState(
          (await detail.evaluate((element) => element.open)) !== initiallyOpen,
          "Native disclosure did not toggle.",
        );
        const readableBody = () =>
          detail.evaluate((element) =>
            [...element.children].some(
              (child) =>
                child.tagName !== "SUMMARY" &&
                child.textContent.trim() &&
                child.getBoundingClientRect().height > 0,
            ),
          );
        if (!initiallyOpen)
          requireState(
            await readableBody(),
            "Opened disclosure has no readable body.",
          );
        await summary.click();
        requireState(
          (await detail.evaluate((element) => element.open)) === initiallyOpen,
          "Native disclosure did not restore.",
        );
        if (initiallyOpen)
          requireState(
            await readableBody(),
            "Restored disclosure has no readable body.",
          );
        row.checks.push({
          kind: "native-disclosure",
          label: await summary.innerText(),
          restored: true,
        });
      }
    const content = await page.locator("main").evaluate(
      (main, printing) => ({
        codes: [...main.querySelectorAll("pre")].map((element) => {
          const s = getComputedStyle(element);
          return {
            visible: element.getBoundingClientRect().height > 0,
            whiteSpace: s.whiteSpace,
            overflowX: s.overflowX,
            clipped: element.scrollWidth > element.clientWidth + 2,
            textLength: element.textContent.length,
          };
        }),
        tables: [...main.querySelectorAll("table")].map((element) => {
          const box = element.getBoundingClientRect(),
            wrapper = element.closest("[data-gazette-table]");
          return {
            visible: box.height > 0,
            rows: element.rows.length,
            right: box.right,
            viewport: innerWidth,
            wrapperOverflow: wrapper
              ? getComputedStyle(wrapper).overflowX
              : null,
          };
        }),
        figures: [...main.querySelectorAll("figure")].map((element) => ({
          visible: element.getBoundingClientRect().height > 0,
          caption: element.querySelector("figcaption")?.innerText.trim() ?? "",
          media: [...element.querySelectorAll("img,svg")].some(
            (node) =>
              node.getBoundingClientRect().width > 0 &&
              node.getBoundingClientRect().height > 0,
          ),
        })),
        notes: [...main.querySelectorAll(".reading-notes__body")].map(
          (element) => ({
            visible: element.getBoundingClientRect().height > 0,
            textLength: element.textContent.trim().length,
          }),
        ),
        printHints: printing
          ? [
              ...main.querySelectorAll(
                ".reading-overflow__hint,.media-inspection-control",
              ),
            ].filter((element) => element.getBoundingClientRect().height > 0)
              .length
          : null,
      }),
      printing,
    );
    if (printing) {
      requireState(
        content.codes.every(
          (code) =>
            code.visible &&
            code.whiteSpace === "pre-wrap" &&
            code.overflowX === "visible" &&
            !code.clipped,
        ),
        "Printed code is hidden, clipped or still requires horizontal scrolling.",
      );
      requireState(
        content.tables.every(
          (table) =>
            table.visible &&
            table.right <= table.viewport + 2 &&
            (!table.wrapperOverflow || table.wrapperOverflow === "visible"),
        ),
        "Printed table is hidden or extends beyond the emulated page width.",
      );
      requireState(
        content.printHints === 0,
        "Screen-only scrolling/viewer controls remain in print.",
      );
      requireState(
        content.notes.every((notes) => notes.visible && notes.textLength > 0),
        "Print does not expose the native Notes body.",
      );
    }
    requireState(
      content.figures.every(
        (figure) => figure.visible && figure.caption && figure.media,
      ),
      "Native figure lacks its readable graphic or caption.",
    );
    row.checks.push({ kind: "article-fallback", counts, ...content });
    for (const selector of [
      "main pre",
      "main table",
      "main figure",
      "main #article-notes",
    ]) {
      const target = page.locator(selector).first();
      if ((await target.count()) && (await target.isVisible()))
        await capture(selector, target);
    }
  }

  return row;
}
