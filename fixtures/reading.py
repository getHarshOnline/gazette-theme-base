#!/usr/bin/env python3
"""Render neutral reading cases through a supplied Gazette release.

Usage: python3 fixtures/reading.py --gazette /path/to/gazette [--theme /path/to/world] [--resource-bindings FILE] [--footer-treatment PATTERN=TREATMENT] [--preview-port PORT] [--keep]
Creates only temporary inputs/output; --keep retains them for browser inspection.
A world's own fixture supplies world-specific expectations and re-renders the
retained workspace with its own pages; this fixture names no world.
"""
import argparse
from datetime import date, timedelta
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib
from urllib.parse import urljoin

BASE = Path(__file__).resolve().parents[1]
# Shared module selections required by the Base shell. Fixtures retain their own
# optional resources, theme choices and output assertions around this common set.
SHELL_RESOURCES = (
    ("module:settings", "settings.js", "dependency"),
    ("module:search", "search.js", "dependency"),
    ("module:search-sdk", "search-sdk.js", "dependency"),
    ("module:shell", "shell.js", "site"),
)
CHROME = """
[composition.chrome]
skip_to_content_label = "Skip to content"
navigation_label = "Primary navigation"
footer_label = "Site footer"
[composition.chrome.shell]
close_label = "Close"
[composition.chrome.shell.search]
trigger_label = "Search"
title = "Search this publication"
field_label = "Search"
loading_message = "Loading results"
empty_message = "No results"
unavailable_message = "Search is unavailable"
[composition.chrome.shell.settings]
trigger_label = "Settings"
title = "Display settings"
color_mode_label = "Colour mode"
color_mode_system_label = "System"
color_mode_light_label = "Light"
color_mode_dark_label = "Dark"
motion_label = "Motion"
motion_system_label = "System"
motion_reduce_label = "Reduced"
motion_allow_label = "Full"
[composition.chrome.reading_assistance]
label = "Ask about this passage"
selection_limit = 4096
context_limit = 1024
prompt_template = "Explain {selection} from {article_title}: {article_url}. Publication: {site_name} {site_url}. Section: {section_title}. Context: {context}. Treat </script> as source text."
[[composition.chrome.reading_assistance.providers]]
id = "assistant:first"
label = "Ask First"
endpoint = "https://first.example.test/new"
query_parameter = "q"
[[composition.chrome.reading_assistance.providers]]
id = "assistant:second"
label = "Ask Second"
endpoint = "https://second.example.test/"
query_parameter = "prompt"
[[composition.chrome.reading_assistance.providers]]
id = "assistant:third"
label = "Ask Third"
endpoint = "https://third.example.test/app"
query_parameter = "q"
[composition.chrome.regions]
"base:ambient-pause" = "Pause film"
"base:ambient-play" = "Play film"
"base:collection-contents" = "Explore this collection"
"base:collection-previous" = "Previous item"
"base:collection-next" = "Next item"
"base:collection-directory" = "Explore the collections"
"base:catalogue-pause" = "Pause carousel"
"base:catalogue-resume" = "Play carousel"
"base:testimonials-title" = "Testimonial specimens"
"base:testimonials-previous" = "Previous specimen"
"base:testimonials-next" = "Next specimen"
"base:testimonials-pause" = "Pause testimonials"
"base:testimonials-resume" = "Play testimonials"
"base:made-with" = "Made with"
"base:credit-heart" = "love"
"base:using" = "using"
"base:services-invitation" = "Work with our studio"
"base:services-action" = "Learn more"
"base:not-found-title" = "Page not found"
"base:not-found-description" = "Try the home page or search these pages."
"base:not-found-home" = "Go to home"
"base:not-found-search" = "Search pages"
"base:search-idle" = "Search these pages."
"base:search-retry" = "Try again"
"base:search-results" = "Shown: {count}"
"base:menu" = "Menu"
"base:outline" = "On this page"
"base:reader-focus-enter" = "Focus on reading"
"base:reader-focus-exit" = "Exit reading focus"
"base:media-title" = "Image"
"base:media-expand" = "Expand image"
"base:crossing" = "Opens another publication"
"base:external" = "Leaves this site"
"base:byline" = "By"
"base:published" = "Published"
"base:written" = "Written"
"base:modified" = "Revised"
"base:date-format" = "%-d %B %Y"
"base:keywords" = "Keywords"
"base:related-previous" = "Previous related article"
"base:related-next" = "Next related article"
"base:reading-context" = "Reading context"
"base:reading-return" = "Go back to"
"base:sequence-contents" = "Explore this sequence"
"base:browse" = "Browse"
"base:reading-sequence" = "Reading sequence"
"base:sequence-overview" = "Sequence overview"
"base:reading-collection" = "In this collection"
"base:collection-overview" = "Collection overview"
"base:previous" = "Previous page"
"base:next" = "Next page"
"base:pagination" = "Page navigation"
"base:sort-order" = "Sort by date"
"base:sort-latest" = "Latest"
"base:listing-latest" = "Latest"
"base:listing-read-more" = "Read more"
"base:sort-oldest" = "Oldest"
"base:list-previous" = "Previous"
"base:list-next" = "Next"
"base:list-page" = "Page"
"base:product-resources" = "Explore this product"
"base:product-learn" = "Learn"
"base:product-github" = "GitHub"
"base:product-mentions" = "Mentions"
"base:product-code-documentation" = "Docs"
"base:product-learn-description" = "Use-case guide and practical applications"
"base:product-github-description" = "Source and development"
"base:product-mentions-description" = "Blogs and thoughts mentioning this product"
"base:product-code-documentation-description" = "Code documentation and API reference"
"base:product-learn-unavailable" = "No public use-case guide is available."
"base:product-github-unavailable" = "No GitHub destination is available."
"base:product-mentions-unavailable" = "No mentions index is available."
"base:product-code-documentation-unavailable" = "Code documentation is not available."
"base:listing-subject" = "Articles about"
"base:listing-empty" = "No related articles yet."
"base:listing-subject-all" = "Mentions of"
"base:listing-empty-all" = "No writing mentions “{product}” yet. Explore more from {publication} in the meantime. More is on the way."
"base:listing-empty-explore" = "Explore more"
"base:notes" = "Notes"
"base:related" = "Continue exploring"
"base:article-projects" = "Projects in this article"
"base:project-subject" = "About"
"base:project-mentions" = "Also discussed"
"base:markdown" = "Read as Markdown"
"base:citation" = "Cite this article"
"base:citation-bibtex" = "BibTeX"
"base:citation-pdf" = "PDF"
"base:graph-title" = "Explore connections"
"base:graph-description" = "Explore collections, follow a reading sequence, or continue from one question to another."
"base:graph-groups" = "Collections and reading sequences"
"base:graph-parent" = "Part of"
"base:graph-nested" = "Nested groups"
"base:graph-members" = "Pages in this collection"
"base:graph-steps" = "Reading order"
"base:graph-elsewhere" = "Across publications"
"base:graph-related" = "Related reading"
"base:graph-other" = "Other pages"
"base:graph-unrouted" = "Reference without a public address"
"base:contact" = "Email"
"base:correspondence" = "Formal correspondence"
"""



SEARCH_COPY = {
    "base:search-kind": "Type", "base:search-author": "Author",
    "base:search-published": "Published", "base:search-modified": "Updated",
    "base:search-language": "Language", "base:search-about": "About",
    "base:search-mentions": "Mentions", "base:search-query-limit": "Shorten the search",
    "base:search-results-count": "{count} results", "base:search-page-status": "Page {page} of {pages}",
    "base:search-result-count": "{count} result", "base:search-keyword": "Keyword", "base:search-clear": "Back to all pages",
    "base:search-any": "All", "base:search-more-context": "More context",
    "base:search-view-page": "View page",
    "base:search-field": "Matching pages",
    "base:search-refine": "Refine results", "base:search-classification": "Topic",
    "base:search-sort": "Sort results", "base:search-relevance": "Relevance",
}
SEARCH_COPY.update({f"base:search-kind-{kind}": label for kind, label in {
    "article": "Article", "documentation": "Documentation", "project": "Project",
    "index": "Index", "utility": "Utility", "extension": "Page",
    "collection": "Collection", "journey": "Reading sequence",
}.items()})

def page(identity, title, route, structure, attribution="", description=None):
    return f"""+++
[content]
id = "{identity}"
site = "site:reading"
title = {json.dumps(title)}
{f'description = {json.dumps(description)}' if description is not None else ''}
lifecycle = "draft"
language = "en"
{f'route = {{ path = {json.dumps(route)} }}' if route else ''}
structure = {structure}
{attribution}
+++
# {title}

A question carried through its declared context.
"""


def run(binary, args, source):
    result = subprocess.run([binary, *args], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{' '.join(args)}: {result.stderr.strip()}")
    return json.loads(result.stdout)



def native_links(source):
    """Read native link semantics independently of attribute order/whitespace."""
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.items = []
            self.current = None
        def handle_starttag(self, tag, attributes):
            if tag == "a":
                self.current = dict(attributes)
                self.current["text"] = ""
                self.items.append(self.current)
        def handle_data(self, value):
            if self.current is not None:
                self.current["text"] += value
        def handle_endtag(self, tag):
            if tag == "a":
                self.current = None
    parser = Links()
    parser.feed(source)
    return parser.items


def region(text, class_name, tag="nav"):
    found = re.search(rf'<{tag} class="{class_name}(?: [^"]*)?"[^>]*>(.*?)</{tag}>', text, re.S)
    if not found:
        return ""
    start = text.index('>', found.start()) + 1
    depth = 1
    for closing in re.finditer(rf'</?{tag}\b[^>]*>', text[start:]):
        depth += -1 if closing.group().startswith('</') else 1
        if depth == 0:
            return html.unescape(text[start:start + closing.start()])
    raise AssertionError(f"Unclosed {tag}.{class_name}")


class Document(HTMLParser):
    void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, source):
        super().__init__()
        self.root = {"tag": "document", "attrs": {}, "children": []}
        self.stack = [self.root]
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in self.void:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1]["children"].append(data)

def nodes(node):
    yield node
    for child in node["children"]:
        if isinstance(child, dict):
            yield from nodes(child)

def text(node):
    return "".join(text(child) if isinstance(child, dict) else child for child in node["children"])


