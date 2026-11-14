#!/usr/bin/env python3
"""Offline DJ analysis for the club tracks (numpy + scipy + ffmpeg only).

Writes <dir>/index.json with, per track: BPM and beat grid (first beat, period), first downbeat,
8-bar phrase grid, per-bar energy and bass curves, cue-in (first phrase with a kick, so beatless
intros are skipped), outro start and the transition window before it (so cheesy outros are skipped),
drops, the best 16-bar section, key (Krumhansl), loudness and gain to the club target, and mood tags
(from the file name, or from analysis when the name has none).

Usage: club_analyze.py DIR [--force]
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy.signal import find_peaks

SR = 22050
HOP = 256
NFFT = 1024
FPS = SR / HOP
TARGET_LUFS = -14.0
KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
CAMELOT_MAJ = {'B': '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', 'F': '7B', 'C': '8B', 'G': '9B', 'D': '10B', 'A': '11B', 'E': '12B'}
CAMELOT_MIN = {'G#': '1A', 'D#': '2A', 'A#': '3A', 'F': '4A', 'C': '5A', 'G': '6A', 'D': '7A', 'A': '8A', 'E': '9A', 'B': '10A', 'F#': '11A', 'C#': '12A'}


def decode(path, sr=SR):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def stft_mag(x, n=NFFT, hop=HOP):
    pad = np.pad(x, (n // 2, n // 2))
    frames = np.lib.stride_tricks.sliding_window_view(pad, n)[::hop] * np.hanning(n)
    return np.abs(np.fft.rfft(frames, axis=1))


def band_matrix(freqs, edges):
    return [(freqs >= a) & (freqs < b) for a, b in zip(edges[:-1], edges[1:])]


def onset_envelopes(S, freqs):
    edges = np.geomspace(30, 8000, 25)
    bands = np.stack([S[:, m].sum(axis=1) for m in band_matrix(freqs, edges)], axis=1)
    L = np.log1p(bands * 10)
    flux = np.maximum(np.diff(L, axis=0, prepend=L[:1]), 0)
    full = flux.sum(axis=1)
    low = flux[:, :5].sum(axis=1)  # roughly 30-110 Hz: kick drum
    hp = lambda e: e - np.convolve(e, np.ones(32) / 32, 'same')
    return np.maximum(hp(full), 0), np.maximum(hp(low), 0), L


def tempo(env):
    e = env - env.mean()
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    lags = np.arange(len(ac))
    bpm = 60 * FPS / np.maximum(lags, 1)
    ok = (bpm >= 85) & (bpm <= 180)
    prior = np.exp(-0.5 * (np.log2(bpm / 124) / 0.45) ** 2)
    score = np.where(ok, ac * prior, -np.inf)
    lag = int(np.argmax(score))
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
    d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
    return 60 * FPS / (lag + d)


def fit_grid(env, bpm0):
    """Search period and phase that put the most onset energy on the grid; return (t0, period)."""
    t = np.arange(len(env)) / FPS
    best = (-1, None, None)
    for bpm in np.linspace(bpm0 * 0.985, bpm0 * 1.015, 241):
        P = 60 / bpm
        ph = (t % P) / P
        nb = 64
        hist = np.bincount((ph * nb).astype(int) % nb, weights=env, minlength=nb)
        hist = hist + 0.5 * np.roll(hist, 1) + 0.5 * np.roll(hist, -1)
        k = int(np.argmax(hist))
        if hist[k] > best[0]:
            a, b, c = hist[k - 1], hist[k], hist[(k + 1) % nb]
            d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
            best = (hist[k], P, ((k + d) / nb) % 1 * P)
    _, P, phase = best
    # refine: snap each grid beat to the local onset peak (+-35 ms), robust linear fit
    n = int((len(env) / FPS - phase) / P)
    ks, ts = [], []
    w = int(0.035 * FPS)
    for k in range(n):
        g = phase + k * P
        i = int(round(g * FPS))
        lo, hi = max(0, i - w), min(len(env), i + w + 1)
        if hi - lo < 3:
            continue
        j = lo + int(np.argmax(env[lo:hi]))
        if env[j] > np.percentile(env, 75):
            ks.append(k)
            ts.append(j / FPS)
    if len(ks) > 32:
        ks, ts = np.array(ks), np.array(ts)
        for _ in range(3):
            A = np.vstack([ks, np.ones_like(ks)]).T
            (p, c), *_ = np.linalg.lstsq(A, ts, rcond=None)
            r = ts - (p * ks + c)
            keep = np.abs(r) < max(0.012, 2.5 * np.std(r))
            ks, ts = ks[keep], ts[keep]
        P, phase = p, c
        resid = float(np.std(ts - (P * ks + phase)) * 1000)
    else:
        resid = None
    t0 = phase % P
    return t0, P, resid


def kick_onsets(x):
    from scipy.signal import butter, sosfilt
    y = sosfilt(butter(4, (40, 160), 'bp', fs=SR, output='sos'), x)
    hop = 64
    e = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, 'same'))[::hop]
    return np.maximum(np.diff(np.log(e + 1e-5), prepend=0), 0), SR / hop


def phase_fix(o, fps, t0, P, starts):
    """Per-phrase local beat offset (s): median kick onset minus grid over the phrase's 32 beats."""
    thr = np.percentile(o, 90)
    w = int(0.05 * fps)
    out = []
    for a in starts:
        errs = []
        for k in range(32):
            j = int((a + k * P) * fps)
            seg = o[max(0, j - w):j + w + 1]
            if len(seg) == 2 * w + 1 and seg.max() > thr:
                errs.append((np.argmax(seg) - w) / fps)
        out.append(round(float(np.median(errs)), 4) if len(errs) >= 8 else 0.0)
    return out


