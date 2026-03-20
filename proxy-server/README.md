# 技能五子棋 · 通用 DeepSeek 代理

给**几个朋友小规模共用**：只部署**一台**服务，**DeepSeek 密钥只放在服务器**，大家前端填同一个代理地址即可。

## 快速本地跑

```bash
cd proxy-server
copy .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
npm install
npm start
```

默认监听 `http://127.0.0.1:8787`，前端代理 URL 填：

`http://127.0.0.1:8787/api/gomoku-move`

（局域网朋友访问时，把 `127.0.0.1` 换成你电脑的局域网 IP。）

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | 必填，DeepSeek 控制台创建的 Key |
| `FRIEND_TOKEN` | 可选，设置后前端必须在「Bearer Token」里填同一串，防止陌生人白嫖你的 Key |
| `CORS_ORIGIN` | 默认 `*`，生产可改为 `https://你的静态站.com` |
| `PORT` | 默认 `8787` |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |

## 部署到公网（朋友共用）

任选：Railway、Render、Fly.io、自己的 VPS 等。

1. 把本目录上传/连接仓库，启动命令 `npm start`，Node 18+。
2. 在平台配置里设置 `DEEPSEEK_API_KEY`，建议再设 `FRIEND_TOKEN`。
3. 把公网 HTTPS 地址发给朋友，例如：`https://xxx.onrender.com/api/gomoku-move`
4. 在前端项目根目录的 `config.js` 里填 `defaultProxyUrl`（和可选的 `defaultProxyToken`），大家拉同一份前端或你发他们一个打包 zip。

## 接口

与主项目 README 一致：`POST` JSON，返回 `{ row, col }`。

健康检查：`GET /health`
