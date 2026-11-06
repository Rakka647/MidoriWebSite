# AGENTS.md — MIDORI

MIDORI 是一个 VRChat 成品模型展示站。项目由**两个独立仓库**组成，必须一起理解：

| 文件夹 | 作用 | 技术 | 部署 |
| --- | --- | --- | --- |
| `MIDORI`（本仓库，线上仓库名 `MidoriWebSite`） | 访客看的展示网站 | React 19 + TypeScript + Vite 8 | 推 `main` → GitHub Actions 构建 → 同时发布到 GitHub Pages（`midori.zone`）与 rsync 到香港服务器 |
| `MIDORIadmin`（同级目录，独立仓库） | 管理员上传 / 修改内容 | 零依赖 Node HTTP 服务 + 原生 JS | **只在管理员本机**跑，不上公网 | 密码只在 `config.json` 里存哈希，**不要写进任何提交内容** |

数据流只有一条：

```
后台写 JSON / 图片  →  MIDORI/src/content/*.json + MIDORI/public/{models,banner,gallery}/
        ↓ git push main
├─ .github/workflows/deploy.yml → npm ci && npm run build → rsync dist/ 到香港服务器
└─ .github/workflows/pages.yml  → npm ci && npm run build → 发布到 GitHub Pages（自定义域名 midori.zone，见 public/CNAME）
```

> 仓库**必须保持 public**：GitHub Pages 在免费账号下不支持私有仓库。仓库里只有已经公开的展示内容，任何密钥 / 密码都不许提交。

> 网站**没有后端、没有数据库、没有 API**。所有内容在构建时被打进 bundle。
> 后台**不参与部署**，它只是一个直接改网站仓库文件的本地工具。

---

## 一、快速上手

### 网站（本仓库）

```powershell
npm install      # CI 用 npm ci + package-lock.json
npm run dev      # 本地开发
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint（注意：不是 eslint）
npm run preview
```

- `npm start` 是**故意报错**的，用来挡住「在网站目录里起后台」这个误操作。后台去 `MIDORIadmin` 里起。
- Node 版本见 `.node-version`（22）。
- `dist/` 已 gitignore，永远不要手改或提交。

### 后台（`../MIDORIadmin`）

```powershell
cd ..\MIDORIadmin
npm start                    # http://127.0.0.1:5180，不需要 npm install
npm run password -- 新密码    # 至少 6 位
```

- 首次启动生成 `config.json` 并在终端**只打印一次**随机密码。
- `config.json` 里有 `siteDir`（默认 `../MIDORI`）、`host`、`port` 和密码哈希。
- 也支持环境变量 `SITE_DIR` / `HOST` / `PORT` 覆盖。
- 找不到网站数据时，`resolveSiteDir()` 会依次尝试 `../MidoriWebSite`、`../MIDORI`、`E:\Midori-project\...`。所以改名或移动目录后，改 `config.json` 的 `siteDir` 最稳。
- 管理员实际只会双击 `1-setup.bat` / `2-start-admin.bat` / `3-publish.bat`，改这三个脚本时保持「小白双击也能用」的门槛：中文提示 + `pause`。
- `2-start-admin.bat` 是**纯 ASCII** 的引导脚本，中文提示都在 `start-admin.mjs`。cmd 解析长的 UTF-8 中文批处理会串行（见第三节说明），不要为了「统一风格」把提示语搬回 `.bat`。

---

## 二、网站结构（`MIDORI/src`）

```
src/
  main.tsx              入口，强制清理滚动位置
  App.tsx               hash 路由 + 页面切换动画 + 全局弹窗（notice）
  models.ts             模型类型、标签体系、筛选/排序/价格/描述消毒（核心纯函数层）
  gallery.ts            返图类型与标签
  favorites.ts          localStorage 收藏 / 点赞 store（useSyncExternalStore）
  index.css             唯一样式文件，约 6300 行，无框架、无 CSS Modules
  content/
    models.json         模型数据（后台写入，26 条）
    tags.json           三级标签池（后台写入）
    banner.json         首页横幅（最多 4 张，后台写入）
    gallery.json        返图（后台写入，90 条）
  components/
    Header.tsx          顶栏（暗色模式按钮目前只弹「未实现」）
    Home.tsx       ~620 行  横幅轮播 + 模型一览 + 筛选/排序/分页 + 侧边栏
    Detail.tsx     ~450 行  图片轮播 + 版本价格 + 点赞收藏 + 相关模型 + 灯箱
    Gallery.tsx    ~680 行  canvas 驱动的瀑布瓷砖墙 + 拖拽 + 详情弹窗
```

