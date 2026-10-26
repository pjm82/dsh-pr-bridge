/* DSH PR Bridge — CEP panel side.
 * Polls a file queue, executes ExtendScript inside Premiere, writes results back.
 * Protocol:
 *   queue/<id>.json  { "id":"...", "jsx":"...source..." }   -> written by DSH
 *   done/<id>.json   { "id":"...", "ok":true, "result":"..." } -> written by panel
 *   status.json      heartbeat { ts, hostVersion, cep, queue }
 */
(function () {
  var cs = new CSInterface();
  var logEl = document.getElementById('log');
  var dot = document.getElementById('dot');
  var stateEl = document.getElementById('state');
  var metaEl = document.getElementById('meta');

  var BRIDGE, fs, path, nodeOK = false;
  var busy = false;
  var processed = 0;
  var lastErr = '';

  function log(msg) {
    var t = new Date().toTimeString().slice(0, 8);
    logEl.textContent += '[' + t + '] ' + msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
    if (logEl.textContent.length > 8000) logEl.textContent = logEl.textContent.slice(-6000);
  }
  function setState(text, cls) { stateEl.textContent = text; dot.className = cls || ''; }

  try {
    fs = require('fs');
    path = require('path');
    nodeOK = true;
    BRIDGE = path.join(process.env.LOCALAPPDATA, 'DSH', 'pr-bridge');
  } catch (e) {
    log('node require failed: ' + e.message);
    try {
      var base = cs.getSystemPath(SystemPath.USER_DATA);
      BRIDGE = base.replace(/[\\\/][^\\\/]+$/, '') + '\\..\\Local\\DSH\\pr-bridge';
    } catch (e2) {
      BRIDGE = 'C:\\Users\\' + 'Public' + '\\DSH\\pr-bridge';
    }
  }

  var QUEUE = BRIDGE + '\\queue', DONE = BRIDGE + '\\done', LOGS = BRIDGE + '\\logs';

  function ensureDirs() {
    [BRIDGE, QUEUE, DONE, LOGS].forEach(function (d) {
      try { if (nodeOK) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } } catch (e) {}
    });
  }

  function writeFile(p, text) {
    try {
      if (nodeOK) { fs.writeFileSync(p, text, 'utf8'); return true; }
    } catch (e) { log('write fail ' + p + ': ' + e.message); }
    return false;
  }

  function heartbeat() {
    var payload = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      node: nodeOK,
      bridge: BRIDGE,
      processed: processed
    };
    writeFile(BRIDGE + '\\status.json', JSON.stringify(payload));
  }

  function finish(id, ok, result) {
    writeFile(DONE + '\\' + id + '.json', JSON.stringify({
      id: id, ok: ok, result: String(result === undefined ? '' : result).slice(0, 4000)
    }));
    try { if (nodeOK && fs.existsSync(QUEUE + '\\' + id + '.json')) fs.unlinkSync(QUEUE + '\\' + id + '.json'); } catch (e) {}
  }

  function runOne(id) {
    var raw;
    try { raw = fs.readFileSync(QUEUE + '\\' + id + '.json', 'utf8'); }
    catch (e) { log('read fail ' + id + ': ' + e.message); return; }

    var cmd;
    try { cmd = JSON.parse(raw); }
    catch (e) {
      log('bad json ' + id + ': ' + e.message);
      finish(id, false, 'queue json parse error: ' + e.message);
      return;
    }
    if (!cmd || typeof cmd.jsx !== 'string') { finish(id, false, 'missing jsx'); return; }

    busy = true;
    setState('running ' + id, '');
    log('run ' + id + ' (' + cmd.jsx.length + ' bytes)');
    var started = Date.now();

    cs.evalScript(cmd.jsx, function (res) {
      var elapsed = Date.now() - started;
      var ok = !(typeof res === 'string' && /^EvalScript error\.?$/i.test(res.trim()));
      processed++;
      finish(id, ok, res);
      log((ok ? 'done ' : 'ERR ') + id + ' in ' + elapsed + 'ms :: ' + String(res).slice(0, 160));
      lastErr = ok ? '' : String(res);
      setState(ok ? ('idle · ' + processed + ' done') : 'error', ok ? 'ok' : 'bad');
      busy = false;
      heartbeat();
    });
  }

  function poll() {
    if (busy) return;
    var files;
    try { files = nodeOK ? fs.readdirSync(QUEUE) : []; } catch (e) { return; }
    var pending = files.filter(function (f) { return /\.json$/i.test(f); }).map(function (f) { return f.replace(/\.json$/i, ''); });
    if (pending.length) { pending.sort(); runOne(pending[0]); }
  }

  ensureDirs();
  var hostVersion = cs.getHostEnvironment().appVersion || '?';
  metaEl.innerHTML = 'node=' + nodeOK + ' · PR ' + hostVersion + ' · <span class="k">' + BRIDGE + '</span>';
  log('bridge ready; queue=' + QUEUE);
  setState('idle', 'ok');
  heartbeat();
  setInterval(heartbeat, 1000);
  setInterval(poll, 250);
})();
