// Export DSH_CUT to a real movie file using a preset shipped with this install.
(function () {
    var OUT = 'C:/Users/PJM/Documents/deepseek-harness/default-workspace/pr-bridge/out/';
    var LOG = OUT + 'export-log.txt';
    var DEST = OUT + 'DSH_CUT.mov';
    function log(s) { var f = new File(LOG); f.encoding = 'UTF-8'; f.open('a'); f.writeln(s); f.close(); }
    function safe(fn, d) { try { return fn(); } catch (e) { return d + '<' + e + '>'; } }

    var f0 = new File(LOG); f0.open('w'); f0.close();

    var presets = [
        'C:/Pr/Adobe Premiere Pro 2026/Settings/EncoderPresets/ConsolidateAndTranscode/Match Source - Apple ProRes 422.epr',
        'C:/Pr/Adobe Premiere Pro 2026/Settings/EncoderPresets/ConsolidateAndTranscode/Match Source - DNxHD.epr'
    ];

    var seqs = app.project.sequences, seq = null;
    for (var i = 0; i < seqs.numSequences; i++) { if (seqs[i].name === 'DSH_CUT') { seq = seqs[i]; } }
    if (!seq) { log('__NO_SEQ__'); return; }
    app.project.activeSequence = seq;
    log('seq=' + seq.name + ' size=' + seq.frameSizeHorizontal + 'x' + seq.frameSizeVertical);

    var old = new File(DEST);
    if (old.exists) { old.remove(); }

    var done = false;
    for (var p = 0; p < presets.length && !done; p++) {
        var pf = new File(presets[p]);
        log('preset[' + p + '] ' + pf.name + ' exists=' + pf.exists);
        if (!pf.exists) { continue; }
        try {
            seq.exportAsMediaDirect(DEST, presets[p], 0);
            var out = new File(DEST);
            log('exportAsMediaDirect returned; exists=' + out.exists + ' size=' + (out.exists ? out.length : 0));
            done = true;
        } catch (e) { log('export failed: ' + e); }
    }
    log(done ? '__DONE__' : '__NO_PRESET__');
})();
