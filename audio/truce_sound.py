"""Sound for "The Christmas Truce": synthesized SFX on every action, a score built on "Silent Night" (Gruber, 1818,
public domain) with a hummed German choir answered by a British one, a warm waltz for the truce, drums for the guns,
music ducked under the voice (keyed from words.json), mastered to -14 LUFS / -1 dBTP.
usage: python audio/truce_sound.py  ->  videos/christmas_truce/audio/{mix.wav, stem_*.wav, cues.md}"""
import json
import os
import numpy as np
from scipy import ndimage
import sfx_gen as G
import instruments as I
from dsp import SR, ns, rng, lp, hp, bp, resbank, fades, st, pan, place, dbg, read_wav, write_wav, integrated, true_peak, make_ir, convolve_st

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(os.path.dirname(HERE), "videos", "christmas_truce", "audio")
DUR = 62.62
N = ns(DUR)
R = rng(1914)
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


def build_events():
    r = R
    # Christmas Eve hook: night wind, a distant bell, the German voice starts (music), a whoosh into the flash
    ev(0.0, G.breeze(4.0, r, 1.0, gust=0.25, bright=700), -16, 0, "night wind")
    ev(0.4, bell(r, 147, 3.2), -20, -0.4, "distant church bell")
    ev(3.85, G.whoosh(0.35, r, peak=0.8), -8, 0, "flash")
    # December: mud, cold, the cough
    ev(4.0, G.breeze(9.7, r, 1.2, gust=0.3, bright=1000), -14, 0, "winter wind")
    for k in range(4):
        ev(5.8 + k * 0.42, M(lp(r.standard_normal(ns(0.12)), 600) * np.exp(-np.arange(ns(0.12)) / SR / 0.04)), -18, -0.2, "boots in mud" if k == 0 else "")
    ev(6.4, G.clink(r, 900, 0.1), -16, 0.2, "tin mug")
    ev(9.48, cough(r), -6, 0.3, "German coughs")
    # the Pope and the generals
    ev(10.04, bell(r, 220, 3.0), -10, 0, "church bell")
    ev(12.6, G.whoosh(0.2, r), -12, 0, "")
    ev(13.32, M(thud(r, 70, 0.4, 0.4), 0.6 * thud(r, 90, 0.3, 0.3)), -6, 0, "generals: NO")
    # that night: lights, candles chime on one by one
    ev(13.76, G.breeze(9.9, r, 0.8, gust=0.15, bright=600), -18, 0, "night wind")
    for k, x in enumerate(sorted([-24, -16, -9, -3.5, 2.5, 8, 14, 21, 28], key=abs)):
        ev(15.19 + 0.12 * abs(x) / 3.5, I.glock(1568 * 2 ** ((k % 5) * 2 / 12), 0.35, r, 1.0), -27, x / 40, "candles light up" if k == 0 else "")
    # morning: climbing out, the wave, nobody shoots
    ev(23.63, G.breeze(5.0, r, 0.9, gust=0.2, bright=900), -18, 0, "morning wind")
    ev(24.9, crunch(r, 0.6, 30), -10, 0, "climbs over sandbags")
    ev(25.6, M(lp(r.standard_normal(ns(0.12)), 600) * np.exp(-np.arange(ns(0.12)) / SR / 0.04)), -12, 0, "boot on frozen ground")
    ev(27.0, G.whoosh(0.25, r, f_lo=300, f_hi=1200), -14, 0, "wave")
    # the truce: crowd, handshake, swaps, burial, football
    ev(28.55, M(G.babble(3.0, r, 150, 1.0), G.babble(3.0, r, 120, 1.05), 0.6 * G.babble(3.0, r, 175, 0.95)), -12, 0, "crowd in no man's land")
    ev(29.6, G.hurrah(r, 140, 1.0), -18, 0.3, "laughter")
    ev(31.57, M(thud(r, 160, 0.12, 0.6), G.clink(r, 700, 0.05)), -8, 0, "handshake")
    ev(33.2, match_strike(r), -8, 0.1, "match strike")
    ev(33.88, crunch(r, 0.35, 50), -10, -0.1, "chocolate wrapper")
    ev(34.8, G.clink(r, 2400, 0.1), -8, 0, "button snip")
    ev(35.0, G.clink(r, 2700, 0.1), -10, 0.1, "")
    ev(36.36, crunch(r, 0.5, 20), -12, 0.2, "shovel in frozen earth")
    ev(37.3, crunch(r, 0.5, 20), -14, 0.2, "")
    for k in range(5):
        ev(38.52 + k * 0.55, M(thud(r, 120, 0.15, 0.5)), -8, 0.2 * (1 if k % 2 else -1), "football kicks" if k == 0 else "")
    ev(38.6, G.applause(2.2, r, 14), -16, 0, "cheering")
    ev(39.0, G.hurrah(r, 150, 1.0), -14, 0.2, "")
    # the question and the answer
    ev(40.76, slide(r, 330, 200, 0.25), -8, 0, "WAIT stop")
    ev(41.3, G.breeze(2.0, r, 0.8), -18, 0, "")
    ev(45.7, G.breeze(1.0, r, 1.6, gust=0.5, bright=1400), -10, 0, "cold gust")
    for k in range(3):
        ev(46.34 + k * 0.22, M(thud(r, 55, 0.18, 0.1)), -10, 0, "heartbeat" if k == 0 else "")
    ev(46.98, I.musicbox(659, 0.6, r, 1.6), -12, 0, "homesick note")
    # the generals: fist on the table, the stamp
    ev(52.92, M(thud(r, 80, 0.5, 0.9), G.clink(r, 1300, 0.08)), -4, 0, "fist on table")
    ev(52.96, G.oof(r, "ugh", 110), -12, 0, "")
    ev(53.62, G.whoosh(0.12, r), -12, 0, "")
    ev(53.72, M(thud(r, 95, 0.35, 0.9)), -3, 0, "STAMP")
    # the guns
    for t0, p in [(55.82, -0.3), (56.2, 0.4), (56.45, -0.1)]:
        ev(t0 - 0.62, incoming(r), -14, p, "shell incoming" if p < 0 else "")
        ev(t0, boom(r), -10, p, "explosion")
    ev(54.81, G.breeze(3.0, r, 1.0), -16, 0, "")
    # ending: wind, a last bell
    ev(56.63, G.breeze(6.0, r, 0.8, gust=0.15, bright=600), -18, 0, "wind over the field")
    ev(58.48, bell(r, 147, 4.0), -16, 0, "far bell")


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
    r = rng(1818)
    L = np.zeros((2, N))

    def add(x, t, db=0.0, p=0.0):
        if t >= DUR:
            return
        place(L, (x if x.ndim == 2 else pan(x, p)) * dbg(db), t)

    S = []
    # 1) hook (Christmas Eve): music box, first phrase
    for ts, m, d in notes_from(SILENT, 0.15, 0.62, 0, 8):
        if ts < 3.9: add(I.musicbox(I.m2f(m + 12), 0.5, r, 1.6), ts, -6, 0.15)
    S.append((0.15, 3.9, "hook: music box 'Silent Night'"))
    # 2) December / Pope / generals: low cold drone + slow heartbeat timpani
    add(I.pad([I.m2f(m) for m in (38, 45, 50)], 9.6, 0.45, r, att=1.0, rel=1.2), 4.0, -10)
    for k in range(5): add(I.timpani(I.m2f(38), 0.35, r, 1.4), 4.2 + k * 1.9, -14)
    add(I.timpani(I.m2f(31), 0.8, r, 2.0), 13.32, -6)
    S.append((4.0, 13.7, "cold drone + timpani heartbeat; hit on 'no'"))
    # 3) that night: music box from the top, then the German choir hums, then the British answer
    for ts, m, d in notes_from(SILENT, 13.9, 0.7, 0, 13):
        if ts < 18.8: add(I.musicbox(I.m2f(m + 12), 0.45, r, 1.8), ts, -8, -0.1)
    ger = notes_from(SILENT, 18.9, 0.62, 0, 8)
    x, t0 = hum(ger, r, "o", 1.0, 3); add(x, t0, -4, 0.35)
    for ts, m, d in ger: add(I.pad([I.m2f(m - 12), I.m2f(m - 5)], d + 0.3, 0.3, r, att=0.2, rel=0.4), ts, -16, 0.3)
    brit = notes_from(SILENT, 22.13, 0.62, 8, 6)
    x, t0 = hum(brit, r, "a", 0.94, 3); add(x, t0, -4, -0.35)
    S.append((13.9, 26.0, "music box 'Silent Night'; German choir hums 18.9; British choir answers 22.1"))
    # 4) the truce: a warm 3/4 waltz (pluck bass + chords + fife tune), livelier for the football
    beat = 0.5
    prog = ["C", "C", "F", "C", "G", "G", "C", "C", "Am", "F", "C", "G", "C", "F", "G", "C", "C", "F", "G", "C"]
    t, b = 26.4, 0
    while t < 40.65:
        ch = CHORD[prog[b % len(prog)]]
        add(I.pluck(I.m2f(48 + ch[0] - 12), 0.7, r, 0.6, 0.35), t, -4, -0.1)
        for k in (1, 2):
            if t + k * beat < 40.65:
                for j, i2 in enumerate(ch): add(I.pluck(I.m2f(60 + i2), 0.35, r, 0.3, 0.6), t + k * beat + 0.004 * j, -12, 0.2)
        # fife: a gentle tune on chord tones
        if t > 28.5:
            mel = [ch[2] + 12, ch[1] + 12, ch[0] + 12][b % 3]
            add(I.fife(I.m2f(60 + mel), beat * 1.6, 0.4, r), t, -12, 0.15)
        t += 3 * beat; b += 1
    S.append((26.4, 40.65, "warm folk waltz (pluck + fife)"))
    # 5) "How does a song stop a war?": music box again, then both choirs hum together on "same carol"
    for ts, m, d in notes_from(SILENT, 41.3, 0.62, 8, 14):
        if ts < 47.6: add(I.musicbox(I.m2f(m + 12), 0.4, r, 1.6), ts, -9, 0)
    both = notes_from(SILENT, 47.8, 0.6, 22, 7)
    x, t0 = hum(both, r, "o", 1.0, 2); add(x, t0, -6, 0.35)
    x, t0 = hum(both, r, "a", 0.94, 2, octave=-24); add(x, t0, -7, -0.35)
    S.append((41.3, 52.2, "music box, then both choirs hum 'Silent Night' together 47.8"))
    # 6) the generals and the guns: snare + timpani march, cut by the explosions
    for k in range(int((55.7 - 52.33) / 0.25)):
        tk = 52.33 + k * 0.25
        add(I.snare(0.5 if k % 4 == 0 else 0.3, r, 0.2), tk, -12, 0.1)
        if k % 4 == 0: add(I.timpani(I.m2f(36), 0.6, r, 1.2), tk, -8)
    S.append((52.33, 55.7, "snare + timpani march for the generals"))
    # 7) ending: a slow music box, last phrase of 'Silent Night' ("sleep in heavenly peace"), ends on the last word
    end = notes_from(SILENT, 57.0, 0.5, 33, 13)
    for ts, m, d in end:
        if ts < 62.3: add(I.musicbox(I.m2f(m + 12), 0.5, r, 2.2), ts, -6, 0)
    add(I.pad([I.m2f(m) for m in (48, 55, 64)], 5.0, 0.35, r, att=1.5, rel=1.5), 57.4, -14)
    S.append((57.0, 62.3, "music box: 'sleep in heavenly peace'"))
    # hard stops so the beats land: 'Wait.', the explosions
    env = np.ones(N)
    for a, b2 in [(40.7, 41.25), (55.75, 56.9)]:
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
        f.write(f"# Christmas Truce sound cues\n\nMix: {integrated(mix):.1f} LUFS integrated, true peak {true_peak(mix):.1f} dBTP, {DUR} s, 48 kHz.\n\n")
        f.write("## Music\n\n" + "\n".join(f"- {a:5.2f}-{b:5.2f} s: {lab}" for a, b, _s, _p, lab in S) + "\n- hard stops: 'Wait.' 40.70, the explosions 55.75\n\n")
        f.write("## SFX\n\n" + "\n".join(f"- {t:5.2f} s  {lab}  ({db:+.0f} dB)" for t, lab, db in sorted(rows)) + "\n")
    print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP, {len(EV)} events, music sections {len(S)}")


if __name__ == "__main__":
    main()
