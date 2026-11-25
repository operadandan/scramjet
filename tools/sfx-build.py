# cuts the uploaded recordings into the clips the game plays, packs them per group into one mp3 each (public/sfx/) and
# writes the clip table (src/client/js/10b-sfx-data.js): per clip [offset s, length s, hit s] where hit = its first strong transient
import numpy as np, scipy.io.wavfile as W, subprocess, json
SR = 44100
src = {i: W.read(f'/tmp/sfx/src/{i}.wav')[1].astype(np.float32) / 32768 for i in range(1, 14)}
def cut(i, a, b, fi=0.003, fo=0.04, tail=None):
  x = src[i][int(max(0, a) * SR):int(b * SR)].copy(); n = len(x)
  k = int(fi * SR); x[:k] *= np.linspace(0, 1, k)
  fo = tail if tail else fo; k = min(n, int(fo * SR)); x[n - k:] *= np.linspace(1, 0, k) ** 2
  return x
def hit(x, rel=-8):
  h = int(0.004 * SR); e = np.array([np.sqrt(np.mean(x[j:j + h] ** 2)) + 1e-9 for j in range(0, len(x) - h, h)]); db = 20 * np.log10(e)
  return float(np.argmax(db > db.max() + rel) * h / SR)
G = {
 'm4': {'m4_fire': [(1, t - 0.008, t + 1.6, 0.003, 0, 0.7) for t in (0.02, 2.555, 5.2, 7.91, 10.285, 12.78)],
        'm4_press': [(6, 0.26, 0.48)], 'm4_out': [(6, 0.76, 1.25)], 'm4_in': [(6, 1.93, 2.25)], 'm4_seat': [(6, 2.49, 2.86)],
        'm4_chb': [(6, 3.40, 3.62)], 'm4_chf': [(6, 3.615, 4.22)]},
 'g17': {'g17_fire': [(7, t - 0.008, t + 2.0, 0.003, 0, 0.9) for t in (0.005, 4.085, 8.17, 12.25)],
        'g17_out': [(8, a, a + 0.5) for a in (0.0, 2.03, 4.12, 6.1, 8.07)], 'g17_in': [(8, a, a + 0.3) for a in (0.79, 2.79, 4.79, 6.83, 8.84)],
        'g17_seat': [(8, a, a + 0.42) for a in (1.28, 3.31, 5.32, 7.33, 9.34)]},
 'm107': {'m107_fire': [(4, 0.0, 2.9, 0.003, 0, 1.0), (4, 4.985, 7.7, 0.003, 0, 1.0), (4, 3.045, 4.5, 0.003, 0, 0.6)],
        'm107_out': [(5, 0.0, 0.43), (5, 3.67, 4.1)], 'm107_in': [(5, 0.78, 1.18), (5, 4.5, 4.85)],
        'm107_back': [(5, 1.49, 2.01), (5, 5.12, 5.6)], 'm107_fwd': [(5, 2.32, 2.62), (5, 5.92, 6.2)]},
 'sg': {'sg_fire': [(3, t - 0.008, t + 2.4, 0.003, 0, 1.0) for t in (0.005, 3.01, 6.025, 9.025)],
        'sg_shell': [(2, 0.0, 0.58), (2, 1.08, 1.63), (2, 2.13, 2.72)]},
 'drop': {'brass': [(10, t - 0.03, t + 0.55) for t in (23.84, 28.115, 30.925, 33.48, 36.715, 39.075, 53.085, 73.655, 90.31, 113.525)],
        'hull': [(9, t - 0.03, t + d + 0.1) for t, d in ((2.54, 0.6), (5.275, 0.69), (9.31, 0.69), (17.48, 0.82), (21.71, 0.47), (24.63, 0.57))]},
 'death': {'die1': [(11, t - 0.03, t + d + 0.15) for t, d in ((0.065, 1.43), (2.64, 2.23), (6.665, 1.57), (9.02, 2.03), (12.355, 1.68), (16.19, 2.14), (20.845, 2.04), (24.13, 2.34), (27.53, 1.35))],
        'die2': [(12, t - 0.03, t + d + 0.15) for t, d in ((0.045, 0.36), (1.235, 0.56), (4.28, 0.41), (5.7, 1.88), (8.075, 1.02), (9.81, 0.34), (11.13, 0.42))]},
}
table = {}
for g, clips in G.items():
  parts, at = [np.zeros(int(0.05 * SR), np.float32)], 0.05; lead = None
  for name, L in clips.items():
    table[name] = [g, []]
    for c in L:
      i, a, b = c[:3]; x = cut(i, a, b, *(c[3:5] if len(c) > 3 else ()), tail=c[5] if len(c) > 5 else None)
      x *= 0.89 / max(1e-6, np.abs(x).max()) if name.startswith(('m4_fire', 'g17_fire', 'm107_fire', 'sg_fire')) else 1
      table[name][1].append([round(at, 4), round(len(x) / SR, 4), round(hit(x), 4)])
      parts.append(x); parts.append(np.zeros(int(0.15 * SR), np.float32)); at += len(x) / SR + 0.15
  y = np.concatenate(parts); lead = float(np.argmax(np.abs(y) > 0.004) / SR)
  W.write(f'/tmp/sfx/{g}.wav', SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
  subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'/tmp/sfx/{g}.wav', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '112k', f'/home/claude/breach/public/sfx/{g}.mp3'], check=True)
  table['_' + g] = lead
# the street: 70 s, its end crossfaded into its start so it loops without a seam
a = W.read('/tmp/sfx/src/13.wav')[1].astype(np.float32) / 32768
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', '/mnt/user-data/uploads/87e3734c-ES_Ambience_Suburban_Neighborhood_Evening_Residential_Street_Summer_Texas_USA_-_Epidemic_Sound.mp3', '-ss', '10', '-t', '74', '-ar', '44100', '/tmp/sfx/amb_st.wav'], check=True)
sr, s = W.read('/tmp/sfx/amb_st.wav'); s = s.astype(np.float32) / 32768; X = 4 * SR; body = s[:-X].copy(); tl = s[-X:]
r = np.linspace(0, 1, X)[:, None]; body[:X] = body[:X] * np.sqrt(r) + tl * np.sqrt(1 - r)
W.write('/tmp/sfx/amb.wav', SR, (np.clip(body, -1, 1) * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', '/tmp/sfx/amb.wav', '-c:a', 'libmp3lame', '-b:a', '96k', '/home/claude/breach/public/sfx/amb.mp3'], check=True)
js = '// the clip table for public/sfx/*.mp3 (made by tools/sfx-build.py from the recordings): per clip [offset s, length s, hit s], hit =\n// where its first strong transient is, so a sound is started that much early to land on the frame its animation does;\n// _group = where the first sound starts in that file (to correct for the decoder\'s start-up delay)\n'
js += 'const SFX_CLIPS = ' + json.dumps(table, separators=(',', ':')) + ';\n'
open('/home/claude/breach/src/client/js/10b-sfx-data.js', 'w').write(js)
print(len(table))
