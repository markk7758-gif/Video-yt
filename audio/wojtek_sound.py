"""Sound for "Wojtek": synthesized SFX on every action (salutes, the cub's squeaks, bottles, the wrestle, the ship's
horn, the enlistment stamps, the guns at Cassino, the badge, the cheer, the zoo), an original score (a mazurka-step
fife march for the hook, a desert drone with plucked strings for Iran, a comic tuba for the beer and cigarettes, a
dark timpani ostinato at Cassino, a music-box for the puppy, a brass fanfare for the badge and corporal, a slow
glockenspiel lament for the zoo that turns warm on the last line) ducked under the voice, -14 LUFS / -1 dBTP.
usage: python audio/wojtek_sound.py  ->  videos/wojtek/audio/{mix.wav, stem_*.wav, cues.md}"""
import json
import os
import numpy as np
from scipy import ndimage
import sfx_gen as G
import instruments as I
from dsp import SR, ns, rng, lp, hp, bp, resbank, fades, st, pan, place, dbg, read_wav, write_wav, integrated, true_peak, make_ir, convolve_st

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(os.path.dirname(HERE), "videos", "wojtek", "audio")
DUR = 63.3
N = ns(DUR)
R = rng(1942)
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


def boom(r, dur=1.8):
    n = ns(dur); t = np.arange(n) / SR
    y = lp(r.standard_normal(n), 220) * np.exp(-t / 0.5) * 2 + np.sin(2 * np.pi * 42 * t * (1 - 0.3 * t)) * np.exp(-t / 0.35) * 1.5
    y += bp(r.standard_normal(n), 800, 4000, 1) * np.exp(-t / 0.06)
    return norm(y)


def growl(r, dur=0.6, f0=85.0, up=0.0):
    """a bear's friendly grumble: low buzzy voice through a dark formant, rough amplitude"""
    n = ns(dur); t = np.arange(n) / SR
    f = f0 * (1 + up * t / dur + 0.05 * np.sin(2 * np.pi * 3 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = sum(np.sin(k * ph) / k ** 0.7 for k in range(1, 30))
    y = resbank(y, [(320, 4, 1.0), (700, 6, 0.6), (1300, 8, 0.25)]) + 0.25 * lp(r.standard_normal(n), 900)
    env = np.clip(t / 0.06, 0, 1) * np.clip((dur - t) / 0.12, 0, 1) * (1 + 0.35 * np.sin(2 * np.pi * 22 * t + r.random()))
    return norm(lp(y * env, 2400))


def cub_squeak(r, f0=700.0, dur=0.32):
    n = ns(dur); t = np.arange(n) / SR
    f = f0 * (1 + 0.35 * np.sin(np.pi * t / dur))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    return fades(norm(resbank(y, [(1200, 5, 1.0), (2600, 8, 0.4)]) * np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.08, 0, 1)), 0.003, 0.02)


def glug(r, n_=5, gap=0.22):
    out = np.zeros(ns(n_ * gap + 0.3))
    for k in range(n_):
        x = G.bubbles(0.18, r, 40, 200, 900); i = ns(k * gap); out[i:i + len(x)] += x[:len(out) - i]
    return norm(lp(out, 1500))


def cork_pop(r):
    n = ns(0.12); t = np.arange(n) / SR
    return norm(np.sin(2 * np.pi * 600 * t * (1 - 2 * t)) * np.exp(-t / 0.02) + 0.5 * bp(r.standard_normal(n), 1500, 6000, 1) * np.exp(-t / 0.01))


def horn(r, f=98.0, dur=1.8):
    """the troopship's horn: two detuned low brass tones"""
    return norm(M(I.brass(f, dur, 0.9, r, "tuba", scoop=-8), I.brass(f * 1.26, dur, 0.7, r, "tuba", scoop=-8)))


def gull(r, dur=0.5):
    n = ns(dur); t = np.arange(n) / SR
    f = 1500 - 700 * (t / dur) + 200 * np.sin(2 * np.pi * 6 * t)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    return norm(y * np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.1, 0, 1))


def thump_fall(r):
    return M(thud(r, 90, 0.4, 0.8), 0.5 * crunch(r, 0.25, 40))


