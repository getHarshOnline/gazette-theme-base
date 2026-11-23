#!/usr/bin/env python3
"""Check Base's compiled reader-tool binding against Gazette's own SDK package."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import tempfile
import tomllib

from reading import SHELL_RESOURCES, BASE, CHROME, run
from feeds import page


class Binding(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.text, self.inside, self.scripts = '', False, []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.scripts.append(attrs)
            self.inside = attrs.get('id') == 'webmcp-binding'

    def handle_data(self, value):
        if self.inside:
            self.text += value

    def handle_endtag(self, tag):
        if tag == 'script':
            self.inside = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True)
    parser.add_argument('--sdk', type=Path, required=True, help='Gazette sdk/js/browser-resources.toml')
    parser.add_argument('--base-url', default='https://example.test/')
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    sdk = args.sdk.resolve(strict=True)
    manifest = tomllib.loads(sdk.read_text())
    entries = sorted({sdk.name, *(entry for resource in manifest['resources'].values() for entry in resource['inputs'])})
    work = Path(tempfile.mkdtemp(prefix='base-webmcp-'))
    try:
        content = work / 'content'
        content.mkdir()
        hidden = work / 'hidden'
        hidden.mkdir()
        (hidden / 'manual.md').write_text(page('doc:hidden', 'A directly readable manual', '/hidden/', 'documentation'))
        for name, tools, eligible in [('enabled', ['current_page', 'search'], True), ('disabled', [], True), ('current-page', ['current_page'], True), ('search', ['search'], True), ('draft', ['current_page', 'search'], True), ('not-discoverable', ['current_page', 'search'], False)]:
            stages = work / name
            stages.mkdir()
            (content / 'home.md').write_text(page('page:home', 'A neutral reader page', '/', 'article', 'draft' if name == 'draft' else 'published') + '\nThe literal `</script>` marker remains text.\n')
            parts = ['[composition]\ntheme={package="theme:base"}', CHROME,
                     '[[principals]]\nid="person:writer"\nkind="person"\nname="A Writer"',
                     '[[sites]]\nid="site:feeds"\npublisher="person:writer"\ndeployable=false',
                     '[[brands]]\nid="brand:feeds"\nname="Neutral publication"',
                     '[[brands.publications]]\nsite="site:feeds"\npublic_base_url=' + json.dumps(args.base_url) + '\nauthored=[{source="source:content",target="authored"}]\nmachine={search="lexical"}',
                     'processing={webmcp={enabled=' + str(bool(tools)).lower() + (',tools=' + json.dumps(tools) if tools else '') + '}}',
                     '[composition.capabilities]\n"publication.webmcp/v1"=' + ('{state="enabled",provider={kind="gazette",provider="webmcp-client"},requirement="required"}' if tools else '{state="disabled"}')]
            for identity, root in [('source:content', content), ('source:base', BASE)]:
                parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
            if name == 'not-discoverable':
                parts += [f'[[sources]]\nid="source:hidden"\nlocation={{kind="filesystem",root={json.dumps(str(hidden))}}}',
                          '[[projects]]\nid="project:manual"\nlifecycle="active"\nvisibility="public"\navailability="available"',
                          '[[placements]]\nrole="primary"\nsite="site:feeds"\nproject="project:manual"\nrender=true\ndiscoverable=false\ndocuments={source="source:hidden",target="manual"}']
            parts += [f'[[sources]]\nid="source:sdk"\nlocation={{kind="included-filesystem",root={json.dumps(str(sdk.parent))},include={json.dumps(entries)}}}',
                      '[composition.plugins]\n' + json.dumps(manifest['package']) + '={state="enabled"}',
                      '[[plugin_packages]]\npackage=' + json.dumps(manifest['package']) + '\nsource="source:sdk"\nmanifest=' + json.dumps(sdk.name),
                      '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"', '[composition.resources]']
            for identity, filename, use in [('stylesheet:base-tokens', 'base.css', 'site'), ('stylesheet:physics', 'physics.css', 'site'), *SHELL_RESOURCES, ('module:webmcp-sdk', 'webmcp-sdk.js', 'dependency'), ('module:webmcp', 'webmcp.js', 'site')]:
                owner = '{kind="plugin",package=' + json.dumps(manifest['package']) + '}' if identity == 'module:webmcp-sdk' else '{kind="theme",package="theme:base"}'
                parts.append(f'"{identity}"={{state="enabled",resource={{owner={owner},resource="{identity}"}},output="/assets/{filename}",use="{use}"}}')
            result = run(args.gazette, ['render-site', '--local', '--site', 'site:feeds', '--graph-output', 'graph/index.html', '--output-parent', str(stages)], '\n'.join(parts))
            output = Path(result['directory'])
            if args.keep:
                print(f'{name}: {output}')
            rendered_page = (output / ('hidden/index.html' if name == 'not-discoverable' else 'index.html')).read_text()
            assert 'A complete authored account.' in rendered_page, 'discovery exclusion must preserve the readable page'
            parsed = Binding(rendered_page)
            active = bool(tools) and eligible
            assert bool(parsed.text) == active, name
            assert len([script for script in parsed.scripts if script.get('src', '').endswith('/webmcp.js')]) == int(active), name
            if active:
                data = json.loads(parsed.text)
                assert data['binding'] == {'contract': 'publication-webmcp-v1', 'tools': tools}
                assert set(data['currentPage']) == {'content', 'route', 'body_text'}
                assert data['currentPage']['content']['id'] == 'page:home'
                assert data['currentPage']['content']['site'] == 'site:feeds'
                assert data['currentPage']['route']['canonical_url'] == args.base_url
                assert 'A complete authored account.' in data['currentPage']['body_text']
                assert 'Colour mode' not in data['currentPage']['body_text']
                assert '</script>' in data['currentPage']['body_text'] and '</script>' not in parsed.text, 'authored JSON must not terminate its script carrier'
                assert data['search']['profile'] == 'lexical' and data['search']['url'].startswith(args.base_url)
            graph = Binding((output / 'graph/index.html').read_text())
            assert not graph.text and not any(script.get('src', '').endswith('/webmcp.js') for script in graph.scripts), 'generated graph has no authored current page'
        print('PASS: actual WebMCP SDK package, selected tools, public authored projection, compiler search binding, disabled and discovery-excluded omission, eligible draft and identity-less graph')
    finally:
        if not args.keep:
            shutil.rmtree(work)


if __name__ == '__main__':
    main()
