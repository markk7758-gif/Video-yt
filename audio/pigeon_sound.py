"""Sound for "Cher Ami": synthesized SFX on every action (shells, rifle shots, wingbeats, coos, the loft, the medal, the
lab), an original score (tense snare + low drone in the forest, a heroic fife march for the flight, a music-box lullaby for
the bed analogy, a brass fanfare for the medal, a quirky pizzicato for the lab) ducked under the voice, -14 LUFS / -1 dBTP.
usage: python audio/pigeon_sound.py  ->  videos/cher_ami/audio/{mix.wav, stem_*.wav, cues.md}"""
import json
import os
import numpy as np
from scipy import ndimage
import sfx_gen as G
import instruments as I
from dsp import SR, ns, rng, lp, hp, bp, resbank, fades, st, pan, place, dbg, read_wav, write_wav, integrated, true_peak, make_ir, convolve_st

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(os.path.dirname(HERE), "videos", "cher_ami", "audio")
DUR = 65.08
N = ns(DUR)
R = rng(1918)
WORDS = json.load(open(os.path.join(VID, "words.json")))


def norm(x, peak=1.0):
    m = float(np.abs(x).max()) or 1.0
    return x * (peak / m)


# ---------------- our own sounds ----------------
def honk(r, dur=0.32, f0=330.0, big=1.0):
    """goose honk: buzzy nasal tone with a pitch hump, three nasal formants, a breathy edge"""
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.18 * np.sin(np.pi * np.clip(t / dur, 0, 1)) - 0.12 * t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = sum(np.sin(k * ph) / k ** 0.8 for k in range(1, 22))
    y = resbank(saw, [(850, 6, 1.0), (1500, 8, 0.8), (2700, 10, 0.5)]) + 0.2 * hp(r.standard_normal(n), 2000)
    env = np.clip(t / 0.015, 0, 1) * np.clip((dur - t) / 0.06, 0, 1) * (1 + 0.3 * np.sin(2 * np.pi * 28 * t))
    return fades(norm(y * env) * big, 0.002, 0.01)


def thud(r, f=55.0, dur=0.7, dirt=0.4):
    n = ns(dur)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t * (1 - 0.25 * t)) * np.exp(-t / 0.18)
    grit = lp(r.standard_normal(n), 900) * np.exp(-t / 0.08) * dirt
    return norm(body + grit)


def pop_up(r, dur=0.18, f0=300, f1=900):
    """cartoon 'bloop': fast upward sine sweep"""
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    return fades(norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.6))), 0.002, 0.02)


def slide(r, f0, f1, dur, kind="tuba"):
    """trombone-ish 'wah' slide (brass with a gliding pitch)"""
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = sum(np.sin(k * ph) * (0.9 ** k) for k in range(1, 14))
    y = lp(y, 2200) * np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.08, 0, 1) * (1 + 0.15 * np.sin(2 * np.pi * 5.5 * t))
    return norm(y)


def sizzle(r, dur=1.2):
    n = ns(dur)
    t = np.arange(n) / SR
    crackle = (r.random(n) < 0.004) * r.standard_normal(n) * 3
    return norm(hp(r.standard_normal(n) * 0.4 + crackle, 3000) * np.exp(-t / 0.5))


def shimmer(r, dur=1.4, base=1568):
    """freeze: a descending glock glissando with an icy noise sheen"""
    out = np.zeros(ns(dur + 1.6))
    for k, m in enumerate([0, -2, -4, -5, -7, -9, -11, -12]):
        x = I.glock(base * 2 ** (m / 12), 0.5, r, 1.4); i = ns(k * 0.08); out[i:i + len(x)] += x[:len(out) - i]
    out[:ns(dur)] += hp(r.standard_normal(ns(dur)), 6000) * np.linspace(0.25, 0, ns(dur))
    return norm(out)


def crunch(r, dur=0.35, rate=40):
    n = ns(dur)
    y = np.zeros(n)
    for _ in range(int(rate * dur)):
        i = r.integers(0, n - 400)
        y[i:i + 400] += bp(r.standard_normal(400), 1500, 6000, 1) * np.exp(-np.arange(400) / 80)
    return norm(y * np.linspace(1, 0.3, n))


def squeak(r, dur=0.5, f0=900, f1=1400):
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * (t / dur) + 60 * np.sin(2 * np.pi * 14 * t)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    return fades(norm(y * np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)), 0.003, 0.02)


