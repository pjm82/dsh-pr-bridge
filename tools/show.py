import json
import sys

for path in sys.argv[1:]:
    data = json.load(open(path, encoding="utf-8"))
    print(f"== {path}  coverage={data.get('coverage_pct')}%  segments={len(data['segments'])}")
    for s in data["segments"]:
        print(f"  {s['start']:6.2f}-{s['end']:6.2f}  {s['text']}")
