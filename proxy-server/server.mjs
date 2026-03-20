import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({ limit: "512kb" }));

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(
  cors({
    origin:
      corsOrigin === "*"
        ? true
        : corsOrigin.split(",").map((s) => s.trim())
  })
);

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function boardToAscii(board) {
  const lines = [];
  for (let r = 0; r < board.length; r += 1) {
    let line = "";
    for (let c = 0; c < board[r].length; c += 1) {
      const cell = board[r][c];
      line += cell === "black" ? "B" : cell === "white" ? "W" : ".";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("invalid json");
  }
}

function validateMove(data, legalMoves) {
  const row = Number(data?.row);
  const col = Number(data?.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  const ok = legalMoves.some((m) => m.row === row && m.col === col);
  return ok ? { row, col } : null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "skill-gomoku-proxy" });
});

app.post("/api/gomoku-move", async (req, res) => {
  const friendToken = process.env.FRIEND_TOKEN;
  if (friendToken) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== friendToken) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "server_missing_deepseek_key" });
  }

  const body = req.body || {};
  const board = body.board;
  const legalMoves = body.legalMoves;
  const currentPlayer = body.currentPlayer;
  const difficulty = body.difficulty || "normal";

  if (!Array.isArray(board) || !Array.isArray(legalMoves)) {
    return res.status(400).json({ error: "invalid_body" });
  }

  if (currentPlayer !== "white") {
    return res.status(400).json({ error: "only_white_supported" });
  }

  if (legalMoves.length === 0) {
    return res.status(400).json({ error: "no_legal_moves" });
  }

  const ascii = boardToAscii(board);
  const movesStr = legalMoves.map((m) => `(${m.row},${m.col})`).join(" ");

  const system = `你是五子棋（15x15）AI，执白子 W，对手执黑子 B。棋盘字符：B=黑，W=白，.=空。
你必须只从给定的合法落点中选一个。难度偏好：${difficulty}。
只输出一行合法 JSON，不要 markdown，格式严格为：{"row":行号,"col":列号}
行号列号均为 0-14 的整数，且必须出现在合法落点列表中。`;

  const user = `当前棋盘（每行15格）：\n${ascii}\n\n合法落点（row,col）：${movesStr}\n请输出 JSON。`;

  try {
    const dsRes = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.3,
        max_tokens: 80,
        response_format: { type: "json_object" }
      })
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      console.error("deepseek_http", dsRes.status, errText.slice(0, 500));
      return res.status(502).json({ error: "deepseek_upstream", status: dsRes.status });
    }

    const dsJson = await dsRes.json();
    const content = dsJson?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return res.status(502).json({ error: "deepseek_empty_content" });
    }

    const parsed = extractJsonObject(content);
    const move = validateMove(parsed, legalMoves);
    if (!move) {
      return res.status(502).json({ error: "invalid_model_move", raw: parsed });
    }

    return res.json(move);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "proxy_exception" });
  }
});

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`skill-gomoku proxy listening on http://127.0.0.1:${PORT}`);
  console.log("POST /api/gomoku-move  |  GET /health");
});
