// node test/blog-room.js [--built]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const base = built ? 'public' : 'source';
const read = name => fs.readFileSync(path.join(root, base, name), 'utf8');
const html = read('room/index.' + (built ? 'html' : 'md')).replace(/^---[\s\S]*?---\s*/, '');
const script = read('js/blog-room.js');
const svg = read('img/room/room.svg');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function browser(options = {}) {
  const errors = [];
  const log = new VirtualConsole();
  log.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://muan1228.github.io/room/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: log });
  const win = dom.window;
  const doc = win.document;
  let now = new Date(options.time || '2026-10-11T10:30:00Z').getTime();
  const RealDate = win.Date;
  win.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } };
  let hidden = false;
  Object.defineProperty(doc, 'hidden', { get: () => hidden });
  const timers = new Map();
  let timerID = 0;
  win.setTimeout = (callback, delay) => { timers.set(++timerID, { callback, delay }); return timerID; };
  win.clearTimeout = id => timers.delete(id);
  let requests = 0;
  win.fetch = () => { requests++; return options.fetch ? options.fetch(requests) : Promise.resolve({ ok: true, text: () => Promise.resolve(svg) }); };
  if (options.engine) win.__blogMusic = options.engine;
  win.eval(script);
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));
  await tick(); await tick();
  return { win, doc, errors, timers, dom, requests: () => requests,
    time(value) { now = new Date(value).getTime(); doc.dispatchEvent(new win.Event('visibilitychange')); },
    hidden(value) { hidden = value; doc.dispatchEvent(new win.Event('visibilitychange')); },
    event(name, detail) { doc.dispatchEvent(new win.CustomEvent(name, { detail })); },
    element(selector) { return doc.querySelector(selector); }
  };
}
let count = 0;
async function test(name, run) { await run(); count++; process.stdout.write('PASS ' + name + '\n'); }

