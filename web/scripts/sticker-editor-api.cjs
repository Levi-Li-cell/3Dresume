const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * 开发期贴纸编辑器 API（仅在 vite dev server 生效）：
 *   GET    /api/stickers          -> { files, stickers }
 *   POST   /api/stickers          -> 保存 stickers.json
 *   DELETE /api/stickers?file=xx  -> 删除 web/stickers 下的贴纸文件 + 配置
 *   POST   /api/rebuild           -> 运行 scripts/add-stickers.cjs 重新生成 GLB
 */
module.exports = function stickerEditorApi() {
  const stickersDir = path.join(__dirname, '..', 'stickers');
  const cfgFile = path.join(stickersDir, 'stickers.json');
  const scriptsDir = path.join(__dirname);
  const repoRoot = path.resolve(__dirname, '..', '..');

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
  const listFiles = () =>
    fs.existsSync(stickersDir)
      ? fs
          .readdirSync(stickersDir)
          .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
          .sort()
      : [];

  return {
    name: 'sticker-editor-api',
    configureServer(server) {
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

      server.middlewares.use('/api/rebuild', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const script = path.join(scriptsDir, 'add-stickers.cjs');
        execFile(
          process.execPath,
          [script],
          { cwd: repoRoot, timeout: 180000, maxBuffer: 1024 * 1024 * 8 },
          (err, stdout, stderr) => {
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
      });
    },
  };
};
