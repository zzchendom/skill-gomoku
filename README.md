# 技能五子棋

赛博霓虹风格的技能五子棋，在经典五连珠之上叠加技能系统与 AI 对战。

## 当前功能

- 15x15 棋盘
- 本地双人轮流落子
- 五连判胜
- 3 连触发小技能，4 连触发大技能
- 首版技能：封锁、冲击、爆破、转化
- 战斗日志、胜负弹层、最近一步高亮
- 玩家 vs AI 模式、难度档位、思考遮罩
- 盘面统计（黑 / 白 / 空子数）与键盘快捷键（N/U/S/Esc）
- 玩家 vs AI 时可切换 **本地引擎** / **DeepSeek 代理**（通过自建后端转发，见下方接口约定）
- 附带 **`proxy-server/`** 通用代理：密钥只放服务器，几个朋友共用同一代理 URL；根目录 **`config.js`** 可写默认 `defaultProxyUrl` 方便分发

## 朋友共用的通用代理（小规模推荐）

1. 一人按 [proxy-server/README.md](proxy-server/README.md) 部署服务，设置环境变量 `DEEPSEEK_API_KEY`；建议再加 `FRIEND_TOKEN`，避免公网被陌生人调用。
2. 把公网地址（如 `https://你的服务/api/gomoku-move`）写进仓库里的 **`config.js`** → `defaultProxyUrl`；若启用了 `FRIEND_TOKEN`，把同一串口令写进 `defaultProxyToken`（**仅适合私有仓库或小群分发**，公开仓库不要提交 Token）。
3. 其他人直接打开前端页面，选「玩家 vs AI」→「DeepSeek 代理」，无需再填 URL 即可走共用代理（仍可在浏览器里覆盖保存）。

## DeepSeek / 大模型代理接口（实验）

前端**不会**把 DeepSeek 密钥写进仓库。可运行本仓库的 `proxy-server`，或在浏览器里填代理 URL；可选 `Authorization: Bearer <token>` 与服务器 `FRIEND_TOKEN` 一致。

**请求** `POST`，`Content-Type: application/json`，示例字段：

- `version`: `1`
- `game`: `"skill-gomoku"`
- `board`: `15x15` 二维数组，元素为 `null` / `"black"` / `"white"`
- `currentPlayer`: 当前行棋方（AI 落子时为 `"white"`）
- `legalMoves`: `{ row, col }[]` 合法落点（0-based）
- `difficulty`: `"easy"` | `"normal"` | `"hard"`
- `turn`: 当前手数

**响应** JSON，必须包含合法落点：

```json
{ "row": 7, "col": 7 }
```

`row` / `col` 须为整数、在棋盘内、为空位、且在 `legalMoves` 中，否则前端会丢弃并回退本地引擎。

代理服务内再调用 DeepSeek 等模型，把盘面描述进提示词，最后输出一个 JSON 落点即可。

## 技能规则

- 新形成 3 连：可在本回合释放一个小技能
- 新形成 4 连：可在本回合释放一个大技能
- 每回合最多触发 1 次技能
- 技能造成的盘面变化不会在本回合直接判胜

## 技术栈

- HTML
- CSS
- JavaScript

## 后续迭代方向

- 接入更完整的 AI 对战
- 增加更强的特效与音效
- 丰富技能池与角色设定
