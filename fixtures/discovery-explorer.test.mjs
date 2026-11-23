import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapChoice, constellation, mountDiscoveryExplorer } from '../scripts/discovery-explorer.js';
class Element {
 constructor(tag, document) { this.tagName=tag; this.ownerDocument=document; this.children=[];this.attrs={};this.events=new Map();this.hidden=false;this.textContent='';this.style={setProperty(){}};this.classList={add(){},remove(){}}; }
 append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
 prepend(node){node.parentNode=this;this.children.unshift(node);}
 remove(){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
 addEventListener(k,fn){this.events.set(k,[...(this.events.get(k)||[]),fn]);}
 removeEventListener(k,fn){this.events.set(k,(this.events.get(k)||[]).filter(f=>f!==fn));}
 fire(k,extra={}){const e={target:this,button:0,preventDefault(){this.prevented=true;},...extra};for(const fn of this.events.get(k)||[])fn(e);return e;}
 contains(node){return node===this||this.children.some(x=>x.contains(node));}
 querySelector(selector){return selector===':scope > ul'?this.children.find(x=>x.tagName==='ul'):selector==='.reading-related__title'?this.children.find(x=>x.tagName==='a'):null;}
 closest(){return this.tagName==='a'?this:null;}
 focus(){this.ownerDocument.activeElement=this;this.fire('focus');}
}
function fixture(count=3){const doc={activeElement:null,getSelection:()=>null};doc.createElement=tag=>new Element(tag,doc);doc.createElementNS=(_,tag)=>doc.createElement(tag);const root=doc.createElement('nav'),list=doc.createElement('ul');root.append(list);root.setAttribute('data-discovery-origin','Current article');root.setAttribute('data-discovery-previous','Previous');root.setAttribute('data-discovery-next','Next');for(let i=0;i<count;i++){const card=doc.createElement('li'),link=doc.createElement('a');link.textContent='Article '+i;link.setAttribute('href','/article-'+i);card.append(link);list.append(card);}return{root,list,doc,cards:[...list.children]};}
function mount(f){globalThis.window=new Element('window',f.doc);globalThis.getComputedStyle=()=>({getPropertyValue:()=> '44px'});return mountDiscoveryExplorer(f.root);}
test('selection wraps without changing native recommendation order',()=>{assert.equal(wrapChoice(-1,4),3);assert.equal(wrapChoice(4,4),0);const points=constellation(4);assert.equal(points.length,4);for(const p of points){assert.ok(p.x>0&&p.x<1&&p.y>0&&p.y<1);}});
test('native fallback remains unchanged when there is only one result or labels are absent',()=>{const f=fixture(1);assert.equal(mount(f),null);assert.equal(f.cards[0].hidden,false);const empty=fixture();empty.root.setAttribute('data-discovery-next','');assert.equal(mount(empty),null);assert.equal(empty.root.children.length,1);});
test('graph selection, previous/next and keyboard expose one existing card, with exact disposal',()=>{const f=fixture(),dispose=mount(f);const map=f.root.children[0],controls=f.root.children.at(-1),choices=map.children.filter(x=>x.tagName==='button');assert.deepEqual(f.cards.map(c=>c.hidden),[false,true,true]);controls.children[2].fire('click');assert.deepEqual(f.cards.map(c=>c.hidden),[true,false,true]);choices[2].focus();assert.deepEqual(f.cards.map(c=>c.hidden),[true,true,false]);map.fire('keydown',{key:'Home'});assert.equal(f.doc.activeElement,choices[0]);controls.fire('keydown',{key:'ArrowLeft'});assert.deepEqual(f.cards.map(c=>c.hidden),[true,true,false]);assert.deepEqual(f.cards.map(c=>c.children[0].getAttribute('href')),['/article-0','/article-1','/article-2']);dispose();assert.deepEqual(f.cards.map(c=>c.hidden),[false,false,false]);assert.deepEqual(f.root.children,[f.list]);});
test('hover cannot hide a focused destination; print restores the complete native set',()=>{const f=fixture();mount(f);const choices=f.root.children[0].children.filter(x=>x.tagName==='button');f.cards[0].children[0].focus();choices[2].fire('pointerenter',{pointerType:'mouse'});assert.equal(f.cards[0].hidden,false);globalThis.window.fire('beforeprint');assert.ok(f.cards.every(c=>!c.hidden));globalThis.window.fire('afterprint');assert.deepEqual(f.cards.map(c=>c.hidden),[false,true,true]);});
test('horizontal gesture changes the preview but vertical scrolling does not',()=>{const f=fixture();mount(f);f.list.fire('pointerdown',{pointerId:1,clientX:100,clientY:100});f.list.fire('pointerup',{pointerId:1,clientX:90,clientY:250});assert.equal(f.cards[0].hidden,false);f.list.fire('pointerdown',{pointerId:2,clientX:100,clientY:100});f.list.fire('pointerup',{pointerId:2,clientX:20,clientY:110});assert.equal(f.cards[1].hidden,false);});
