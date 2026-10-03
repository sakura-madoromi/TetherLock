export const clamp = (value, min, max, fallback = min) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
export const defaults = {
  lid: 0, travel: 14, explode: 0, style: 'studio', opacity: 1, edges: false,
  grid: true, labels: false, reference: false, phone: true, card: true, includeReferences: false, clip: false, clipAxis: 'Z', clipValue: 32,
  clipReverse: false, hidden: [], selected: null, isolated: null, measure: false,
  projection: 'perspective', speed: 1, mode: 'studio', hiddenLines: false, loop: false,
};
export function controlPose(pose, key, value) {
  const next = { lid: clamp(pose.lid, 0, 105), travel: clamp(pose.travel, 0, 14) };
  if (key === 'lid') { next.lid = clamp(value, 0, 105); if (next.lid > 0) next.travel = 0; }
  if (key === 'travel') { next.travel = clamp(value, 0, 14); if (next.travel > 0) next.lid = 0; }
  return next;
}
const ease = (t) => { const p = clamp(t, 0, 1); return p * p * (3 - 2 * p); };
export function motionPose(progress, kind = 'cycle') {
  const p = clamp(progress, 0, 1);
  if (kind === 'open') return p <= 0.3 ? { lid: 0, travel: 14 * (1 - ease(p / 0.3)) } : { lid: 105 * ease((p - 0.3) / 0.7), travel: 0 };
  if (kind === 'close') return p <= 0.7 ? { lid: 105 * (1 - ease(p / 0.7)), travel: 0 } : { lid: 0, travel: 14 * ease((p - 0.7) / 0.3) };
  if (p < 0.22) return { lid: 0, travel: 14 * (1 - ease(p / 0.22)) };
  if (p < 0.48) return { lid: 105 * ease((p - 0.22) / 0.26), travel: 0 };
  if (p < 0.62) return { lid: 105, travel: 0 };
  if (p < 0.86) return { lid: 105 * (1 - ease((p - 0.62) / 0.24)), travel: 0 };
  return { lid: 0, travel: 14 * ease((p - 0.86) / 0.14) };
}
export function transformPoint(point, role, pose, offset = [0, 0, 0]) {
  let [x, y, z] = point;
  if (role === 'lid') {
    const a = pose.lid * Math.PI / 180, dy = y + 55, dz = z - 51;
    y = -55 + dy * Math.cos(a) - dz * Math.sin(a);
    z = 51 + dy * Math.sin(a) + dz * Math.cos(a);
  } else if (role === 'drive') y += pose.travel;
  return [x + offset[0] * pose.explode, y + offset[1] * pose.explode, z + offset[2] * pose.explode];
}
export function sanitizeSettings(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const result = { ...defaults };
  for (const [key, values] of Object.entries({ style: ['studio', 'technical', 'blueprint', 'xray'],
    clipAxis: ['X', 'Y', 'Z'], projection: ['perspective', 'orthographic'], mode: ['studio', 'drawing'] }))
    if (values.includes(input[key])) result[key] = input[key];
  for (const key of ['edges', 'grid', 'labels', 'reference', 'phone', 'card', 'includeReferences', 'clip', 'clipReverse', 'measure', 'hiddenLines', 'loop'])
    if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const [key, range] of Object.entries({ lid: [0, 105, 0], travel: [0, 14, 14], explode: [0, 1, 0],
    opacity: [0.08, 1, 1], clipValue: [-150, 200, 32], speed: [0.25, 2.5, 1] }))
    result[key] = input[key] === undefined ? defaults[key] : clamp(input[key], ...range);
  if (result.lid > 0) result.travel = 0;
  result.hidden = Array.isArray(input.hidden) ? [...new Set(input.hidden.filter(v => typeof v === 'string'))].slice(0, 100) : [];
  for (const key of ['selected', 'isolated']) if (typeof input[key] === 'string') result[key] = input[key].slice(0, 80);
  return result;
}

export function sanitizeCamera(input) {
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000);
  if(!input||!vector(input.position)||!vector(input.target))return null;
  const distance=Math.hypot(...input.position.map((n,i)=>n-input.target[i]));
  if(distance<.2||distance>10000)return null;
  const zoom=input.zoom??1,orthoHeight=input.orthoHeight??310;
  if(!Number.isFinite(zoom)||zoom<.02||zoom>100||!Number.isFinite(orthoHeight)||orthoHeight<1||orthoHeight>10000)return null;
  return {position:[...input.position],target:[...input.target],zoom,orthoHeight};
}
