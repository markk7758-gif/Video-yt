"""Sound for "The Goose King": synthesized SFX on every action, an original medieval-jig score that changes with the
story, ambience per place, music ducked under the voice (keyed from words.json), mastered to -14 LUFS / -1 dBTP.
usage: python audio/goose_sound.py  ->  videos/goose_king/audio/{mix.wav, stem_*.wav, cues.md}"""
import json
import os
import numpy as np
from scipy import ndimage
import sfx_gen as G
import instruments as I
from dsp import SR, ns, rng, lp, hp, bp, resbank, fades, st, pan, place, dbg, read_wav, write_wav, integrated, true_peak, make_ir, convolve_st

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(os.path.dirname(HERE), "videos", "goose_king", "audio")
DUR = 62.4
N = ns(DUR)
R = rng(2026)
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


def build_events():
    r = R
    # hook: crown plonk on the goose, flash whoosh
    ev(2.6, G.whoosh(0.35, r), -10, 0, "crown falls")
    ev(2.64, M(I.glock(1760, 0.8, r, 1.2), 0.6 * G.clink(r, 2600)), -4, 0, "crown lands")
    ev(2.66, honk(r, 0.22, 360), -8, 0.1, "little honk")
    ev(3.22, G.whoosh(0.4, r, peak=0.8), -6, 0, "flash")
    # party: crowd, waddle, bite
    ev(3.3, M(G.babble(2.3, r, 180, 1.0), 0.5 * G.babble(2.3, r, 140, 1.05)), -16, -0.3, "party chatter")
    ev(4.63, G.hurrah(r, 175, 1.0), -12, 0.2, "guests cheer")
    ev(4.63, G.applause(1.0, r, 10), -16, 0, "clapping")
    for k in range(10):
        ev(4.1 + k * 0.19, flap_step(r), -16, 0.4, "goose waddle" if k == 0 else "")
    ev(5.62, G.whoosh(0.15, r), -12, 0, "")
    ev(5.66, M(G.wood_crack(r)[:ns(0.12)], thud(r, 140, 0.2, 0.8)), -3, 0, "CHOMP bite")
    ev(5.67, honk(r, 0.28, 300), -6, -0.2, "goose honk")
    ev(5.72, G.oof(r, "ow", 160, 1.1), -4, 0, "king yelps")
    ev(5.74, pop_up(r, 0.5, 220, 1100), -8, 0, "boing up")
    ev(6.55, G.whoosh(0.4, r), -10, 0, "")
    for k in range(3):
        ev(6.6 + k * 0.15, I.glock(2093 * 2 ** (k * 4 / 12), 0.5, r, 0.6), -14, 0.2, "stars twinkle" if k == 0 else "")
    ev(7.11, G.oof(r, "ugh", 130), -10, 0, "rubs bottom")
    for k in range(6):
        ev(7.3 + k * 0.2, flap_step(r), -20, -0.4, "")
    ev(8.44, I.timpani(73.4, 0.9, r), -4, 0, "timpani: never")
    ev(8.78, M(I.timpani(55, 1.0, r), 0.5 * I.cymbal(0.5, r)), -3, 0, "timpani: again")
    # walls pop, moats fill, eels
    for t0, big in [(10.23, 1.0), (11.58, 1.3)]:
        ev(t0 - 0.12, G.whoosh(0.2, r), -10, 0, "")
        ev(t0, thud(r, 48, 1.0, 0.6), -1 + 2 * (big - 1), 0, "wall pops up")
        ev(t0 + 0.02, G.timber_tear(r, 0.4), -12, 0.2, "stone rumble")
        ev(t0 + 0.05, pop_up(r, 0.2, 400, 1200), -14, 0, "")
    for t0 in (13.22, 14.07):
        ev(t0 - 0.1, G.splash_big(r), -6, 0.2, "moat floods")
        ev(t0, G.water_bed(1.4, r, 1.0, 2.0), -10, -0.2, "")
    for k, p in enumerate([-0.3, 0.0, 0.3]):
        ev(15.9 + k * 0.08, pop_up(r, 0.16, 300 + 80 * k, 800 + 100 * k), -8, p, "eels pop" if k == 0 else "")
        ev(15.9 + k * 0.08, G.bubbles(0.4, r, 25), -14, p, "")
    ev(16.5, G.bird_chirps(1.4, r, 0.6), -22, 0.5, "")
    ev(18.04, G.water_bed(0.8, r, 1.0, 1.2), -12, 0, "goose paddles")
    ev(18.27, honk(r, 0.18, 380), -14, 0, "smug honk")
    for k, p in enumerate([0.2, 0.4]):
        ev(18.3 + 0.05 * k, G.whoa(r, 200 + 30 * k), -14, p, "eels gasp" if k == 0 else "")
    # drawbridge, melting chains
    ev(19.18, G.rattle(0.55, r, 40, heavy=True), -6, 0, "chains rattle")
    ev(19.18, G.creak(0.55, r, 90, 150, G.TIMBER), -10, 0, "bridge creaks up")
    ev(19.73, M(thud(r, 60, 1.0, 0.8), 0.5 * G.wood_crack(r)), -2, 0, "SLAM bridge shut")
    ev(20.5, G.rattle(0.25, r, 30), -10, 0.2, "chains drop")
    ev(20.58, sizzle(r, 1.3), -6, 0.2, "chains sizzle")
    ev(20.6, G.clink(r, 1800), -10, 0.2, "")
    ev(21.9, G.whoosh(0.6, r), -10, 0, "")
    # celebration, the food problem
    ev(23.8, M(G.hurrah(r, 140, 1.0), G.hurrah(r, 170, 1.05)), -8, 0, "king + guards cheer")
    ev(25.71, slide(r, 233, 175, 0.35) , -8, 0, "wah")
    ev(26.1, slide(r, 220, 165, 0.35), -8, 0, "wah")
    ev(26.5, slide(r, 208, 139, 0.9), -8, 0, "wah-waaah")
    ev(27.19, G.creak(0.6, r, 130, 160, G.WOOD), -14, 0.3, "cart creaks")
    # lunchbox
    ev(29.7, G.whoosh(0.7, r, peak=0.7, f_lo=150, f_hi=900), -6, 0, "lunchbox rises")
    ev(30.24, thud(r, 70, 0.6, 0.3), -8, 0, "")
    ev(30.32, G.whoosh(0.35, r), -10, 0, "lid swings")
    ev(30.62, M(thud(r, 45, 1.2, 0.9), 0.4 * I.cymbal(0.6, r)), -1, 0, "LID SLAMS")
    ev(31.3, G.creak(0.6, r, 120, 200, G.WOOD), -12, 0, "lid opens")
    ev(32.1, G.whoosh(0.7, r, peak=0.85), -8, 0, "sandwich falls")
    ev(32.74, M(thud(r, 65, 0.7, 0.5), splat(r)), -3, 0, "sandwich lands")
    # weeks
    ev(33.6, crunch(r, 0.4), -10, 0, "bread crunch")
    ev(34.2, crunch(r, 0.3), -12, 0, "")
    ev(35.99, splat(r), -8, 0, "boot in soup")
    ev(36.25, G.oof(r, "ugh", 120), -12, 0, "")
    ev(37.1, G.bird_chirps(1.5, r, 0.4), -24, -0.5, "")
    ev(38.11, M(G.clink(r, 3000, 0.08), G.clink(r, 3300, 0.08)), -14, 0.3, "reel clicks")
    ev(38.46, G.bubbles(0.3, r, 20), -10, 0, "bobber plop")
    ev(40.05, G.bubbles(0.4, r, 30), -12, 0, "eel surfaces")
    ev(40.54, G.rattle(0.35, r, 60), -14, 0, "eel reels in")
    ev(40.86, G.whoosh(0.25, r, peak=0.8), -6, 0, "")
    ev(40.9, G.whoa(r, 140), -6, 0, "chef yanked")
    ev(41.05, G.splash_big(r), -10, 0, "")
    # week six: lookout
    ev(41.46, G.breeze(4.8, r, 1.0), -18, 0, "wind on the wall")
    ev(43.44, I.timpani(61.7, 0.5, r), -10, 0, "")
    ev(45.4, honk(r, 0.25, 340) * 0.6, -14, 0.1, "distant honk")
    ev(45.63, I.timpani(55, 0.9, r), -6, 0, "dun")
    # winter
    ev(46.49, shimmer(r, 1.4), -6, 0, "moats freeze")
    ev(46.8, G.creak(0.8, r, 300, 500, G.SMALLMETAL), -18, 0, "ice crackle")
    ev(46.26, G.breeze(7.2, r, 1.2, gust=0.3, bright=1400), -14, 0, "winter wind")
    for k in range(9):
        ev(48.4 + k * 0.21, ice_step(r), -14, -0.2 + 0.05 * k, "goose on ice" if k == 0 else "")
    ev(49.1, squeak(r, 0.25, 1500, 1200), -16, 0, "slip")
    ev(50.85, squeak(r, 0.55, 700, 1300), -8, 0, "squeeze")
    ev(51.45, M(pop_up(r, 0.12, 500, 1500), 0.4 * G.clink(r, 1200)), -8, 0, "POP through slit")
    ev(52.0, flap_step(r) , -10, 0, "hop")
    ev(52.27, thud(r, 90, 0.4, 0.3), -8, 0, "plops on throne")
    ev(52.3, G.whoosh(0.3, r, f_lo=200, f_hi=800), -16, 0, "cushion puff")
    # ending
    ev(54.52, G.whoosh(1.0, r, peak=0.9, f_lo=200, f_hi=1500), -8, 0, "vertigo whoosh")
    ev(54.7, I.timpani(49, 0.7, r), -8, 0, "")
    ev(56.37, M(G.clink(r, 2200), I.glock(2637, 0.8, r, 1.4)), -4, 0, "crown placed")
    ev(56.37, I.cymbal(0.5, r, 2.0), -12, 0, "")
    ev(57.0, G.breeze(2.6, r, 1.0), -18, 0, "")
    ev(61.14, M(honk(r, 0.55, 300, 1.0), 0.6 * honk(r, 0.55, 302)), 0, 0, "HONK")
    ev(61.14, thud(r, 70, 0.5, 0.2), -10, 0, "")


