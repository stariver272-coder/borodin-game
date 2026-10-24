# 鲍罗廷的秘书：三次抉择

一个主持人带领、多人同步投票的中文文字游戏项目。当前包含三幕、四次投票。第三幕参考 `content/GEA2000小剧场（2）(1).docx`，呈现农民代表、国民党合作方联络代表与鲍罗廷的虚构政策磋商；参与者各自阅读两段会谈，到投票页集合。

## GitHub 托管与部署状态

源码仓库：https://github.com/the1valid/borodin-game

本仓库保存完整游戏源码，并提供独立 Cloudflare 部署配置与主持人密码登录。上传到 GitHub 不等于游戏已经上线；多人版仍需要 Workers 服务和 D1 数据库，不能直接通过 GitHub Pages 运行。

`.github/workflows/check.yml` 会在提交到 `main` 或提出 Pull Request 时安装锁定的依赖，运行 TypeScript 检查、现有多人集成测试、生产构建及 30 人本地 Worker HTTP 测试。此工作流只验证源码，不会发布网站，也不需要 Cloudflare 密钥。

## 在自己的 Cloudflare 账号部署

1. 当前项目已按用户确认配置 D1 Database ID：`95db5a47-b245-4ffa-a2b3-477408f52a85`，正式构建会自动使用它，无需重复创建数据库或填写 ID。打开 **Storage & databases → D1 SQL database**，选择这个数据库。若部署到另一个 Cloudflare 账号，请创建自己的数据库，并用下表的构建变量覆盖 ID。
2. 打开新数据库的 **Console**，先清空输入框，再复制 [deployment/initialize.sql](deployment/initialize.sql) 的全部内容，粘贴后点击 **Execute**。粘贴的内容应从 `CREATE TABLE` 开始，不包含控制台的 `>` 提示符。文件没有 `--` 行注释，复制时即使丢失换行也能执行；旧版若提示 `No SQL statements detected`，请用此版本替换整个输入框。新版初始化会创建八张表：`rooms`、`players`、`ballots`、`portraits`、`host_sessions`、`host_login_limits`、`room_host_presence`、`room_reading_progress`；控制台显示“returned no data”时，单独执行文件末尾的 SELECT 检查。这份初始化 SQL 只创建不存在的表和索引，不删除已有数据。它用于首次部署；后续升级按顺序执行 `drizzle/` 中尚未应用的迁移，已经执行过的迁移不要重放。若之前已有原来的四张表，需依次补上 `drizzle/0001_host_auth.sql`、`drizzle/0002_host_presence.sql` 和 `drizzle/0003_reading_progress.sql`。
3. 在 **Workers & Pages → Create application → GitHub** 选择 `the1valid/borodin-game`，Worker 名称填 **borodin-game**，分支选 `main`，项目目录用仓库根目录。
4. 构建命令填 **`pnpm run build:cloudflare`**，部署命令填 **`pnpm run deploy:cloudflare`**。在构建环境变量中添加下表中的必需设置，然后保存并部署。新克隆的仓库默认使用独立 Cloudflare 配置，普通 `pnpm run build` 也会生成同样的数据库绑定，且默认不绑定 R2。数据库 ID 统一保存在 `deployment/cloudflare.json`；只有原 Sites 的专用执行配置会使用它的平台绑定。
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
3. 主持人点击“进入第一幕”后，每人用“上一段 / 继续下一段”按自己的速度阅读，刷新后恢复个人进度。到投票页后等待主持人开票，投票截止前不能继续下一段。主持人可以看到本轮“已到达 / 总人数”和各人的到达、投票状态，自行决定何时开启、截止投票；主持人的翻页不会推动其他人。
4. 每个参与身份每轮只有一条有效投票，截止前修改会覆盖原票。先只显示已投人数，主持人截止后才公布票数与理由。
5. 政策题多数票决定展示的回应；平票或无人投票时展示双方回应。身份题的剧本设定答案为秘书C，不由多数票改写。揭晓后，下一段显示“现在，你扮演的是秘书H”任务卡：参与者以秘书H的身份阅读各方诉求，在后三次政策投票中提出有依据的建议，点击“以秘书H的身份继续”进入后续选择。
6. 每轮截止并公布结果后，参与者可自行阅读后续剧情，直到下一轮投票页集合。全部投票完成后，主持人可结束讨论；参与者仍能读完历史回顾与终场。最后可导出 TXT 讨论记录。要重新组织一场讨论，创建新房间即可。

同步间隔已调整为 5 秒：房间页打开时，每次请求完成后等待 5 秒继续获取状态，断线后自动重试。主持人关闭页面不会暂停玩家同步，讨论结束后打开的房间页也会继续同步；不需要点击“恢复同步”。要停止某台设备的同步，返回首页或关闭该设备的房间页。更新上线后，主持人与玩家都需刷新旧页面。

