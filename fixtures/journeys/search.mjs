import { createHash } from "node:crypto";
const requireState = (value, message) => {
  if (!value) throw new Error(message);
};

// Date-only values establish a day, not a fabricated time within that day.
const checkTimestampOrder = (shown, eligible, order) => {
  const timestamp = (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      value,
    ) && Number.isFinite(Date.parse(value));
  const day = (value) => Math.floor(Date.parse(value) / 86400000);
  let checkedPairs = 0,
    mixedPrecisionPairs = 0;
  for (let index = 1; index < shown.length; index++) {
    const previous = shown[index - 1],
      current = shown[index];
    if (day(previous) !== day(current)) continue;
    if (!timestamp(previous) || !timestamp(current)) {
      mixedPrecisionPairs++;
      continue;
    }
    requireState(
      order === "oldest"
        ? Date.parse(previous) <= Date.parse(current)
        : Date.parse(previous) >= Date.parse(current),
      "Same-day timestamp order incorrect.",
    );
    checkedPairs++;
  }
  let endpoint = { state: "unexercised", reason: "No dated endpoint." };
  if (shown.length && eligible.length) {
    const days = eligible.map(day),
      extremeDay = order === "oldest" ? Math.min(...days) : Math.max(...days);
    const group = eligible.filter((value) => day(value) === extremeDay);
    if (group.every(timestamp)) {
      const times = group.map((value) => Date.parse(value));
      const expected =
        order === "oldest" ? Math.min(...times) : Math.max(...times);
      requireState(
        timestamp(shown[0]) && Date.parse(shown[0]) === expected,
        "Sort did not reach the exact timestamp endpoint.",
      );
      endpoint = {
        state: "passed",
        timestamp: shown[0],
        eligibleOnDay: group.length,
      };
    } else
      endpoint = {
        state: "unexercised",
        reason:
          "Endpoint day includes date-only records; their time and exact placement are unknown.",
        eligibleOnDay: group.length,
      };
  }
  return {
    adjacentSameDay: {
      state: checkedPairs ? "passed" : "unexercised",
      checkedPairs,
      mixedPrecisionPairs,
      ...(!checkedPairs
        ? { reason: "No adjacent same-day pair has two known timestamps." }
        : {}),
    },
    endpoint,
  };
};

