const fs = require('fs');
const path = require('path');

// ---------- GLB parsing ----------
function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not glb: ' + file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = dv.getUint32(4, true);
  const length = dv.getUint32(8, true);
  let off = 12;
  const chunks = [];
  while (off < length) {
    const clen = dv.getUint32(off, true);
    const ctype = dv.getUint32(off + 4, true);
    chunks.push({ type: ctype, data: buf.subarray(off + 8, off + 8 + clen) });
    off += 8 + clen;
  }
  const jsonChunk = chunks.find((c) => c.type === 0x4e4f534a); // JSON
  const binChunk = chunks.find((c) => c.type === 0x004e4942); // BIN
  const json = JSON.parse(jsonChunk.data.toString('utf8'));
  return { version, json, bin: binChunk ? binChunk.data : Buffer.alloc(0) };
}

function writeGLB(file, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length + binPad;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let o = 12;
  out.writeUInt32LE(jsonBuf.length + jsonPad, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;
  jsonBuf.copy(out, o); o += jsonBuf.length;
  out.fill(0x20, o, o + jsonPad); o += jsonPad;
  out.writeUInt32LE(bin.length + binPad, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  bin.copy(out, o); o += bin.length;
  out.fill(0, o, o + binPad);
  fs.writeFileSync(file, out);
  return total;
}

// ---------- main ----------
const modelsDir = path.join(__dirname, '..', 'public', 'models');
const meFile = path.join(modelsDir, 'me.glb');
const liFile = path.join(modelsDir, 'liwei.glb');
const outFile = path.join(modelsDir, 'liwei.rigged.glb');

const me = readGLB(meFile);
const li = readGLB(liFile);
const meJson = me.json;
const liJson = li.json;

// --- 1) which me nodes to keep: Camera, focus-*, man (drop eye1/eye2 + stickers + man body) ---
const keepMeNodes = [];
const oldToNewNode = new Map();
meJson.nodes.forEach((n, i) => {
  if (!n.name) return;
  const keep =
    n.name === 'Camera' || n.name === 'man' || /^focus-/.test(n.name) || n.name === 'focus-start';
  if (keep) {
    oldToNewNode.set(i, keepMeNodes.length);
    keepMeNodes.push(i);
  }
});
console.log('keep me nodes:', keepMeNodes.map((i) => meJson.nodes[i].name).join(', '));

// --- 2) target transform: scale liwei to match me body height, centered on man origin ---
const meBodyMesh = meJson.meshes.find((m) => m && m.name === 'Mesh_0.002') || meJson.meshes[17];
if (!meBodyMesh) throw new Error('me body mesh not found');
const meBodyPosAcc = meJson.accessors[meBodyMesh.primitives[0].attributes.POSITION];
const liPosAcc = liJson.accessors[0];
const meMin = meBodyPosAcc.min, meMax = meBodyPosAcc.max;
const liMin = liPosAcc.min, liMax = liPosAcc.max;
const meH = meMax[1] - meMin[1];
const liH = liMax[1] - liMin[1];
const s = meH / liH;
const meCenter = [0, 1, 2].map((_, i) => (meMin[i] + meMax[i]) / 2);
const liCenterScaled = [0, 1, 2].map((_, i) => ((liMin[i] + liMax[i]) / 2) * s);
const translation = [0, 1, 2].map((i) => +(meCenter[i] - liCenterScaled[i]).toFixed(6));
console.log('scale s =', s.toFixed(6), ' translation =', JSON.stringify(translation));

// --- 3) me accessors/bufferViews needed by the kept animations (CameraAction + manAction) ---
const keptMeAccSet = new Set();
for (const a of meJson.animations || []) {
  for (const smp of a.samplers || []) {
    keptMeAccSet.add(smp.input);
    keptMeAccSet.add(smp.output);
  }
}
const meAccKeep = [];
const meAccOldToNew = new Map();
meJson.accessors.forEach((acc, i) => {
  if (keptMeAccSet.has(i)) {
    meAccOldToNew.set(i, meAccKeep.length);
    meAccKeep.push(i);
  }
});
const meBVKeep = [];
const meBVOldToNew = new Map();
for (const ai of meAccKeep) {
  const bv = meJson.accessors[ai].bufferView;
  if (bv !== undefined && !meBVOldToNew.has(bv)) {
    meBVOldToNew.set(bv, meBVKeep.length);
    meBVKeep.push(bv);
  }
}
console.log('kept me accessors:', meAccKeep.length, 'kept me bufferViews:', meBVKeep.length);

// --- 4) build output json ---
const out = {
  asset: { version: '2.0', generator: 'sen-merge(me-rig-only + liwei-body)' },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [] }],
  cameras: (meJson.cameras || []).map((c) => JSON.parse(JSON.stringify(c))),
  nodes: [],
  buffers: [{ byteLength: me.bin.length + li.bin.length }],
  bufferViews: [],
  accessors: [],
};

