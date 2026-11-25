// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { V3, camera } from './00-setup.js';
import { SFX_CLIPS } from './10b-sfx-data.js';
import { sfxHas, sfxPlay } from './10c-sfx.js';
import { pick } from './15-destruction.js';
import { S } from './17-dummies.js';
import { net } from './19-network.js';
import { AIS } from './32-ai.js';
// ---- end module links ----
// ---------------------------------------------------------------- the bots talk
// Recorded call-outs (public/sfx/voice.mp3): each bot has its own reload call for the whole match (one of four voices, by its
// player id); the rest are shared lines. The bots run on the host (or offline on this machine), so whoever runs them decides
// when a line is said, plays it at the bot and, online, tells everyone else to play it at that bot too.
// Lines: reloading; the round starting (defenders steady each other, attackers roll out); moving up; covering a reloading
// mate; taking fire; a kill (whispered from a hold, called out loud in a fight); a team-mate going down; the round won.
const VO = { last: new Map(), any: 0 };
const VO_CD = { vo_reload: 6, vo_start: 30, vo_rollout: 30, vo_win: 30, vo_moveup: 22, vo_cover: 18, vo_fire: 14, vo_kill: 6, vo_killq: 6, vo_mandown: 10 };
const voVoice = pid => ((pid | 0) % 4 + 4) % 4;
// play it (here) at a position; i is the variant (the reload call: the bot's own voice)
function voPlay(k, pos, i) {
  if (!pos || !sfxHas(k)) return;
  const d = camera.position.distanceTo(pos); if (d > 60) return;
  sfxPlay(k, { pos, dist: d, kind: 'shot', vol: 0.95, i });
}
// a bot says something: b is an AIBot (or anything with pid and pos). Each bot keeps its own gaps between lines, and two bots
// don't talk over each other within half a second
function aiSay(b, k) {
  if (!b || b.dead || b.out || !b.pos || !sfxHas(k)) return false;
  const now = performance.now() / 1000, key = (b.pid || 0) + ':' + k, cd = VO_CD[k] || 8;
  if (now - (VO.last.get(key) || -1e9) < cd || now - VO.any < 0.5) return false;
  if (now - (VO.last.get((b.pid || 0) + ':*') || -1e9) < 2.2) return false;
  VO.last.set(key, now); VO.last.set((b.pid || 0) + ':*', now); VO.any = now;
  const n = SFX_CLIPS[k][1].length, i = k === 'vo_reload' ? voVoice(b.pid) % n : Math.floor(Math.random() * n);
  voPlay(k, b.pos.clone().add(new V3(0, 1.55, 0)), i);
  if (S.mode === 'online' && net.mode === 'host' && net.host) net.host.broadcast({ t: 'vo', id: b.pid, k, i });
  return true;
}
// the host's word that a bot said something: played at that player as this machine sees them
function voRx(m) {
  if (typeof m.k !== 'string' || !SFX_CLIPS[m.k] || !m.k.startsWith('vo_')) return;
  const r = S.remotes && S.remotes.get(m.id); if (!r || !r.hum) return;
  voPlay(m.k, r.hum.root.getWorldPosition(new V3()).add(new V3(0, 1.55, 0)), m.i | 0);
}
const aiOf = pid => AIS.find(b => b.pid === pid && !b.dead && !b.out);
// someone died (on the host, or offline): the bot that did it calls it, a bot near the one who fell calls him down
function voDeath(victimPid, killerPid, victimPos, victimTeam) {
  const K = killerPid ? aiOf(killerPid) : null;
  if (K) setTimeout(() => { const quiet = K.state === 'camp' || K.state === 'idle' || K.state === 'patrol'; aiSay(K, quiet ? 'vo_killq' : 'vo_kill'); }, 450 + Math.random() * 500);
  if (!victimPos) return;
  const mates = AIS.filter(b => !b.dead && !b.out && b.pid !== victimPid && b.pos.distanceTo(victimPos) < 25 && (victimTeam === undefined || !b.hostP || b.hostP.team === victimTeam));
  if (mates.length) { const m = mates[Math.floor(Math.random() * mates.length)]; setTimeout(() => aiSay(m, 'vo_mandown'), 900 + Math.random() * 700); }
}
// the round: at the go, one bot on each side says something
function voRoundGo(H) {
  if (!H) return;
  const pick = t => { const L = AIS.filter(b => !b.dead && !b.out && b.hostP && b.hostP.team === t); return L[Math.floor(Math.random() * L.length)]; };
  const d = pick('b'), a = pick('r');
  if (d) setTimeout(() => aiSay(d, 'vo_start'), 600 + Math.random() * 1500);
  if (a) setTimeout(() => aiSay(a, 'vo_rollout'), 4800 + Math.random() * 600);
}
function voRoundWon(win) {
  const L = AIS.filter(b => !b.dead && !b.out && b.hostP && b.hostP.team === win);
  if (L.length) setTimeout(() => aiSay(L[Math.floor(Math.random() * L.length)], 'vo_win'), 1200);
}

// ---- module exports: build.mjs strips this block ----
export { aiSay, voDeath, voRoundGo, voRoundWon, voRx };
// ---- end module exports ----
