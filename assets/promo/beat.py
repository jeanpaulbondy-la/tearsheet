"""Usage: python3 beat.py out.wav
Synthesizes a 32 s, 120 BPM electronic bed for the promo, with hits on the scene cuts."""
import numpy as np, wave, sys

SR = 44100
DUR = 32.0
N = int(SR * DUR)
out = np.zeros((N, 2))
rng = np.random.default_rng(7)

def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i].astype(float).copy() * gain
    f = min(len(sig), int(SR * 0.010)); sig[-f:] *= np.linspace(1, 0, f)   # no click when a sound is cut
    fi = min(len(sig), int(SR * 0.001)); sig[:fi] *= np.linspace(0, 1, fi)
    out[i:i + len(sig), 0] += sig * (1 - max(pan, 0))
    out[i:i + len(sig), 1] += sig * (1 + min(pan, 0))

def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)

def kick(power=1.0):
    n = int(SR * 0.38); t = np.arange(n) / SR
    f = 48 + 140 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.001, 0.16) * power + np.tanh(np.sin(ph) * 3) * 0.12 * env(n, 0.001, 0.05)

def clap():
    n = int(SR * 0.22)
    noise = rng.standard_normal(n)
    noise = noise - np.convolve(noise, np.ones(12) / 12, mode="same")  # high-passed
    return noise * env(n, 0.001, 0.07) * 0.5

def hat(open_=False):
    n = int(SR * (0.16 if open_ else 0.05))
    noise = rng.standard_normal(n)
    noise = noise - np.convolve(noise, np.ones(4) / 4, mode="same")
    return noise * env(n, 0.001, 0.09 if open_ else 0.02) * 0.22

def bass(freq, length):
    n = int(SR * length); t = np.arange(n) / SR
    saw = 2 * ((t * freq) % 1) - 1
    sq = np.sign(np.sin(2 * np.pi * freq * t))
    sig = np.tanh((saw * 0.6 + sq * 0.4) * 2.2)
    # simple one-pole low-pass that opens slightly over the note
    a = 0.08 + 0.1 * np.minimum(t / length, 1)
    y = np.zeros(n); acc = 0.0
    for i in range(n):
        acc += a[i] * (sig[i] - acc); y[i] = acc
    return y * env(n, 0.004, length * 0.4) * 0.55

def pluck(freq, length=0.28):
    n = int(SR * length); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(4 * np.pi * freq * t) * np.exp(-t * 18) + 0.25 * np.sin(6 * np.pi * freq * t) * np.exp(-t * 30)
    return sig * env(n, 0.002, length * 0.35) * 0.22

def riser(length, start_t, gain=0.5):
    n = int(SR * length); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # sweep by blending a rising-frequency high-pass
    k = 1 + (t / length) * 40
    y = np.zeros(n); acc = 0.0
    for i in range(n):
        a = min(0.02 + 0.5 * (i / n) ** 2, 0.95)
        acc += a * (noise[i] - acc); y[i] = noise[i] - acc if False else acc
    return y * (t / length) ** 2 * gain

def impact(power=1.0):
    n = int(SR * 0.9); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 90 * np.exp(-t * 7)) * t) * np.exp(-t * 3.2)
    noise = rng.standard_normal(n); noise = noise - np.convolve(noise, np.ones(8) / 8, mode="same")
    return (boom * 0.9 + noise * np.exp(-t * 9) * 0.35) * power

BEAT = 0.5
# Section map (seconds): hook 0-3, reveal 3-6, read 6-9, select 9-12, build 12-18, payoff 18-25.5, end 25.5-30
# Hook: sparse kicks that tighten, riser into the drop at 3.0
for k in range(0, 6):
    add(kick(0.7), k * BEAT, gain=0.8)
for k in range(8, 12):
    add(kick(0.6), 3.0 - (12 - k) * 0.25 + 0.0, gain=0.5)
add(riser(1.4, 1.6), 1.6, gain=0.55)

hits = [3.0, 6.0, 9.0, 12.0, 18.0, 25.5, 26.5, 28.0, 29.0]
for h in hits:
    add(impact((1.0 if h in (3.0, 29.0) else 0.5 if h >= 26.5 else 0.8)), h, gain=0.8)

# Main groove from the drop
t0 = 3.0
steps = int((29.0 - t0) / (BEAT / 2))
prog = [55.0, 55.0, 65.41, 49.0]  # A1 A1 C2 G1 per bar
for s in range(steps):
    t = t0 + s * BEAT / 2
    beat_i = s // 2
    if s % 2 == 0:
        add(kick(), t, gain=0.85)
        if beat_i % 2 == 1 and t >= 6.0: add(clap(), t, gain=0.9)
    else:
        add(hat(open_=(beat_i % 2 == 0)), t, pan=0.3, gain=1.0)
    if t >= 6.0 and s % 4 == 3: add(hat(), t + BEAT / 4, pan=-0.3, gain=0.6)
    bar = int((t - t0) / 2.0) % 4
    if s % 4 == 0 or s % 4 == 3:
        add(bass(prog[bar], 0.32), t, gain=0.75)
    # arp from the build scene on
    if t >= 12.0:
        scale = [220.0, 261.63, 329.63, 392.0, 440.0, 329.63, 261.63, 196.0]
        base = prog[bar] * 4
        add(pluck([base, base * 1.2, base * 1.5, base * 2][s % 4], 0.3), t, pan=0.2 * (-1) ** s, gain=1.0 if t < 25.5 else 0.7)

# Build scene: accelerating ticks under the timer, then a lift at 17.3
for k in range(24):
    t = 12.3 + k * 0.2
    if t < 17.4:
        n = int(SR * 0.03); tick = np.sin(2 * np.pi * (1200 + k * 40) * np.arange(n) / SR) * env(n, 0.001, 0.012) * 0.25
        add(tick, t, pan=0.5)
add(riser(0.9, 16.5), 16.5, gain=0.6)

# End: the groove lands on the downbeat at 29.0 with an A minor chord that rings out
for f in (55.0, 110.0, 220.0, 261.63, 329.63):
    n = int(SR * 2.6); t = np.arange(n) / SR
    add(np.sin(2 * np.pi * f * t) * env(n, 0.003, 0.7) * 0.2, 29.0, gain=1.0)
add(kick(1.0), 29.0, gain=1.0)

# Master: soft clip, fade the last 0.6 s, normalize
fade = np.ones(N); m = int(SR * 1.2); fade[-m:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, m)))
out *= fade[:, None]
out = np.tanh(out * 0.9)
out /= np.max(np.abs(out)) / 0.66
pcm = (out * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1])
