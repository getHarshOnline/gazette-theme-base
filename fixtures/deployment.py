#!/usr/bin/env python3
"""Render a neutral missing-page surface and its browser manifest through Gazette."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
import tomllib
from urllib.parse import urlsplit

from reading import SHELL_RESOURCES, BASE, CHROME, SEARCH_COPY, Document, nodes, run, text
from feeds import page


COPY = {
    "base:not-found-title": "Page not found",
    "base:not-found-description": "There is no page at this address. Choose where to go next.",
    "base:not-found-home": "Go to the home page",
    "base:not-found-search": "Search this publication",
}


def check_output(output, base_url, has_search, copy, has_home=True):
    document = (output / "404.html").read_text()
    tree = Document(document).root
    elements = list(nodes(tree))
    main = next(node for node in elements if node["tag"] == "main")
    headings = [node for node in nodes(main) if node["tag"] == "h1"]
    assert len(headings) == 1 and text(headings[0]) == copy["base:not-found-title"]
    assert "hidden" not in headings[0]["attrs"] and "page-accessible-title" not in headings[0]["attrs"].get("class", "")
    assert any(node["attrs"].get("data-page-mode") == "utility" for node in elements)
    assert any(node["attrs"].get("name") == "robots" and node["attrs"].get("content") == "noindex" for node in elements)
    assert not any(node["attrs"].get("rel") == "canonical" for node in elements)
    assert not any(node["attrs"].get("type") == "application/ld+json" for node in elements)
    assert not any(node["tag"] == "article" or node["attrs"].get("property") == "article:author" for node in elements)
    assert not any("data-analytics-binding" in node["attrs"] or "data-analytics-consent" in node["attrs"] for node in elements)
    expected = {copy["base:not-found-home"]: base_url} if has_home else {}
    if has_search:
        expected[copy["base:not-found-search"]] = base_url + "find/"
    actions = {text(node).strip(): node["attrs"]["href"] for node in nodes(main) if node["tag"] == "a"}
    assert actions == expected, actions
    for url in actions.values():
        assert url.startswith(base_url)
        path = url[len(base_url):]
        assert (output / path / "index.html").is_file(), url
    assert any(node["attrs"].get("href") == "#main" for node in elements)
    assert main["attrs"].get("tabindex") == "-1"
    assert any(node["attrs"].get("data-tenant") == "settings" for node in elements)
    assert {node["attrs"].get("value") for node in elements if node["attrs"].get("name") == "color-mode"} == {"light", "dark", "system"}
    assert "localStorage" in document, "preferences must restore before painting"
    scripts = [node["attrs"].get("src", "") for node in elements if node["tag"] == "script"]
    assert any(url.endswith("/shell.js") for url in scripts)
    assert not any(url.endswith("/analytics-consent.js") for url in scripts)
    styles = [node["attrs"]["href"] for node in elements if node["attrs"].get("rel") == "stylesheet"]
    assert any(url.endswith("/base.css") for url in styles)
    assert any(url.endswith("/physics.css") for url in styles)
    for url in [*styles, *(url for url in scripts if url)]:
        path = urlsplit(url).path.removeprefix(urlsplit(base_url).path)
        assert (output / path).is_file(), url
    manifests = [node["attrs"]["href"] for node in elements if node["attrs"].get("rel") == "manifest"]
    assert manifests == [base_url + "manifest.webmanifest"], manifests
    manifest = json.loads((output / "manifest.webmanifest").read_text())
    assert manifest["name"] == "Neutral publication"
    assert manifest["start_url"] == base_url and manifest["scope"] == base_url
    for name in ["index.html", "graph/index.html"]:
        assert 'rel="manifest"' in (output / name).read_text(), name
    assert (output / "robots.txt").read_text() == "User-agent: *\nAllow: /\n\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="base-deployment-"))
    try:
        content = work / "content"
        content.mkdir()
        (content / "home.md").write_text(page("page:home", "Neutral home", "/", "index"))
        (content / "search.md").write_text(page("page:search", "Find a page", "/find/", "index"))
        existing = tomllib.loads(CHROME)["composition"]["chrome"]["regions"]
        copy = {key: existing.get(key, value) for key, value in COPY.items()}
        chrome = CHROME + "\n" + "\n".join(f'{json.dumps(key)}={json.dumps(value)}' for key, value in COPY.items() if key not in existing)
        for has_home, has_search in [(True, False), (True, True), (False, False)]:
            name = "search" if has_search else "home-only" if has_home else "no-recovery"
            base_url = "https://example.test/mount/"
            stages = work / name
            stages.mkdir()
            selected_chrome = chrome + ('\n' + '\n'.join(f'{json.dumps(key)}={json.dumps(value)}' for key, value in SEARCH_COPY.items()) if has_search else '')
            parts = ['[composition]\ntheme={package="theme:base"}\nnavigation=[{label="Home",destination="page:home"}]', selected_chrome,
                     '[[principals]]\nid="person:writer"\nkind="person"\nname="A Writer"',
                     '[[sites]]\nid="site:feeds"\npublisher="person:writer"\ndeployable=false',
                     '[[brands]]\nid="brand:feeds"\nname="Neutral publication"',
                     '[[brands.publications]]\nsite="site:feeds"\nhome="page:home"\npublic_base_url=' + json.dumps(base_url) + '\nauthored=[{source="source:content",target="authored"}]' + ('\nsearch_page="page:search"' if has_search else ''),
                     '[brands.publications.machine]\nweb_manifest={enabled=true}\nrobots={enabled=true,rules=[{user_agent="*",allow=["/"]}]}' + ('\nsearch="english"' if has_search else '')]
            for identity, root in [("source:content", content), ("source:base", BASE)]:
                parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
            parts += ['[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"', '[composition.resources]']
            for identity, filename, use in [("stylesheet:base-tokens", "base.css", "site"), ("stylesheet:physics", "physics.css", "site"), *SHELL_RESOURCES]:
                parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{filename}",use="{use}"}}')
            source = "\n".join(parts)
            if not has_home:
                source = source.replace('navigation=[{label="Home",destination="page:home"}]', 'navigation=[]').replace('home="page:home"\n', '')
            (work / f"{name}.toml").write_text(source)
            result = run(args.gazette, ["render-site", "--local", "--site", "site:feeds", "--graph-output", "graph/index.html", "--output-parent", str(stages)], source)
            output = Path(result["directory"])
            check_output(output, base_url, has_search, copy, has_home)
            if args.keep:
                print(f"{name}: {output}")
        print("PASS: native 404 output; visible title and configured home/search only; shared settings/resources; no article identity or analytics; manifest discovery and crawler file")
        print("HTTP status and host fallback handling are checked by Gazette's HTTP and deployment tests.")
    finally:
        if args.keep:
            print(f"fixture retained: {work}")
        else:
            shutil.rmtree(work)


if __name__ == "__main__":
    main()
