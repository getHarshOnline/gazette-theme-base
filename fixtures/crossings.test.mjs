import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../scripts/crossings.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
function anchor(attributes = {}, text = 'A useful argument') {
  const values = new Map(Object.entries({href:'https://a-different-world.test/work/',...attributes}));
  return {textContent:text,getAttribute:name=>values.get(name)??null,setAttribute:(name,value)=>values.set(name,value)};
}
function fixture(links, labels = {crossing:'Another publication',external:'An external website'}) {
  const root = {
    getElementById: id => {
      const label = labels[id === 'crossing-description' ? 'crossing' : 'external'];
      return label ? {id,textContent:label} : null;
    },
    querySelectorAll: selector => {
      assert.equal(selector, 'a[data-gazette-destination-kind="cross-site"], a[data-gazette-destination-kind="external"]');
      return links.filter(link=>['cross-site','external'].includes(link.getAttribute('data-gazette-destination-kind')));
    }
  };
  const context=vm.createContext({document:root}); vm.runInContext(code,context);
  return {run:()=>context.mountCrossings(root),apply:(link,value,source)=>context.applyDestination(link,value,source,root)};
}

test('every native crossing context composes descriptions idempotently without changing destination or name',()=>{
  const link=anchor({'data-gazette-destination-kind':'cross-site','data-gazette-destination-theme':'theme:other','aria-describedby':'qualification'});
  const f=fixture([link]);f.run();f.run();
  assert.equal(link.getAttribute('aria-describedby'),'qualification crossing-description');
  assert.equal(link.getAttribute('href'),'https://a-different-world.test/work/');
  assert.equal(link.textContent,'A useful argument');
});

test('external author keeps its role and existing descriptions; native links remain ordinary',()=>{
  const link=anchor({'data-gazette-destination-kind':'external',rel:'author','aria-describedby':'qualification'});
  const native=anchor({'data-gazette-destination-kind':'internal-native'});
  const f=fixture([link,native]);f.run();f.run();
  assert.equal(link.getAttribute('rel'),'author external');
  assert.equal(link.getAttribute('aria-describedby'),'qualification external-description');
  assert.equal(native.getAttribute('aria-describedby'),null);
  assert.equal(native.getAttribute('rel'),null);
});

test('runtime creation copies typed target facts; target identity never comes from the URL',()=>{
  const link=anchor(); const f=fixture([]);
  f.apply(link,{site:'site:target',content:'page:target',relationships:['related'],presentation:{theme:'theme:other',palette:'palette:cool'}},'site:source');
  assert.equal(link.getAttribute('data-gazette-destination-kind'),'cross-site');
  assert.equal(link.getAttribute('data-gazette-destination-site'),'site:target');
  assert.equal(link.getAttribute('data-gazette-destination-theme'),'theme:other');
  assert.equal(link.getAttribute('data-gazette-destination-palette'),'palette:cool');
  assert.equal(link.getAttribute('data-gazette-destination-relationships'),'related');
  assert.equal(link.getAttribute('aria-describedby'),'crossing-description');
  const unknown=anchor();f.apply(unknown,{content:'page:unknown'},'site:source');
  assert.equal(unknown.getAttribute('data-gazette-destination-kind'),null);
});

test('unknown theme crossings retain relation; absent copy invents no description',()=>{
  const link=anchor({'data-gazette-destination-kind':'cross-site','data-gazette-destination-theme':'theme:unknown'});
  fixture([link]).run();assert.equal(link.getAttribute('aria-describedby'),'crossing-description');
  const without=anchor({'data-gazette-destination-kind':'external'});
  fixture([without],{}).run();assert.equal(without.getAttribute('aria-describedby'),null);
  assert.equal(without.getAttribute('rel'),'external');
});