def verify_project_anatomy(output, base_url, namespace="base", model=None, graph="", footer_treatments=None):
    """Check the reader's native document, without executing enhancement scripts."""
    first_html = (output / "first/index.html").read_text()
    selected_document = Document(first_html).root
    selected_actions = [node for node in nodes(selected_document) if "data-selection-assistance" in node["attrs"]]
    assert len(selected_actions) == 1, "one shared selection owner on a reading page"
    selected_actions = selected_actions[0]
    assert "hidden" in selected_actions["attrs"] and selected_actions["attrs"]["popover"] == "manual"
    assert selected_actions["attrs"]["data-article-url"] == model["pages"]["article:first"]["route"]["canonical_url"]
    assert selected_actions["attrs"]["data-site-url"] == model["pages"]["article:first"]["site"]["metadata"]["home"]["url"]
    selected_links = [node for node in nodes(selected_actions) if node["tag"] == "a"]
    assert len(selected_links) == 3 and all(node["attrs"].get("target") == "_blank" for node in selected_links)
    assert all({"noopener", "noreferrer"} <= set(node["attrs"].get("rel", "").split()) for node in selected_links)
    payload = next(node for node in nodes(selected_actions) if "data-selection-configuration" in node["attrs"])
    selected_configuration = json.loads(text(payload))
    assert "</script>" in selected_configuration["prompt_template"], "JSON transport preserves source text without ending its data block"
    assert "data-selection-assistance" not in (output / "home/index.html").read_text(), "an unrelated landing has no reading popup"
    assert "data-selection-assistance" not in graph, "the graph remains a navigation surface"
    for slug in ("first", "middle", "nested", "sequence", "reference"):
        surface = (output / slug / "index.html").read_text()
        surface_nodes = list(nodes(Document(surface).root))
        assert any(node["tag"] == "main" and "data-selection-scope" in node["attrs"] for node in surface_nodes), slug
        assert len([node for node in surface_nodes if "data-selection-assistance" in node["attrs"]]) == 1, f"one assistance owner for {slug}"

    project = Document((output / "project-anatomy/index.html").read_text()).root
    directory = Document((output / "directory-anatomy/index.html").read_text()).root
    headings = [node for node in nodes(project) if node["tag"] == "h1"]
    assert len(headings) == 1 and text(headings[0]) == "An illustrative project"
    directory_titles = [node for node in nodes(directory) if node["tag"] == "h1"]
    assert len(directory_titles) == 1 and text(directory_titles[0]) == "Illustrative project directory"
    assert directory_titles[0]["attrs"].get("class") != "page-accessible-title", "catalogue title is visible to every reader"
    assert any(node["tag"] == "title" and text(node) == "Illustrative project directory" for node in nodes(directory))
    main = next(node for node in nodes(project) if node["tag"] == "main")
    source_order = ["An illustrative project", "A question with its limits", "Source is not public yet.",
                    "Product image; reserved, not a product screenshot", "Walkthrough; reserved for a future recording",
                    "Development", "Continue with the question", "Questions about the specimen"]
    positions = [text(main).index(value) for value in source_order]
    assert positions == sorted(positions), "overview, evidence limits, lifecycle, onward reading and FAQ retain source order"
    assert "Work is paused. No operating service is available" in text(main)
    figures = [node for node in nodes(main) if node["tag"] == "figure"]
    assert len(figures) == 3
    for figure, qualification in zip(figures[:2], ["contains no operational evidence", "not testimony from a real participant"]):
        caption = next(node for node in nodes(figure) if node["tag"] == "figcaption")
        assert qualification in text(caption), "a placeholder's limit is visible caption text"
        image_roles = [node for node in nodes(figure) if node["attrs"].get("role") == "img"]
        assert len(image_roles) == 1 and image_roles[0]["attrs"]["aria-label"] == text(image_roles[0])
        assert not any(node["tag"] in ("img", "video") for node in nodes(figure)), "reserved slots do not impersonate authored media"
    faq = next(node for node in nodes(main) if node["attrs"].get("itemtype") == "https://schema.org/FAQPage")
    questions = [node for node in nodes(faq) if node["attrs"].get("itemtype") == "https://schema.org/Question"]
    assert len(questions) == 2
    expected = [('Does "illustrative" mean a released service?', "The example is hypothetical"),
                ("Who decides whether the evidence is enough?", "The responsible reader retains that decision.")]
    for question, (name, answer_text) in zip(questions, expected):
        assert question["tag"] == "details" and question["attrs"]["itemprop"] == "mainEntity"
        summary = next(child for child in question["children"] if isinstance(child, dict))
        assert summary["tag"] == "summary" and summary["attrs"]["itemprop"] == "name" and text(summary) == name
        answer = next(node for node in nodes(question) if node["attrs"].get("itemtype") == "https://schema.org/Answer")
        assert answer["attrs"]["itemprop"] == "acceptedAnswer" and answer_text in text(answer)
        assert any(node["tag"] == "p" for node in nodes(answer)), "Markdown answer is present in the unexecuted document"
        assert not any("hidden" in node["attrs"] or "inert" in node["attrs"] for node in nodes(question))
    links = {node["attrs"].get("href") for node in nodes(main) if node["tag"] == "a"}
    assert {urljoin(base_url, "/reference/"), urljoin(base_url, "/first/")} <= links
    unavailable = [node for node in nodes(main) if node["tag"] == "button" and text(node) == "Source"]
    assert len(unavailable) == 1 and "disabled" in unavailable[0]["attrs"]
    assert unavailable[0]["attrs"].get("aria-label") == "Source: No public source is available."
    assert not any(node["tag"] == "a" and text(node) == "Source" for node in nodes(main)), "unavailable source is visible without inventing a destination"
    assert "project-media--walkthrough" in figures[1]["attrs"].get("class", ""), "a recording keeps its own semantic media role"
    recording = figures[2]
    video = next(node for node in nodes(recording) if node["tag"] == "video")
    assert {"controls", "playsinline"} <= video["attrs"].keys()
    assert video["attrs"]["preload"] == "metadata" and "autoplay" not in video["attrs"]
    assert video["attrs"]["src"] == "/media/specimen.webm" and video["attrs"]["poster"] == "/media/specimen.png"
    track = next(node for node in nodes(video) if node["tag"] == "track")
    assert track["attrs"]["kind"] == "captions" and track["attrs"]["srclang"] == "en"
    assert track["attrs"]["src"] == "/media/specimen.vtt"
    assert "default" not in track["attrs"], "captions remain available without forcing their initial selection"
    assert any(node["tag"] == "a" and node["attrs"].get("href") == "/transcripts/specimen/" and text(node) == "Read the specimen transcript" for node in nodes(recording))
    directory_main = next(node for node in nodes(directory) if node["tag"] == "main")
    assert text(directory_main).index("different purposes") < text(directory_main).index("Choose a starting point")
    assert any(node["tag"] == "a" and node["attrs"].get("href") == urljoin(base_url, "/project-anatomy/") for node in nodes(directory_main))
    print("PASS: neutral project has one H1; directory retains metadata without redundant heading, resolved destinations, ordered limits and lifecycle, honest media captions, and complete native FAQ disclosures with Question/Answer schema")
    for pattern, page_mode in [("product", "product"), ("product-listing", "index"), ("services", "decision")]:
        for variant in ("populated", "minimal"):
            slug = f"canonical-{pattern}-{variant}"
            source = (output / slug / "index.html").read_text()
            document = Document(source).root
            root = next(node for node in nodes(document) if node["tag"] == "html")
            assert root["attrs"]["data-page-mode"] == page_mode
            expected_footer = (footer_treatments or {}).get(pattern, "colophon" if pattern in ("product", "services") else "quiet")
            assert root["attrs"]["data-footer-treatment"] == expected_footer
            main = next(node for node in nodes(document) if node["tag"] == "main")
            page_titles = [node for node in nodes(document) if node["tag"] == "h1"]
            assert len(page_titles) == 1, slug
            if pattern == "product-listing":
                expected_title = "Project directory specimen" if variant == "populated" else "Minimal directory specimen"
                assert text(page_titles[0]) == expected_title
                assert page_titles[0]["attrs"].get("class") != "page-accessible-title"
                assert "frame__brand" in page_titles[0]["attrs"].get("class", "").split()
                assert not any(node["tag"] == "h1" for node in nodes(main))
                assert any(node["tag"] == "title" and text(node) == expected_title for node in nodes(document))
                assert any(node["tag"] == "meta" and node["attrs"].get("property") == "og:title" and node["attrs"].get("content") == expected_title for node in nodes(document)), "catalogue metadata survives without a redundant heading"
            else:
                assert len([node for node in nodes(main) if node["tag"] == "h1"]) == 1
            bodies = [node for node in nodes(main) if f"publication-body--{pattern}" in node["attrs"].get("class", "").split()]
            assert len(bodies) == 1, f"{slug} must actually use its selected composition"
            body = bodies[0]
            assert not any(node["tag"] == "form" for node in nodes(body)), "native account must not invent a transaction"
            inputs = [node for node in nodes(body) if node["tag"] == "input"]
            if pattern == "product" and variant == "populated":
                feature_sets = [node for node in nodes(body) if "feature-set" in node["attrs"].get("class", "").split()]
                assert len(feature_sets) == 1
                explanations = [node for node in nodes(body) if any(name in node["attrs"].get("class", "").split() for name in ("project-explanation", "process-section"))]
                assert len(explanations) == 2, "capabilities and ordered work share one explanation anatomy"
                assert any(node["tag"] == "h2" and text(node) == "Capabilities in the account" for node in nodes(explanations[0]))
                paths = [node for node in nodes(explanations[1]) if "process-path__steps" in node["attrs"].get("class", "").split()]
                assert len(paths) == 1
                introductions = [node for node in explanations[1]["children"] if isinstance(node, dict) and "process-introduction" in node["attrs"].get("class", "").split()]
                assert len(introductions) == 1 and any(node["tag"] == "h2" for node in nodes(introductions[0])), "the process introduction is a direct sibling of its ordered steps"
                process_children = [node for node in explanations[1]["children"] if isinstance(node, dict)]
                assert "project-walkthrough" in process_children[0]["attrs"].get("class", "").split(), "the walkthrough precedes the paired introduction and steps in native reading order"
                stages = [node for node in paths[0]["children"] if isinstance(node, dict)]
                assert len(stages) == 2 and all(node["tag"] == "li" for node in stages), "a process list contains stages, never its account heading or prose"
                assert any(node["tag"] == "h2" and text(node) == "Follow the supplied stages" for node in nodes(explanations[1]))
                feature_set = feature_sets[0]
                features = [node for node in feature_set["children"] if isinstance(node, dict) and "feature" in node["attrs"].get("class", "").split()]
                assert len(features) == 3, "complementary capabilities retain distinct, direct feature bodies"
                headings = [node for node in nodes(feature_set) if node["tag"] in ("h2", "h3")]
                assert [(node["tag"], text(node)) for node in headings] == [("h3", "Keep the question explicit"), ("h3", "Preserve the supplied context"), ("h3", "Follow the explanation")]
                assert text(feature_set).index("Each explanation retains") < text(feature_set).index("Keep the question explicit")
                assert any(node["tag"] == "strong" for node in nodes(features[0]))
                assert any(node["tag"] == "code" and text(node) == "reference" for node in nodes(features[1]))
                assert "A second paragraph" in text(features[1])
                assert any(node["tag"] == "a" and node["attrs"].get("href") == urljoin(base_url, "/reference/") for node in nodes(features[2]))
                assert not any(node["tag"] in ("input", "button", "details") for node in nodes(feature_set)), "capability explanations do not invent controls"
                assert len(inputs) == 2 and all(node["attrs"].get("type") == "radio" and node["attrs"].get("name") == "neutral-proposal" for node in inputs)
                assert sum("checked" in node["attrs"] for node in inputs) == 1
                proposals = [node for node in nodes(body) if "work-proposal" in node["attrs"].get("class", "").split()]
                assert len(proposals) == 1
                decision = next(node for node in nodes(proposals[0]) if "work-proposal__decision" in node["attrs"].get("class", "").split())
                assert "authorised reviewer" in text(decision)
                assert all("authorised reviewer" not in text(node) for node in nodes(proposals[0]) if "view__panel" in node["attrs"].get("class", "").split()), "the unchanged decision remains outside either evidence view"
            else:
                assert not inputs, "absent authored comparisons must not invent controls"
            decks = [node for node in nodes(body) if "quote-deck" in node["attrs"].get("class", "").split()]
            if variant == "populated" and pattern in ("product", "services"):
                assert len(decks) == 1 and decks[0]["attrs"].get("aria-label") == "Testimonial specimens"
                cards = [node for node in nodes(decks[0]) if "quote-deck__card" in node["attrs"].get("class", "").split()]
                assert len(cards) == 3 and all("not an endorsement" in text(card) for card in cards)
                assert text(body).index("Testimonial specimens") < text(body).index("Questions about the specimen")
                assert "quote-deck.js" in source, "shared deck behavior is selected from native Content"
            else:
                assert not decks, "an absent authored testimonial deck remains absent"
            questions = [node for node in nodes(body) if node["attrs"].get("itemtype") == "https://schema.org/Question"]
            figures = [node for node in nodes(body) if node["tag"] == "figure"]
            if variant == "minimal":
                assert "This complete minimal account" in text(body)
                assert not questions and not figures
                assert not any(node["tag"] in ("a", "details") for node in nodes(body)), "absent optional actions and FAQ must stay absent"
                assert not any(node["attrs"].get("role") == "img" for node in nodes(body))
                continue
            assert len(questions) == 1
            question = questions[0]
            assert question["tag"] == "details"
            assert any(node["tag"] == "summary" and text(node) == "What does this specimen establish?" for node in nodes(question))
            answer = next(node for node in nodes(question) if node["attrs"].get("itemtype") == "https://schema.org/Answer")
            assert "Only its supplied account." in text(answer) and "measured outcome" in text(answer)
            assert any(node["tag"] == "strong" for node in nodes(answer)), "native Markdown survives in the answer"
            assert not any("hidden" in node["attrs"] or "inert" in node["attrs"] for node in nodes(question))
            captions = [node for node in nodes(body) if node["tag"] == "figcaption"]
            assert any("No screenshot or recording has been supplied." in text(node) for node in captions)
            assert text(body).index("Current limits") < text(body).index("Continue with the account") < text(body).index("Questions about the specimen")
            links = {node["attrs"].get("href") for node in nodes(body) if node["tag"] == "a"}
            assert {urljoin(base_url, "/reference/"), urljoin(base_url, "/first/")} <= links
            if pattern == "services":
                definitions = [node for node in nodes(body) if node["tag"] in ("dt", "dd")]
                assert [text(node).strip() for node in definitions] == ["Agreed question", "The requested account defines the period to inspect.", "Acceptance remains open", "A delivered account still requires the responsible reader's decision."]
                processes = [node for node in nodes(body) if "process-section" in node["attrs"].get("class", "").split()]
                assert len(processes) == 1 and "process-section--steps-end" in processes[0]["attrs"]["class"].split(), "the service account explicitly selects the inverse shared process composition"
                process_children = [node for node in processes[0]["children"] if isinstance(node, dict)]
                assert len(process_children) == 2 and "process-introduction" in process_children[0]["attrs"].get("class", "").split()
                assert process_children[1]["attrs"].get("data-gazette-component") == "process-path", "the grouped invitation precedes the adjacent engagement steps in native reading order"
                invitations = [node for node in nodes(process_children[0]) if "focus-reveal__content" in node["attrs"].get("class", "").split()]
                assert len(invitations) == 1
                invitation_children = [node for node in invitations[0]["children"] if isinstance(node, dict)]
                assert [node["tag"] for node in invitation_children] == ["h2", "p", "div"], "heading, compact explanation and contact action stay in one invitation"
                assert any(node["tag"] == "a" and node["attrs"].get("href") == "mailto:enquiry@example.test" for node in nodes(invitation_children[2]))
                stages = [node for node in nodes(process_children[1]) if "process-path__copy" in node["attrs"].get("class", "").split()]
                assert len(stages) == 2 and "A separate detailed paragraph" in text(stages[0]), "stage introduction and detail are not split into separate layout tracks"
                assert "Delivery does not establish acceptance." in text(body)
        print(f"PASS: {namespace}/{pattern} populated and minimal native landings preserve task, footer policy, purposeful headings, complete optional disclosure/caption/action content and honest absence")
    about_layout = Document((output / "about-choice-layout/index.html").read_text()).root
    choice_groups = [node for node in nodes(about_layout) if "about-choices" in node["attrs"].get("class", "").split()]
    assert len(choice_groups) == 2
    for group in choice_groups:
        owners = [child for child in group["children"] if isinstance(child, dict) and child["attrs"].get("data-gazette-component") == "about-choice"]
        assert len(owners) == 3, "each native choice remains in its own island owner"
        for owner in owners:
            cards = [node for node in nodes(owner) if "about-choice" in node["attrs"].get("class", "").split()]
            assert len(cards) == 1 and "hidden" not in cards[0]["attrs"] and "inert" not in cards[0]["attrs"]
            fallbacks = [child for child in owner["children"] if isinstance(child, dict) and "data-gazette-fallback" in child["attrs"]]
            mounts = [child for child in owner["children"] if isinstance(child, dict) and "data-gazette-mount" in child["attrs"]]
            assert len(fallbacks) == len(mounts) == 1 and not mounts[0]["children"]
            assert cards[0] in list(nodes(fallbacks[0])), "the card is inside fallback, not the empty mount slot"
    full_cards = [node for node in nodes(choice_groups[0]) if "about-choice--full" in node["attrs"].get("class", "").split()]
    assert len(full_cards) == 1 and "A complete row" in text(full_cards[0])
    print("PASS: native About choices retain two/three standard groups, explicit full-span card and complete no-script island fallback")
    resources = (output / "canonical-product-populated/index.html").read_text()
    resource_links = native_links(region(resources, "project-links project-resources"))
    assert [link["text"] for link in resource_links] == ["Docs", "Learn", "GitHub", "Mentions"]
    assert [link["href"] for link in resource_links] == ["https://docs.example.test/specimen/", base_url + "reference/", "https://source.example.test/specimen", base_url + "resource-mentions/"]
    assert [link["data-gazette-destination-kind"] for link in resource_links] == ["external", "internal-native", "external", "internal-native"]
    assert all("control--primary" in link["class"] for link in resource_links)
    assert "Use-case guide" in resource_links[1]["aria-label"] and "Code documentation" in resource_links[0]["aria-label"]
    partial = (output / "resource-actions-missing/index.html").read_text()
    partial_group = region(partial, "project-links project-resources")
    assert [link["text"] for link in native_links(partial_group)] == ["Learn"]
    assert partial_group.count("disabled") == 1 and "Mentions" in partial_group
    assert "GitHub" not in partial_group, "a missing repository contributes no action"
    mentions = (output / "resource-mentions/index.html").read_text()
    assert "Mentions of" in mentions and "No writing mentions “Resource specimen” yet." in mentions and "Reading fixture" in mentions
    assert "{product}" not in mentions and "{publication}" not in mentions
    assert not native_links(region(mentions, "reading-list", "ul")), "empty related lists never invent matches"
    explore = native_links(region(mentions, "listing-empty", "div"))
    assert len(explore) == 1 and explore[0]["text"] == "Explore more" and explore[0]["href"] == base_url + "blog/"
    assert 'class="listing-controls ' not in mentions
    print("PASS: four equal Docs/Learn/GitHub/Mentions actions, distinct docs, missing states and contextual empty Mentions with resolved exploration")


