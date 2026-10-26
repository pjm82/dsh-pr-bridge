"""Build the final SRT: OpenCC t2s + cue splitting/merging, with a QA report."""
import json
import sys
from pathlib import Path

import opencc

MIN_DUR = 1.0
MAX_DUR = 5.0
WORD_GAP = 0.6
cc = opencc.OpenCC("t2s")


def ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def cues_from_segment(seg):
    words = seg.get("words") or []
    if not words:
        return [{"start": seg["start"], "end": seg["end"], "text": seg["text"]}]
    cues, cur = [], []
    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            span = w["end"] - cur[0]["start"]
            if (gap > WORD_GAP and span >= MIN_DUR * 1.4) or span > MAX_DUR:
                cues.append(cur)
                cur = []
        cur.append(w)
    if cur:
        cues.append(cur)
    return [
        {"start": c[0]["start"], "end": max(x["end"] for x in c), "text": "".join(x["word"] for x in c).strip()}
        for c in cues
        if "".join(x["word"] for x in c).strip()
    ]


def main():
    src, duration, dst = Path(sys.argv[1]), float(sys.argv[2]), Path(sys.argv[3])
    data = json.loads(src.read_text(encoding="utf-8"))

    cues = []
    for seg in data["segments"]:
        seg = dict(seg)
        seg["text"] = cc.convert(seg["text"])
        cues.extend(cues_from_segment(seg))
    for c in cues:
        c["text"] = cc.convert(c["text"])

    cues.sort(key=lambda c: c["start"])
    fixed, cursor = [], 0.0
    for c in cues:
        start = max(c["start"], cursor)
        end = min(c["end"], duration)
        if end - start < 0.4:
            continue
        fixed.append({"start": start, "end": end, "text": c["text"]})
        cursor = end

    lines, covered = [], 0.0
    for i, c in enumerate(fixed, 1):
        lines.append(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n")
        covered += c["end"] - c["start"]
    dst.write_text("\n".join(lines), encoding="utf-8")

    gaps, prev = [], 0.0
    for c in fixed:
        if c["start"] - prev > 1.5:
            gaps.append([round(prev, 2), round(c["start"], 2)])
        prev = c["end"]
    if duration - prev > 1.5:
        gaps.append([round(prev, 2), round(duration, 2)])

    print(json.dumps({
        "cues": len(fixed),
        "coverage_pct": round(covered / duration * 100, 1),
        "chars": sum(len(c["text"]) for c in fixed),
        "avg_cue_s": round(covered / max(len(fixed), 1), 2),
        "gaps_over_1.5s": gaps,
        "output": str(dst),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
