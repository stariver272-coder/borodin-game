# 鲍罗廷的秘书：三次抉择

一个主持人带领、多人同步投票的中文文字游戏项目。当前包含三幕、四次投票，并已加入“1926年末，湖南某县”的周家田产争议场景。

## GitHub 托管与部署状态

源码仓库：https://github.com/the1valid/borodin-game

本仓库保存完整游戏源码。上传到 GitHub 不等于游戏已经上线；当前代码仍使用原 Sites 平台提供的登录与 Cloudflare 绑定，不能直接通过 GitHub Pages 运行多人版。

`.github/workflows/check.yml` 会在提交到 `main` 或提出 Pull Request 时安装锁定的依赖，运行 TypeScript 检查、现有多人集成测试和生产构建。此工作流只验证源码，不会发布网站，也不需要 Cloudflare 密钥。

独立部署建议使用 GitHub 保存代码、Cloudflare Workers 运行网页与接口，并完成以下配置：

1. 在自己的 Cloudflare 账号创建 D1 数据库和 R2 存储桶，分别绑定为 `DB` 和 `BUCKET`。将 `vite.config.ts` 中的占位数据库 ID、数据库名和存储桶名替换为真实配置，并设置自己的 Worker 名称。
2. 将原 Sites 主持人登录改为自己的认证机制，同时适配 `app/page.tsx`、`app/api/room/route.ts` 和 `app/api/characters/route.ts`。当前接口信任 Sites 网关注入的 `oai-authenticated-user-*` 请求头；独立公开部署时必须验证真实会话，不能直接信任浏览器提交的同名请求头。
3. 对新建的远程数据库执行 `drizzle/0000_watery_wallow.sql` 初始化迁移。项目里的 `--local` 命令只影响本机模拟数据库，不会初始化线上数据库；对已有数据库只应用尚未执行的迁移。
4. 通过 Cloudflare Workers 的 GitHub 集成或 GitHub Actions 配置生产构建和发布，并在上线后验证主持人创建房间、两台设备加入、同步投票及图片上传。

项目根目录应直接包含 `package.json`、`pnpm-lock.yaml`、`app/` 和 `content/`。Node.js 需要 >= 22.13.0，包管理器版本以 `package.json` 的 `packageManager` 为准；首次安装使用 `pnpm install --frozen-lockfile`。

`.openai/hosting.json` 中的项目 ID 记录原 Sites 项目身份，不会赋予此仓库原站点的登录、数据库或图片访问权限。部署密钥应配置在托管平台或 GitHub Actions Secrets 中；不要提交 `.env*`、`.dev.vars*`、运行时数据库或上传图片。