def verify(output, base_url="https://example.test/mount/", model=None, namespace="base", preferred_sources=False):
    def read(name):
        if name == "documentation":
            name = "reference"
        return (output / name / "index.html").read_text()
    first, middle, last = [read(name) for name in ("first", "middle", "last")]
    preferred_class = 'preferred-source-link'
    assert (preferred_class in first) == preferred_sources, "preferred-source presence must match the configured page policy"
    if preferred_sources:
        assert first.count(preferred_class) == 1
        sidebar = next(node for node in nodes(Document(first).root) if node["attrs"].get("class") == "reading-sidebar")
        action = next(node for node in nodes(sidebar) if node["tag"] == "a" and preferred_class in node["attrs"].get("class", "").split())
        assert action["attrs"]["href"] == "https://www.google.com/preferences/source?q=example.test"
        assert "control--quiet" in action["attrs"]["class"].split()
        # The explanation is a description every reader receives, not a hover-only title.
        assert "title" not in action["attrs"]
        described = action["attrs"]["aria-describedby"].split()
        assert "preferred-source-description" in described
        description = next(node for node in nodes(sidebar) if node["attrs"].get("id") == "preferred-source-description")
        assert "hidden" in description["attrs"] and "".join(child for child in description["children"] if isinstance(child, str)) == "More from this publication."
        assert first.count('id="preferred-source-description"') == 1
        assert action["attrs"]["target"] == "_blank"
        assert {"external", "noopener", "noreferrer"} <= set(action["attrs"]["rel"].split())
        assert preferred_class not in middle + last + read("home")
        assert "publisher.js" not in first
    media_document = Document(first).root
    native_media = [node for node in nodes(media_document) if node["tag"] == "img" and node["attrs"].get("alt") == "A bounded neutral diagram"]
    media_data = [node for node in nodes(media_document) if node["tag"] == "script" and "data-media-images" in node["attrs"]]
    assert len(native_media) == len(media_data) == 1
    media_uses = json.loads("".join(child for child in media_data[0]["children"] if isinstance(child, str)))
    proof = next(item for item in media_uses if item["address"] == native_media[0]["attrs"].get("data-gazette-image"))
    assert proof["destination"] == native_media[0]["attrs"]["src"] and proof["alt"] == "A bounded neutral diagram"
    assert proof["width"] == 480 and proof["variants"]["light"] == proof["destination"]
    assert proof["variants"]["dark"].endswith("/first/diagram-dark.svg")
    note_media = [node for node in nodes(media_document) if node["tag"] == "img" and node["attrs"].get("alt") == "A note-level neutral diagram"]
    assert len(note_media) == 1 and note_media[0]["attrs"]["src"] == proof["destination"]
    note_proof = next(item for item in media_uses if item["address"] == note_media[0]["attrs"].get("data-gazette-image"))
    assert note_proof["address"] != proof["address"] and note_proof["alt"] == "A note-level neutral diagram"
    assert "media-inspection-control" not in first, "no-script images must not promise an unmounted viewer"
    caption_alt = "A circle inside a rectangular field"
    caption_text = "The circle remains inside the field; compare the source."
    captioned = [node for node in nodes(media_document) if node["tag"] == "figure" and any(
        child["tag"] == "img" and child["attrs"].get("alt") == caption_alt for child in nodes(node))]
    assert len(captioned) == 1, "the authored image has one native figure"
    captioned = captioned[0]
    captions = [node for node in nodes(captioned) if node["tag"] == "figcaption"]
    assert len(captions) == 1 and " ".join(text(captions[0]).split()) == caption_text
    assert any(node["tag"] == "strong" and text(node) == "inside" for node in nodes(captions[0])), "caption emphasis stays readable markup"
    assert any(node["tag"] == "a" and node["attrs"].get("href") == "https://evidence.example.test/figure" and text(node) == "source" for node in nodes(captions[0])), "caption evidence remains a working link"
    caption_image = next(node for node in nodes(captioned) if node["tag"] == "img")
    assert caption_image["attrs"]["alt"] == caption_alt and caption_image["attrs"]["title"] == "Containment diagram"
    assert any(node["tag"] == "a" and node["attrs"].get("href") == "https://evidence.example.test/original" and any(child is caption_image for child in nodes(node)) for node in nodes(captioned)), "the image keeps its independent navigation link"
    assert "The following paragraph is an independent qualification." not in text(captioned)
    assert "The following paragraph is an independent qualification." in text(media_document)
    blocks = [node for node in nodes(media_document) if "data-gazette-image-block" in node["attrs"]]
    assert any(any(child is caption_image for child in nodes(block)) for block in blocks), "a single linked image receives the standalone boundary"
    ordinary = next(node for node in nodes(media_document) if node["tag"] == "img" and node["attrs"].get("alt") == "An ordinary neutral diagram")
    assert any(any(child is ordinary for child in nodes(block)) for block in blocks)
    mixed = next(node for node in nodes(media_document) if node["tag"] == "img" and node["attrs"].get("alt") == "An inline neutral mark")
    assert not any(any(child is mixed for child in nodes(block)) for block in blocks), "mixed prose retains its inline image"
    assert any(node["tag"] == "p" and "Before the mark" in text(node) and "after the mark" in text(node) and any(child is mixed for child in nodes(node)) for node in nodes(media_document))
    structured = [json.loads(text(node)) for node in nodes(media_document) if node["tag"] == "script" and node["attrs"].get("type") == "application/ld+json"]
    def json_objects(value):
        if isinstance(value, dict):
            yield value
            for child in value.values():
                yield from json_objects(child)
        elif isinstance(value, list):
            for child in value:
                yield from json_objects(child)
    image_objects = [item for document in structured for item in json_objects(document) if item.get("@type") == "ImageObject"]
    caption_objects = [item for item in image_objects if item.get("description") == caption_alt]
    assert len(caption_objects) == 1
    assert " ".join(caption_objects[0]["caption"].split()) == caption_text
    assert caption_objects[0]["name"] == "Containment diagram"
    assert caption_objects[0]["contentUrl"] == caption_image["attrs"]["src"]
    inline_alt = "Two connected boxes carrying a signal"
    inline_caption = "The signal crosses one connection; the boxes remain distinct."
    inline_figures = [node for node in nodes(media_document) if node["tag"] == "figure" and any(
        child["tag"] == "img" and child["attrs"].get("alt") == inline_alt for child in nodes(node))]
    assert len(inline_figures) == 1
    inline_figure = inline_figures[0]
    inline_image = next(node for node in nodes(inline_figure) if node["tag"] == "img")
    assert "hidden" in inline_image["attrs"] and inline_image["attrs"]["title"] == "Signal path"
    replacements = [node for node in nodes(inline_figure) if node["attrs"].get("data-gazette-image-ref") == inline_image["attrs"]["data-gazette-image"]]
    assert len(replacements) == 1 and replacements[0]["attrs"].get("aria-label") == inline_alt
    assert any(node["tag"] == "svg" for node in nodes(replacements[0])), "the admitted drawing is native SVG, not only an external-image fallback"
    assert any(node["tag"] == "text" and text(node) == "Signal" for node in nodes(replacements[0])), "live SVG text survives figure validation"
    inline_captions = [node for node in nodes(inline_figure) if node["tag"] == "figcaption"]
    assert len(inline_captions) == 1 and " ".join(text(inline_captions[0]).split()) == inline_caption
    assert any(node["tag"] == "em" and text(node) == "one connection" for node in nodes(inline_captions[0]))
    inline_objects = [item for item in image_objects if item.get("description") == inline_alt]
    assert len(inline_objects) == 1 and " ".join(inline_objects[0]["caption"].split()) == inline_caption
    assert inline_objects[0]["name"] == "Signal path" and inline_objects[0]["contentUrl"] == inline_image["attrs"]["src"]
    for alt in ("An ordinary neutral diagram", "An inline neutral mark"):
        plain = [item for item in image_objects if item.get("description") == alt]
        assert len(plain) == 1 and "caption" not in plain[0], "alt and nearby prose never become invented captions"
    print("PASS: native linked figure and rich caption agree with ImageObject while ordinary and mixed inline images retain their meaning")
    def assert_navigation_identity(markup, expected):
        links = {link["href"]: link for link in native_links(markup)}
        for path, content_id in expected.items():
            link = links[base_url + path]
            assert link.get("data-gazette-destination-kind") == "internal-native"
            assert link.get("data-gazette-destination-site") == "site:reading"
            assert link.get("data-gazette-destination-content") == content_id
            assert link.get("data-gazette-destination-theme") == "theme:" + namespace, f"native structural destination lost its presentation identity: {path}"
    class Head(HTMLParser):
        def __init__(self, source):
            super().__init__()
            self.meta = {}
            self.feed(source.split('</head>', 1)[0])

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'meta':
                key = attrs.get('name', attrs.get('property'))
                if key == 'description' or key and key.startswith('og:'):
                    assert key not in self.meta, f'duplicate metadata: {key}'
                    self.meta[key] = attrs.get('content')

    metadata = Head(first).meta
    assert metadata['description'] == 'A "quoted" account <with> distinctions & context.'
    assert metadata['og:description'] == metadata['description']
    assert metadata['og:title'] == 'First question'
    assert metadata['og:type'] == 'article'
    assert metadata['og:url'] == base_url + 'first/'
    assert 'description' not in Head(middle).meta
    assert 'og:description' not in Head(middle).meta
    assert Head(read('product')).meta['og:type'] == 'website'
    cite = read("citation")
    assert 'reading-outline--local' in cite, 'citation alone must create the reading tools margin'
    assert 'reading-citation' in cite and 'Cite this article' in cite
    assert '<script>Plain text</script>' not in cite
    assert '&lt;script&gt;Plain text' in cite and '<script>Plain text</script>' in html.unescape(cite)
    assert 'Writer. An authored reference.' in cite
    assert 'reference.bib' in cite and 'reference.pdf' in cite
    assert 'reading-citation' not in middle, 'absence must not invent a citation'
    context = region(middle, "reading-context")
    assert "Questions" not in context, "primary menu destinations do not repeat in the breadcrumb"
    assert context.index("Root corpus") < context.index("Nested corpus")
    assert "Middle question" not in context, "the H1 already identifies this article"
    assert f'href="{base_url}sequence/"' in context, "breadcrumb retains the full native ancestor path independently of the local corpus"
    assert context.index("Root corpus") < context.index("Nested corpus") < context.index("Ordered questions")
    assert f'href="{base_url}root/"' in context
    assert f'href="{base_url}nested/"' in context
    assert "Home" not in context
    assert_navigation_identity(context, {"root/": "collection:root", "nested/": "collection:nested", "sequence/": "journey:questions"})
    assert "Writer One & Co" in region(first, "reading-byline", "div")
    assert '<time datetime="2026-09-10">10 September 2026</time>' in first
    assert '<time datetime="2026-09-12T18:30:00.125+05:30">12 September 2026</time>' in first
    assert middle.count('<time datetime="2026-09-11">') == 1
    assert 'class="reading-date"' not in last
    assert 'class="reading-credit"' not in read("unnamed")
    byline = region(first, "reading-byline", "div")
    assert byline.index("Writer One & Co") < byline.index("Writer Two")
    author_links = native_links(region(first, "reading-byline", "div"))
    assert any(link.get("href") == "https://writer.example.test/" and {"author", "external"} <= set(link.get("rel", "").split()) and link.get("data-gazette-destination-kind") == "external" for link in author_links)
    assert any(link.get("href") == "https://foreign.example.test/" and "author" in link.get("rel", "").split() and link.get("data-gazette-destination-kind") == "cross-site" and link.get("data-gazette-destination-theme") == "theme:" + namespace and "crossing-description" in link.get("aria-describedby", "").split() for link in author_links)

    assert "Publisher Person" not in byline and "Rights Organization" not in byline
    outline = region(first, "reading-outline", "aside")
    assert first.count('id="gazette-reading-outline"') == 1
    initial_header = region(first, "frame__header", "header")
    assert 'data-reading-initial' in initial_header
    assert any(link.get("href") == "#gazette-reading-outline" and link["text"] == "On this page" for link in native_links(initial_header)), "the compact header starts with a useful link to the one native outline"
    assert 'href="#the-question"' in outline and 'href="#the-answer"' in outline
    assert 'href="#a-detail"' in outline
    sections = region(outline, "reading-sections", "nav")
    assert 'href="#the-question"' in sections and 'href="#a-detail"' in sections
    assert 'aria-current=' not in sections, 'position is observed in the browser, not fabricated in static output'
    assert 'reading-chapters' not in sections
    assert 'A tangent' not in outline
    for markup, position in [(first, 1), (middle, 2), (last, 3)]:
        rail = region(markup, "reading-corpus", "aside")
        assert f'href="{base_url}sequence/"' in rail
        assert f'>{position} / 3</span>' in rail
        chapters = region(rail, "reading-chapters", "ol")
        assert chapters.count('<li>') == 3
        assert chapters.count('aria-current="page"') == 1
        assert f'<span aria-current="page">{["First question", "Middle question", "Last question"][position-1]}</span>' in chapters
        for index, slug in enumerate(['first', 'middle', 'last'], 1):
            assert (f'href="{base_url}{slug}/"' in chapters) == (index != position)
        links = native_links(chapters)
        previous = [link for link in links if "prev" in link.get("rel", "").split()]
        following = [link for link in links if "next" in link.get("rel", "").split()]
        slugs = ("first", "middle", "last")
        assert [link["href"] for link in previous] == ([base_url + slugs[position - 2] + "/"] if position > 1 else [])
        assert [link["href"] for link in following] == ([base_url + slugs[position] + "/"] if position < 3 else [])
        assert chapters.index("First question") < chapters.index("Middle question") < chapters.index("Last question")
        assert 'reading-sequence' not in markup, "the corpus owns the ordered journey; no duplicate closing navigation"
        assert markup.count('rel="prev"') == len(previous)
        assert markup.count('rel="next"') == len(following)
        chapter_ids = {slug + "/": "article:" + slug for slug in ("first", "middle", "last") if slug != ("first", "middle", "last")[position - 1]}
        assert_navigation_identity(rail, {"sequence/": "journey:questions", **chapter_ids})
    assert '<summary>On this page</summary>' not in region(middle, "reading-outline", "aside")
    short_outline = region(read("standalone"), "reading-outline", "aside")
    assert 'href="#one-question"' in short_outline and 'href="#its-detail"' in short_outline
    assert 'href="#a-local-detail"' in region(read("unnamed"), "reading-outline", "aside")
    local_rail = region(first, "reading-outline", "aside")
    assert "reading-sections" in local_rail and "reading-chapters" not in local_rail
    assert "reading-related" not in local_rail and "data-command-trigger=\"notes\"" not in local_rail
    assert first.index('class="reading-resources"') > first.index('class="publication-body"')
    assert '<details class="reading-resources"' not in first, 'onward reading is visible after the argument'
    assert "reading-sections" not in region(first, "reading-corpus", "aside")
    collection_reader = read("collection-reader")
    collection_rail = region(collection_reader, "reading-corpus", "aside")
    assert '<details class="reading-orientation__collection">' in collection_rail
    assert '<ul class="reading-siblings">' in collection_rail
    assert '<span aria-current="page">A question among others</span>' in collection_rail
    assert f'href="{base_url}collection-sibling/"' in collection_rail
    assert f'href="{base_url}sequence/"' in collection_rail
    assert f'href="{base_url}first/"' not in collection_rail, "nested journey is a destination, not flattened chapters"
    assert 'reading-orientation__position' not in collection_rail
    assert 'rel="next"' not in collection_rail
    assert 'On this page' not in collection_rail, "collection orientation also works without article headings"
    collection_context = region(collection_reader, "reading-context")
    assert f'href="{base_url}nested/"' in collection_context
    assert collection_context.index("Root corpus") < collection_context.index("Nested corpus")
    assert "A question among others" not in collection_context, "current title appears once as the H1"
    assert f'href="{base_url}root/"' in region(collection_reader, "reading-context")
    assert any(link.get("href") == base_url + "nested/" and link["text"] == "Collection overview" for link in native_links(collection_rail))
    collection_decks = [
        ("root", ["collection:nested"]),
        ("nested", ["article:collection-reader", "article:collection-sibling", "journey:questions"]),
        ("single-corpus", ["article:single-member"]),
    ]
    for slug, expected in collection_decks:
        source = read(slug)
        main = next(node for node in nodes(Document(source).root) if node["tag"] == "main")
        decks = [node for node in nodes(main) if "data-content-deck" in node["attrs"]]
        assert len(decks) == 1, (slug, "one native collection deck")
        assert decks[0]["attrs"].get("data-autoplay") == str(len(expected) > 3).lower(), (slug, "only larger collection decks autoplay")
        playback = next(node for node in nodes(decks[0]) if "data-quote-playback" in node["attrs"])
        assert playback["attrs"].get("data-pause-label") == "Pause carousel"
        assert playback["attrs"].get("data-resume-label") == "Play carousel"
        controls = next(node for node in nodes(decks[0]) if "carousel-controls" in node["attrs"].get("class", "").split())
        assert controls["tag"] == "nav" and controls["attrs"].get("aria-label") == "Explore this collection"
        control_children = [node for node in controls["children"] if isinstance(node, dict)]
        assert [node["tag"] for node in control_children] == ["div", "button", "output"], "all carousel controls use arrows, playback, position order"
        header = next(node for node in nodes(decks[0]) if "quote-deck__header" in node["attrs"].get("class", "").split())
        assert not any(node["tag"] == "button" for node in nodes(header)), "carousel heading contains no detached controls"
        cards = [node for node in nodes(decks[0]) if "quote-deck__card" in node["attrs"].get("class", "").split()]
        links = [next(node for node in nodes(card) if node["tag"] == "a") for card in cards]
        assert [link["attrs"].get("data-gazette-destination-content") for link in links] == expected, (slug, "native child ID order preserved")
        assert all(card["attrs"].get("data-deck-label") == text(next(node for node in nodes(card) if "folder-card__title" in node["attrs"].get("class", "").split())) for card in cards)
        assert not any(node["tag"] in ("blockquote", "figcaption", "time") for node in nodes(decks[0])), "collection entries are destinations, not testimony or bylines"
        assert source.index('class="publication-layout') < source.index('data-content-deck') < source.index('class="frame__footer'), "prose and native children preserve the intended sequence"
        assert 'class="services-closing"' not in source, "containers do not inherit a commercial closing from a footer link"
        assert not any("publication-index--collection" in node["attrs"].get("class", "") for node in nodes(main)), "no duplicated pre-prose child list"
    sequence_nodes = list(nodes(Document(read("sequence")).root))
    ordered_deck = next(node for node in sequence_nodes if node["tag"] == "ol" and "quote-deck__stage" in node["attrs"].get("class", "").split())
    sequence_deck = next(node for node in sequence_nodes if "data-content-deck" in node["attrs"])
    assert sequence_deck["attrs"].get("data-autoplay") == "false", "short nested journeys remain reader-paced"
    step_ids = [link["attrs"]["data-gazette-destination-content"] for link in nodes(ordered_deck) if link["tag"] == "a"]
    assert step_ids == ["article:first", "article:middle", "article:last"], "journey carousel retains the exact declared reading order"
    for slug in ["nested", "sequence", "collection-reader"]:
        header = region(read(slug), "reading-page-header", "header")
        assert "Go back to" in header and header.index('class="reading-context"') < header.index("<h1"), "the return trail is in the title header before its single H1"
    single = html.unescape(read("single-member"))
    assert '<details class="reading-orientation__collection">' not in single
    assert any(link.get("href") == base_url + "single-corpus/" and link["text"] == "A small corpus" for link in native_links(single))
    assert "A small corpus" in region(single, "reading-context"), "an immediate parent remains a genuine breadcrumb ancestor"
    assert "An only question" not in region(single, "reading-context")
    assert "Questions" not in region(single, "reading-context"), "primary menu already carries the root index"
    assert 'reading-chapters' not in read('standalone')
    assert 'reading-orientation' not in read("standalone")
    assert 'reading-orientation' not in read("documentation")
    assert 'id="publication-navigation"' in first and 'aria-controls="publication-navigation publication-tools"' in first
    assert 'frame__footer-nav' not in first
    footer = region(first, "frame__footer", "footer")
    assert any(link.get("href") == "mailto:hello@example.test" and link["text"] == "Email" and link.get("data-gazette-destination-kind") == "external" for link in native_links(footer))
    assert footer.count('href="mailto:') == 1
    assert 'Rights Organization' in footer and '©' in footer and 'Publisher Person' not in footer
    assert 'Made with' in footer and 'using' in footer and '>Generator</a>' in footer
    assert '>Generator</a>' not in region(first, 'frame__footer-supporting', 'ul')
    assert 'services-invitation' not in region(first, 'reading-outline', 'aside')
    reading_document = next(node for node in nodes(Document(first).root) if 'reading-document' in node['attrs'].get('class', '').split())
    margins = [node for node in nodes(reading_document) if 'reading-margin' in node['attrs'].get('class', '').split()]
    assert len(margins) == 1
    local_outline = next(node for node in margins[0]["children"] if isinstance(node, dict) and "reading-outline" in node["attrs"].get("class", "").split())
    notes_controls = [node for node in margins[0]["children"] if isinstance(node, dict) and node["attrs"].get("data-command-trigger") == "notes"]
    assert len(notes_controls) == 1, "one Notes action belongs beneath the outline rather than inside its controls"
    assert margins[0]["children"].index(local_outline) < margins[0]["children"].index(notes_controls[0])
    assert sum('services-invitation' in node['attrs'].get('class', '').split() for node in nodes(margins[0])) == 0
    assert sum('services-invitation' in node['attrs'].get('class', '').split() for node in nodes(reading_document)) == 0
    assert 'class="services-closing"' not in first, 'reading pages do not inherit a commercial closing from a footer link'
    assert first.index('class="reading-page-header"') < first.index('class="publication-body"'), 'the source order introduces the title before the article'
    assert 'reading-sidebar' in first, 'supporting information has one shared sidebar'
    assert 'class="services-closing"' not in read('home'), 'home does not acquire an automatic services panel'
    assert 'class="services-closing"' not in read('documentation'), 'the native services destination owns its actual funnel'

    assert 'records@example.test' not in footer and 'Formal correspondence' not in footer
    related = region(first, "reading-related")
    assert f'href="{base_url}standalone/"' in related
    assert 'Unnamed author' in related and 'href="#"' not in related
    assert f'href="{base_url}middle/"' not in related, 'sequence continuation appears once'
    middle_related = region(html.unescape(middle), "reading-related")
    middle_links = re.findall(r'<a\b(?=[^>]*class="reading-related__title")(?=[^>]*href="([^\"]+)")[^>]*>', middle_related)
    assert len(middle_links) == len(set(middle_links)), "related destinations are not duplicated"
    assert not {base_url + "first/", base_url + "last/", base_url + "middle/"} & set(middle_links), "journey neighbours and the current page do not repeat in related choices"
    if model is not None and "recommendations" in model["pages"]["article:middle"]:
        # The engine owns relevance/ranking; the theme removes visible continuation
        # neighbours without reordering or dropping the remaining native choices.
        middle_model = model["pages"]["article:middle"]
        neighbours = {membership[direction]["node"]["id"]
                      for membership in middle_model["journeys"]
                      for direction in ("previous", "next") if membership.get(direction)}
        expected_links = [item["route"]["url"] for item in middle_model["recommendations"]["items"]
                          if item["id"] not in neighbours]
        assert middle_links == expected_links, "rendered related choices preserve native recommendation order after continuation deduplication"
        assert {base_url + "collection-reader/", base_url + "collection-sibling/"} <= set(middle_links), "other relevant collection destinations remain available"
    else:
        assert 'reading-related' not in middle, "legacy authored-only neighbours do not create an empty related region"
    subject = region(first, "reading-subject", "div")
    assert 'About' in subject and 'Subject project' in subject
    header = region(first, "reading-page-header", "header")
    assert '<h1' in header and 'class="reading-context"' in header
    metadata_panel = region(first, "reading-metadata", "div")
    assert 'Subject project' in metadata_panel and 'class="reading-credit"' in metadata_panel
    assert first.index('class="reading-page-header"') < first.index('class="reading-metadata"'), 'title introduces the article before its supporting metadata'
    assert 'class="reading-navigation"' in first, 'standalone and nested readings share the same navigation track'
    assert '<h1' not in region(first, "publication-body"), 'the native opening is rendered once, not repeated in the article body'
    assert 'reading-projects' not in first, 'unlinked project metadata is not a second related-links strip'
    assert 'Mentioned project' not in metadata_panel, 'graph mentions remain metadata rather than invented reader destinations'
    classifications = region(first, "reading-classifications", "dl")
    assert '<dt>Subjects & methods</dt>' in classifications and 'Systems & records' in classifications
    assert '<dt>Contexts</dt>' in classifications and 'Systems & records' in classifications
    assert '<a ' not in classifications, 'classification labels do not establish term destinations'
    assert 'Subjects &amp; methods' in first
    standalone_html = read('standalone')
    standalone_without_related = re.sub(r'<nav class="reading-related(?: [^"]*)?"[^>]*>.*?</nav>', '', standalone_html, flags=re.S)
    assert 'reading-classifications' not in standalone_without_related, 'related classifications never become classifications of the reading page'
    related_panel = region(first, "reading-related discovery-explorer", "nav")
    assert 'reading-list__metadata' not in related_panel, 'related previews do not repeat authors or dates'
    for name in ("standalone", "unnamed", "home", "product"):
        markup = read(name)
        assert 'class="reading-byline"' not in markup, name
        if name in ("home", "product"):
            assert 'class="reading-context"' not in markup, name
        assert 'class="reading-sequence"' not in markup, name
    for name in ("first", "middle", "last", "standalone", "unnamed", "home", "product", "documentation"):
        assert len(re.findall(r'<h1(?:\s|>)', read(name))) == 1, name
    assert f'href="{base_url}blog/"' not in region(read("standalone"), "reading-context"), "a standalone article does not repeat its primary menu index"
    native_returns = model["pages"]["article:unnamed"]["browsing_locations"]
    assert [link["href"] for link in native_links(region(read("unnamed"), "reading-context"))] == [location["url"] for location in native_returns], "return links keep the native containing page rather than an assumed page number"
    assert 'reading-context__page' not in region(read("unnamed"), "reading-context")
    assert any(link.get("href") == base_url + "other/" and link["text"] == "Other articles" for link in native_links(region(read("unnamed"), "reading-context")))
    assert len(native_links(region(read("unnamed"), "reading-context"))) == 2
    assert 'aria-current="location">Blog' in read("standalone")
    assert 'aria-current="location">Questions' in first
    assert 'aria-current="page">Blog' not in read("standalone")
    assert 'aria-current="location"' not in read("documentation")
    assert '<details class="reading-notes" id="article-notes">' in first
    assert first.count('data-command-trigger="notes" aria-haspopup="dialog" hidden') == 1
    assert 'data-tenant="notes"' in first
    assert 'data-tenant="notes"' not in middle
    assert first.count('A separate tangent.') == 1, 'Notes has one canonical DOM body'
    tangent = region(first, "reading-notes__body", "div")
    assert f'href="{base_url}first/#the-question"' in tangent
    assert f'href="{base_url}first/#the-answer"' in tangent
    references = re.findall(r'<sup class="footnote-ref"><a href="#([^"]+)" id="([^"]+)"[^>]*>', first)
    assert len(references) == 2 and references[0][0] == references[1][0]
    assert references[0][1] != references[1][1], 'repeated references retain distinct return destinations'
    for definition, marker in references:
        assert f'<li id="{definition}">' in first
        assert f'href="#{marker}" class="footnote-backref"' in first
    assert 'Another paragraph retains its relationship to the same note.' in first
    product = read("product")
    landing_context = region(product, "reading-context")
    assert 'class="reading-context reading-context--landing"' not in product
    assert f'href="{base_url}directory/"' not in landing_context
    assert ">Questions</a>" not in landing_context
    assert 'aria-current="location">Questions' in product
    assert 'aria-current' not in landing_context, 'browsing return does not establish containment or current location'
    assert '<fieldset class="view-set view-set--text">' in product
    assert '<legend>Compare the accounts</legend>' in product
    assert product.count('name="accounts"') == 2
    class Radios(HTMLParser):
        def __init__(self):
            super().__init__()
            self.checked = []
            self.inputs = []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == "input" and attrs.get("type") == "radio":
                self.inputs.append(attrs)
                if "checked" in attrs:
                    self.checked.append(attrs.get("name"))

    radios = Radios()
    radios.feed(product)
    assert radios.checked.count("accounts") == 1
    assert 'aria-label="Before &amp; after"' in product
    assert 'The second account remains available without script.' in product
    assert '<fieldset class="view-set preview-set">' in product
    assert radios.checked.count("systems") == 1
    assert 'aria-label="Second system"' in product
    assert 'A second account and its own qualification.' in product
    assert 'preview-tabs.js' in product
    unlabelled = read("unlabelled-preview")
    unlabelled_body = model["pages"]["page:unlabelled-preview"]["body_html"]
    assert '<div class="view-set preview-set">' in unlabelled_body
    assert '<fieldset' not in unlabelled_body and '<legend' not in unlabelled_body, "an omitted preview label creates no empty or hidden group heading"
    unlabelled_radios = Radios()
    unlabelled_radios.feed(unlabelled_body)
    assert [item["aria-label"] for item in unlabelled_radios.inputs] == ["First route", "Second route"]
    assert {item["name"] for item in unlabelled_radios.inputs} == {"unlabelled-routes"}
    assert unlabelled_radios.checked == ["unlabelled-routes"]
    assert unlabelled_body.count('<img ') == 2
    assert [link["href"] for link in native_links(unlabelled_body)] == [urljoin(base_url, "/subject/"), urljoin(base_url, "/mention/")]
    assert 'preview-tabs.js' in unlabelled
    print("PASS: unlabelled illustrated preview omits fieldset/legend while preserving named native choices, one selection, images and destinations")
    class ChoiceOwners(HTMLParser):
        def __init__(self):
            super().__init__()
            self.fields = []
            self.radios = []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == "fieldset":
                self.fields.append(set(attrs.get("class", "").split()))
            elif tag == "input" and attrs.get("name") in ("outer-accounts", "nested-systems", "outer-previews", "nested-native", "nested-text-accounts"):
                self.radios.append((attrs["name"], self.fields[-1], "checked" in attrs))

        def handle_endtag(self, tag):
            if tag == "fieldset":
                self.fields.pop()

    composed = read("choice-ownership")
    owners = ChoiceOwners()
    owners.feed(composed)
    outer = [row for row in owners.radios if row[0] == "outer-accounts"]
    nested = [row for row in owners.radios if row[0] == "nested-systems"]
    assert len(outer) == len(nested) == 2
    assert all("view-set--text" in classes and "preview-set" not in classes for _, classes, _ in outer)
    assert all("preview-set" in classes and "view-set--text" not in classes for _, classes, _ in nested)
    assert sum(checked for _, _, checked in outer) == sum(checked for _, _, checked in nested) == 1
    assert "The comparison keeps its own conclusion." in composed
    assert "The nested preview keeps its direct destination." in composed
    assert f'href="{urljoin(base_url, "/subject/")}"' in composed
    print("PASS: composed native text/image choices retain distinct owners, independent groups and complete destinations")
    reverse = read("preview-choice-ownership")
    reverse_owners = ChoiceOwners()
    reverse_owners.feed(reverse)
    expected_owners = {
        "outer-previews": {"view-set", "preview-set"},
        "nested-native": {"view-set"},
        "nested-text-accounts": {"view-set", "view-set--text"},
    }
    for group, expected in expected_owners.items():
        group_radios = [row for row in reverse_owners.radios if row[0] == group]
        assert len(group_radios) == 2 and sum(checked for _, _, checked in group_radios) == 1
        assert all(classes == expected for _, classes, _ in group_radios), (group, group_radios)
    assert reverse.count('<img ') == 2 and 'choice-first.svg' in reverse and 'choice-second.svg' in reverse
    assert 'The second native choice keeps its independent selection.' in reverse
    assert 'The text comparison keeps its own rounded-label recipe.' in reverse
    print("PASS: reverse preview nesting has real images, native/text groups with distinct direct owners and independent initial selections; runtime style proof remains separate")
    assert '<dt>Provider</dt>' in product and '<dt>Recipient</dt>' in product
    assert '<strong>Result supplied</strong>' in product
    assert '<strong>Decision open</strong>' in product
    assert 'aria-label="Source &amp; record"' in product
    assert 'Both positions retain their independently supplied conditions.' in product
    assert product.count('work-connection--reference prose-flow') == 2
    assert '<dt>Observed delivery</dt>' in product
    assert '<dd>An illustrative receipt establishes delivery only.</dd>' in product
    assert '<dt>Decision pending</dt>' in product
    assert '<dd>Acceptance remains with the recipient.</dd>' in product
    assert 'The supplied terms apply to this illustrative account only.' in product
    assert 'No engagement or availability is implied.' in product
    assert 'work-copy--conditions' in product and 'class="work-proof"' in product
    assert f'href="{urljoin(base_url, "/reference/")}"' in product
    assert f'href="{urljoin(base_url, "/first/")}"' in product
    print("PASS: shared fit, terms, independent positions, referring accounts and proof retain their full qualifications and native links")
    assert "A separate tangent." in first
    documentation = read("documentation")
    assert 'class="reading-document"' in documentation
    assert 'class="reading-outline reading-outline--local"' in documentation
    assert 'documentation-document' not in documentation
    assert 'reading-corpus' not in documentation, 'a standalone guide reserves no invented product outline'
    assert 'class="reading-sidebar"' in documentation
    assert 'data-page-mode="reading"' in documentation
    nested_context = region(read("nested"), "reading-context")
    assert 'Root corpus' in nested_context, 'the actual parent remains reachable'
    assert 'Nested corpus' not in nested_context, 'the title is already the page heading'
    binding = json.loads(re.search(r'<script type="application/json" id="search-corpus"[^>]*>(.*?)</script>', first, re.S).group(1))
    assert binding["url"] == base_url + "search.json"
    assert binding["profile"] == "english"
    corpus = json.loads((output / "search.json").read_text())
    assert any(item["route"]["url"] == base_url + "first/" for item in corpus)
    assert '"@base/search"' in first
    assert "Permission is hereby granted" in (output / "assets/search-sdk.js").read_text()
    for source in [first] + ([(output / "graph/index.html").read_text()] if (output / "graph/index.html").exists() else []):
        preloads = {node["attrs"].get("href") for node in nodes(Document(source).root)
                    if node["tag"] == "link" and node["attrs"].get("rel") == "modulepreload"}
        assert base_url + "assets/shell.js" in preloads
        assert not {base_url + "assets/search.js", base_url + "assets/search-sdk.js"} & preloads, "ordinary and generated pages defer Search code"
    assert 'data-command-trigger="search" aria-haspopup="dialog" hidden' in first
    print("PASS: native search binding, corpus, dependency, retained licence and no-JS hidden trigger")
    print("PASS: authors; nested context; journey position/boundaries/URLs; article and documentation outlines; one H1; separate closed Notes; shared navigation")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    parser.add_argument("--theme", type=Path, help="Render the same neutral payload through a world package")
    parser.add_argument("--resource-bindings", type=Path, help="JSON list of {root, entries: {package_input: source_entry}} for external world inputs")
    parser.add_argument("--preview-port", type=int, help="Use loopback URLs for local browser inspection; does not start a server")
    parser.add_argument("--scale-check", action="store_true", help="Also render100 dated articles through native15-entry pagination and both chronology orders")
    parser.add_argument("--collection-scale-check", action="store_true", help="Also render19 root collections through native nine-card pagination")
    parser.add_argument("--preferred-sources", action="store_true", help="Qualify the canonical source invitation in the shared reading template")
    parser.add_argument("--footer-treatment", action="append", default=[], metavar="PATTERN=TREATMENT",
                        help="Expected footer treatment for a canonical landing pattern when the world's templates select another")
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    if args.preview_port is not None and args.preferred_sources:
        parser.error("--preferred-sources qualifies canonical output; use the compiler preview-addressing integration test for canonical/local separation")
    if args.preview_port is not None and not 1 <= args.preview_port <= 65535:
        parser.error("--preview-port must be between 1 and 65535")
    if args.resource_bindings and not args.theme:
        parser.error("--resource-bindings requires --theme")
    bindings = json.loads(args.resource_bindings.read_text()) if args.resource_bindings else []
    if not isinstance(bindings, list):
        parser.error("--resource-bindings must contain a JSON list")
    footer_treatments = dict(value.partition("=")[::2] for value in args.footer_treatment)
    if not all(pattern in ("product", "product-listing", "services") and treatment in ("quiet", "colophon") for pattern, treatment in footer_treatments.items()):
        parser.error("--footer-treatment takes product, product-listing or services = quiet or colophon")
    base_url = f"http://127.0.0.1:{args.preview_port}/" if args.preview_port else ("https://example.test/" if args.preferred_sources else "https://example.test/mount/")
    world = tomllib.loads((args.theme / "presentation.toml").read_text()) if args.theme else None
    work = Path(tempfile.mkdtemp(prefix="base-reading-"))
    try:
        content = work / "content"
        content.mkdir()
        stages = work / "stages"
        stages.mkdir()
        article = '{ kind = "page", family = { kind = "article" } }'
        authors = 'attributions = [{principal="person:one",role="author"},{principal="person:two",role="author"},{principal="person:unnamed",role="author"},{principal="organization:holder",role="rights-holder"}]'
        pages = {
            "root": page("collection:root", "Root corpus", "/root/", '{kind="collection"}'),
            "nested": page("collection:nested", "Nested corpus", "/nested/", '{kind="collection",parent="collection:root"}'),
            "sequence": page("journey:questions", "Ordered questions", "/sequence/", '{kind="journey",collection="collection:nested",members=[{content="article:first",primary=true},{content="article:middle",primary=true},{content="article:last",primary=true}]}'),
            "first": page("article:first", "First question", "/first/", article, description='A "quoted" account <with> distinctions & context.', attribution=authors+'\npublished="2026-09-10"\nmodified="2026-09-12T18:30:00.125+05:30"\ntaxonomies=[{taxonomy="taxonomy:subjects",term="term:systems"},{taxonomy="taxonomy:contexts",term="term:systems"}]'),
            "middle": page("article:middle", "Middle question", "/middle/", article, attribution='published="2026-09-11"\nmodified="2026-09-11"'),
            "last": page("article:last", "Last question", "/last/", article),
            "standalone": page("article:standalone", "Standalone question", "/standalone/", article),
            "unnamed": page("article:unnamed", "Unnamed author", "/unnamed/", article, attribution='attributions=[{principal="person:unnamed",role="author"}]'),
            "home": page("page:home", "Home", "/home/", '{kind="page",family={kind="index"}}', attribution=authors),
            "product": page("page:product", "Product", "/product/", '{kind="page",family={kind="project"}}', attribution=authors),
            "documentation": page("page:documentation", "Reference", "/reference/", '{kind="page",family={kind="documentation"}}'),
        }
        pages["citation"] = page("article:citation", "Z: An authored reference", "/citation/", article,
            attribution="""citation={text='<script>Plain text</script> & "quotation"',formats=[{label="Custom",text="Writer. An authored reference."}],bibtex="reference.bib",pdf="reference.pdf"}""")
        pages["collection-reader"] = page("article:collection-reader", "A question among others", "/collection-reader/", article).replace('+++\n', '+++\ncollections=["collection:nested"]\n', 1)
        pages["collection-sibling"] = page("article:collection-sibling", "Another independent question", "/collection-sibling/", article).replace('+++\n', '+++\ncollections=["collection:nested"]\n', 1)
        pages["single-corpus"] = page("collection:single", "A small corpus", "/single-corpus/", '{kind="collection"}')
        pages["single-member"] = page("article:single-member", "An only question", "/single-member/", article).replace('+++\n', '+++\ncollections=["collection:single"]\n', 1)
        for name, title, route in [("blog", "Article index", "/blog/"), ("directory", "Corpus index", "/directory/"), ("alternate", "Other articles", "/other/")]:
            pages[name] = page(f"page:{name}", title, route, '{kind="page",family={kind="index"}}').rsplit("\n+++\n", 1)[0] + "\n+++\n"
        for name in ("first", "documentation"):
            pages[name] += '\n## The question\n\nThe first part.\n\n### A detail\n\nA precise point.\n\n## The answer\n\nThe second part.\n'
        pages['standalone'] += '\n## One question\n\nAn account with a single main section.\n\n### Its detail\n\nA useful local destination.\n'
        pages['unnamed'] += '\n### A local detail\n\nA lower-level heading still has a local address.\n'
        # Long native reading geometry and a short final section for browser checks.
        passage = '\n\n'.join(['This synthetic passage gives the reader enough space to move between section addresses. Its length is a test condition, not publication content.'] * 8)
        pages['documentation'] = pages['documentation'].replace('The first part.', passage).replace('A precise point.', passage)
        pages['documentation'] += '''
::::view-set {label = "Alternative accounts"}
:::view {group = "reading-accounts", label = "First account", selected = true}
## Visible account
The selected account is part of the rendered reading surface.
:::
:::view {group = "reading-accounts", label = "Second account"}
## Alternative account
This heading must not become current while its panel is hidden.
:::
::::

## A short conclusion

The closing section is deliberately brief.
'''
        pages['first'] += '\nA qualification has a source.[^source] A second use returns to its own marker.[^source]\n\n[^source]: A bounded source qualification.\n\n    Another paragraph retains its relationship to the same note.\n'
        pages['first'] = pages['first'].replace('+++\n', '+++\nrelated=["article:middle", "article:standalone", "article:unnamed"]\nprojects=[{project="project:subject",kind="about"},{project="project:mention",kind="mentions"}]\n', 1)
        pages['middle'] = pages['middle'].replace('+++\n', '+++\nrelated=["article:first", "article:last"]\n', 1)
        pages['product'] = pages['product'].replace('+++\n', '+++\nbrowsing=["page:directory"]\n', 1)
        pages['product'] += '''
::::view-set {label = "Compare the accounts"}

:::view {group = "accounts", label = "First account", selected = true}

The first account has its own source.

:::

:::view {group = "accounts", label = "Before & after"}

The second account remains available without script.

:::

::::
'''
        pages['product'] += """
::::preview-set {label = "Explore the systems"}
:::view {group = "systems", label = "First system", selected = true}
### [First system](/subject/)
A complete account with a direct destination.
:::
:::view {group = "systems", label = "Second system"}
### [Second system](/mention/)
A second account and its own qualification.
:::
::::
"""
        pages["unlabelled-preview"] = page("page:unlabelled-preview", "Two public routes", "/unlabelled-preview/", '{kind="page",family={kind="utility"}}') + """
::::preview-set
:::view {group = "unlabelled-routes", label = "First route", selected = true}
![First neutral scene](/assets/choice-first.svg)

### [First route](/subject/)
One illustrated entrance retains its own destination.
:::
:::view {group = "unlabelled-routes", label = "Second route"}
![Second neutral scene](/assets/choice-second.svg)

### [Second route](/mention/)
The alternative route keeps its complete explanation.
:::
::::
"""
        pages["reading-comparison"] = page("page:reading-comparison", "Reading a comparison", "/reading-comparison/", '{kind="page",family={kind="utility"}}') + """
:::reading-comparison {label = 'Observation & "evidence"'}

| Observation | What it establishes | Next step |
|---|---|---|
| Original request `create-42` | The response is not yet known | [Inspect the context](/home/) |
| An incomplete search | No matching result was found in that search | Preserve the question and obtain a stronger observation |

:::

::::reading-comparison {label = "Independent outer comparison"}

| Outer observation | Outer meaning |
|---|---|
| First outer value | Its original consequence |

:::reading-comparison {label = "Independent nested comparison"}

| Inner observation | Inner meaning |
|---|---|
| First inner value | Its independent consequence |

:::
::::

:::reading-comparison {label = "Multiple tables remain native"}

| First table | Value |
|---|---|
| First record | First value |

A genuine boundary between the tables.

| Second table | Value |
|---|---|
| Second record | Second value |

:::
"""
        pages["table-width"] = page("page:table-width", "Tables retain their columns", "/table-width/", '{kind="page",family={kind="article"}}') + """
A short two-column table fills this reading column without stretching the surrounding text.

| State | Meaning |
| --- | --- |
| Open | Ready for review |
| Closed | Work accepted |

A wide comparison keeps its native column relationships and scrolls only inside its boundary.

| First measurement | Second measurement | Third measurement | Fourth measurement | Fifth measurement | Sixth measurement |
| --- | --- | --- | --- | --- | --- |
| `unbreakable_measurement_alpha_000000000000000000000000000` | `unbreakable_measurement_beta_000000000000000000000000000` | `unbreakable_measurement_gamma_000000000000000000000000000` | 4 | 5 | 6 |
"""
        pages["about-choice-layout"] = page("page:about-choice-layout", "Shared choice layout", "/about-choice-layout/", '{kind="page",family={kind="utility"}}') + """
::::about-choices {}
## Two distinct choices
:::about-choice {}
### First choice
A short account.
:::
:::about-choice {}
### Second choice
An account with more detail retains the same row and complete native content.
:::
:::about-choice {span = "full"}
### A complete row
This account explicitly spans the group.
:::
::::

::::about-choices {}
## Three distinct choices
:::about-choice {}
### Third choice
Short content.
:::
:::about-choice {}
### Fourth choice
A longer account keeps its native context and does not change the height relationship of its neighbours.
:::
:::about-choice {}
### Fifth choice
Another account.
:::
::::
"""
        pages["choice-ownership"] = page("page:choice-ownership", "Independent choices", "/choice-ownership/", '{kind="page",family={kind="utility"}}') + """
:::::::view-set {label = "Compare two accounts"}
::::::view {group = "outer-accounts", label = "First account", selected = true}
The comparison keeps its own conclusion.
:::::preview-set {label = "Inspect the supporting systems"}
::::view {group = "nested-systems", label = "First supporting system", selected = true}
### [Supporting system](/subject/)
The nested preview keeps its direct destination.
::::
::::view {group = "nested-systems", label = "Second supporting system"}
### [Other system](/mention/)
Its qualification remains available independently.
::::
:::::
::::::
::::::view {group = "outer-accounts", label = "Second account"}
Another account remains independently selectable.
::::::
:::::::
"""
        pages["preview-choice-ownership"] = page("page:preview-choice-ownership", "A preview with independent choices", "/preview-choice-ownership/", '{kind="page",family={kind="utility"}}') + """
:::::::preview-set {label = "Inspect two illustrated accounts"}
::::::view {group = "outer-previews", label = "First illustrated account", selected = true}
![First neutral scene](/assets/choice-first.svg)

### [First illustrated account](/subject/)
The image preview owns only its direct choices.

:::::fixture-native-view-set {label = "Independent native choices"}
::::view {group = "nested-native", label = "First native choice", selected = true}
The first native choice remains a normal radio account.
::::
::::view {group = "nested-native", label = "Second native choice"}
The second native choice keeps its independent selection.
::::
:::::
::::::
::::::view {group = "outer-previews", label = "Second illustrated account"}
![Second neutral scene](/assets/choice-second.svg)

### [Second illustrated account](/mention/)
Its qualification remains available with its own image.

:::::view-set {label = "Independent text choices"}
::::view {group = "nested-text-accounts", label = "First text choice", selected = true}
The text comparison keeps its own rounded-label recipe.
::::
::::view {group = "nested-text-accounts", label = "Second text choice"}
The other text account remains independently selectable.
::::
:::::
::::::
:::::::
"""
        pages['product'] += '''
::::::project-explanation {}

## An independent consequence

::::work-relation {source_label = "Source & record", source_detail = "The originating record remains with its owner.", positions = [{owner = "Provider", position = "Result supplied", detail = "The original delivery remains recorded."}, {owner = "Recipient", position = "Decision open", detail = "The revision remains to be assessed."}]}

::::

::::work-copy {role = "conditions"}
Both positions retain their independently supplied conditions.
::::

:::::work-connections {}
::::work-connection {kind = "origin"}
### Originating account
The originating account remains with [its owner](/reference/).

:::work-copy {role = "conditions"}
A reference establishes neither control nor acceptance.
:::
::::
::::work-connection {kind = "references"}
### Referring accounts
:::work-connection {kind = "reference"}
#### First reference
An independently supplied description remains intact.
:::
:::work-connection {kind = "reference"}
#### Second reference
Another description keeps its own destination: [the question](/first/).
:::
::::
:::::

::::work-proof {records = [{record = "Observed delivery", detail = "An illustrative receipt establishes delivery only."}, {record = "Decision pending", detail = "Acceptance remains with the recipient."}]}
::::

::::::

:::::service-fit {}
## Scope and fit
::::work-copy {role = "terms"}
The supplied terms apply to this illustrative account only.
::::
::::work-copy {role = "conditions"}
No engagement or availability is implied.
::::
:::::
'''
        pages["process-path"] = page("page:process-path", "Measured sequence", "/process-path/", '{kind="page",family={kind="utility"}}') + """
This is a neutral component specimen. The supplied labels control only this illustrative sequence.

::::process-path {label = "Three illustrative stages", pause = "Pause sequence", resume = "Resume sequence"}
:::process-step {}
## Establish the question
Keep the starting question available.
:::
:::process-step {}
## Inspect the evidence
Distinguish the observations from the decision.
:::
:::process-step {}
## Record the next question
Preserve what remains unresolved.
:::
::::

The following buttons are static control-state specimens, including an explicitly unavailable action.

:::fixture-primary-button {label = "Primary button specimen"}
:::
:::fixture-primary-button {label = "Unavailable button specimen", disabled = true}
:::

:::primary-action {}
[Continue to the fixture context](/home/)
:::
"""
        pages["quote-deck"] = page("page:quote-deck", "Attributed accounts", "/quote-deck/", '{kind="page",family={kind="utility"}}') + '''
This is a component specimen. The following accounts and attributions are neutral fixture text, not customer endorsements.

:::::quote-deck {}

:::quote-item {attribution = "Fixture reader A", detail = "Illustrative reviewer; no real engagement"}

The handover made the open decisions easy to find. We could distinguish an observation from an agreed next action.

:::

:::quote-item {attribution = "Fixture reader B", detail = "Illustrative operator; no real engagement"}

A stopped case stayed visible to the person able to resolve it. This longer specimen checks that the complete account fits its card without clipping, even when the viewport narrows and the text wraps onto additional lines. Its attribution remains attached to the words it qualifies.

:::

:::quote-item {attribution = "Fixture reader C", detail = "Illustrative collaborator; no real engagement"}

We could return to the reason for the decision. [Read the fixture context](/home/).

:::

:::::
'''
        pages["focus-reveal"] = page("page:focus-reveal", "Measured focus", "/focus-reveal/", '{kind="page",family={kind="utility"}}') + '''
These neutral headings exercise measured focus. Their explanations and destinations must remain sharp and usable while the optical frame moves.

[Jump to the automatic heading](#follow-the-useful-question).

:::focus-reveal {pause = "Pause automatic focus", resume = "Resume automatic focus"}

## Follow the useful question

This complete account remains readable while the heading changes focus.

[Read the fixture context](/home/).

:::

:::focus-reveal {mode = "manual", pause = "Pause manual focus", resume = "Resume manual focus"}

## Compare evidence before choosing

Keyboard focus owns the selected word until it leaves the heading. Pointer movement must not displace that focus.

[Read the reference](/reference/).

:::
'''
        for layout in ["stacked", "paired"]:
            pages[f"opening-{layout}"] = f'''+++
[content]
id = "page:opening-{layout}"
site = "site:reading"
title = "A question and its context"
lifecycle = "draft"
language = "en"
route = {{path="/opening-{layout}/"}}
structure = {{kind="page",family={{kind="utility"}}}}
+++
:::::page-opening {{layout="{layout}"}}
# A question and its context

The supplied premise stays with the heading.

::::about-copy {{}}
One paragraph establishes the account.

Another paragraph continues the same account.

## A later question

The next argument keeps its own heading boundary.
::::

::::about-context {{}}
One qualification belongs to this account.

A second qualification remains part of that context.
::::
:::::
'''
        pages["ambient-hero"] = (BASE / "fixtures/ambient-hero.landing.yaml").read_text().replace(
            'heading: {level: 1, text: A scene and its destinations}',
            'heading: {level: 2, text: A scene and its destinations}', 1)
        for name in ("project-anatomy", "directory-anatomy"):
            pages[name] = (BASE / "fixtures" / f"{name}.md").read_text()
        namespace = world["namespace"] if world else "base"
        for fixture in sorted((BASE / "fixtures").glob("canonical-*.landing.yaml")):
            name = fixture.name.removesuffix(".landing.yaml")
            pages[name] = fixture.read_text().replace("template: base/", f"template: {namespace}/", 1)
        pages["resource-mentions"] = page("page:resource-mentions", "Specimen mentions", "/resource-mentions/", '{kind="page",family={kind="index"}}').rsplit("+++\n", 1)[0] + "+++\n"
        pages["resource-mentions"] = pages["resource-mentions"].replace("+++\n", '+++\nprojects=[{project="project:resources",kind="about"}]\n', 1)
        pages["resource-actions-missing"] = """format: gazette-landing/v1
projects:
- project: project:partial-resources
  kind: about
content:
  id: page:partial-resources
  site: site:reading
  title: A partially configured resource group
  lifecycle: draft
  language: en
  route: {path: /resource-actions-missing/}
  structure: {kind: page, family: {kind: project}}
sections:
- component: page-opening
  heading: {level: 1, text: A partially configured resource group}
- component: project-links
"""
        for name, text in pages.items():
            folder = content / name
            folder.mkdir()
            filename = "index.landing.yaml" if text.startswith("format: gazette-landing/") else "index.md"
            (folder / filename).write_text(text)
        # Asset routing only; media decode/lifecycle has separate controller and live checks.
        (content / "ambient-hero/opening.mp4").write_bytes(b"opaque native video fixture")
        (content / "citation" / "reference.bib").write_text("@article{example,title={An authored reference}}\n")
        (content / "citation" / "reference.pdf").write_bytes(b"%PDF-1.4\n% opaque test download\n")
        (content / "first" / "notes.md").write_text(f"## A tangent\n\nA separate tangent.\n\n- A qualified case\n- Another case with a [return to the question]({base_url}first/#the-question).\n\n[Read the answer]({base_url}first/#the-answer).\n")
        notes_path = content / "first" / "notes.md"
        notes_path.write_text(notes_path.read_text() + """

:::reading-comparison {label = "Notes comparison with an independent source"}

| Source observation | Qualification | Consequence |
|---|---|---|
| First account | Its evidence remains bounded | [Return to the context](/home/) |
| Second account | Another source answers another question | Preserve both accounts |

:::
""")

        # Foreign references expose only their supplied address, never private titles.
        foreign = work / "foreign"
        foreign.mkdir()
        text = page("article:foreign", "A foreign question <and> context", "/reference/", article) + "\nForeign private body must stay with its owner.\n"
        (foreign / "reference.md").write_text(text.replace('site = "site:reading"', 'site = "site:foreign"'))
        first_path = content / "first/index.md"
        first_path.write_text(first_path.read_text().replace('related=["article:middle",', 'related=["article:foreign", "article:middle",'))
        # One actual selected image exercises the viewer's native asset proof.
        (first_path.parent / "diagram.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="640" height="320" fill="#ddd"/><circle cx="320" cy="160" r="100" fill="#456"/></svg>')
        (first_path.parent / "diagram-dark.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="640" height="320" fill="#234"/><circle cx="320" cy="160" r="100" fill="#cde"/></svg>')
        shutil.copyfile(first_path.parent / "diagram.svg", first_path.parent / "ordinary.svg")
        shutil.copyfile(first_path.parent / "diagram.svg", first_path.parent / "captioned.svg")
        (first_path.parent / "inline.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect x="40" y="100" width="160" height="100" fill="none" stroke="currentColor"/><rect x="440" y="100" width="160" height="100" fill="none" stroke="currentColor"/><path d="M200 150H440" stroke="currentColor"/><text x="260" y="130" fill="currentColor">Signal</text></svg>')
        shutil.copyfile(first_path.parent / "diagram.svg", content / "ambient-hero/scene.svg")
        first_path.write_text(first_path.read_text().replace('[content]', '[[images]]\ndefault = "diagram.svg"\nlight = "diagram.svg"\ndark = "diagram-dark.svg"\nwidth = 480\n\n[content]', 1) + "\n![A bounded neutral diagram](diagram.svg)\n\n![An ordinary neutral diagram](ordinary.svg)\n")
        first_path.write_text(first_path.read_text().replace('[content]', '[[images]]\ndefault = "inline.svg"\ninline = true\nwidth = 320\n\n[content]', 1))
        first_path.write_text(first_path.read_text() + """
::::figure

[![A circle inside a rectangular field](captioned.svg "Containment diagram")](https://evidence.example.test/original)

:::figure-caption
The circle remains **inside** the field; compare the [source](https://evidence.example.test/figure).
:::

::::

The following paragraph is an independent qualification.

Before the mark ![An inline neutral mark](ordinary.svg) after the mark.

::::figure

![Two connected boxes carrying a signal](inline.svg "Signal path")

:::figure-caption
The signal crosses *one connection*; the boxes remain distinct.
:::

::::
""")
        notes_path.write_text(notes_path.read_text() + "\n![A note-level neutral diagram](diagram.svg)\n")
        root_package = world["package"] if world else "theme:base"
        # Neutral specimens use the native component boundary, not raw Markdown HTML.
        # The button adapter exists only inside this temporary captured fixture theme.
        base_source = work / "base"
        shutil.copytree(BASE, base_source, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        # Real neutral images make the reverse nesting specimen enter preview enhancement.
        for name, artwork in {
            "choice-first": '<rect width="640" height="480" fill="#263d45"/><circle cx="320" cy="240" r="140" fill="#a7d9d0"/>',
            "choice-second": '<rect width="640" height="480" fill="#49433a"/><path d="M140 360L320 80L500 360Z" fill="#efc985"/>',
        }.items():
            (base_source / "images" / f"{name}.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">{artwork}</svg>')
        fixture_templates = base_source / "templates/fixture-controls"
        fixture_templates.mkdir()
        (fixture_templates / "primary-button.html").write_text('<button class="control control--primary" type="button"{% if component.arguments.disabled | default(value=false) %} disabled{% endif %}>{{ component.arguments.label }}</button>')
        (fixture_templates / "native-view-set.html").write_text('<fieldset class="view-set"><legend>{{ component.arguments.label }}</legend><div class="view-set__views">{{ component.body.html | safe }}</div></fieldset>')
        (fixture_templates / "collection-directory.html").write_text('{% extends "base/page.html" %}{% block listing %}{% include "base/partials/collection-directory.html" %}{% endblock listing %}')
        manifest = base_source / "presentation.toml"
        fixture_manifest = manifest.read_text() + '''
[[resources]]
id = "image:fixture-choice-first"
inputs = ["images/choice-first.svg"]
build = { kind = "svg-image", entry = "images/choice-first.svg" }

[[resources]]
id = "image:fixture-choice-second"
inputs = ["images/choice-second.svg"]
build = { kind = "svg-image", entry = "images/choice-second.svg" }

[components.fixture-native-view-set]
template = "fixture-controls/native-view-set.html"
arguments = { type = "object", required = ["label"], additionalProperties = false, properties = { label = { type = "string", minLength = 1 } } }

[components.fixture-primary-button]
template = "fixture-controls/primary-button.html"
arguments = { type = "object", required = ["label"], additionalProperties = false, properties = { label = { type = "string", minLength = 1 }, disabled = { type = "boolean" } } }
'''
        # Both paths render the neutral ambient specimen. Only the neutral root
        # needs its token stylesheet; a world supplies its own token binding.
        fixture_manifest = fixture_manifest.replace('resource_requirements = [', 'resource_requirements = ["stylesheet:ambient-hero", ')
        if not world:
            fixture_manifest = fixture_manifest.replace('resource_requirements = [', 'resource_requirements = ["stylesheet:base-tokens", ')
        # A world's Home share-card recipe needs its card resources, and rendering
        # without a browser needs an explicit link preview, which takes precedence.
        card = world.get("render", {}).get("social_card") if world else None
        if card:
            from frames import png
            (base_source / "images" / "fixture-link-preview.png").write_bytes(png(96))
            fixture_manifest += '''
[[resources]]
id = "image:fixture-link-preview"
inputs = ["images/fixture-link-preview.png"]
build = { kind = "raster-image", entry = "images/fixture-link-preview.png", input_format = "png", apply_orientation = false, resize = { operation = "fit", width = 2, height = 2 }, encoding = { format = "png" } }
'''
        manifest.write_text(fixture_manifest)
        parts = [f'[composition]\nfooter = [{{key="base:generator-credit",label="Generator",destination="article:standalone"}},{{key="base:services",label="Services",destination="page:documentation"}}]\ntheme={{package={json.dumps(root_package)}}}\nnavigation=[{{label="Home",destination="page:home"}},{{label="Reference",destination="page:documentation"}},{{label="Questions",destination="page:directory"}},{{label="Blog",destination="page:blog"}}]', CHROME]
        for key, name in [('subject', 'Subject project'), ('mention', 'Mentioned project')]:
            parts.append(f'[[projects]]\nid="project:{key}"\nname="{name}"\nlifecycle="active"\nvisibility="public"\navailability="unavailable"')
        parts.append('\n'.join(['[[projects]]', 'id="project:resources"', 'name="Resource specimen"', 'lifecycle="active"', 'visibility="public"', 'availability="unavailable"', 'repository="https://source.example.test/specimen"', 'resources={learn="page:documentation",mentions="page:resource-mentions",code_documentation="https://docs.example.test/specimen/"}']))
        parts.append('\n'.join(['[[projects]]', 'id="project:partial-resources"', 'name="Partial specimen"', 'lifecycle="active"', 'visibility="public"', 'availability="unavailable"', 'resources={learn="page:documentation"}']))
        for key, label in [('subjects', 'Subjects & methods'), ('contexts', 'Contexts')]:
            parts.append(f'[[taxonomies]]\nid="taxonomy:{key}"\nlabel="{label}"\nterms=[{{id="term:systems",label="Systems & records"}}]')
        for identity, kind, name in [("person:publisher", "person", "Publisher Person"), ("person:one", "person", "Writer One & Co"), ("person:two", "person", "Writer Two"), ("person:unnamed", "person", None), ("organization:holder", "organization", "Rights Organization")]:
            parts.append(f'[[principals]]\nid="{identity}"\nkind="{kind}"' + (f'\nname={json.dumps(name)}' if name else '') + ('\nwebsite={kind="external",url="https://writer.example.test/"}\nsame_as=["https://identity.example.test/writer"]' if identity == "person:one" else '\nwebsite={kind="site",site="site:foreign"}' if identity == "person:two" else ''))
        parts += ['[[sites]]\nid="site:reading"\nrights_holder="organization:holder"\npublisher="person:publisher"\ndefault_author="person:publisher"\ndeployable=false',
                  '[[brands]]\nid="brand:reading"\nname="Reading fixture"',
                  f'[[brands.publications]]\nsite="site:reading"\nhome="page:home"\nmachine={{search="english",json_ld=true}}\nlistings=[{{content="page:alternate",select={{kind="standalone-articles"}},order={{first=[],remaining="title-then-id"}},pagination={{page_size=10,next_pages="page/{{number}}/"}}}},{{content="page:blog",select={{kind="standalone-articles"}},order={{first=[],remaining="title-then-id"}},pagination={{page_size=1,next_pages="page/{{number}}/"}}}},{{content="page:directory",select={{kind="root-collections"}},order={{first=[],remaining="title-then-id"}},pagination={{page_size=10,next_pages="page/{{number}}/"}}}}]\ncontacts={{discovery="hello@example.test",correspondence="records@example.test"}}\npublic_base_url={json.dumps(base_url)}\nauthored=[{{source="source:content",target="authored"}}]']
        if args.preferred_sources:
            parts[-1] += '\n[brands.publications.processing.preferred_sources]\nenabled=true\nprovider="google"\narticles=false\nlabel="Prefer this source"\ndescription="More from this publication."\n[brands.publications.processing.preferred_sources.pages."article:first"]\nenabled=true\n'
            # Public canonical identity stays independent of a loopback fixture preview.
            parts[-1] = parts[-1].replace(f'public_base_url={json.dumps(base_url)}', 'public_base_url="https://example.test/"')
        subject_listing = '{content="page:resource-mentions",select={kind="project-articles",project="project:resources",landing="page:canonical-product-populated",scope="ecosystem",residence="all",explore="page:blog"},order={by="published",direction="descending",undated="last-title-then-id"},alternate_order={order={by="published",direction="ascending",undated="last-title-then-id"},path="oldest"},pagination={page_size=15,next_pages="page/{number}/"}}'
        parts[-1] = parts[-1].replace('listings=[', 'listings=[' + subject_listing + ',', 1)
        if card:
            parts[-1] = parts[-1].replace('[[brands.publications]]\n', '[[brands.publications]]\nidentity_assets={link_preview="image:fixture-link-preview"}\n', 1)
        parts += ['[[sites]]\nid="site:foreign"\npublisher="person:publisher"\ndeployable=false',
                  '[[brands]]\nid="brand:foreign"\nname="Foreign fixture"',
                  '[[brands.publications]]\nsite="site:foreign"\npublic_base_url="https://foreign.example.test/"\nauthored=[{source="source:foreign",target="foreign"}]']
        for identity, root in [("source:content", content), ("source:base", base_source), ("source:foreign", foreign)]:
            parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
        parts.append('[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"')
        if world:
            parts.append(f'[[sources]]\nid="source:world"\nlocation={{kind="filesystem",root={json.dumps(str(args.theme.resolve()))}}}')
            package_binding = f'[[theme_packages]]\npackage={json.dumps(root_package)}\nsource="source:world"\nmanifest="presentation.toml"'
            inputs = {item for resource in world["resources"] for item in resource.get("inputs", [])}
            resource_bindings = {}
            design_bindings = []
            for index, binding in enumerate(bindings):
                root = Path(binding["root"]).resolve(strict=True)
                if not root.is_dir():
                    raise ValueError("External resource root must be a directory")
                input_id = f"fixture-input-{index}"
                for target, entry in binding["entries"].items():
                    if target not in inputs or target in resource_bindings:
                        raise ValueError(f"Undeclared or repeated resource input: {target}")
                    source_file = (root / entry).resolve(strict=True)
                    if not source_file.is_relative_to(root) or not source_file.is_file():
                        raise ValueError(f"Resource entry must remain a regular file within its root: {entry}")
                    resource_bindings[target] = (input_id, entry)
                parts.append(f'[[sources]]\nid="source:{input_id}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
                design_bindings.append(f'{input_id}="source:{input_id}"')
            if "shared/scene.mjs" in inputs and "shared/scene.mjs" not in resource_bindings:
                scene = work / "scene"
                scene.mkdir()
                (scene / "scene.mjs").write_text("export const scene = {};\n")
                resource_bindings["shared/scene.mjs"] = ("fixture-scene", "scene.mjs")
                parts.append(f'[[sources]]\nid="source:fixture-scene"\nlocation={{kind="filesystem",root={json.dumps(str(scene))}}}')
                design_bindings.append('fixture-scene="source:fixture-scene"')
            if resource_bindings:
                package_binding += '\nresource_inputs={' + ','.join(
                    f'{json.dumps(target)}={{input={json.dumps(input_id)},entry={json.dumps(entry)}}}'
                    for target, (input_id, entry) in resource_bindings.items()
                ) + '}'
            if design_bindings:
                parts.append('[design_inputs]\n' + '\n'.join(design_bindings))
            parts.append(package_binding)
        parts.append('[composition.resources]')
        base_resources = [("image:fixture-choice-first", "choice-first.svg", "site"), ("image:fixture-choice-second", "choice-second.svg", "site"), ("module:ambient-video", "ambient-video.js", "dependency"), ("module:ambient-hero", "ambient-hero.js", "dependency"), ("stylesheet:ambient-hero", "ambient-hero.css", "site"), ("module:quote-deck", "quote-deck.js", "dependency"), ("module:bookmark-card", "bookmark-card.js", "dependency"), ("module:focus-reveal", "focus-reveal.js", "dependency"), ("module:process-path", "process-path.js", "dependency"), ("module:preview-tabs", "preview-tabs.js", "dependency"), ("stylesheet:physics", "physics.css", "site"), *SHELL_RESOURCES]
        if world:
            base_resources.extend([("module:frames", "frames.js", "dependency"), ("module:sequence", "sequence.js", "dependency"),
                                   ("module:portrait-frames", "portrait-frames.js", "dependency"), ("module:continuous-portrait", "continuous-portrait.js", "dependency"),
                                   ("module:cinematic-film", "cinematic-film.js", "dependency"), ("module:film-surface", "film-surface.js", "dependency"),
                                   ("module:field-sequence", "field-sequence.js", "dependency"),
                                   ("stylesheet:cinematic-film", "cinematic-film.css", "site"), ("image:film-grain", "film-grain.svg", "site")])
            if card:
                base_resources.append(("image:fixture-link-preview", "link-preview.png", "site"))
                # The card's media module imports Base's video reveal.
                for identity in [*card.get("resource_requirements", []), "module:video-reveal"]:
                    kind, name = identity.split(":", 1)
                    base_resources.append((identity, f'{name}.{"css" if kind == "stylesheet" else "js"}', "dependency"))
        else:
            base_resources.insert(0, ("stylesheet:base-tokens", "base.css", "site"))
        for identity, output, use in base_resources:
            parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}')
        if world:
            extensions = {"stylesheet": "css", "browser-module": "js", "woff2-font": "woff2"}
            for resource in world["resources"]:
                kind = resource["build"]["kind"]
                if kind not in extensions:
                    raise ValueError(f"Fixture needs an explicit output mapping for {kind}")
                identity = resource["id"]
                output = f'{world["namespace"]}-{identity.replace(":", "-")}.{extensions[kind]}'
                use = "site" if identity in world.get("resource_requirements", []) else "dependency"
                parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package={json.dumps(root_package)}}},resource={json.dumps(identity)}}},output="/assets/{output}",use="{use}"}}')
        source = "\n".join(parts)
        (work / "workspace.toml").write_text(source)
        run(args.gazette, ["check", "--stdin", "--acquire-composition", "site:reading", "--compile-templates"], source)
        result = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--model-output", "model.json", "--graph-output", "graph/index.html", "--output-parent", str(stages)], source)
        repeated = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--model-output", "model.json", "--graph-output", "graph/index.html"], source)
        assert result["inventory"]["identity"] == repeated["inventory"]["identity"], "render changed with identical input"
        output = Path(result["directory"])
        model = json.loads((output / "model.json").read_text())
        graph = (output / "graph/index.html").read_text()
        assert graph.count("<h1>") == 1
        notes_comparison = (output / "first/index.html").read_text()
        assert 'aria-label="Notes comparison with an independent source"' in notes_comparison
        assert 'reading-comparison.js' not in notes_comparison
        assert 'class="reading-comparison"' in region(notes_comparison, "reading-notes__body", "div")
        assert 'data-gazette-table' in region(notes_comparison, "reading-notes__body", "div")
        comparison = (output / "reading-comparison/index.html").read_text()
        assert comparison.count('class="reading-comparison"') == 4
        assert comparison.count('<table>') == 5
        assert 'aria-label="Observation &amp; &quot;evidence&quot;"' in comparison
        assert '<code>create-42</code>' in comparison
        assert 'Inspect the context' in comparison
        assert 'reading-comparison.js' not in comparison
        assert comparison.count('data-gazette-table') == 5
        assert 'reading-comparison--enhanced' not in comparison
        assert 'Reading fixture</a>' in graph and 'mailto:hello@example.test' in graph
        assert model["graph"]["presentation"]["publication"] == model["pages"]["article:first"]["site"]["metadata"]
        graph_url = model["pages"]["article:first"]["presentation"]["graph"]["url"]
        assert graph_url == base_url + 'graph/index.html'
        ambient_html = (output / "ambient-hero/index.html").read_text()
        assert f'<link rel="stylesheet" href="{base_url}assets/ambient-hero.css">' in html.unescape(ambient_html)
        assert ambient_html.count('<h1') == 1
        assert '<h1 class="frame__brand">A scene and its destinations</h1>' in ambient_html
        assert re.search(r'<h2[^>]*>A scene and its destinations</h2>', ambient_html)
        assert 'class="ambient-hero"' in ambient_html
        assert 'class="ambient-still"' in ambient_html and 'A bounded neutral scene' in ambient_html
        assert 'data-ambient-toggle hidden' in ambient_html
        assert 'Pause film' in ambient_html and 'Play film' in ambient_html
        assert ambient_html.count('class="destination prose-flow card-surface"') == 3
        inquiries = region(ambient_html, "inquiry-section", "section")
        assert inquiries.index('class="faq"') < inquiries.index('data-deck-field="container"')
        assert 'itemtype="https://schema.org/FAQPage"' in inquiries
        assert "A useful comparison" in inquiries
        assert inquiries.count('<article class="quote-deck__card destination prose-flow card-surface card-surface--moving">') == 1
        assert 'data-content-deck' in inquiries
        assert all(label in ambient_html for label in ('First question', 'Middle question', 'Last question'))
        assert 'ambient-hero.js' in ambient_html
        assert ambient_html.count('data-gazette-destination-kind="internal-native"') >= 4
        print("PASS: neutral ambient opening, native destination links, one H1, durable poster and initially hidden playback control")
        first_html = (output / "first/index.html").read_text()
        assert ">Explore connections</a>" not in first_html
        assert ">Read as Markdown</a>" not in first_html
        assert "Nested groups" in graph and "Pages in this collection" in graph and "Reading order" in graph
        assert "Related reading" in graph and "Other pages" in graph
        assert 'value="2"' in graph and 'https:&#x2F;&#x2F;foreign.example.test&#x2F;reference&#x2F;' in graph
        assert "A foreign question &lt;and&gt; context" in graph
        assert "Foreign private body must stay with its owner." not in graph
        graph_ids = re.findall(r'\bid="([^\"]+)"', graph)
        assert len(graph_ids) == len(set(graph_ids)), "graph occurrences must be unique"
        assert 'id="connection-step:journey%3Aquestions:1:article%3Amiddle"' in graph
        assert 'data-gazette-destination-kind="cross-site"' in graph
        graph_crossings = [link for link in native_links(graph) if link.get("data-gazette-destination-kind") == "cross-site"]
        assert graph_crossings and all("crossing-description" in link.get("aria-describedby", "").split() for link in graph_crossings), "all graph destinations retain their static crossing description before scripts"

        assert "First question" in graph and "A question among others" in graph
        assert graph.index('value="1"') < graph.index('value="2"') < graph.index('value="3"')
        assert '&lt;with&gt; distinctions &amp; context.' not in graph  # source descriptions are not repeated as target labels
        print("PASS: native relationship directory, distinct edge kinds, ordered positions and scoped foreign references")
        partial_source = source.replace('rights_holder="organization:holder"\n', '').replace('footer = [{key="base:generator-credit",label="Generator",destination="article:standalone"},{key="base:services",label="Services",destination="page:documentation"}]\n', '')
        partial_source = partial_source.replace('"base:graph-members" = "Pages in this collection"\n', '')
        partial = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--graph-output", "graph/index.html", "--output-parent", str(stages)], partial_source)
        partial_graph = (Path(partial["directory"]) / "graph/index.html").read_text()
        assert 'frame__footer-copyright' not in partial_graph and 'frame__footer-credit' not in partial_graph and 'services-invitation' not in partial_graph
        assert 'class="publication-index"' in partial_graph
        assert 'class="connection-group"' not in partial_graph
        assert "First question" in partial_graph
        print("PASS: partial directory labels retain the native flat-list fallback")
        locations = model["pages"]["article:first"]["browsing_locations"]
        assert [(item["index"], item["via"]) for item in locations] == [("page:directory", "collection:root")]
        product_locations = model["pages"]["page:product"]["browsing_locations"]
        assert len(product_locations) == 1
        assert product_locations[0]["index"] == "page:directory" and product_locations[0]["via"] == "page:product"
        assert product_locations[0]["kind"] == "declared"
        assert "page_number" not in product_locations[0] and "page_count" not in product_locations[0]
        direct = model["pages"]["article:unnamed"]["browsing_locations"]
        assert len(direct) == 2 and all(item["via"] == "article:unnamed" for item in direct)
        assert "browsing_locations" not in model["pages"]["page:documentation"]
        quotes = (output / "quote-deck/index.html").read_text()
        assert quotes.count('class="quote-deck__card card-surface card-surface--moving"') == 3
        assert 'quote-deck.js' in quotes and 'Fixture reader B' in quotes
        assert 'not customer endorsements' in quotes
        focus = (output / "focus-reveal/index.html").read_text()
        assert focus.count('class="focus-reveal"') == 2
        assert focus.count('data-focus-mode="auto"') == 1 and focus.count('data-focus-mode="manual"') == 1
        assert 'focus-reveal.js' in focus and (output / 'assets/focus-reveal.js').is_file()
        assert '<h2 id="follow-the-useful-question">Follow the useful question</h2>' in focus
        assert '<h2 id="compare-evidence-before-choosing">Compare evidence before choosing</h2>' in focus
        assert focus.count('control--quiet focus-reveal__pause') == 2
        assert 'hidden>Pause automatic focus</button>' in focus and 'hidden>Pause manual focus</button>' in focus
        assert 'focus-reveal__word' not in focus, 'unexecuted output preserves ordinary native heading text'
        assert 'This complete account remains readable while the heading changes focus.' in focus
        assert 'Read the fixture context' in focus and 'Read the reference' in focus
        print("PASS: native automatic/manual focus specimens, ordinary headings and complete actions, hidden controls and resolved module")
        process = (output / "process-path/index.html").read_text()
        assert process.count('class="process-path__copy"') == 3
        assert 'control--quiet process-path__pause' in process
        assert 'data-resume="Resume sequence" hidden>Pause sequence</button>' in process
        assert 'process-path.js' in process and (output / 'assets/process-path.js').is_file()
        assert 'type="button" disabled>Unavailable button specimen</button>' in process
        assert 'Continue to the fixture context' in process
        assert quotes.count('class="control control--navigation" type="button" data-quote-previous ') == 1
        assert quotes.count('class="control control--navigation" type="button" data-quote-next ') == 1
        print("PASS: optional native pause controls carry supplied labels, hidden no-script fallback and shared quiet recipe; icon controls and primary disabled specimen keep native semantics")
        for layout in ["stacked", "paired"]:
            opening = (output / f"opening-{layout}/index.html").read_text()
            expected = "page-opening" + (" page-opening--paired" if layout == "paired" else "")
            assert f'<header class="{expected}">' in opening
            assert '<div class="about-copy prose-flow">' in opening
            assert '<div class="about-context prose-flow">' in opening
            assert opening.index("Another paragraph continues") < opening.index('<h2 id="a-later-question">')
            assert "A second qualification remains part of that context." in opening
        print("PASS: native stacked/paired openings preserve explicit continuous copy and later-heading context")
        reader_output = output / "mount" if (output / "mount").is_dir() else output
        verify_project_anatomy(reader_output, base_url, namespace, model, graph, footer_treatments)
        verify(reader_output, base_url, model, namespace, args.preferred_sources)
        print("native output:", output)
        print("PASS: identical repeated native output inventory")
        if args.collection_scale_check:
            # A neutral continuation case: two existing roots plus seventeen new roots.
            # The original fixture assertions run before this larger authored corpus exists.
            for index in range(17):
                (content / f"collection-scale-{index:02}.md").write_text(page(
                    f"collection:scale-{index:02}", f"Collection {index:02}", f"/collection-scale-{index:02}/", '{kind="collection"}',
                    description="A neutral inquiry with a complete native destination."
                ))
            scale_index = content / "collection-scale-index.md"
            scale_index.write_text(page("page:collection-scale", "Collected inquiries", "/collection-scale/", '{kind="page",family={kind="index"}}').rsplit("+++\n", 1)[0].replace('+++\n', '+++\ntemplate="base/fixture-controls/collection-directory.html"\n', 1) + "+++\n")
            policy = '{content="page:collection-scale",select={kind="root-collections"},order={first=[],remaining="title-then-id"},pagination={page_size=9,next_pages="page/{number}/"}}'
            collection_source = source.replace('listings=[', 'listings=[' + policy + ',', 1)
            collection_result = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--output-parent", str(stages)], collection_source)
            collection_output = Path(collection_result["directory"])
            targets = []
            for number, count in [(1, 9), (2, 9), (3, 1)]:
                relative = "collection-scale/index.html" if number == 1 else f"collection-scale/page/{number}/index.html"
                markup = (collection_output / relative).read_text()
                document = Document(markup).root
                decks = [node for node in nodes(document) if "data-content-deck" in node["attrs"]]
                assert len(decks) == 1, "one native collection deck owns this page of cards"
                cards = [node for node in nodes(decks[0]) if "quote-deck__card" in node["attrs"].get("class", "").split()]
                assert len(cards) == count
                for card in cards:
                    links = [node for node in nodes(card) if node["tag"] == "a"]
                    assert len(links) == 1, "each collection card retains one native destination"
                    targets.append(links[0]["attrs"]["href"])
                assert markup.count('class="listing-controls ') == 2
                controls = [link for link in native_links(markup) if "listing-control" in link.get("class", "")]
                assert len([link for link in controls if link.get("aria-current") == "page" and link["text"] == str(number)]) == 2
                if number < 3:
                    assert len([link for link in controls if link.get("rel") == "next" and link["href"] == base_url + f"collection-scale/page/{number + 1}/"]) == 2
                if number > 1:
                    previous = base_url + ("collection-scale/" if number == 2 else "collection-scale/page/2/")
                    assert len([link for link in controls if link.get("rel") == "prev" and link["href"] == previous]) == 2
            assert len(targets) == len(set(targets)) == 19
            expected = [base_url + "single-corpus/"] + [base_url + f"collection-scale-{index:02}/" for index in range(17)] + [base_url + "root/"]
            assert targets == expected
            print("PASS:19 native root collections,9/9/1 cards, exact unique authored order and paired numbered continuation controls")
            print("collection scale output:", collection_output)
        if args.scale_check:
            # Keep the ordinary fixture assertions stable; this second corpus tests scale.
            scale_source = source.replace("page_size=10,", "page_size=15,").replace("page_size=1,", "page_size=15,")
            primary_policy = 'content="page:alternate",select={kind="standalone-articles"},order={first=[],remaining="title-then-id"}'
            chronological_policy = 'content="page:alternate",select={kind="standalone-articles"},order={by="published",direction="descending",undated="last-title-then-id"},alternate_order={order={by="published",direction="ascending",undated="last-title-then-id"},path="oldest"}'
            assert scale_source.count(primary_policy) == 1
            scale_source = scale_source.replace(primary_policy, chronological_policy)
            for index in range(100):
                label = "An extended question about preserving reading order and authorship across a growing publication" if index == 0 else "Question"
                (content / f"scale-{index:03}.md").write_text(page(
                    f"article:scale-{index:03}", f"Scale {index:03}: {label}", f"/scale-{index:03}/", article,
                    attribution=authors + f'\npublished="{date(2026, 1, 1) + timedelta(days=index)}"',
                    description="A concise account remains with its title, author and date as the reading list grows."))
            scaled = run(args.gazette, ["render-site", "--local", "--site", "site:reading", "--output-parent", str(stages)], scale_source)
            scaled_output = Path(scaled["directory"])
            order_targets = {}
            for variant, suffix in [("descending", ""), ("ascending", "oldest/")]:
                order_root = scaled_output / "other" / suffix
                index_files = [order_root / "index.html", *sorted((order_root / "page").glob("*/index.html"), key=lambda path: int(path.parent.name))]
                targets = []
                for page_number, index_file in enumerate(index_files, 1):
                    native = index_file.read_text()
                    entries = re.findall(r'<article class="reading-list__entry(?: [^"]*)?">(.*?)</article>', native, re.S)
                    assert 0 < len(entries) <= 15
                    latest = re.findall(r'<article class="article-listing__latest">(.*?)</article>', native, re.S)
                    assert len(latest) == 1, "a dated article index retains its global latest preview on every sort and page"
                    assert 'Scale 099: Question' in latest[0] and base_url + 'scale-099/' in html.unescape(latest[0])
                    assert 'datetime="2026-04-10"' in latest[0] and '>Read more</a>' in latest[0]
                    assert 'data-article-listing' in native and 'article-listing__controls' in native
                    assert '<form' not in latest[0], "the article index is reading navigation, not another search form"
                    for entry in entries:
                        targets.extend(html.unescape(target) for target in re.findall(r'<h2 class="reading-list__title"><a href="([^"]+)"', entry))
                        if "Scale " in entry:
                            assert any(link.get("href") == "https://writer.example.test/" and "author" in link.get("rel", "").split() for link in native_links(entry))
                            assert 'datetime="2026-' in entry and 'Writer One &amp; Co' in entry
                    assert native.count('<h1') == 1
                    assert '<title>' in native and 'page-identity' not in native
                    assert 'listing-controls--top' in native and 'listing-controls--bottom' in native
                    assert native.index('listing-controls--top') < native.index('class="reading-list"') < native.index('listing-controls--bottom')
                    controls = [link for link in native_links(native) if "listing-control" in link.get("class", "").split()]
                    current_pages = [link for link in controls if link.get("aria-current") == "page"]
                    assert len(current_pages) == 2 and all(link["text"] == str(page_number) for link in current_pages)
                    current_sorts = [link for link in controls if link.get("aria-current") == "true"]
                    assert len(current_sorts) == 1
                    assert all(link["text"] == ("Latest" if variant == "descending" else "Oldest") for link in current_sorts)
                    sort_targets = {link["text"]: link["href"] for link in controls if link["text"] in ("Latest", "Oldest")}
                    assert sort_targets == {"Latest": base_url + "other/", "Oldest": base_url + "other/oldest/"}
                    number_links = [link for link in controls if link["text"].isdigit()]
                    assert 2 <= len(number_links) <= 14  # Two bounded native navigation windows.
                assert len(targets) == len(set(targets)), "pagination repeated an article"
                featured = base_url + "scale-099/"
                assert featured not in targets, "the featured article is not repeated in the deck"
                scale_targets = [target for target in targets if "/scale-" in target]
                expected = [base_url + f"scale-{index:03}/" for index in range(99)]
                assert scale_targets == (list(reversed(expected)) if variant == "descending" else expected)
                assert len(index_files) >= 7
                assert 'rel="next"' in index_files[0].read_text()
                assert 'rel="prev"' in index_files[-1].read_text()
                assert 'listing-pagination__gap' in index_files[0].read_text()
                order_targets[variant] = targets
            assert set(order_targets["ascending"]) == set(order_targets["descending"])
            print("PASS:100 varied-date articles,15 per page, whole-corpus Latest/Oldest order, unique membership, paired native controls and bounded page windows")
            print("scale output:", scaled_output)

    finally:
        if args.keep:
            print("fixture retained:", work)
        else:
            shutil.rmtree(work)


if __name__ == "__main__":
    main()
