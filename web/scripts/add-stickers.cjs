const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------- GLB helpers ----------
function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not glb: ' + file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const length = dv.getUint32(8, true);
  let off = 12;
  const chunks = [];
  while (off < length) {
    const clen = dv.getUint32(off, true);
    const ctype = dv.getUint32(off + 4, true);
    chunks.push({ type: ctype, data: buf.subarray(off + 8, off + 8 + clen) });
    off += 8 + clen;
  }
  const jsonChunk = chunks.find((c) => c.type === 0x4e4f534a);
  const binChunk = chunks.find((c) => c.type === 0x004e4942);
  return {
    json: JSON.parse(jsonChunk.data.toString('utf8')),
    bin: binChunk ? Buffer.from(binChunk.data) : Buffer.alloc(0),
  };
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

function appendChunk(binParts, data) {
  const start = binParts.reduce((a, b) => a + b.length, 0);
  const pad = (4 - (data.length % 4)) % 4;
  binParts.push(data);
  if (pad) binParts.push(Buffer.alloc(pad));
  return start;
}

function eulerToQuat(e) {
  const [ex, ey, ez] = e.map((v) => (v * Math.PI) / 180);
  const cx = Math.cos(ex / 2), sx = Math.sin(ex / 2);
  const cy = Math.cos(ey / 2), sy = Math.sin(ey / 2);
  const cz = Math.cos(ez / 2), sz = Math.sin(ez / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

// ---------- main ----------
const root = path.join(__dirname, '..'); // web/
const scriptsDir = __dirname;
const modelsDir = path.join(root, 'public', 'models');
const stickersDir = path.join(root, 'stickers');
const glbFile = path.join(modelsDir, 'liwei.rigged.glb');

// 1) regenerate clean base (idempotent: stickers never survive a rebuild)
console.log('>> rebuilding clean base...');
execFileSync(process.execPath, [path.join(scriptsDir, 'rebuild-rigged-glb.cjs')], { cwd: path.join(root, '..'), stdio: 'inherit' });

// 2) load clean base
const { json, bin } = readGLB(glbFile);
const out = json;
const binParts = [bin];

// 3) collect stickers
if (!fs.existsSync(stickersDir)) fs.mkdirSync(stickersDir, { recursive: true });
const files = fs.readdirSync(stickersDir)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort();

let cfg = { stickers: {} };
const cfgFile = path.join(stickersDir, 'stickers.json');
if (fs.existsSync(cfgFile)) {
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (e) { console.warn('warning: stickers.json parse failed:', e.message); }
}

if (files.length === 0) {
  console.log('no sticker files found in', stickersDir, '- GLB stays clean');
  writeGLB(glbFile, out, Buffer.concat(binParts));
  console.log('WROTE', glbFile);
  process.exit(0);
}

if (!out.samplers || out.samplers.length === 0) out.samplers = [];
let samplerIdx = out.samplers.findIndex((s) => s && s.magFilter === 9729 && s.minFilter === 9987);
if (samplerIdx < 0) { out.samplers.push({ magFilter: 9729, minFilter: 9987 }); samplerIdx = out.samplers.length - 1; }

const manIdx = out.nodes.findIndex((n) => n.name === 'man');
if (manIdx < 0) throw new Error('man node not found');

let stickerIndex = 0;
for (const f of files) {
  const base = path.parse(f).name;
  const conf = (cfg.stickers || {})[f] || (cfg.stickers || {})[base] || {};

  const pos = conf.position || cfg.defaults?.position || [0, 0.6, 0.27];
  const quat = conf.rotation
    ? (conf.rotation.length === 4 ? conf.rotation : eulerToQuat(conf.rotation))
    : [0, 0, 0, 1];
  const s = conf.scale !== undefined ? conf.scale : (cfg.defaults?.scale !== undefined ? cfg.defaults.scale : 0.12);
  const scale = Array.isArray(s) ? s : [s, s, s];

  const imgBytes = fs.readFileSync(path.join(stickersDir, f));
  const mime = /\.png$/i.test(f) ? 'image/png' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : 'image/webp';
  const imgStart = appendChunk(binParts, imgBytes);

  const positions = new Float32Array([-0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0]);
  const normals = new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]);
  const uvs = new Float32Array([0,0, 1,0, 1,1, 0,1]);
  const indices = new Uint16Array([0,1,2, 0,2,3]);

  const posStart = appendChunk(binParts, Buffer.from(positions.buffer));
  const nrmStart = appendChunk(binParts, Buffer.from(normals.buffer));
  const uvStart = appendChunk(binParts, Buffer.from(uvs.buffer));
  const idxStart = appendChunk(binParts, Buffer.from(indices.buffer));

  const imgBV = out.bufferViews.push({ buffer: 0, byteOffset: imgStart, byteLength: imgBytes.length }) - 1;
  const posBV = out.bufferViews.push({ buffer: 0, byteOffset: posStart, byteLength: positions.byteLength }) - 1;
  const nrmBV = out.bufferViews.push({ buffer: 0, byteOffset: nrmStart, byteLength: normals.byteLength }) - 1;
  const uvBV = out.bufferViews.push({ buffer: 0, byteOffset: uvStart, byteLength: uvs.byteLength }) - 1;
  const idxBV = out.bufferViews.push({ buffer: 0, byteOffset: idxStart, byteLength: indices.byteLength }) - 1;

  const posAcc = out.accessors.push({ bufferView: posBV, byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5,-0.5,0], max: [0.5,0.5,0] }) - 1;
  const nrmAcc = out.accessors.push({ bufferView: nrmBV, byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3' }) - 1;
  const uvAcc = out.accessors.push({ bufferView: uvBV, byteOffset: 0, componentType: 5126, count: 4, type: 'VEC2', min: [0,0], max: [1,1] }) - 1;
  const idxAcc = out.accessors.push({ bufferView: idxBV, byteOffset: 0, componentType: 5123, count: 6, type: 'SCALAR', min: [0], max: [3] }) - 1;

  const imgIdx = out.images.push({ name: base, mimeType: mime, bufferView: imgBV }) - 1;
  const texIdx = out.textures.push({ sampler: samplerIdx, source: imgIdx }) - 1;
  const matIdx = out.materials.push({
    name: base, alphaMode: 'BLEND', doubleSided: true,
    pbrMetallicRoughness: { baseColorTexture: { index: texIdx }, metallicFactor: 0, roughnessFactor: 1 },
  }) - 1;
  const meshIdx = out.meshes.push({
    name: base,
    primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc }, indices: idxAcc, material: matIdx }],
  }) - 1;

  const nodeIdx = out.nodes.push({
    name: 'sticker' + stickerIndex, mesh: meshIdx,
    translation: pos, rotation: quat, scale: scale,
  }) - 1;
  out.nodes[manIdx].children.push(nodeIdx);

  console.log('  + ' + f + ' -> node sticker' + stickerIndex + ' @ (' + pos.map((v) => +v.toFixed(3)).join(', ') + ') scale ' + scale[0]);
  stickerIndex++;
}

out.buffers[0].byteLength = binParts.reduce((a, b) => a + b.length, 0);
const total = writeGLB(glbFile, out, Buffer.concat(binParts));
console.log('WROTE', glbFile, total, 'bytes');
console.log('nodes:', out.nodes.length, '| meshes:', out.meshes.length, '| materials:', out.materials.length, '| textures:', out.textures.length, '| images:', out.images.length);
console.log('man children:', JSON.stringify(out.nodes[manIdx].children));