def refine_phase(x, P, t0):
    """Fine phase from kick attacks: 40-160 Hz band, 2.9 ms hops, onsets folded on the beat period."""
    from scipy.signal import butter, sosfilt
    y = sosfilt(butter(4, (40, 160), 'bp', fs=SR, output='sos'), x)
    hop = 64
    e = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, 'same'))[::hop]
    o = np.maximum(np.diff(np.log(e + 1e-5), prepend=0), 0)
    fps = SR / hop
    t = np.arange(len(o)) / fps
    d = ((t - t0 + P / 2) % P) - P / 2  # offset of each frame from its nearest grid beat
    m = np.abs(d) < 0.06
    nb = 120
    hist = np.bincount(((d[m] + 0.06) / 0.12 * nb).astype(int).clip(0, nb - 1), weights=o[m], minlength=nb)
    hist = np.convolve(hist, [0.25, 0.5, 0.25], 'same')
    shift = ((np.argmax(hist) + 0.5) / nb) * 0.12 - 0.06
    return (t0 + shift) % P, shift


def beat_features(L, beats):
    idx = np.clip((beats * FPS).astype(int), 0, len(L) - 1)
    feats = np.stack([L[a:b].mean(axis=0) if b > a else L[a] for a, b in zip(idx[:-1], idx[1:])])
    return feats


