// Save-As the live project to a copy inside the DSH workspace, then verify the write.
// The user's original 1_1.prproj is never modified by this script.
(function () {
    var OUT = 'C:/Users/PJM/Documents/deepseek-harness/default-workspace/pr-bridge/out/';
    var LOG = OUT + 'save-log.txt';
    var DEST = OUT + 'DSH_PROJECT.prproj';
    function log(s) { var f = new File(LOG); f.encoding = 'UTF-8'; f.open('a'); f.writeln(s); f.close(); }
    function safe(fn, d) { try { return fn(); } catch (e) { return d + '<' + e + '>'; } }

    var f0 = new File(LOG); f0.open('w'); f0.close();
    log('before: project=' + app.project.name + ' path=' + app.project.path);
    log('openDocument=' + typeof app.openDocument);

    var old = new File(DEST);
    if (old.exists) { old.remove(); log('removed previous copy'); }

    var ok = safe(function () { app.project.saveAs(DEST); return true; }, false);
    log('saveAs returned=' + ok);
    log('after: path=' + app.project.path);

    var f = new File(DEST);
    log('copy exists=' + f.exists + ' size=' + (f.exists ? f.length : 0));
    log('__DONE__');
})();
