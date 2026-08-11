#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plan A: bake stickers into the skin (baseColor) texture of liwei.rigged.glb.

Workflow (idempotent):
  1. regenerate the clean base GLB (node rebuild-rigged-glb.cjs)
  2. read mesh POSITION/TEXCOORD_0/NORMAL/index
  3. for each sticker in web/stickers/stickers.json:
       - build the sticker quad frame in man-local space from position/rotation/scale
       - find candidate triangles near the sticker center
       - for each covered texture pixel (uv-space rasterization with 2x2 supersampling):
           interpolate 3D point + surface normal, project along the surface normal
           onto the sticker plane, map to sticker image coords, alpha-blend
  4. write new baseColor (JPEG or PNG, whichever is smaller) appended to the GLB BIN
     and update images[0].bufferView + buffers[0].byteLength

Only images[0] (baseColor) is modified; roughness/normal maps are untouched, so the
sticker inherits the skin's lighting/normal shading (the "grows on skin" effect).
"""
import json
import math
import os
import struct
import subprocess
import sys

import numpy as np
from PIL import Image

# StickerPlanes.tsx adds the sticker plane as a child of the `man` node with
# mesh.scale = cfg.scale, so its half-extent is scale/2 in man-local units.
# (The app's <group scale={2.25}> only scales world rendering, not man-local size.)
WORLD_SCALE = 1.0
# Surface points farther than this (GLB units) along the sticker normal are not
# painted (keeps the decal local; excludes the far side of the head).
DMAX = 0.06
# Sticker plane sits this far above the skin (matches StickerPlanes PLACE_OFFSET).
PLACE_OFFSET = 0.012
# Max ray length for the surface-normal -> sticker-plane projection.
TMAX = 0.15
SS = 2  # supersampling factor per pixel (SS x SS)


def read_glb(path):
    with open(path, 'rb') as f:
        buf = f.read()
    assert buf[:4] == b'glTF', 'not a glb: ' + path
    version, length = struct.unpack_from('<II', buf, 4)
    off = 12
    chunks = []
    while off < length:
        clen, ctype = struct.unpack_from('<II', buf, off)
        chunks.append({'type': ctype, 'data': buf[off + 8: off + 8 + clen]})
        off += 8 + clen
    json_chunk = next(c for c in chunks if c['type'] == 0x4E4F534A)
    bin_chunk = next((c for c in chunks if c['type'] == 0x004E4942), None)
    return json.loads(json_chunk['data'].decode('utf-8')), (bin_chunk['data'] if bin_chunk else b'')


def write_glb(path, gltf, bin_data):
    json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    json_pad = (4 - len(json_bytes) % 4) % 4
    bin_pad = (4 - len(bin_data) % 4) % 4
    total = 12 + 8 + len(json_bytes) + json_pad + 8 + len(bin_data) + bin_pad
    out = bytearray(total)
    out[0:4] = b'glTF'
    struct.pack_into('<II', out, 4, 2, total)
    o = 12
    struct.pack_into('<II', out, o, len(json_bytes) + json_pad, 0x4E4F534A); o += 8
    out[o:o + len(json_bytes)] = json_bytes; o += len(json_bytes)
    out[o:o + json_pad] = b' ' * json_pad; o += json_pad
    struct.pack_into('<II', out, o, len(bin_data) + bin_pad, 0x004E4942); o += 8
    out[o:o + len(bin_data)] = bin_data; o += len(bin_data)
    out[o:o + bin_pad] = b'\x00' * bin_pad
    with open(path, 'wb') as f:
        f.write(bytes(out))
    return total


def read_accessor(gltf, bin_data, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    bo = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    ct = acc['componentType']
    dtype = {5120: '<i1', 5121: '<u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[ct]
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    arr = np.frombuffer(bin_data, dtype=dtype, count=acc['count'] * comps, offset=bo)
    return arr.reshape(acc['count'], comps).astype(np.float64)


def quat_mul(a, b):
    aw, ax, ay, az = a[3], a[0], a[1], a[2]
    bw, bx, by, bz = b[3], b[0], b[1], b[2]
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def quat_rotate(q, v):
    x, y, z, w = q
    qv = np.array([x, y, z])
    t = 2.0 * np.cross(qv, v)
    return v + w * t + np.cross(qv, t)


def euler_to_quat(e):
    ex, ey, ez = np.radians(np.asarray(e, dtype=np.float64))
    cx, sx = math.cos(ex / 2), math.sin(ex / 2)
    cy, sy = math.cos(ey / 2), math.sin(ey / 2)
    cz, sz = math.cos(ez / 2), math.sin(ez / 2)
    return np.array([
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ])


def sticker_frame(cfg, aspect=1.0):
    """Return (C, R, U, N, hw, hh) in man-local (GLB) units.
    hw/hh are half-extents along the sticker's R/U axes. cfg['scale'] is the
    length of the LONGEST edge (matches StickerPlanes.tsx), so a non-square
    image keeps its original aspect ratio instead of being forced to 1:1."""
    pos = np.array(cfg.get('position') or [0, 0.6, 0.27], dtype=np.float64)
    rot = cfg.get('rotation')
    if rot is None:
        q = np.array([0.0, 0.0, 0.0, 1.0])
    elif len(rot) == 4:
        q = np.array([rot[0], rot[1], rot[2], rot[3]], dtype=np.float64)
        n = np.linalg.norm(q)
        if n < 1e-9:
            q = np.array([0.0, 0.0, 0.0, 1.0])
        else:
            q = q / n
    else:
        q = euler_to_quat(rot[:3])
    s = float(cfg.get('scale') if not isinstance(cfg.get('scale'), (list, tuple)) else cfg['scale'][0] if cfg.get('scale') else 0.14)
    if s is None or not math.isfinite(s):
        s = 0.14
    R = quat_rotate(q, np.array([1.0, 0.0, 0.0]))
    U = quat_rotate(q, np.array([0.0, 1.0, 0.0]))
    N = quat_rotate(q, np.array([0.0, 0.0, 1.0]))
    n_len = np.linalg.norm(N)
    if n_len < 1e-9:
        N = np.array([0.0, 0.0, 1.0])
    else:
        N = N / n_len
    m = max(float(aspect), 1.0)
    hw = (s / m) / 2.0 * WORLD_SCALE
    hh = (s * aspect / m) / 2.0 * WORLD_SCALE
    return pos, R, U, N, hw, hh


def bake_sticker(gltf, bin_data, pos_man, nrm_man, uv, tri_idx, cfg, sticker_img, W, H, out_rgb, out_alpha, out_src):
    """
    Rasterize one sticker into per-pixel contribution buffers.
    out_rgb/out_alpha/out_src are lists parallel arrays: for each covered pixel we
    accumulate (px, py, r, g, b, a) so overlapping contributions can be composited once.
    """
    sw, sh = sticker_img.size
    aspect = (sh / float(sw)) if sw else 1.0
    C, R, U, N, hw, hh = sticker_frame(cfg, aspect)
    # ---- candidate triangles: centers near C ----
    tri_pos = pos_man[tri_idx]
    centers = tri_pos.mean(axis=1)
    dist = np.linalg.norm(centers - C, axis=1)
    radius = math.sqrt(hw * hw + hh * hh + DMAX * DMAX) + 0.08
    cand = np.where(dist < radius)[0]
    if len(cand) == 0:
        return
    tpos = tri_pos[cand] - C
    a = tpos @ R
    b = tpos @ U
    d = tpos @ N
    eps = 0.03
    keep = cand[
        (np.abs(a) <= hw + eps).any(axis=1)
        & (np.abs(b) <= hh + eps).any(axis=1)
        & (np.abs(d) <= DMAX + eps).any(axis=1)
    ]
    if len(keep) == 0:
        return

    uvA = uv[tri_idx[keep]]          # (K,3,2)
    umin = uvA[:, :, 0].min(axis=1)
    umax = uvA[:, :, 0].max(axis=1)
    vmin = uvA[:, :, 1].min(axis=1)
    vmax = uvA[:, :, 1].max(axis=1)

    spx = np.asarray(sticker_img.convert('RGBA'), dtype=np.float64)  # (sh, sw, 4)

    offs = (np.arange(SS, dtype=np.float64) + 0.5) / SS  # sub-pixel offsets in [0,1)

    for k in range(len(keep)):
        t = tri_idx[keep[k]]
        P0, P1, P2 = pos_man[t[0]], pos_man[t[1]], pos_man[t[2]]
        N0, N1, N2 = nrm_man[t[0]], nrm_man[t[1]], nrm_man[t[2]]
        UV0, UV1, UV2 = uvA[k]
        # pixel bbox
        u0 = max(0.0, umin[k]); u1 = min(1.0, umax[k])
        v0 = max(0.0, vmin[k]); v1 = min(1.0, vmax[k])
        px0 = int(math.floor(u0 * W)); px1 = int(math.ceil(u1 * W))
        py0 = int(math.floor(v0 * H)); py1 = int(math.ceil(v1 * H))
        if px1 <= px0 or py1 <= py0:
            continue
        # triangle edge functions in UV space
        e0 = np.array([UV1[0] - UV0[0], UV1[1] - UV0[1]])
        e1 = np.array([UV2[0] - UV0[0], UV2[1] - UV0[1]])
        denom = e0[0] * e1[1] - e0[1] * e1[0]
        if abs(denom) < 1e-12:
            continue
        for oy in offs:
            for ox in offs:
                # sample UV at pixel center (uv = pixel center / resolution)
                uu = (np.arange(px0, px1, dtype=np.float64) + ox) / W
                vv = (np.arange(py0, py1, dtype=np.float64) + oy) / H
                # barycentric over all pixels in bbox (vectorized)
                UU, VV = np.meshgrid(uu, vv, indexing='xy')
                UU = UU.ravel(); VV = VV.ravel()
                du = UU - UV0[0]
                dv = VV - UV0[1]
                w1 = (du * e1[1] - dv * e1[0]) / denom
                w2 = (e0[0] * dv - e0[1] * du) / denom
                w0 = 1.0 - w1 - w2
                inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
                if not inside.any():
                    continue
                # 3D point + normal
                P = (w0[:, None] * P0 + w1[:, None] * P1 + w2[:, None] * P2)[inside]
                Nn = (w0[:, None] * N0 + w1[:, None] * N1 + w2[:, None] * N2)[inside]
                nl = np.linalg.norm(Nn, axis=1)
                nl[nl < 1e-12] = 1.0
                Nn = Nn / nl[:, None]
                # project along surface normal onto sticker plane
                ndn = np.einsum('ij,j->i', Nn, N)
                ok = ndn > 1e-4
                if not ok.any():
                    continue
                Pc = P - C
                t_ray = -np.einsum('ij,j->i', Pc, N) / ndn
                ok &= (t_ray >= 0) & (t_ray <= TMAX)
                if not ok.any():
                    continue
                X = P[ok] + t_ray[ok, None] * Nn[ok]
                Xc = X - C
                aa = np.einsum('ij,j->i', Xc, R)
                bb = np.einsum('ij,j->i', Xc, U)
                dd = np.einsum('ij,j->i', Xc, N)
                inq = (np.abs(aa) <= hw) & (np.abs(bb) <= hh) & (np.abs(dd) <= DMAX)
                if not inq.any():
                    continue
                aa = aa[inq]; bb = bb[inq]; dd = dd[inq]
                # soft feather on the depth clip
                feat = 1.0
                if DMAX > 1e-6:
                    lo = DMAX * 0.7
                    feat = np.clip((DMAX - np.abs(dd)) / (DMAX - lo), 0.0, 1.0)
                sx = (aa / hw + 1.0) / 2.0
                sy = (1.0 - bb / hh) / 2.0
                # sticker image coords (bilinear)
                fx = np.clip(sx, 0.0, 1.0) * (sw - 1)
                fy = np.clip(sy, 0.0, 1.0) * (sh - 1)
                x0 = np.floor(fx).astype(np.int64)
                y0 = np.floor(fy).astype(np.int64)
                x1 = np.minimum(x0 + 1, sw - 1)
                y1 = np.minimum(y0 + 1, sh - 1)
                tx = fx - x0
                ty = fy - y0
                c00 = spx[y0, x0]
                c01 = spx[y0, x1]
                c10 = spx[y1, x0]
                c11 = spx[y1, x1]
                col = (c00 * (1 - tx)[:, None] + c01 * tx[:, None]) * (1 - ty)[:, None] \
                    + (c10 * (1 - tx)[:, None] + c11 * tx[:, None]) * ty[:, None]
                alpha = col[:, 3] / 255.0 * feat
                px = (UU[inside][ok][inq] * W).astype(np.int64)
                py = (VV[inside][ok][inq] * H).astype(np.int64)
                # clamp pixel indices
                px = np.clip(px, 0, W - 1)
                py = np.clip(py, 0, H - 1)
                mask = alpha > 0.003
                if not mask.any():
                    continue
                px = px[mask]; py = py[mask]
                alpha = alpha[mask]
                col = col[mask]
                out_rgb.append(col[:, :3])
                out_alpha.append(alpha)
                out_src.append(np.stack([px, py], axis=1))


def main():
    scripts = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(scripts, '..'))  # web/
    models = os.path.join(root, 'public', 'models')
    stickers_dir = os.path.join(root, 'stickers')
    glb_file = os.path.join(models, 'liwei.rigged.glb')

    node_exe = sys.argv[1] if len(sys.argv) > 1 else 'node'

    # 1) regenerate clean base (idempotent)
    print('>> regenerating clean base GLB...')
    subprocess.run([node_exe, os.path.join(scripts, 'rebuild-rigged-glb.cjs')],
                   cwd=os.path.join(root, '..'), check=True)

    # 2) load clean base
    gltf, bin_data = read_glb(glb_file)
    prim = gltf['meshes'][0]['primitives'][0]
    pos = read_accessor(gltf, bin_data, prim['attributes']['POSITION'])
    nrm = read_accessor(gltf, bin_data, prim['attributes']['NORMAL'])
    uv = read_accessor(gltf, bin_data, prim['attributes']['TEXCOORD_0'])
    idx = read_accessor(gltf, bin_data, prim['indices']).astype(np.int64)
    tri_idx = idx.reshape(-1, 3)

    # transform liwei-local -> man-local (walk node chain; here man -> liwei only)
    liwei_node = next(n for n in gltf['nodes'] if n.get('name') == 'liwei')
    man_node = next(n for n in gltf['nodes'] if n.get('name') == 'man')
    s_li = float(liwei_node.get('scale', [1, 1, 1])[0]) if 'scale' in liwei_node else 1.0
    t_li = np.array(liwei_node.get('translation', [0, 0, 0]), dtype=np.float64)
    q_li = np.array(liwei_node.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
    q_man = np.array(man_node.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
    q_total = quat_mul(q_man, q_li)
    pos_man = quat_rotate(q_total, pos * s_li) + t_li
    nrm_man = quat_rotate(q_total, nrm)

    # 3) load stickers config
    cfg_file = os.path.join(stickers_dir, 'stickers.json')
    stickers = {}
    if os.path.exists(cfg_file):
        try:
            stickers = json.load(open(cfg_file, 'r', encoding='utf-8')).get('stickers', {})
        except Exception as e:
            print('warning: stickers.json parse failed:', e)
    # only stickers whose image file exists
    files = sorted(k for k in stickers if os.path.exists(os.path.join(stickers_dir, k))
                   and re_image(k))
    print('stickers to bake:', files)

    # 4) read baseColor
    img0 = gltf['images'][0]
    bv0 = gltf['bufferViews'][img0['bufferView']]
    albedo_bytes = bin_data[bv0.get('byteOffset', 0): bv0.get('byteOffset', 0) + bv0['byteLength']]
    tmp = os.path.join(root, 'stickers', '_bake_albedo.png')
    with open(tmp, 'wb') as f:
        f.write(albedo_bytes)
    img = Image.open(tmp).convert('RGB')
    W, H = img.size
    base = np.asarray(img, dtype=np.float64)  # (H, W, 3)

    out_rgb, out_alpha, out_src = [], [], []
    for f in files:
        cfg = stickers[f]
        simg = Image.open(os.path.join(stickers_dir, f))
        print('  baking', f, '->', json.dumps(cfg))
        bake_sticker(gltf, bin_data, pos_man, nrm_man, uv, tri_idx, cfg, simg,
                     W, H, out_rgb, out_alpha, out_src)

    # 5) composite contributions
    if out_rgb:
        rgb = np.concatenate(out_rgb, axis=0)      # (M,3)
        alpha = np.concatenate(out_alpha, axis=0)  # (M,)
        src = np.concatenate(out_src, axis=0)      # (M,2) px,py
        key = src[:, 0] * H + src[:, 1]
        order = np.argsort(key, kind='stable')
        rgb = rgb[order]; alpha = alpha[order]; src = src[order]; key = key[order]
        n = len(key)
        # aggregate per pixel (same sticker contributions merge; different stickers
        # composited as one merged layer, acceptable for a few stickers)
        bounds = np.where(np.diff(key) != 0)[0] + 1
        starts = np.concatenate([[0], bounds])
        ends = np.concatenate([bounds, [n]])
        for s0, s1 in zip(starts, ends):
            if s1 - s0 == 0:
                continue
            px = int(src[s0, 0]); py = int(src[s0, 1])
            al = alpha[s0:s1]
            wsum = al.sum()
            if wsum <= 0:
                continue
            # normalized alpha (coverage) for the merged layer
            cov = min(1.0, wsum / (SS * SS))
            col = (rgb[s0:s1] * al[:, None]).sum(axis=0) / wsum
            b = base[py, px]
            base[py, px] = col * cov + b * (1.0 - cov)

    # 6) write new baseColor
    if not out_rgb:
        # 没有贴纸可烘焙时保留干净的 GLB，rebuild 不覆盖原始模型
        print('no stickers to bake; keeping clean base GLB')
        if os.path.exists(tmp):
            os.remove(tmp)
        return
    new_img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    png_buf = io_bytes()
    new_img.save(png_buf, 'PNG')
    jpg_buf = io_bytes()
    new_img.save(jpg_buf, 'JPEG', quality=95)
    png_bytes, jpg_bytes = png_buf.getvalue(), jpg_buf.getvalue()
    print('new baseColor: PNG', len(png_bytes), 'JPEG95', len(jpg_bytes))
    if len(png_bytes) < len(jpg_bytes):
        new_bytes, mime = png_bytes, 'image/png'
    else:
        new_bytes, mime = jpg_bytes, 'image/jpeg'

    # 7) append new image to BIN and update bufferView
    img_start = len(bin_data)
    bin_data = bin_data + new_bytes
    bv0['byteOffset'] = img_start
    bv0['byteLength'] = len(new_bytes)
    img0['mimeType'] = mime
    gltf['buffers'][0]['byteLength'] = len(bin_data)
    total = write_glb(glb_file, gltf, bin_data)
    print('WROTE', glb_file, total, 'bytes | baked', len(files), 'sticker(s)')

    # cleanup temp
    for p in [tmp]:
        if os.path.exists(p):
            os.remove(p)


def re_image(f):
    return f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))


def io_bytes():
    import io
    return io.BytesIO()


if __name__ == '__main__':
    main()