import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { Server as SocketServer } from "socket.io";

const app = express();
app.use(express.json({ limit: "512kb" }));

const corsOrigin = process.env.CORS_ORIGIN || "*";
const corsOpts = {
  origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((s) => s.trim())
};
app.use(cors(corsOpts));

/* ───────── DeepSeek AI proxy (unchanged) ───────── */

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

app.get("/", (_req, res) => {
  res.send(`<h2 style="font-family:sans-serif">Skill Gomoku Server</h2>
<p>This is the backend server. Go play at:
<a href="https://zzchendom.github.io/skill-gomoku/">https://zzchendom.github.io/skill-gomoku/</a></p>`);
});

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

/* ───────── WebSocket room-based multiplayer ───────── */

const rooms = new Map();
const RECONNECT_GRACE_MS = 20000;

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function generateReconnectToken() {
  return crypto.randomBytes(16).toString("hex");
}

function getRoomBySocket(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  return { code, room };
}

function bindSocketToRoom(socket, code, role) {
  socket.data.roomCode = code;
  socket.data.roomRole = role;
  socket.join(code);
}

function clearSocketRoom(socket) {
  socket.data.roomCode = null;
  socket.data.roomRole = null;
}

function clearReconnectTimer(room, role) {
  const key = role === "black" ? "blackDisconnectTimer" : "whiteDisconnectTimer";
  if (room[key]) {
    clearTimeout(room[key]);
    room[key] = null;
  }
}

function getSocketRoleInRoom(socket, room) {
  if (room.black === socket.id) return "black";
  if (room.white === socket.id) return "white";
  return null;
}

function getOpponentRole(role) {
  return role === "black" ? "white" : "black";
}

function getSocketIdByRole(room, role) {
  return role === "black" ? room.black : room.white;
}

function tryRestoreRoom(socket) {
  const auth = socket.handshake.auth || {};
  const code = String(auth.roomCode || "").trim();
  const reconnectToken = String(auth.reconnectToken || "").trim();

  if (!code || !reconnectToken) {
    return false;
  }

  const room = rooms.get(code);
  if (!room) {
    return false;
  }

  if (room.blackToken === reconnectToken) {
    room.black = socket.id;
    clearReconnectTimer(room, "black");
    bindSocketToRoom(socket, code, "black");
    socket.emit("session-restored", {
      code,
      color: "black",
      started: room.started,
      reconnectToken
    });
    if (room.started && room.white) {
      io.to(room.white).emit("request-state-sync", { targetRole: "black" });
    }
    return true;
  }

  if (room.whiteToken === reconnectToken) {
    room.white = socket.id;
    clearReconnectTimer(room, "white");
    bindSocketToRoom(socket, code, "white");
    socket.emit("session-restored", {
      code,
      color: "white",
      started: room.started,
      reconnectToken
    });
    if (room.started && room.black) {
      io.to(room.black).emit("request-state-sync", { targetRole: "white" });
    }
    return true;
  }

  return false;
}

function leaveCurrentRoom(socket, notifyOpponent = true) {
  const found = getRoomBySocket(socket);
  if (!found) {
    clearSocketRoom(socket);
    return;
  }

  const { code, room } = found;
  const role = getSocketRoleInRoom(socket, room);
  const isBlack = role === "black";
  const isWhite = role === "white";

  if (!isBlack && !isWhite) {
    socket.leave(code);
    clearSocketRoom(socket);
    return;
  }

  const opponentId = isBlack ? room.white : room.black;
  clearReconnectTimer(room, role);
  socket.leave(code);
  clearSocketRoom(socket);
  rooms.delete(code);

  if (notifyOpponent && opponentId) {
    io.to(opponentId).emit("opponent-disconnected");
  }

  console.log(`[room] ${code} dissolved`);
}

const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: corsOpts,
  pingInterval: 15000,
  pingTimeout: 10000,
  connectionStateRecovery: {
    maxDisconnectionDuration: RECONNECT_GRACE_MS,
    skipMiddlewares: true
  }
});

