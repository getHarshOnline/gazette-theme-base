#!/usr/bin/env python3
"""Render a world's optional character entrance through Gazette with neutral source media.

The actual world, base and selected modules are used. No publication configuration is changed.
This verifies delivery and native wrapper structure, not browser layout or animation quality.
"""
import argparse
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib
from reading import SHELL_RESOURCES, BASE, CHROME, Document, nodes, run
from frames import png


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gazette', required=True)
    parser.add_argument('--theme', required=True, type=Path)
    parser.add_argument('--resource-bindings', type=Path, help='Optional JSON list of external roots and entries for other declared world inputs')
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    theme = args.theme.resolve()
    manifest = tomllib.loads((theme / 'presentation.toml').read_text())
    work = Path(tempfile.mkdtemp(prefix='native-portrait-'))
    try:
        content = work / 'content'; content.mkdir()
        model = work / 'model'; model.mkdir()
        stages = work / 'stages'; stages.mkdir()
        for i, value in enumerate([32,96,160,224]):
            (content / f'frame-{i}.png').write_bytes(png(value))
        (model / 'portrait.mjs').write_text('''export const portrait = {
 width:2, height:2, edgeColor:'#202020', curve:[0,.25,.75,1], inverseWeight:0,
 decodeConcurrency:2,
 geometry:{noseX:1,headSpan:2,headHeight:2,landscapeAspect:1.1,edgeFade:0},
 variants:[{width:2,frames:Array.from({length:4},(_,i)=>`/assets/portraits/frame-${i}.png`)}],
};''')
        (content / 'index.md').write_text(f'''+++
template = "{manifest['namespace']}/home.html"
[content]
id="page:home"
site="site:portrait"
title="A personal inquiry"
lifecycle="draft"
language="en"
route={{path="/"}}
structure={{kind="page",family={{kind="index"}}}}
+++
::::character-encounter {{}}
:::encounter-copy {{}}
# A personal inquiry

A question becomes interesting when the first explanation stops fitting.

[Read the account](/account/)
:::
:::portrait-stage {{}}
![Neutral static portrait specimen](frame-0.png)
:::
::::

::::reflection {{}}
A drawing gives an idea another form.
::::
''')
        (content / 'account.md').write_text('''+++
[content]
id="page:account"
site="site:portrait"
title="An account"
lifecycle="draft"
language="en"
route={path="/account/"}
structure={kind="page",family={kind="article"}}
+++
# An account

The destination remains ordinary reading.
''')
        parts = [f'[composition]\ntheme={{package={json.dumps(manifest["package"])}}}',CHROME,
          '[[principals]]\nid="person:fixture"\nkind="person"\nname="Fixture author"',
          '[[sites]]\nid="site:portrait"\npublisher="person:fixture"\ndefault_author="person:fixture"\ndeployable=false',
          '[[brands]]\nid="brand:portrait"\nname="Neutral publication"',
          '[[brands.publications]]\nsite="site:portrait"\nhome="page:home"\npublic_base_url="https://example.test/"\nauthored=[{source="source:content",target="authored",static_assets={route_prefix="/assets/portraits/"}}]']
        for key, root in [('content',content),('base',BASE),('world',theme),('model',model)]:
            parts.append(f'[[sources]]\nid="source:{key}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
        external = json.loads(args.resource_bindings.read_text()) if args.resource_bindings else []
        input_entries = {'shared/portrait.mjs': '{input="portrait",entry="portrait.mjs"}'}
        design_entries = ['portrait="source:model"']
        for i,binding in enumerate(external):
            root=Path(binding['root']).resolve(strict=True)
            key=f'external-{i}'
            parts.append(f'[[sources]]\nid="source:{key}"\nlocation={{kind="filesystem",root={json.dumps(str(root))}}}')
            design_entries.append(f'{key}="source:{key}"')
            for target,entry in binding['entries'].items():
                assert target not in input_entries
                path=(root/entry).resolve(strict=True);assert path.is_relative_to(root) and path.is_file()
                input_entries[target]=f'{{input="{key}",entry={json.dumps(entry)}}}'
        mapped=','.join(json.dumps(k)+'='+v for k,v in input_entries.items())
        parts += ['[[theme_packages]]\npackage="theme:base"\nsource="source:base"\nmanifest="presentation.toml"',
          f'[[theme_packages]]\npackage={json.dumps(manifest["package"])}\nsource="source:world"\nmanifest="presentation.toml"\nresource_inputs={{{mapped}}}',
          '[design_inputs]\n'+'\n'.join(design_entries),'[composition.resources]']
        base_resources = [('stylesheet:physics','physics.css','site'), *SHELL_RESOURCES, ('module:continuous-portrait','continuous-portrait.js','dependency')]
        for identity, output, use in base_resources:
            parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package="theme:base"}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}')
        required = set(manifest['resource_requirements']) | {'module:character-encounter'}
        for resource in manifest['resources']:
            identity = resource['id']
            if identity not in required: continue
            kind = resource['build']['kind']
            extension = {'stylesheet':'css','browser-module':'js','woff2-font':'woff2'}[kind]
            output = f'{identity.replace(":","-")}.{extension}'
            use = 'site' if identity in manifest['resource_requirements'] else 'dependency'
            parts.append(f'"{identity}"={{state="enabled",resource={{owner={{kind="theme",package={json.dumps(manifest["package"])}}},resource="{identity}"}},output="/assets/{output}",use="{use}"}}')
        source='\n'.join(parts);(work/'workspace.toml').write_text(source)
        run(args.gazette,['check','--acquire-composition','site:portrait','--compile-templates'],source)
        result=run(args.gazette,['render-site','--local','--site','site:portrait','--output-parent',str(stages)],source)
        repeated=run(args.gazette,['render-site','--local','--site','site:portrait'],source)
        assert result['inventory']['identity']==repeated['inventory']['identity']
        output=Path(result['directory']); document=html.unescape((output/'index.html').read_text())
        assert len(re.findall(r'<h1(?:\s|>)',document))==1
        assert 'data-gazette-component="character-encounter"' in document
        assert 'class="portrait-stage"' in document
        assert 'Neutral static portrait specimen' in document
        assert 'href="/account/"' in document or 'href="https://example.test/account/"' in document
        assert 'module-character-encounter.js' in document
        modules={p.name:p.read_text() for p in output.rglob('*.js')}
        assert 'closest("[data-gazette-component]")' in modules['module-character-encounter.js'] or "closest('[data-gazette-component]')" in modules['module-character-encounter.js']
        assert 'mountContinuousPortrait' in modules['continuous-portrait.js']
        # Verify the emitted caller before probing the adapter with that argument shape.
        bootstraps = [p.read_text() for p in (output/'gazette/islands').glob('*.js')]
        bootstrap = next(text for text in bootstraps if 'module-character-encounter.js' in text)
        assert re.search(r'const slot = root\.querySelector\([\"\']:scope > \[data-gazette-mount\][\"\']\)', bootstrap)
        assert re.search(r'await selected\(\{\s*element:\s*slot,\s*props\s*\}\)', bootstrap)
        # Exercise the compiled adapter with the verified native mount argument shape.
        adapter_probe = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const wrapper = {}, cleanup = () => {}, calls = [];
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(/^import .*;$/gm, '').replace(/^export .*;$/gm, '');
const context = vm.createContext({ mountContinuousPortrait(element, model) {
  assert.equal(element, wrapper); assert.equal(model.curve.length, 4);
  assert.equal(model.variants[0].frames.length, 4); calls.push(element); return cleanup;
}});
vm.runInContext(source, context);
assert.equal(context.mount({element:{closest(selector) {
  assert.equal(selector, '[data-gazette-component]'); return wrapper;
}}}), cleanup);
assert.equal(calls.length, 1);
"""
        subprocess.run(['node','-e',adapter_probe,str(output/'assets/module-character-encounter.js')],check=True,capture_output=True,text=True)
        for i in range(4):
            assert (output/f'assets/portraits/frame-{i}.png').read_bytes()==(content/f'frame-{i}.png').read_bytes()
        # Native wrappers must leave the copy and portrait as the two composed grid items.
        encounters=[node for node in nodes(Document(document).root) if 'character-encounter' in node['attrs'].get('class','').split()]
        assert len(encounters)==1 and 'data-portrait-scene' in encounters[0]['attrs']
        children=[node for node in encounters[0]['children'] if isinstance(node,dict)]
        assert len(children)==2 and 'encounter-copy' in children[0]['attrs'].get('class','').split()
        assert children[1]['tag']=='figure' and 'portrait-stage' in children[1]['attrs'].get('class','').split()
        assert not any('data-gazette-component' in node['attrs'] for node in nodes(encounters[0]))
        print('PASS: native component, two composed children, static portrait/copy/link, one H1, selected module imports and compiled mount contract, byte-identical media, deterministic repeated output')
        print('NOT RUN: browser mount, layout, motion cadence and visual quality')
        if args.keep: print('output:',output)
    finally:
        if args.keep: print('retained fixture:',work)
        else: shutil.rmtree(work)

if __name__=='__main__': main()
