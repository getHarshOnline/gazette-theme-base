#!/usr/bin/env python3
"""Extend a retained neutral reading fixture and check real native link markup.

First run reading.py --keep, then pass its retained fixture directory here.
This runner copies that fixture, changes only neutral authored inputs, and renders
through the supplied native engine. It does not execute or visually certify CSS.
"""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib


class Links(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.current = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current = {"attrs": dict(attrs), "attribute_names": [name for name, _ in attrs], "text": ""}
            self.links.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self.current = None


def run(binary, source, *args):
    result = subprocess.run([binary, *args], input=source, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    original = args.fixture.resolve(strict=True)
    assert (original / "workspace.toml").is_file(), "requires reading.py's retained fixture"
    work = Path(tempfile.mkdtemp(prefix="base-resolved-links-"))
    try:
        shutil.copytree(original, work, dirs_exist_ok=True, ignore=shutil.ignore_patterns("stages"))
        # Keep the neutral fixture's added specimen adapters, but consume current Base code.
        base = Path(__file__).resolve().parents[1]
        for tree in ["templates", "styles", "scripts"]:
            shutil.copytree(base / tree, work / "base" / tree, dirs_exist_ok=True)
        source = (work / "workspace.toml").read_text()
        # Retained fixtures may name /var while callers supply /private/var on macOS.
        # Rebind declared roots by filesystem identity, not textual path spelling.
        for binding in tomllib.loads(source)["sources"]:
            root = binding["location"].get("root")
            if root is None:
                continue
            canonical = Path(root).resolve(strict=True)
            if canonical.is_relative_to(original):
                replacement = str(work / canonical.relative_to(original))
                source = source.replace(json.dumps(root), json.dumps(replacement))
        footer_entry = '{label="Foreign footer",destination="article:foreign"}'
        source, footer_count = re.subn(r'(?m)^footer\s*=\s*\[(.*)\]$', lambda match: 'footer=[' + match[1] + ',' + footer_entry + ']', source, count=1)
        if not footer_count:
            source = source.replace('[composition]\n', '[composition]\nfooter=[' + footer_entry + ']\n', 1)
        endpoint = '{label="Blog",destination="page:blog"}]'
        assert endpoint in source
        source = source.replace(endpoint, '{label="Blog",destination="page:blog"},{label="About",destination="page:about"},{label="Guide",destination="page:documentation"},{label="Foreign navigation",destination="article:foreign"}]', 1)
        principal = 'id="person:two"\nkind="person"\nname="Writer Two"'
        assert principal in source
        writer_two = next(item for item in tomllib.loads(source)["principals"] if item["id"] == "person:two")
        if "website" in writer_two:
            assert writer_two["website"] == {"kind": "site", "site": "site:foreign"}
        else:
            source = source.replace(principal, principal+'\nwebsite={kind="site",site="site:foreign"}', 1)
        (work / "workspace.toml").write_text(source)
        # Only neutral fixture content is changed. Its destinations are configured native inputs.
        first = next(work.glob("*/first/index.md"))
        about = first.parent.parent / "about"
        about.mkdir()
        about.joinpath("index.md").write_text('+++\ntemplate="base/about.html"\n[content]\nid="page:about"\nsite="site:reading"\ntitle="About this publication"\nlifecycle="draft"\nlanguage="en"\nroute={path="/about/"}\nstructure={kind="page",family={kind="utility"}}\n+++\n# About this publication\n\nThe purpose and its qualification remain together.\n')
        first_source = first.read_text().replace('route = { path = "/first/" }', 'route = { path = "/first/", aliases = ["/first-legacy/"] }', 1)
        first_source = first_source.replace('projects=[', 'projects=[{project="project:resources",kind="about"},', 1)
        first.write_text(first_source+"\n[Foreign body reference](https://foreign.example.test/reference/).\n\n[External body reference](https://outside.example.test/).\n")
        # Use the native ecosystem selector, not a template-made cross-site item.
        # Both a card-owned description and the crossing explanation must survive.
        foreign = work / "foreign" / "reference.md"
        foreign.write_text(foreign.read_text().replace('+++\n', '+++\nprojects=[{project="project:resources",kind="mentions"}]\n', 1).replace('[content]\n', '[content]\ndescription="A foreign account with its own description."\n', 1))
        mentions = first.parent.parent / "resource-mentions/index.md"
        mentions.write_text(mentions.read_text().replace('+++\n', '+++\ntemplate="base/fixture-controls/collection-directory.html"\n', 1))
        undated = first.parent.parent / "unnamed/index.md"
        undated.write_text(undated.read_text().replace('+++\n', '+++\nprojects=[{project="project:resources",kind="mentions"}]\n', 1))
        guide = first.parent.parent / "documentation/index.md"
        guide.write_text(guide.read_text().replace('[content]\n', '[content]\npublished="2026-09-09"\nmodified="2026-09-10T18:30:00.125+05:30"\n', 1))
        undated_guide = first.parent.parent / "undated-guide"
        undated_guide.mkdir()
        undated_guide.joinpath("index.md").write_text('+++\n[content]\nid="page:undated-guide"\nsite="site:reading"\ntitle="Undated guide"\nlifecycle="draft"\nlanguage="en"\nroute={path="/undated-guide/"}\nstructure={kind="page",family={kind="documentation"}}\n+++\n# Undated guide\n\nIts source supplies no dates or authors.\n')
        notes = first.with_name("notes.md")
        notes.write_text(notes.read_text()+"\n[Foreign notes reference](https://foreign.example.test/reference/).\n\n[External notes reference](https://outside.example.test/).\n")
        citation = first.parent.parent / "citation/index.md"
        citation.write_text(citation.read_text().replace('pdf="reference.pdf"', 'pdf="https://outside.example.test/reference.pdf"', 1))
        (work / "stages").mkdir()
        result = run(args.gazette, source, "render-site", "--local", "--site", "site:reading", "--model-output", "model.json", "--graph-output", "graph/index.html", "--output-parent", str(work / "stages"))
        repeated = run(args.gazette, source, "render-site", "--local", "--site", "site:reading", "--model-output", "model.json", "--graph-output", "graph/index.html")
        assert result["inventory"]["identity"] == repeated["inventory"]["identity"]
        output = Path(result["directory"])
        model = json.loads((output / "model.json").read_text())
        first_html = (output / "first/index.html").read_text()
        anchors = Links(first_html).links
        folder_html = (output / "resource-mentions/index.html").read_text()
        cards = [link for link in Links(folder_html).links if "folder-card" in link["attrs"].get("class", "").split()]
        items = model["pages"]["page:resource-mentions"]["listing"]["items"]
        assert len(cards) == len(items) and len(cards) >= 3
        by_identity = {card["attrs"]["data-gazette-destination-content"]: card for card in cards}
        assert {"article:first", "article:foreign", "article:unnamed"} <= set(by_identity)
        for index, item in enumerate(items, 1):
            card = by_identity[item["id"]]
            attrs = card["attrs"]
            has_artwork = bool(item.get("artwork"))
            assert ("folder-card--text" in attrs["class"].split()) == (not has_artwork)
            assert ("data-folder-card" in attrs) == has_artwork
            assert attrs["href"] == item["url"]
            assert attrs["data-gazette-destination-kind"] == item["destination"]["kind"]
            assert attrs["data-gazette-destination-site"] == item["site"]
            assert attrs["data-gazette-destination-theme"] == item["destination"]["presentation"]["theme"]
            assert card["attribute_names"].count("aria-describedby") <= 1
            descriptions = attrs.get("aria-describedby", "").split()
            if item.get("description"):
                assert f"folder-description-{index}" in descriptions
            else:
                assert not any(value.startswith("folder-description-") for value in descriptions)
            if item["destination"]["kind"] == "cross-site":
                assert "crossing-description" in descriptions
        assert by_identity["article:foreign"]["attrs"]["data-gazette-destination-kind"] == "cross-site"
        assert "aria-describedby" not in by_identity["article:unnamed"]["attrs"]
        guide_html = (output / "reference/index.html").read_text()
        from reading import Document, nodes, text
        for path, label in [("blog", "Blog"), ("about", "About"), ("resource-mentions", "Specimen mentions"), ("home", None), ("first", None), ("reference", None)]:
            document = list(nodes(Document((output / path / "index.html").read_text()).root))
            main = next(node for node in document if node["tag"] == "main")
            brand = next(node for node in document if "frame__brand" in node["attrs"].get("class", "").split())
            assert main["attrs"].get("data-section-title") == label
            assert len([node for node in document if node["tag"] == "h1"]) == 1
            if label:
                assert brand["tag"] == "h1" and text(brand) == label
                assert "href" not in brand["attrs"] and "tabindex" not in brand["attrs"]
                assert not any(node["tag"] == "h1" for node in nodes(main)), "section H1 belongs to the masthead, not a hidden body duplicate"
            else:
                assert brand["tag"] == "a", "Home, article and guide keep publication identity"
        for path, title, fragment, retained in [
            ("about", "About this publication", "about-this-publication", "The purpose and its qualification remain together."),
        ]:
            markup = (output / path / "index.html").read_text()
            assert f'<title>{title}</title>' in markup
            assert f'id="{fragment}"' in markup, "the moved opening keeps its original fragment"
            assert retained in markup, "removing the repeated heading must retain the complete opening remainder"
        assert '<time datetime="2026-09-09">9 September 2026</time>' in guide_html
        assert '<time datetime="2026-09-10T18:30:00.125+05:30">10 September 2026</time>' in guide_html
        assert 'class="reading-date"' not in (output / "undated-guide/index.html").read_text()
        assert 'class="reading-byline"' not in guide_html, "a configured default author does not invent a guide attribution"

        def find(label):
            values = [link["attrs"] for link in anchors if link["text"].strip() == label]
            assert values, f"missing actual rendered link: {label}"
            return values

        def crossing(label):
            for attrs in find(label):
                assert attrs["data-gazette-destination-kind"] == "cross-site"
                assert attrs["data-gazette-destination-theme"] == "theme:base"
                assert "crossing-description" in attrs.get("aria-describedby", "").split()

        for label in ["Foreign navigation", "Foreign footer", "Writer Two", "A foreign question <and> context"]:
            crossing(label)
        for attrs in find("Writer One & Co"):
            assert attrs["data-gazette-destination-kind"] == "external"
            assert {"author", "external"} <= set(attrs["rel"].split())
            assert "external-description" in attrs["aria-describedby"].split()
        for label, kind in [("Foreign body reference", "cross-site"), ("Foreign notes reference", "cross-site"), ("External body reference", "external"), ("External notes reference", "external")]:
            for attrs in find(label):
                assert attrs["data-gazette-destination-kind"] == kind
        # The native compiled markup supplies these cues before any browser script executes.
        assert 'id="crossing-description"' in first_html and 'id="external-description"' in first_html
        assert all("crossing-link" not in link["attrs"].get("class", "").split() for link in anchors)
        native_structured = [link for link in anchors if link["attrs"].get("data-gazette-destination-kind") == "internal-native"]
        assert native_structured and all(link["attrs"].get("data-gazette-destination-site") == "site:reading" for link in native_structured if "data-gazette-destination-site" in link["attrs"])
        credits = model["pages"]["article:first"]["attributions"]
        writer = next(item for item in credits if item["principal"]["id"] == "person:two")
        assert writer["website"]["destination"]["kind"] == "cross-site"
        assert writer["website"]["destination"]["site"] == "site:foreign"
        graph_links = Links((output / "graph/index.html").read_text()).links
        graph_crossings = [link["attrs"] for link in graph_links if link["attrs"].get("data-gazette-destination-kind") == "cross-site"]
        assert any(attrs.get("id", "").startswith("connection-related-target:") for attrs in graph_crossings)
        assert all("crossing-description" in attrs.get("aria-describedby", "").split() for attrs in graph_crossings), "native graph crossings must carry their description without JavaScript"
        citation_model = model["pages"]["article:citation"]["citation"]
        citation_links = Links((output / "citation/index.html").read_text()).links
        for field, expected in [("bibtex", "resource"), ("pdf", "external")]:
            candidates = [link["attrs"] for link in citation_links if link["attrs"].get("href") == citation_model[field]]
            assert len(candidates) == 1
            assert citation_model[field+"_destination"]["kind"] == expected
            assert candidates[0]["data-gazette-destination-kind"] == expected
            if expected == "external":
                assert "external-description" in candidates[0]["aria-describedby"].split()
        alias = Links((output / "first-legacy/index.html").read_text()).links
        assert len(alias) == 1 and alias[0]["attrs"]["href"] == model["pages"]["article:first"]["route"]["canonical_url"]
        assert alias[0]["attrs"]["data-gazette-destination-kind"] == "internal-native"
        assert alias[0]["attrs"]["data-gazette-destination-content"] == "article:first"
        print("PASS: native ecosystem folder destinations preserve site/theme and one combined description attribute, including absent descriptions; guide dates preserve supplied precision and honest absence")
        print("PASS: native body/Notes, author websites, nav/footer, related, graph descriptions, citation downloads and alias destinations preserve resolved facts; repeat inventory stable")
        print("native output:", output)
    finally:
        if args.keep:
            print("fixture retained:", work)
        else:
            shutil.rmtree(work)


if __name__ == "__main__":
    main()