### 路由

**没有 react-router**。`window.location.hash` 就是唯一状态：

- `""` → 首页
- `#gallery` → 返图展示
- `#<model.id>` → 模型详情（`id` 不在 `models.json` 里就回首页）

新增页面必须同时改 `readScreen()` / `hashFor()` / `screenKey()` 三处。

### `models.ts` 是不变量中心

改任何展示逻辑前先确认这些约定，它们被多处复用：

- **标签是四级**：一级 `bodies`（素体）、二级 `erp`（布尔字段，不是数组）、三级 `colors`、四级 `tags`。
  `modelTags()` 把它们拼成一个扁平数组，筛选 / 推荐 / 搜索都吃这个。
- `ERP_YES = "可ERP"`、`ERP_NO = "无ERP"` 是**保留标签**，只由 `erp` 字段派生，不能写进标签池。
- 筛选语义（`matchesPicked`）：行内素体/颜色是「满足其一」，标签是「全部满足」，行与行之间永远是「且」。
- 价格：`displayPrice` 优先 `price`，回落第一个版本的价格；`priceValue` 取所有数字里最大的（总价、各版本价），排序用。
- **ERP 预设图**：首页「erp模型」按钮是「筛选 + 双态」的复合按钮。`erpFilter === "erp"` 时再点一次，`App` 里的 `erpAlt` 翻转，卡片封面换成 `model.erpImage`（没有就显示 `.frame-ph` 占位符）；再点一次换回默认封面，**不会取消筛选**。只有点「全部」/「无erp模型」，或从详情页点非 ERP 标签，才退出并复位 `erpAlt`。新增的 `erpImage` 字段由后台单独上传。
- 卡片封面是**两层叠加**（`.frame-layer-base` / `.frame-layer-erp`），切换靠 `opacity` 交叉淡入淡出（0.55s），不是换 `src` 硬切。`Home` 里的 `erpMode = erpAlt && filter === "erp"` 是唯一开关：任一项不成立就回默认层，避免出现两层都透明、卡片一片空白的死状态。`.frame-layer` 的 transition 只在 `is-erp-morph`（即筛在 erp）时开启，离开 erp 时卡片整块重排不需要动画。
- 描述是 HTML 片段，`sanitizeDescription` 只放行 `p br b strong i em u s mark div`。后台侧还有一份更严格的同名逻辑（把 `span` 的 `font-weight` / `italic` / `underline` 转成标签，丢 `mark`），两边**都要保持白名单一致**。

### 硬约束

- **hash 路由**、无全局状态库、无 UI 库。加依赖前先问。
- 样式全在 `src/index.css`，类名前缀按区块划分：`d-`（详情）、`gal-`（返图）、`sheet-` / `chip` / `card`（一览）、`rail` / `bar`（框架）。**不要整篇重排 CSS**，只追加/局部修改，且优先复用已有的 CSS 变量（`--bg --cream --lime --line --ease --didot --sans ...`）。
- 收藏/点赞只存 `localStorage`，键是 `midori-favorites` / `midori-likes`；`serverLikes()` 恒返回 `0`，接后端时只改这一个函数。
- 首页分页固定 15 个/页（5×3）；返图最多渲染 220 张瓷砖，布局用固定种子 `mulberry32(20250721)`，**不要改成随机**，否则每次打开画面都会跳。
- 返图弹窗里的左右按钮和 ←/→ 键都是「随机看一张」，不是顺序翻页。随机由 `randomAside()` 负责：跳过当前这张和最近看过的 8 张（`RECENT_LIMIT`），图少时会自动退化。**别改回 `±1` 取模**，那是刻意去掉的上传顺序。
- 图片一律 `loading="lazy"` / `decoding="async"`；详情页缩略图轨道用 5 份副本做无限循环，边界逻辑别乱动。
- 文案是中文（`lang="zh-CN"`），注释也写中文。改文案时保持全角标点与现有语气。
- `tsconfig.app.json` 开了 `noUnusedLocals`、`noUnusedParameters`、`verbatimModuleSyntax`、`erasableSyntaxOnly`：类型导入必须 `import type`，不能写 `enum` / 参数属性。
- 字体由 `index.html` 从 Google Fonts 加载（`media="print"` + `onload` 的非阻塞写法），改字体要同步改 `--didot` / `--sans` 等变量。