io.on("connection", (socket) => {
  tryRestoreRoom(socket);

  socket.on("create-room", (callback) => {
    leaveCurrentRoom(socket);

    const code = generateRoomCode();
    const reconnectToken = generateReconnectToken();
    rooms.set(code, {
      black: socket.id,
      white: null,
      blackToken: reconnectToken,
      whiteToken: null,
      blackDisconnectTimer: null,
      whiteDisconnectTimer: null,
      started: false,
      pendingUndo: null
    });
    bindSocketToRoom(socket, code, "black");
    console.log(`[room] ${code} created by ${socket.id}`);
    if (typeof callback === "function") callback({ code, reconnectToken, color: "black" });
  });

  socket.on("join-room", (data, callback) => {
    const code = String(data?.code || "").trim();
    const room = rooms.get(code);

    if (!room) {
      return typeof callback === "function" && callback({ error: "房间不存在" });
    }
    if (room.white) {
      return typeof callback === "function" && callback({ error: "房间已满" });
    }
    if (room.black === socket.id) {
      return typeof callback === "function" && callback({ error: "不能加入自己的房间" });
    }

    leaveCurrentRoom(socket);
    room.white = socket.id;
    room.whiteToken = generateReconnectToken();
    room.started = true;
    room.pendingUndo = null;
    bindSocketToRoom(socket, code, "white");
    console.log(`[room] ${code} joined by ${socket.id}`);

    io.to(room.black).emit("opponent-joined", { color: "black", code });
    io.to(room.black).emit("game-started", { color: "black", code });
    io.to(room.white).emit("game-started", { color: "white", code });

    if (typeof callback === "function") {
      callback({
        code,
        color: "white",
        reconnectToken: room.whiteToken,
        waitForStart: true
      });
    }
  });

  socket.on("place-stone", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started) return;
    const player = socket.id === found.room.black ? "black" : "white";
    const mutated = Math.random() < 0.1;
    const placedColor = mutated ? getOpponentRole(player) : player;

    io.to(found.code).emit("stone-placed", {
      row: data.row,
      col: data.col,
      player,
      placedColor,
      mutated
    });
  });

  socket.on("use-skill", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started) return;

    io.to(found.code).emit("skill-used", {
      skillId: data.skillId,
      row: data.row,
      col: data.col,
      warpSource: data.warpSource || null,
      player: socket.id === found.room.black ? "black" : "white"
    });
  });

  socket.on("skip-skill", () => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started) return;

    io.to(found.code).emit("skill-skipped", {
      player: socket.id === found.room.black ? "black" : "white"
    });
  });

  socket.on("new-game-request", () => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started) return;

    found.room.pendingUndo = null;
    io.to(found.code).emit("new-game-sync");
  });

  socket.on("undo-request", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started || !data?.sessionState) return;

    const requesterRole = getSocketRoleInRoom(socket, found.room);
    const opponentRole = getOpponentRole(requesterRole);
    const opponentSocketId = getSocketIdByRole(found.room, opponentRole);
    if (!requesterRole || !opponentSocketId || found.room.pendingUndo) return;

    found.room.pendingUndo = {
      requesterRole,
      sessionState: data.sessionState
    };

    io.to(socket.id).emit("undo-request-pending");
    io.to(opponentSocketId).emit("undo-requested", {
      requesterRole
    });
  });

  socket.on("undo-response", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started || !found.room.pendingUndo) return;

    const responderRole = getSocketRoleInRoom(socket, found.room);
    const { requesterRole, sessionState } = found.room.pendingUndo;
    if (!responderRole || responderRole === requesterRole) return;

    const requesterSocketId = getSocketIdByRole(found.room, requesterRole);
    found.room.pendingUndo = null;

    if (data?.accepted) {
      io.to(found.code).emit("undo-approved", { sessionState });
      return;
    }

    if (requesterSocketId) {
      io.to(requesterSocketId).emit("undo-rejected");
    }
  });

  socket.on("sync-state", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started || !data?.sessionState) return;

    const role = getSocketRoleInRoom(socket, found.room);
    const targetRole = data.targetRole;

    if (targetRole === "black" || targetRole === "white") {
      const targetSocketId = getSocketIdByRole(found.room, targetRole);
      if (targetSocketId) {
        io.to(targetSocketId).emit("state-sync", {
          sessionState: data.sessionState,
          code: found.code,
          color: targetRole
        });
      }
      return;
    }

    io.to(found.code).emit("state-sync", {
      sessionState: data.sessionState,
      code: found.code,
      color: role
    });
  });

  socket.on("chat-message", (data) => {
    const found = getRoomBySocket(socket);
    if (!found || !found.room.started) return;

    const text = String(data?.text || "").trim().slice(0, 120);
    if (!text) return;

    io.to(found.code).emit("chat-message", {
      player: getSocketRoleInRoom(socket, found.room),
      text,
      timestamp: Date.now()
    });
  });

  socket.on("disconnect", () => {
    const found = getRoomBySocket(socket);
    if (!found) {
      clearSocketRoom(socket);
      return;
    }

    const { code, room } = found;
    const role = getSocketRoleInRoom(socket, room);
    if (!role) {
      clearSocketRoom(socket);
      return;
    }

    const opponentRole = getOpponentRole(role);
    const timerKey = role === "black" ? "blackDisconnectTimer" : "whiteDisconnectTimer";

    room[role] = null;
    if (
      room.pendingUndo &&
      (room.pendingUndo.requesterRole === role ||
        getOpponentRole(room.pendingUndo.requesterRole) === role)
    ) {
      room.pendingUndo = null;
    }
    clearSocketRoom(socket);
    clearReconnectTimer(room, role);
    room[timerKey] = setTimeout(() => {
      const refreshed = rooms.get(code);
      if (!refreshed) {
        return;
      }

      if (refreshed[role]) {
        return;
      }

      const remainingOpponentId = getSocketIdByRole(refreshed, opponentRole);

      if (remainingOpponentId) {
        io.to(remainingOpponentId).emit("opponent-disconnected");
      }

      rooms.delete(code);
      console.log(`[room] ${code} dissolved after reconnect grace`);
    }, RECONNECT_GRACE_MS);
  });
});

/* ───────── Start ───────── */

const PORT = Number(process.env.PORT) || 8787;
httpServer.listen(PORT, () => {
  console.log(`skill-gomoku server listening on http://127.0.0.1:${PORT}`);
  console.log("POST /api/gomoku-move  |  GET /health  |  WebSocket rooms");
});