def splat(r):
    return norm(M(G.bubbles(0.35, r, 30), 0.6 * lp(r.standard_normal(ns(0.35)), 700) * np.exp(-np.arange(ns(0.35)) / SR / 0.06)))


def flap_step(r):
    n = ns(0.07)
    return norm(bp(r.standard_normal(n), 300, 1800, 1) * np.exp(-np.arange(n) / SR / 0.015))


def ice_step(r):
    n = ns(0.12)
    t = np.arange(n) / SR
    return norm(bp(r.standard_normal(n), 1200, 5000, 1) * np.exp(-t / 0.03) + 0.4 * np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.02))


def M(*parts):
    """sum sounds of different lengths (mono)"""
    parts = [mono(x) for x in parts]
    out = np.zeros(max(len(x) for x in parts))
    for x in parts:
        out[:len(x)] += x
    return out


def mono(x):
    return x.mean(axis=0) if x.ndim == 2 else x


# ---------------- events: (time, sound, gain dB, pan, label) ----------------
EV = []


def ev(t, x, db=0.0, p=0.0, label=""):
    EV.append((t, mono(x), db, p, label))


def cough(r):
    out = np.zeros(ns(0.55))
    for t0, g in [(0.0, 1.0), (0.22, 0.75)]:
        n = ns(0.16); t = np.arange(n) / SR
        x = bp(r.standard_normal(n), 300, 2600, 1) * np.exp(-t / 0.05) * g + 0.4 * np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.04) * g
        i = ns(t0); out[i:i + n] += x
    return norm(out)


def bell(r, f=196.0, dur=3.0):
    n = ns(dur); t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / (dur * d)) for m, a, d in [(0.5, 0.6, 0.6), (1, 1.0, 0.45), (1.19, 0.5, 0.3), (1.5, 0.35, 0.25), (2.0, 0.4, 0.2), (2.6, 0.2, 0.12)])
    return norm(y * np.clip(t / 0.004, 0, 1))


def boom(r, dur=1.8):
    n = ns(dur); t = np.arange(n) / SR
    y = lp(r.standard_normal(n), 220) * np.exp(-t / 0.5) * 2 + np.sin(2 * np.pi * 42 * t * (1 - 0.3 * t)) * np.exp(-t / 0.35) * 1.5
    y += bp(r.standard_normal(n), 800, 4000, 1) * np.exp(-t / 0.06)
    return norm(y)


def incoming(r, dur=0.7):
    n = ns(dur); t = np.arange(n) / SR
    f = 1400 - 700 * (t / dur)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.2, 0, 1) * (1 - t / dur) ** 0.3 + 0.1 * hp(r.standard_normal(n), 3000) * t / dur)


def match_strike(r):
    n = ns(0.5); t = np.arange(n) / SR
    y = bp(r.standard_normal(n), 2000, 8000, 1) * np.exp(-t / 0.05) + 0.4 * lp(r.standard_normal(n), 900) * np.clip((t - 0.05) / 0.05, 0, 1) * np.exp(-t / 0.3)
    return norm(y)


def gunshot(r):
    n = ns(0.6); t = np.arange(n) / SR
    y = bp(r.standard_normal(n), 300, 6000, 1) * np.exp(-t / 0.03) * 2 + lp(r.standard_normal(n), 400) * np.exp(-t / 0.15)
    return norm(y)


def wings(r, dur=0.8, rate=9.0):
    n = ns(dur); t = np.arange(n) / SR
    env = (0.5 + 0.5 * np.sin(2 * np.pi * rate * t)) ** 3 * np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / 0.1, 0, 1)
    return norm(bp(r.standard_normal(n), 400, 2500, 1) * env)


def coo(r, f0=380.0):
    n = ns(0.55); t = np.arange(n) / SR
    f = f0 * (1 + 0.08 * np.sin(np.pi * t / 0.55)) * (1 - 0.15 * t)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    env = np.clip(t / 0.04, 0, 1) * np.exp(-t / 0.25) * (1 + 0.5 * np.sin(2 * np.pi * 14 * t))
    return norm(lp(y * env, 1800))


def thump_fall(r):
    return M(thud(r, 110, 0.3, 0.8), 0.5 * crunch(r, 0.2, 40))