---

## 三、后台结构（`../MIDORIadmin`）

```
1-setup.bat / 3-publish.bat   给管理员双击的脚本（UTF-8 中文，命令不多，目前没问题）
2-start-admin.bat             **纯 ASCII** 引导脚本：只负责找到 node 并调起 start-admin.mjs
start-admin.mjs               启动逻辑：找网站目录、按需 git pull、探端口、开浏览器、起 server.mjs
server.mjs          单文件 Node 服务：登录、模型/横幅/返图/标签 API、图片落盘、跑构建
public/
  index.html        唯一的 HTML，CSP 严格：不许内联 <script>、不许外链 CDN
  app.js      ~1030 行  用 el() 手搓 DOM 的单页后台（无框架）
  imagetools.js ~295 行 canvas 裁剪 + 水印（右下角 / 斜向平铺 / 居中），比例可传参
  style.css    ~910 行
originals/<modelId>/  管理员上传的原图 + meta.json（裁剪记录），**不发布**
backups/              models-*.json / tags-*.json / gallery-*.json / rail-*.json，各保留最近 30 份
trash/                删除的图片和模型目录，误删可捞
```

> **别往 `2-start-admin.bat` 里加中文。** cmd.exe 读取批处理时按字节跳行，UTF-8 中文 + `chcp` 会让它在 `goto` / 条件块之后从字符中间继续读，把半行中文当命令执行（`'xxx' is not recognized`）。文件一长（约 5 KB 以上）必现。所有中文提示放在 `start-admin.mjs` 里。

### API（全部 JSON，非 GET 会校验 `Origin`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/login` | 12 小时会话，cookie `midori_admin`（HttpOnly, SameSite=Strict） |
| GET | `/api/me` | `{ loggedIn, siteDir }`，未登录也返回 |
| GET/POST | `/api/models` | 列表带 `imageMeta` / 保存（新建与更新同一个接口，靠 `isNew`） |
| DELETE | `/api/models/:id` | 图片移进 `trash/` |
| GET/POST | `/api/banner` | 最多 4 张，每张必须有图和对应 `modelId` |
| GET/POST | `/api/rail` | 右侧栏「闲鱼店铺 / 交流群」弹窗的文字与店铺链接 |
| GET | `/api/tags` | 三级标签池 |
| POST | `/api/tags/delete` | 从池里删标签，同时从所有模型里摘掉 |
| GET/POST | `/api/gallery` | 返图，最多关联 8 个模型 |
| DELETE | `/api/gallery/:id` | 图片移进 `trash/` |
| GET/POST | `/api/build` | 在网站目录 `npm run build`，日志截留最后 20 KB |

图片预览路由 `/models/*`、`/banner/*`、`/gallery/*`、`/originals/*` **都要登录**。

### 后台硬约束

