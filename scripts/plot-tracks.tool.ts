/**
 * Ferramenta de desenvolvimento: gera mapas SVG das pistas em /tmp/apex-plots
 * para inspeção visual do traçado, barreiras, portais e grid.
 * Uso: npx vitest run --config vitest.tools.config.ts scripts/plot-tracks.tool.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { buildTrack, minimumSectionSeparation } from '../src/tracks/TrackBuilder';
import { TRACKS } from '../src/tracks/TrackCatalog';

test('plot tracks', () => {
  const dir = process.env.PLOT_DIR ?? '/tmp/apex-plots';
  mkdirSync(dir, { recursive: true });
  for (const def of TRACKS) {
    const track = buildTrack(def);
    const S = track.samples;
    const b = track.bounds;
    const pad = 20;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxZ - b.minZ + pad * 2;
    const tx = (x: number) => (x - b.minX + pad).toFixed(1);
    const tz = (z: number) => (z - b.minZ + pad).toFixed(1);
    const parts: string[] = [];
    const road: string[] = [];
    for (let i = 0; i < S.count; i++) road.push(`${tx(S.px[i])},${tz(S.pz[i])}`);
    parts.push(`<polyline points="${road.join(' ')}${track.closed ? ` ${road[0]}` : ''}" fill="none" stroke="#444" stroke-width="${def.width}" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${road.join(' ')}" fill="none" stroke="#fff" stroke-width="0.6"/>`);
    for (const run of track.barriers) {
      const pts = run.points.map((p) => `${tx(p.x)},${tz(p.z)}`);
      if (run.closedLoop) pts.push(pts[0]);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${run.side > 0 ? '#e33' : '#33e'}" stroke-width="1.2"/>`);
    }
    for (const curb of track.curbs) {
      const a = track.sampleAt(curb.startS).position;
      const c = track.sampleAt(curb.endS).position;
      parts.push(`<circle cx="${tx(a.x)}" cy="${tz(a.z)}" r="2" fill="orange"/><circle cx="${tx(c.x)}" cy="${tz(c.z)}" r="2" fill="orange"/>`);
    }
    for (const gate of track.gates) {
      const l = gate.position.clone().addScaledVector(gate.right, -gate.halfWidth);
      const r = gate.position.clone().addScaledVector(gate.right, gate.halfWidth);
      parts.push(`<line x1="${tx(l.x)}" y1="${tz(l.z)}" x2="${tx(r.x)}" y2="${tz(r.z)}" stroke="${gate.isStart ? '#0f0' : gate.isFinish ? '#ff0' : '#0aa'}" stroke-width="${gate.isStart || gate.isFinish ? 3 : 1.5}"/>`);
      const n = gate.position.clone().addScaledVector(gate.normal, 12);
      parts.push(`<line x1="${tx(gate.position.x)}" y1="${tz(gate.position.z)}" x2="${tx(n.x)}" y2="${tz(n.z)}" stroke="#0f0" stroke-width="1"/>`);
    }
    for (const slot of track.grid) {
      parts.push(`<circle cx="${tx(slot.position.x)}" cy="${tz(slot.position.z)}" r="1.6" fill="#ff0"/>`);
    }
    const sep = minimumSectionSeparation(track);
    let maxK = 0;
    for (let i = 0; i < S.count; i++) maxK = Math.max(maxK, Math.abs(S.curvature[i]));
    const info = `${def.name} — ${track.length.toFixed(0)} m — corrida ${track.raceLength.toFixed(0)} m — raio mín ${(1 / maxK).toFixed(1)} m — separação mín ${sep.toFixed(1)} m (barreira ${track.barrierOffset.toFixed(1)})`;
    console.log(info);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * 1.2).toFixed(0)}" height="${(h * 1.2 + 30).toFixed(0)}" viewBox="0 -30 ${w.toFixed(0)} ${(h + 30).toFixed(0)}" style="background:#1d2b1d"><text x="5" y="-12" fill="#fff" font-size="12" font-family="sans-serif">${info}</text>${parts.join('')}</svg>`;
    writeFileSync(`${dir}/${def.id}.svg`, svg);
  }
});
