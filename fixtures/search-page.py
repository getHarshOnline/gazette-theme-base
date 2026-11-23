#!/usr/bin/env python3
"""Exercise the active Search page using the neutral reading fixture's capture."""
import argparse
import html
import json
from pathlib import Path
import re
import shutil
import subprocess

from reading import BASE, SEARCH_COPY, page, run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    capture = subprocess.run(
        ["python3", str(BASE / "fixtures/reading.py"), "--gazette", args.gazette, "--keep"],
        text=True, capture_output=True,
    )
    if capture.returncode:
        raise RuntimeError(capture.stdout + capture.stderr)
    work = Path(re.search(r"fixture retained: (.+)", capture.stdout)[1])
    try:
        source = (work / "workspace.toml").read_text()
        source = source.replace('home="page:home"', 'home="page:home"\nsearch_page="page:search"', 1)
        source = source.replace('listings=[', 'listings=[{content="page:search",select={kind="all-pages"},order={first=[],remaining="title-then-id"},pagination={page_size=15,next_pages="page/{number}/"}},', 1)
        source = source.replace('[composition.chrome.regions]', '[composition.chrome.regions]\n' + '\n'.join(
            f"{json.dumps(key)} = {json.dumps(value)}" for key, value in SEARCH_COPY.items()), 1)
        search = work / "content/search"
        search.mkdir()
        search.joinpath("index.md").write_text(page(
            "page:search", "Search", "/find/", '{kind="page",family={kind="index"}}'
        ).rsplit("+++\n", 1)[0] + "+++\n")
        source_file = work / "search-workspace.toml"
        source_file.write_text(source)
        result = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--output-parent", str(work / "stages")], source)
        output = Path(result["directory"])
        records = json.loads((output / "search.json").read_text())
        assert all(record["content"]["id"] != "page:search" for record in records)
        expected = {record["route"]["url"] for record in records}
        found = []
        documents = sorted((output / "find").rglob("index.html"))
        for path in documents:
            markup = path.read_text()
            assert 'class="search-page"' in markup and 'data-search-page-size="15"' in markup
            assert 'data-search-kind="Type"' in markup
            assert 'data-search-written="Written"' in markup
            assert 'data-search-date-format="%-d %B %Y"' in markup
            assert 'data-search-date-months="January|February|March|April|May|June|July|August|September|October|November|December"' in markup
            assert 'data-search-date-months-short="Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"' in markup
            assert markup.count('class="search-page__pagination"') == 1
            # The status row holds the status, its hidden Retry for an unavailable index, then the pagination.
            assert re.search(r'<div class="search-page__summary">\s*<p[^>]+role="status"[^>]*>.*?</p>\s*<button type="button" class="[^"]*search-page__retry" data-search-retry hidden>[^<]+</button>\s*<nav class="search-page__pagination"', markup, re.S)
            assert re.search(r'<input type="search" name="q"[^>]*></label>\s*<button[^>]*>[^<]*</button>\s*<p class="search-page__query-message" id="search-page-query-message" hidden></p>', markup)
            assert 'class="search-page__fallback"' in markup
            assert 'shell__search-page shell__search-trigger' in markup
            assert 'data-tenant="search"' not in markup
            page_titles = re.findall(r'<h1\b([^>]*)>([^<]*)</h1>', markup)
            document_title = re.search(r'<title>(.*?)</title>', markup, re.S)[1]
            assert len(page_titles) == 1 and page_titles[0][1] == "Search"
            assert 'class="frame__brand"' in page_titles[0][0] and "href=" not in page_titles[0][0]
            assert document_title.startswith("Search"), "pagination retains its own document metadata"
            assert 'data-section-title="Search"' in markup
            assert '<h1 class="frame__brand">Search</h1>' in markup
            # Every card has one title; metadata may add independent author links.
            titles = re.findall(r'<h2 class="reading-list__title"><a href="([^"]+)"', markup)
            found.extend(html.unescape(value) for value in titles)
            assert 0 < len(titles) <= 15
        assert len(found) == len(set(found)) and set(found) == expected
        assert len(documents) == (len(expected) + 14) // 15
        repeated = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--output-parent", str(work / "stages")], source)
        assert result["inventory"]["identity"] == repeated["inventory"]["identity"]
        print(f"PASS: active Search macro; {len(expected)} native records across {len(documents)} complete no-script pages; one unlinked masthead H1, no duplicate command tenant; deterministic output")
        print("Search output:", output)
    finally:
        if args.keep:
            print("fixture retained:", work)
        else:
            shutil.rmtree(work)


if __name__ == "__main__":
    main()
