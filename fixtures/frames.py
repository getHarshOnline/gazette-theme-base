#!/usr/bin/env python3
"""Probe optional frame-module imports and image delivery through a Gazette release.

The temporary Base copy adds a neutral specimen only. No publication binding changes.
Use --keep to retain its rendered output for later browser inspection.
"""
import argparse
import html
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile
import zlib
from reading import SHELL_RESOURCES, BASE, CHROME, run

MODULE = r'''
import { createFrameSource } from "@base/frames";
export function mount({ element }) {
  const wrapper = element.closest("[data-gazette-component]");
  const fallback = wrapper.querySelector("[data-gazette-fallback]");
  const links = [...fallback.querySelectorAll("a")];
  const still = fallback.querySelector("img");
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  element.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const enabled = () => !document.hidden &&
    (document.documentElement.dataset.motion === "allow" ||
    (!document.documentElement.dataset.motion && !reduce.matches));
  function showStill() { canvas.hidden = true; still.hidden = false; }
  const source = createFrameSource({
    frames: links.map(link => ({ src: link.href, width: 2, height: 2 })),
    budgetBytes: 32, concurrency: 2,
    onFrame({ bitmap }) {
      context.drawImage(bitmap, 0, 0);
      canvas.hidden = false;
      still.hidden = true;
    },
    onError: showStill,
  });
  links.forEach((link, index) => link.addEventListener("click", event => {
    if (!enabled() || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    source.setFrame(index);
  }));
  function sync() {
    const active = enabled();
    if (!active) showStill();
    source.setActive(active);
  }
  document.addEventListener("motion-preference", sync);
  document.addEventListener("visibilitychange", sync);
  reduce.addEventListener("change", sync);
  window.addEventListener("pagehide", () => { source.setActive(false); showStill(); });
  window.addEventListener("pageshow", sync);
  source.setFrame(0);
  sync();
}
'''


def png(value):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    pixels = b"".join(b"\0" + bytes([value, value, value]) * 2 for _ in range(2))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="base-frames-"))
    try:
        base = work / "base"
        shutil.copytree(BASE, base, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        manifest = base / "presentation.toml"
        manifest.write_text(manifest.read_text() + '''
[[resources]]
id="module:frame-specimen"
inputs=["scripts/frame-specimen.js"]
build={kind="browser-module",entry="scripts/frame-specimen.js",imports={"@base/frames"="module:frames"}}
[components.frame-specimen]
template="components/frame-specimen.html"
[components.frame-specimen.interaction]
module="module:frame-specimen"
export="mount"
mount="load"
''')
        (base / "scripts/frame-specimen.js").write_text(MODULE)
        (base / "templates/components").mkdir(exist_ok=True)
        (base / "templates/components/frame-specimen.html").write_text("<section>{{ component.body.html | safe }}</section>")
        content = work / "content"
        content.mkdir()
        (content / "index.md").write_text('''+++
[content]
id="page:frames"
site="site:frames"
title="Frame specimen"
lifecycle="draft"
language="en"
route={path="/"}
structure={kind="page",family={kind="index"}}
+++
# Frame specimen

:::frame-specimen {}
![Neutral image specimen](frame-a.png)

Static specimen: the links open each image without scripts. With motion enabled, they choose the canvas frame.

[First frame](frame-a.png) · [Second frame](frame-b.png) · [Third frame](frame-c.png)
:::
''')
        for letter, value in zip("abc", [32, 128, 224]):
            (content / f"frame-{letter}.png").write_bytes(png(value))
        parts = ['[composition]\ntheme={package="theme:base"}', CHROME,
                 '[[principals]]\nid="person:fixture"\nkind="person"\nname="Fixture author"',
                 '[[sites]]\nid="site:frames"\npublisher="person:fixture"\ndefault_author="person:fixture"\ndeployable=false',
                 '[[brands]]\nid="brand:frames"\nname="Neutral fixture"',
                 '[[brands.publications]]\nsite="site:frames"\npublic_base_url="https://example.test/mount/"\nauthored=[{source="source:content",target="authored",static_assets={route_prefix="/assets/frames/"}}]']
        for identity, root in [("source:content", content), ("source:base", base)]:
            parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
        parts += ['[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"', '[composition.resources]']
        for identity, output, use in [("stylesheet:base-tokens", "base.css", "site"), ("stylesheet:physics", "physics.css", "site"), *SHELL_RESOURCES, ("module:frames", "frames.js", "dependency"), ("module:frame-specimen", "frame-specimen.js", "dependency")]:
            parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}')
        source = "\n".join(parts)
        (work / "workspace.toml").write_text(source)
        stages = work / "stages"
        stages.mkdir()
        run(args.gazette, ["check", "--stdin", "--acquire-composition", "site:frames", "--compile-templates"], source)
        result = run(args.gazette, ["render-site", "--local", "--site", "site:frames", "--output-parent", str(stages)], source)
        output = Path(result["directory"])
        document = next(output.rglob("index.html")).read_text()
        assert 'data-gazette-component="frame-specimen"' in document
        assert "Static specimen:" in document
        assert len(re.findall(r"<h1(?:\s|>)", document)) == 1
        for letter in "abc":
            emitted = list(output.rglob(f"frame-{letter}.png"))
            assert len(emitted) == 1
            assert emitted[0].read_bytes() == (content / f"frame-{letter}.png").read_bytes()
        modules = {path.name: path.read_text() for path in output.rglob("*.js")}
        assert "createFrameSource" in modules["frames.js"]
        assert "createFrameSource" in modules["frame-specimen.js"]
        assert re.search(r"from\s*['\"]https://example\.test/mount/assets/frames\.js['\"]", modules["frame-specimen.js"])
        decoded = html.unescape(document)
        assert '"@base/frames":"https://example.test/mount/assets/frames.js"' in decoded
        assert "frame-specimen.js" in decoded
        for letter in "abc":
            assert f'href="https://example.test/mount/assets/frames/frame-{letter}.png"' in decoded
        specimen = (content / "index.md").read_text()
        plain = specimen.split(":::frame-specimen")[0] + "\nA complete static page.\n"
        (content / "index.md").write_text(plain)
        unselected = "\n".join(line for line in source.splitlines() if not line.startswith(('"module:frames"=', '"module:frame-specimen"=')))
        ordinary = run(args.gazette, ["render-site", "--local", "--site", "site:frames", "--output-parent", str(stages)], unselected)
        assert not list(Path(ordinary["directory"]).rglob("frames.js")), "ordinary pages must not acquire the optional utility"
        (content / "index.md").write_text(specimen)
        print("PASS: native optional module/dependency import; three byte-identical images; static text, links and still; one H1; no module on unselected page")
        print("NOT RUN: browser decoding, input, motion states and visual quality")
        if args.keep:
            print("interactive specimen output:", output)
    finally:
        if args.keep:
            print("fixture retained:", work)
        else:
            shutil.rmtree(work)


if __name__ == "__main__":
    main()