# ---------------- music ----------------
BPM = 128
BEAT = 60 / BPM
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def chord_notes(name):
    minor = name.endswith("m")
    root = NOTE[name[:-1] if minor else name]
    return root, [0, 3 if minor else 4, 7]


def music():
    r = rng(77)
    L = np.zeros((2, N))

    def add(x, t, db=0.0, p=0.0):
        if t >= DUR:
            return
        place(L, (x if x.ndim == 2 else pan(x, p)) * dbg(db), t)

    def bars(t0, t1, prog, style, key_oct=48):
        """style: jig | march | tiptoe | sad | box | regal"""
        b, t = 0, t0
        while t < t1 - 0.05:
            root, iv = chord_notes(prog[b % len(prog)])
            bass = key_oct - 12 + root
            beats = 4
            for k in range(beats):
                tb = t + k * BEAT
                if tb >= t1:
                    break
                if style in ("jig", "march", "regal"):
                    if k % 2 == 0:
                        add(I.pluck(I.m2f(bass), 0.8, r, 0.5, 0.35), tb, -2, -0.1)
                    else:
                        for j, i2 in enumerate(iv):
                            add(I.pluck(I.m2f(key_oct + root + i2), 0.45, r, 0.25, 0.6), tb + 0.004 * j, -9, 0.2)
                    if style == "march":
                        add(I.snare(0.45 if k % 2 else 0.3, r, 0.2), tb, -14, 0.1)
                        add(I.snare(0.25, r, 0.12), tb + BEAT / 2, -20, 0.1)
                    if style == "regal" and k == 0:
                        add(I.timpani(I.m2f(bass), 0.6, r), tb, -8)
                    # fife tune: chord tones on eighths, a little motif that climbs then falls
                    motif = [2, 1, 0, 1] if b % 2 else [0, 1, 2, 3]
                    m = key_oct + 24 + root + (iv + [12])[motif[k]]
                    add(I.fife(I.m2f(m), BEAT * 0.45, 0.55, r), tb, -9 if style != "regal" else -12, 0.15)
                    if k % 2 == 1:
                        add(I.fife(I.m2f(m + (2 if b % 2 else -1)), BEAT * 0.4, 0.45, r), tb + BEAT / 2, -12, 0.15)
                    if style == "regal":
                        add(I.brass(I.m2f(key_oct + 12 + root + iv[k % 3]), BEAT * 0.9, 0.6, r, "trumpet" if False else "tuba"), tb, -10, -0.2)
                elif style == "tiptoe":
                    if k % 2 == 0:
                        add(I.pluck(I.m2f(bass + 12), 0.6, r, 0.3, 0.8), tb, -6)
                    add(I.pluck(I.m2f(key_oct + 12 + root + iv[(k + b) % 3]), 0.4, r, 0.2, 0.9), tb + BEAT / 2, -10, 0.2)
                elif style == "box":
                    add(I.musicbox(I.m2f(key_oct + 24 + root + (iv + [12])[(k * 2 + b) % 4]), 0.55, r, 1.4), tb, -8, 0.2)
                    if k == 0:
                        add(I.pad([I.m2f(key_oct + root + i2) for i2 in iv], 4 * BEAT + 0.4, 0.45, r), tb, -14)
                elif style == "sad":
                    if k == 0:
                        add(I.pad([I.m2f(key_oct - 12 + root + i2) for i2 in iv], 4 * BEAT + 0.5, 0.5, r), tb, -10)
                    if k in (0, 2):
                        add(I.pluck(I.m2f(key_oct + 12 + root + iv[(k // 2 + b) % 3]), 0.4, r, 0.6, 0.4), tb, -10, 0.1)
                elif style == "tension":
                    if k == 0:
                        add(I.pad([I.m2f(key_oct - 12 + root), I.m2f(key_oct - 12 + root + 7)], 4 * BEAT + 0.4, 0.5, r), tb, -10)
                    if k in (0, 2):
                        add(I.timpani(I.m2f(bass - 12), 0.35, r, 1.0), tb, -12)
            t += beats * BEAT
            b += 1

    S = []  # (t0, t1, style, progression, label)
    S += [(0.0, 3.25, "tiptoe", ["Dm", "A", "Dm", "A"], "hook: tiptoe pizzicato, D minor")]
    S += [(3.3, 5.62, "jig", ["D", "G", "A", "D"], "party jig, D major")]
    S += [(6.6, 8.4, "tension", ["Dm"], "aftermath: low drone")]
    S += [(9.34, 23.75, "march", ["D", "G", "D", "A", "D", "G", "A", "D"], "building march (snare), D major")]
    S += [(23.8, 25.68, "regal", ["D", "A", "D", "D"], "victory fanfare")]
    S += [(27.8, 36.7, "jig", ["G", "C", "D", "G"], "lunchbox + week one/two, G major")]
    S += [(36.77, 41.4, "tiptoe", ["Em", "B", "Em", "B"], "week three: sneaky fishing, E minor")]
    S += [(41.46, 46.2, "tension", ["Dm", "Dm", "Bb", "A"], "week six: tension")]
    S += [(46.26, 53.35, "box", ["Dm", "Bb", "F", "A"], "winter music box")]
    S += [(53.4, 56.3, "sad", ["Dm", "Bb", "Gm", "A"], "the starving king")]
    S += [(56.37, 61.0, "regal", ["D", "G", "A", "D"], "coronation of the goose")]
    for t0, t1, style, prog, _ in S:
        bars(t0, t1, prog, style)
    # hard stops so the gags land in silence: bite, 'Unluckily', the honk
    env = np.ones(N)
    for a, b in [(5.64, 6.55), (25.7, 27.75), (61.02, DUR)]:
        env[ns(a):ns(b)] = 0
    env = ndimage.uniform_filter1d(env, ns(0.03))
    return L * env, S


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
        mix = np.where(a > ceil, np.sign(mix) * (ceil + (1 - ceil) * np.tanh((a - ceil) / (1 - ceil))), mix) * dbg(-0.9)
    write_wav(os.path.join(VID, "mix.wav"), mix)
    write_wav(os.path.join(VID, "stem_voice.wav"), v * g)
    write_wav(os.path.join(VID, "stem_music.wav"), m * g)
    write_wav(os.path.join(VID, "stem_sfx.wav"), sfx * g)
    with open(os.path.join(VID, "cues.md"), "w") as f:
        f.write(f"# Goose King sound cues\n\nMix: {integrated(mix):.1f} LUFS integrated, true peak {true_peak(mix):.1f} dBTP, {DUR} s, 48 kHz.\n\n")
        f.write("## Music\n\n" + "\n".join(f"- {a:5.2f}-{b:5.2f} s: {lab}" for a, b, _s, _p, lab in S) + "\n- hard stops: bite 5.64, 'Unluckily' 25.70, before the honk 61.02\n\n")
        f.write("## SFX\n\n" + "\n".join(f"- {t:5.2f} s  {lab}  ({db:+.0f} dB)" for t, lab, db in sorted(rows)) + "\n")
    print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP, {len(EV)} events, music sections {len(S)}")


if __name__ == "__main__":
    main()
