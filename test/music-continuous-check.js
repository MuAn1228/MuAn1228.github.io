// node test/music-continuous-check.js [--built]
// Runs the real page, production JS and MP3s in Chromium for ~36 real seconds.
// Desktop headless playback does not verify Android background playback policy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const assetRoot = path.join(root, built ? 'public' : 'source');
const read = name => fs.readFileSync(path.join(assetRoot, name));
const page = read('music-check/continuous.html').toString('utf8').replace(/^---[\s\S]*?---\s*/, '');
const script = read('js/music-continuous-check.js').toString('utf8');
const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

async function checkUnsupported() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(page, {
    url: 'https://muan1228.github.io/music-check/continuous.html',
    runScripts: 'outside-only', virtualConsole
  });
  try {
    const { window } = dom;
    let fetches = 0;
    let plays = 0;
    Object.defineProperty(window, 'MediaSource', { value: undefined });
    window.fetch = () => { fetches++; throw new Error('Unsupported browser must not fetch audio'); };
    window.HTMLMediaElement.prototype.play = () => { plays++; return Promise.resolve(); };
    window.HTMLMediaElement.prototype.pause = () => {};
    window.eval(script);
    await Promise.resolve();
    const button = window.document.getElementById('mcheck-start');
    const report = JSON.parse(window.document.getElementById('mcheck-report').value);
    assert.equal(report.supported, false);
    assert.equal(report.prepared, false);
    assert.equal(report.srcAssignments, 0);
    assert.equal(report.playRequests, 0);
    assert.ok(report.events.some(event => event.event === 'unsupported'));
    assert.equal(button.disabled, true);
    button.click();
    assert.equal(fetches, 0);
    assert.equal(plays, 0);
    assert.deepEqual(errors, []);
    console.log('PASS unsupported MSE reports the limitation without fetching or playing');
  } finally { dom.window.close(); }
}

// Install instrumentation before the production script. Native implementations are
// retained: real MP3 parsing, buffering, playback time and ended are never mocked.
const instrumentation = `<img src="/__probe/hold" alt=""><script>
(function () {
  var audio = document.getElementById('mcheck-audio');
  var button = document.getElementById('mcheck-start');
  var metrics = {srcAssignments:0, playCalls:0, appendCalls:0, appends:[], types:[]};
  var finished = false, clicked = false;
  var started = performance.now();
  var nativeSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(audio, 'src', {
    get: function () { return nativeSrc.get.call(this); },
    set: function (value) { metrics.srcAssignments++; nativeSrc.set.call(this, value); }
  });
  var nativePlay = audio.play.bind(audio);
  audio.play = function () { metrics.playCalls++; return nativePlay(); };
  if (window.MediaSource) {
    var nativeAdd = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (type) {
      metrics.types.push(type);
      var buffer = nativeAdd.call(this, type);
      var nativeAppend = buffer.appendBuffer.bind(buffer);
      buffer.appendBuffer = function (bytes) { metrics.appendCalls++; return nativeAppend(bytes); };
      buffer.addEventListener('updateend', function () {
        metrics.appends.push({mode:buffer.mode, ranges:buffer.buffered.length,
          end:buffer.buffered.length ? buffer.buffered.end(buffer.buffered.length - 1) : 0});
      });
      return buffer;
    };
  }
  function currentReport() {
    var text = document.getElementById('mcheck-report').value;
    return text ? JSON.parse(text) : null;
  }
  function finish(error) {
    if (finished) return;
    finished = true;
    observer.disconnect();
    var result = {report:currentReport(), metrics:metrics,
      error:error || null, audioEnded:audio.ended, currentTime:audio.currentTime,
      duration:audio.duration, elapsedMs:Math.round(performance.now()-started)};
    var output = document.createElement('pre');
    output.id = 'continuous-probe-result';
    output.textContent = JSON.stringify(result);
    document.body.appendChild(output);
    fetch('/__probe/done', {method:'POST', body:JSON.stringify(result)});
  }
  function inspect() {
    if (finished) return;
    var report = currentReport();
    if (report && report.events.some(function (event) {return event.event === 'failure' || event.event === 'unsupported';})) {
      finish('Production page reported a failure or unsupported MSE');
      return;
    }
    if (!clicked && !button.disabled) {clicked=true; button.click();}
  }
  var observer = new MutationObserver(inspect);
  observer.observe(document.getElementById('mcheck'), {attributes:true, childList:true, subtree:true});
  audio.addEventListener('ended', function () {setTimeout(function () {finish();}, 0);});
  window.addEventListener('error', function (event) {finish(event.message || 'Window error');});
  window.addEventListener('unhandledrejection', function (event) {finish(String(event.reason));});
  setTimeout(inspect, 0);
})();</script>`;

function chromePath() {
  const candidates = [process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean);
  const browser = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(browser, 'Chromium not found; set CHROME_BIN to an existing executable');
  return browser;
}