参考：[GitHub Pages 的静态托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Cloudflare Workers 的 GitHub 自动部署](https://developers.cloudflare.com/workers/ci-cd/builds/)。

## 使用网页

1. 主持人登录后创建房间。把 6 位房间码或邀请链接交给参与者。
2. 参与者打开网页，填写昵称和房间码。网页会保留本浏览器的参与身份，刷新可恢复。
3. 主持人点击“进入第一幕”，分角色朗读，逐段推进。到投票页后点击“开启本轮投票”。
4. 每个参与身份每轮只有一条有效投票，截止前修改会覆盖原票。先只显示已投人数，主持人截止后才公布票数与理由。
5. 政策题多数票决定展示的回应；平票或无人投票时展示双方回应。身份题的剧本设定答案为秘书C，不由多数票改写。
6. 最后可导出 TXT 讨论记录。要重新组织一场讨论，创建新房间即可。

主持人不计票。如需独自体验，用侧栏“打开玩家页试投票”另开一个标签页，作为参与者加入。不要分享主持人的浏览器存储或密钥。

**访问权限与房间码是两个层次。** 本项目初次发布为私密预览。邀请别人之前，需要在站点的共享设置中授权参与者访问；房间码不会绕过网站访问权限。发布为公开访问时，玩家可以使用昵称加入，创建房间和上传素材仍须登录。当前代码没有自行开放网站的公开访问权限。

## 添加人物图片

直接点击网页右上角“人物素材”上传。支持 PNG / JPG / WebP，单张不超过 5MB，推荐 3:4 竖图。上传由服务器保存，同一主持人创建的房间共享这组素材；其他主持人的素材彼此独立。删除图片会恢复默认图片或姓名占位。

也可以编辑项目：

- 把图片放入 `public/characters/`，例如 `public/characters/borodin.webp`。
- 在 `content/characters.json` 中找到相应人物，将 `image` 设为 `/characters/borodin.webp`。
- 网页上传的图片优先于项目默认图。修改项目文件后需重新构建并发布；网页上传保存后自动生效。

人物 ID：`borodin`、`secretary_c`、`secretary_h`、`liaison`、`farmer`、`landlord_zhou`、`military_liaison`。没有图片也能完整游玩。

## 修改台本

`content/story.json` 包含：

- `scenes`：按顺序排列的对话、投票、历史回顾和结尾。
- `polls`：题目、选项、分支回应与追问。修改文字不需要改程序。
- `history`：投票后汇合的历史回顾。

人物名称需与 `content/characters.json` 对应；旁白无立绘。加入新角色时也要维护人物配置。若要调整场景数量或投票结构，请先结束已有活动，再发布新版本，以免进行中的房间指向不同的场景。

对话和角色为教学改编，非史料原话。三次政策选择不预设唯一正确答案，历史回顾不会因投票结果而改变。历史内容沿用现有台本。

## 项目结构

- `app/game.tsx`：首页、房间、投票、结果、素材管理界面。
- `app/globals.css`：深绿与纸张色的响应式布局。
- `app/api/room/route.ts`：创建、加入、同步、投票与主持操作。
- `app/api/characters/route.ts`：人物图片上传与管理。
- `app/api/images/[key]/route.ts`：读取上传图片。
- `lib/engine.ts`：服务端房间权限、投票约束与结果统计。
- `db/schema.ts`、`drizzle/`：数据结构与数据库迁移。
- `tests/multiplayer.mjs`：独立玩家与共享存储集成测试。

## 技术与运行

React / TypeScript / Vinext，Cloudflare Workers 服务端，D1 保存房间与投票，R2 保存图片。浏览器每 2.5 秒获取房间状态，短暂断线后自动重试；后台页面可能被浏览器降低刷新频率。共享数据来自服务器，本地存储只保存参与身份。

当前每个房间最多 100 个参与身份；这是程序限制，不代表已做百人真机负载测试。已验证两名独立玩家的完整流程。昵称参与采用浏览器身份，不能保证一个自然人只创建一个身份；适合课堂讨论，不适合作为严格身份认证的考试或正式选举。

开发需要 Node.js >= 22.13。保留锁文件，用项目所配置的包管理器安装依赖。常用命令：

```sh
npm run dev
npm run db:generate
npm run build
node node_modules/typescript/bin/tsc --noEmit
node tests/multiplayer.mjs
```

项目通过 Sites 管理源代码与发布；`.openai/hosting.json` 记录站点和 D1/R2 绑定。开发、构建与发布应遵循 Sites 工作流。独立本地运行时，先构建生成 Worker 配置，再按顺序应用未执行的 D1 迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_watery_wallow.sql
```

本地数据与线上数据彼此独立。不要重放已执行的迁移；不要提交运行时数据、密钥、用户图片或浏览器存储。

## 已检查与待验证

集成测试覆盖：两位独立参与者、同时投票、改票不增票、隐藏投票中统计、平票、零票、票数较多分支、截止后拒投、主持人版本冲突、刷新恢复、跨房间权限、四轮完整流程、导出权限、图片格式校验、共享图片与不同拥有者的素材隔离。

本次环境未提供支持的浏览器测试入口，尚未做手机、投影屏幕和真实多设备端到端联测。正式活动前建议用主持人与两部手机走完一轮，并确认所有人的网络都能访问站点。