def build_events():
    r = R
    ev(0.0, coo(r, 360), -10, 0.2, "hook coo")
    ev(0.4, G.breeze(5.0, r, 0.8), -20, 0, "wind at the loft")
    ev(3.0, G.babble(2.0, r, 150, 1.0), -18, 0, "soldiers murmur")
    ev(5.12, slide(r, 300, 250, 0.25), -12, 0, "maybe")
    ev(5.7, G.whoosh(0.4, r, peak=0.8), -8, 0, "flash")
    ev(5.8, G.breeze(9.0, r, 1.1, gust=0.25, bright=700), -16, 0, "forest wind")
    for k in range(4):
        ev(8.0 + 2.2 * k, boom(r, 1.4), -22, 0.6 * (-1) ** k, "distant guns" if k == 0 else "")
    ev(12.3, G.clink(r, 900, 0.1), -14, 0.2, "dead field phone click")
    ev(14.6, thud(r, 50, 0.6, 0.2), -10, 0, "worse")
    for t0, p in [(15.7, -0.4), (16.5, 0.3), (16.95, -0.2), (17.4, 0.4)]:
        ev(t0 - 0.55, incoming(r, 0.55), -16, p, "")
        ev(t0, boom(r), -10, p, "SHELLS" if t0 == 16.5 else ("our gun fires" if t0 == 15.7 else ""))
    ev(16.6, G.oof(r, "oh", 140), -14, 0.2, "soldiers yelp")
    ev(18.94, M(coo(r, 400), coo(r, 340)), -8, 0, "basket of pigeons")
    ev(19.9, wings(r, 1.4), -6, 0, "first pigeon takes off")
    ev(21.48, gunshot(r), -6, 0.2, "BANG")
    ev(21.62, M(thud(r, 160, 0.15, 0.5)), -14, 0, "hit")
    ev(22.35, wings(r, 0.9), -6, -0.1, "second pigeon")
    ev(23.15, gunshot(r), -6, -0.2, "BANG")
    ev(23.25, G.whoosh(0.2, r), -12, 0, "")
    ev(25.16, coo(r, 420), -10, 0, "last pigeon coos")
    ev(26.4, I.glock(1568, 0.6, r, 1.4), -10, 0, "name sparkle")
    ev(27.9, crunch(r, 0.4, 30), -14, 0, "note folded")
    ev(28.3, G.clink(r, 2600, 0.08), -12, 0, "canister snap")
    ev(30.0, wings(r, 1.3), -6, 0, "Cher Ami takes off")
    ev(30.14, gunshot(r), -4, 0.3, "BANG (hit)")
    ev(30.3, G.oof(r, "ow", 300, 1.6), -14, 0, "")
    ev(31.0, G.whoosh(0.8, r, peak=0.9, f_lo=200, f_hi=900), -10, 0, "falling")
    ev(31.95, thump_fall(r), -6, 0, "hits the ground")
    ev(33.2, wings(r, 2.0, 11), -6, 0, "gets up, flies on")
    ev(34.78, slide(r, 330, 200, 0.25), -8, 0, "WAIT")
    ev(35.3, wings(r, 1.8), -12, 0, "")
    ev(39.4, coo(r, 380), -12, 0.3, "loft coos")
    ev(39.97, I.musicbox(784, 0.5, r, 1.6), -14, 0, "")
    ev(41.0, M(thud(r, 90, 0.3, 0.3)), -14, 0, "flops into bed")
    for k in range(5):
        ev(41.7 + k * 0.38, gunshot(r), -14, (-1) ** k * 0.5, "bullets" if k == 0 else "")
    ev(41.65, wings(r, 2.1, 10), -8, 0, "")
    ev(44.6, wings(r, 0.8), -8, 0, "landing")
    ev(45.31, M(thud(r, 140, 0.2, 0.6)), -6, 0, "lands")
    ev(45.4, G.whoa(r, 150), -10, 0.2, "handler gasps")
    ev(48.89, M(boom(r, 2.0)), -20, 0, "last distant gun, then silence")
    ev(49.9, M(G.hurrah(r, 140, 1.0), G.hurrah(r, 170, 1.05)), -8, 0, "194 men cheer")
    ev(50.2, G.applause(1.8, r, 20), -14, 0, "")
    ev(53.23, M(G.clink(r, 2200), I.glock(2093, 0.7, r, 1.6)), -6, 0, "medal pinned")
    ev(54.85, M(thud(r, 180, 0.15, 0.7)), -8, 0, "wooden leg clonk")
    ev(55.0, coo(r, 440), -10, 0, "smug coo")
    ev(56.85, M(thud(r, 80, 0.4, 0.8)), -6, 0, "fist on desk")
    ev(57.0, M(G.babble(1.5, r, 120, 1.0), G.babble(1.5, r, 150, 1.05)), -14, 0, "arguing")
    ev(58.46, I.glock(2637, 0.5, r, 1.2), -14, 0, "lab ding")
    ev(60.48, M(I.glock(1568, 0.5, r, 1.2), I.glock(2093, 0.5, r, 1.2)), -10, 0, "DNA reveal")
    ev(63.1, slide(r, 520, 700, 0.3), -12, 0, "girl")
    ev(63.97, M(thud(r, 70, 0.4, 0.4), G.clink(r, 1800)), -6, 0, "BOY")
    ev(64.1, coo(r, 330), -8, 0, "final coo")


