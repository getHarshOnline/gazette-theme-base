import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('About cardinality selectors remain valid without nested relational pseudo-classes', () => {
  const source = readFileSync(new URL('../styles/_about.scss', import.meta.url), 'utf8');
  const variables = Object.fromEntries([...source.matchAll(/^\$([\w-]+): '([^']+)';$/gm)].map(match => [match[1],match[2]]));
  const resolve = value => value.replace(/#\{\$([\w-]+)\}/g, (_,name) => resolve(variables[name]));
  for (const raw of Object.values(variables)) {
    const selector = resolve(raw), stack = [];
    for (let index=0; index<selector.length; index++) {
      if (selector[index] === '(') {
        const relational = selector.slice(0,index).endsWith(':has');
        assert.ok(!relational || !stack.includes(true), `Unsupported nested :has in ${selector}`);
        stack.push(relational);
      } else if (selector[index] === ')') stack.pop();
    }
    assert.equal(stack.length,0,`Unbalanced selector ${selector}`);
  }
});
