import { must } from "./support.mjs";
import { controls } from "./media.mjs";
import { imageSettled } from "../lib/browser.mjs";
const decks = [
  {
    name: "quote",
    root: ".quote-deck",
    ready: "quote-deck--ready",
    cards: ".quote-deck__stage > .quote-deck__card:not([data-quote-clone])",
    active: '[data-active="true"]',
    choices: ".quote-deck__choices > button",
    previous: "[data-quote-previous]",
    next: "[data-quote-next]",
    output: ".quote-deck__position",
    looping: true,
  },
  {
    name: "catalogue",
    root: ".catalogue",
    ready: "catalogue--ready",
    cards: ".catalogue__stage .catalogue-entry:not([data-catalogue-clone])",
    active: '[data-active="true"]',
    choices: ".catalogue__choices > button",
    previous: "[data-catalogue-previous]",
    next: "[data-catalogue-next]",
    output: ".catalogue__controls output",
    looping: true,
  },
  {
    name: "articles",
    root: "[data-article-listing]",
    ready: "article-listing--depth",
    cards: ".reading-list__entry",
    active: "[data-depth-active]",
    previous: "[data-depth-previous]",
    next: "[data-depth-next]",
    output: ".article-listing__controls output",
  },
  {
    name: "search",
    root: ".search-page",
    ready: "search-page--depth",
    cards: ".search-page__results > li > .search-result",
    active: "[data-search-active]",
    previous: "[data-search-depth-previous]",
    next: "[data-search-depth-next]",
    output: ".search-depth__controls output",
  },
  {
    name: "discovery",
    root: ".discovery-explorer",
    ready: "discovery-explorer--ready",
    cards: ":scope > ul > li",
    active: ":not([hidden])",
    choices: ".discovery-map__choice",
    previous: ".discovery-controls > button:first-child",
    next: ".discovery-controls > button:last-child",
    output: ".discovery-controls output",
    looping: "always",
  },
];

