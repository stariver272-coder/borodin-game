# 鲍罗廷的秘书：三次抉择

一个主持人带领、多人同步投票的中文文字游戏项目。当前包含三幕、四次投票，并已加入“1926年末，湖南某县”的周家田产争议场景。

## GitHub 托管与部署状态

源码仓库：https://github.com/the1valid/borodin-game

本仓库保存完整游戏源码，并提供独立 Cloudflare 部署配置与主持人密码登录。上传到 GitHub 不等于游戏已经上线；多人版仍需要 Workers 服务和 D1 数据库，不能直接通过 GitHub Pages 运行。

`.github/workflows/check.yml` 会在提交到 `main` 或提出 Pull Request 时安装锁定的依赖，运行 TypeScript 检查、现有多人集成测试、生产构建及 30 人本地 Worker HTTP 测试。此工作流只验证源码，不会发布网站，也不需要 Cloudflare 密钥。

## 在自己的 Cloudflare 账号部署

1. 当前项目已按用户确认配置 D1 Database ID：`95db5a47-b245-4ffa-a2b3-477408f52a85`，正式构建会自动使用它，无需重复创建数据库或填写 ID。打开 **Storage & databases → D1 SQL database**，选择这个数据库。若部署到另一个 Cloudflare 账号，请创建自己的数据库，并用下表的构建变量覆盖 ID。
2. 打开新数据库的 **Console**，先清空输入框，再复制 [deployment/initialize.sql](deployment/initialize.sql) 的全部内容，粘贴后点击 **Execute**。粘贴的内容应从 `CREATE TABLE` 开始，不包含控制台的 `>` 提示符。文件没有 `--` 行注释，复制时即使丢失换行也能执行；旧版若提示 `No SQL statements detected`，请用此版本替换整个输入框。完成后会列出六张表：`rooms`、`players`、`ballots`、`portraits`、`host_sessions`、`host_login_limits`。这份初始化 SQL 只创建不存在的表和索引，不删除已有数据。它用于首次部署；后续升级按顺序执行 `drizzle/` 中尚未应用的迁移，已经执行过的迁移不要重放。若之前已有原来的四张表，本次也可只执行 `drizzle/0001_host_auth.sql`。
3. 在 **Workers & Pages → Create application → GitHub** 选择 `the1valid/borodin-game`，Worker 名称填 **borodin-game**，分支选 `main`，项目目录用仓库根目录。
4. 构建命令填 **`pnpm run build:cloudflare`**，部署命令填 **`pnpm run deploy:cloudflare`**。在构建环境变量中添加下表中的必需设置，然后保存并部署。正式构建使用上面已确认的数据库 ID，普通本地构建仍使用占位 ID，不能通过正式部署脚本发布。
5. 打开 Worker 的 **Settings → Variables and Secrets → Add**，类型选 **Secret**，名称填 **HOST_PASSWORD**，值填自己生成的至少 16 位随机密码，保存并部署。这个是运行时密钥，不是构建变量；不用发给别人，也不要提交到 GitHub。未设置密码时，主持人登录保持关闭。
6. 打开部署得到的 HTTPS 网址，点击“登录并创建房间”，用主持人密码登录。玩家使用昵称和房间码加入，不需要密码。先用主持人和两部手机验证一轮，再组织正式活动。

| 构建变量 | 值 | 必需 |
| --- | --- | --- |
| `NODE_VERSION` | `22` | 建议设置 |
| `PNPM_VERSION` | `11.25.0` | 是 |
| `BORODIN_D1_DATABASE_ID` | 已默认配置当前项目 ID；使用其他数据库时填写其 Database ID | 否 |
| `BORODIN_D1_DATABASE_NAME` | 默认 `borodin-game-db`；名称不同时填写实际名称 | 否 |
| `BORODIN_R2_BUCKET` | 已创建的 R2 存储桶名称，例如 `borodin-game-images` | 否 |

**可以先不开通 R2。** 不填写 `BORODIN_R2_BUCKET` 时，独立部署不会创建 R2 绑定，页面使用项目内人物图片或姓名占位，并隐藏上传入口；多人投票完整保留。以后需要网页上传图片，再创建私有 R2 桶、填写这个构建变量并重新部署。数据库绑定名 `DB` 和图片绑定名 `BUCKET` 由构建配置生成，无需申请 S3 密钥。

