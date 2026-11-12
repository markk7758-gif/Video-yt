"""ElevenLabs TTS with word timings.  usage: python tools/eleven.py tts <video>
Reads videos/<video>/script.txt, writes audio/raw.mp3 + audio/words.json.
Key comes from ELEVENLABS_API_KEY (never stored in the repo)."""
import base64, json, os, re, sys, urllib.request
from pathlib import Path

VOICE = os.environ.get("ELEVEN_VOICE", "nIVOcNd1mxUTpFsKXUhK")  # "yt 2"

def words_from_alignment(al):
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur = [], None
    for c, s, e in zip(chars, st, en):
        if c.isspace():
            cur = None
            continue
        if cur is None:
            cur = {"word": "", "start": s, "end": e}
            out.append(cur)
        cur["word"] += c
        cur["end"] = e
    for w in out:
        w["clean"] = re.sub(r"[^a-z']", "", w["word"].lower())
    return [w for w in out if w["clean"]]

def tts(video):
    d = Path("videos") / video
    text = (d / "script.txt").read_text().strip()
    body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                       "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.0}}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
                                 data=body, headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=300))
    (d / "audio").mkdir(parents=True, exist_ok=True)
    (d / "audio/raw.mp3").write_bytes(base64.b64decode(r["audio_base64"]))
    words = words_from_alignment(r["alignment"])
    (d / "audio/words_raw.json").write_text(json.dumps(words, indent=1))
    print(f"{len(words)} words, {words[-1]['end']:.2f}s")

if __name__ == "__main__":
    assert sys.argv[1] == "tts", __doc__
    tts(sys.argv[2])
