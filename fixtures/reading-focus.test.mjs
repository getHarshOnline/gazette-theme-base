import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/reading-focus.js',import.meta.url),'utf8').replace('export function','function');
function fixture(){
 let document;
 class Element{
  constructor(){this.children=[];this.parentNode=null;this.attrs={};this.events={};this.hidden=false;this.inert=false;this.classes=new Set();this.classList={contains:key=>this.classes.has(key),add:key=>this.classes.add(key),remove:key=>this.classes.delete(key)};}
  append(node){this.insertBefore(node,null);}
  insertBefore(node,next){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);const index=next?this.children.indexOf(next):this.children.length;this.children.splice(index,0,node);node.parentNode=this;}
  get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
  get nextElementSibling(){return this.nextSibling;}
  matches(selector){return selector==='.services-closing'&&this.classes.has('services-closing');}
  get isConnected(){return this===body||!!this.parentNode?.isConnected;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key]??null;}
  removeAttribute(key){delete this.attrs[key];}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  fire(type,extra={}){const event={preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of this.events[type]||[])fn(event);return event;}
  focus(options){document.activeElement=this;this.focusOptions=options;}
 }
 const body=new Element(),header=new Element(),row=new Element(),article=new Element(),tools=new Element(),button=new Element(),after=new Element(),content=new Element(),footer=new Element();
 body.append(header);header.append(row);body.append(article);article.append(content);article.append(tools);tools.append(button);tools.append(after);body.append(footer);
 button.setAttribute('data-reader-focus-enter','Focus on reading');button.setAttribute('data-reader-focus-exit','Exit reading focus');button.hidden=true;
 const targets=Array.from({length:4},()=>new Element());targets[0].classes.add('services-closing');body.insertBefore(targets[0],footer);targets.slice(1).forEach(target=>article.append(target));
 const unrelatedClosing=new Element();unrelatedClosing.classes.add('services-closing');body.insertBefore(unrelatedClosing,article);
 targets[1].inert=true;targets[1].setAttribute('aria-hidden','false');targets[2].hidden=true;targets[3].classList.add('reading-focus-muted');
 const events=new Element();let modal=false,subscriber;
 document={activeElement:button,querySelector:selector=>selector==='.reading-document'?article:selector==='dialog[open]'&&modal?{}:null,addEventListener:(...args)=>events.addEventListener(...args)};
 article.querySelector=()=>button;article.querySelectorAll=()=>targets.slice(1);
 const window=new Element();window.scrollY=450;
 const context=vm.createContext({document,window});vm.runInContext(source,context);
 const controller=context.mountReadingFocus({position:{subscribe(fn){subscriber=fn;}},navigation:{headerRow:row}});
 return{body,header,row,article,tools,button,after,content,footer,targets,unrelatedClosing,document,events,window,controller,place(flow){subscriber({flow});},modal(value){modal=value;}};
}

test('focus is explicit, leaves geometry/scroll ownership alone, and restores exact prior hidden/inert states',()=>{
 const f=fixture();assert.equal(f.button.hidden,false);assert.equal(f.button.textContent,'Focus on reading');assert.equal(f.button.getAttribute('aria-pressed'),null,'the swapped label carries the state, never a pressed state as well');
 const parents=f.targets.map(node=>node.parentNode);f.button.fire('click');
 assert.equal(f.button.textContent,'Exit reading focus');assert.equal(f.button.getAttribute('aria-pressed'),null);
 for(const node of f.targets){assert.equal(node.inert,true);assert.equal(node.getAttribute('aria-hidden'),'true');assert.equal(node.classList.contains('reading-focus-muted'),true);}
 assert.equal(f.targets[2].hidden,true);assert.deepEqual(f.targets.map(node=>node.parentNode),parents);assert.equal(f.window.scrollY,450);
 assert.equal(f.footer.inert,false);assert.equal(f.content.inert,false);
 f.button.fire('click');assert.equal(f.targets[0].inert,false);assert.equal(f.targets[0].getAttribute('aria-hidden'),null);assert.equal(f.targets[1].inert,true);assert.equal(f.targets[1].getAttribute('aria-hidden'),'false');assert.equal(f.targets[2].hidden,true);assert.equal(f.targets[3].classList.contains('reading-focus-muted'),true);
});

test('one toggle follows existing orientation placement and remains reachable',()=>{
 const f=fixture();f.place(true);assert.equal(f.button.parentNode,f.row);f.button.fire('click');f.place(false);assert.equal(f.button.parentNode,f.tools);assert.equal(f.button.nextSibling,f.after);assert.equal(f.button.inert,false);assert.equal(f.document.activeElement,f.button);
 f.place(true);assert.equal(f.button.parentNode,f.row);assert.equal(f.button.textContent,'Exit reading focus');
});

test('entering focus never hides the current focus; Escape exits except when another surface owns it',()=>{
 const f=fixture();f.document.activeElement=f.targets[0];f.button.fire('click');assert.equal(f.document.activeElement,f.button);assert.equal(f.button.focusOptions.preventScroll,true);
 f.modal(true);f.events.fire('keydown',{key:'Escape'});assert.equal(f.button.textContent,'Exit reading focus');
 f.modal(false);const escape=f.events.fire('keydown',{key:'Escape'});assert.equal(escape.defaultPrevented,true);assert.equal(f.button.textContent,'Focus on reading');assert.equal(f.document.activeElement,f.button);
});

test('printing shows the complete document then restores explicit mode; leaving a page clears it',()=>{
 const f=fixture();f.place(true);f.button.fire('click');f.window.fire('beforeprint');assert.equal(f.targets[0].inert,false);assert.equal(f.button.parentNode,f.tools);
 f.window.fire('beforeprint');f.window.fire('afterprint');assert.equal(f.targets[0].inert,true);assert.equal(f.button.parentNode,f.row);
 f.window.fire('pagehide');assert.equal(f.targets[0].inert,false);assert.equal(f.button.textContent,'Focus on reading');assert.equal(f.button.parentNode,f.tools);
 f.window.fire('pageshow');assert.equal(f.button.parentNode,f.row);assert.equal(f.targets[0].inert,false);
});

test('leaving focus while printing cannot be undone by print completion',()=>{
 const f=fixture();f.button.fire('click');f.window.fire('beforeprint');f.controller.exit();f.window.fire('afterprint');assert.equal(f.targets[0].inert,false);assert.equal(f.button.textContent,'Focus on reading');
});


test('reading focus targets only the article’s direct closing sibling and restores its existing state',()=>{
 const f=fixture();const closing=f.targets[0];
 assert.equal(f.article.nextElementSibling,closing);
 f.button.fire('click');assert.equal(closing.inert,true);assert.equal(closing.getAttribute('aria-hidden'),'true');
 assert.equal(f.unrelatedClosing.inert,false);assert.equal(f.unrelatedClosing.getAttribute('aria-hidden'),null);
 f.controller.exit();assert.equal(closing.inert,false);assert.equal(closing.getAttribute('aria-hidden'),null);
});
