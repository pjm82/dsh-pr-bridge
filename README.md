# dsh-pr-bridge

A local bridge that lets an agent (DeepSeek Harness / any script runner) drive **Adobe Premiere Pro** on Windows through a CEP panel, a file queue and ExtendScript.

No MCP server, no ffmpeg, no desktop automation, no screen scraping. One CEP panel polls a folder, executes ExtendScript inside Premiere, and writes results back.

```
agent / PowerShell                    Premiere Pro (CEP panel)
        |                                      |
        |  write queue/<id>.json  {jsx}        |
        |------------------------------------->|  poll every 250 ms
        |                                      |  CSInterface.evalScript(jsx)
        |                                      |  -> script writes its own log file
        |  read done/<id>.json  {ok,result}    |
        |<-------------------------------------|
        |                                      |
        |  status.json heartbeat (1 s)         |
```

## Why a file queue

`evalScript` returns a single string and swallows anything structured. Instead of fighting that, every script writes its own log/JSON with `File()` and the caller reads the file. The queue keeps the call side dumb and debuggable: a stuck call is just an unread `.json` in `queue/`.

## Requirements

- Windows
- Adobe Premiere Pro 2025+ (tested on 2026 / 26.5.2, CEP 12)
- CEP debug mode enabled (unsigned extension)
- `CSInterface.js` copied from your own Premiere install (Adobe ships it; this repo does **not** redistribute it)

## Install

```powershell
# 1. copy the panel
$dest = "$env:APPDATA\Adobe\CEP\extensions\com.dsh.prbridge"
robocopy .\extension $dest /E
# 2. copy CSInterface.js from your install
Copy-Item "C:\Program Files\Adobe\Adobe Premiere Pro 2026\CEP\extensions\com.adobe.LABOR.LearningPanel\lib\CSInterface.js" "$dest\js\CSInterface.js"
# 3. allow unsigned panels
New-Item "HKCU:\SOFTWARE\Adobe\CSXS.12" -Force | Out-Null
Set-ItemProperty "HKCU:\SOFTWARE\Adobe\CSXS.12" -Name PlayerDebugMode -Value "1"
```

Then open **Window → Extensions → DSH PR Bridge** once. Premiere remembers the workspace, so it comes back on later launches.

## Usage

```powershell
. .\dsh-pr.ps1
Wait-PRBridge -TimeoutSec 20        # returns $null when the panel is not open
Invoke-PRFile -Path .\jsx\cut2.jsx  # runs a .jsx file inside Premiere
Invoke-PRJsx -Jsx "app.version"     # one-off inline call
```

`ok=True` only means the script did not throw. Real results come from the log file the
script writes (look for a `__DONE__` line).

Writing your own script:

```javascript
(function () {
    var LOG = 'C:/work/out/my-log.txt';
    function log(s) { var f = new File(LOG); f.encoding = 'UTF-8'; f.open('a'); f.writeln(s); f.close(); }
    var f0 = new File(LOG); f0.open('w'); f0.close();   // truncate per run
    // app.project / sequence / track ...
    log('__DONE__');
})();
```

Three rules that save time:

1. Pass data through files, never through the return value.
2. Match media by `getMediaPath()`, not by `name` — ExtendScript decodes names as ANSI and mangles non-ASCII.
3. `app.project.saveAs()` switches the open document; back up before calling it on someone's project.

## Verified capability matrix

Measured on Premiere Pro 26.5.2 / CEP 12, Windows. "Verified" means a script ran and its output was read back.

| Capability | Status | Evidence |
| --- | --- | --- |
| Panel ↔ Premiere channel | yes | `status.json` heartbeat, `PPRO 26.5.2` |
| `importFiles` | yes | imported stills and SRT |
| `createNewSequenceFromClips` | yes | sequence with 3 video / 3 audio tracks |
| Source in/out + `insertClip` | yes | 3 segments, 4.99 s each at 25 fps, linked audio followed |
| `clip.remove(false, true)` | yes | cleared a track to 0 clips |
| Read timeline back | yes | `start`/`end`/`duration` in seconds |
| `project.saveAs` | yes | 27 KB `.prproj`, gzip XML verified after decode |
| `deleteMedia` | no | method absent in this build |
| QE `exportFramePNG` | no | 8 calling conventions, all `Illegal Parameter type` / `Unknown error` |
| `exportAsMediaDirect` | no | returns without writing a file (no encoder backend) |
| `app.encoder.encodeSequence` | no | `Unknown error exception`; no Media Encoder installed |
| `exportAsFinalCutProXML` | no | uncatchable native error, aborts the script |
| Caption track API | no | `createCaptionTrack` exists but rejects 12 argument shapes; `createCaptionTrackFromClip` not exposed |
| `PProHeadless.exe` | no | crashes on startup (0xC0000409) on this install |

If export is unavailable on your machine too, add a working `.epr` preset or install
Adobe Media Encoder — the encoder bridge is what `exportAsMediaDirect` needs.

## tools/ — subtitle pipeline

Small, dependency-light helpers used alongside the bridge:

- `asr.py` — faster-whisper pass with word timestamps plus `avg_logprob`, `no_speech_prob`, `compression_ratio`; VAD toggle, prompt and beam are flags so runs can be compared on numbers.
- `build_srt.py` — OpenCC t2s, cue splitting at word gaps, duration clamps, coverage/gap report.
- `finalize_srt.py` — merge short cues, forbid overlaps, emit an SRT.
- `envelope.py` — loudness envelope, so "missing subtitles" can be told apart from "nothing was sung there".
- `show.py` — print a transcript JSON compactly.

Practical note from testing: for sung vocals, turning VAD **off** raised coverage from 67.9% to 77.6%; a bigger model did not fix mis-heard characters. When the model output made the song identifiable, replacing the text with the real lyric (keeping ASR timing) was what actually made the subtitles usable.

## 中文速览

这个仓库让脚本经由 CEP 面板 + 文件队列 + ExtendScript 操控 Premiere：面板每 250 ms 轮询队列，把 JSX 送进 PR 执行，脚本自己写日志文件，调用方读文件取结果。

**安装**：复制 `extension/` 到 `%APPDATA%\Adobe\CEP\extensions\com.dsh.prbridge`，从你自己的 PR 安装里拷一份 `CSInterface.js`，把 `HKCU\SOFTWARE\Adobe\CSXS.12\PlayerDebugMode` 设为 `1`，然后在 PR 里打开 **窗口 → 扩展 → DSH PR Bridge**（只需一次）。

**用法**：`Invoke-PRFile -Path .\jsx\cut2.jsx`。返回 `ok=True` 只代表没抛异常，真正结果看脚本写的日志里有没有 `__DONE__`。

**已验证**：导入素材、建序列、按源进出点插入并联动音频、读回时间码、另存工程。
**不可用**：删除素材项、导出帧、导出成片、脚本建字幕轨、headless 渲染（详见上表）。

## License

MIT. See `LICENSE`.
