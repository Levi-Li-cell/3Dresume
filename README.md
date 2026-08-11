# 3Dresume

一个以滚动驱动镜头的 3D 个人主页模板。页面把角色 GLB、个人资料、履历与作品集放进同一个叙事里：滚动内容时，镜头沿模型动画推进；用户可用可视化工具替换模型、编辑关键帧、添加贴纸和修改个人资料。

线上产品版使用 Supabase Auth 管理账户，微信支付 Native Payment 解锁编辑权限；个人资料、运镜、贴纸变换与模型选择存储在 Supabase，GLB 和贴纸图片存储在 Vercel Blob。部署说明见 [技术实施与部署指南](docs/技术实施与部署指南.md)。

> 当前演示使用仓库内的角色模型、履历和作品素材。代码采用 [MIT](LICENSE) 许可；个人内容与素材不在 MIT 范围内，使用模板前请替换为自己的内容，详见 [NOTICE](NOTICE)。

## 预览与开始

- 仓库：[Levi-Li-cell/3Dresume](https://github.com/Levi-Li-cell/3Dresume)
- 前端目录：[`web/`](web)
- 3D 源文件：[`blender/`](blender)
- 使用教程：[`tutor/`](tutor)

```bash
git clone https://github.com/Levi-Li-cell/3Dresume.git
cd 3Dresume/web
npm install
npm run dev
```

打开 `http://localhost:5173/`。本地演示不配置 Supabase 时只显示预设内容；要联调账户、支付和云端编辑，请按部署指南配置环境变量后使用 `vercel dev`。

```bash
npm run typecheck  # TypeScript 检查
npm run build      # 检查并构建到 web/dist/
npm run preview    # 本地预览构建产物
```

## 当前项目包含什么

- 固定的 React Three Fiber 3D 场景，前景是可滚动的 About、履历和作品画廊。
- GLB 的 `CameraAction` 动画被滚动进度驱动，配合景深、Bloom 和眼球跟随光标。
- 履历节点与焦点锚点联动，进入作品区后切换到横向滚动画廊。
- 左下角统一工具菜单：贴纸、运镜、资料三个入口。
- 模型库：把 `.glb` 放到 `web/public/models/` 后，可在运镜工具的“模型”页选择并立即预览。
- 资料编辑器：当前原始内容保留为“预设 1”，可视化修改姓名、职位、介绍和自定义信息。
- 运镜编辑器：保留 GLB 原始镜头作为“预设 1”；切换“自定义”后可用关键帧编辑镜头偏移、焦点偏移、FOV 与景深。
- 贴纸编辑器：在模型上摆放 PNG/WebP，保存后可烘焙进 GLB 的基础颜色纹理。

## 可视化编辑工作流

编辑器会把配置写入仓库文件，因此请通过 `npm run dev` 使用。

1. 打开左下角工具菜单。
2. 用“资料”替换首屏个人信息；“预设 1”可随时恢复原始资料。
3. 将自己的 `.glb` 复制到 `web/public/models/`，在“运镜 -> 模型”中刷新并选择。
4. 在“运镜 -> 自定义”中逐帧添加镜头与焦点关键帧，保存到当前账户的云端项目。
5. 在“贴纸”中上传 PNG、JPG 或 WebP，在模型上调整后保存到云端项目。
6. 完成后执行 `npm run build`，将 `web/` 作为 Vercel Root Directory 部署。

详细步骤见 [可视化编辑器使用说明](tutor/可视化编辑器使用说明.md)。

## 内容与文件对应

所有以下路径都相对于 `web/`：

| 要修改的内容 | 文件或工具 |
| --- | --- |
| 首屏资料、双语介绍、自定义信息 | 左下角“资料” -> Supabase `sen_projects.profile` |
| 当前模型选择 | 左下角“运镜 -> 模型” -> `public/models/model-selection.json` |
| 自定义镜头关键帧 | 左下角“运镜 -> 自定义” -> Supabase `sen_projects.director` |
| 贴纸文件与位置 | 左下角“贴纸” -> Vercel Blob、Supabase `sen_projects.stickers` |
| 履历时间轴 | `src/ui/Resume.tsx` |
| 履历焦点节点 | `src/data/focusPoints.ts` |
| 作品列表 | `src/data/works.ts` |
| 单个作品详情 | `src/content/works/<slug>.md` |
| 作品图片与视频 | `public/works/<slug>/` |
| 场景灯光、景深、后期参数 | `src/scene/Scene.tsx` |

## 模型适配

模板可以显示不带专用节点的普通 GLB：系统会以模型包围盒中心作为后备焦点，并保留静态镜头。若要获得完整的滚动运镜和自动焦点效果，GLB 建议包含以下对象：

| 对象或动画 | 用途 |
| --- | --- |
| 相机与 `CameraAction` 动画 | 预设 1 的滚动镜头路径 |
| `focus-start` 或 `focus-0` | 首屏焦点 |
| `focus-1` 至 `focus-5` | 履历节点焦点；数量与 `FOCUS_POINTS` 对应 |
| `focus-works` | 作品区焦点，可省略 |
| 名称含 `eye` 的网格 | 眼球跟随效果，可省略 |
| 名称为 `man` 的节点 | 贴纸放置与烘焙的参考节点 |

如果模型没有相机动画，仍可切换到“自定义”模式，使用关键帧偏移创建一套新的运镜。

## 架构

```text
web/
  src/
    App.tsx                 页面装配、首屏和工具入口
    scene/Scene.tsx         GLB、滚动驱动、焦点、景深与后期
    director/               可视化运镜编辑器与关键帧状态
    editor/                 贴纸编辑器、模型状态和贴纸平面
    profile/                个人资料编辑器与持久化状态
    tools/                  左下角统一工具菜单
    ui/                     履历与作品集
    content/works/          作品详情 Markdown
  public/
    models/                 GLB 模型与模型选择配置
    director/               运镜配置
    profile/                个人资料配置
  scripts/sticker-editor-api.mjs
                            仅开发模式使用的编辑器保存接口
```

## 部署

将 Vercel 的 Root Directory 设置为 `web`，Build Command 设置为 `npm run build`，Output Directory 设置为 `dist`。配置 Supabase、Vercel Blob 和微信支付变量后即可部署。

完整步骤、数据库 SQL、支付回调配置和安全边界见 [技术实施与部署指南](docs/技术实施与部署指南.md)。

## 深入阅读

- [可视化编辑器使用说明](tutor/可视化编辑器使用说明.md)
- [前端效果概念及解释](前端效果概念及解释.md)
- [贴纸烘焙说明](web/stickers/README.md)
- [用 intro3d 处理模型](tutor/intro3d处理模型教程/intro3d处理模型教程.md)
- [眼球跟随教程](tutor/眼球教程/眼球教程.md)
