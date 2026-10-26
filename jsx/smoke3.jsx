// DSH <-> PR smoke test v3 — import-driven, non-destructive.
(function () {
    var OUT = 'C:/Users/PJM/Documents/deepseek-harness/default-workspace/pr-bridge/out/';
    var LOG = OUT + 'smoke3-log.txt';
    var SRC = OUT + 'dsh-test-frame.png';
    var FRAME = OUT + 'smoke-frame.png';

    function log(s) {
        try { var f = new File(LOG); f.encoding = 'UTF-8'; f.open('a'); f.writeln(s); f.close(); } catch (e) {}
    }
    function n(x) { return (x === undefined || x === null) ? 'NULL' : x; }

    var f0 = new File(LOG); f0.open('w'); f0.close();
    log('PR ' + app.version + ' build ' + app.build);
    log('project=' + app.project.name);

    var item = null, seq = null;

    try {
        var srcFile = new File(SRC);
        log('source exists=' + srcFile.exists + ' size=' + srcFile.length);

        var imp = app.project.importFiles([SRC], true, app.project.rootItem, false);
        log('importFiles returned=' + n(imp));
    } catch (e0) { log('import threw: ' + e0); }

    // locate the imported item by name
    try {
        for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
            var c = app.project.rootItem.children[i];
            if (c && c.name && c.name.indexOf('dsh-test-frame') === 0) { item = c; break; }
        }
        log('imported item=' + n(item ? item.name : null));
        if (item) { log('item type=' + item.type + ' mediaPath=' + item.getMediaPath()); }
    } catch (e1) { log('locate threw: ' + e1); }

    try {
        if (item) {
            seq = app.project.createNewSequenceFromClips('DSH_SMOKE', [item], app.project.rootItem);
            log('sequence=' + seq.name + ' v=' + seq.videoTracks.numTracks + ' a=' + seq.audioTracks.numTracks);
            var v1 = seq.videoTracks[0];
            log('V1 clips=' + v1.clips.numItems);
            if (v1.clips.numItems) { log('V1 clip0 name=' + v1.clips[0].name + ' start=' + v1.clips[0].start + ' end=' + v1.clips[0].end); }
        }
    } catch (e2) { log('sequence threw: ' + e2); }

    try {
        app.enableQE();
        var qseq = qe.project.getActiveSequence();
        log('qe seq=' + n(qseq ? qseq.name : null));
        if (qseq) {
            qseq.exportFramePNG(Math.round(1.0 * 254016000000), FRAME);
            var fr = new File(FRAME);
            log('frame exists=' + fr.exists + ' size=' + (fr.exists ? fr.length : 0));
        }
    } catch (e3) { log('QE threw: ' + e3); }

    // cleanup so the open project keeps its previous bin contents
    try { if (seq) { seq.projectItem.deleteMedia(); log('deleted sequence'); } } catch (e4) { log('seq cleanup: ' + e4); }
    try { if (item) { item.deleteMedia(); log('deleted source item'); } } catch (e5) { log('item cleanup: ' + e5); }

    log('__DONE__');
})();