# ---------------- music ----------------
NOTE = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def midi(n):
    return 12 * (int(n[-1]) + 1) + NOTE[n[:-1]]


# "Silent Night" (Gruber 1818, public domain), C major, 3/4: (note, beats)
SILENT = [("G4", 1.5), ("A4", .5), ("G4", 1), ("E4", 3), ("G4", 1.5), ("A4", .5), ("G4", 1), ("E4", 3),
          ("D5", 2), ("D5", 1), ("B4", 3), ("C5", 2), ("C5", 1), ("G4", 3),
          ("A4", 2), ("A4", 1), ("C5", 1.5), ("B4", .5), ("A4", 1), ("G4", 1.5), ("A4", .5), ("G4", 1), ("E4", 3),
          ("A4", 2), ("A4", 1), ("C5", 1.5), ("B4", .5), ("A4", 1), ("G4", 1.5), ("A4", .5), ("G4", 1), ("E4", 3),
          ("D5", 2), ("D5", 1), ("F5", 1.5), ("D5", .5), ("B4", 1), ("C5", 3), ("E5", 3),
          ("C5", 1.5), ("G4", .5), ("E4", 1), ("G4", 1.5), ("F4", .5), ("D4", 1), ("C4", 6)]
CHORD = {"C": [0, 4, 7], "G": [7, 11, 14], "F": [5, 9, 12], "Am": [9, 12, 16], "Dm": [2, 5, 9]}


def notes_from(melody, t0, beat, start=0, count=None, transpose=0):
    """(time, midi, dur) from melody index `start`, `count` notes, quarter = `beat` seconds"""
    out, t = [], t0
    for name, b in melody[start:start + count if count else None]:
        out.append((t, midi(name) + transpose, b * beat))
        t += b * beat
    return out


def hum(seq, r, vowel="o", scale=1.0, voices=3, detune=0.012, octave=-12):
    """a small choir humming the melody: per-sample f0 with soft glides, vox() formant voices, slightly detuned"""
    t_end = seq[-1][0] + seq[-1][2]
    t0 = seq[0][0]
    n = ns(t_end - t0 + 0.4)
    tt_ = np.arange(n) / SR
    f = np.zeros(n); a = np.zeros(n)
    for (ts, m, d) in seq:
        i0, i1 = ns(ts - t0), ns(ts - t0 + d)
        f[i0:i1] = 440 * 2 ** ((m + octave - 69) / 12)
        env = np.clip((tt_[i0:i1] - tt_[i0]) / 0.08, 0, 1) * np.clip((tt_[i1 - 1] - tt_[i0:i1]) / 0.12 + 0.25, 0, 1)
        a[i0:i1] = env
    f[f == 0] = f[f > 0][0] if (f > 0).any() else 200
    f = ndimage.uniform_filter1d(f, ns(0.05))  # portamento between notes
    forms = G.vowel_track(n, [(0, vowel), (t_end - t0, vowel)])
    out = np.zeros(n)
    for v in range(voices):
        out += G.vox(f * (1 + detune * (v - 1)), forms, a, r, scale * (1 + 0.04 * (v - 1)), tilt=1.3, breath=0.08)
    return norm(lp(out, 3500)), t0


