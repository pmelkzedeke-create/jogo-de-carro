import { describe, expect, it } from 'vitest';
import { buildTrack, minimumSectionSeparation } from '../../src/tracks/TrackBuilder';
import { TRACKS } from '../../src/tracks/TrackCatalog';

describe('TrackBuilder', () => {
  for (const def of TRACKS) {
    describe(def.name, () => {
      const track = buildTrack(def);

      it('gera geometria contínua com espaçamento uniforme e comprimento calculado', () => {
        const S = track.samples;
        expect(track.length).toBeGreaterThan(1200);
        for (let i = 1; i < S.count; i++) {
          const d = Math.hypot(S.px[i] - S.px[i - 1], S.py[i] - S.py[i - 1], S.pz[i] - S.pz[i - 1]);
          expect(d).toBeGreaterThan(0.5);
          expect(d).toBeLessThan(1.6);
        }
      });

      it('não possui torções: vetor "cima" sempre para cima e referenciais ortonormais', () => {
        const S = track.samples;
        for (let i = 0; i < S.count; i++) {
          expect(S.uy[i]).toBeGreaterThan(0.95);
          const dot = S.tx[i] * S.rx[i] + S.ty[i] * S.ry[i] + S.tz[i] * S.rz[i];
          expect(Math.abs(dot)).toBeLessThan(1e-3);
        }
      });

      it('trechos não adjacentes ficam separados (sem sobreposição/atalhos)', () => {
        expect(minimumSectionSeparation(track)).toBeGreaterThan(track.barrierOffset * 2 + 4);
      });

      it('possui curvas de raios diferentes e retas', () => {
        const S = track.samples;
        let straight = 0;
        let tight = 0;
        let medium = 0;
        for (let i = 0; i < S.count; i++) {
          const k = Math.abs(S.curvature[i]);
          if (k < 1 / 400) straight++;
          else if (k > 1 / 70) tight++;
          else if (k > 1 / 200) medium++;
        }
        expect(straight).toBeGreaterThan(100);
        expect(tight + medium).toBeGreaterThan(100);
        expect(1 / Math.max(...Array.from(S.curvature, Math.abs))).toBeGreaterThan(25);
      });

      it('portais orientados no sentido da corrida, incluindo largada/chegada', () => {
        expect(track.gates.length).toBe(def.checkpointCount);
        expect(track.gates[0].isStart).toBe(true);
        expect(track.gates.some((g) => g.isFinish)).toBe(true);
        for (let i = 1; i < track.gates.length; i++) {
          expect(track.gates[i].raceDistance).toBeGreaterThan(track.gates[i - 1].raceDistance);
        }
        for (const gate of track.gates) {
          expect(gate.halfWidth).toBeGreaterThan(track.barrierOffset);
          const proj = track.project(gate.position);
          expect(Math.abs(proj.lateral)).toBeLessThan(0.5);
        }
      });

      it('grid de largada atrás da linha, em reta, dentro do asfalto e sem sobreposição', () => {
        expect(track.grid.length).toBe(def.gridSlots);
        for (const slot of track.grid) {
          const proj = track.project(slot.position);
          expect(Math.abs(proj.lateral)).toBeLessThan(track.halfWidth - 1.2);
          const distanceToLine = track.closed ? track.length - track.raceDistance(proj.s) : -track.raceDistance(proj.s);
          expect(distanceToLine).toBeGreaterThan(5);
          expect(Math.abs(track.curvatureAt(slot.s))).toBeLessThan(1 / 150);
        }
        for (let a = 0; a < track.grid.length; a++) {
          for (let b = a + 1; b < track.grid.length; b++) {
            expect(track.grid[a].position.distanceTo(track.grid[b].position)).toBeGreaterThan(4.5);
          }
        }
      });

      it('barreiras cobrem os dois lados e nunca invadem a área de pilotagem', () => {
        const left = track.barriers.filter((b) => b.side === -1);
        const right = track.barriers.filter((b) => b.side === 1);
        expect(left.length).toBeGreaterThan(0);
        expect(right.length).toBeGreaterThan(0);
        for (const run of track.barriers) {
          if (run.side === 0) continue;
          for (const p of run.points) {
            const proj = track.project(p);
            expect(Math.abs(proj.lateral)).toBeGreaterThan(track.halfWidth + track.shoulderWidth + track.runoffWidth * 0.8);
          }
        }
      });

      it('projeção recupera distância e lateral de pontos conhecidos', () => {
        for (const s of [10, track.length * 0.25, track.length * 0.5, track.length * 0.8]) {
          const p = track.pointAt(s, 3.2);
          const proj = track.project(p);
          expect(proj.lateral).toBeCloseTo(3.2, 1);
          const ds = Math.abs(proj.s - s);
          expect(Math.min(ds, track.length - ds)).toBeLessThan(0.5);
          expect(proj.onRoad).toBe(true);
        }
      });
    });
  }
});
