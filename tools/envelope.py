"""Report the loudness envelope of the source audio so ASR gaps can be judged."""
import json
import sys

import av
import numpy as np

path = sys.argv[1]
step = 0.5
rate = 16000

container = av.open(path)
stream = container.streams.audio[0]
resampler = av.AudioResampler(format="s16", layout="mono", rate=rate)
chunks = []
for frame in container.decode(stream):
    frame.pts = None
    for out in resampler.resample(frame):
        chunks.append(out.to_ndarray().tobytes())
for out in resampler.resample(None):
    chunks.append(out.to_ndarray().tobytes())
audio = np.frombuffer(b"".join(chunks), dtype=np.int16).astype(np.float32) / 32768.0
container.close()

win = int(rate * step)
rows = []
for i in range(0, len(audio) - win + 1, win):
    seg = audio[i:i + win]
    rms = float(np.sqrt((seg ** 2).mean()))
    db = 20 * np.log10(max(rms, 1e-6))
    rows.append({"t": round(i / rate, 2), "db": round(db, 1)})

loud = [r for r in rows if r["db"] > -35]
print(json.dumps({
    "duration": round(len(audio) / rate, 2),
    "median_db": round(float(np.median([r["db"] for r in rows])), 1),
    "loud_share_pct": round(len(loud) / len(rows) * 100, 1),
    "envelope_db": [r["db"] for r in rows],
}, ensure_ascii=False, indent=2))
