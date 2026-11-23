#!/usr/bin/env python3
"""Exercise writer detection and reference drift without building a publication."""
from pathlib import Path
import tempfile
import unittest

import attributes


class AttributeContract(unittest.TestCase):
    def test_markers_values_and_template_fragments(self):
        source = '''{# data-comment="false" #}
          <p data-bare aria-label="copy" data-value="{{ input }}">data-prose</p>
          <script type="application/json" data-json>{{ configuration }}</script>
          {% macro attributes() %} data-projected="{{ value }}" {% endmacro attributes %}'''
        self.assertEqual(attributes.template_writers(source, set()),
                         {'data-bare', 'data-value', 'data-json', 'data-projected'})

    def test_carousel_names_follow_call_inputs(self):
        source = '<button data-{{ action }}-previous></button><button data-{{ action }}-playback></button>'
        self.assertEqual(attributes.template_writers(source, {('new-deck', True), ('list', False)}),
                         {'data-new-deck-previous', 'data-new-deck-playback', 'data-list-previous'})
        with self.assertRaises(attributes.ContractError):
            attributes.template_writers('<i data-{{ arbitrary }}-state>', set())

    def test_script_writes_are_not_reads_comments_or_selectors(self):
        source = '''// root.dataset.comment = 'x';
          const selector = '[data-selector]';
          const sample = "node.setAttribute('data-example', '')";
          node.getAttribute('data-read'); root.dataset.current === 'ready';
          root.dataset.current = 'ready'; root.dataset['camelCase'] = 'yes';
          root.dataset.count ??= '0'; node.setAttribute('data-written', value);
          node.toggleAttribute('data-mark', selected); node.toggleAttribute('data-toggle');'''
        self.assertEqual(attributes.script_writers(source, 'sample.js', {}),
                         {'data-current', 'data-camel-case', 'data-count', 'data-written', 'data-mark', 'data-toggle'})

    def test_unknown_computed_writes_and_aliases_fail(self):
        for source in ["node.setAttribute(name, value)", "node.dataset[key] = value",
                       "const state = node.dataset; state.foo = 'yes'",
                       "node['setAttribute']('data-new', value)", "const write = node.setAttribute",
                       "node.innerHTML = '<b data-new></b>'"]:
            with self.subTest(source=source), self.assertRaises(attributes.ContractError):
                attributes.script_writers(source, 'sample.js', {})

    def test_bracket_dataset_and_executable_interpolation_cannot_pass_silently(self):
        for source in ["node['dataset'].fresh = 'yes'",
                       'const s = `${node.dataset.fresh = "yes"}`',
                       'const s = `${node.setAttribute("data-fresh", "yes")}`']:
            with self.subTest(source=source), self.assertRaises(attributes.ContractError):
                attributes.script_writers(source, 'sample.js', {})

    def test_compound_assignments_count_as_writers(self):
        for operator in ['+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '??=', '&&=', '||=']:
            with self.subTest(operator=operator):
                self.assertEqual(attributes.script_writers(f'node.dataset.fresh {operator} value', 'sample.js', {}), {'data-fresh'})

    def test_dynamic_inputs_are_read_from_source(self):
        with tempfile.TemporaryDirectory(prefix='base-attributes-') as tmp:
            root = Path(tmp)
            (root / 'templates').mkdir(); (root / 'scripts').mkdir()
            (root / 'templates/macro.html').write_text('<i data-{{ action }}-next></i>')
            (root / 'templates/call.html').write_text('{{ carousel_controls::render(action="changed", label="Next") }}')
            (root / 'scripts/settings.js').write_text("const contracts = { x: { attribute: 'data-new-setting' } }; root.setAttribute(contract.attribute, value)")
            (root / 'scripts/depth-carousel.js').write_text("function run({ activeAttribute = 'data-new-active' }) { card.toggleAttribute(activeAttribute, true) }")
            (root / 'scripts/caller.js').write_text("run({ activeAttribute: 'data-caller-active' })")
            (root / 'scripts/nested').mkdir()
            (root / 'scripts/nested/component.mjs').write_text("node.dataset.nested = 'yes'")
            self.assertEqual(set(attributes.collect(root)), {'data-changed-next', 'data-new-setting', 'data-new-active', 'data-caller-active', 'data-nested'})

    def test_missing_and_stale_rows_fail(self):
        with tempfile.TemporaryDirectory(prefix='base-attributes-') as tmp:
            root = Path(tmp)
            for directory in ['templates', 'scripts', 'docs']:
                (root / directory).mkdir()
            (root / 'templates/page.html').write_text('<main data-live>')
            doc = root / 'docs/attributes.md'
            doc.write_text('<!-- base-attribute-inventory -->\n| `data-live` | present | [page.html](../templates/page.html) | style |\n<!-- /base-attribute-inventory -->')
            self.assertEqual(set(attributes.check(root)), {'data-live'})
            (root / 'templates/page.html').write_text('<main data-live data-new>')
            with self.assertRaisesRegex(attributes.ContractError, 'Undocumented writers: data-new'):
                attributes.check(root)
            (root / 'templates/page.html').write_text('<main>')
            with self.assertRaisesRegex(attributes.ContractError, 'Rows without a Base writer: data-live'):
                attributes.check(root)

    def test_stale_writer_link_fails_even_when_attribute_still_exists(self):
        with tempfile.TemporaryDirectory(prefix='base-attributes-') as tmp:
            root = Path(tmp)
            for directory in ['templates', 'scripts', 'docs']:
                (root / directory).mkdir()
            (root / 'templates/page.html').write_text('<main data-live>')
            (root / 'docs/attributes.md').write_text('<!-- base-attribute-inventory -->\n| `data-live` | present | [old.html](../templates/old.html) | style |\n<!-- /base-attribute-inventory -->')
            with self.assertRaisesRegex(attributes.ContractError, 'writer links differ from source'):
                attributes.check(root)

    def test_formatter_padding_preserves_writer_inventory(self):
        source = ('<!-- base-attribute-inventory -->\n'
                  '| `data-live`       | present | [page.html](../templates/page.html) | style |\n'
                  '<!-- /base-attribute-inventory -->')
        self.assertEqual(attributes.documented(source), {'data-live': {'templates/page.html'}})

    def test_duplicate_rows_fail(self):
        with self.assertRaisesRegex(attributes.ContractError, 'Duplicate'):
            attributes.documented('<!-- base-attribute-inventory -->\n| `data-x` | a |\n| `data-x` | b |\n<!-- /base-attribute-inventory -->')


if __name__ == '__main__':
    unittest.main()