本次个人阅读进度功能新增 `room_reading_progress` 表。已有部署需在发布应用前执行一次 [drizzle/0003_reading_progress.sql](drizzle/0003_reading_progress.sql)；它为现有参与者和主持人保留旧房间的当前阅读位置，不改动已有房间或投票。新数据库使用最新版 `deployment/initialize.sql` 即可，不要再重复执行创建同表的迁移。构建与部署脚本不会自动执行数据库迁移。原有 `0002_host_presence` 表保留，当前同步逻辑不再读写该表。

主持人不计票。如需独自体验，用侧栏“打开玩家页试投票”另开一个标签页，作为参与者加入。不要分享主持人的浏览器存储或密钥。

独立 Cloudflare 版本的参与者可以访问游戏网址并使用昵称加入；创建房间和上传素材需要主持人登录。原 Sites 站点的访问权限与房间码仍是两个层次：分享原 Sites 网址时，还需在该站点的共享设置中授权参与者。

## 添加人物图片

配置 R2 后，直接点击网页右上角“人物素材”上传。支持 PNG / JPG / WebP，单张不超过 5MB，推荐 3:4 竖图。上传由服务器保存，同一主持人创建的房间共享这组素材；Sites 模式下不同拥有者的素材彼此独立。删除图片会恢复默认图片或姓名占位。

也可以编辑项目：

- 把图片放入 `public/characters/`，例如 `public/characters/borodin.webp`。
- 在 `content/剧情台本.txt` 中找到相应的【人物 编号】，将“图片：”设为 `/characters/borodin.webp`。
- 网页上传的图片优先于项目默认图。修改项目文件后需重新构建并发布；网页上传保存后自动生效。

人物 ID：`borodin`、`secretary_c`、`secretary_h`、`liaison`、`farmer`、`landlord_zhou`、`military_liaison`。没有图片也能完整游玩。

## 修改台本

直接编辑 [content/剧情台本.txt](content/剧情台本.txt)。这是游戏内容的唯一编辑来源，可用记事本或 VS Code 打开并以 UTF-8 保存。文档按游戏顺序包含人物资料、开场、全部对话、投票问题与选项、分支回应与追问、秘书C身份揭晓、秘书H任务、历史回顾和终场讨论；这些内容都由游戏实际读取。

保留“【场景 scene-1】”等编号、字段名、投票编号和选项字母，只修改中文正文即可。台词写法如下：

```text
台词：
  旁白：这里填写旁白。
  秘书H：这里填写你修改后的台词。
  鲍罗廷：这里填写回应。
```

每条台词前保留两个空格；同一条台词要换行时，续行前保留四个空格。任务目标、线索和关键词的每项保留“- ”前缀。文档开头还有编辑说明。人物姓名也在同一份文档中；改名时同步修改发言人姓名。图片字段留空也能正常游戏。

投票页可用“说明框标题”和“说明框条目”添加选项上方的提示框，条目格式为 `  - 小标题：内容`。第一幕 `scene-6` 已用它整理共识、分歧、目标和承诺；你可以直接修改这些文字，也可将两个字段一起删去以隐藏说明框。“任务标题”和“揭晓补充”可以省略；省略任务标题仍会保留任务说明、目标及继续按钮。

对话页也支持这两个说明框字段，会显示在标题与台词之间。第二幕 `scene-8` 的“背景小注 · 整理党务案”按背景、规定、影响三项作简要介绍，可直接在台本中修改。

- `npm run story:check`：只检查格式，错误会指出文档行号，不覆盖已经生成的内容。
- `npm run story:sync`：读取文档并更新游戏数据。
- `npm run dev`：启动时读取文档；保存文档后自动转换并刷新开发预览。
- `npm run build` / `npm run build:cloudflare`：构建前自动读取文档。线上网站需重新构建并部署，保存本机文件不会直接改变线上内容。

历史回顾可添加可选字段 `参考答案：内容`，如第一幕 `scene-7` 的讨论题。答案默认隐藏，主持人点击“揭开答案”后，同房间参与者在下次同步时看到（约 5 秒）；刷新或翻回该页仍可查看，揭晓不改变个人阅读进度。删除该字段即可取消这道题的答案区域。已有数据库在部署本功能前需执行一次 `drizzle/0004_discussion_answers.sql`，用于保存各房间的揭晓状态。

政策投票可添加 `选项 A 参考答案`、`选项 B 参考答案` 等可选字段，如 `scene-9`、`scene-13`。答案在投票结束后显示为可展开的讨论参考，各人自行点击“揭开参考答案”或收起，互不影响，也不会增加同步请求或数据库写入。所有带参考答案的选项均可查看，多数选项的回应优先显示；答案的每行续文缩进两个空格，页面按段落显示。刷新或离开该段后重新进入，答案恢复收起。这些可自行展开的内容生成在 `content/story.json` 中。