def scuffle(r, dur=1.2):
    out = np.zeros(ns(dur))
    for k in range(7):
        x = M(thud(r, 120 + 40 * (k % 3), 0.18, 0.6), 0.4 * crunch(r, 0.15, 30)); i = ns(k * dur / 7 + 0.03 * r.random()); out[i:i + len(x)] += x[:len(out) - i] * (0.6 + 0.4 * r.random())
    return norm(out)


def stamp(r):
    return M(thud(r, 140, 0.18, 0.5), 0.6 * G.clink(r, 900, 0.06))


def build_events():
    r = R
    # the hook: the lineup snaps a salute, the bear grumbles proudly
    for k in range(6): ev(0.35 + 0.07 * k, G.boot(r, 0.8), -14, (k - 2.5) * 0.15, "salutes: heels click" if k == 0 else "")
    ev(1.6, growl(r, 0.5, 90, 0.2), -10, 0, "proud bear grumble")
    ev(4.25, G.whoosh(0.4, r, peak=0.8), -8, 0, "flash")
    ev(4.3, G.breeze(15.0, r, 0.9, gust=0.3, bright=1100), -18, 0, "desert wind")
    for k in range(9): ev(6.6 + 0.5 * k, G.stroll_step(r, 0.8), -18, -0.3 + 0.07 * k, "tired footsteps" if k == 0 else "")
    ev(9.3, crunch(r, 0.4, 30), -14, 0.2, "chocolate wrapper")
    ev(10.15, cub_squeak(r, 720), -8, 0, "cub squeaks")
    ev(11.72, cub_squeak(r, 880, 0.26), -8, 0, "that's me squeak")
    ev(13.3, glug(r, 5), -10, 0, "milk glugs")
    ev(15.3, cork_pop(r), -8, 0, "beer bottle pop")
    ev(15.45, glug(r, 3, 0.18), -10, 0, "beer glugs")
    ev(16.05, crunch(r, 0.5, 26), -10, 0, "chews a cigarette")
    ev(16.7, scuffle(r, 1.2), -6, 0, "wrestling scuffle")
    ev(16.75, growl(r, 0.7, 80, 0.4), -10, 0, "")
    ev(17.92, thump_fall(r), -4, 0.1, "soldier hits the dirt")
    ev(18.0, M(G.hurrah(r, 140, 1.0), G.hurrah(r, 170, 1.05), G.hurrah(r, 125, 0.95)), -12, 0, "crowd cheers")
    ev(18.85, slide(r, 220, 140, 0.45), -10, 0, "a problem")
    # the dock
    ev(19.3, G.water_bed(4.0, r, 0.5), -22, 0, "harbour water")
    ev(19.45, horn(r), -12, 0.2, "ship's horn")
    ev(20.3, gull(r), -20, -0.5, "gulls")
    ev(21.0, gull(r, 0.4), -22, 0.5, "")
    ev(22.04, M(G.clink(r, 1400, 0.1), slide(r, 420, 240, 0.25)), -10, 0, "no pets!")
    ev(22.1, growl(r, 0.4, 110, 0.5), -12, 0, "")
    for t0, lab in [(EV_T["name"], "stamp: name"), (EV_T["rank"], "stamp: rank"), (EV_T["number"], "stamp: number")]: ev(t0, stamp(r), -4, 0, lab)
    ev(25.42, M(G.hurrah(r, 150, 1.0), G.hurrah(r, 180, 1.05)), -10, 0, "soldiers cheer")
    for k in range(4): ev(25.25 + 0.25 * k, G.boot(r, 0.6), -16, 0, "")
    # Monte Cassino
    ev(26.12, G.whoosh(0.5, r, peak=0.7), -10, 0, "to Italy")
    for k in range(5): ev(26.3 + 1.9 * k, boom(r, 1.6), -24, 0.6 * (-1) ** k, "distant artillery" if k == 0 else "")
    for t0 in (27.45, 28.3, 29.05, 29.75): ev(t0, boom(r, 1.8), -4, 0.15, "OUR GUN FIRES")
    for k in range(10): ev(30.0 + 0.32 * k, G.stroll_step(r, 1.0), -14, 0.1 * ((-1) ** k), "boots on the slope" if k == 0 else "")
    ev(30.9, G.oof(r, "oof", 120), -16, 0, "heavy crate grunt")
    ev(33.85, M(G.stroll_step(r, 1.0), thud(r, 70, 0.2, 0.3)), -10, 0, "bear steps")
    ev(34.2, M(G.stroll_step(r, 1.0), thud(r, 70, 0.2, 0.3)), -10, 0, "")
    ev(34.47, slide(r, 330, 200, 0.25), -8, 0, "WAIT")
    ev(35.05, pop_up(r, 0.18, 400, 1100), -10, 0, "question mark")
    ev(36.95, G.boot(r, 1.0), -10, 0, "soldier salutes")
    ev(38.27, G.boot(r, 0.8), -10, 0, "bear salutes")
    ev(38.3, growl(r, 0.4, 100, 0.3), -14, 0, "")
    # the puppy
    for k in range(3): ev(39.1 + 0.35 * k, G.clink(r, 2400 + 300 * k, 0.08), -16, 0.2, "cutlery" if k == 0 else "")
    ev(40.15, squeak(r, 0.18, 1300, 1600), -12, 0, "puppy yip")
    # one of the guys
    ev(40.6, M(G.babble(1.4, r, 140, 1.0), G.babble(1.4, r, 120, 0.95)), -16, 0, "soldiers chatting")
    ev(41.5, M(G.hurrah(r, 150, 1.0), growl(r, 0.6, 95, 0.2)), -12, 0, "laughing together")
    ev(41.55, G.clink(r, 1800, 0.12), -12, 0, "mugs clink")
    ev(43.1, I.glock(1568, 0.6, r, 1.4), -12, 0, "badge sparkle")
    ev(44.87, M(thud(r, 110, 0.2, 0.4), I.glock(2093, 0.5, r, 1.2)), -10, 0, "shell")
    ev(45.88, M(G.clink(r, 2200), I.glock(2637, 0.6, r, 1.5)), -6, 0, "stripes pinned")
    ev(46.75, G.boot(r, 1.0), -8, 0, "corporal salute")
    ev(49.03, M(G.hurrah(r, 140, 1.0), G.hurrah(r, 170, 1.05), G.hurrah(r, 125, 0.95), G.hurrah(r, 190, 1.1)), -8, 0, "the war ends: cheers")
    ev(49.1, G.applause(1.5, r, 24), -14, 0, "")
    ev(49.1, bell(r, 392.0, 2.5), -18, -0.3, "church bells")
    ev(49.6, bell(r, 330.0, 2.2), -20, 0.3, "")
    # can't go home
    ev(49.7, G.breeze(4.0, r, 1.0, gust=0.35, bright=700), -18, 0, "cold wind on the dock")
    ev(50.6, G.water_bed(3.0, r, 0.4), -24, 0, "")
    ev(51.7, gull(r, 0.6), -24, 0.4, "lonely gull")
    ev(52.5, G.flag_flutter(1.0, r), -16, -0.2, "flag flaps")
    # the zoo
    ev(53.06, G.bird_chirps(10.0, r, 0.5, "blackbird"), -20, 0, "park birds")
    ev(53.95, M(G.babble(2.0, r, 160, 1.05), G.babble(2.0, r, 220, 1.1)), -24, 0, "zoo visitors")
    ev(57.75, G.babble(1.2, r, 120, 0.9), -18, 0, "veterans talking")
    ev(58.45, G.hurrah(r, 130, 0.95), -8, 0, "a shout in Polish")
    ev(59.0, G.hurrah(r, 115, 0.9), -10, 0.2, "")
    ev(60.4, growl(r, 0.45, 100, 0.6), -12, 0, "bear looks up")
    ev(61.8, I.glock(1568, 0.5, r, 2.0), -14, 0, "warm chime")


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


