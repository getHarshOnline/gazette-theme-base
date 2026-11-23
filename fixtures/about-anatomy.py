#!/usr/bin/env python3
"""Render an About composition with authored and fallback titles and semantic child roles."""
import argparse
import json
import re
from pathlib import Path
import shutil
import tempfile
import tomllib
from reading import SHELL_RESOURCES, BASE, CHROME, Document, nodes, run, text


def source(name, count):
    choices = '\n'.join(f'''  - component: about-choice
    heading:
      level: 3
      text: Choice {number}
    body: |
      A distinct useful choice.
''' for number in range(1, count + 1))
    return f'''format: gazette-landing/v1
content:
  id: content:{name}
  site: site:specimen
  title: A shared account
  lifecycle: draft
  language: en
  route:
    path: /{name}/
  structure:
    kind: page
    family:
      kind: utility
sections:
- component: about-opening
  sections:
  - component: about-copy
    body: |
      One premise deserves a clear introduction.
  - component: about-context
    body: |
      Its context retains a separate role without requesting columns.
- component: about-choices
  heading:
    level: 2
    text: Meaningful choices
  sections:
{choices}
  - component: about-conclusion
    sections:
    - component: about-copy
      body: |
        The premise and its qualification remain paired.
    - component: about-context
      body: |
        The qualification does not become another choice.
- component: about-section
  heading:
    level: 2
    text: A narrative section
  sections:
  - component: about-copy
    body: |
      This prose stays beside its heading.
- component: about-conclusion
  body: |
    An ordinary conclusion keeps its own simple reading shape.
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True)
    parser.add_argument('--theme', type=Path)
    parser.add_argument('--template', default='base/about.html')
    parser.add_argument('--resource-bindings', type=Path)
    parser.add_argument('--preview-port', type=int)
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    if args.resource_bindings and not args.theme:
        parser.error('--resource-bindings requires --theme')
    if args.preview_port is not None and not 1 <= args.preview_port <= 65535:
        parser.error('--preview-port must be between 1 and 65535')
    work = Path(tempfile.mkdtemp(prefix='base-about-anatomy-'))
    try:
        base, content, stages = work / 'base', work / 'content', work / 'stages'
        shutil.copytree(BASE, base, ignore=shutil.ignore_patterns('.git', '__pycache__'))
        content.mkdir(); stages.mkdir()
        for name, count in [('pair', 2), ('trio', 3), ('four', 4)]:
            page = source(name, count)
            if name == 'trio':
                page = page.replace('- component: about-opening\n', '- component: about-opening\n  heading: {level: 1, text: An authored opening}\n')
            (content / f'{name}.landing.yaml').write_text(page)
        world = tomllib.loads((args.theme / 'presentation.toml').read_text()) if args.theme else None
        package = world['package'] if world else 'theme:base'
        base_url = f'http://127.0.0.1:{args.preview_port}/' if args.preview_port else 'https://specimen.example.test/'
        if not world:
            manifest = base / 'presentation.toml'
            manifest.write_text(manifest.read_text().replace('resource_requirements = [', 'resource_requirements = ["stylesheet:base-tokens", '))
        config = '\n'.join([
            '[composition]', f'theme={{package={json.dumps(package)}}}',
            'page_templates={' + ','.join(f'"content:{name}"={json.dumps(args.template)}' for name in ('pair', 'trio', 'four')) + '}', CHROME,
            '[[principals]]\nid="person:owner"\nkind="person"',
            '[[sites]]\nid="site:specimen"\npublisher="person:owner"\ndeployable=false',
            '[[brands]]\nid="brand:specimen"\nname="Specimen"',
            f'[[brands.publications]]\nsite="site:specimen"\npublic_base_url={json.dumps(base_url)}\nauthored=[{{source="source:content",target="content"}}]',
            f'[[sources]]\nid="source:content"\nlocation={{kind="filesystem",root={json.dumps(str(content))}}}',
            f'[[sources]]\nid="source:base"\nlocation={{kind="filesystem",root={json.dumps(str(base))}}}',
            '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
            '[composition.resources]',
            *[f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}' for identity, output, use in [('stylesheet:physics', 'physics.css', 'site'), *SHELL_RESOURCES, ('module:bookmark-card', 'bookmark-card.js', 'dependency')]],
        ])
        if world:
            requirements = set(world['resource_requirements'])
            own_resources = {resource['id']: resource for resource in world['resources']}
            base_resources = {resource['id']: resource for resource in tomllib.loads((base / 'presentation.toml').read_text())['resources']}
            for identity in sorted(requirements):
                owner = package if identity in own_resources else 'theme:base'
                resource = (own_resources if owner == package else base_resources)[identity]
                extension = {'stylesheet': 'css', 'woff2-font': 'woff2', 'svg-image': 'svg'}[resource['build']['kind']]
                config += f'\n"{identity}"={{state="enabled",resource={{owner={{kind="theme",package={json.dumps(owner)}}},resource="{identity}"}},output="/assets/{identity.replace(":", "-")}.{extension}",use="site"}}'
            config += f'\n[[sources]]\nid="source:world"\nlocation={{kind="filesystem",root={json.dumps(str(args.theme.resolve()))}}}'
            bindings = json.loads(args.resource_bindings.read_text()) if args.resource_bindings else []
            inputs, sources = {}, []
            for index, binding in enumerate(bindings):
                name = f'input-{index}'
                sources.append(f'[[sources]]\nid="source:{name}"\nlocation={{kind="filesystem",root={json.dumps(binding["root"])}}}')
                for target, entry in binding['entries'].items():
                    inputs[target] = f'{{input="{name}",entry={json.dumps(entry)}}}'
            config += f'\n[[theme_packages]]\npackage={json.dumps(package)}\nsource="source:world"\nmanifest="presentation.toml"'
            if inputs:
                config += '\nresource_inputs={' + ','.join(f'{json.dumps(k)}={v}' for k, v in inputs.items()) + '}'
                config += '\n' + '\n'.join(sources) + '\n[design_inputs]\n' + '\n'.join(f'input-{i}="source:input-{i}"' for i in range(len(bindings)))
        else:
            config += '\n"stylesheet:base-tokens"={state="enabled",resource={owner={kind="theme",package="theme:base"},resource="stylesheet:base-tokens"},output="/assets/base.css",use="site"}'
        (work / 'workspace.toml').write_text(config)
        result = run(args.gazette, ['render-site', '--local', '--site', 'site:specimen', '--output-parent', str(stages)], config)
        output = Path(result['directory'])
        for name, count in [('pair', 2), ('trio', 3), ('four', 4)]:
            html = (output / name / 'index.html').read_text()
            tree = Document(html).root
            all_nodes = list(nodes(tree))
            titles = [node for node in all_nodes if node['tag'] == 'h1']
            assert len(titles) == 1
            assert text(titles[0]) == ('An authored opening' if name == 'trio' else 'A shared account')
            assert 'page-accessible-title' not in titles[0]['attrs'].get('class', '').split(), 'the page title is visible, whether authored or supplied by metadata'
            group = next(node for node in all_nodes if 'about-choices' in node['attrs'].get('class', '').split())
            choices = [node for node in nodes(group) if 'about-choice' in node['attrs'].get('class', '').split()]
            assert len(choices) == count
            assert 'about-field' not in html and 'about-choices--' not in html and 'about-conclusion--' not in html
            pair = next(node for node in all_nodes if 'about-opening' in node['attrs'].get('class', '').split())
            expected_children = ([None] if name == 'trio' else []) + ['about-copy prose-flow', 'about-context prose-flow']
            assert [node['attrs'].get('class') for node in pair['children'] if isinstance(node, dict)] == expected_children
            assert text(tree).count('One premise deserves a clear introduction.') == 1
            assert text(tree).count('An ordinary conclusion keeps its own simple reading shape.') == 1
        css = (output / 'assets/physics.css').read_text()
        assert ':has(>.about-copy):has(>.about-context)' in css.replace(' ', '')
        for count in (2, 3):
            assert re.search(rf':nth-child\({count} of :is\(\.about-choice,\s*\[data-gazette-component=about-choice\]\)\)', css)
        assert '.about-field' not in css and '.about-choices--pair' not in css
        print(json.dumps({'native_about_anatomy': 'passed', 'choice_counts': [2, 3, 4], 'layout_arguments': 0}))
        print('native output:', output)
    finally:
        if args.keep:
            print('fixture retained:', work)
        else:
            shutil.rmtree(work)


if __name__ == '__main__':
    main()