def music():
    r = rng(1918)
    L = np.zeros((2, N))

    def add(x, t, db=0.0, p=0.0):
        if t >= DUR:
            return
        place(L, (x if x.ndim == 2 else pan(x, p)) * dbg(db), t)

    S = []
    beat = 0.47
    # 1) hook: a jaunty fife over a snare (heroic but a bit silly), D major
    for k in range(int(5.1 / beat)):
        tk = 0.1 + k * beat
        add(I.snare(0.35 if k % 2 else 0.5, r, 0.18), tk, -16, 0.1)
        add(I.pluck(I.m2f([50, 57, 50, 57][k % 4]), 0.6, r, 0.4, 0.4), tk, -8, -0.1)
        add(I.fife(I.m2f([74, 76, 78, 81, 78, 76, 74, 69][k % 8]), beat * 0.8, 0.5, r), tk, -10, 0.2)
    S.append((0.1, 5.1, "hook: fife + snare march, D major"))
    # 2) the forest: low drone + slow timpani heartbeat, tighter when the shells come
    add(I.pad([I.m2f(m) for m in (38, 45, 50)], 9.5, 0.45, r, att=1.0, rel=1.0), 5.8, -10)
    for k in range(6): add(I.timpani(I.m2f(38), 0.4, r, 1.3), 6.0 + k * 1.5, -12)
    for k in range(int((18.9 - 15.2) / 0.235)): add(I.snare(0.3 + 0.03 * k, r, 0.15), 15.2 + k * 0.235, -14, 0.1)
    S.append((5.8, 18.9, "forest drone + timpani heartbeat; snare roll under the shelling"))
    # 3) the pigeons: tense pizzicato, a hit on each shot-down
    for k in range(int((25.6 - 19.0) / beat)):
        tk = 19.0 + k * beat
        add(I.pluck(I.m2f([62, 65, 69, 65][k % 4]), 0.5, r, 0.3, 0.8), tk, -9, 0.2)
    for t0 in (21.6, 23.25): add(I.timpani(I.m2f(33), 0.8, r, 1.6), t0, -6)
    S.append((19.0, 25.6, "tense pizzicato; timpani hits on each pigeon shot down"))
    # 4) Cher Ami: the heroic fife march returns, bigger, through the flight (stops for "Wait.")
    for k in range(int((34.7 - 25.7) / beat)):
        tk = 25.7 + k * beat
        add(I.snare(0.5 if k % 2 == 0 else 0.3, r, 0.18), tk, -12, 0.1)
        if k % 2 == 0: add(I.timpani(I.m2f(38 if k % 4 == 0 else 45), 0.5, r, 0.8), tk, -12)
        add(I.fife(I.m2f([74, 78, 81, 86, 85, 81, 78, 76][k % 8]), beat * 0.85, 0.55, r), tk, -9, 0.2)
        add(I.brass(I.m2f([50, 57][k % 2]), beat * 0.9, 0.5, r), tk, -12, -0.2)
    S.append((25.7, 34.7, "heroic fife march with brass + timpani"))
    # 5) "You see": a music-box lullaby (the bed in the dark), then the march again for the bullets/landing
    for k in range(int((41.6 - 37.3) / 0.36)): add(I.musicbox(I.m2f([79, 74, 71, 74, 79, 83, 81, 78][k % 8]), 0.45, r, 1.4), 37.3 + k * 0.36, -8, 0)
    for k in range(int((48.6 - 41.65) / beat)):
        tk = 41.65 + k * beat
        add(I.snare(0.45, r, 0.16), tk, -14, 0.1)
        add(I.fife(I.m2f([74, 76, 78, 81][k % 4] + (5 if tk > 45.3 else 0)), beat * 0.8, 0.5, r), tk, -10, 0.2)
    S.append((37.3, 48.6, "music box lullaby (homing / bed), then the march again to the landing"))
    # 6) rescue + medal: a brass fanfare
    for k, m in enumerate([62, 66, 69, 74, 69, 74, 78]):
        add(I.brass(I.m2f(m), 0.5, 0.7, r), 49.9 + k * 0.42, -17, 0)
    add(I.cymbal(0.5, r, 2.0), 53.23, -18)
    for k, m in enumerate([74, 78, 81, 86]): add(I.brass(I.m2f(m), 0.4, 0.7, r), 52.2 + k * 0.3, -18)
    S.append((49.9, 55.2, "brass fanfare for the rescue and the medal"))
    # 7) historians + lab: quirky staccato pizzicato, ends on a button
    for k in range(int((63.9 - 55.4) / 0.3)):
        tk = 55.4 + k * 0.3
        add(I.pluck(I.m2f([55, 62, 59, 62, 57, 64, 60, 64][k % 8]), 0.5, r, 0.25, 0.9), tk, -9, 0.15)
    add(I.brass(I.m2f(50), 0.6, 0.8, r), 63.97, -6)
    add(I.timpani(I.m2f(38), 0.9, r, 1.2), 63.97, -6)
    S.append((55.4, 64.6, "quirky pizzicato for the historians and the lab; button on 'boy'"))
    env = np.ones(N)
    for a, b2 in [(34.7, 35.25), (48.8, 49.85)]:  # hard stops: "Wait." and "The guns stop."
        env[ns(a):ns(b2)] = 0
    env = ndimage.uniform_filter1d(env, ns(0.03))
    return L * env, [(a, b2, "", 0, lab) for a, b2, lab in S]