EV_T = {w: next(x["start"] for x in WORDS if x["clean"] == w) for w in ("name", "rank", "number")}


# ---------------- music ----------------
def music():
    r = rng(1942)
    L = np.zeros((2, N))

    def add(x, t, db=0.0, p=0.0):
        if t >= DUR:
            return
        place(L, (x if x.ndim == 2 else pan(x, p)) * dbg(db), t)

    S = []
    # 1) hook: a mazurka-step fife march in G (3/4, accent on beat 2), snare + oom-pah
    b3 = 0.36
    mel = [67, 71, 74, 72, 71, 69, 67, 69, 71, 72, 74, 79]
    for k in range(int(4.25 / b3)):
        tk = 0.05 + k * b3
        add(I.snare(0.55 if k % 3 == 1 else 0.3, r, 0.18), tk, -16, 0.1)
        add(I.brass(I.m2f([43, 50, 50][k % 3]), b3 * 0.8, 0.5 if k % 3 == 0 else 0.35, r, "tuba"), tk, -12, -0.1)
        add(I.fife(I.m2f(mel[k % len(mel)]), b3 * 0.85, 0.55, r), tk, -10, 0.2)
    S.append((0.05, 4.3, "hook: mazurka-step fife march, G major"))
    # 2) Iran: warm drone + plucked strings in a Phrygian-dominant mode (E F G# A B C D)
    add(I.pad([I.m2f(m) for m in (40, 47, 52)], 8.0, 0.4, r, att=1.0, rel=1.0), 4.35, -12)
    oud = [64, 65, 68, 69, 71, 69, 68, 65, 64, 65, 64, 62]
    for k in range(int((12.0 - 4.4) / 0.3)):
        tk = 4.4 + k * 0.3
        if k % 4 != 3: add(I.pluck(I.m2f(oud[k % len(oud)]), 0.55, r, 0.6, 0.6), tk, -11, 0.25)
    S.append((4.35, 12.0, "desert drone + plucked strings (Phrygian dominant)"))
    # 3) beer, cigarettes, wrestling: a comic tuba oom-pah with pizzicato
    for k in range(int((18.3 - 12.05) / 0.33)):
        tk = 12.05 + k * 0.33
        add(I.brass(I.m2f([43, 50, 45, 50][k % 4] + (5 if tk > 16.5 else 0)), 0.26, 0.6, r, "tuba"), tk, -11, -0.1)
        if k % 2: add(I.pluck(I.m2f([67, 71, 74, 71][(k // 2) % 4] + (5 if tk > 16.5 else 0)), 0.5, r, 0.3, 0.8), tk, -12, 0.2)
    add(I.cymbal(0.5, r, 1.6), 17.91, -16)
    S.append((12.05, 18.3, "comic tuba oom-pah + pizzicato; cymbal on the win"))
    # 4) the dock: light march, a stop on "pets", the stamps in rhythm, brass on "soldier now"
    for k in range(int((21.95 - 19.35) / 0.36)):
        tk = 19.35 + k * 0.36
        add(I.snare(0.35, r, 0.15), tk, -18, 0.1)
        add(I.pluck(I.m2f([55, 62, 59, 62][k % 4]), 0.5, r, 0.4, 0.6), tk, -12, -0.1)
    for k, m in enumerate([62, 66, 69, 74]): add(I.brass(I.m2f(m), 0.3, 0.6, r, "horn"), 25.42 + k * 0.12, -12)
    S.append((19.35, 21.95, "light dock march; stop on 'won't take pets'; horn flourish on 'soldier now'"))
    # 5) Monte Cassino: dark timpani ostinato + low brass, snare roll under the carry
    add(I.pad([I.m2f(m) for m in (38, 45, 50, 53)], 8.4, 0.45, r, att=0.8, rel=0.6), 26.15, -12)
    for k in range(int((34.4 - 26.2) / 0.42)):
        tk = 26.2 + k * 0.42
        add(I.timpani(I.m2f(38 if k % 2 == 0 else 45), 0.5 if k % 4 == 0 else 0.3, r, 0.9), tk, -11)
        if k % 4 == 0: add(I.brass(I.m2f([38, 41, 36, 38][(k // 4) % 4]), 1.4, 0.55, r, "soft"), tk, -12)
    for k in range(int((34.4 - 30.0) / 0.21)): add(I.snare(0.2 + 0.02 * k, r, 0.12), 30.0 + k * 0.21, -18, 0.1)
    S.append((26.15, 34.4, "Cassino: timpani ostinato + low brass, snare roll under the carry"))
    # 6) "You see": music box (copying; the puppy; one of the guys)
    box = [79, 76, 72, 76, 79, 84, 83, 79, 77, 74, 71, 74, 76, 79]
    for k in range(int((42.0 - 36.4) / 0.4)): add(I.musicbox(I.m2f(box[k % len(box)]), 0.5, r, 1.4), 36.4 + k * 0.4, -9, 0)
    S.append((36.4, 42.0, "music box: copying, the puppy, one of the guys"))
    # 7) badge + corporal: proud brass fanfare, cymbal on 'Corporal'
    for k, m in enumerate([55, 59, 62, 67, 62, 67, 71, 74]): add(I.brass(I.m2f(m), 0.45, 0.65, r, "horn"), 42.2 + k * 0.42, -14, 0)
    for k, m in enumerate([67, 71, 74, 79]): add(I.brass(I.m2f(m), 0.5, 0.75, r, "horn"), 45.86 + k * 0.22, -13)
    add(I.cymbal(0.55, r, 2.0), 46.73, -16)
    add(I.timpani(I.m2f(43), 0.8, r, 1.4), 46.73, -10)
    S.append((42.2, 47.8, "brass fanfare for the badge and the promotion; cymbal on 'Corporal'"))
    # 8) the war ends: full march, triumphant
    for k in range(int((49.6 - 47.9) / 0.3)):
        tk = 47.9 + k * 0.3
        add(I.snare(0.5, r, 0.16), tk, -14, 0.1)
        add(I.fife(I.m2f([74, 79, 83, 86, 83, 79][k % 6]), 0.26, 0.6, r), tk, -10, 0.2)
        add(I.brass(I.m2f([43, 50][k % 2]), 0.26, 0.6, r, "tuba"), tk, -11, -0.1)
    add(I.cymbal(0.7, r, 2.2), 49.03, -14)
    S.append((47.9, 49.6, "the war ends: triumphant march"))
    # 9) can't go home -> the zoo: slow glockenspiel lament in E minor over a cold pad, turns to E major on the last line
    add(I.pad([I.m2f(m) for m in (40, 47, 52, 55)], 12.2, 0.4, r, att=1.5, rel=1.0), 49.7, -11)
    lam = [76, 74, 71, 67, 69, 71, 64, 67, 69, 71, 74, 71, 69, 67, 64]
    for k in range(int((61.6 - 49.8) / 0.8)): add(I.glock(I.m2f(lam[k % len(lam)]), 0.45, r, 2.2), 49.8 + k * 0.8, -12, 0.1)
    add(I.pad([I.m2f(m) for m in (40, 47, 52, 56, 59)], 2.0, 0.45, r, att=0.4, rel=0.9), 61.65, -9)
    for k, m in enumerate([64, 68, 71, 76]): add(I.musicbox(I.m2f(m + 12), 0.55, r, 1.8), 61.75 + k * 0.22, -10)
    S.append((49.7, 63.3, "cold lament (glockenspiel, E minor pad) turning to E major on 'understands them'"))
    env = np.ones(N)
    for a, b2 in [(18.3, 18.85), (21.95, 25.35), (34.4, 35.0)]:  # stops: "a problem", the enlisting (stamps play alone), "Wait."
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
        f.write(f"# Wojtek sound cues\n\nMix: {integrated(mix):.1f} LUFS integrated, true peak {true_peak(mix):.1f} dBTP, {DUR} s, 48 kHz.\n\n")
        f.write("## Music\n\n" + "\n".join(f"- {a:5.2f}-{b:5.2f} s: {lab}" for a, b, _s, _p, lab in S) + "\n- stops: 'a problem' 18.30, enlisting 21.95-25.35 (stamps alone), 'Wait.' 34.40\n\n")
        f.write("## SFX\n\n" + "\n".join(f"- {t:5.2f} s  {lab}  ({db:+.0f} dB)" for t, lab, db in sorted(rows)) + "\n")
    print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP, {len(EV)} events, music sections {len(S)}")


if __name__ == "__main__":
    main()
