// Recalibrated cut: in-bounds trims, insert on V1 only (linked audio follows).
(function () {
    var OUT = 'C:/Users/PJM/Documents/deepseek-harness/default-workspace/pr-bridge/out/';
    var LOG = OUT + 'cut2-log.txt';
    function log(s) {
        var f = new File(LOG); f.encoding = 'UTF-8'; f.open('a'); f.writeln(s); f.close();
    }
    function safe(fn, d) { try { return fn(); } catch (e) { return d + '<' + e + '>'; } }

    var f0 = new File(LOG); f0.open('w'); f0.close();
    log('start');

    var src = null, root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        var mp = safe(function () { return c.getMediaPath(); }, '');
        if (mp && /\.mp4$/i.test(mp)) { src = c; break; }
    }
    if (!src) { log('__NO_MP4__'); return; }
    log('src=' + src.name);

    var seqs = app.project.sequences;
    var n = safe(function () { return seqs.numSequences; }, 0);
    var seq = null;
    for (var s = 0; s < n; s++) {
        if (safe(function () { return seqs[s].name; }, '') === 'DSH_CUT') { seq = seqs[s]; }
    }
    if (!seq) { log('__NO_SEQ__'); return; }
    app.project.activeSequence = seq;
    log('seq=' + seq.name);

    var v1 = seq.videoTracks[0], a1 = seq.audioTracks[0];
    while (v1.clips.numItems > 0) { v1.clips[0].remove(false, true); }
    while (a1.clips.numItems > 0) { a1.clips[0].remove(false, true); }
    log('cleared v=' + v1.clips.numItems + ' a=' + a1.clips.numItems);

    var cuts = [[0.5, 5.5], [6.0, 11.0], [11.5, 16.5]];
    var cur = 0.0;
    for (var k = 0; k < cuts.length; k++) {
        var aS = cuts[k][0], bS = cuts[k][1];
        safe(function () { return src.setInPoint(aS, 4); }, '');
        safe(function () { return src.setOutPoint(bS, 4); }, '');
        try { v1.insertClip(src, cur); log('insert at ' + cur); }
        catch (e) { log('insert err ' + e); }
        cur += (bS - aS);
    }

    log('RESULT v=' + v1.clips.numItems + ' a=' + a1.clips.numItems);
    for (var t = 0; t < v1.clips.numItems; t++) {
        var cl = v1.clips[t];
        log('  V1[' + t + '] start=' + safe(function () { return cl.start.seconds; }, '?') +
            ' end=' + safe(function () { return cl.end.seconds; }, '?') +
            ' dur=' + safe(function () { return cl.duration.seconds; }, '?'));
    }
    log('__DONE__');
})();
