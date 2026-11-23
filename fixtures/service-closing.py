#!/usr/bin/env python3
"""Verify workspace-selected invitations and independent footer links in native output."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
from reading import SHELL_RESOURCES, BASE, CHROME, Document, nodes, run, text


def document(identity, route, family, title, body):
    structure = family if family.startswith("{") else f'{{kind="page",family={{kind="{family}"}}}}'
    return f'''+++
[content]
id = "{identity}"
site = "site:specimen"
title = "{title}"
lifecycle = "draft"
language = "en"
route = {{path = "{route}"}}
structure = {structure}
+++
# {title}

{body}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='base-service-closing-') as folder:
        work = Path(folder)
        stages = work / 'stages'
        stages.mkdir()
        base = work / 'base'
        shutil.copytree(BASE, base, ignore=shutil.ignore_patterns('.git', '__pycache__'))
        content = work / 'content'
        content.mkdir()
        pages = {
            'product': ('project', 'Product', '## Questions\n\nThe final answer remains authored.'),
            'directory': ('index', 'Directory', '## Choices\n\nThe selection remains authored.'),
            'about': ('utility', 'About', 'The account remains authored.'),
            'home': ('index', 'Home', 'The home remains free of an automatic closing.'),
            'article': ('article', 'Article', 'An ordinary reading page.'),
            'chapter': ('article', 'Chapter', 'An article within a collection follows the article choice.'),
            'documentation': ('documentation', 'Documentation', 'Instructions remain focused on the reader.'),
            'paper': ('article', 'Research paper', 'A neutral research reading specimen.'),
            'story': ('article', 'Story', 'A neutral fictional reading specimen.'),
            'selected': ('article', 'Selected enquiry', 'This exact page has an explicitly selected closing.'),
            'collection': ('{kind="collection"}', 'Collection', 'An authored collection entrance.'),
            'journey': ('{kind="journey",collection="content:collection",members=[{content="content:chapter",primary=true}]}', 'Journey', 'An ordered reading path.'),
            'services': ('utility', 'Services', '## Discuss the work\n\n[Email the studio](mailto:enquiry@example.test)\n\n## A useful engagement\n\nAn agreed scope.\n\n## Discuss the work\n\n[Email the studio](mailto:enquiry@example.test)'),
        }
        for name, (family, title, body) in pages.items():
            (content / f'{name}.md').write_text(document(f'content:{name}', f'/{name}/', family, title, body))
        selections = {'product': 'product.html', 'directory': 'product-listing.html', 'about': 'about.html', 'home': 'page.html', 'services': 'article-closing.html', 'selected': 'article-closing.html', 'article': 'landing.html', 'collection': 'landing.html', 'journey': 'landing.html'}
        config = '\n'.join([
            '[composition]', 'theme={package="theme:base"}',
            'footer=[{key="base:services",label="Services",destination="content:services"}]',
            '[composition.page_templates]',
            *[f'"content:{key}"="base/{template}"' for key, template in selections.items()],
            CHROME,
            '[[principals]]\nid="person:owner"\nkind="person"',
            '[[sites]]\nid="site:specimen"\npublisher="person:owner"\ndeployable=false',
            '[[brands]]\nid="brand:specimen"\nname="Specimen"',
            '[[brands.publications]]\nsite="site:specimen"\npublic_base_url="https://specimen.example.test/"\nhome="content:home"\nauthored=[{source="source:content",target="content"}]',
            f'[[sources]]\nid="source:content"\nlocation={{kind="filesystem",root={json.dumps(str(content))}}}',
            f'[[sources]]\nid="source:base"\nlocation={{kind="filesystem",root={json.dumps(str(base))}}}',
            '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
            '[composition.resources]',
            *[f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}' for identity, output, use in [('stylesheet:physics', 'physics.css', 'site'), *SHELL_RESOURCES, ('module:enquiry-context', 'enquiry-context.js', 'site')]],
        ])
        enabled = 'invitations={"base:services"={state="enabled",destination="content:services",articles=true,pages={"content:product"=true,"content:directory"=true,"content:about"=true,"content:paper"=false,"content:story"=false}}}'
        exact = 'invitations={"base:services"={state="enabled",destination="content:services",articles=false,pages={"content:selected"=true,"content:services"=true}}}'
        cases = [
            ('articles-and-pages', enabled, False, False, {'article', 'chapter', 'selected', 'product', 'directory', 'about'}),
            ('site-disabled', enabled, True, True, set()),
            ('footer-only', '', True, False, set()),
            ('exact-page', exact, True, False, {'selected'}),
        ]
        for case, invitations, footer_available, site_disabled, expected_pages in cases:
            selected = config.replace('[composition]\n', '[composition]\n' + invitations + '\n')
            if not footer_available:
                selected = selected.replace('footer=[{key="base:services",label="Services",destination="content:services"}]', 'footer=[]')
            if site_disabled:
                selected = selected.replace('[[sites]]\n', '[[sites]]\ncomposition.invitations."base:services"={state="disabled"}\n')
            result = run(args.gazette, ['render-site', '--local', '--site', 'site:specimen', '--graph-output', 'graph/index.html', '--output-parent', str(stages)], selected)
            output = Path(result['directory'])
            for name in pages:
                html = (output / name / 'index.html').read_text()
                tree = Document(html).root
                titles = [node for node in nodes(tree) if node['tag'] == 'h1']
                assert len(titles) == 1 and text(titles[0]) == pages[name][1], (case, name)
                closings = [node for node in nodes(tree) if 'services-closing' in node['attrs'].get('class', '').split()]
                assert len(closings) == int(name in expected_pages), (case, name, len(closings))
                bindings = [node for node in nodes(tree) if node['attrs'].get('id') == 'enquiry-context']
                has_binding = footer_available or bool(invitations) and not site_disabled
                assert len(bindings) == int(has_binding), (case, name, 'enquiry binding')
                modules = [node for node in nodes(tree) if node['tag'] == 'script' and node['attrs'].get('src', '').endswith('/assets/enquiry-context.js')]
                assert len(modules) == int(has_binding), (case, name, 'enquiry module')
                if bindings:
                    assert bindings[0]['tag'] == 'script' and bindings[0]['attrs'].get('type') == 'application/json'
                    binding = json.loads(text(bindings[0]))
                    assert binding['source'] == {'site': 'site:specimen', 'content': f'content:{name}', 'url': f'https://specimen.example.test/{name}/'}, (case, name, binding)
                    assert binding['destination'] == {'site': 'site:specimen', 'content': 'content:services', 'url': 'https://specimen.example.test/services/'}, (case, name, binding)
                if closings:
                    links = [node for node in nodes(closings[0]) if node['tag'] == 'a']
                    assert len(links) == 1 and links[0]['attrs']['href'] == 'https://specimen.example.test/services/'
                    assert text(links[0]).strip() == 'Learn more'
                    assert 'Work with our studio' in text(closings[0])
                    motions = [node for node in nodes(closings[0]) if 'data-focus-reveal' in node['attrs']]
                    assert len(motions) == 1 and motions[0]['attrs'].get('data-focus-mode') == 'once'
                    invitation = next(node for node in nodes(motions[0]) if 'services-invitation' in node['attrs'].get('class', '').split())
                    assert 'focus-reveal__content' in invitation['attrs'].get('class', '').split()
                    assert next(child for child in invitation['children'] if isinstance(child, dict))['tag'] == 'h2'
                    assert 'control--primary' in links[0]['attrs'].get('class', '').split()
                    assert not any(node['attrs'].get('hidden') is not None for node in nodes(invitation)), 'no-JS invitation remains visible'
                    assert html.index('services-closing') > html.index('publication-body')
                    assert html.index('services-closing') < html.index('frame__footer')
                    for article in (node for node in nodes(tree) if node['tag'] == 'article'):
                        assert not any(node is closings[0] for node in nodes(article))
                        assert html.index('</article>') < html.index('services-closing')
                footer = next(node for node in nodes(tree) if node['tag'] == 'footer')
                service_links = [node for node in nodes(footer) if node['tag'] == 'a' and node['attrs'].get('href') == 'https://specimen.example.test/services/']
                assert len(service_links) == int(footer_available), (case, name, 'footer links')
                if name == 'services':
                    assert html.count('href="mailto:enquiry@example.test"') == 2
            for path in ('404.html', 'graph/index.html'):
                tree = Document((output / path).read_text()).root
                assert not any('services-closing' in node['attrs'].get('class', '').split() for node in nodes(tree)), (case, path)
                assert not any(node['attrs'].get('id') == 'enquiry-context' or node['attrs'].get('src', '').endswith('/assets/enquiry-context.js') for node in nodes(tree)), (case, path, 'enquiry binding or module')
        print(json.dumps({'native_closing_slots': 'passed', 'cases': (len(pages) + 2) * len(cases), 'contact_actions_preserved': 2}))


if __name__ == '__main__':
    main()
