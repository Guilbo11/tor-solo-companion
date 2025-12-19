export type Axial = { q: number; r: number };
export type Point = { x: number; y: number };

export function axialKey(a: Axial): string {
  return `q:${a.q},r:${a.r}`;
}

export function keyToAxial(key: string): Axial | null {
  const m = key.match(/q:(-?\d+),r:(-?\d+)/);
  if (!m) return null;
  return { q: parseInt(m[1], 10), r: parseInt(m[2], 10) };
}

// Pointy-top axial coords conversion (redblobgames style)
export function axialToPixel(a: Axial, size: number, origin: Point): Point {
  const x = size * (Math.sqrt(3) * a.q + (Math.sqrt(3)/2) * a.r) + origin.x;
  const y = size * ((3/2) * a.r) + origin.y;
  return { x, y };
}

export function pixelToAxial(p: Point, size: number, origin: Point): Axial {
  const px = (p.x - origin.x) / size;
  const py = (p.y - origin.y) / size;
  const q = (Math.sqrt(3)/3) * px - (1/3) * py;
  const r = (2/3) * py;
  return hexRound({ q, r });
}

function hexRound(frac: { q: number; r: number }): Axial {
  let x = frac.q;
  let z = frac.r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

export function hexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return corners;
}
