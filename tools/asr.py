"""Controllable faster-whisper pass: lets us compare VAD / prompt settings.

Prints a JSON report with coverage so parameter changes are judged on numbers,
not impressions.
"""
import argparse
import json
import time

import av
import numpy as np
from faster_whisper import WhisperModel

RATE = 16000


def decode(path):
    container = av.open(path)
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)
    chunks = []
    for frame in container.decode(stream):
        frame.pts = None
        for out in resampler.resample(frame):
            chunks.append(out.to_ndarray().tobytes())
    for out in resampler.resample(None):
        chunks.append(out.to_ndarray().tobytes())
    container.close()
    return np.frombuffer(b"".join(chunks), dtype=np.int16).astype(np.float32) / 32768.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--vad", choices=["on", "off"], default="off")
    ap.add_argument("--beam", type=int, default=5)
    ap.add_argument("--prompt", default="")
    ap.add_argument("--language", default="zh")
    ap.add_argument("--condition-prev", action="store_true")
    args = ap.parse_args()

    audio = decode(args.input)
    duration = len(audio) / RATE
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=4, num_workers=1)

    t0 = time.time()
    segments, info = model.transcribe(
        audio,
        language=args.language,
        word_timestamps=True,
        vad_filter=(args.vad == "on"),
        beam_size=args.beam,
        condition_on_previous_text=args.condition_prev,
        initial_prompt=args.prompt or None,
        temperature=0.0,
    )
    out, covered, lp, ns, cr = [], 0.0, [], [], []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        words = [{"start": w.start, "end": w.end, "word": w.word} for w in (seg.words or [])]
        out.append({
            "start": seg.start, "end": seg.end, "text": text, "words": words,
            "avg_logprob": float(getattr(seg, "avg_logprob", 0.0)),
            "no_speech_prob": float(getattr(seg, "no_speech_prob", 0.0)),
            "compression_ratio": float(getattr(seg, "compression_ratio", 0.0)),
        })
        covered += seg.end - seg.start
        lp.append(float(getattr(seg, "avg_logprob", 0.0)))
        ns.append(float(getattr(seg, "no_speech_prob", 0.0)))
        cr.append(float(getattr(seg, "compression_ratio", 0.0)))

    payload = {
        "config": {"vad": args.vad, "beam": args.beam, "prompt": args.prompt, "model": args.model,
                   "condition_prev": args.condition_prev},
        "duration": round(duration, 2),
        "language": info.language,
        "segments": out,
        "coverage_pct": round(covered / duration * 100, 1),
        "elapsed_s": round(time.time() - t0, 1),
        "chars": sum(len(s["text"]) for s in out),
        "mean_logprob": round(sum(lp) / len(lp), 4) if lp else None,
        "mean_no_speech": round(sum(ns) / len(ns), 4) if ns else None,
        "max_compression": round(max(cr), 3) if cr else None,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in payload.items() if k != "segments"}, ensure_ascii=False))


if __name__ == "__main__":
    main()

