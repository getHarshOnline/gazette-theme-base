#!/usr/bin/env python3
"""Render consent controls with the actual Gazette SDK, without contacting a provider."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import tempfile
import tomllib

from reading import SHELL_RESOURCES, BASE, CHROME, run
from feeds import page


class Consent(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.fields, self.scripts, self.inputs, self.links = [], [], [], []
        self.binding, self.in_binding = "", False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'fieldset' and 'data-analytics-consent' in attrs:
            self.fields.append(attrs)
        if tag == 'input' and attrs.get('name') == 'analytics-consent':
            self.inputs.append(attrs)
        if tag == 'a':
            self.links.append(attrs)
        if tag == 'script':
            self.scripts.append(attrs)
            self.in_binding = 'data-analytics-binding' in attrs

    def handle_data(self, data):
        if self.in_binding:
            self.binding += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_binding = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True)
    parser.add_argument('--sdk', type=Path, required=True, help='Gazette sdk/js/browser-resources.toml')
    parser.add_argument('--base-url', default='https://example.test/', help='Local origin for optional headed browser inspection')
    parser.add_argument('--keep', action='store_true', help='Keep neutral pages for browser testing')
    args = parser.parse_args()
    sdk = args.sdk.resolve(strict=True)
    sdk_manifest = tomllib.loads(sdk.read_text())
    sdk_package = sdk_manifest['package']
    sdk_inputs = sorted({sdk.name, *(entry for resource in sdk_manifest['resources'].values() for entry in resource['inputs'])})
    work = Path(tempfile.mkdtemp(prefix='base-analytics-'))
    try:
        content = work / 'content'
        content.mkdir()
        (content / 'home.md').write_text(page('page:home', 'A neutral article', '/', 'article'))
        (content / 'privacy.md').write_text(page('page:privacy', 'Privacy', '/privacy/', 'utility'))
        copy = {key: key.title() for key in ['title', 'description', 'allow', 'decline', 'privacy', 'off', 'loading', 'on', 'failed', 'reload', 'reload-action', 'storage']}
        failures = []
        for name in ['enabled', 'disabled', 'missing-privacy', 'missing-copy']:
            stages = work / name
            stages.mkdir()
            enabled = name != 'disabled'
            chrome = CHROME
            footer = '\nfooter=[{key="base:privacy",label="Privacy",destination="page:privacy"}]' if name != 'missing-privacy' else ''
            chrome += '\n' + '\n'.join(f'"base:analytics-{key}"={json.dumps(value)}' for key, value in copy.items() if name != 'missing-copy' or key != 'title')
            parts = ['[composition]\ntheme={package="theme:base"}' + footer, chrome,
                     '[[principals]]\nid="person:writer"\nkind="person"\nname="A Writer"',
                     '[[sites]]\nid="site:feeds"\npublisher="person:writer"\ndeployable=false',
                     '[[brands]]\nid="brand:feeds"\nname="Neutral publication"',
                     '[[brands.publications]]\nsite="site:feeds"\npublic_base_url=' + json.dumps(args.base_url) + '\nauthored=[{source="source:content",target="authored"}]',
                     'processing={analytics={enabled=' + str(enabled).lower() + ',provider="google-analytics"' + (',measurement_id="G-EXAMPLE"' if enabled else '') + '}}']
            parts.append('[composition.capabilities]\n"publication.analytics/v1"=' + ('{state="enabled",provider={kind="gazette",provider="google-analytics-client"},requirement="required"}' if enabled else '{state="disabled"}'))
            for identity, root in [('source:content', content), ('source:base', BASE)]:
                parts.append(f'[[sources]]\nid="{identity}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
            parts += [f'[[sources]]\nid="source:sdk"\nlocation={{kind="included-filesystem",root={json.dumps(str(sdk.parent))},include={json.dumps(sdk_inputs)}}}',
                      '[composition.plugins]\n' + json.dumps(sdk_package) + '={state="enabled"}',
                      '[[plugin_packages]]\npackage=' + json.dumps(sdk_package) + '\nsource="source:sdk"\nmanifest=' + json.dumps(sdk.name),
                      '[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
                      '[composition.resources]']
            for identity, filename, use in [('stylesheet:base-tokens', 'base.css', 'site'), ('stylesheet:physics', 'physics.css', 'site'), *SHELL_RESOURCES, ('module:analytics-sdk', 'analytics-sdk.js', 'dependency'), ('module:analytics-consent', 'analytics-consent.js', 'site')]:
                owner = '{kind="plugin",package=' + json.dumps(sdk_package) + '}' if identity == 'module:analytics-sdk' else '{kind="theme",package="theme:base"}'
                parts.append(f'"{identity}"={{state="enabled",resource={{owner={owner},resource="{identity}"}},output="/assets/{filename}",use="{use}"}}')
            result = run(args.gazette, ['render-site', '--local', '--site', 'site:feeds', '--graph-output', 'graph/index.html', '--output-parent', str(stages)], '\n'.join(parts))
            output = Path(result['directory'])
            if args.keep:
                print(f'{name}: {output}')
            parsed = Consent((output / 'index.html').read_text())
            active = name == 'enabled'
            assert len(parsed.fields) == int(active), name
            runtime = [script for script in parsed.scripts if script.get('src', '').endswith('/analytics-consent.js')]
            if len(runtime) != int(enabled):
                failures.append(f'{name}: expected {int(enabled)} consent script, found {len(runtime)}')
            graph = Consent((output / 'graph/index.html').read_text())
            assert not graph.fields and not graph.binding, 'identity-less graph must not invent analytics coordinates'
            assert not any(script.get('src', '').endswith('/analytics-consent.js') for script in graph.scripts), 'identity-less graph must not activate analytics'
            assert not any(script.get('src', '').startswith('https://www.googletagmanager.com') for script in parsed.scripts)
            if active:
                assert 'hidden' in parsed.fields[0], 'controls must await working JavaScript'
                assert [item['value'] for item in parsed.inputs] == ['allow', 'decline']
                assert 'checked' in parsed.inputs[1]
                assert json.loads(parsed.binding) == {'binding': {'contract': 'publication-analytics-v1', 'measurement_id': 'G-EXAMPLE'}, 'publicPageUrl': args.base_url, 'coordinates': {'site': 'site:feeds', 'content': 'page:home'}}
                assert any(link.get('href') == args.base_url + 'privacy/' for link in parsed.links)
            else:
                assert not parsed.binding and not parsed.inputs
        assert not failures, '; '.join(failures)
        print('PASS: actual SDK resource, enabled/disabled binding, equal hidden controls, public coordinates, privacy link, missing-copy omission and no provider script in HTML')
        if args.keep:
            print(f'Browser specimens: {work}')
    finally:
        if not args.keep:
            shutil.rmtree(work)


if __name__ == '__main__':
    main()