# ---------------- mix ----------------
def speech_env():
    """1 while the voice speaks (from word timings), smoothed: the music ducks under it"""
    e = np.zeros(N)
    for w in WORDS:
        e[ns(max(0, w["start"] - 0.06)):ns(min(DUR, w["end"] + 0.1))] = 1
    e = ndimage.maximum_filter1d(e, ns(0.25))
    return ndimage.uniform_filter1d(e, ns(0.12))


def main():
    build_events()
    v, sr = read_wav(os.path.join(VID, "voice.wav"))
    assert sr == SR, sr
    v = v if v.ndim == 2 else st(v)
    v = v[:, :N] if v.shape[1] >= N else np.pad(v, ((0, 0), (0, N - v.shape[1])))
    sfx = np.zeros((2, N))
    rows = []
    for t, x, db, p, label in EV:
        place(sfx, pan(norm(x, 0.5) * dbg(db), p), t)
        if label:
            rows.append((t, label, db))
    m, S = music()
    # room/air on music and sfx so they sit in one space
    ir = make_ir(1.1, 5)
    sfx = sfx + 0.12 * convolve_st(sfx, ir)[:, :N]
    m = m + 0.18 * convolve_st(m, ir)[:, :N]
    # levels: voice untouched; music sits ~16 LU under the voice and dips a further 5 dB while words are spoken;
    # SFX ~8 LU under the voice
    Lv = integrated(v)
    m *= dbg(Lv - 10 - integrated(m))
    sfx *= dbg(Lv - 6 - integrated(sfx))
    duck = dbg(-4 * speech_env())
    m = m * duck
    mix = v + m + sfx
    g = dbg(-14 - integrated(mix))
    mix *= g
    tp = true_peak(mix)
    if tp > -1.0:  # soft-knee peak control: scale peaks only above the ceiling
        ceil = dbg(-1.2)
        a = np.abs(mix)
        mix = np.where(a > ceil, np.sign(mix) * (ceil + (1 - ceil) * np.tanh((a - ceil) / (1 - ceil))), mix) * dbg(-1.3)
    write_wav(os.path.join(VID, "mix.wav"), mix)
    write_wav(os.path.join(VID, "stem_voice.wav"), v * g)
    write_wav(os.path.join(VID, "stem_music.wav"), m * g)
    write_wav(os.path.join(VID, "stem_sfx.wav"), sfx * g)
    with open(os.path.join(VID, "cues.md"), "w") as f:
        f.write(f"# Cher Ami sound cues\n\nMix: {integrated(mix):.1f} LUFS integrated, true peak {true_peak(mix):.1f} dBTP, {DUR} s, 48 kHz.\n\n")
        f.write("## Music\n\n" + "\n".join(f"- {a:5.2f}-{b:5.2f} s: {lab}" for a, b, _s, _p, lab in S) + "\n- hard stops: 'Wait.' 34.70, 'The guns stop.' 48.80\n\n")
        f.write("## SFX\n\n" + "\n".join(f"- {t:5.2f} s  {lab}  ({db:+.0f} dB)" for t, lab, db in sorted(rows)) + "\n")
    print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP, {len(EV)} events, music sections {len(S)}")


if __name__ == "__main__":
    main()
