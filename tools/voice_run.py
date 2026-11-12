"""Cut long pauses, speed up slightly, remap word timings.
usage: python tools/voice_run.py --video goose_king --voice videos/goose_king/audio/raw.mp3 [--keep 0.22] [--tempo 1.05]
Writes audio/voice.wav (48 kHz mono) and audio/words.json ({word,clean,start,end} in seconds)."""
import argparse, json, re, subprocess, wave
from pathlib import Path
import numpy as np

SR = 48000
LONG_BEFORE = {"could", "honk", "and", "not", "one"}  # beats that keep a longer comic pause before them

def pcm(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def silences(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "silencedetect=noise=-38dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
    t = [float(x) for x in re.findall(r"silence_(?:start|end): ([0-9.]+)", err)]
    return list(zip(t[::2], t[1::2]))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--voice", required=True)
    ap.add_argument("--keep", type=float, default=0.22); ap.add_argument("--tempo", type=float, default=1.05)
    a = ap.parse_args()
    d = Path("videos") / a.video / "audio"
    words = json.loads((d / "words_raw.json").read_text())
    x = pcm(a.voice)
    # cuts: (start, end) in source seconds removed from the middle of each long silence
    cuts = []
    for s, e in silences(a.voice):
        nxt = next((w for w in words if w["start"] >= s - 0.05), None)
        keep = a.keep * (1.8 if nxt and nxt["clean"] in LONG_BEFORE else 1.0)
        if s < 0.05: cuts.append((0.0, max(0.0, e - 0.05))); continue
        if e - s > keep: cuts.append((s + keep / 2, e - keep / 2))
    def remap(t):
        return (t - sum(min(e, t) - c0 for c0, e in cuts if t > c0)) / a.tempo
    keep_idx = np.ones(len(x), bool)
    for c0, e in cuts: keep_idx[int(c0 * SR):int(e * SR)] = False
    # 5 ms fades at every join to avoid clicks
    y = x[keep_idx]
    joins = [int(remap(c0) * a.tempo * SR) for c0, _ in cuts]
    f = int(0.005 * SR); ramp = np.linspace(0, 1, f, dtype=np.float32)
    for j in joins:
        if f < j < len(y) - f: y[j - f:j] *= ramp[::-1]; y[j:j + f] *= ramp
    tmp = d / "_cut.wav"
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", f"atempo={a.tempo},apad=pad_dur=0.6", "-ar", str(SR), str(d / "voice.wav")], check=True)
    tmp.unlink()
    out = [{**w, "start": round(remap(w["start"]), 3), "end": round(remap(w["end"]), 3)} for w in words]
    assert all(out[i]["start"] <= out[i + 1]["start"] for i in range(len(out) - 1)), "word order broken"
    (d / "words.json").write_text(json.dumps(out, indent=1))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(d / "voice.wav")], capture_output=True, text=True).stdout)
    print(f"cut {len(cuts)} pauses, voice {dur:.2f}s, last word ends {out[-1]['end']:.2f}s")

if __name__ == "__main__":
    main()