// me kept bufferViews (buffer 0, original offsets)
for (const bvi of meBVKeep) {
  const bv = { ...meJson.bufferViews[bvi] };
  bv.buffer = 0;
  out.bufferViews.push(bv);
}
// me kept accessors (remap bufferView)
for (const ai of meAccKeep) {
  const a = { ...meJson.accessors[ai] };
  if (a.bufferView !== undefined) a.bufferView = meBVOldToNew.get(a.bufferView);
  out.accessors.push(a);
}
const meAccCount = out.accessors.length;
const meBVCount = out.bufferViews.length;

// li resources appended (buffer 0, offset += me.bin.length)
for (const bv of liJson.bufferViews || []) {
  out.bufferViews.push({ ...bv, buffer: 0, byteOffset: (bv.byteOffset || 0) + me.bin.length });
}
const liBVBase = meBVCount;
for (const a of liJson.accessors || []) {
  const na = { ...a };
  if (na.bufferView !== undefined) na.bufferView += liBVBase;
  out.accessors.push(na);
}
const liAccBase = meAccCount;

out.samplers = (liJson.samplers || []).map((x) => ({ ...x }));
out.images = (liJson.images || []).map((x) => {
  const im = { ...x };
  if (im.bufferView !== undefined) im.bufferView += liBVBase;
  return im;
});
out.textures = (liJson.textures || []).map((x) => ({ ...x }));
out.materials = (liJson.materials || []).map((x) => JSON.parse(JSON.stringify(x)));
out.meshes = (liJson.meshes || []).map((m) => {
  const nm = JSON.parse(JSON.stringify(m));
  nm.name = nm.name || 'liwei';
  for (const prim of nm.primitives || []) {
    const attrs = {};
    for (const [k, v] of Object.entries(prim.attributes || {})) attrs[k] = v + liAccBase;
    prim.attributes = attrs;
    if (prim.indices !== undefined) prim.indices += liAccBase;
  }
  return nm;
});

// me kept nodes (deep clone, drop mesh, remap children)
for (const oldIdx of keepMeNodes) {
  const n = JSON.parse(JSON.stringify(meJson.nodes[oldIdx]));
  if (n.mesh !== undefined) delete n.mesh; // man body removed
  if (n.children) {
    n.children = n.children.filter((c) => oldToNewNode.has(c)).map((c) => oldToNewNode.get(c));
  }
  out.nodes.push(n);
}

// liwei nodes appended
const liNodeBase = out.nodes.length;
const liOldToNew = new Map();
(liJson.nodes || []).forEach((_, i) => liOldToNew.set(i, liNodeBase + i));
for (const n of liJson.nodes || []) {
  const nn = JSON.parse(JSON.stringify(n));
  delete nn.matrix;
  nn.name = 'liwei';
  nn.translation = translation;
  nn.scale = [s, s, s];
  if (nn.children) nn.children = nn.children.map((c) => liOldToNew.get(c));
  out.nodes.push(nn);
}

// attach liwei root node(s) under man (so it moves with manAction)
const liRootNew = liNodeBase + ((liJson.scenes && liJson.scenes[liJson.scene ?? 0] && liJson.scenes[liJson.scene ?? 0].nodes[0]) || 0);
const manOutIdx = out.nodes.findIndex((n) => n.name === 'man');
if (manOutIdx < 0) throw new Error('man output node not found');
out.nodes[manOutIdx].children = out.nodes[manOutIdx].children || [];
out.nodes[manOutIdx].children.push(liRootNew);
console.log('liwei root attached under man as child index', liRootNew);

// scene: Camera + man
const camNew = oldToNewNode.get(meJson.nodes.findIndex((n) => n.name === 'Camera'));
const manNew = oldToNewNode.get(meJson.nodes.findIndex((n) => n.name === 'man'));
out.scenes[0].nodes = [camNew, manNew];

// animations: keep both, remap accessor refs + target node indices
out.animations = JSON.parse(JSON.stringify(meJson.animations || []));
for (const a of out.animations) {
  for (const smp of a.samplers || []) {
    smp.input = meAccOldToNew.get(smp.input);
    smp.output = meAccOldToNew.get(smp.output);
    if (smp.input === undefined || smp.output === undefined) throw new Error('animation acc remap failed');
  }
  for (const ch of a.channels || []) {
    if (ch.target && ch.target.node !== undefined) {
      const mapped = oldToNewNode.get(ch.target.node);
      if (mapped === undefined) throw new Error('animation target node dropped');
      ch.target.node = mapped;
    }
  }
}

const mergedBin = Buffer.concat([me.bin, li.bin]);
const total = writeGLB(outFile, out, mergedBin);
console.log('WROTE', outFile, total, 'bytes');
console.log('nodes:', out.nodes.length, JSON.stringify(out.nodes.map((n) => n.name)));
console.log('meshes:', out.meshes.length, out.meshes.map((m) => m.name));
console.log('materials:', out.materials.length, out.materials.map((m) => m.name));
console.log('textures:', out.textures.length, 'images:', out.images.length);
console.log('animations:', (out.animations || []).map((a) => a.name));
console.log('scene nodes:', JSON.stringify(out.scenes[0].nodes));
console.log('cameras:', out.cameras ? out.cameras.length : 0, out.cameras ? out.cameras.map((c) => c.name) : []);
