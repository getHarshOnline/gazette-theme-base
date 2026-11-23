#!/usr/bin/env python3
"""Check documented data attributes against Base's template and script writers."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TOKEN = re.compile(r'''(?P<space>\s+)|(?P<comment>//[^\n]*|/\*.*?\*/)|(?P<string>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(?P<word>[A-Za-z_$][\w$]*)|(?P<symbol>===|!==|==|!=|=>|\?\.|\?\?=|&&=|\|\|=|>>>=|>>=|<<=|\*\*=|[+*/%&|^-]=|\+\+|--|.)''', re.S)
ASSIGNMENTS = {'=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '??=', '&&=', '||=', '++', '--'}


class ContractError(ValueError):
    pass


def tokens(source):
    return [(m.lastgroup, m[0]) for m in TOKEN.finditer(source)
            if m.lastgroup not in {'space', 'comment'}]


def literal(token):
    kind, value = token
    if kind != 'string' or '\\' in value or '${' in value:
        return None
    return value[1:-1]


def dataset_name(key):
    return 'data-' + re.sub(r'[A-Z]', lambda m: '-' + m[0].lower(), key)


class Attributes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.names = set()

    def handle_starttag(self, tag, attrs):
        self.names.update(name for name, _ in attrs if name.startswith('data-'))

    handle_startendtag = handle_starttag


def template_writers(source, actions):
    source = re.sub(r'{#.*?#}', '', source, flags=re.S)
    names = set()
    # The only computed attribute names are the shared carousel macro's action.
    for match in re.finditer(r'data-{{\s*(.*?)\s*}}-([\w-]+)', source):
        variable, suffix = match.groups()
        if variable != 'action' or suffix not in {'previous', 'next', 'playback'}:
            raise ContractError(f'Unresolved template attribute: {match[0]}')
        names.update(f'data-{action}-{suffix}' for action, playback in actions
                     if suffix != 'playback' or playback)
    source = re.sub(r'data-{{\s*action\s*}}-[\w-]+', '', source)
    if re.search(r'data-[^\s=<>]*{{', source):
        raise ContractError('Unresolved computed template attribute')
    # Keep opening script tags: JSON blocks have their own data markers.
    source = re.sub(r'(<script\b[^>]*>).*?(</script>)', r'\1\2', source, flags=re.S)
    fragments = re.findall(r'{%\s*macro\s+(?:attributes|labels)\([^%]*%}(.*?){%\s*endmacro[^%]*%}', source, re.S)
    def markup(text):
        return re.sub(r'{{.*?}}|{%.*?%}', '', text, flags=re.S)
    parser = Attributes()
    parser.feed(markup(source))
    for fragment in fragments:
        parser.feed('<attribute-fragment ' + markup(fragment) + '>')
    return names | parser.names


# These calls only restore a snapshot or write SVG coordinates. They do not
# introduce an attribute contract. All other computed writer calls must resolve.
RESTORERS = {
    ('scripts/preview-tabs.js', 'node', 'name'),
    ('scripts/cinematic-film.js', 'node', 'name'),
    ('scripts/field-sequence.js', 'node', 'name'),
    ('scripts/ambient-video.js', 'wrapper', 'name'),
    ('scripts/quote-deck.js', 'card', 'name'),
    ('scripts/catalogue.js', 'card', 'key'),
    ('scripts/discovery-explorer.js', 'line', 'key'),
}


def script_writers(source, path, dynamic):
    stream = tokens(source)
    values = [value for _, value in stream]
    names = set()
    for i, value in enumerate(values):
        # Interpolations execute JavaScript. This scanner treats strings as opaque,
        # so reject attribute-related interpolation instead of hiding its writes.
        if stream[i][0] == 'string' and value.startswith('`') and '${' in value and re.search(
                r'\b(?:dataset|setAttribute|toggleAttribute|innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|setAttributeNS)\b', value):
            raise ContractError(f'{path}: attribute access in template interpolation needs an explicit writer check')
        if literal(stream[i]) == 'dataset' and i > 0 and values[i - 1] == '[':
            raise ContractError(f'{path}: bracket dataset access needs an explicit writer check')
        if value == 'dataset':
            if i == 0 or values[i - 1] not in {'.', '?.'}:
                raise ContractError(f'{path}: dataset alias needs an explicit writer check')
            if i + 2 < len(values) and values[i + 1] in {'.', '?.'}:
                key, end = values[i + 2], i + 3
            elif i + 3 < len(values) and values[i + 1] == '[' and values[i + 3] == ']':
                key, end = literal(stream[i + 2]), i + 4
                if key is None:
                    raise ContractError(f'{path}: computed dataset key needs an explicit writer check')
            else:
                raise ContractError(f'{path}: dataset alias needs an explicit writer check')
            if end < len(values) and values[end] in ASSIGNMENTS:
                names.add(dataset_name(key))
        if value in {'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'createContextualFragment', 'setAttributeNS'}:
            raise ContractError(f'{path}: markup/namespace writer needs an explicit inventory check')
        if literal(stream[i]) in {'setAttribute', 'toggleAttribute'} and i > 0 and values[i - 1] == '[':
            raise ContractError(f'{path}: bracket attribute method needs an explicit writer check')
        if value not in {'setAttribute', 'toggleAttribute'}:
            continue
        if i + 1 >= len(values) or values[i + 1] != '(':
            raise ContractError(f'{path}: attribute method alias needs an explicit writer check')
        end = i + 2
        depth = 0
        while end < len(values):
            if depth == 0 and values[end] in {',', ')'}:
                break
            if values[end] in {'(', '[', '{'}:
                depth += 1
            elif values[end] in {')', ']', '}'}:
                depth -= 1
            end += 1
        arg = stream[i + 2:end]
        name = literal(arg[0]) if len(arg) == 1 else None
        if name is not None:
            if name.startswith('data-'):
                names.add(name)
            continue
        expression = ''.join(v for _, v in arg)
        receiver = values[i - 2] if i >= 2 else ''
        if (path, expression) in dynamic:
            names.update(dynamic[path, expression])
        elif (path, receiver, expression) not in RESTORERS:
            raise ContractError(f'{path}: unresolved attribute writer {receiver}.{value}({expression}, …)')
    return names


def collect(root):
    templates = {str(p.relative_to(root)): p.read_text() for p in sorted((root / 'templates').rglob('*.html'))}
    scripts = {str(p.relative_to(root)): p.read_text() for p in sorted((root / 'scripts').rglob('*'))
               if p.suffix in {'.js', '.mjs'} and 'vendor' not in p.relative_to(root).parts}
    actions = set()
    for source in templates.values():
        source = re.sub(r'{#.*?#}', '', source, flags=re.S)
        for call in re.findall(r'carousel_controls::render\((.*?)\)\s*}}', source, re.S):
            action = re.search(r'\baction\s*=\s*"([\w-]+)"', call)
            if not action:
                raise ContractError('Carousel action must be a literal for the attribute inventory')
            actions.add((action[1], bool(re.search(r'\bpause\s*=', call) and re.search(r'\bresume\s*=', call))))
    settings = set()
    active = set()
    for path, source in scripts.items():
        stream = tokens(source)
        for i, (_, value) in enumerate(stream[:-2]):
            if value == 'attribute' and stream[i + 1][1] == ':' and path == 'scripts/settings.js':
                name = literal(stream[i + 2])
                if not name or not name.startswith('data-'):
                    raise ContractError('Settings attribute must be a literal data name')
                settings.add(name)
            if value == 'activeAttribute' and stream[i + 1][1] in {':', '='}:
                name = literal(stream[i + 2])
                if not name or not name.startswith('data-'):
                    raise ContractError('Carousel activeAttribute must be a literal data name')
                active.add(name)
    dynamic = {('scripts/settings.js', 'contract.attribute'): settings,
               ('scripts/depth-carousel.js', 'activeAttribute'): active}
    writers = {}
    def remember(names, path):
        for name in names:
            writers.setdefault(name, set()).add(path)
    for path, source in templates.items():
        remember(template_writers(source, actions), path)
        for inline in re.findall(r'<script\b[^>]*>(.*?)</script>', source, re.S):
            remember(script_writers(inline, path, dynamic), path)
    for path, source in scripts.items():
        remember(script_writers(source, path, dynamic), path)
    return writers


def documented(source):
    start, end = '<!-- base-attribute-inventory -->', '<!-- /base-attribute-inventory -->'
    if source.count(start) != 1 or source.count(end) != 1:
        raise ContractError('Attribute reference needs exactly one Base inventory region')
    section = source.split(start)[1].split(end)[0]
    rows = re.findall(r'^\|[ \t]*`(data-[\w-]+)`[ \t]*\|([^\n]*)', section, re.M)
    names = [name for name, _ in rows]
    if len(names) != len(set(names)):
        raise ContractError('Duplicate Base attribute row')
    writers = {}
    for name, row in rows:
        columns = re.split(r'(?<!\\)\|', row)
        if len(columns) < 3:
            raise ContractError(f'{name}: incomplete attribute row')
        writers[name] = set(re.findall(r'\]\(\.\./([^\s)#]+)\)', columns[1]))
    return writers


def check(root=ROOT):
    writers = collect(root)
    listed = documented((root / 'docs/attributes.md').read_text())
    missing, stale = writers.keys() - listed.keys(), listed.keys() - writers.keys()
    if missing or stale:
        raise ContractError('Undocumented writers: ' + ', '.join(sorted(missing)) +
                            '\nRows without a Base writer: ' + ', '.join(sorted(stale)))
    for name, paths in writers.items():
        if listed[name] != paths:
            raise ContractError(f'{name}: writer links differ from source; expected ' + ', '.join(sorted(paths)))
    return writers


if __name__ == '__main__':
    try:
        inventory = check()
    except ContractError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    print(f'PASS: {len(inventory)} Base attribute rows have source writers; none are missing')