说明框可以只保留标题；作品的 `说明`、投票的 `理由提示`、终场的 `讨论引导`、`讨论补充`、`结语` 均可省略。第三幕参考答案的论文出处和阅读范围见 `content/scene-13-14研究参考.txt`；游戏内容仍以 `剧情台本.txt` 为准。

`content/story.json`、`content/characters.json` 和仅供服务端读取的 `content/answers.json` 是自动生成的运行数据，请不要直接编辑，它们会被文档内容覆盖。页面布局、登录与投票等通用操作文案仍在 `app/game.tsx`。新增/删除场景、调整顺序或变更投票编号前，应先结束正在进行的活动；普通文字修改保留原有场景编号。

`npm run test:story` 验证转换、换行、格式错误、身份揭晓和结尾内容读取；多人测试也会先读取最新文档。

## 项目结构

- `content/剧情台本.txt`：可直接编辑的完整游戏台本。
- `scripts/story-document.mjs`：台本文档解析、校验和数据生成。
- `app/game.tsx`：首页、房间、投票、结果、素材管理界面。
- `app/globals.css`：深绿与纸张色的响应式布局。
- `app/api/room/route.ts`：创建、加入、同步、投票与主持操作。
- `app/api/characters/route.ts`：人物图片上传与管理。
- `app/api/images/[key]/route.ts`：读取上传图片。
- `lib/engine.ts`：服务端房间权限、投票约束与结果统计。
- `lib/host-auth.ts`、`app/host/login/`：独立主持人登录、会话与限流。
- `db/schema.ts`、`drizzle/`：数据结构与数据库迁移。
- `tests/multiplayer.mjs`：独立玩家与共享存储集成测试。
- `tests/classroom.mjs`：一名主持人与 30 位玩家的本地 Worker HTTP 测试，直接通过 Miniflare 启动构建产物，使用独立的本地 D1 数据，不连接线上房间。测试保留并发请求与 30 秒超时，跳过 Wrangler CLI 的额外开发代理。

## 技术与运行

React / TypeScript / Vinext，Cloudflare Workers 服务端，D1 保存房间、个人阅读进度与投票，R2 保存图片。浏览器每次请求完成后等待 5 秒获取房间状态，断线后自动重试；后台页面可能被浏览器降低刷新频率。共享数据来自服务器，本地存储只保存参与身份。

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

`test:classroom` 需要先完成 `pnpm run build`。它会启动仅监听本机的 Worker，模拟 30 个独立玩家并发加入、分两批独立阅读并核对到达人数、按 5 秒间隔获取状态、完成四轮投票、重复提交、改票、截止后拒投及导出校验。测试数据保存在已忽略的 `.sites-runtime/classroom-*` 目录，测试结束后关闭测试服务。它验证本地生产构建的 HTTP 行为，不替代线上网络或 30 台真实手机的联测。

`.openai/hosting.json` 保留原 Sites 项目信息；托管 Sites 构建仍可使用其认证，独立部署默认使用密码认证。独立本地运行时，在项目根目录创建未跟踪的 `.dev.vars`，填写 `HOST_PASSWORD=自己设置的至少16位密码`。先构建生成 Worker 配置，再按顺序应用未执行的 D1 迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_watery_wallow.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_host_auth.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_host_presence.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_reading_progress.sql
```

本地数据与线上数据彼此独立。不要重放已执行的迁移；不要提交运行时数据、密钥、用户图片或浏览器存储。

本地开发用 `pnpm run dev`，主持人在 `/host/login` 输入 `.dev.vars` 中设置的密码。`.dev.vars` 是本地文件，线上密码仍须设置在 Cloudflare Worker 的运行时 Secret 中。

## 已检查与待验证

集成测试覆盖：独立前后翻页、刷新恢复阅读位置、到达人数增减及主持人不计入人数、重复翻页请求、投票边界、秘书H任务交接、投票结束后自主继续阅读、两位独立参与者、同时投票、改票不增票、隐藏投票中统计、平票、零票、票数较多分支、截止后拒投、主持人版本冲突、刷新恢复、跨房间权限、四轮完整流程、导出权限、图片格式校验、共享图片与不同拥有者的素材隔离。

30 位独立玩家加一名主持人的本地 Worker HTTP 测试覆盖四轮共 120 张最终有效票、同步轮询、并发投票、重复请求、改票、结果一致性、截止后拒投和完整导出。测试同时走真实密码登录接口；认证集成测试另覆盖伪造身份头、跨来源请求、错误密码、会话过期、密码轮换、退出登录及限流。最新检查结果见 GitHub Actions。

本次环境未提供支持的浏览器测试入口，尚未做手机、投影屏幕和真实多设备端到端联测。正式活动前建议用主持人与两部手机走完一轮，并确认所有人的网络都能访问站点。