独立模式使用一个主持人管理账号，12 小时登录会话保存在 D1，浏览器只保存 HttpOnly Cookie。更改 `HOST_PASSWORD` 会使旧登录会话失效；同一来源 IP 每 15 分钟最多尝试登录 10 次。建房和素材管理只接受有效会话，不信任浏览器提交的 Sites 身份请求头。房间主持密钥与登录会话是不同凭据：退出登录会清除当前浏览器保存的主持身份，但不会撤销其他设备已持有的房间密钥，不要分享这些密钥。

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

独立 Cloudflare 版本的参与者可以访问游戏网址并使用昵称加入；创建房间和上传素材需要主持人登录。原 Sites 站点的访问权限与房间码仍是两个层次：分享原 Sites 网址时，还需在该站点的共享设置中授权参与者。

## 添加人物图片

配置 R2 后，直接点击网页右上角“人物素材”上传。支持 PNG / JPG / WebP，单张不超过 5MB，推荐 3:4 竖图。上传由服务器保存，同一主持人创建的房间共享这组素材；Sites 模式下不同拥有者的素材彼此独立。删除图片会恢复默认图片或姓名占位。

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
- `lib/host-auth.ts`、`app/host/login/`：独立主持人登录、会话与限流。
- `db/schema.ts`、`drizzle/`：数据结构与数据库迁移。
- `tests/multiplayer.mjs`：独立玩家与共享存储集成测试。
- `tests/classroom.mjs`：一名主持人与 30 位玩家的本地 Worker HTTP 测试，使用独立的本地 D1 数据，不连接线上房间。

## 技术与运行

React / TypeScript / Vinext，Cloudflare Workers 服务端，D1 保存房间与投票，R2 保存图片。浏览器每 2.5 秒获取房间状态，短暂断线后自动重试；后台页面可能被浏览器降低刷新频率。共享数据来自服务器，本地存储只保存参与身份。

当前使用目标是一名主持人与约 30 位参与者。程序允许每个房间最多 100 个参与身份，主持人不占投票人数；100 是程序限制，不代表已做百人真机负载测试。昵称参与采用浏览器身份，不能保证一个自然人只创建一个身份；适合课堂讨论，不适合作为严格身份认证的考试或正式选举。

开发需要 Node.js >= 22.13。保留锁文件，用项目所配置的包管理器安装依赖。常用命令：

```sh
npm run dev
npm run db:generate
npm run build
node node_modules/typescript/bin/tsc --noEmit
node tests/multiplayer.mjs
pnpm run test:classroom
```

`test:classroom` 需要先完成 `pnpm run build`。它会启动仅监听本机的 Worker，模拟 30 个独立玩家并发加入、按 2.5 秒间隔获取状态、完成四轮投票、重复提交、改票、截止后拒投及导出校验。测试数据保存在已忽略的 `.sites-runtime/classroom-*` 目录，测试结束后关闭测试服务。它验证本地生产构建的 HTTP 行为，不替代线上网络或 30 台真实手机的联测。

`.openai/hosting.json` 保留原 Sites 项目信息；托管 Sites 构建仍可使用其认证，独立部署默认使用密码认证。独立本地运行时，在项目根目录创建未跟踪的 `.dev.vars`，填写 `HOST_PASSWORD=自己设置的至少16位密码`。先构建生成 Worker 配置，再按顺序应用未执行的 D1 迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_watery_wallow.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_host_auth.sql
```

本地数据与线上数据彼此独立。不要重放已执行的迁移；不要提交运行时数据、密钥、用户图片或浏览器存储。

本地开发用 `pnpm run dev`，主持人在 `/host/login` 输入 `.dev.vars` 中设置的密码。`.dev.vars` 是本地文件，线上密码仍须设置在 Cloudflare Worker 的运行时 Secret 中。

## 已检查与待验证

集成测试覆盖：两位独立参与者、同时投票、改票不增票、隐藏投票中统计、平票、零票、票数较多分支、截止后拒投、主持人版本冲突、刷新恢复、跨房间权限、四轮完整流程、导出权限、图片格式校验、共享图片与不同拥有者的素材隔离。

30 位独立玩家加一名主持人的本地 Worker HTTP 测试覆盖四轮共 120 张最终有效票、同步轮询、并发投票、重复请求、改票、结果一致性、截止后拒投和完整导出。测试同时走真实密码登录接口；认证集成测试另覆盖伪造身份头、跨来源请求、错误密码、会话过期、密码轮换、退出登录及限流。最新检查结果见 GitHub Actions。

本次环境未提供支持的浏览器测试入口，尚未做手机、投影屏幕和真实多设备端到端联测。正式活动前建议用主持人与两部手机走完一轮，并确认所有人的网络都能访问站点。
