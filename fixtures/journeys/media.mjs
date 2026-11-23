import { must } from "./support.mjs";

export function controls(page) {
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, 120);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(timer);
              resolve();
            }),
          );
        }),
    );
  const click = async (locator) => {
    // A fully exposed target needs no scrolling. Scroll-into-view can move a
    // small control outside a carousel's narrow snap port to another card.
    const point = await locator.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return r.width &&
        r.height &&
        x > 0 &&
        x < innerWidth &&
        y > 0 &&
        y < innerHeight &&
        hit &&
        (hit === e || e.contains(hit))
        ? { x, y }
        : null;
    });
    if (point) await page.mouse.click(point.x, point.y);
    else await locator.click();
    await settle();
  };
  const withTarget = async (target, operation) => {
    const chain = await target.evaluate((el) => {
      const all = [...document.querySelectorAll("details")],
        parents = [];
      for (let p = el.parentElement; p; p = p.parentElement)
        if (p.tagName === "DETAILS") parents.unshift(all.indexOf(p));
      const keep = new Set([
        ...parents,
        el.tagName === "DETAILS" ? all.indexOf(el) : -1,
      ]);
      return {
        parents,
        headers: all.flatMap((d, i) =>
          !keep.has(i) && d.open && d.closest(".reading-header-row") ? [i] : [],
        ),
      };
    });
    const opened = [],
      all = page.locator("details");
    // A preceding close may also close another disclosure; never reopen it.
    for (const index of chain.headers) {
      const d = all.nth(index);
      if (await d.evaluate((e) => e.open))
        await click(d.locator(":scope > summary"));
    }
    try {
      for (const index of chain.parents) {
        const d = all.nth(index);
        if (!(await d.evaluate((e) => e.open))) {
          await click(d.locator(":scope > summary"));
          opened.push(d);
        }
      }
      return await operation();
    } finally {
      for (const d of opened.reverse())
        if (!page.isClosed() && (await d.evaluate((e) => e.open)))
          await click(d.locator(":scope > summary"));
    }
  };
  const images = async (locator) => {
    const result = await locator.evaluate(async (root) => {
      // Decorative artwork is intentionally aria-hidden. Accessibility-tree
      // exclusion does not mean the pixels are hidden from the reader.
      const visible = (e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        for (let n = e; n; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (
            s.display === "none" ||
            s.visibility === "hidden" ||
            Number(s.opacity) === 0
          )
            return false;
        }
        return true;
      };
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const proofs = JSON.parse(
          document.querySelector("[data-media-images]")?.textContent || "[]",
        ),
        mode = document.documentElement.dataset.mode;
      const native = [...root.querySelectorAll("img")].filter(visible);
      await Promise.race([
        Promise.all(
          native.map((i) =>
            i.complete
              ? null
              : new Promise((resolve) => {
                  i.addEventListener("load", resolve, { once: true });
                  i.addEventListener("error", resolve, { once: true });
                }),
          ),
        ),
        new Promise((resolve) => setTimeout(resolve, 1400)),
      ]);
      const assets = native.map((i) => {
        const address = i.getAttribute("data-gazette-image"),
          proof = proofs.find((p) => p.address === address),
          art = i.closest(".folder-card__art"),
          s = getComputedStyle(i);
        return {
          kind: i.closest("picture") ? "picture" : "image",
          address,
          expected: proof?.variants?.[mode] || proof?.destination || null,
          proofRequired: !!address,
          src: i.src,
          currentSrc: i.currentSrc,
          complete: i.complete,
          naturalWidth: i.naturalWidth,
          naturalHeight: i.naturalHeight,
          rect: rect(i),
          artRect: art ? rect(art) : null,
          objectFit: s.objectFit,
          alt: i.alt,
          modeClass: i.className,
        };
      });
      const urls = (value) =>
        [
          ...value.matchAll(
            /url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^)]*))\s*\)/g,
          ),
        ].map(
          (m) => new URL(m[1] ?? m[2] ?? m[3].trim(), document.baseURI).href,
        );
      const background = [];
      for (const e of [root, ...root.querySelectorAll("*")].filter(visible))
        for (const pseudo of [null, "::before", "::after"]) {
          const s = getComputedStyle(e, pseudo);
          if (
            pseudo &&
            (s.content === "none" ||
              s.content === "normal" ||
              s.display === "none")
          )
            continue;
          for (const url of urls(s.backgroundImage))
            background.push({
              kind: "background",
              url,
              rect: rect(e),
              pseudo,
              backgroundSize: s.backgroundSize,
              art: !!e.closest(".folder-card__art"),
            });
        }
      const loaded = new Map();
      await Promise.all(
        [...new Set(background.map((x) => x.url))].map(async (url) => {
          const i = new Image();
          const state = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve("pending"), 1400);
            i.onload = () => {
              clearTimeout(timer);
              resolve("loaded");
            };
            i.onerror = () => {
              clearTimeout(timer);
              resolve("failed");
            };
            i.src = url;
          });
          loaded.set(url, {
            state,
            naturalWidth: i.naturalWidth,
            naturalHeight: i.naturalHeight,
          });
        }),
      );
      assets.push(...background.map((x) => ({ ...x, ...loaded.get(x.url) })));
      for (const video of [...root.querySelectorAll("video")].filter(visible))
        assets.push({
          kind: "video",
          src: video.currentSrc,
          poster: video.poster,
          readyState: video.readyState,
          width: video.videoWidth,
          height: video.videoHeight,
          rect: rect(video),
        });
      const art = [...root.querySelectorAll(".folder-card__art")].map(
        (layer) => {
          const r = rect(layer),
            nodes = [...layer.querySelectorAll("img,video,svg,canvas")].filter(
              visible,
            ),
            css = background.filter((x) => x.art);
          return {
            visible: visible(layer),
            rect: r,
            visibleMedia: nodes.length,
            backgrounds: css.length,
            declaredImages: [...layer.querySelectorAll("img")].map((i) => ({
              src: i.src,
              address: i.getAttribute("data-gazette-image"),
              visible: visible(i),
            })),
            selectedRendition: layer.querySelector(
              ".folder-card__image--" + mode,
            )
              ? mode
              : "default",
            visibleRenditions: [
              ...layer.querySelectorAll(".folder-card__image"),
            ]
              .filter(visible)
              .map((i) => i.className),
          };
        },
      );
      return {
        state: assets.length ? "checked" : "not-applicable",
        assets,
        art,
        scope:
          "Asset loading, declared source and media geometry only; composition and crop need visual review.",
      };
    });
    for (const asset of result.assets) {
      if (asset.kind === "image" || asset.kind === "picture") {
        must(
          asset.complete && asset.naturalWidth > 0 && asset.currentSrc,
          "Visible image is pending or broken: " + JSON.stringify(asset),
        );
        if (asset.proofRequired)
          must(
            asset.expected && asset.currentSrc === asset.expected,
            "Visible image differs from its declared mode/source: " +
              JSON.stringify(asset),
          );
        if (asset.artRect)
          must(
            asset.objectFit === "cover" &&
              asset.rect.width >= asset.artRect.width - 2 &&
              asset.rect.height >= asset.artRect.height - 2,
            "Folder artwork does not fill its declared art layer: " +
              JSON.stringify(asset),
          );
      } else if (asset.kind === "background")
        must(
          asset.state === "loaded" && asset.naturalWidth > 0,
          "CSS background asset failed to load: " + JSON.stringify(asset),
        );
      else
        must(
          asset.readyState >= 2 && asset.width > 0 && asset.height > 0,
          "Visible video has no decoded frame: " + JSON.stringify(asset),
        );
    }
    for (const art of result.art) {
      must(
        art.visible && art.visibleMedia + art.backgrounds > 0,
        "Declared folder artwork has no visible media: " + JSON.stringify(art),
      );
      if (art.visibleRenditions.length)
        must(
          art.visibleRenditions.length === 1 &&
            art.visibleRenditions[0]
              .split(/\s+/)
              .includes("folder-card__image--" + art.selectedRendition),
          "Folder artwork selected the wrong colour rendition: " +
            JSON.stringify(art),
        );
    }
    return result;
  };
  // A depth deck's selected card must expose a link: a 3D seat can intercept the
  // pointer before it reaches the link, which only native hit testing detects.
  const usable = async (locator, { requireLink = false } = {}) => {
    const { eligibleLinkIndexes, ...result } = await locator.evaluate(
      (root) => {
        const r = root.getBoundingClientRect(),
          s = getComputedStyle(root),
          all = [...root.querySelectorAll("a[href]")];
        const eligibleLinkIndexes = all.flatMap((a, i) =>
          !a.closest('[hidden],[inert],[aria-hidden="true"]') ? [i] : [],
        );
        const links = eligibleLinkIndexes.map((i) => {
          const a = all[i];
          return {
            text: a.textContent.trim(),
            href: a.href,
            rect: a.getBoundingClientRect().toJSON(),
          };
        });
        return {
          visible:
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== "hidden" &&
            s.display !== "none",
          inert: !!root.closest('[inert],[aria-hidden="true"]'),
          text: root.textContent.trim().slice(0, 140),
          links,
          eligibleLinkIndexes,
        };
      },
    );
    must(result.visible && !result.inert, "Selected card is hidden or inert.");
    must(
      result.text || (await locator.locator("img,svg").count()),
      "Selected card is empty.",
    );
    for (const link of result.links)
      must(
        link.rect.width > 0 && link.rect.height > 0,
        "Selected card link has no hit box.",
      );
    const targets = locator.locator("a[href]");
    let tested = 0;
    for (const index of eligibleLinkIndexes) {
      const link = targets.nth(index);
      if (!(await link.isVisible())) continue;
      tested++;
      const exposed = () =>
        link.evaluate((e) =>
          [...e.getClientRects()].some((r) => {
            const x = r.x + r.width / 2,
              y = r.y + r.height / 2,
              hit = document.elementFromPoint(x, y);
            return (
              r.width > 0 &&
              r.height > 0 &&
              x > 0 &&
              x < innerWidth &&
              y > 0 &&
              y < innerHeight &&
              hit &&
              (hit === e || e.contains(hit))
            );
          }),
        );
      if (!(await exposed())) {
        await link.evaluate((e) => {
          const r = e.getBoundingClientRect();
          window.scrollBy({
            top: r.y + r.height / 2 - innerHeight / 2,
            behavior: "instant",
          });
        });
        await settle();
      }
      must(
        await exposed(),
        "Selected card link has no exposed pointer target: " +
          (await link.innerText()),
      );
    }
    must(
      tested || !requireLink,
      "No visible selected carousel link was hit-tested.",
    );
    return {
      ...result,
      linkActionability:
        "Visible fragment hit-tested without horizontal auto-scroll; no link activated",
    };
  };

  return { settle, click, withTarget, images, usable };
}
