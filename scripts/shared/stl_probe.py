#!/usr/bin/env python3
"""Pure-Python STL helpers shared by the V3 export and verification scripts.

The project intentionally keeps this dependency-free so the geometry checks can
run with the Python standard library only.
"""
import math
import struct
from collections import defaultdict


def load_stl(path):
    with open(path, 'rb') as f:
        data = f.read()
    if data[:5] == b'solid' and b'facet' in data[:4096]:
        return load_ascii(data)
    return load_binary(data)


def load_binary(data):
    n = struct.unpack('<I', data[80:84])[0]
    tris = []
    off = 84
    for _ in range(n):
        vals = struct.unpack('<12f', data[off:off + 48])
        tris.append(((vals[3], vals[4], vals[5]),
                     (vals[6], vals[7], vals[8]),
                     (vals[9], vals[10], vals[11])))
        off += 50
    return tris


def load_ascii(data):
    tris = []
    cur = []
    for line in data.decode('utf-8', 'ignore').splitlines():
        line = line.strip()
        if line.startswith('vertex'):
            p = line.split()
            cur.append((float(p[1]), float(p[2]), float(p[3])))
            if len(cur) == 3:
                tris.append(tuple(cur))
                cur = []
    return tris


def bbox(tris):
    xs = [p[0] for t in tris for p in t]
    ys = [p[1] for t in tris for p in t]
    zs = [p[2] for t in tris for p in t]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def volume(tris):
    v = 0.0
    for a, b, c in tris:
        v += (a[0] * (b[1] * c[2] - b[2] * c[1])
              - a[1] * (b[0] * c[2] - b[2] * c[0])
              + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
    return v


def manifold_report(tris, q=1e-4):
    def key(p):
        return (round(p[0] / q), round(p[1] / q), round(p[2] / q))

    edges = defaultdict(int)
    for a, b, c in tris:
        ka, kb, kc = key(a), key(b), key(c)
        for e in ((ka, kb), (kb, kc), (kc, ka)):
            edges[tuple(sorted(e))] += 1
    boundary = sum(1 for v in edges.values() if v == 1)
    nonman = sum(1 for v in edges.values() if v > 2)
    degen = sum(1 for t in tris if key(t[0]) == key(t[1])
                or key(t[1]) == key(t[2]) or key(t[0]) == key(t[2]))
    return boundary, nonman, degen, len(edges), len(tris)


def zslices(tris, z):
    """Return (x, y) mesh intersection segments at height ``z``."""
    segs = []
    for a, b, c in tris:
        pts = []
        for p, q in ((a, b), (b, c), (c, a)):
            if (p[2] - z) * (q[2] - z) < 0:
                t = (z - p[2]) / (q[2] - p[2])
                pts.append((p[0] + t * (q[0] - p[0]),
                            p[1] + t * (q[1] - p[1])))
        if len(pts) == 2:
            segs.append(tuple(pts))
    return segs


def point_in_solid(tris, pt):
    """Classify a point with a +Z ray parity test."""
    zs = z_extent_at(tris, pt[0], pt[1])
    return sum(1 for z in zs if z > pt[2]) % 2 == 1


def z_extent_at(tris, x, y, n=400):
    """Return sorted +Z ray crossing heights at ``(x, y)``."""
    zs = []
    for a, b, c in tris:
        d = ((b[1] - c[1]) * (a[0] - c[0])
             + (c[0] - b[0]) * (a[1] - c[1]))
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (x - c[0])
              + (c[0] - b[0]) * (y - c[1])) / d
        l2 = ((c[1] - a[1]) * (x - c[0])
              + (a[0] - c[0]) * (y - c[1])) / d
        l3 = 1 - l1 - l2
        if l1 < -1e-9 or l2 < -1e-9 or l3 < -1e-9:
            continue
        zs.append(l1 * a[2] + l2 * b[2] + l3 * c[2])
    zs.sort()
    out = []
    for z in zs:
        if out and abs(z - out[-1]) < 1e-6:
            continue
        out.append(z)
    return out


if __name__ == '__main__':
    import sys

    for path in sys.argv[1:]:
        tris = load_stl(path)
        bx, by, bz = bbox(tris)
        boundary, nonman, degen, edges, triangles = manifold_report(tris)
        vol = volume(tris)
        print(f'== {path}')
        print(f'   tris={triangles} verts_edges={edges} bbox_degenerate={degen}')
        print(f'   X [{bx[0]:9.4f}, {bx[1]:9.4f}]  size {bx[1] - bx[0]:8.4f}')
        print(f'   Y [{by[0]:9.4f}, {by[1]:9.4f}]  size {by[1] - by[0]:8.4f}')
        print(f'   Z [{bz[0]:9.4f}, {bz[1]:9.4f}]  size {bz[1] - bz[0]:8.4f}')
        print(f'   signed volume = {vol:12.3f} mm^3   abs = {abs(vol):12.3f}')
        print('   boundary_edges={} nonmanifold_edges={}  -> {}'.format(
            boundary, nonman, 'WATERTIGHT' if boundary == 0 and nonman == 0
            else 'NOT watertight/manifold'))
