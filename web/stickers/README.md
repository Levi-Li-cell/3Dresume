# 贴纸编辑器（烘焙进模型纹理）

把 PNG / WebP 贴纸放进 `web/stickers/` 目录后，运行 `npm run dev`，通过页面左下角工具菜单的“贴纸”入口摆放位置，然后一键生成 GLB。
生成 GLB 会把贴纸**烘焙进**皮肤纹理：`web/public/models/liwei.rigged.glb` 的 baseColor 会被重绘，
贴纸会**跟随光照/材质**，不再是独立平面，也不会产生多余的 mesh 节点。

## 快速开始

1. 准备贴纸 PNG / WebP（建议带透明背景），例如 `star.png` / `heart.png`。
2. 执行 `cd web && npm run dev`，打开 http://localhost:5173。
3. 打开左下角工具菜单，进入“贴纸”；选中贴纸后进入放置模式：
   - 在模型脸上点击/拖拽即可摆放/移动
   - 右侧面板可微调位置/旋转/缩放
4. 调整满意后点“保存配置”，配置会写入 `stickers.json`。
5. 点“生成 GLB”，贴纸会被**烘焙进** `web/public/models/liwei.rigged.glb` 的皮肤纹理。
   - 之后贴纸跟随光照/材质，放大缩小不会模糊
   - 生成后刷新页面，贴纸直接显示在模型上（不再显示编辑器平面）

## stickers.json 格式

```json
{
  "stickers": {
    "star.png": { "position": [0, 0.6, 0.27], "rotation": [0, 0, 15], "scale": 0.1 },
    "heart.png": { "position": [-0.12, 0.58, 0.26], "rotation": [0, 0, -10], "scale": 0.08 }
  }
}
```

- `position`: [x, y, z] 贴纸中心相对 `man` 节点的位置
- `rotation`: [rx, ry, rz] 绕 x/y/z 轴的旋转（度）
- `scale`: 贴纸**最长边**的长度（世界单位），例如 0.14 约半个头宽、0.315 正好一个头宽
- 比例：编辑器按贴图原始宽高比显示，不强制 1:1；另一条边按贴图宽高比自动缩放

## 实现说明

- 编辑器内贴纸是 `man` 节点下的临时平面，scale 语义为最长边，另一条边按贴图原始宽高比缩放，
  位置/旋转来自配置，`man` 节点跟随头部动画。
- `web/scripts/bake-stickers-to-texture.py` 的流程：
  1. 先跑 `rebuild-rigged-glb.cjs` 重新生成干净模型
  2. 读取 mesh 的 POSITION / TEXCOORD_0 / NORMAL / index
  3. 把每张贴纸从 man 坐标系投影到头表面，通过 UV 反投影到头贴图区域并叠加（带 alpha 混合）
  4. 用新 baseColor 重写 GLB（自动在 JPEG/PNG 之间选体积更小者）
- 只重写 images[0]（baseColor），roughness / normal 等其它贴图不受影响。

## 手动调试

启动本地开发服务器：

```
cd web
npm run dev   # 打开 http://localhost:5173
```

命令行直接烘焙 GLB：

```
python web/scripts/bake-stickers-to-texture.py
```

旧方案（额外 mesh 节点，而非烘焙）：

```
node web/scripts/add-stickers.cjs
```