async function checkRealMedia() {
  const executable = chromePath();
  const scriptTag = /<script\s+src=["']\/js\/music-continuous-check\.js[^"']*["'][^>]*>/;
  assert.match(page, scriptTag, 'actual page loads the production continuous-check script');
  const instrumentedPage = page.replace(scriptTag, match => instrumentation + match);
  const assets = new Map([
    ['/js/music-continuous-check.js', ['application/javascript', Buffer.from(script)]],
    ['/css/custom.css', ['text/css', read('css/custom.css')]],
    ['/media/music-check/tone-a.mp3', ['audio/mpeg', read('media/music-check/tone-a.mp3')]],
    ['/media/music-check/tone-b.mp3', ['audio/mpeg', read('media/music-check/tone-b.mp3')]]
  ]);
  const heldResponses = new Set();
  const requestedAudio = new Set();
  let postedResult;
  let child;
  let timeout;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/__probe/hold') {
      response.setHeader('Content-Type', 'image/gif');
      if (postedResult) response.end(transparentGif);
      else heldResponses.add(response);
    } else if (pathname === '/__probe/done' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 131072) request.destroy(); });
      request.on('end', () => {
        try { postedResult = JSON.parse(body); } catch (_) { response.writeHead(400); response.end(); return; }
        response.end('ok');
        for (const held of heldResponses) held.end(transparentGif);
        heldResponses.clear();
      });
    } else if (pathname === '/music-check/continuous.html') {
      response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      response.end(instrumentedPage);
    } else if (assets.has(pathname)) {
      const [type, body] = assets.get(pathname);
      if (type === 'audio/mpeg') requestedAudio.add(pathname);
      response.writeHead(200, {'Content-Type':type, 'Content-Length':body.length});
      response.end(body);
    } else { response.writeHead(404); response.end(); }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/music-check/continuous.html';
    console.log('Running real Chromium playback (~36 seconds); no virtual-time acceleration.');
    const result = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio',
        '--autoplay-policy=no-user-gesture-required', '--dump-dom', url],
      {windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
      timeout = setTimeout(() => reject(new Error('Chromium media test exceeded 45 seconds. ' + stderr.slice(-1200))), 45000);
      child.stdout.on('data', data => {stdout += data;});
      child.stderr.on('data', data => {stderr = (stderr + data).slice(-6000);});
      child.once('error', reject);
      child.once('close', code => resolve({code, stdout, stderr}));
    });
    assert.equal(result.code, 0, 'Chromium exited successfully: ' + result.stderr);
    assert.ok(postedResult, 'ended or failure handler returned the real-page report');
    assert.match(result.stdout, /id="continuous-probe-result"/, 'dump-dom waited for the completed report');
    assert.equal(postedResult.error, null, JSON.stringify(postedResult));
    const {report, metrics} = postedResult;
    assert.equal(report.strategy, 'continuous-mse');
    assert.equal(report.supported, true);
    assert.equal(report.prepared, true);
    assert.equal(report.srcAssignments, 1);
    assert.equal(report.playRequests, 1);
    assert.equal(report.completedTracks, 3);
    assert.equal(report.events.some(event => event.event === 'failure'), false);
    assert.equal(report.events.filter(event => event.event === 'ended').length, 1);
    assert.ok(report.events.some(event => event.event === 'play-resolved'));
    assert.equal(metrics.srcAssignments, 1, 'independent native src setter count');
    assert.equal(metrics.playCalls, 1, 'independent native play call count');
    assert.equal(metrics.appendCalls, 3, 'three real MP3 appends');
    assert.deepEqual(metrics.types, ['audio/mpeg']);
    assert.equal(metrics.appends.length, 3);
    assert.ok(metrics.appends.every(append => append.mode === 'sequence' && append.ranges === 1));
    assert.equal(requestedAudio.size, 2, 'actual two MP3 assets fetched');
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(report.segmentEnds[i] - 12.042448 * (i + 1)) < 0.15,
        'actual buffered segment end: ' + JSON.stringify(report.segmentEnds));
      assert.ok(Math.abs(metrics.appends[i].end - report.segmentEnds[i]) < 0.001);
    }
    assert.ok(Math.abs(report.duration - 36.127344) < 0.15);
    assert.ok(Math.abs(postedResult.duration - report.duration) < 0.001);
    assert.ok(Math.abs(postedResult.currentTime - report.duration) < 0.05);
    assert.equal(postedResult.audioEnded, true);
    assert.ok(postedResult.elapsedMs >= 35000 && postedResult.elapsedMs < 45000, 'real elapsed playback time');
    console.log('PASS real MSE: append=3 src=1 play=1 ended=true duration=' + report.duration +
      ' elapsedMs=' + postedResult.elapsedMs);
  } finally {
    clearTimeout(timeout);
    if (child && child.pid && child.exitCode === null) {
      // Only terminate the browser process tree spawned by this test.
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
          {windowsHide:true, stdio:'ignore', timeout:5000});
      } else child.kill('SIGKILL');
    }
    for (const held of heldResponses) held.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  await checkUnsupported();
  await checkRealMedia();
  console.log('RESULT: PASS_2_F0 (' + (built ? 'built' : 'source') +
    '; desktop MSE only, Android background behavior requires a real device)');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