- **零依赖**：`package.json` 没有 dependencies，不要加。前端不要引入构建步骤，`app.js` 就是浏览器直接跑的 ES module。
- 上传链路：浏览器 canvas 出 webp（展示图 1600 宽 / 0.84，放大图 ≤2560 / 0.78，横幅 ≤1920，返图 2200+560），服务端只接受 `data:image/...` 且**网站目录里的图必须是 webp**（`savePublicWebp` 会拒绝 png/jpg）。PNG 原图只落 `originals/`。
- 写文件必须 `tmp + rename`（原子写），写前备份、只留 30 份——这是防数据丢失的主要手段，别简化。
- 删除永远是「移到 `trash/`」，不要直接 `rm` 用户内容。
- 保存模型时若中途抛错，要回滚本次新写入的图片（`written` / `writtenOrig` 数组就是干这个的）。
- 字段限制（服务端 `text(value, max)`）：`name` 80、`series` 80、`code` 16、`price` 60、`author` 60、`platform` 80、`download` 40、`vram` 40、`link` 600、`description` 30000；`versions` 最多 12 条；每级标签最多 40 个、单个 ≤24 字。
- `erpImage`（ERP 预设图）走独立的上传路径：`undefined` = 沿用上一张，`""` = 删除，`data:image/...` = 新上传（服务端 `savePublicWebp` 存成 `<时间戳>-erp-<随机>.webp`）。它**不属于** `images`，要与 `images` / `fullImages` 一起进 `keepImages`，否则保存时会被当垃圾图移进 `trash/`。
- ERP 预设图和详情图用**同一个裁剪器**（`imagetools.js` 的 `openEditor` / `renderDisplay`），但比例不同：**详情图 `ASPECT = 6/5`，ERP 预设图 `ASPECT_SQUARE = 1`**（因为首页 `.sheet .frame` 是 1:1，详情页图位是 6:5）。`openEditor(item, aspect, { where })` / `renderDisplay(item, maxW, aspect)` 都接受比例参数，默认 6:5；ERP 那边必须显式传 `ASPECT_SQUARE`。裁剪记录存在 `originals/<id>/meta.json` 的保留键 `__erp__` 里（`{ original, crop, mark }`），保全原图才能在以后重新框选时不在已裁过的图上再裁。保存时额外传 `erpImageOriginal` / `erpImageCrop` / `erpImageMark`；`GET /api/models` 把它单独返回成 `erpMeta`。清理 `originals/` 时要把 `__erp__.original` 一起算进保留集合。
- `id`（即 `public/models/<id>/` 目录名，创建后不能改）必须匹配 `^[a-z0-9][a-z0-9-]{0,48}$`。
- 不填 `code` 时自动顺延成 `#NN`；`models.json` 按 `code` 里的数字排序。
- CSP 是 `default-src 'self'`：字体、图标、脚本都不能外链，图片只允许 `self data: blob:`。
- 默认只监听 `127.0.0.1`。**不要把后台和网站部署到同一个对外目录**。
- `config.json`、`backups/`、`trash/`、`originals/` 都在 `.gitignore` 里，绝不能提交（`config.json` 含密码哈希）。
- 右侧栏「闲鱼店铺 / 交流群」点开的文字存在网站的 `src/content/rail.json`，由后台「侧栏弹窗」页写入。二维码图片只从网站 `public/qr/` 里取，后台不上传图片，只改下面对应的说明文字。

---

## 四、内容数据结构

### `src/content/models.json`

```jsonc
[{
  "id": "emo",              // 目录名，唯一，英文小写
  "code": "#02",            // 展示编号，决定排序
  "name": "Emo",
  "series": "Manuka",       // 素体系列，留空时后台用它兜底 bodies
  "price": "¥69.9 ~ ¥79.9", // 卡片上显示
  "versions": [{ "name": "无面捕版", "price": "¥69.9" }], // 可选，详情页逐行列出
  "erp": true,              // true / false / null（未标注）
  "bodies": ["Manuka"],     // 一级
  "colors": ["黑色系"],      // 三级
  "tags": ["丧", "地雷系"],  // 四级
  "author": "Midori",
  "platform": "PC/PCVR",
  "download": "约91mb",
  "vram": "约126mb",
  "link": "https://…",      // 可选，覆盖详情页的兜底链接
  "description": "<p>…</p>",
  "images": ["/models/emo/xxx.webp"],        // 第一张是封面
  "fullImages": ["/models/emo/xxx-full.webp"] // 可选，点开看的大图；缺省用 images
  "erpImage": "/models/emo/xxx-erp.webp"      // 可选，首页 erp模型 按钮第二次点开时的卡片图
}]
```

`src/content/tags.json`：`{ bodies: string[], colors: string[], tags: string[] }`。
`src/content/banner.json`：`{ slides: [{ src: "/banner/x.webp", modelId }] }`，最多 4 条。
`src/content/rail.json`：右侧栏两个弹窗的文字，
`{ shop: { title, body, links: [{ label, url }] }, group: { title, code, body, qrs: [{ src, caption }] } }`；
`body` 里的换行会被拆成多段，`links` 最多 6 个，`qrs` 只认 `public/qr/` 下已有的图片。
`src/content/gallery.json`：`[{ id, no, image, thumb?, author, date: "2026.10.10", comment, models: string[] }]`，新的在前。