export async function search({ page, item, allowed, options }) {
  const row = { issues: [] };
  const root = page.locator(".search-page");
  const list = root.locator(".search-page__results");
  const openRefine = async () => {
    const details = root.locator("form details");
    if (!(await details.evaluate((element) => element.open)))
      await details.locator("summary").click();
  };
  // The page replaces its results, writes the status, then changes the URL in
  // one render. Wait for that contract rather than a guessed network delay.
  const ready = async (expected, previous = null) => {
    await page
      .waitForFunction(
        ({ expected, previous }) => {
          const root = document.querySelector(".search-page"),
            form = root?.querySelector("form");
          const list = root?.querySelector(".search-page__results"),
            status = root?.querySelector('[role="status"]');
          const fallback =
            root?.querySelector(".search-page__fallback") ||
            document.querySelector(".search-page__fallback");
          if (
            !form ||
            form.hidden ||
            !list ||
            list.hidden ||
            !fallback?.hidden ||
            !status?.textContent.trim() ||
            previous?.isConnected
          )
            return false;
          if (location.href !== expected) return false;
          const parameters = new URL(expected).searchParams;
          for (const name of [
            "q",
            "kind",
            "author",
            "project",
            "keyword",
            "classification",
            "sort",
          ]) {
            const value =
              parameters.get(name) || (name === "sort" ? "relevance" : "");
            if (form.elements.namedItem(name)?.value !== value) return false;
          }
          const empty = list.children.length === 0;
          return empty
            ? status.textContent === status.getAttribute("data-status-empty")
            : ![
                status.getAttribute("data-status-loading"),
                status.getAttribute("data-status-unavailable"),
                root.getAttribute("data-search-query-limit"),
              ].includes(status.textContent);
        },
        { expected, previous },
        { timeout: 15000 },
      )
      .catch(async (error) => {
        const state = await root
          .evaluate((node) => {
            const form = node.querySelector("form");
            return {
              url: location.href,
              status: node.querySelector('[role="status"]')?.textContent,
              formHidden: form?.hidden,
              results: node.querySelector(".search-page__results")?.children
                .length,
            };
          })
          .catch(() => null);
        if (!state) throw error;
        throw new Error(
          `Search expected ${expected}. Observed ${state.url}, ${state.status}, form ${state.formHidden ? "hidden" : "visible"}, ${state.results} children.`,
        );
      });
  };
  const mutate = async (operation, expected) => {
    const previous =
      (await list.locator(":scope > li").elementHandles())[0] ?? null;
    try {
      await operation();
      await ready(expected, previous);
    } finally {
      await previous?.dispose();
    }
  };
  const choose = async (name, value) => {
    const control = root.locator(`[name="${name}"]`);
    if ((await control.inputValue()) === value) {
      await ready(page.url());
      return;
    }
    const expected = new URL(page.url());
    // Refining starts again from the first results page, which is the search root,
    // so a static `page/N/` endpoint gives way to it.
    expected.pathname = expected.pathname.replace(/page\/\d+\/$/, "");
    expected.searchParams.delete("page");
    if (value && !(name === "sort" && value === "relevance"))
      expected.searchParams.set(name, value);
    else expected.searchParams.delete(name);
    expected.hash = "";
    // Match searchStateURL's stable ordering while retaining unrelated values.
    const values = Object.fromEntries(
      [
        "q",
        "sort",
        "page",
        "kind",
        "author",
        "project",
        "keyword",
        "classification",
      ].map((key) => [key, expected.searchParams.get(key)]),
    );
    for (const key of Object.keys(values)) expected.searchParams.delete(key);
    for (const [key, value] of Object.entries(values))
      if (value) expected.searchParams.set(key, value);
    await mutate(
      () => (name === "q" ? control.fill(value) : control.selectOption(value)),
      expected.href,
    );
  };
  try {
    await ready(page.url());
    const binding = JSON.parse(
      await page.locator("#search-corpus").textContent(),
    );
    const corpusURL = new URL(binding.url, page.url());
    requireState(
      allowed.has(corpusURL.origin),
      "Search corpus is outside the supplied preview.",
    );
    const cache = options.searchCorpora;
    let captured = cache?.get(corpusURL.href);
    const reused = Boolean(captured);
    if (!captured) {
      const response = await page.request.get(corpusURL.href, {
        timeout: 15000,
      });
      requireState(
        response.ok(),
        "Could not read the candidate search corpus.",
      );
      const bytes = await response.body();
      const rows = JSON.parse(bytes);
      requireState(Array.isArray(rows), "Search corpus is not an array.");
      const evidence = {
        url: corpusURL.href,
        records: rows.length,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      captured = { rows, evidence };
      cache?.set(corpusURL.href, captured);
    }
    const corpus = captured.rows;
    row.corpus = { ...captured.evidence, reused };
    const byURL = new Map(corpus.map((record) => [record.route.url, record]));
    const articles = corpus.filter(
      (record) =>
        record.content.documentation !== true &&
        record.content.structure?.kind === "page" &&
        record.content.structure.family?.kind === "article",
    );
    const dated = (record) =>
      typeof record.content.published === "string" &&
      Number.isFinite(Date.parse(record.content.published));
    const datedArticles = articles.filter(dated);
    row.dateCoverage = {
      articles: articles.length,
      datedArticles: datedArticles.length,
      datedDrafts: datedArticles.filter(
        (record) => record.content.lifecycle === "draft",
      ).length,
      undatedDrafts: articles
        .filter(
          (record) => !dated(record) && record.content.lifecycle === "draft",
        )
        .map((record) => record.content.id),
      undatedOther: articles
        .filter(
          (record) => !dated(record) && record.content.lifecycle !== "draft",
        )
        .map((record) => record.content.id),
      scope:
        "Rendered date identity, chronological UTC days, adjacent known timestamps within a day, and exact oldest/latest timestamps when every eligible record on the endpoint day has timestamp precision. Date-only placement and equal-timestamp tie policy retain their dedicated native tests.",
    };
    await openRefine();
    requireState(
      (await root
        .locator('select[name="kind"] option[value="article"]')
        .count()) === 1,
      "No article facet is available for the date review.",
    );
    await choose("kind", "article");
    row.sortChecks = {};
    for (const order of ["oldest", "latest"]) {
      await choose("sort", order);
      const shown = await list.locator(":scope > li").evaluateAll((entries) =>
        entries.map((entry) => ({
          href: entry.querySelector("h2 a")?.href,
          dates: [...entry.querySelectorAll("time")].map((time) =>
            time.getAttribute("datetime"),
          ),
        })),
      );
      requireState(
        shown.length > 0,
        "Article refinement returned no articles.",
      );
      const days = [];
      let sawUndated = false;
      row[order] = [];
      for (const entry of shown) {
        const record = byURL.get(entry.href);
        requireState(
          record && articles.includes(record),
          "Rendered article is absent from the candidate article corpus.",
        );
        if (!dated(record)) {
          requireState(
            entry.dates.length === 0,
            "An undated article acquired an invented rendered date.",
          );
          sawUndated = true;
          continue;
        }
        requireState(!sawUndated, "A dated article follows an undated result.");
        requireState(
          entry.dates.length === 1 &&
            entry.dates[0] === record.content.published,
          "A dated article lost or changed its rendered date.",
        );
        row[order].push(entry.dates[0]);
        days.push(Math.floor(Date.parse(entry.dates[0]) / 86400000));
      }
      requireState(
        days.length === Math.min(datedArticles.length, shown.length),
        "The result page did not expose its expected date-bearing articles.",
      );
      requireState(
        days.every(
          (day, index) =>
            !index ||
            (order === "oldest"
              ? days[index - 1] <= day
              : days[index - 1] >= day),
        ),
        "Date order incorrect.",
      );
      if (days.length) {
        const corpusDays = datedArticles.map((record) =>
          Math.floor(Date.parse(record.content.published) / 86400000),
        );
        requireState(
          days[0] ===
            (order === "oldest"
              ? Math.min(...corpusDays)
              : Math.max(...corpusDays)),
          "Sort did not reach the expected dated endpoint.",
        );
      }
      const timestampChecks = checkTimestampOrder(
        row[order],
        datedArticles.map((record) => record.content.published),
        order,
      );
      row.sortChecks[order] = {
        state: days.length >= 2 ? "passed" : "unexercised",
        datedResults: days.length,
        timestampChecks,
        ...(days.length < 2
          ? {
              reason: days.length
                ? "Only one dated article; ordering cannot be demonstrated."
                : "All articles are undated; no chronological ordering can be demonstrated.",
            }
          : {}),
      };
    }
    const author = root.locator('select[name="author"]');
    const authors = await author
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => option.value).filter(Boolean),
      );
    if (authors.length && (await author.isVisible())) {
      await choose("author", authors[0]);
      const hrefs = await list
        .locator("h2 a")
        .evaluateAll((links) => links.map((link) => link.href));
      requireState(
        hrefs.length > 0 &&
          hrefs.every((href) =>
            byURL
              .get(href)
              ?.attributions?.some(
                (item) =>
                  item.role === "author" && item.principal?.id === authors[0],
              ),
          ),
        "Author refinement did not retain the selected author.",
      );
      row.authorFilter = {
        state: "passed",
        author: authors[0],
        results: hrefs.length,
      };
    } else
      row.authorFilter = {
        state: "unexercised",
        reason: "No visible multi-value author facet.",
      };
    row.filteredUrl = page.url();
    const target = list.locator("h2 a").first();
    requireState(
      (await target.count()) > 0,
      "No filtered result to follow and return from.",
    );
    const href = await target.getAttribute("href");
    const targetURL = new URL(href, page.url()).href;
    await Promise.all([
      page.waitForURL(targetURL, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      }),
      target.click({ noWaitAfter: true, timeout: 5000 }),
    ]);
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
    await ready(row.filteredUrl);
    await page.waitForFunction(
      () => document.querySelector(".search-page form details")?.open === true,
      null,
      { timeout: 5000 },
    );
    row.back = {
      state: "passed",
      destination: href,
      returned: page.url(),
      refinementOpen: true,
    };
    for (const query of item.queries ?? []) {
      await choose("q", query.text);
      const urls = await list
        .locator("h2 a")
        .evaluateAll((links) => links.map((link) => link.href));
      if (query.first)
        requireState(
          urls[0] === query.first,
          "Query ranking did not select the expected first result.",
        );
      for (const url of query.includes ?? [])
        requireState(urls.includes(url), "Expected query result is absent.");
    }
    await choose("q", "qzxv-no-matching-publication");
    row.empty = await root.locator('[role="status"]').innerText();
    requireState(
      (await list.locator("h2 a").count()) === 0,
      "Unmatched query has results.",
    );
    await choose("q", "");
    await openRefine();
    if (await author.inputValue()) await choose("author", "");
    await choose("kind", "");
    await choose("sort", "relevance");
    const next = root.locator(".search-page__next").first();
    if (await next.isVisible()) {
      const destination = await next.getAttribute("href");
      await mutate(
        () => next.click({ noWaitAfter: true, timeout: 5000 }),
        new URL(destination, page.url()).href,
      );
      requireState(
        new URL(page.url()).searchParams.get("page") === "2",
        "Next failed.",
      );
      await openRefine();
      await choose("kind", "article");
      requireState(
        !new URL(page.url()).searchParams.has("page"),
        "Filter failed to reset page.",
      );
      row.paginationReset = true;
    } else
      row.pagination = {
        state: "unexercised",
        reason: "The corpus has one result page.",
      };
  } catch (error) {
    row.issues.push(error.message.slice(0, 220));
  }
  return row;
}