(async () => {
  await test('Shanghai day/dusk/night boundaries and minute scheduling', async () => {
    const b = await browser();
    const cases = [['2026-10-10T21:59:00Z','night','05:59'], ['2026-10-10T22:00:00Z','day','06:00'], ['2026-10-11T08:59:00Z','day','16:59'], ['2026-10-11T09:00:00Z','dusk','17:00'], ['2026-10-11T10:59:00Z','dusk','18:59'], ['2026-10-11T11:00:00Z','night','19:00'], ['2026-10-11T16:00:00Z','night','00:00']];
    for (const [time, period, clock] of cases) { b.time(time); assert.equal(b.element('#blog-room').dataset.period,period); assert.equal(b.element('#br-time').textContent,clock); assert.equal(b.timers.size,1); }
    const timer = [...b.timers.values()][0]; assert.equal(timer.delay,60000);
    b.dom.window.close();
  });
  await test('all five objects show details before navigation', async () => {
    const b = await browser();
    const routes = { music:'/fun/music/',arcade:'/fun/arcade/',books:'/fun/books/',travel:'/travel/',work:'/showcase/' };
    for (const key of Object.keys(routes)) {
      const control=b.element('.br-hotspot[data-object="'+key+'"]'); control.click();
      assert.equal(b.element('#blog-room').dataset.selected,key);
      assert.equal(b.element('#br-enter').getAttribute('href'),routes[key]);
      assert.equal(b.element('#br-enter').hidden,false);
      assert.equal(b.doc.querySelectorAll('[aria-expanded="true"]').length,2);
      assert.equal(b.win.location.pathname,'/room/');
    }
    assert.deepEqual(b.errors,[]); b.dom.window.close();
  });
  await test('Escape and close restore focus and clear selection', async () => {
    const b=await browser(); const button=b.element('[data-object="music"]'); button.focus(); button.click();
    b.element('#br-enter').focus(); b.element('#br-enter').dispatchEvent(new b.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(b.element('#br-enter').hidden,true); assert.equal(b.doc.activeElement,button); assert.equal(b.element('#blog-room').dataset.selected,undefined);
    button.click(); b.element('#br-close').click(); assert.equal(b.element('#br-enter').hidden,true); b.dom.window.close();
  });
  await test('shortcut normal click previews; modified click keeps native link', async () => {
    const b=await browser(); const link=b.element('.br-shortcut[data-object="travel"]');
    const normal=new b.win.MouseEvent('click',{bubbles:true,cancelable:true}); link.dispatchEvent(normal);
    assert.equal(normal.defaultPrevented,true); assert.equal(b.element('#blog-room').dataset.selected,'travel');
    const modified=new b.win.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});
    // Capture after the module listener to avoid jsdom's unsupported native navigation.
    let preserved=false; link.addEventListener('click',e=>{preserved=!e.defaultPrevented;e.preventDefault();},{once:true}); link.dispatchEvent(modified);
    assert.equal(preserved,true); b.dom.window.close();
  });
  await test('music events are read-only and render track names as text', async () => {
    const engine={ getState:()=>({playing:true,name:'测试曲',artist:'Mu An'}), play:()=>assert.fail('must not play'), pause:()=>assert.fail('must not pause'), select:()=>assert.fail('must not select') };
    const b=await browser({engine}); assert(b.element('#blog-room').classList.contains('br-playing'));
    b.event('blog-music-statechange',{playing:false}); assert(!b.element('#blog-room').classList.contains('br-playing'));
    b.event('blog-music-statechange',{playing:true,name:'<img src=x onerror=alert(1)>',artist:'Artist'});
    assert.equal(b.element('#br-music-status img'),null); assert(b.element('#br-music-status').textContent.includes('<img')); b.dom.window.close();
  });
  await test('absent or failing music engine leaves a usable room', async () => {
    for (const engine of [undefined,{getState:()=>{throw Error('not-ready');}}]) {
      const b=await browser({engine}); assert(!b.element('#blog-room').classList.contains('br-playing')); b.element('[data-object="music"]').click(); assert.equal(b.element('#br-enter').hidden,false); assert.deepEqual(b.errors,[]); b.dom.window.close();
    }
  });
  await test('hidden page stops clock; foreground refreshes time and playback', async () => {
    const b=await browser(); b.hidden(true); assert.equal(b.timers.size,0); assert(b.element('#blog-room').classList.contains('br-hidden'));
    b.time('2026-10-11T11:10:00Z'); b.hidden(false); assert.equal(b.timers.size,1); assert.equal(b.element('#br-time').textContent,'19:10'); assert(!b.element('#blog-room').classList.contains('br-hidden')); b.dom.window.close();
  });
  await test('repeated execution and PJAX complete do not duplicate initialization', async () => {
    const b=await browser(); b.win.eval(script); b.event('pjax:complete'); assert.equal(b.timers.size,1); assert.equal(b.requests(),1); assert.equal(b.doc.querySelectorAll('#br-art svg').length,1); b.dom.window.close();
  });
  await test('leaving room releases timers and music listeners; reentry works', async () => {
    const b=await browser(); const room=b.element('#blog-room'); b.event('pjax:send'); room.remove();
    b.event('blog-music-statechange',{playing:true,name:'离页后的歌'}); assert(!room.classList.contains('br-playing')); assert.equal(b.timers.size,0);
    b.event('pjax:complete'); assert.equal(b.timers.size,0);
    b.doc.body.appendChild(room); b.event('pjax:complete'); await tick(); assert.equal(b.timers.size,1); assert.equal(b.requests(),1); b.dom.window.close();
  });
  await test('failed illustration can retry; routes remain usable', async () => {
    const b=await browser({fetch: n=>n===1?Promise.reject(Error('offline')):Promise.resolve({ok:true,text:()=>Promise.resolve(svg)})});
    assert.equal(b.element('#br-retry').hidden,false); b.element('[data-object="books"]').click(); assert.equal(b.element('#br-enter').getAttribute('href'),'/fun/books/');
    b.element('#br-retry').click(); await tick(); await tick(); assert.equal(b.element('#br-retry').hidden,true); assert(b.element('#br-art svg')); b.dom.window.close();
  });
  await test('invalid SVG produces recoverable error state', async () => {
    const b=await browser({fetch:()=>Promise.resolve({ok:true,text:()=>Promise.resolve('<html>not an illustration</html>')})});
    assert.equal(b.element('#br-retry').hidden,false); assert.equal(b.element('#br-art svg'),null); assert.deepEqual(b.errors,[]); b.dom.window.close();
  });
  await test('late artwork response cannot mutate a disposed page', async () => {
    let resolve; const b=await browser({fetch:()=>new Promise(r=>{resolve=r;})}); const room=b.element('#blog-room');
    b.event('pjax:send'); room.remove(); resolve({ok:true,text:()=>Promise.resolve(svg)}); await tick(); await tick(); assert.equal(room.querySelector('#br-art svg'),null); b.dom.window.close();
  });
  await test('without JavaScript all five destinations remain accessible', async () => {
    const dom=new JSDOM(html); const links=[...dom.window.document.querySelectorAll('.br-shortcut')]; assert.equal(links.length,5);
    links.forEach(link=>assert(link.getAttribute('href').startsWith('/'))); assert.equal(dom.window.document.querySelectorAll('.br-hotspot:not([hidden])').length,0); dom.window.close();
  });
  process.stdout.write(count+' cases passed'+(built?' (built)':'')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
