import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

/**
 * 开发期贴纸编辑器 API（仅在 vite dev server 生效）：
 *   GET    /api/stickers          -> { files, stickers }
 *   POST   /api/stickers          -> 保存 stickers.json
 *   DELETE /api/stickers?file=xx  -> 删除 web/stickers 下的贴纸文件 + 配置
 *   POST   /api/rebuild           -> 运行 scripts/bake-stickers-to-texture.py
 *                                     重新生成 liwei.rigged.glb（烘焙方案 A）
 *   GET    /api/rollback          -> 列出所有快照
 *   POST   /api/rollback?to=<id>  -> 回滚到快照（恢复 GLB + stickers.json）
 *   POST   /api/rollback?to=clean -> 恢复干净模型并清空贴纸配置（自动先存清理前快照）
 *   POST   /api/snapshot?label=xx -> 手动保存一份快照
 *
 * 快照机制：每次“生成 GLB”前自动保存当前 GLB + stickers.json 到
 * web/stickers/snapshots/<时间戳>/，回滚就是把快照里的文件还原回去。
 */
export default function stickerEditorApi() {
  const stickersDir = path.join(__dirname, '..', 'stickers');
  const cfgFile = path.join(stickersDir, 'stickers.json');
  const scriptsDir = path.join(__dirname);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const snapshotsDir = path.join(stickersDir, 'snapshots');
  const modelsDir = path.join(__dirname, '..', 'public', 'models');
  const modelSelectionFile = path.join(modelsDir, 'model-selection.json');
  const glbFile = path.join(modelsDir, 'liwei.rigged.glb');
  const cleanGlbFile = path.join(modelsDir, 'liwei.rigged.clean.glb');
  const directorDir = path.join(__dirname, '..', 'public', 'director');
  const directorFile = path.join(directorDir, 'camera-overrides.json');
  const profileDir = path.join(__dirname, '..', 'public', 'profile');
  const profileFile = path.join(profileDir, 'profile.json');
  const MAX_SNAPSHOTS = 12;

  const sendJson = (res, status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };
  const readCfg = () => {
    try {
      return JSON.parse(fs.readFileSync(cfgFile, 'utf8')).stickers || {};
    } catch {
      return {};
    }
  };
  const writeCfg = (stickers) => {
    fs.mkdirSync(stickersDir, { recursive: true });
    fs.writeFileSync(cfgFile, JSON.stringify({ stickers }, null, 2), 'utf8');
  };
  const listFiles = () =>
    fs.existsSync(stickersDir)
      ? fs
          .readdirSync(stickersDir)
          .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
          .sort()
      : [];

  // 当前模型是否烘焙过贴纸（烘焙会把新 baseColor 追加进 BIN，文件明显变大）
  const isBaked = () => {
    try {
      return fs.statSync(glbFile).size > fs.statSync(cleanGlbFile).size + 1024;
    } catch {
      return false;
    }
  };

  const pad = (n) => String(n).padStart(2, '0');

  // 保存一份快照：GLB + stickers.json + meta.json
  const createSnapshot = (label) => {
    try {
      fs.mkdirSync(snapshotsDir, { recursive: true });
      const now = new Date();
      const id =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-` +
        String(now.getMilliseconds()).padStart(3, '0');
      const dir = path.join(snapshotsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(cfgFile)) fs.copyFileSync(cfgFile, path.join(dir, 'stickers.json'));
      if (fs.existsSync(glbFile)) fs.copyFileSync(glbFile, path.join(dir, 'liwei.rigged.glb'));
      const stickers = readCfg();
      const meta = {
        id,
        time: now.toISOString(),
        label,
        stickerCount: Object.keys(stickers).length,
        baked: isBaked(),
        hasGlb: fs.existsSync(path.join(dir, 'liwei.rigged.glb')),
      };
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
      trimSnapshots();
      return meta;
    } catch (e) {
      console.error('[sticker-api] snapshot failed:', e);
      return null;
    }
  };

  const listSnapshotIds = () => {
    if (!fs.existsSync(snapshotsDir)) return [];
    return fs
      .readdirSync(snapshotsDir)
      .filter(
        (d) => /^[\w-]+$/.test(d) && fs.statSync(path.join(snapshotsDir, d)).isDirectory()
      )
      .sort();
  };

  // 只保留最近 MAX_SNAPSHOTS 份快照（按 id 字典序即时间序）
  const trimSnapshots = () => {
    try {
      const all = listSnapshotIds();
      for (let i = 0; i < all.length - MAX_SNAPSHOTS; i++) {
        const dir = path.join(snapshotsDir, all[i]);
        if (path.resolve(dir).startsWith(path.resolve(snapshotsDir))) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    } catch (e) {
      console.error('[sticker-api] trim snapshots failed:', e);
    }
  };

  const listSnapshots = () =>
    listSnapshotIds()
      .map((id) => {
        const dir = path.join(snapshotsDir, id);
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
          return { id, ...meta };
        } catch {
          let stickerCount = 0;
          try {
            const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'stickers.json'), 'utf8'));
            stickerCount = Object.keys(cfg.stickers || {}).length;
          } catch {}
          return {
            id,
            time: '',
            label: id,
            stickerCount,
            baked: false,
            hasGlb: fs.existsSync(path.join(dir, 'liwei.rigged.glb')),
          };
        }
      })
      .reverse(); // 新的在前

  // 安全校验快照 id（防路径穿越）
  const resolveSnapshotDir = (id) => {
    if (!/^[\w-]+$/.test(id)) return null;
    const dir = path.join(snapshotsDir, id);
    if (!path.resolve(dir).startsWith(path.resolve(snapshotsDir))) return null;
    if (!fs.existsSync(path.join(dir, 'meta.json'))) return null;
    return dir;
  };

  const doRollback = (id) => {
    if (id === 'clean') {
      // 清理干净：恢复干净模型 + 清空贴纸配置（先自动存一份清理前快照，可随时回滚）
      const hadStickers = Object.keys(readCfg()).length > 0 || isBaked();
      if (hadStickers) createSnapshot('清理前快照');
      if (!fs.existsSync(cleanGlbFile)) {
        return { ok: false, error: 'clean base GLB missing: liwei.rigged.clean.glb' };
      }
      fs.copyFileSync(cleanGlbFile, glbFile);
      writeCfg({});
      return { ok: true, baked: false, stickerCount: 0 };
    }
    const dir = resolveSnapshotDir(id);
    if (!dir) return { ok: false, error: 'invalid snapshot id: ' + id };
    const snapGlb = path.join(dir, 'liwei.rigged.glb');
    const snapCfg = path.join(dir, 'stickers.json');
    if (!fs.existsSync(snapGlb)) return { ok: false, error: 'snapshot has no GLB: ' + id };
    fs.copyFileSync(snapGlb, glbFile);
    if (fs.existsSync(snapCfg)) fs.copyFileSync(snapCfg, cfgFile);
    let meta = { baked: false, stickerCount: 0 };
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    } catch {}
    return { ok: true, baked: !!meta.baked, stickerCount: meta.stickerCount ?? 0 };
  };

  return {
    name: 'sticker-editor-api',
    configureServer(server) {
      const listModels = () =>
        fs.existsSync(modelsDir)
          ? fs.readdirSync(modelsDir).filter((file) => /^[\w. -]+\.glb$/i.test(file)).sort()
          : [];
      const readSelectedModel = () => {
        try {
          return JSON.parse(fs.readFileSync(modelSelectionFile, 'utf8')).selected || 'liwei.rigged.glb';
        } catch {
          return 'liwei.rigged.glb';
        }
      };

      server.middlewares.use('/api/profile', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          try {
            const config = JSON.parse(body);
            const custom = config?.custom;
            if (!custom || typeof custom !== 'object') throw new Error('custom profile data is required');
            const string = (value, field, max = 4000) => {
              if (typeof value !== 'string' || value.length > max) throw new Error(`${field} must be a string up to ${max} characters`);
              return value;
            };
            const about = custom.about;
            if (!about || typeof about !== 'object') throw new Error('about is required');
            const facts = Array.isArray(custom.facts) ? custom.facts : [];
            if (facts.length > 30) throw new Error('facts may contain at most 30 items');
            const normalized = {
              version: 1,
              mode: config.mode === 'custom' ? 'custom' : 'preset',
              custom: {
                name: string(custom.name, 'name', 120),
                role: string(custom.role, 'role', 160),
                portfolio: string(custom.portfolio, 'portfolio', 160),
                footer: string(custom.footer, 'footer', 160),
                location: string(custom.location, 'location', 160),
                about: {
                  zh: {
                    title: string(about.zh?.title, 'about.zh.title', 200),
                    paragraph: string(about.zh?.paragraph, 'about.zh.paragraph'),
                  },
                  en: {
                    title: string(about.en?.title, 'about.en.title', 200),
                    paragraph: string(about.en?.paragraph, 'about.en.paragraph'),
                  },
                },
                facts: facts.map((fact, index) => ({
                  id: string(fact?.id, `facts[${index}].id`, 120),
                  label: string(fact?.label, `facts[${index}].label`, 120),
                  value: string(fact?.value, `facts[${index}].value`, 500),
                })),
              },
            };
            fs.mkdirSync(profileDir, { recursive: true });
            fs.writeFileSync(profileFile, JSON.stringify(normalized, null, 2), 'utf8');
            sendJson(res, 200, { ok: true });
          } catch (e) {
            sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
          }
        });
      });

      server.middlewares.use('/api/models', (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, files: listModels(), selected: readSelectedModel() });
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          try {
            const selected = String(JSON.parse(body).selected || '');
            if (!/^[\w. -]+\.glb$/i.test(selected) || !listModels().includes(selected)) {
              throw new Error('selected model must be an existing .glb file in public/models');
            }
            fs.writeFileSync(modelSelectionFile, JSON.stringify({ selected }, null, 2), 'utf8');
            sendJson(res, 200, { ok: true, selected });
          } catch (e) {
            sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
          }
        });
      });

      server.middlewares.use('/api/director', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          try {
            const config = JSON.parse(body);
            if (!Array.isArray(config?.keyframes) || config.keyframes.length > 100) {
              throw new Error('keyframes must be an array with at most 100 entries');
            }
            fs.mkdirSync(directorDir, { recursive: true });
            fs.writeFileSync(
              directorFile,
              JSON.stringify({ version: 2, mode: config.mode === 'custom' ? 'custom' : 'preset', keyframes: config.keyframes }, null, 2),
              'utf8'
            );
            sendJson(res, 200, { ok: true });
          } catch (e) {
            sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
          }
        });
      });

      server.middlewares.use('/api/stickers', (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, { files: listFiles(), stickers: readCfg() });
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk.toString('utf8')));
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const stickers = parsed.stickers || {};
              fs.mkdirSync(stickersDir, { recursive: true });
              fs.writeFileSync(cfgFile, JSON.stringify({ stickers }, null, 2), 'utf8');
              sendJson(res, 200, { ok: true });
            } catch (e) {
              sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
            }
          });
          return;
        }
        if (req.method === 'DELETE') {
          try {
            const u = new URL(req.url || '', 'http://localhost');
            const file = u.searchParams.get('file') || '';
            if (!/^[\w.\- ]+\.(png|jpe?g|webp)$/i.test(file)) {
              sendJson(res, 400, { ok: false, error: 'bad file name: ' + file });
              return;
            }
            const target = path.join(stickersDir, file);
            const stickersResolved = path.resolve(stickersDir);
            if (path.resolve(target).startsWith(stickersResolved)) {
              if (fs.existsSync(target)) fs.unlinkSync(target);
              const cfg = readCfg();
              delete cfg[file];
              fs.writeFileSync(cfgFile, JSON.stringify({ stickers: cfg }, null, 2), 'utf8');
              sendJson(res, 200, { ok: true });
            } else {
              sendJson(res, 400, { ok: false, error: 'path escape' });
            }
          } catch (e) {
            sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
          }
          return;
        }
        res.statusCode = 405;
        res.end();
      });

      // 手动保存快照
      server.middlewares.use('/api/snapshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const u = new URL(req.url || '', 'http://localhost');
          const label = u.searchParams.get('label') || '手动快照';
          const snap = createSnapshot(label);
          if (!snap) {
            sendJson(res, 500, { ok: false, error: 'snapshot failed' });
            return;
          }
          sendJson(res, 200, { ok: true, snapshot: snap });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
      });

      // 列出 / 执行回滚
      server.middlewares.use('/api/rollback', (req, res) => {
        try {
          const u = new URL(req.url || '', 'http://localhost');
          if (req.method === 'GET') {
            sendJson(res, 200, { ok: true, snapshots: listSnapshots() });
            return;
          }
          if (req.method === 'POST') {
            const to = u.searchParams.get('to') || '';
            if (!to) {
              sendJson(res, 400, { ok: false, error: 'missing ?to=<id|clean>' });
              return;
            }
            const r = doRollback(to);
            if (!r.ok) {
              sendJson(res, 400, r);
              return;
            }
            sendJson(res, 200, { ok: true, ...r, snapshots: listSnapshots() });
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (e) {
          sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
      });

      server.middlewares.use('/api/rebuild', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        // 生成 GLB 前自动保存一份快照（烘焙效果不好可随时回滚到烘焙前）
        const snap = createSnapshot('烘焙前快照');
        if (snap) console.log('[sticker-api] auto snapshot:', snap.id, snap.label);
        // 方案 A：用 Python 把贴纸烘焙进 baseColor 纹理
        const pythonScript = path.join(scriptsDir, 'bake-stickers-to-texture.py');
        // 把 node 路径传给 Python（内部先用它跑 rebuild-rigged-glb.cjs 重建干净模型）
        const args = [pythonScript, process.execPath];
        // 优先用 python，找不到时回退到 py -3（Windows launcher）
        const run = (bin, binArgs) =>
          execFile(
            bin,
            binArgs,
            { cwd: repoRoot, timeout: 300000, maxBuffer: 1024 * 1024 * 16 },
            (err, stdout, stderr) => {
              if (err && err.code === 'ENOENT' && bin === 'python') {
                run('py', ['-3', ...binArgs]);
                return;
              }
              if (err) {
                sendJson(res, 500, {
                  ok: false,
                  output: String(stdout || ''),
                  error: String(stderr || err.message || err),
                });
              } else {
                sendJson(res, 200, { ok: true, output: String(stdout || '') });
              }
            }
          );
        run('python', args);
      });
    },
  };
};
