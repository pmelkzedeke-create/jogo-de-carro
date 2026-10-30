/**
 * Miniatura SVG do traçado, gerada a partir da geometria real da pista.
 */
import { buildTrack } from '../../tracks/TrackBuilder';
import { getTrackDefinition } from '../../tracks/TrackCatalog';

const cache = new Map<string, { path: string; length: number; closed: boolean }>();

export function trackOutline(trackId: string): { path: string; length: number; closed: boolean } {
  let entry = cache.get(trackId);
  if (!entry) {
    const track = buildTrack(getTrackDefinition(trackId));
    const S = track.samples;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < S.count; i++) {
      minX = Math.min(minX, S.px[i]);
      maxX = Math.max(maxX, S.px[i]);
      minZ = Math.min(minZ, S.pz[i]);
      maxZ = Math.max(maxZ, S.pz[i]);
    }
    const size = Math.max(maxX - minX, maxZ - minZ);
    const ox = (minX + maxX) / 2 - size / 2;
    const oz = (minZ + maxZ) / 2 - size / 2;
    const parts: string[] = [];
    for (let i = 0; i < S.count; i += 8) {
      parts.push(`${i === 0 ? 'M' : 'L'}${(((S.px[i] - ox) / size) * 92 + 4).toFixed(1)} ${(((S.pz[i] - oz) / size) * 92 + 4).toFixed(1)}`);
    }
    if (track.closed) parts.push('Z');
    entry = { path: parts.join(' '), length: track.raceLength, closed: track.closed };
    cache.set(trackId, entry);
  }
  return entry;
}

export function TrackThumb(props: { trackId: string; className?: string }) {
  const { path } = trackOutline(props.trackId);
  return (
    <svg className={props.className ?? 'track-thumb'} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
