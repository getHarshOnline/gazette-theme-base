#!/usr/bin/env python3
"""Render documentation navigation and its ordinary-page boundaries with Gazette."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from reading import SHELL_RESOURCES, BASE, CHROME, Document, nodes, page, run, text


def classes(document, name):
    return [node for node in nodes(document) if name in node['attrs'].get('class', '').split()]


def declarations(source, value):
    return source.replace('+++\n[content]', f'+++\n{value}\n[content]', 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True, type=Path)
    parser.add_argument('--preview-port', type=int)
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    if args.preview_port is not None and not 1 <= args.preview_port <= 65535:
        parser.error('--preview-port must be between 1 and 65535')
    binary = str(args.gazette.resolve(strict=True))
    work = Path(tempfile.mkdtemp(prefix='base-documentation-'))
    try:
        content, stages, theme = work / 'content', work / 'stages', work / 'base'
        content.mkdir()
        stages.mkdir()
        shutil.copytree(BASE, theme, ignore=shutil.ignore_patterns('.git', '__pycache__'))
        manifest = theme / 'presentation.toml'
        manifest.write_text(manifest.read_text().replace('resource_requirements = [', 'resource_requirements = ["stylesheet:base-tokens", ', 1))
        article = '{kind="page",family={kind="article"}}'
        documentation = '{kind="page",family={kind="documentation"}}'
        root = '{kind="collection",purpose="documentation",navigation=[{content="page:z-first"},{group="Get started",pages=[{content="page:begin"}]},{group="Maintain",pages=[{group="Settings",pages=[{content="collection:reference"}]}]}]}'
        nested = '{kind="collection",parent="collection:manual",navigation=[{content="page:configuration"},{content="journey:review"},{content="page:recovery"}]}'
        payloads = {
            'manual': declarations(page('collection:manual', 'Sample manual', '/manual/', root), 'projects=[{project="project:sample",kind="about"}]'),
            'first': declarations(page('page:z-first', 'Choose the workspace', '/manual/first/', article), 'collections=["collection:manual"]'),
            'begin': declarations(page('page:begin', 'Begin a workspace', '/manual/begin/', article), 'collections=["collection:manual"]'),
            'reference': page('collection:reference', 'Configuration and recovery', '/manual/reference/', nested),
            # Native Notes belong to an Article-family bundle. Its collection
            # supplies documentation purpose independently of that page family.
            'configuration': declarations(page('page:configuration', 'Configure a workspace', '/manual/configuration/', article, attribution='attributions=[{principal="person:publisher",role="author"}]\ncitation={text="Example author. Configure a workspace.",bibtex="reference.bib"}'), 'collections=["collection:reference"]'),
            'review': page('journey:review', 'Review a change', '/manual/review/', '{kind="journey",collection="collection:reference",members=[{content="page:observe",primary=true},{content="page:revise",primary=true}]}'),
            'observe': page('page:observe', 'Observe the result', '/manual/observe/', documentation),
            'revise': page('page:revise', 'Revise the change', '/manual/revise/', documentation),
            'recovery': declarations(page('page:recovery', 'Recover an interrupted change', '/manual/recovery/', documentation), 'collections=["collection:reference"]'),
            'standalone': page('page:standalone', 'A standalone guide', '/standalone/', documentation),
            'empty': page('collection:empty', 'An empty manual', '/empty-manual/', '{kind="collection",purpose="documentation"}'),
            'argument': page('page:argument', 'An ordinary argument', '/argument/', article),
            'ordinary': page('collection:ordinary', 'An ordinary collection', '/ordinary/', '{kind="collection"}'),
            'ordinary-member': declarations(page('page:ordinary-member', 'An ordinary collection member', '/ordinary/member/', article), 'collections=["collection:ordinary"]'),
            'home': page('page:home', 'A publication entrance', '/', '{kind="page",family={kind="project"}}'),
        }
        payloads['begin'] += '\n## Create the workspace\n\nKeep this directory for the next change.\n\n### Choose a location\n\nChoose a directory you can edit.\n\n## Continue\n\n[Configure it](/manual/configuration/).\n'
        payloads['configuration'] += '''
## Choose the setting

![Two input regions connected to one output region](diagram.svg)

| Setting | Effect |
| --- | --- |
| `workspace` | Selects the workspace to inspect |
| `output` | Chooses the local destination |

## Inspect the result

```text
An illustrative output, not a command to execute.
```

Keep the explanation beside the result.[^detail]

[^detail]: Retain the condition that changes its interpretation.
'''
        payloads['standalone'] += '\n### A local detail\n\nA lower-level heading has a real section destination.\n'
        payloads['manual'] += '\n## Use the guides\n\n::: container-contents\n:::\n\n## Questions before you begin\n\nThe guides above explain the individual tasks.\n'
        payloads['review'] += '\n::: container-contents\n:::\n\n## Finish the review\n\nKeep the result with the work.\n'
        payloads['empty'] += '\n::: container-contents\n:::\n'
        payloads['argument'] += '\n## Develop the argument\n\nThis ordinary article retains its original reading frame.\n'
        for slug, source in payloads.items():
            bundle = content / slug
            bundle.mkdir()
            (bundle / 'index.md').write_text(source)
        (content / 'configuration' / 'notes.md').write_text('# An extended example\n\nThe optional explanation stays with this page.\n')
        (content / 'configuration' / 'reference.bib').write_text('@misc{sample,title={Configure a workspace}}\n')
        (content / 'configuration' / 'diagram.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240"><rect x="20" y="20" width="180" height="80" fill="#ddd"/><rect x="20" y="140" width="180" height="80" fill="#ddd"/><path d="M200 60L420 120M200 180L420 120" fill="none" stroke="#456" stroke-width="4"/><rect x="420" y="80" width="200" height="80" fill="#456"/></svg>')
        base_url = f'http://127.0.0.1:{args.preview_port}/' if args.preview_port else 'https://example.test/'
        parts = [
            '[composition]\ntheme={package="theme:base"}\npage_templates={"collection:manual"="base/product.html"}',
            CHROME.replace('"base:outline" = "On this page"', '"base:outline" = "On this page"\n"base:documentation-contents" = "Guides"'),
            '[[projects]]\nid="project:sample"\nname="Sample product"\nlifecycle="active"\nvisibility="public"\navailability="unavailable"\nresources={landing="collection:manual",learn="collection:manual"}',
            '[[principals]]\nid="person:publisher"\nkind="person"\nname="Example author"',
            '[[sites]]\nid="site:reading"\npublisher="person:publisher"\ndeployable=false',
            '[[brands]]\nid="brand:reading"\nname="Documentation specimen"',
            f'[[brands.publications]]\nsite="site:reading"\nhome="page:home"\npublic_base_url={json.dumps(base_url)}\nauthored=[{{source="source:content",target="authored"}}]',
            'machine={markdown_alternates={enabled=true,directory_page="index.md",file_page="append-md",media_type="text/markdown",discovery_rel="alternate"}}',
            f'[[sources]]\nid="source:content"\nlocation={{kind="filesystem",root={json.dumps(str(content))}}}',
            f'[[sources]]\nid="source:base"\nlocation={{kind="filesystem",root={json.dumps(str(theme))}}}',
            '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
            '[composition.resources]',
        ]
        for resource, output, use in [('stylesheet:base-tokens', 'base.css', 'site'), ('stylesheet:physics', 'physics.css', 'site'), *SHELL_RESOURCES]:
            parts.append(f'"{resource}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{resource}"}},output="/assets/{output}",use="{use}"}}')
        source = '\n'.join(parts)
        (work / 'workspace.toml').write_text(source)
        result = run(binary, ['render-site', '--local', '--site', 'site:reading', '--model-output', 'model.json', '--output-parent', str(stages)], source)
        output = Path(result['directory'])
        model = json.loads((output / 'model.json').read_text())
        documents = {slug: Document((output / route).read_text()).root for slug, route in {
            'manual': 'manual/index.html', 'begin': 'manual/begin/index.html', 'configuration': 'manual/configuration/index.html',
            'standalone': 'standalone/index.html', 'empty': 'empty-manual/index.html', 'argument': 'argument/index.html', 'home': 'index.html',
            'reference': 'manual/reference/index.html', 'review': 'manual/review/index.html',
            'ordinary': 'ordinary/index.html', 'ordinary-member': 'ordinary/member/index.html',
        }.items()}
        for slug in ('begin', 'configuration', 'standalone'):
            document = documents[slug]
            assert len(classes(document, 'reading-document')) == 1, slug
            assert not classes(document, 'documentation-document'), slug
            assert len(classes(document, 'reading-sidebar')) == 1, slug
            assert any(node['tag'] == 'html' and node['attrs'].get('data-page-mode') == 'reading' for node in nodes(document)), slug
            assert len([node for node in nodes(document) if node['tag'] == 'h1']) == 1, slug
        navigation = classes(documents['begin'], 'reading-corpus')
        assert len(navigation) == 1
        links = [node for node in nodes(navigation[0]) if node['tag'] == 'a']
        assert [text(node) for node in links] == ['Collection overview', 'Choose the workspace', 'Begin a workspace', 'Configuration and recovery', 'Configure a workspace', 'Review a change', 'Observe the result', 'Revise the change', 'Recover an interrupted change']
        assert [node['attrs']['href'] for node in links] == [base_url + path for path in ('manual/', 'manual/first/', 'manual/begin/', 'manual/reference/', 'manual/configuration/', 'manual/review/', 'manual/observe/', 'manual/revise/', 'manual/recovery/')]
        assert [node['attrs'].get('data-gazette-destination-content') for node in links] == ['collection:manual', 'page:z-first', 'page:begin', 'collection:reference', 'page:configuration', 'journey:review', 'page:observe', 'page:revise', 'page:recovery']
        assert [text(node) for node in links if node['attrs'].get('aria-current') == 'page'] == ['Begin a workspace']
        assert [text(node) for node in classes(navigation[0], 'reading-orientation__label')] == ['Get started', 'Maintain', 'Settings']
        assert not classes(documents['standalone'], 'reading-corpus'), 'no fabricated outline for a standalone guide'
        assert not classes(documents['empty'], 'reading-corpus') and not classes(documents['empty'], 'quote-deck'), 'an empty collection reserves no empty navigation region'
        assert 'A local detail' in text(classes(documents['standalone'], 'reading-outline')[0]), 'H3-only pages retain section navigation'
        configuration = documents['configuration']
        assert len(classes(configuration, 'reading-notes')) == 1
        sidebar = classes(configuration, 'reading-sidebar')[0]
        assert 'Example author' in text(sidebar)
        assert 'Example author. Configure a workspace.' in text(configuration)
        assert len(classes(configuration, 'reading-citation')) == 1
        assert any(node['tag'] == 'a' and text(node) == 'BibTeX' for node in nodes(configuration))
        assert any(node['tag'] == 'table' for node in nodes(configuration))
        assert any(node['tag'] == 'pre' for node in nodes(configuration))
        assert classes(configuration, 'footnote-ref'), 'the original footnote reference remains usable'
        assert any(node['tag'] == 'img' and node['attrs'].get('alt') == 'Two input regions connected to one output region' for node in nodes(configuration))
        assert classes(documents['argument'], 'reading-document') and not classes(documents['argument'], 'documentation-document')
        assert not classes(documents['home'], 'documentation-document')
        assert not classes(documents['manual'], 'documentation-document'), 'a configured product entrance retains its selected composition'
        assert [text(node) for node in classes(documents['manual'], 'folder-card__title')] == ['Choose the workspace', 'Begin a workspace', 'Configuration and recovery'], 'collection entrance keeps authored order instead of identity order and excludes descendants'
        assert [text(node) for node in classes(documents['manual'], 'container-contents__group-title')] == ['Get started', 'Maintain', 'Settings'], 'authored groups and nested groups survive the shared deck'
        assert len(classes(documents['manual'], 'quote-deck--folder')) == 3, 'ungrouped and grouped direct children keep their positions'
        manual_headings = [text(node) for node in nodes(documents['manual']) if node['tag'] == 'h2']
        assert manual_headings.index('Use the guides') < manual_headings.index('Guides') < manual_headings.index('Questions before you begin'), 'the native slot places the same guides before later authored sections'
        assert len(classes(documents['manual'], 'container-contents')) == 1, 'an authored slot suppresses the default appended copy'
        assert 'container_contents_placed' not in model['pages']['collection:manual'], 'placement stays out of discovery metadata'
        manual_reading = (output / 'manual/index.md').read_text()
        assert manual_reading.count('[Choose the workspace]') == 1, 'Markdown has one contents list'
        assert manual_reading.index('Use the guides') < manual_reading.index('[Choose the workspace]') < manual_reading.index('Questions before you begin'), 'Markdown keeps the authored contents position too'
        ordered_labels = ['[Choose the workspace]', 'Get started', '[Begin a workspace]', 'Maintain', 'Settings', '[Configuration and recovery]']
        positions = [manual_reading.index(label) for label in ordered_labels]
        assert positions == sorted(positions), 'Markdown preserves the authored child order and intervening groups'
        ids = [node['attrs']['id'] for node in nodes(documents['manual']) if node['attrs'].get('id')]
        assert len(ids) == len(set(ids)), 'separate group decks need unique card labels'
        assert all(node['attrs']['aria-labelledby'] in ids for node in classes(documents['manual'], 'folder-card'))
        assert all(node['attrs']['aria-describedby'] in ids for node in classes(documents['manual'], 'folder-card') if node['attrs'].get('aria-describedby'))
        assert not classes(documents['manual'], 'documentation-directory')
        for slug, mode in [('reference', 'index'), ('ordinary', 'index'), ('review', 'sequence')]:
            document = documents[slug]
            assert not classes(document, 'documentation-document') and not classes(document, 'reading-document')
            assert len(classes(document, 'reading-page-header')) == 1
            assert any(node['tag'] == 'html' and node['attrs'].get('data-page-mode') == mode for node in nodes(document)), slug
            assert len(classes(document, 'quote-deck--folder')) == 1, slug
        assert [text(node) for node in classes(documents['reference'], 'folder-card__title')] == ['Configure a workspace', 'Review a change', 'Recover an interrupted change'], 'nested collection uses its own outline without copying journey descendants'
        assert [text(node) for node in classes(documents['review'], 'folder-card__title')] == ['Observe the result', 'Revise the change'], 'journey retains declared step order'
        assert 'container_contents_placed' not in model['pages']['journey:review'], 'journey placement stays out of discovery metadata'
        assert len([node for node in nodes(documents['review']) if node['tag'] == 'ol' and 'quote-deck__stage' in node['attrs'].get('class', '')]) == 1, 'an inline journey uses one ordered deck'
        assert model['pages']['page:begin']['content']['documentation'] is True, 'Article family does not erase documentation purpose'
        assert model['pages']['page:ordinary-member']['content'].get('documentation', False) is False
        assert len(classes(documents['ordinary-member'], 'reading-document')) == 1
        assert len(classes(documents['ordinary-member'], 'reading-corpus')) == 1
        assert not any('documentation-' in node['attrs'].get('class', '') for document in documents.values() for node in nodes(document))
        print('PASS: authored groups/order/current destination, nested container and ordered journey, Article-family guide, no-outline fallback, H3 sections, attribution/citation/download, Notes/footnotes/code/table, ordinary article, Home and selected product entrance')
        print(f'native output: {output}')
        print('Browser reading, responsive states and design quality require separate inspection.')
    finally:
        if not args.keep:
            shutil.rmtree(work)


if __name__ == '__main__':
    main()
