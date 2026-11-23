import test from "node:test";
import assert from "node:assert/strict";
import { journeyArguments, journeyManifest, planCases } from "./journeys.mjs";

test("journey plan retains every route, width, palette, motion and suite", () => {
  const manifest = journeyManifest({
    version: 1,
    routes: [
      { url: "http://localhost:4310/", kind: "home" },
      { url: "http://localhost:4310/search/", kind: "search" },
    ],
  });
  assert.equal(planCases(manifest).length, 16);
  assert.equal(
    planCases(manifest, ["interactions", "nojs", "print", "loading", "delayed"])
      .length,
    80,
  );
  assert.deepEqual(manifest.allowedOrigins, ["http://localhost:4310"]);
});
test("invalid input fails before creating a browser", () => {
  for (const url of [
    "file:///tmp/index.html",
    "http://name:password@localhost/",
  ])
    assert.throws(() => journeyManifest({ version: 1, routes: [{ url }] }));
  assert.throws(
    () =>
      journeyManifest({
        version: 1,
        routes: [
          { url: "https://example.com/" },
          { url: "https://example.com/" },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(() =>
    journeyArguments([
      "--manifest",
      "input.json",
      "--out",
      "out",
      "--suites",
      "unknown",
    ]),
  );
  assert.throws(() =>
    journeyArguments([
      "--manifest",
      "input.json",
      "--out",
      "out",
      "--capture-tool",
      "tool.mjs",
    ]),
  );
  assert.throws(() =>
    journeyManifest({
      version: 1,
      widths: [390, 390],
      routes: [{ url: "https://example.com/" }],
    }),
  );
  const options = journeyArguments([
    "--manifest",
    "input.json",
    "--out",
    "out",
    "--suites",
    "motion,print",
    "--limit",
    "2",
  ]);
  assert.deepEqual(options.suites, ["motion", "print"]);
  assert.equal(options.limit, 2);
});