**约定**：这几个 JSON 由后台写入，正常不要手动编辑。确需手改时，保持字段顺序、缩进 2 空格、`models.json` 按 `code` 数字升序，并同步检查 `public/` 下引用的图片是否存在。

### 图片命名

`<base36 时间戳>-<序号>-<4位随机>.<ext>`，例如 `mv1yq6h6-b-c785.webp`。名字里的序号对应图片位置，`-full` / `f<n>` 表示放大图。**不要重命名已有文件**——`models.json` / `gallery.json` 里是硬编码路径。

---

## 五、开发 / 提交规范

- 分支：`main` 直接推（历史提交就是 `update models YYYY-MM-DD-HHMM` 这种）。内容更新由 `3-publish.bat` 自动提交；代码改动自己写清楚的提交信息。
- 改代码后至少跑：`npm run build`（会连带 `tsc -b`）+ `npm run lint`。后台改完跑 `node --check server.mjs`，前端 JS 可 `node --check` 复制成 `.mjs` 验证。
- 现有 `oxlint` 有 12 条 `warning`（`react(set-state-in-effect)` / `react(refs)`，集中在 `App.tsx`、`Home.tsx`、`Detail.tsx`、`Gallery.tsx`）。**不要为了清 warning 大改动画/测量逻辑**，也别引入新的。
- `Home.tsx` 里那条 `// eslint-disable-next-line react-hooks/exhaustive-deps` 是历史遗留（本项目跑的是 oxlint），无实际作用，改动该 effect 时别依赖它。
- 同时存在 `package-lock.json` 和 `pnpm-lock.yaml`。CI 走 `npm ci`，**以 `package-lock.json` 为准**；改依赖请用 npm 并提交 lock 文件。
- 验证视觉改动：`npm run dev` 后看首页横幅轮播、模型一览分页、详情灯箱、返图拖拽（桌面 + 窄屏）。后台改动：`npm start` 后手动走一遍「新建模型 → 上传图 → 保存 → 构建网站」。
- 提交前确认 `git status` 里没有 `dist/`、`config.json`、`backups/`、`originals/`、`trash/`。

## 六、常见坑

1. **在 `MIDORI` 里跑 `npm start`** → 会直接报错退出，这是设计如此；后台在 `MIDORIadmin`。
2. **后台找不到网站** → 多半是文件夹名不是 `MidoriWebSite` / `MIDORI`，或不在同级。改 `config.json` 的 `siteDir`。
3. **保存图片报「网站上的图片必须是 webp」** → 直接绕过浏览器处理流程塞了 png/jpg；只能走后台的 canvas 流程。
4. **标签报「同时写在了…」/「已经是…里的标签了」** → 同一个标签只能属于一级，且不能占用 `可ERP` / `无ERP`。
5. **图片比例** → 详情页图位固定 6:5（`ASPECT`），首页模型卡片封面是 1:1（`ASPECT_SQUARE`，ERP 预设图用它）。改比例要同时改 CSS 与后台裁剪器传的 `aspect`。
6. **部署失败** → 看 Actions 的 `SSH_KEY / SSH_HOST / SSH_USER` secrets；rsync 目标写死 `/www/wwwroot/Midori.zone/`，带 `--delete`。Pages 那条看 `Deploy to GitHub Pages`（需要 Settings → Pages 的 Source 为 GitHub Actions）。
7. **Pages 域名 / HTTPS** → `midori.zone` 的 DNS 必须指向 Pages：`A @ 185.199.108.153 / .109.153 / .110.153 / .111.153`，`CNAME www rakka647.github.io`。DNS 没指向 Pages 之前，Pages 的证书签不出来，`Enforce HTTPS` 也打不开（API 报 `certificate does not exist yet`）。**不要给 `www` 保留旧服务器解析**，否则会拿到自签名证书。
7. **暗色模式** → 只有 `dataset.theme` 与少量变量，按钮点了弹「还没有实现」。别把它当成已完成功能。