export async function interactions(env) {
  const { page, context, row, item, deadline, run } = env;
  const { settle, click, withTarget, images, usable } = controls(page);
  const height = item.height,
    currentMode = item.mode,
    figures = (item.figures ?? []).join(",");
  let jobs = [];
  const add = (id, kind, operation, target = null) =>
    jobs.push({
      id,
      kind,
      operation: target ? () => withTarget(target, operation) : operation,
    });
  // Traverse native disclosures in DOM order, exposing nested disclosures
  // through their native summaries. Reopen parents only for child checks.
  const details = page.locator("main details,.reading-header-row details");
  row.inventory = {
    details: await details.count(),
    carousels: [],
    viewers: 0,
    figureControls: 0,
  };
  for (let i = 0; i < row.inventory.details; i++)
    add(
      `details:${i}`,
      "details",
      async () => {
        const detail = details.nth(i),
          summary = detail.locator(":scope > summary");
        // An enhanced surface can hold its form back until it is ready.
        await summary
          .waitFor({ state: "visible", timeout: 1500 })
          .catch(() => {});
        if (!(await summary.isVisible())) {
          const notes = page.locator('[data-command-trigger="notes"]');
          if (
            (await detail.getAttribute("id")) === "article-notes" &&
            (await notes.count()) === 1 &&
            (await notes.isVisible())
          ) {
            await click(notes);
            const tenant = page.locator('dialog[open] [data-tenant="notes"]');
            await tenant.waitFor({ state: "visible" });
            must(
              (await tenant.innerText()).trim().length > 0,
              "Notes opened an empty dialog.",
            );
            await page.keyboard.press("Escape");
            await settle();
            must(
              !(await tenant.isVisible()),
              "Notes did not close with Escape.",
            );
            must(
              await notes.evaluate((e) => document.activeElement === e),
              "Notes did not return focus.",
            );
            return {
              state: "passed",
              kind: "notes-dialog",
              presentation:
                "Native disclosure replaced by the shared Notes dialog.",
              focusReturned: true,
            };
          }
          return {
            state: "unexercised",
            reason:
              "Summary is unavailable in this surface; no forced activation.",
          };
        }
        // Bringing a search neighbour into view can select its context. Start
        // the toggle check from the state the reader actually reaches.
        const searchIndex = await detail.evaluate((e) =>
          e.closest(".search-page--depth")
            ? [
                ...e
                  .closest(".search-page")
                  .querySelectorAll(".search-result details"),
              ].indexOf(e)
            : -1,
        );
        if (searchIndex >= 0) {
          const root = detail.locator(
            'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," search-page ")][1]',
          );
          const current = async () =>
            Number(
              (
                await root.locator(".search-depth__controls output").innerText()
              ).match(/(\d+)\s*\//)?.[1],
            ) - 1;
          let selected = await current();
          while (selected !== searchIndex) {
            must(
              Date.now() < deadline - 3000,
              "Case deadline reached selecting disclosure.",
            );
            await click(
              root.locator(
                selected < searchIndex
                  ? "[data-search-depth-next]"
                  : "[data-search-depth-previous]",
              ),
            );
            selected = await current();
          }
          // Move the whole card vertically without horizontally centring its
          // corner control; this follows the visible reader interaction.
          await detail.locator("xpath=parent::*").scrollIntoViewIfNeeded();
        } else await summary.scrollIntoViewIfNeeded();
        await settle();
        const initial = await detail.evaluate((e) => e.open);
        try {
          await click(summary);
          must(
            (await detail.evaluate((e) => e.open)) !== initial,
            "Native disclosure did not toggle.",
          );
          await click(summary);
          must(
            (await detail.evaluate((e) => e.open)) === initial,
            "Native disclosure did not restore.",
          );
          return {
            state: "passed",
            initial,
            restorationChecked: true,
            label: await summary.innerText(),
          };
        } finally {
          if (
            !page.isClosed() &&
            (await detail.evaluate((e) => e.open)) !== initial
          )
            await click(summary);
        }
      },
      details.nth(i),
    );
  for (const job of jobs) if (!(await run(job))) break;

  jobs = [];
  for (const config of decks) {
    const roots = page.locator(config.root);
    for (let instance = 0; instance < (await roots.count()); instance++) {
      const root = roots.nth(instance),
        cards = root.locator(config.cards),
        count = await cards.count(),
        ready = await root.evaluate(
          (e, c) => e.classList.contains(c),
          config.ready,
        );
      row.inventory.carousels.push({
        kind: config.name,
        instance,
        count,
        enhanced: ready,
      });
      if (!ready || count < 2) {
        add(`${config.name}:${instance}:fallback`, "carousel", async () => ({
          state: count < 2 ? "not-applicable" : "unexercised",
          reason:
            count < 2
              ? "Fewer than two cards."
              : "Native cards present but enhancement unavailable.",
          count,
        }));
        continue;
      }
      const position = async () => {
        const value = await root.locator(config.output).innerText(),
          match = value.match(/(\d+)\s*\/\s*(\d+)/);
        must(match, "Carousel position is unavailable.");
        return { index: Number(match[1]) - 1, count: Number(match[2]) };
      };
      const select = async (index) => {
        if (
          config.choices &&
          (await root.locator(config.choices).nth(index).isVisible())
        ) {
          const choice = root.locator(config.choices).nth(index);
          await click(choice);
        } else {
          let p = await position();
          while (p.index !== index) {
            must(
              Date.now() < deadline - 3000,
              "Case deadline reached selecting slide.",
            );
            const direction = p.index < index ? "next" : "previous",
              button = root.locator(config[direction]);
            must(
              await button.isEnabled(),
              "Required carousel arrow is disabled.",
            );
            await click(button);
            const old = p.index;
            // While a button scroll travels, the carousel marks the nearest
            // visible card, so the count can step forward, fall back and step
            // forward again. Read it only once it has moved and stayed put.
            let last = null,
              steady = 0;
            const settleBy = Math.min(Date.now() + 4000, deadline - 3000);
            while (Date.now() < settleBy) {
              const now = await position();
              steady = last && now.index === last.index ? steady + 1 : 0;
              last = now;
              if (now.index !== old && steady >= 3) break;
              await page.waitForTimeout(100);
            }
            must(
              last && last.index !== old,
              "Carousel position did not move after its arrow.",
            );
            p = await position();
          }
        }
        const p = await position();
        must(
          p.index === index && p.count === count,
          "Carousel selected a different slide/count.",
        );
      };
      for (let slide = 0; slide < count; slide++)
        add(
          `${config.name}:${instance}:slide:${slide}`,
          "carousel-slide",
          async () => {
            await select(slide);
            const card = cards.nth(slide);
            await card.scrollIntoViewIfNeeded();
            await settle();
            must(
              await card.evaluate((e, s) => e.matches(s), config.active),
              "Position changed without marking the intended card active.",
            );
            return {
              state: "passed",
              slide,
              count,
              selected: await usable(card, {
                requireLink: ["articles", "search"].includes(config.name),
              }),
              images: await images(card),
            };
          },
          root,
        );
      if (["quote", "catalogue"].includes(config.name))
        add(
          `${config.name}:${instance}:drag`,
          "carousel-drag",
          async () => {
            await select(0);
            const card = cards.nth(0);
            await card.scrollIntoViewIfNeeded();
            await settle();
            const rect = await card.boundingBox();
            must(
              rect && rect.width > 0 && rect.height > 0,
              "Selected card has no drag surface.",
            );
            // A wide fan spaces its cards further apart than a card is wide;
            // drag most of the way to the neighbour's centre, not one width.
            const neighbour = await cards.nth(1).boundingBox();
            const spacing = neighbour
              ? Math.abs(
                  neighbour.x + neighbour.width / 2 - (rect.x + rect.width / 2),
                )
              : 0;
            const start = {
              x: Math.min(item.width - 20, rect.x + rect.width * 0.8),
              y: Math.max(12, Math.min(height - 12, rect.y + 12)),
            };
            const end = {
              x: Math.max(
                10,
                start.x - Math.max(120, rect.width * 0.85, spacing * 0.75),
              ),
              y: start.y,
            };
            must(
              start.x - end.x > 50,
              "Card has insufficient exposed horizontal drag space.",
            );
            const before = page.url();
            if (item.width < 768) {
              const input = await context.newCDPSession(page);
              try {
                await input.send("Input.dispatchTouchEvent", {
                  type: "touchStart",
                  touchPoints: [start],
                });
                for (let step = 1; step <= 12; step++)
                  await input.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [
                      {
                        x: start.x + ((end.x - start.x) * step) / 12,
                        y: start.y,
                      },
                    ],
                  });
                await input.send("Input.dispatchTouchEvent", {
                  type: "touchEnd",
                  touchPoints: [],
                });
              } finally {
                await input.detach();
              }
            } else {
              await page.mouse.move(start.x, start.y);
              await page.mouse.down();
              try {
                await page.mouse.move(end.x, end.y, { steps: 12 });
              } finally {
                await page.mouse.up();
              }
            }
            await settle();
            must(
              page.url() === before,
              "Dragging a card unexpectedly followed its link.",
            );
            const after = await position();
            must(
              after.index !== 0,
              "Horizontal card drag did not select another card.",
            );
            await select(0);
            return {
              state: "passed",
              input: item.width < 768 ? "emulated touch" : "mouse",
              from: 0,
              to: after.index,
              restored: true,
            };
          },
          root,
        );
      add(
        `${config.name}:${instance}:boundaries`,
        "carousel-boundaries",
        async () => {
          const previous = root.locator(config.previous),
            next = root.locator(config.next),
            looping =
              config.looping === "always" ||
              (config.looping === true && count > 3);
          await select(count - 1);
          if (looping) {
            must(await next.isEnabled(), "Looping next is disabled.");
            await click(next);
            must(
              (await position()).index === 0,
              "Last slide did not loop to first.",
            );
            await click(previous);
            must(
              (await position()).index === count - 1,
              "First slide did not loop to last.",
            );
          } else {
            must(
              !(await next.isEnabled()),
              "Finite next stays enabled at end.",
            );
            await select(0);
            must(
              !(await previous.isEnabled()),
              "Finite previous stays enabled at start.",
            );
          }
          return { state: "passed", looping, count };
        },
        root,
      );
    }
  }
  const processButtons = page.locator(".process-path__button[aria-controls]");
  row.inventory.processSteps = await processButtons.count();
  for (let i = 0; i < row.inventory.processSteps; i++)
    add(
      `process:${i}`,
      "process-step",
      async () => {
        const button = processButtons.nth(i);
        if (!(await button.isVisible()))
          return {
            state: "unexercised",
            reason: "Step is not exposed in the current presentation.",
          };
        if ((await button.getAttribute("aria-expanded")) !== "true")
          await click(button);
        const id = await button.getAttribute("aria-controls"),
          panel = page.locator(`[id=${JSON.stringify(id)}]`);
        must(
          (await button.getAttribute("aria-expanded")) === "true",
          "Process step did not expand.",
        );
        // The panel opens through a row transition; judge it once that has finished.
        await panel
          .evaluate((element) =>
            Promise.all(
              element.getAnimations().map((animation) => animation.finished),
            ),
          )
          .catch(() => {});
        return {
          state: "passed",
          panel: id,
          content: await usable(panel),
          images: await images(panel),
        };
      },
      processButtons.nth(i),
    );
  const viewChoices = page.locator(
    '.view-set .view__choice > input[type="radio"]',
  );
  row.inventory.viewChoices = await viewChoices.count();
  for (let i = 0; i < row.inventory.viewChoices; i++)
    add(
      `view:${i}`,
      "view-choice",
      async () => {
        const radio = viewChoices.nth(i),
          label = radio.locator("..");
        if (!(await label.isVisible()))
          return {
            state: "unexercised",
            reason: "View choice is not exposed.",
          };
        await click(label);
        must(await radio.isChecked(), "View choice did not select.");
        const panel = radio
          .locator(
            'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," view ")][1]',
          )
          .locator(":scope > .view__panel");
        return {
          state: "passed",
          content: await usable(panel),
          images: await images(panel),
        };
      },
      viewChoices.nth(i),
    );
  // Only locally declared figure controls are activated; provider actions are excluded.
  const panels = page.locator(figures || ":not(*)");
  for (let instance = 0; instance < (await panels.count()); instance++) {
    const panel = panels.nth(instance),
      controls = panel.locator(
        'select,input[type="radio"],input[type="checkbox"],input[type="range"],button[type="button"]',
      );
    for (
      let controlIndex = 0;
      controlIndex < (await controls.count());
      controlIndex++
    ) {
      const control = controls.nth(controlIndex),
        shape = await control.evaluate((e) => ({
          tag: e.tagName,
          type: e.type,
          value: e.value,
          min: e.min,
          max: e.max,
          options: e.options
            ? [...e.options].filter((o) => !o.disabled).map((o) => o.value)
            : null,
        }));
      const values =
        shape.options ??
        (shape.type === "range" ? [shape.min, shape.max] : [null]);
      row.inventory.figureControls++;
      for (let choice = 0; choice < values.length; choice++)
        add(
          `figure:${instance}:${controlIndex}:${choice}`,
          "figure-control",
          async () => {
            if (!(await control.isVisible()) || !(await control.isEnabled()))
              return {
                state: "unexercised",
                reason:
                  "Known local control is hidden or disabled in its current state.",
              };
            const before = await panel.innerText();
            await control.scrollIntoViewIfNeeded();
            if (shape.tag === "SELECT")
              await control.selectOption(values[choice]);
            else if (shape.type === "range") {
              await control.focus();
              await control.press(choice === 0 ? "Home" : "End");
            } else if (shape.type === "checkbox")
              await control.setChecked(!(await control.isChecked()));
            else if (shape.type === "radio") await control.check();
            else await click(control);
            await settle();
            const after = await panel.innerText();
            return {
              state: "passed",
              control: await control.getAttribute("id"),
              value:
                shape.tag === "SELECT" || shape.type === "range"
                  ? await control.inputValue()
                  : null,
              changedText: before !== after,
              output: after.slice(-600),
              assertion:
                "Control was operated and output recorded; scientific meaning requires its existing dedicated test.",
            };
          },
          control,
        );
    }
  }
  // Load every visible authored image before discovering its viewer action.
  const authored = page.locator("main img[data-gazette-image]");
  for (let i = 0; i < (await authored.count()) && Date.now() < deadline; i++) {
    const img = authored.nth(i);
    if (await img.isVisible()) {
      await img.scrollIntoViewIfNeeded();
      await imageSettled(img, 1000);
    }
  }
  const viewers = page.locator("main .media-inspection-control");
  row.inventory.viewers = await viewers.count();
  for (let instance = 0; instance < row.inventory.viewers; instance++) {
    const control = await viewers.nth(instance).elementHandle();
    add(
      `viewer:${instance}`,
      "media-viewer",
      async () => {
        if (!(await control.isVisible()))
          return {
            state: "unexercised",
            reason: "Viewer control belongs to an inactive/hidden image.",
          };
        must(
          !(await control.evaluate((e) =>
            e.hasAttribute("data-media-pending"),
          )),
          "Image has not loaded enough to inspect.",
        );
        const before = await control.evaluate((button) => {
          const node = button.previousElementSibling,
            img = node?.matches("img") ? node : node?.querySelector("img"),
            address =
              node?.getAttribute("data-gazette-image-ref") ||
              img?.getAttribute("data-gazette-image"),
            proofs = JSON.parse(
              document.querySelector("[data-media-images]")?.textContent ||
                "[]",
            ),
            proof = proofs.find((p) => p.address === address);
          return {
            address,
            src: img?.currentSrc || img?.src || null,
            drawing: !!node?.hasAttribute("data-gazette-image-ref"),
            expected:
              proof?.variants?.[document.documentElement.dataset.mode] ||
              proof?.destination ||
              null,
            top: button.getBoundingClientRect().top,
          };
        });
        await click(control);
        const tenant = page.locator('dialog[open] [data-tenant="media"]');
        await tenant.waitFor({ state: "visible" });
        let result;
        try {
          must(
            before.address && before.expected,
            "Cannot identify viewer source occurrence.",
          );
          if (before.drawing) {
            const address = await tenant
              .locator("[data-gazette-image-ref]")
              .getAttribute("data-gazette-image-ref");
            must(
              address === before.address,
              "Viewer moved a different live drawing.",
            );
            result = {
              drawing: address,
              variant: "Live drawing uses the page palette; no raster variant.",
            };
          } else {
            const shown = tenant.locator(".media-viewer__image");
            await images(tenant);
            const src = await shown.evaluate((e) => e.currentSrc || e.src);
            must(
              src === before.expected && before.src === before.expected,
              "Viewer or inline image does not match the active colour variant.",
            );
            result = {
              source: before.src,
              viewer: src,
              expected: before.expected,
            };
          }
          const enlarge = tenant.locator("[data-media-size]"),
            fit = tenant.locator("[data-media-fit]");
          must(
            (await enlarge.isVisible()) && (await fit.isVisible()),
            "Open viewer did not expose its size and fit controls.",
          );
          const view = () =>
            tenant.evaluate((tenant) => {
              const viewport = tenant.querySelector(".media-viewer__viewport"),
                drawing = viewport?.querySelector(
                  ":scope > [data-media-expanded]",
                );
              const vectors = drawing?.querySelectorAll(":scope > svg"),
                media =
                  vectors?.length === 1
                    ? vectors[0]
                    : drawing ||
                      viewport?.querySelector(".media-viewer__image");
              const bounds = media?.getBoundingClientRect();
              return {
                width: bounds?.width ?? 0,
                height: bounds?.height ?? 0,
                fit: tenant
                  .querySelector("[data-media-fit]")
                  ?.getAttribute("aria-pressed"),
                fitHeight:
                  viewport?.style.getPropertyValue("--media-fit-height"),
                mediaWidth: viewport?.style.getPropertyValue("--media-width"),
                scrollLeft: viewport?.scrollLeft,
                scrollTop: viewport?.scrollTop,
              };
            });
          await settle();
          const initial = await view();
          must(
            initial.width > 0 &&
              initial.height > 0 &&
              initial.fit === "true" &&
              parseFloat(initial.fitHeight) > 0,
            "Viewer did not start with visible fitted media.",
          );
          let detail = {
            state: "not-applicable",
            reason:
              "The native size control is disabled at the available detail limit.",
          };
          if (await enlarge.isEnabled()) {
            await click(enlarge);
            const enlarged = await view();
            must(
              enlarged.fit === "false" && enlarged.fitHeight === "none",
              "Size did not leave fit mode.",
            );
            must(
              enlarged.width > initial.width + 0.01 ||
                enlarged.height > initial.height + 0.01,
              "Size changed no rendered media dimension.",
            );
            detail = { state: "passed", before: initial, after: enlarged };
          }
          must(await fit.isEnabled(), "Viewer fit control is disabled.");
          await click(fit);
          const fitted = await view();
          must(
            fitted.fit === "true" && parseFloat(fitted.fitHeight) > 0,
            "Fit did not restore fitted mode.",
          );
          must(
            Math.abs(fitted.scrollLeft) <= 1 && Math.abs(fitted.scrollTop) <= 1,
            "Fit did not return the media viewport to its origin.",
          );
          must(
            Math.abs(fitted.width - initial.width) <= 2 &&
              Math.abs(fitted.height - initial.height) <= 2,
            "Fit did not restore the original rendered media dimensions.",
          );
          result.sizing = {
            detail,
            fit: { state: "passed", after: fitted },
            scope:
              "One available size step, rendered dimensions, fit restoration and scroll origin; repeated zoom limits and manual panning are not exercised.",
          };
        } finally {
          await page.keyboard.press("Escape");
          await settle();
        }
        must(!(await tenant.isVisible()), "Escape did not close viewer.");
        must(
          await control.evaluate((e) => document.activeElement === e),
          "Viewer did not restore trigger focus.",
        );
        return {
          state: "passed",
          ...result,
          focusReturned: true,
          mode: currentMode,
        };
      },
      control,
    );
  }
  row.unrecognisedControls = await page
    .locator("main button,main input,main select")
    .evaluateAll(
      (nodes, figureSelector) =>
        nodes
          .filter(
            (e) =>
              !e.closest(
                (figureSelector ? figureSelector + "," : "") +
                  ".quote-deck,.catalogue,[data-article-listing],.search-page,.discovery-explorer,.reading-outline,.reading-header-row,.reading-margin,.process-path,.view-set",
              ) && !e.matches(".media-inspection-control"),
          )
          .map((e) => ({
            tag: e.tagName,
            type: e.type,
            id: e.id,
            label:
              e.getAttribute("aria-label") ||
              e.textContent.trim().slice(0, 100),
          })),
      figures,
    );
  for (const job of jobs) if (!(await run(job))) break;

  for (const name of [
    "details",
    "carousels",
    "viewers",
    "processSteps",
    "viewChoices",
    "figureControls",
  ])
    if (!row.inventory[name]?.length && !row.inventory[name])
      row.tests.push({
        id: name,
        kind: name,
        state: "not-applicable",
        reason: "No matching native control on this page.",
      });
  if (row.unrecognisedControls.length)
    row.tests.push({
      id: "unrecognised-controls",
      state: "unexercised",
      reason: "Controls require a content-specific check.",
      controls: row.unrecognisedControls,
    });
}
