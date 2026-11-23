#!/usr/bin/env python3
"""Verify emitted discovery links through the real Base templates and Gazette binary."""
import argparse
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import socket
import tempfile
from xml.etree import ElementTree as XML

from reading import SHELL_RESOURCES, BASE, CHROME, run


def free_port():
    """Name an unused loopback port for a local review address; nothing listens on it."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class Links(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.head = []
        self.links = []
        self.in_footer = False
        self.current = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "footer":
            self.in_footer = True
        if tag == "link" and attrs.get("rel") == "alternate":
            self.head.append(attrs)
        if tag == "a":
            self.current = {**attrs, "text": "", "in_footer": self.in_footer}

    def handle_data(self, text):
        if self.current is not None:
            self.current["text"] += text

    def handle_endtag(self, tag):
        if tag == "footer":
            self.in_footer = False
        if tag == "a" and self.current is not None:
            self.links.append(self.current)
            self.current = None


def page(identity, title, route, family, lifecycle="published", published="2026-09-08"):
    publication_date = f'published={json.dumps(published)}' if published else ''
    return f'''+++
[content]
id={json.dumps(identity)}
site="site:feeds"
title={json.dumps(title)}
description="An authored channel description."
lifecycle="{lifecycle}"
modified="2026-09-09T12:00:00Z"
{publication_date}
attributions=[{{principal="person:writer",role="author"}}]
route={{path="{route}"}}
structure={{kind="page",family={{kind="{family}"}}}}
+++
# {title}

A complete authored account.
'''


def check_payload(path, format, base, title, eligible):
    """Check the reader-facing formats, independently of the render model."""
    atom = "{http://www.w3.org/2005/Atom}"
    source = path.read_text()
    if format == "json":
        feed = json.loads(source)
        assert feed["version"] == "https://jsonfeed.org/version/1.1"
        assert feed["title"] == title
        assert feed["feed_url"] == base + "updates/json"
        entries = feed["items"]
    else:
        feed = XML.fromstring(source)
        if format == "atom":
            assert feed.tag == atom + "feed"
            assert feed.findtext(atom + "title") == title
            assert feed.findtext(atom + "updated") == "2026-09-09T12:00:00Z"
            entries = feed.findall(atom + "entry")
        else:
            assert feed.tag == "rss" and feed.attrib["version"] == "2.0"
            channel = feed.find("channel")
            assert channel.findtext("title") == title
            assert channel.findtext("description") == "An authored channel description."
            entries = channel.findall("item")
    assert len(entries) == int(eligible), (path, len(entries))
    if not eligible:
        return
    entry = entries[0]
    if format == "json":
        identity, url, item_title = entry["id"], entry["url"], entry["title"]
        body = entry["content_html"]
        assert "A complete authored account." in entry["content_text"]
        assert entry["date_published"] == "2026-09-08T10:00:00Z"
        assert entry["date_modified"] == "2026-09-09T12:00:00Z"
        assert [author["name"] for author in entry["authors"]] == ["A Writer"]
    elif format == "atom":
        identity, item_title = entry.findtext(atom + "id"), entry.findtext(atom + "title")
        links = [link.attrib["href"] for link in entry.findall(atom + "link") if link.attrib.get("rel", "alternate") == "alternate"]
        assert links == [base + "article/"]
        url = links[0]
        body = entry.findtext(atom + "content")
        assert entry.find(atom + "content").attrib["type"] == "html"
        assert entry.findtext(atom + "published") == "2026-09-08T10:00:00Z"
        assert entry.findtext(atom + "updated") == "2026-09-09T12:00:00Z"
        assert [author.findtext(atom + "name") for author in entry.findall(atom + "author")] == ["A Writer"]
    else:
        identity, url, item_title = entry.findtext("guid"), entry.findtext("link"), entry.findtext("title")
        body = entry.findtext("description")
        assert parsedate_to_datetime(entry.findtext("pubDate")).isoformat() == "2026-09-08T10:00:00+00:00"
        assert entry.findtext("{http://purl.org/dc/elements/1.1/}creator") == "A Writer"
        assert entry.find("author") is None, "a named author is not an invented email address"
    assert url == base + "article/" and item_title == "An article"
    assert identity == "https://identity.example/#content=article%3Aone"
    assert "<p>A complete authored account.</p>" in body
    assert "Draft article" not in source and "Undated article" not in source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="base-feeds-"))
    try:
        content = work / "content"
        content.mkdir()
        stages = work / "stages"
        stages.mkdir()
        title = 'Updates <&> "quoted"'
        (content / "home.md").write_text(page("page:home", title, "/", "index"))
        (content / "other.md").write_text(page("page:other", "Another channel", "/other/", "index"))
        chrome = CHROME + '\n"base:feed-atom"="Atom"\n"base:feed-rss"="RSS"\n"base:feed-json"="JSON Feed"\n'
        chrome += '\n"base:discovery-sitemap"="Sitemap"\n"base:discovery-llms"="llms.txt"\n'
        cases = [
            ("disabled", False, True, False),
            ("omitted", True, True, False),
            ("empty", True, False, False),
            ("eligible", True, True, True),
            ("multiple", True, True, True),
            ("unlabelled", True, True, True),
        ]
        for name, configured, omit, eligible in cases:
            (content / "article.md").write_text(page("article:one", "An article", "/article/", "article", "published" if eligible else "draft", published="2026-09-08T10:00:00Z"))
            (content / "draft.md").write_text(page("article:draft", "Draft article", "/draft/", "article", "draft"))
            (content / "undated.md").write_text(page("article:undated", "Undated article", "/undated/", "article", published=None))
            base = f"http://127.0.0.1:{free_port()}/review/" if name == "multiple" else "https://example.test/mount/"
            parts = ['[composition]\ntheme={package="theme:base"}\nnavigation=[{label="Home",destination="page:home"}]', CHROME if name == "unlabelled" else chrome,
                     '[[principals]]\nid="person:writer"\nkind="person"\nname="A Writer"',
                     '[[sites]]\nid="site:feeds"\npublisher="person:writer"\ndeployable=false',
                     '[[brands]]\nid="brand:feeds"\nname="Neutral publication"',
                     f'[[brands.publications]]\nsite="site:feeds"\npublic_base_url={json.dumps(base)}\nauthored=[{{source="source:content",target="authored"}}]']
            if name != "disabled":
                parts.append('[brands.publications.machine]\nsitemap=true\nmarkdown_alternates={enabled=true,directory_page="index.md",file_page="append-md",media_type="text/markdown",discovery_rel="alternate"}\nllms={enabled=true,description_from="page:home",representation="markdown-alternate",include_human_link=true,sections=[{title="Start",contents=["page:home"]}]}')
            if configured:
                channels = [f'{{id="feed:{fmt}",channel="page:home",path="/updates/{fmt}",format="{fmt}"}}' for fmt in ["atom", "rss", "json"]]
                if name == "multiple":
                    channels.append('{id="feed:other",channel="page:other",path="/other-updates.xml",format="rss"}')
                parts.append('[brands.publications.machine.feeds]\nidentity_base="https://identity.example/"\nselection={kind="articles",residence="all",lifecycle=["published"],require_published_date=true}\nomit_when_empty=' + str(omit).lower() + '\nchannels=[' + ','.join(channels) + ']')
            for identity, root in [("source:content", content), ("source:base", BASE)]:
                parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
            parts += ['[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"', '[composition.resources]']
            for identity, filename, use in [("stylesheet:base-tokens", "base.css", "site"), ("stylesheet:physics", "physics.css", "site"), *SHELL_RESOURCES]:
                parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{filename}",use="{use}"}}')
            result = run(args.gazette, ["render-site", "--local", "--site", "site:feeds", "--output-parent", str(stages)], "\n".join(parts))
            output = Path(result["directory"])
            emitted = name not in ["disabled", "omitted"]
            if emitted:
                for format in ["atom", "rss", "json"]:
                    check_payload(output / "updates" / format, format, base, title, eligible)
                if name == "multiple":
                    check_payload(output / "other-updates.xml", "rss", base, "Another channel", eligible)
            for filename in ["index.html", "article/index.html"]:
                source = (output / filename).read_text()
                parsed = Links(source)
                feed_types = {"application/atom+xml", "application/rss+xml", "application/feed+json"}
                head_feeds = [link for link in parsed.head if link.get("type") in feed_types]
                footer = [link for link in parsed.links if link["in_footer"] and link.get("rel") == "alternate" and link.get("type") in feed_types]
                count = (4 if name == "multiple" else 3) if emitted else 0
                assert len(head_feeds) == count, (name, filename, head_feeds)
                assert len(footer) == (0 if name == "unlabelled" else count), (name, filename, footer)
                machine_links = [link for link in parsed.links if link["in_footer"] and link.get("type") in ["application/xml", "text/plain"]]
                expected = {} if name in ["disabled", "unlabelled"] else {"Sitemap": base + "sitemap.xml", "llms.txt": base + "llms.txt"}
                assert {link["text"]: link["href"] for link in machine_links} == expected, (name, machine_links)
                assert len(machine_links) == len(expected), "duplicate machine entrypoint"
                assert all((output / link["href"].removeprefix(base)).is_file() for link in machine_links), "footer advertises missing output"
                urls = [link["href"] for link in head_feeds]
                assert len(set(urls)) == count, "head duplicates a feed"
                if name != "unlabelled":
                    assert {link["href"] for link in footer} == set(urls), "head/footer output disagreement"
                assert all(link["href"].startswith(base) for link in head_feeds + footer)
                assert all((output / link["href"].removeprefix(base)).is_file() for link in head_feeds)
                if emitted:
                    assert {link["type"] for link in head_feeds} == {"application/atom+xml", "application/rss+xml", "application/feed+json"}
                    assert head_feeds[0]["title"] == title, "authored title altered or escaping broken"
                    assert '<&> "quoted"' not in source, "unescaped authored attribute"
                    labels = [link["text"] for link in footer]
                    assert set(labels) == ({f"{title} · Atom", f"{title} · RSS", f"{title} · JSON Feed", "Another channel · RSS"} if name == "multiple" else (set() if name == "unlabelled" else {"Atom", "RSS", "JSON Feed"})), labels
                else:
                    assert not (output / "updates").exists(), "omitted output acquired a placeholder"
        print("PASS: native Atom/RSS/JSON payloads, published dated selection excluding draft and undated articles, exact bodies/authors/dates/identities; Base head/footer MIME and output links; absent/omitted/retained-empty feeds, mounted/local bases, title escaping, multi-channel labels, Sitemap/llms links and missing-label omission")
        print("NOT RUN: live feed readers, deployed URLs or browser visual verification")
    finally:
        shutil.rmtree(work)


if __name__ == "__main__":
    main()
