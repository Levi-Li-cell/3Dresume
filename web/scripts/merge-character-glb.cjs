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
  const jsonChunk = chunks.find(c => c.type === 0x4e4f534a); // JSON
  const binChunk = chunks.find(c => c.type === 0x004e4942); // BIN
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
  out.fill(0x20, o, o + jsonPad); o += jsonPad; // pad spaces
  out.writeUInt32LE(bin.length + binPad, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  bin.copy(out, o); o += bin.length;
  out.fill(0, o, o + binPad); // pad zeros
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

// --- target transform: scale liwei to match me body height, center on man origin ---
const meBodyMesh = meJson.meshes.find(m => m && m.name === 'Mesh_0.002') || meJson.meshes[17];
const meBodyPosAcc = meJson.accessors[meBodyMesh.primitives[0].attributes.POSITION];
const liAcc = liJson.accessors[0];
console.log('me body POSITION acc min/max:', JSON.stringify(meBodyPosAcc.min), JSON.stringify(meBodyPosAcc.max));
console.log('li   body POSITION acc min/max:', JSON.stringify(liAcc.min), JSON.stringify(liAcc.max));

const meMin = meBodyPosAcc.min, meMax = meBodyPosAcc.max;
const liMin = liAcc.min, liMax = liAcc.max;
const meH = meMax[1] - meMin[1];
const liH = liMax[1] - liMin[1];
const s = meH / liH;
const meCenter = [0, 1, 2].map((_, i) => (meMin[i] + meMax[i]) / 2);
const liCenterScaled = [0, 1, 2].map((_, i) => ((liMin[i] + liMax[i]) / 2) * s);
const translation = [0, 1, 2].map(i => +(meCenter[i] - liCenterScaled[i]).toFixed(6));
console.log('scale s =', s.toFixed(6), ' translation =', JSON.stringify(translation));

// --- build merged json (start from a deep clone of me) ---
const out = JSON.parse(JSON.stringify(meJson));

const meBV = meJson.bufferViews || [];
const meAcc = meJson.accessors || [];
const meImg = meJson.images || [];
const meSam = meJson.samplers || [];
const meMat = meJson.materials || [];
const meMesh = meJson.meshes || [];
const meTex = meJson.textures || [];
const meNodes = meJson.nodes || [];

out.buffers = [{ byteLength: me.bin.length + li.bin.length }];

for (const bv of liJson.bufferViews || []) {
  out.bufferViews.push({ ...bv, buffer: 0, byteOffset: (bv.byteOffset || 0) + me.bin.length });
}
for (const a of liJson.accessors || []) {
  const na = { ...a };
  if (na.bufferView !== undefined) na.bufferView += meBV.length;
  out.accessors.push(na);
}
for (const s of liJson.samplers || []) out.samplers.push({ ...s });
for (const im of liJson.images || []) {
  const ni = { ...im };
  if (ni.bufferView !== undefined) ni.bufferView += meBV.length;
  out.images.push(ni);
}
for (const t of liJson.textures || []) {
  const nt = { ...t };
  if (nt.source !== undefined) nt.source += meImg.length;
  if (nt.sampler !== undefined) nt.sampler += meSam.length;
  out.textures.push(nt);
}
const remapTex = (texObj, texCount) => { if (texObj && texObj.index !== undefined) texObj.index += texCount; };
for (const m of liJson.materials || []) {
  const nm = JSON.parse(JSON.stringify(m));
  if (nm.pbrMetallicRoughness) {
    remapTex(nm.pbrMetallicRoughness.baseColorTexture, meTex.length);
    remapTex(nm.pbrMetallicRoughness.metallicRoughnessTexture, meTex.length);
    remapTex(nm.pbrMetallicRoughness.emissiveTexture, meTex.length);
    remapTex(nm.pbrMetallicRoughness.occlusionTexture, meTex.length);
  }
  remapTex(nm.normalTexture, meTex.length);
  remapTex(nm.emissiveTexture, meTex.length);
  out.materials.push(nm);
}
for (const mesh of liJson.meshes || []) {
  const nm = JSON.parse(JSON.stringify(mesh));
  nm.name = nm.name || 'liwei';
  for (const prim of nm.primitives || []) {
    const attrs = {};
    for (const [k, v] of Object.entries(prim.attributes || {})) attrs[k] = v + meAcc.length;
    prim.attributes = attrs;
    if (prim.indices !== undefined) prim.indices += meAcc.length;
    if (prim.material !== undefined) prim.material += meMat.length;
  }
  out.meshes.push(nm);
}
for (const node of liJson.nodes || []) {
  const nn = { ...node };
  delete nn.matrix; // use TRS
  if (nn.mesh !== undefined) nn.mesh += meMesh.length;
  nn.name = 'liwei';
  nn.translation = translation;
  nn.scale = [s, s, s];
  out.nodes.push(nn);
}
// attach liwei node under man, remove me body mesh from man
const manIdx = meNodes.findIndex(n => n.name === 'man');
if (manIdx < 0) throw new Error('man node not found');
const man = out.nodes[manIdx];
delete man.mesh;
man.children = man.children || [];
man.children.push(meNodes.length);

out.asset = out.asset || { version: '2.0' };
out.asset.generator = (out.asset.generator ? out.asset.generator + ' + ' : '') + 'sen-merge(me-rig+liwei-body)';

const mergedBin = Buffer.concat([me.bin, li.bin]);
const total = writeGLB(outFile, out, mergedBin);
console.log('WROTE', outFile, total, 'bytes');
console.log('bufferViews:', meBV.length, '->', out.bufferViews.length);
console.log('accessors:', meAcc.length, '->', out.accessors.length);
console.log('nodes:', meNodes.length, '->', out.nodes.length);
console.log('meshes:', meMesh.length, '->', out.meshes.length);
console.log('materials:', meMat.length, '->', out.materials.length);
console.log('textures:', meTex.length, '->', out.textures.length);
console.log('images:', meImg.length, '->', out.images.length);
console.log('animations:', (out.animations || []).map(a => a.name));
console.log('man node now:', JSON.stringify(out.nodes[manIdx]));
console.log('liwei node:', JSON.stringify(out.nodes[out.nodes.length - 1]));
