"""Post-process a faster-whisper transcript into a clean SRT.

- rebuilds cues from word timestamps so long musical stretches are split at word
  boundaries instead of being truncated mid-sentence
- merges cues shorter than MIN_DUR into the nearest neighbour
- clamps to media duration, forbids overlaps
- reports coverage and gaps so missed speech is visible, not hidden
"""
import json
import sys
from pathlib import Path

MIN_DUR = 1.0
MAX_DUR = 5.5
WORD_GAP = 0.55


def ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def cues_from_words(seg):
    words = seg.get("words") or []
    text = " ".join(str(seg.get("text", "")).split())
    if not words:
        return [{"start": float(seg["start"]), "end": float(seg["end"]), "text": text}]

    cues, cur = [], []
    for w in words:
        ws, we = float(w["start"]), float(w["end"])
        if cur:
            gap = ws - cur[-1]["end"]
            span = we - cur[0]["start"]
            if gap > WORD_GAP and span >= MIN_DUR * 1.5:
                cues.append(cur)
                cur = []
            elif span > MAX_DUR:
                cues.append(cur)
                cur = []
        cur.append({"start": ws, "end": we, "word": w.get("word", "")})
    if cur:
        cues.append(cur)

    out = []
    for c in cues:
        t = "".join(x["word"] for x in c).strip()
        if t:
            out.append({"start": c[0]["start"], "end": max(x["end"] for x in c), "text": t})
    return out


def merge_short(cues):
    out = list(cues)
    changed = True
    while changed:
        changed = False
        for i, c in enumerate(out):
            if c["end"] - c["start"] >= MIN_DUR or len(out) == 1:
                continue
            prev_gap = (c["start"] - out[i - 1]["end"]) if i > 0 else 1e9
            next_gap = (out[i + 1]["start"] - c["end"]) if i + 1 < len(out) else 1e9
            if prev_gap > 1.2 and next_gap > 1.2:
                continue
            j = i - 1 if prev_gap <= next_gap else i + 1
            if not (0 <= j < len(out)):
                continue
            a, b = (j, i) if j < i else (i, j)
            out[a]["text"] = out[a]["text"] + out[b]["text"]
            out[a]["end"] = max(out[a]["end"], out[b]["end"])
            del out[b]
            changed = True
            break
    return out


def main():
    src, duration, dst = Path(sys.argv[1]), float(sys.argv[2]), Path(sys.argv[3])
    data = json.loads(src.read_text(encoding="utf-8"))

    cues = []
    for seg in data.get("segments", []):
        cues.extend(cues_from_words(seg))
    cues = merge_short(cues)

    fixed, cursor = [], 0.0
    for c in cues:
        start = max(c["start"], cursor)
        end = min(c["end"], duration)
        if end - start < 0.35:
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
        if c["start"] - prev > 2.0:
            gaps.append((round(prev, 2), round(c["start"], 2)))
        prev = c["end"]
    if duration - prev > 2.0:
        gaps.append((round(prev, 2), round(duration, 2)))

    print(json.dumps({
        "input": str(src),
        "cues": len(fixed),
        "coverage_pct": round(covered / duration * 100, 1),
        "duration": duration,
        "gaps_over_2s": gaps,
        "output": str(dst),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
