#!/usr/bin/env python3
"""Check optional project actions through the supplied native Gazette build."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from reading import SHELL_RESOURCES, BASE, CHROME, Document, nodes, run, text


def page(identity, site, title, route, family, body, facts=""):
    return f'''+++
{facts}
[content]
id="{identity}"
site="{site}"
title="{title}"
lifecycle="draft"
route={{path="{route}"}}
structure={{kind="page",family={{kind="{family}"}}}}
+++
# {title}

{body}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazette", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="base-project-availability-") as directory:
        work = Path(directory)
        content, foreign, stages, base = [work / name for name in ("content", "foreign", "stages", "base")]
        for folder in (content, foreign, stages):
            folder.mkdir()
        shutil.copytree(BASE, base, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        (foreign / "enquiry.md").write_text(page(
            "content:enquiry", "site:services", "Discuss the specimen", "/enquiry/", "utility", "A neutral enquiry destination."
        ))
        (content / "guide.md").write_text(page(
            "content:guide", "site:specimen", "Guide", "/guide/", "documentation", "A distinct useful guide."
        ))
        mentions = page(
            "content:mentions", "site:specimen", "Mentions", "/mentions/", "index", ""
        )
        (content / "mentions.md").write_text(mentions.split("\n+++\n", 1)[0] + "\n+++\n")
        chrome = CHROME + '\n"base:product-available-through"="Available through"\n"base:product-available-through-description"="Discuss access with the provider"\n'
        config = "\n".join([
            '[composition]\ntheme={package="theme:base"}', chrome,
            '[[principals]]\nid="person:owner"\nkind="person"',
            '[[sites]]\nid="site:specimen"\npublisher="person:owner"\ndeployable=false',
            '[[sites]]\nid="site:services"\npublisher="person:owner"\ndeployable=false',
            '[[projects]]\nid="project:specimen"\nlanding="content:specimen"',
            '[[brands]]\nid="brand:specimen"\nname="Specimen"',
            '[[brands.publications]]\nsite="site:specimen"\npublic_base_url="https://specimen.example.test/"\nhome="content:specimen"\nauthored=[{source="source:content",target="content"}]',
            'listings=[{content="content:mentions",select={kind="project-articles",project="project:specimen",landing="content:specimen",scope="ecosystem",residence="all"},order={first=[],remaining="title-then-id"},pagination={page_size=15,next_pages="page/{number}/"}}]',
            '[brands.publications.documentation_repository]\nname="manuals"\npath="manuals"\npublic_base_url="https://docs.example.test/"',
            '[brands.publications.documentation_repository.build]\ntarget={kind="mintlify",theme="mint",primary_color="#112233"}',
            '[[brands.publications.documentation_repository.build.modules]]\nproject="project:specimen"\nslug="specimen"\ntitle="Specimen"\nmanual={source="source:content"}\nnavigation=[{kind="manual",title="Guide",pages=[{title="Start",route="specimen/start",input={kind="file",path="guide.md"}}]}]',
            '[[brands]]\nid="brand:services"\nname="Services"',
            '[[brands.publications]]\nsite="site:services"\npublic_base_url="https://services.example.test/"\nauthored=[{source="source:foreign",target="foreign"}]',
            *[f'[[sources]]\nid="source:{name}"\nlocation={{kind="filesystem",root={json.dumps(str(path))}}}' for name, path in [("content", content), ("foreign", foreign), ("base", base)]],
            '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
            '[composition.resources]',
            *[f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}' for identity, output, use in [("stylesheet:physics", "physics.css", "site"), *SHELL_RESOURCES]],
        ])
        for populated in (True, False):
            facts = '''projects=[{project="project:specimen",kind="about"}]
[project]
id="project:specimen"
name="Neutral specimen"
lifecycle="paused"
visibility="public"
availability="gated"
'''
            if populated:
                facts += '''repository="https://source.example.test/specimen"
resources={learn="content:guide",mentions="content:mentions"}
available_through={site="site:services",content="content:enquiry"}
'''
            (content / "product.md").write_text(page(
                "content:specimen", "site:specimen", "Neutral specimen", "/specimen/", "project",
                "A paused specimen with independently declared access.\n\n:::project-links {}\n:::\n", facts,
            ))
            selected = config if populated else config.replace('public_base_url="https://docs.example.test/"', "")
            result = run(args.gazette, ["render-site", "--local", "--site", "site:specimen", "--output-parent", str(stages)], selected)
            document = Document((Path(result["directory"]) / "specimen/index.html").read_text()).root
            groups = [node for node in nodes(document) if "project-resources" in node["attrs"].get("class", "").split()]
            assert len(groups) == 1
            links = [node for node in nodes(groups[0]) if node["tag"] == "a"]
            buttons = [node for node in nodes(groups[0]) if node["tag"] == "button"]
            if populated:
                assert [text(node).strip() for node in links] == ["Docs", "Learn", "GitHub", "Mentions", "Available through"]
                assert [node["attrs"]["href"] for node in links] == [
                    "https://docs.example.test/specimen/start", "https://specimen.example.test/guide/",
                    "https://source.example.test/specimen", "https://specimen.example.test/mentions/", "https://services.example.test/enquiry/",
                ]
                assert not buttons
                action = links[-1]["attrs"]
                assert action["aria-label"] == "Available through: Neutral specimen · Discuss access with the provider"
                assert action["title"] == "Discuss access with the provider"
                assert "control--primary" in action["class"].split()
                assert action["data-gazette-destination-kind"] == "cross-site"
                assert action["data-gazette-destination-site"] == "site:services"
                assert action["data-gazette-destination-content"] == "content:enquiry"
                assert "crossing-description" in action["aria-describedby"].split()
                assert any(node["attrs"].get("id") == "crossing-description" and "Opens another publication" in text(node) for node in nodes(document))
            else:
                assert not links
                assert [text(node).strip() for node in buttons] == ["GitHub", "Mentions"]
                assert all("disabled" in node["attrs"] for node in buttons)
                assert "No GitHub destination is available." in buttons[0]["attrs"]["aria-label"]
                assert "No mentions index is available." in buttons[1]["attrs"]["aria-label"]
                assert all(label not in text(groups[0]) for label in ("Docs", "Learn", "Available through"))
        print("PASS: native project actions preserve order and cross-site access; absent Docs, Learn and availability are omitted, GitHub and Mentions keep their unavailable states.")


if __name__ == "__main__":
    main()
