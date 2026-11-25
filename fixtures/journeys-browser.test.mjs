import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCase } from "./journeys/case.mjs";
import { launch } from "./lib/browser.mjs";
import { listen } from "./lib/serve.mjs";

test(
  "neutral pages exercise native controls, every sequence edge, history and fallbacks",
  { timeout: 60000 },
  async () => {
    let origin;
    const enquiryVisits = [];
    const server = await listen((request, response) => {
      const url = new URL(request.url, origin);
      const second = url.pathname === "/second/";
      if (second && url.search)
        enquiryVisits.push(Object.fromEntries(url.searchParams));
      const source = {
        site: "site:example",
        content: "content:first",
        url: origin + "/",
      };
      const destination = {
        site: "site:example",
        content: "content:second",
        url: origin + "/second/",
      };
      const enquiry = second
        ? ""
        : '<script type="application/json" id="enquiry-context">' +
          JSON.stringify({ source, destination }) +
          "</script><script>setTimeout(() => {" +
          'const anchor = document.querySelector("a[data-gazette-destination-content]");' +
          'anchor.href += "?g_from_site=site:example&g_from_content=content:first&g_from_page="+' +
          'encodeURIComponent(location.origin+"/")+"&g_from_button=services-link";}, 1500);</script>';
      const binding = second
        ? ""
        : 'data-gazette-destination-site="site:example" data-gazette-destination-content="content:second"';
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><link rel="canonical" href="${origin}${second ? "/second/" : "/"}"><style>body{margin:16px;font:16px sans-serif}pre{white-space:pre-wrap;overflow-x:visible}a{display:inline-block;padding:8px}</style></head><body><header class="frame__header"><nav class="frame__nav"><a href="${second ? "/" : "/second/"}" ${binding}>Other page</a></nav></header><main><h1>${second ? "Second" : "First"}</h1><details class="reading-orientation__journey"><summary>Reading sequence</summary><nav aria-label="Reading sequence: Example"><ol class="reading-chapters"><li>${second ? '<a href="/">First</a>' : '<span aria-current="page">First</span>'}</li><li>${second ? '<span aria-current="page">Second</span>' : '<a href="/second/">Second</a>'}</li></ol>${second ? '<a href="/" rel="prev">Previous</a>' : '<a href="/second/" rel="next">Next</a>'}</nav></details><details><summary>More information</summary><p>A complete native account.</p></details><pre><code>const result = 1;</code></pre><div class="publication-body"><form><fieldset><legend>Example controls</legend><label>Count <input id="count" type="number" min="0" max="2" value="1"></label><button type="reset">Restore</button></fieldset></form></div></main>${enquiry}</body></html>`,
      );
    });
    origin = server.origin;
    const out = await mkdtemp(join(tmpdir(), "gazette-journeys-"));
    let browser;
    try {
      browser = await launch();
      const item = {
        url: origin + "/",
        kind: "article",
        width: 390,
        height: 844,
        mode: "light",
        motion: "reduce",
        authoredControls: true,
      };
      const options = { out, timeoutMs: 15000, allowedOrigins: [origin] };
      for (const suite of ["interactions", "nojs", "print"]) {
        const row = await runCase(browser, item, suite, options);
        assert.equal(row.state, "passed", JSON.stringify(row, null, 2));
        if (suite === "interactions")
          assert.equal(
            row.tests.filter((test) => test.kind === "details").length,
            2,
          );
        if (suite === "interactions") {
          assert.equal(row.inventory.figureControls, 2);
          const number = row.tests.find((test) => test.control === "count");
          assert.equal(number.value, "2");
          assert.deepEqual(enquiryVisits, [
            {
              g_from_site: "site:example",
              g_from_content: "content:first",
              g_from_page: origin + "/",
              g_from_button: "services-link",
            },
          ]);
        }
        if (suite === "interactions")
          assert.equal(
            row.tests.find((test) => test.kind === "collection")
              .directedEdgesChecked,
            2,
          );
      }
    } finally {
      await browser?.close();
      await server.close();
      await rm(out, { recursive: true, force: true });
    }
  },
);