def key_of(x):
    n = 8192
    S = stft_mag(x, n=n, hop=n // 2)
    f = np.fft.rfftfreq(n, 1 / SR)
    m = (f > 55) & (f < 2000)
    pc = np.round(12 * np.log2(f[m] / 440.0)).astype(int) % 12
    chroma = np.zeros(12)
    E = (S[:, m] ** 2).sum(axis=0)
    np.add.at(chroma, (pc + 9) % 12, E)  # pc 0 = A -> shift so index 0 = C
    chroma = chroma / chroma.sum()
    best = (-2, None, None)
    for i in range(12):
        for prof, mode in ((MAJ, 'major'), (MIN, 'minor')):
            r = np.corrcoef(np.roll(prof, i), chroma)[0, 1]
            if r > best[0]:
                best = (r, KEYS[i], mode)
    r, k, mode = best
    cam = (CAMELOT_MAJ if mode == 'major' else CAMELOT_MIN)[k]
    return f'{k} {mode}', cam, round(float(r), 2)


def lufs(path):
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', out)
    return float(m[-1]) if m else None


def analyze(path):
    x = decode(path)
    dur = len(x) / SR
    S = stft_mag(x)
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    full, low, L = onset_envelopes(S, freqs)
    bpm0 = tempo(full + 2 * low)
    t0, P, resid = fit_grid(low + 0.5 * full, bpm0)
    t0, _shift = refine_phase(x, P, t0)
    kick_o, kfps = kick_onsets(x)
    bpm = 60 / P
    beats = np.arange(t0, dur, P)
    feats = beat_features(L, beats)
    nov = np.r_[0, np.abs(np.diff(feats, axis=0)).sum(axis=1)]
    kick = np.array([low[int(b * FPS)] if int(b * FPS) < len(low) else 0 for b in beats[:-1]])
    # downbeat: the beat-in-bar where changes and kicks concentrate
    nb = len(nov)
    sc = [nov[o:nb:4].mean() / (nov.mean() + 1e-9) + 0.5 * kick[o:nb:4].mean() / (kick.mean() + 1e-9) for o in range(4)]
    db = int(np.argmax(sc))
    bars = beats[db::4]
    bar_feats = np.stack([feats[db + 4 * i:db + 4 * i + 4].mean(axis=0) for i in range(len(bars)) if db + 4 * i + 4 <= len(feats)])
    nbar = len(bar_feats)
    bars = bars[:nbar]
    bnov = np.r_[0, np.abs(np.diff(bar_feats, axis=0)).sum(axis=1)]
    ph = int(np.argmax([bnov[q::8].mean() for q in range(8)]))
    # energy per bar (RMS dB) and bass per bar, normalized 0..1 over the track
    rms = np.array([np.sqrt(np.mean(x[int(a * SR):int((a + 4 * P) * SR)] ** 2) + 1e-12) for a in bars])
    edb = 20 * np.log10(rms)
    lo_band = (freqs >= 30) & (freqs < 150)
    lowE = np.array([S[int(a * FPS):int((a + 4 * P) * FPS), :][:, lo_band].sum() for a in bars])
    ldb = 10 * np.log10(lowE + 1e-9)
    norm = lambda v: np.clip((v - np.percentile(v, 5)) / (np.percentile(v, 95) - np.percentile(v, 5) + 1e-9), 0, 1)
    energy, bass = norm(edb), norm(ldb)
    phrase_bars = [i for i in range(ph, nbar, 8)]
    # cue-in: first phrase whose 8 bars carry a kick (bass) and real energy
    def pmean(arr, i, n=8):
        return float(arr[i:i + n].mean()) if i < len(arr) else 0
    cue_in_bar = next((i for i in phrase_bars if pmean(bass, i) >= 0.45 and pmean(energy, i) >= 0.4), phrase_bars[0] if phrase_bars else 0)
    # outro start: first phrase after the last strong phrase where the groove falls away
    strong = [i for i in phrase_bars if pmean(bass, i) >= 0.45 and pmean(energy, i) >= 0.4]
    last_strong = strong[-1] if strong else (phrase_bars[-1] if phrase_bars else nbar - 8)
    outro_bar = min(last_strong + 8, nbar)
    trans_bar = max(cue_in_bar + 16, outro_bar - 8)  # 8-bar (32-beat) transition window ending at the outro
    # drops: phrase starts where energy and bass jump against the previous 4 bars
    drops = []
    for i in phrase_bars:
        if i >= 4 and pmean(energy, i, 4) - energy[i - 4:i].mean() > 0.22 and pmean(bass, i, 4) > 0.6:
            drops.append(round(float(bars[i]), 3))
    pfix = phase_fix(kick_o, kfps, t0, P, [float(bars[i]) for i in phrase_bars])
    best_i = max(phrase_bars, key=lambda i: pmean(energy, i, 16) + 0.5 * pmean(bass, i, 16)) if phrase_bars else 0
    key, cam, kconf = key_of(x)
    cent = float((S.mean(axis=0) * freqs).sum() / S.mean(axis=0).sum())
    lv = lufs(path)
    bt = lambda i: round(float(bars[min(i, nbar - 1)]) if i < nbar else float(bars[-1] + (i - nbar + 1) * 4 * P), 3)
    return {
        'duration': round(dur, 2),
        'bpm': round(bpm, 3),
        'beat0': round(float(t0), 4),
        'period': round(float(P), 6),
        'gridResidualMs': round(resid, 1) if resid is not None else None,
        'downbeat0': round(float(beats[db]), 4),
        'phraseBars': 8,
        'phrase0': round(float(bars[ph]), 4),
        'phaseFix': pfix,
        'bars': nbar,
        'energy': [round(float(v), 2) for v in energy],
        'bass': [round(float(v), 2) for v in bass],
        'cueIn': bt(cue_in_bar),
        'transStart': bt(trans_bar),
        'outro': bt(outro_bar),
        'drops': drops,
        'best': [bt(best_i), bt(best_i + 16)],
        'key': key,
        'camelot': cam,
        'keyConf': kconf,
        'centroid': round(cent),
        'meanEnergy': round(float(np.mean(energy[cue_in_bar:outro_bar])) if outro_bar > cue_in_bar else 0.5, 2),
        'lufs': lv,
        'gainDb': round(TARGET_LUFS - lv, 2) if lv is not None else 0,
    }


def tags_from_analysis(a):
    t = []
    if a['bpm'] >= 126:
        t.append('Fast')
    if a['key'].endswith('minor') and a['centroid'] < 1700:
        t.append('Dark')
    elif a['key'].endswith('major'):
        t.append('Happy')
    if a['centroid'] < 1500:
        t.append('Deep')
    if a['meanEnergy'] > 0.7:
        t.append('Intense')
    if len(t) < 2:
        t.append('Groovy')
    return t[:2]


def parse_name(fn):
    base = re.sub(r'(\.mp3)+$', '', fn, flags=re.I)
    m = re.match(r'^(Club Song \d+)\s*-\s*(.+)$', base)
    if m:
        return m.group(1), 'Epidemic Sound', [w.strip().title() for w in re.split(r'[:/_]', m.group(2)) if w.strip()]
    m = re.match(r'^ES_(.+?)\s*-\s*(.+)$', base)
    if m:
        return m.group(1).strip(), m.group(2).strip() + ' (Epidemic Sound)', []
    return base, 'Epidemic Sound', []


def main():
    d = sys.argv[1]
    force = '--force' in sys.argv
    ip = os.path.join(d, 'index.json')
    idx = json.load(open(ip)) if os.path.exists(ip) else {'tracks': []}
    have = {t['file']: t for t in idx.get('tracks', [])}
    src = json.load(open(os.path.join(d, 'sources.json'))) if os.path.exists(os.path.join(d, 'sources.json')) else {}
    out = []
    for fn in sorted(os.listdir(d)):
        if not fn.lower().endswith('.mp3'):
            continue
        p = os.path.join(d, fn)
        st = os.stat(p)
        old = have.get(fn)
        if old and not force and old.get('size') == st.st_size:
            out.append(old)
            continue
        orig = src.get(fn, fn)
        title, artist, tags = parse_name(orig)
        a = analyze(p)
        tagSource = 'filename'
        if not tags:
            tags = tags_from_analysis(a)
            tagSource = 'analysis'
        rec = {'id': re.sub(r'\.mp3$', '', fn), 'file': fn, 'source': orig, 'size': st.st_size, 'title': title, 'artist': artist, 'tags': tags, 'tagSource': tagSource, **a}
        print(f"{fn}: {a['bpm']:.2f} BPM, grid resid {a['gridResidualMs']} ms, downbeat {a['downbeat0']}s, phrase {a['phrase0']}s, cue-in {a['cueIn']}s, transition {a['transStart']}s, outro {a['outro']}s, key {a['key']} ({a['camelot']}), tags {tags}")
        out.append(rec)
    idx = {
        'note': 'Epidemic Sound tracks licensed by the project owner. Local build only (folder is git-ignored). Generated by tools/v2/club_analyze.py.',
        'targetLufs': TARGET_LUFS,
        'tracks': out,
    }
    tmp = ip + '.tmp'
    json.dump(idx, open(tmp, 'w'), indent=1)
    os.replace(tmp, ip)


if __name__ == '__main__':
    main()
