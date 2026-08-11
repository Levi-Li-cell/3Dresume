# 3Dresume

A scroll-driven 3D personal-site template. It combines a character GLB, profile, resume, and work gallery into one experience: scrolling advances the camera through the scene. In local development, visual tools let you swap models, author camera keyframes, place stickers, and edit profile content.

The code is released under the [MIT License](LICENSE). The bundled character, profile, resume, and work assets are personal content and must be replaced before reuse; see [NOTICE](NOTICE).

## Quick Start

```bash
git clone https://github.com/Levi-Li-cell/3Dresume.git
cd 3Dresume/web
npm install
npm run dev
```

Open `http://localhost:5173/`. The unified tool menu in the bottom-left corner is available only in development because it writes project files. It is hidden in the static production build.

```bash
npm run typecheck
npm run build
npm run preview
```

## Visual Tools

- **Profile**: edit hero metadata, bilingual About copy, and custom facts. The shipped content remains available as **Preset 1**.
- **Camera Director**: use the GLB camera path as **Preset 1**, or create custom keyframes for position, focus, FOV, and depth of field.
- **Model library**: copy `.glb` files into `web/public/models/`, then select one from **Camera Director -> Model**.
- **Sticker editor**: put PNG/WebP assets in `web/stickers/`, place them on the model, and optionally bake them into the GLB texture.

The editor writes these project assets:

| Feature | Saved file |
| --- | --- |
| Profile | `public/profile/profile.json` |
| Selected model | `public/models/model-selection.json` |
| Custom camera keyframes | `public/director/camera-overrides.json` |
| Stickers | `stickers/stickers.json` and a generated model in `public/models/` |

Read the Chinese [visual editor guide](tutor/可视化编辑器使用说明.md) for the complete workflow.

## Content Map

All paths below are relative to `web/`.

| Content | Location |
| --- | --- |
| Resume timeline | `src/ui/Resume.tsx` |
| Resume focus points | `src/data/focusPoints.ts` |
| Work sections and list | `src/data/works.ts` |
| Work detail Markdown | `src/content/works/<slug>.md` |
| Scene lighting and post-processing | `src/scene/Scene.tsx` |

## Model Compatibility

Ordinary GLB files work with a centered fallback focus and static camera. For the full built-in scroll camera path, add a camera animation named `CameraAction`, focus empties (`focus-start` or `focus-0`, `focus-1` through `focus-5`, and optionally `focus-works`), and meshes named with `eye` for eye tracking. A `man` node is used by the sticker workflow.

Models without those nodes can still use the custom camera mode.

## Deployment

Run `npm run build` inside `web/` and deploy `web/dist/` to GitHub Pages, Cloudflare Pages, or any static host. Vite uses `base: './'`, so the result also works in subdirectories.

Static hosting cannot write JSON or GLB files. Edit and save in local development, commit the generated assets, then redeploy. A public editor requires a separate authenticated backend and storage layer.

- [Deploy to GitHub Pages](tutor/部署教程/1-部署到-GitHub-Pages.md)
- [Deploy to Cloudflare Pages](tutor/部署教程/2-部署到-Cloudflare-Pages.md)
- [Front-end effect notes](前端效果概念及解释.md)
- [Sticker baking notes](web/stickers/README.md)
