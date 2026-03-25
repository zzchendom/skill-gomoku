const BOARD_SIZE = 15;
const WIN_LENGTH = 5;
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];

const SFX = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  }

  function tone(freq, duration, type = "sine", gain = 0.18) {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }

  function noise(duration, gain = 0.08) {
    const ac = getCtx();
    const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(g).connect(ac.destination);
    src.start();
  }

  return {
    place() {
      tone(880, 0.08, "triangle", 0.13);
      noise(0.04, 0.06);
    },
    trigger() {
      tone(660, 0.12, "sine", 0.12);
      setTimeout(() => tone(880, 0.12, "sine", 0.12), 80);
      setTimeout(() => tone(1100, 0.18, "sine", 0.10), 160);
    },
    skillCast(id) {
      const map = {
        block:   () => { tone(300, 0.25, "square", 0.09); tone(260, 0.30, "square", 0.07); },
        shock:   () => { tone(200, 0.06, "sawtooth", 0.12); setTimeout(() => tone(400, 0.10, "sawtooth", 0.10), 60); },
        blast:   () => { noise(0.35, 0.14); tone(120, 0.35, "sawtooth", 0.10); },
        convert: () => { tone(440, 0.15, "sine", 0.10); setTimeout(() => tone(660, 0.20, "sine", 0.12), 100); },
        warp:    () => { tone(1200, 0.08, "sine", 0.10); setTimeout(() => tone(600, 0.15, "sine", 0.12), 70); },
        siphon:  () => { tone(180, 0.20, "sawtooth", 0.08); setTimeout(() => { tone(360, 0.15, "sine", 0.10); noise(0.20, 0.06); }, 120); }
      };
      (map[id] || map.block)();
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, 0.35, "sine", 0.14), i * 120)
      );
    },
    error() {
      tone(180, 0.15, "square", 0.08);
    },
    click() {
      tone(1000, 0.04, "triangle", 0.06);
    },
    newGame() {
      tone(440, 0.10, "triangle", 0.08);
      setTimeout(() => tone(660, 0.10, "triangle", 0.08), 80);
    }
  };
})();

const SKILLS = {
  block: {
    id: "block",
    tier: "small",
    name: "玄封",
    description: "以上古封印之术禁锢一处空位，对手下一手不可落于此。"
  },
  shock: {
    id: "shock",
    tier: "small",
    name: "飞沙走石",
    description: "掀起狂沙，将紧邻落点的一枚敌子击退一格；前方无空位则无效。"
  },
  warp: {
    id: "warp",
    tier: "small",
    name: "缩地成寸",
    description: "道家神通——将紧邻落点的一枚己子瞬移至棋盘任意空位。"
  },
  blast: {
    id: "blast",
    tier: "large",
    name: "天崩地裂",
    description: "共工之怒，十字范围内一切敌子尽数崩灭。"
  },
  convert: {
    id: "convert",
    tier: "large",
    name: "移花接木",
    description: "阴阳化转，将紧邻落点的一枚敌子化为己方棋子；本回合不直接判胜。"
  },
  siphon: {
    id: "siphon",
    tier: "large",
    name: "鲲鹏吞噬",
    description: "鲲鹏展翅，菱形两格范围内所有敌子被吞入虚空。"
  }
};

const PHASE_LABELS = {
  opening: "决定先手",
  placing: "落子中",
  skillSelect: "选择技能",
  targeting: "锁定目标",
  gameover: "对局结束"
};

const PLAYER_LABELS = {
  black: "夜幕执子",
  white: "星辉执子"
};

const DIFFICULTY_LABELS = {
  easy: "休闲",
  normal: "标准",
  hard: "硬核"
};

const STORAGE_PROXY_URL = "skill-gomoku-ai-proxy-url";
const STORAGE_PROXY_TOKEN = "skill-gomoku-ai-proxy-token";
const STORAGE_ONLINE_TOKEN = "skill-gomoku-online-token";
const ROOM_ACK_TIMEOUT_MS = 20000;
const ONLINE_SERVER_WAKE_TIMEOUT_MS = 65000;
const ONLINE_SERVER_WAKE_RETRY_MS = 2500;
const ONLINE_RECONNECT_GRACE_MS = 20000;
const ONLINE_SOCKET_RECONNECT_ATTEMPTS = 12;
const ONLINE_SOCKET_RECONNECT_DELAY_MS = 1500;
const ONLINE_SOCKET_RECONNECT_DELAY_MAX_MS = 5000;
const COUNTRYSIDE_MORPH_CHANCE = 0.1;
const GHOST_WALL_SKILL = {
  id: "ghost-wall",
  name: "鬼打墙",
  description: "连输三局后觉醒。本局若对手形成四连或直接五连，会悄然偷走其关键一子并化解杀机。"
};
const COUNTRYSIDE_MORPH_SKILL = {
  id: "countryside-morph",
  name: "城乡变形记",
  description: "下子时有 10% 概率突然变成对方颜色，整活全场可见。"
};
const OPENING_GAMES = [
  {
    id: "fast-click",
    title: "手速碰瓷赛",
    description: "谁先拍下“我先来”，谁就拿到先手。主打一个手快有、手慢无。",
    buttons: [{ id: "tap", label: "我先来" }],
    resolveMode: "speed-first",
    offlineReady: false
  },
  {
    id: "slow-click",
    title: "谦让杯",
    description: "谁最后按下“您先请”，谁反而先手。礼貌到极致就是偷跑。",
    buttons: [{ id: "wait", label: "您先请" }],
    resolveMode: "speed-last",
    offlineReady: false
  },
  {
    id: "dice-high",
    title: "骰子莽夫局",
    description: "一键掷骰，点数大的先走。运气这件事，先吹再说。",
    buttons: [{ id: "roll", label: "掷骰子" }],
    resolveMode: "roll-high",
    offlineReady: true
  },
  {
    id: "dice-low",
    title: "反向欧皇局",
    description: "谁摇得更小谁先手。今天不拼上限，专拼低保。",
    buttons: [{ id: "roll", label: "反向掷骰" }],
    resolveMode: "roll-low",
    offlineReady: true
  },
  {
    id: "coin",
    title: "硬币甩锅术",
    description: "猜正反面。猜中者先手；都猜中或都猜错，就看谁下手更快。",
    buttons: [
      { id: "heads", label: "正面" },
      { id: "tails", label: "反面" }
    ],
    resolveMode: "coin",
    offlineReady: true
  },
  {
    id: "parity",
    title: "单还是双",
    description: "系统摇一个神秘数字，猜中单双的人先手。没猜中也别装懂王。",
    buttons: [
      { id: "odd", label: "单数" },
      { id: "even", label: "双数" }
    ],
    resolveMode: "parity",
    offlineReady: true
  },
  {
    id: "door",
    title: "土味幸运门",
    description: "三扇门里藏着先手权。点一扇，开错了就当节目效果。",
    buttons: [
      { id: "left", label: "踹左门" },
      { id: "middle", label: "踹中门" },
      { id: "right", label: "踹右门" }
    ],
    resolveMode: "door",
    offlineReady: true
  },
  {
    id: "rps",
    title: "塑料猜拳王",
    description: "石头剪刀布，一把定先手。赢了叫谋略，输了叫网络延迟。",
    buttons: [
      { id: "rock", label: "石头" },
      { id: "paper", label: "布" },
      { id: "scissors", label: "剪刀" }
    ],
    resolveMode: "rps",
    offlineReady: true
  },
  {
    id: "mood",
    title: "老板心情测试",
    description: "猜老板今天更想看你“开工”还是“摸鱼”。猜中就先手，猜错先挨骂。",
    buttons: [
      { id: "work", label: "开工" },
      { id: "slack", label: "摸鱼" }
    ],
    resolveMode: "mood",
    offlineReady: true
  }
];

const awakeningProgress = {
  black: {
    loseStreak: 0
  },
  white: {
    loseStreak: 0
  }
};

function getDefaultProxyUrl() {
  return (
    (typeof window !== "undefined" &&
      window.SKILL_GOMOKU_CONFIG?.defaultProxyUrl?.trim()) ||
    ""
  );
}

function getDefaultProxyToken() {
  return (
    (typeof window !== "undefined" &&
      window.SKILL_GOMOKU_CONFIG?.defaultProxyToken) ||
    ""
  );
}

function getEffectiveProxyUrl() {
  return (
    sessionStorage.getItem(STORAGE_PROXY_URL)?.trim() || getDefaultProxyUrl()
  );
}

function getEffectiveProxyToken() {
  return (
    sessionStorage.getItem(STORAGE_PROXY_TOKEN) || getDefaultProxyToken() || ""
  );
}

function getServerUrl() {
  return (
    (typeof window !== "undefined" &&
      window.SKILL_GOMOKU_CONFIG?.defaultServerUrl?.trim()) ||
    getDefaultProxyUrl().replace(/\/api\/gomoku-move$/, "") ||
    ""
  );
}

function getStoredOnlineToken() {
  return sessionStorage.getItem(STORAGE_ONLINE_TOKEN) || "";
}

function refreshOnlineSocketAuth() {
  if (onlineSocket) {
    onlineSocket.auth = {
      roomCode: onlineRoomCode,
      reconnectToken: onlineReconnectToken
    };
  }
}

function setStoredOnlineToken(token) {
  if (token) {
    sessionStorage.setItem(STORAGE_ONLINE_TOKEN, token);
  } else {
    sessionStorage.removeItem(STORAGE_ONLINE_TOKEN);
  }
  onlineReconnectToken = token || "";
  refreshOnlineSocketAuth();
}

let onlineSocket = null;
let onlineColor = null;
let onlineRoomCode = null;
let onlineReconnectToken = getStoredOnlineToken();
const onlineLobby = {
  action: "idle",
  connectPromise: null,
  warmupPromise: null
};

const dom = {
  board: document.querySelector("#board"),
  message: document.querySelector("#message"),
  boardToast: document.querySelector("#board-toast"),
  modeLabel: document.querySelector("#mode-label"),
  turnLabel: document.querySelector("#turn-label"),
  phaseLabel: document.querySelector("#phase-label"),
  triggerLabel: document.querySelector("#trigger-label"),
  statsLabel: document.querySelector("#stats-label"),
  blackBadge: document.querySelector("#black-badge"),
  whiteBadge: document.querySelector("#white-badge"),
  skillHint: document.querySelector("#skill-hint"),
  skillList: document.querySelector("#skill-list"),
  logList: document.querySelector("#log-list"),
  chatCard: document.querySelector("#chat-card"),
  chatList: document.querySelector("#chat-list"),
  chatInput: document.querySelector("#chat-input"),
  chatSend: document.querySelector("#chat-send"),
  modeLocal: document.querySelector("#mode-local"),
  modeAi: document.querySelector("#mode-ai"),
  aiThinkingLayer: document.querySelector("#ai-thinking-layer"),
  aiDifficultyLabel: document.querySelector("#ai-difficulty-label"),
  aiDifficultyRow: document.querySelector("#ai-difficulty-row"),
  aiEngineRow: document.querySelector("#ai-engine-row"),
  aiProxyPanel: document.querySelector("#ai-proxy-panel"),
  engineLocal: document.querySelector("#engine-local"),
  engineProxy: document.querySelector("#engine-proxy"),
  proxyUrl: document.querySelector("#proxy-url"),
  proxyToken: document.querySelector("#proxy-token"),
  proxySave: document.querySelector("#proxy-save"),
  difficultyButtons: document.querySelectorAll(".difficulty-button"),
  newGame: document.querySelector("#new-game"),
  undoMove: document.querySelector("#undo-move"),
  skipSkill: document.querySelector("#skip-skill"),
  winnerModal: document.querySelector("#winner-modal"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerText: document.querySelector("#winner-text"),
  modalNewGame: document.querySelector("#modal-new-game"),
  noticeModal: document.querySelector("#notice-modal"),
  noticeTitle: document.querySelector("#notice-title"),
  noticeText: document.querySelector("#notice-text"),
  noticeConfirm: document.querySelector("#notice-confirm"),
  openingGameModal: document.querySelector("#opening-game-modal"),
  openingGameTitle: document.querySelector("#opening-game-title"),
  openingGameDesc: document.querySelector("#opening-game-desc"),
  openingGameButtons: document.querySelector("#opening-game-buttons"),
  openingGameStatus: document.querySelector("#opening-game-status"),
  undoModal: document.querySelector("#undo-modal"),
  undoText: document.querySelector("#undo-text"),
  undoApprove: document.querySelector("#undo-approve"),
  undoReject: document.querySelector("#undo-reject"),
  welcomeModal: document.querySelector("#welcome-modal"),
  welcomeModeSelect: document.querySelector("#welcome-mode-select"),
  welcomeRoomPanel: document.querySelector("#welcome-room-panel"),
  roomBack: document.querySelector("#room-back"),
  roomCreate: document.querySelector("#room-create"),
  roomJoin: document.querySelector("#room-join"),
  roomCodeInput: document.querySelector("#room-code-input"),
  roomStatus: document.querySelector("#room-status"),
  roomStatusText: document.querySelector("#room-status-text"),
  roomCreateLabel: document.querySelector("#room-create .welcome-btn-label"),
  roomJoinLabel: document.querySelector("#room-join")
};

let state = createInitialState();

function createInitialBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function createInitialState(mode = "local-pvp") {
  const loseStreak = structuredClone(awakeningProgress);
  return {
    board: {
      size: BOARD_SIZE,
      cells: createInitialBoard(),
      lastMove: null,
      winningLine: []
    },
    match: {
      currentPlayer: "black",
      turn: 1,
      status: "opening",
      winner: null,
      mode
    },
    skill: {
      pendingTrigger: null,
      selectedSkill: null,
      blockedCells: [],
      warpSource: null
    },
    ui: {
      message: "先占据中心，争取做出 3 连来点亮技能面板。",
      logs: [
        "欢迎来到技能五子棋：五连获胜，3 连触发小技能，4 连触发大技能。"
      ],
      effects: [],
      hoverCell: null,
      boardToast: null
    },
    ai: {
      enabled: mode === "ai",
      provider: "reserved",
      pendingAction: null,
      thinking: false,
      timerId: null,
      difficulty: "normal",
      engine: getDefaultProxyUrl() ? "proxy" : "local"
    },
    online: {
      enabled: mode === "online",
      myColor: null,
      roomCode: null,
      chatMessages: [],
      undoRequest: {
        pendingMine: false,
        pendingIncoming: false
      }
    },
    opening: {
      active: true,
      roundId: null,
      game: null,
      submitted: false,
      currentPicker: "black",
      localActions: {
        black: null,
        white: null
      },
      resultText: ""
    },
    hidden: {
      loseStreak,
      ghostWall: {
        black: {
          armed: loseStreak.black.loseStreak >= 3,
          used: false
        },
        white: {
          armed: loseStreak.white.loseStreak >= 3,
          used: false
        }
      },
      skillLimits: {
        black: {
          lastTurnUsedSkill: false,
          firstNoticeShown: false
        },
        white: {
          lastTurnUsedSkill: false,
          firstNoticeShown: false
        }
      }
    },
    history: []
  };
}

function cloneStateSnapshot() {
  return {
    board: structuredClone(state.board),
    match: structuredClone(state.match),
    skill: structuredClone(state.skill),
    opening: structuredClone(state.opening),
    hidden: structuredClone(state.hidden),
    ui: {
      message: state.ui.message,
      logs: [...state.ui.logs],
      effects: [],
      hoverCell: state.ui.hoverCell
    },
    ai: {
      enabled: state.ai.enabled,
      provider: state.ai.provider,
      pendingAction: state.ai.pendingAction,
      difficulty: state.ai.difficulty,
      engine: state.ai.engine,
      thinking: false,
      timerId: null
    }
  };
}

function restoreSnapshot(snapshot) {
  state = {
    ...state,
    board: snapshot.board,
    match: snapshot.match,
    skill: snapshot.skill,
    opening: snapshot.opening,
    hidden: snapshot.hidden,
    ui: {
      message: snapshot.ui.message,
      logs: snapshot.ui.logs,
      effects: [],
      hoverCell: snapshot.ui.hoverCell,
      boardToast: null
    },
    ai: {
      ...state.ai,
      enabled: snapshot.ai.enabled,
      provider: snapshot.ai.provider,
      pendingAction: snapshot.ai.pendingAction,
      difficulty: snapshot.ai.difficulty ?? state.ai.difficulty,
      engine: snapshot.ai.engine ?? state.ai.engine,
      thinking: false,
      timerId: null
    }
  };
  syncAwakeningProgressFromState();
}

function buildOnlineSessionState() {
  return {
    board: structuredClone(state.board),
    match: structuredClone(state.match),
    skill: structuredClone(state.skill),
    opening: structuredClone(state.opening),
    hidden: structuredClone(state.hidden),
    progress: structuredClone(awakeningProgress),
    ui: {
      message: state.ui.message,
      logs: [...state.ui.logs],
      hoverCell: null
    },
    history: structuredClone(state.history)
  };
}

function applyOnlineSessionState(sessionState) {
  clearAITimer();
  if (sessionState.hidden?.loseStreak) {
    awakeningProgress.black.loseStreak = sessionState.hidden.loseStreak.black?.loseStreak || 0;
    awakeningProgress.white.loseStreak = sessionState.hidden.loseStreak.white?.loseStreak || 0;
  } else if (sessionState.progress) {
    awakeningProgress.black.loseStreak = sessionState.progress.black?.loseStreak || 0;
    awakeningProgress.white.loseStreak = sessionState.progress.white?.loseStreak || 0;
  }
  const currentOnline = {
    ...state.online
  };

  state = {
    ...state,
    board: structuredClone(sessionState.board),
    match: {
      ...structuredClone(sessionState.match),
      mode: "online"
    },
    skill: structuredClone(sessionState.skill),
    opening: structuredClone(
      sessionState.opening || {
        active: false,
        roundId: null,
        game: null,
        submitted: false,
        currentPicker: "black",
        localActions: { black: null, white: null },
        resultText: ""
      }
    ),
    hidden: structuredClone(sessionState.hidden),
    ui: {
      message: sessionState.ui.message,
      logs: [...sessionState.ui.logs],
      effects: [],
      hoverCell: null,
      boardToast: null
    },
    ai: {
      ...state.ai,
      enabled: false,
      pendingAction: null,
      thinking: false,
      timerId: null
    },
    online: {
      ...currentOnline,
      undoRequest: {
        pendingMine: false,
        pendingIncoming: false
      }
    },
    history: structuredClone(sessionState.history || [])
  };
  syncAwakeningProgressFromState();
  renderAll();
}

function isInside(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function getOpponent(player) {
  return player === "black" ? "white" : "black";
}

function pushLog(text) {
  state.ui.logs.unshift(text);
  state.ui.logs = state.ui.logs.slice(0, 8);
}

function setMessage(text) {
  state.ui.message = text;
}

function syncAwakeningProgressFromState() {
  if (!state?.hidden?.loseStreak) {
    return;
  }

  awakeningProgress.black.loseStreak = state.hidden.loseStreak.black?.loseStreak || 0;
  awakeningProgress.white.loseStreak = state.hidden.loseStreak.white?.loseStreak || 0;
}

function showBoardToast(text, duration = 2400) {
  const id = Date.now() + Math.random();
  state.ui.boardToast = { id, text };
  renderBoardToast();
  window.setTimeout(() => {
    if (state.ui.boardToast?.id === id) {
      state.ui.boardToast = null;
      renderBoardToast();
    }
  }, duration);
}

function showNoticeModal(title, text) {
  if (!dom.noticeModal || !dom.noticeTitle || !dom.noticeText) {
    return;
  }

  dom.noticeTitle.textContent = title;
  dom.noticeText.textContent = text;
  dom.noticeModal.classList.remove("hidden");
  dom.noticeModal.setAttribute("aria-hidden", "false");
}

function hideNoticeModal() {
  if (!dom.noticeModal) {
    return;
  }

  dom.noticeModal.classList.add("hidden");
  dom.noticeModal.setAttribute("aria-hidden", "true");
}

function getOpeningGamePool() {
  if (state.online.enabled) {
    return OPENING_GAMES;
  }

  return OPENING_GAMES.filter((game) => game.offlineReady);
}

function cloneOpeningGame(game) {
  return game ? structuredClone(game) : null;
}

function getOpeningGameById(id) {
  return cloneOpeningGame(OPENING_GAMES.find((game) => game.id === id));
}

function pickOpeningGame() {
  const pool = getOpeningGamePool();
  return cloneOpeningGame(pool[Math.floor(Math.random() * pool.length)]);
}

function getOpeningPickerLabel(player) {
  if (state.ai.enabled && player === "white") {
    return "AI";
  }

  if (state.online.enabled) {
    return player === state.online.myColor ? "你" : "对手";
  }

  return PLAYER_LABELS[player];
}

function getOpeningStatusText() {
  if (!state.opening?.active) {
    return "";
  }

  if (state.opening.resultText) {
    return state.opening.resultText;
  }

  if (state.online.enabled) {
    return state.opening.submitted
      ? "你的答案已提交，正在等对手出招。"
      : "选一个按钮，双方各做一步后就决定谁先手。";
  }

  if (state.ai.enabled && state.opening.currentPicker === "white") {
    return "AI 正在悄悄做决定，看看这局是谁先手。";
  }

  if (!state.ai.enabled && state.opening.currentPicker === "white") {
    return "现在轮到白方做这一步小游戏。";
  }

  return `${getOpeningPickerLabel(state.opening.currentPicker)} 正在决定开局先手。`;
}

function createOpeningActionRecord(game, actionId) {
  const record = {
    id: actionId,
    submittedAt: performance.now()
  };

  if (game.resolveMode === "roll-high" || game.resolveMode === "roll-low") {
    record.roll = 1 + Math.floor(Math.random() * 6);
  }

  return record;
}

function pickStarterByTime(actions, preferLatest = false) {
  const blackAction = actions.black;
  const whiteAction = actions.white;

  if (!blackAction && !whiteAction) {
    return "black";
  }

  if (!whiteAction) {
    return "black";
  }

  if (!blackAction) {
    return "white";
  }

  if (blackAction.submittedAt === whiteAction.submittedAt) {
    return Math.random() < 0.5 ? "black" : "white";
  }

  if (preferLatest) {
    return blackAction.submittedAt > whiteAction.submittedAt ? "black" : "white";
  }

  return blackAction.submittedAt < whiteAction.submittedAt ? "black" : "white";
}

function resolveRpsWinner(blackPick, whitePick) {
  if (blackPick === whitePick) {
    return null;
  }

  const winningMap = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper"
  };

  return winningMap[blackPick] === whitePick ? "black" : "white";
}

function resolveOpeningGameOutcome(game, actions) {
  let starter = "black";
  let summary = "开局小游戏完成，夜幕执子先手。";

  switch (game.resolveMode) {
    case "speed-first":
      starter = pickStarterByTime(actions, false);
      summary = `${PLAYER_LABELS[starter]} 在“${game.title}”里手更快，拿到先手。`;
      break;
    case "speed-last":
      starter = pickStarterByTime(actions, true);
      summary = `${PLAYER_LABELS[starter]} 在“${game.title}”里谦让到最后，反而先手。`;
      break;
    case "roll-high": {
      const blackRoll = actions.black?.roll || 1;
      const whiteRoll = actions.white?.roll || 1;
      starter = blackRoll === whiteRoll ? pickStarterByTime(actions, false) : blackRoll > whiteRoll ? "black" : "white";
      summary = `骰子结果：黑 ${blackRoll}，白 ${whiteRoll}。${PLAYER_LABELS[starter]} 点数更${blackRoll === whiteRoll ? "巧" : "大"}，先手。`;
      break;
    }
    case "roll-low": {
      const blackRoll = actions.black?.roll || 6;
      const whiteRoll = actions.white?.roll || 6;
      starter = blackRoll === whiteRoll ? pickStarterByTime(actions, false) : blackRoll < whiteRoll ? "black" : "white";
      summary = `反向骰子：黑 ${blackRoll}，白 ${whiteRoll}。${PLAYER_LABELS[starter]} 数字更小，先手。`;
      break;
    }
    case "coin": {
      const coin = Math.random() < 0.5 ? "heads" : "tails";
      const winners = ["black", "white"].filter((player) => actions[player]?.id === coin);
      starter = winners.length === 1 ? winners[0] : pickStarterByTime(actions, false);
      summary = `硬币翻到了${coin === "heads" ? "正面" : "反面"}。${PLAYER_LABELS[starter]} 拿到先手。`;
      break;
    }
    case "parity": {
      const number = 1 + Math.floor(Math.random() * 9);
      const parity = number % 2 === 0 ? "even" : "odd";
      const winners = ["black", "white"].filter((player) => actions[player]?.id === parity);
      starter = winners.length === 1 ? winners[0] : pickStarterByTime(actions, false);
      summary = `神秘数字是 ${number}（${parity === "odd" ? "单数" : "双数"}）。${PLAYER_LABELS[starter]} 先手。`;
      break;
    }
    case "door": {
      const luckyDoor = ["left", "middle", "right"][Math.floor(Math.random() * 3)];
      const winners = ["black", "white"].filter((player) => actions[player]?.id === luckyDoor);
      const doorText = { left: "左门", middle: "中门", right: "右门" }[luckyDoor];
      starter = winners.length === 1 ? winners[0] : pickStarterByTime(actions, false);
      summary = `幸运门是${doorText}。${PLAYER_LABELS[starter]} 先手，另一位先别踹门了。`;
      break;
    }
    case "rps": {
      const rpsWinner = resolveRpsWinner(actions.black?.id, actions.white?.id);
      starter = rpsWinner || pickStarterByTime(actions, false);
      summary = rpsWinner
        ? `${PLAYER_LABELS[starter]} 猜拳获胜，抢到先手。`
        : `双方猜拳平手，按出手速度判定：${PLAYER_LABELS[starter]} 先手。`;
      break;
    }
    case "mood": {
      const bossMood = Math.random() < 0.5 ? "work" : "slack";
      const winners = ["black", "white"].filter((player) => actions[player]?.id === bossMood);
      starter = winners.length === 1 ? winners[0] : pickStarterByTime(actions, false);
      summary = `老板今天偏爱“${bossMood === "work" ? "开工" : "摸鱼"}”。${PLAYER_LABELS[starter]} 猜中，先手。`;
      break;
    }
    default:
      starter = "black";
      summary = `${PLAYER_LABELS.black} 先手。`;
  }

  return { starter, summary };
}

function finalizeOpeningGame(result) {
  state.opening.resultText = result.summary;
  renderAll();

  window.setTimeout(() => {
    if (!state.opening?.active) {
      return;
    }

    state.opening.active = false;
    state.opening.resultText = "";
    state.opening.submitted = false;
    state.opening.game = null;
    state.match.status = "playing";
    state.match.currentPlayer = result.starter;

    pushLog(result.summary);
    showBoardToast(result.summary, 2200);
    setMessage(
      result.starter === "black"
        ? "本局由夜幕执子先行。抢中心，争取先点亮技能。"
        : "本局由星辉执子先行。先手已定，准备开战。"
    );
    renderAll();
  }, 900);
}

function startOpeningGame(game, options = {}) {
  state.match.status = "opening";
  state.skill.pendingTrigger = null;
  state.skill.selectedSkill = null;
  state.skill.warpSource = null;
  state.opening = {
    active: true,
    roundId: options.roundId || `${Date.now()}`,
    game: cloneOpeningGame(game),
    submitted: Boolean(options.submitted),
    currentPicker: "black",
    localActions: {
      black: null,
      white: null
    },
    resultText: ""
  };
  clearHoverCell();
  if (game) {
    pushLog(`本局开场小游戏：${game.title}。`);
  }
  setMessage(game ? `本局开场小游戏：${game.title}` : "正在准备开场小游戏...");
  renderAll();
}

function startOfflineOpeningGame() {
  startOpeningGame(pickOpeningGame());
}

function resolveOfflineOpeningGameIfReady() {
  const actions = state.opening?.localActions;
  if (!actions?.black || !actions?.white || !state.opening.game) {
    return;
  }

  finalizeOpeningGame(resolveOpeningGameOutcome(state.opening.game, actions));
}

function runAIOpeningGameAction() {
  if (!state.ai.enabled || !state.opening?.active || state.match.status !== "opening") {
    return;
  }

  window.setTimeout(() => {
    if (!state.opening?.active || state.match.status !== "opening") {
      return;
    }

    const game = state.opening.game;
    if (!game) {
      return;
    }

    const randomButton = game.buttons[Math.floor(Math.random() * game.buttons.length)];
    state.opening.localActions.white = createOpeningActionRecord(game, randomButton.id);
    state.opening.currentPicker = "black";
    resolveOfflineOpeningGameIfReady();
  }, 560 + Math.floor(Math.random() * 400));
}

function submitOpeningGameAction(actionId) {
  if (!state.opening?.active || !state.opening.game || state.opening.resultText) {
    return;
  }

  if (state.online.enabled) {
    if (state.opening.submitted) {
      return;
    }
    state.opening.submitted = true;
    setMessage("你的开场小游戏答案已提交，等待对手。");
    renderAll();
    if (onlineSocket) {
      onlineSocket.emit("opening-game-action", {
        roundId: state.opening.roundId,
        actionId
      });
    }
    return;
  }

  const currentPicker = state.opening.currentPicker;
  state.opening.localActions[currentPicker] = createOpeningActionRecord(state.opening.game, actionId);

  if (state.ai.enabled && currentPicker === "black") {
    state.opening.currentPicker = "white";
    setMessage("你已完成开场小游戏，AI 正在偷偷决定先手。");
    renderAll();
    runAIOpeningGameAction();
    return;
  }

  if (!state.ai.enabled && currentPicker === "black") {
    state.opening.currentPicker = "white";
    setMessage("轮到星辉执子完成这一步小游戏。");
    renderAll();
    return;
  }

  resolveOfflineOpeningGameIfReady();
}

function renderOpeningGameModal() {
  if (
    !dom.openingGameModal ||
    !dom.openingGameTitle ||
    !dom.openingGameDesc ||
    !dom.openingGameButtons ||
    !dom.openingGameStatus
  ) {
    return;
  }

  const visible = Boolean(state.opening?.active && state.opening?.game);
  dom.openingGameModal.classList.toggle("hidden", !visible);
  dom.openingGameModal.setAttribute("aria-hidden", String(!visible));

  if (!visible) {
    dom.openingGameButtons.innerHTML = "";
    dom.openingGameStatus.textContent = "";
    return;
  }

  const game = state.opening.game;
  dom.openingGameTitle.textContent = game.title;
  dom.openingGameDesc.textContent = game.description;
  dom.openingGameStatus.textContent = getOpeningStatusText();
  dom.openingGameButtons.innerHTML = "";

  if (state.opening.resultText) {
    return;
  }

  game.buttons.forEach((buttonDef) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = buttonDef.label;
    button.disabled =
      (state.online.enabled && state.opening.submitted) ||
      (state.ai.enabled && state.opening.currentPicker === "white");
    button.addEventListener("click", () => submitOpeningGameAction(buttonDef.id));
    dom.openingGameButtons.appendChild(button);
  });
}

function renderBoardToast() {
  if (!dom.boardToast) {
    return;
  }

  const activeToast = state.ui.boardToast;
  dom.boardToast.classList.toggle("hidden", !activeToast);
  dom.boardToast.setAttribute("aria-hidden", String(!activeToast));
  dom.boardToast.textContent = activeToast?.text || "";
}

function hasPendingUndoRequest() {
  return Boolean(
    state.online.enabled &&
    (state.online.undoRequest?.pendingMine || state.online.undoRequest?.pendingIncoming)
  );
}

function getSkillLimitState(player) {
  if (!state.hidden.skillLimits) {
    state.hidden.skillLimits = {
      black: {
        lastTurnUsedSkill: false,
        firstNoticeShown: false
      },
      white: {
        lastTurnUsedSkill: false,
        firstNoticeShown: false
      }
    };
  }

  if (!state.hidden.skillLimits[player]) {
    state.hidden.skillLimits[player] = {
      lastTurnUsedSkill: false,
      firstNoticeShown: false
    };
  }

  return state.hidden.skillLimits[player];
}

function noteTurnSkillUsage(player, usedSkill) {
  const limitState = getSkillLimitState(player);
  limitState.lastTurnUsedSkill = Boolean(usedSkill);
}

function isSkillReleaseLocked(player) {
  return Boolean(getSkillLimitState(player).lastTurnUsedSkill);
}

function maybeShowFirstSkillLimitNotice(player) {
  const limitState = getSkillLimitState(player);
  if (limitState.firstNoticeShown) {
    return;
  }

  limitState.firstNoticeShown = true;
  if (!isOwnPerspective(player)) {
    return;
  }
  showNoticeModal(
    "灵技冷却提醒",
    "提示：同一方不能连续两步都释放技能。你这一步已经用过技能，下次轮到你时即使触发技能，也必须先空过一次。"
  );
}

function shouldMorphStone() {
  return Math.random() < COUNTRYSIDE_MORPH_CHANCE;
}

function getCountrysideMorphToast(actor, placedColor) {
  const actorName = state.online.enabled
    ? actor === state.online.myColor
      ? "你"
      : "对手"
    : PLAYER_LABELS[actor];
  const colorName = placedColor === "black" ? "黑子" : "白子";

  return `“${COUNTRYSIDE_MORPH_SKILL.name}”发动！${actorName} 这手突然下成了${colorName}。`;
}

function hasBlockedCell(row, col, player) {
  return state.skill.blockedCells.some(
    (cell) => cell.row === row && cell.col === col && cell.blockedFor === player
  );
}

function clearExpiredBlocks(player) {
  state.skill.blockedCells = state.skill.blockedCells.filter(
    (cell) => cell.blockedFor !== player
  );
}

function queueEffect(cells, type, duration = 650) {
  const entries = cells.map(([row, col]) => ({
    key: `${row}-${col}`,
    type
  }));

  state.ui.effects = [...state.ui.effects, ...entries];
  renderBoard();

  window.setTimeout(() => {
    state.ui.effects = state.ui.effects.filter(
      (effect) =>
        !entries.some(
          (entry) => entry.key === effect.key && entry.type === effect.type
        )
    );
    renderBoard();
  }, duration);
}

function getEffectClass(row, col) {
  const effect = state.ui.effects.find((entry) => entry.key === `${row}-${col}`);

  return effect ? `effect-${effect.type}` : "";
}

function getPhaseLabel() {
  return PHASE_LABELS[state.match.status === "finished" ? "gameover" : getPhaseKey()];
}

function getPhaseKey() {
  if (state.match.status === "opening") {
    return "opening";
  }

  if (state.match.status === "finished") {
    return "gameover";
  }

  if (state.skill.selectedSkill) {
    return "targeting";
  }

  if (state.skill.pendingTrigger) {
    return "skillSelect";
  }

  return "placing";
}

function countBoardStats() {
  let black = 0;
  let white = 0;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = state.board.cells[row][col];

      if (cell === "black") {
        black += 1;
      } else if (cell === "white") {
        white += 1;
      }
    }
  }

  const empty = BOARD_SIZE * BOARD_SIZE - black - white;

  return { black, white, empty };
}

function getSkillOptions() {
  if (!state.skill.pendingTrigger) {
    return [];
  }

  if (state.skill.pendingTrigger.tier === "small") {
    return [SKILLS.block, SKILLS.shock, SKILLS.warp];
  }

  return [SKILLS.blast, SKILLS.convert, SKILLS.siphon];
}

function renderStatus() {
  const phaseKey = getPhaseKey();
  const difficultyKey = state.ai.difficulty in DIFFICULTY_LABELS ? state.ai.difficulty : "normal";

  const engineTag = state.ai.engine === "proxy" ? "DeepSeek代理" : "本地引擎";

  if (state.online.enabled) {
    const colorName = state.online.myColor === "black" ? "夜幕(黑)" : "星辉(白)";
    dom.modeLabel.textContent = `在线对战 · 房间 ${state.online.roomCode || "?"} · 你是${colorName}`;
  } else {
    dom.modeLabel.textContent = state.ai.enabled
      ? `玩家 vs AI · ${DIFFICULTY_LABELS[difficultyKey]} · ${engineTag}`
      : "本地练习";
  }

  let turnText = state.match.status === "opening" ? "开局小游戏中" : `第 ${state.match.turn} 手`;
  if (state.online.enabled && state.match.status === "playing") {
    turnText += state.match.currentPlayer === state.online.myColor
      ? " · 你的回合" : " · 对手回合";
  } else if (state.ai.enabled && state.match.status === "playing") {
    turnText +=
      state.match.currentPlayer === "black" ? " · 你的回合" : " · AI 回合";
  }
  dom.turnLabel.textContent = turnText;
  dom.phaseLabel.textContent = getPhaseLabel();
  document.body.dataset.turn = state.match.currentPlayer || "black";
  document.body.dataset.phase = phaseKey;

  if (state.match.status === "opening") {
    dom.triggerLabel.textContent = state.opening?.game
      ? `小游戏：${state.opening.game.title}`
      : "先手待定";
  } else if (state.match.status === "finished") {
    dom.triggerLabel.textContent = `${PLAYER_LABELS[state.match.winner]} 完成终局`;
  } else if (state.skill.pendingTrigger) {
    const spark = state.skill.pendingTrigger.tier === "small" ? "3 连小技能" : "4 连大技能";
    dom.triggerLabel.textContent = `${spark} 已点亮`;
  } else {
    dom.triggerLabel.textContent = getGhostWallStatusText() || "等待连段触发";
  }

  dom.blackBadge.classList.toggle(
    "active",
    state.match.status !== "opening" && state.match.currentPlayer === "black"
  );
  dom.whiteBadge.classList.toggle(
    "active",
    state.match.status !== "opening" && state.match.currentPlayer === "white"
  );
  dom.message.textContent = state.ui.message;
  dom.undoMove.disabled = state.match.status !== "playing" || state.history.length === 0 || hasPendingUndoRequest();
  dom.skipSkill.disabled = !state.skill.pendingTrigger;
  if (dom.chatInput) {
    dom.chatInput.disabled = !state.online.enabled;
  }
  if (dom.chatSend) {
    dom.chatSend.disabled = !state.online.enabled;
  }
  dom.modeLocal.classList.toggle("active", !state.ai.enabled && !state.online.enabled);
  dom.modeAi.classList.toggle("active", state.ai.enabled && !state.online.enabled);
  dom.modeLocal.disabled = state.online.enabled;
  dom.modeAi.disabled = state.online.enabled;

  if (dom.aiDifficultyRow) {
    dom.aiDifficultyRow.hidden = !state.ai.enabled || state.online.enabled;
  }

  if (dom.aiEngineRow) {
    const hasDefaultProxy = Boolean(getDefaultProxyUrl());
    dom.aiEngineRow.hidden = !state.ai.enabled || hasDefaultProxy || state.online.enabled;
  }

  if (dom.engineLocal && dom.engineProxy) {
    dom.engineLocal.classList.toggle("active", state.ai.engine !== "proxy");
    dom.engineProxy.classList.toggle("active", state.ai.engine === "proxy");
    dom.engineLocal.disabled = state.online.enabled;
    dom.engineProxy.disabled = state.online.enabled;
  }

  if (dom.aiProxyPanel) {
    dom.aiProxyPanel.classList.toggle("hidden", state.ai.engine !== "proxy");

    if (state.ai.enabled && state.ai.engine === "proxy") {
      loadProxyInputs();
    }
  }

  dom.difficultyButtons.forEach((btn) => {
    const level = btn.dataset.difficulty;
    btn.classList.toggle("active", level === difficultyKey);
    btn.disabled = !state.ai.enabled || state.online.enabled;
  });

  if (dom.aiDifficultyLabel) {
    dom.aiDifficultyLabel.textContent = DIFFICULTY_LABELS[difficultyKey];
  }

  const aiThinkingVisible =
    state.ai.enabled &&
    state.match.status === "playing" &&
    state.match.currentPlayer === "white" &&
    state.ai.thinking;

  if (dom.aiThinkingLayer) {
    dom.aiThinkingLayer.classList.toggle("hidden", !aiThinkingVisible);
    dom.aiThinkingLayer.setAttribute("aria-hidden", String(!aiThinkingVisible));
  }

  document.body.dataset.aiThinking = aiThinkingVisible ? "1" : "0";
  dom.whiteBadge.classList.toggle("ai-thinking", aiThinkingVisible);

  if (dom.statsLabel) {
    const { black, white, empty } = countBoardStats();
    dom.statsLabel.textContent = `黑 ${black} · 白 ${white} · 空 ${empty}`;
  }
}

function renderSkills() {
  dom.skillList.innerHTML = "";
  const options = getSkillOptions();

  if (!options.length) {
    if (state.match.status === "opening") {
      dom.skillHint.textContent = "等待开局";
      dom.skillList.innerHTML = `
        <button class="skill-button" type="button" disabled>
          先完成开局小游戏
          <small>本局先手还没决定。小游戏结束后，才能通过 3 连或 4 连触发技能。</small>
        </button>
      `;
    } else {
      dom.skillHint.textContent = "未触发";
      dom.skillList.innerHTML = `
        <button class="skill-button" type="button" disabled>
          等待连段触发
          <small>先落子形成 3 连或 4 连，再从这里选择本回合技能。</small>
        </button>
      `;
    }
    return;
  }

  dom.skillHint.textContent =
    state.skill.pendingTrigger.tier === "small" ? "小技能已就绪" : "大技能已就绪";

  options.forEach((skill) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-button";
    button.dataset.skillId = skill.id;
    button.innerHTML = `${skill.name}<small>${skill.description}</small>`;

    if (state.skill.selectedSkill === skill.id) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => {
      state.skill.selectedSkill = state.skill.selectedSkill === skill.id ? null : skill.id;
      state.skill.warpSource = null;

      if (state.skill.selectedSkill) {
        SFX.click();
        setMessage(`已选择技能“${skill.name}”，请点击棋盘上的有效目标。`);
      } else {
        setMessage("已取消技能选择。你可以重新选择本回合的技能，或跳过技能。");
      }

      renderAll();
    });

    dom.skillList.appendChild(button);
  });
}

function renderLogs() {
  dom.logList.innerHTML = "";

  state.ui.logs.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    dom.logList.appendChild(li);
  });
}

function appendChatMessage(player, text, timestamp = Date.now()) {
  if (!state.online.chatMessages) {
    state.online.chatMessages = [];
  }

  state.online.chatMessages.push({
    player,
    text,
    timestamp
  });
  state.online.chatMessages = state.online.chatMessages.slice(-40);
}

function getChatToastText(player, text) {
  if (!state.online.enabled) {
    return text;
  }

  if (player === state.online.myColor) {
    return `你：${text}`;
  }

  if (player === "black" || player === "white") {
    return `对手：${text}`;
  }

  return text;
}

function renderChat() {
  if (!dom.chatCard || !dom.chatList) {
    return;
  }

  const onlineVisible = state.online.enabled;
  dom.chatCard.hidden = !onlineVisible;
  dom.chatList.innerHTML = "";

  if (!onlineVisible) {
    return;
  }

  const messages = state.online.chatMessages || [];

  if (!messages.length) {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `<span class="chat-meta">系统</span><span class="chat-text">已连接后可在这里和对手聊天。</span>`;
    dom.chatList.appendChild(li);
    return;
  }

  messages.forEach((item) => {
    const li = document.createElement("li");
    const isSelf = item.player === state.online.myColor;
    const playerName =
      item.player === "black"
        ? "黑方"
        : item.player === "white"
          ? "白方"
          : "系统";
    const timeText = new Date(item.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    li.className = `chat-item${isSelf ? " self" : ""}`;
    li.innerHTML = `<span class="chat-meta">${playerName} · ${timeText}</span><span class="chat-text"></span>`;
    li.querySelector(".chat-text").textContent = item.text;
    dom.chatList.appendChild(li);
  });

  dom.chatList.scrollTop = dom.chatList.scrollHeight;
}

function getTargetableCells() {
  const selectedSkill = state.skill.selectedSkill;

  if (!selectedSkill || !state.board.lastMove) {
    return new Set();
  }

  const { row, col } = state.board.lastMove;
  const currentPlayer = state.match.currentPlayer;
  const opponent = getOpponent(currentPlayer);
  const valid = new Set();

  if (selectedSkill === "block") {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (!state.board.cells[r][c] && !hasBlockedCell(r, c, opponent)) {
          valid.add(`${r}-${c}`);
        }
      }
    }
  }

  if (selectedSkill === "shock" || selectedSkill === "convert") {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) {
          continue;
        }

        const nextRow = row + dr;
        const nextCol = col + dc;

        if (!isInside(nextRow, nextCol)) {
          continue;
        }

        if (state.board.cells[nextRow][nextCol] !== opponent) {
          continue;
        }

        if (selectedSkill === "shock") {
          const landingRow = nextRow + dr;
          const landingCol = nextCol + dc;

          if (
            isInside(landingRow, landingCol) &&
            !state.board.cells[landingRow][landingCol]
          ) {
            valid.add(`${nextRow}-${nextCol}`);
          }
        } else {
          valid.add(`${nextRow}-${nextCol}`);
        }
      }
    }
  }

  if (selectedSkill === "warp") {
    if (!state.skill.warpSource) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (isInside(nr, nc) && state.board.cells[nr][nc] === currentPlayer) {
            if (nr !== row || nc !== col) {
              valid.add(`${nr}-${nc}`);
            }
          }
        }
      }
    } else {
      for (let r = 0; r < BOARD_SIZE; r += 1) {
        for (let c = 0; c < BOARD_SIZE; c += 1) {
          if (!state.board.cells[r][c] && !hasBlockedCell(r, c, currentPlayer)) {
            valid.add(`${r}-${c}`);
          }
        }
      }
    }
  }

  if (selectedSkill === "blast") {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const cross = [
          [r, c],
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1]
        ].filter(([cellRow, cellCol]) => isInside(cellRow, cellCol));

        if (
          cross.some(
            ([cellRow, cellCol]) =>
              state.board.cells[cellRow][cellCol] === getOpponent(currentPlayer)
          )
        ) {
          valid.add(`${r}-${c}`);
        }
      }
    }
  }

  if (selectedSkill === "siphon") {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const diamond = [];
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            if (Math.abs(dr) + Math.abs(dc) <= 2) {
              const cr = r + dr;
              const cc = c + dc;
              if (isInside(cr, cc)) diamond.push([cr, cc]);
            }
          }
        }
        if (diamond.some(([cr, cc]) => state.board.cells[cr][cc] === opponent)) {
          valid.add(`${r}-${c}`);
        }
      }
    }
  }

  return valid;
}

function renderBoard() {
  const targetableCells = getTargetableCells();
  const blockedForCurrentPlayer = new Set(
    state.skill.blockedCells
      .filter((cell) => cell.blockedFor === state.match.currentPlayer)
      .map((cell) => `${cell.row}-${cell.col}`)
  );
  const winningCells = new Set(
    state.board.winningLine.map((cell) => `${cell.row}-${cell.col}`)
  );
  const triggerCells = new Set(
    (state.skill.pendingTrigger?.line || []).map(([row, col]) => `${row}-${col}`)
  );
  const fragment = document.createDocumentFragment();

  dom.board.classList.toggle(
    "preview-black",
    state.match.status === "playing" && state.match.currentPlayer === "black"
  );
  dom.board.classList.toggle(
    "preview-white",
    state.match.status === "playing" && state.match.currentPlayer === "white"
  );
  dom.board.classList.toggle("skill-targeting", Boolean(state.skill.selectedSkill));
  dom.board.classList.toggle("trigger-active", Boolean(state.skill.pendingTrigger));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const button = document.createElement("button");
      const stone = state.board.cells[row][col];
      const key = `${row}-${col}`;
      button.type = "button";
      button.className = "cell";
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列`);

      if (stone) {
        button.classList.add("stone", stone);
      } else {
        button.classList.add("empty");
      }

      if (state.board.lastMove && state.board.lastMove.row === row && state.board.lastMove.col === col) {
        button.classList.add("last-move");
      }

      if (blockedForCurrentPlayer.has(key)) {
        button.classList.add("blocked");
      }

      if (targetableCells.has(key)) {
        button.classList.add("targetable");
      }

      if (winningCells.has(key)) {
        button.classList.add("winning");
      }

      if (triggerCells.has(key)) {
        button.classList.add("trigger-line");
      }

      if (
        state.ui.hoverCell &&
        state.ui.hoverCell.row === row &&
        state.ui.hoverCell.col === col
      ) {
        button.classList.add("hovered");
      }

      const effectClass = getEffectClass(row, col);
      if (effectClass) {
        button.classList.add(effectClass);
      }

      button.addEventListener("click", () => handleBoardClick(row, col));
      fragment.appendChild(button);
    }
  }

  dom.board.innerHTML = "";
  dom.board.appendChild(fragment);
}

function renderWinnerModal() {
  const isVisible = state.match.status === "finished";
  dom.winnerModal.classList.toggle("hidden", !isVisible);
  dom.winnerModal.setAttribute("aria-hidden", String(!isVisible));

  if (!isVisible) {
    return;
  }

  dom.winnerTitle.textContent = `${PLAYER_LABELS[state.match.winner]} 获胜`;
  const loser = getOpponent(state.match.winner);
  const loserStreak = state.hidden?.loseStreak?.[loser]?.loseStreak ?? awakeningProgress[loser].loseStreak;
  let text =
    state.match.winner === "black"
      ? "夜幕执子完成了终局五连。下一局试试抢先打出 4 连大技能。"
      : "星辉执子完成了终局五连。下一局可以尝试围绕中心布局更快触发技能。";

  if (loserStreak >= 3) {
    text += isOwnPerspective(loser)
      ? ` ${PLAYER_LABELS[loser]} 已连输 ${loserStreak} 局，下一局将觉醒隐藏技能“${GHOST_WALL_SKILL.name}”。`
      : " 下一局局势仍可能出现异变。";
  }

  dom.winnerText.textContent = text;
}

function renderUndoModal() {
  if (!dom.undoModal || !dom.undoText) {
    return;
  }

  const visible = Boolean(state.online.undoRequest?.pendingIncoming);
  dom.undoModal.classList.toggle("hidden", !visible);
  dom.undoModal.setAttribute("aria-hidden", String(!visible));

  if (visible) {
    dom.undoText.textContent = "求求了，让我悔棋吧";
  }
}

function renderAll() {
  renderStatus();
  renderSkills();
  renderLogs();
  renderChat();
  renderBoard();
  renderBoardToast();
  renderOpeningGameModal();
  renderWinnerModal();
  renderUndoModal();
  maybeRunAI();
}

function clearAITimer() {
  if (state.ai.timerId) {
    window.clearTimeout(state.ai.timerId);
    state.ai.timerId = null;
  }

  state.ai.thinking = false;
}

function getLegalMoves(player) {
  const moves = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (state.board.cells[row][col]) {
        continue;
      }

      if (hasBlockedCell(row, col, player)) {
        continue;
      }

      moves.push({ row, col });
    }
  }

  return moves;
}

function getNeighborCount(row, col) {
  let count = 0;

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) {
        continue;
      }

      const nextRow = row + dr;
      const nextCol = col + dc;

      if (isInside(nextRow, nextCol) && state.board.cells[nextRow][nextCol]) {
        count += 1;
      }
    }
  }

  return count;
}

function simulatedLineLength(row, col, player) {
  if (!isInside(row, col) || state.board.cells[row][col]) {
    return 0;
  }

  let best = 0;

  DIRECTIONS.forEach(([dr, dc]) => {
    let len = 1;
    let r = row + dr;
    let c = col + dc;

    while (isInside(r, c) && state.board.cells[r][c] === player) {
      len += 1;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;

    while (isInside(r, c) && state.board.cells[r][c] === player) {
      len += 1;
      r -= dr;
      c -= dc;
    }

    best = Math.max(best, len);
  });

  return best;
}

function scoreAIMove(row, col) {
  const difficulty = state.ai.difficulty in DIFFICULTY_LABELS ? state.ai.difficulty : "normal";
  const center = (BOARD_SIZE - 1) / 2;
  const centerDistance = Math.abs(row - center) + Math.abs(col - center);
  const neighborScore = getNeighborCount(row, col) * 18;
  const centerScore = Math.max(0, 16 - centerDistance);

  if (difficulty === "easy") {
    const noise = Math.random() * 28;
    return neighborScore * 0.45 + centerScore * 0.85 + noise;
  }

  const attack = simulatedLineLength(row, col, "white");
  const block = simulatedLineLength(row, col, "black");
  const tacticWeight = difficulty === "hard" ? 1 : 0.55;
  const tactic =
    (attack * 105 + block * 92) * tacticWeight;
  const noise = Math.random() * (difficulty === "hard" ? 2.2 : 4.5);

  return tactic + neighborScore + centerScore + noise;
}

function getAIThinkDelayMs() {
  const difficulty = state.ai.difficulty in DIFFICULTY_LABELS ? state.ai.difficulty : "normal";
  if (state.ai.engine === "proxy") {
    return 80 + Math.random() * 60;
  }
  const base = { easy: 380, normal: 220, hard: 120 }[difficulty];
  const jitter = { easy: 180, normal: 100, hard: 60 }[difficulty];

  return base + Math.random() * jitter;
}

function getAIMove() {
  const moves = getLegalMoves("white");

  if (!moves.length) {
    return null;
  }

  return moves.reduce((best, current) => {
    const currentScore = scoreAIMove(current.row, current.col);

    if (!best || currentScore > best.score) {
      return { ...current, score: currentScore };
    }

    return best;
  }, null);
}

function loadProxyInputs() {
  if (!dom.proxyUrl || !dom.proxyToken) {
    return;
  }

  const storedUrl = sessionStorage.getItem(STORAGE_PROXY_URL)?.trim() || "";
  const storedToken = sessionStorage.getItem(STORAGE_PROXY_TOKEN) || "";
  dom.proxyUrl.value = storedUrl || getDefaultProxyUrl();
  dom.proxyToken.value = storedToken || getDefaultProxyToken();
}

function saveProxyConfig() {
  const url = dom.proxyUrl.value.trim();
  const token = dom.proxyToken.value;

  if (url) {
    sessionStorage.setItem(STORAGE_PROXY_URL, url);
  } else {
    sessionStorage.removeItem(STORAGE_PROXY_URL);
  }

  if (token) {
    sessionStorage.setItem(STORAGE_PROXY_TOKEN, token);
  } else {
    sessionStorage.removeItem(STORAGE_PROXY_TOKEN);
  }

  pushLog(url ? "代理地址与 Token 已写入浏览器会话（未进 Git）。" : "已清除代理 URL。");
  renderAll();
}

function setEngine(engine) {
  if (!state.ai.enabled) {
    return;
  }

  state.ai.engine = engine === "proxy" ? "proxy" : "local";
  pushLog(
    state.ai.engine === "proxy"
      ? "已切换为 DeepSeek 代理模式：将请求你的后端，失败时回退本地引擎。"
      : "已切换为本地启发式引擎。"
  );
  renderAll();
}

async function fetchMoveFromProxy() {
  const url = getEffectiveProxyUrl();

  if (!url) {
    return null;
  }

  const token = getEffectiveProxyToken();
  const legalMoves = getLegalMoves("white");

  if (!legalMoves.length) {
    return null;
  }

  const body = {
    version: 1,
    game: "skill-gomoku",
    board: state.board.cells,
    currentPlayer: "white",
    legalMoves,
    difficulty: state.ai.difficulty,
    turn: state.match.turn
  };

  const headers = { "Content-Type": "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 28000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    window.clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const row = Number(data.row);
    const col = Number(data.col);

    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return null;
    }

    if (!isInside(row, col) || state.board.cells[row][col]) {
      return null;
    }

    if (hasBlockedCell(row, col, "white")) {
      return null;
    }

    const legal = legalMoves.some((move) => move.row === row && move.col === col);

    if (!legal) {
      return null;
    }

    return { row, col };
  } catch {
    window.clearTimeout(timeoutId);
    return null;
  }
}

function maybeRunAI() {
  if (!state.ai.enabled || state.match.status !== "playing") {
    return;
  }

  if (state.match.currentPlayer !== "white") {
    clearAITimer();
    return;
  }

  if (state.ai.thinking || state.ai.timerId) {
    return;
  }

  state.ai.thinking = true;
  const diffName = DIFFICULTY_LABELS[state.ai.difficulty] || "标准";
  setMessage(
    state.skill.pendingTrigger
      ? `AI（${diffName}）正在处理技能窗口，本版会先自动跳过技能。`
      : `AI（${diffName}）正在扫描盘面，请稍候…`
  );
  renderStatus();

  state.ai.timerId = window.setTimeout(() => {
    void (async () => {
      state.ai.timerId = null;

      if (state.match.status === "finished" || state.match.currentPlayer !== "white") {
        state.ai.thinking = false;
        renderStatus();
        return;
      }

      if (state.skill.pendingTrigger) {
        pushLog("AI 当前使用的是本地占位引擎，本回合自动跳过技能。");
        state.ai.thinking = false;
        skipSkill();
        return;
      }

      let move = null;

      if (state.ai.engine === "proxy") {
        move = await fetchMoveFromProxy();

        if (!move) {
          pushLog("DeepSeek/代理未返回合法落点或请求失败，已改用本地引擎。");
        }
      }

      if (!move) {
        move = getAIMove();
      }

      if (!move) {
        state.ai.thinking = false;
        setMessage("AI 没有找到可落子的格子。");
        renderStatus();
        return;
      }

      pushLog(`AI 锁定了 (${move.row + 1}, ${move.col + 1}) 作为下一手。`);
      state.ai.thinking = false;
      placeStone(move.row, move.col);
    })();
  }, getAIThinkDelayMs());
}

function collectLine(row, col, dr, dc, player) {
  const cells = [[row, col]];

  let nextRow = row + dr;
  let nextCol = col + dc;

  while (isInside(nextRow, nextCol) && state.board.cells[nextRow][nextCol] === player) {
    cells.push([nextRow, nextCol]);
    nextRow += dr;
    nextCol += dc;
  }

  nextRow = row - dr;
  nextCol = col - dc;

  while (isInside(nextRow, nextCol) && state.board.cells[nextRow][nextCol] === player) {
    cells.unshift([nextRow, nextCol]);
    nextRow -= dr;
    nextCol -= dc;
  }

  return cells;
}

function analyzeMove(row, col, player) {
  let longestLine = [];
  let bestTrigger = null;

  DIRECTIONS.forEach(([dr, dc]) => {
    const line = collectLine(row, col, dr, dc, player);

    if (line.length > longestLine.length) {
      longestLine = line;
    }

    if (line.length >= WIN_LENGTH) {
      bestTrigger = { type: "win", cells: line };
      return;
    }

    if (line.length === 4 && (!bestTrigger || bestTrigger.type !== "large")) {
      bestTrigger = { type: "large", cells: line };
    } else if (line.length === 3 && !bestTrigger) {
      bestTrigger = { type: "small", cells: line };
    }
  });

  if (bestTrigger && bestTrigger.type === "win") {
    return { outcome: "win", cells: bestTrigger.cells };
  }

  if (bestTrigger) {
    return { outcome: "trigger", tier: bestTrigger.type, cells: bestTrigger.cells };
  }

  return { outcome: "plain", cells: longestLine };
}

function isGhostWallThreat(result) {
  return (
    result.outcome === "win" ||
    (result.outcome === "trigger" && result.tier === "large")
  );
}

function getGhostWallVictimCell(result, preferredRow, preferredCol) {
  if (!result?.cells?.length) {
    return null;
  }

  const preferred = result.cells.find(
    ([row, col]) => row === preferredRow && col === preferredCol
  );

  if (preferred) {
    return preferred;
  }

  return result.cells[result.cells.length - 1];
}

function maybeTriggerGhostWall(attacker, result, row, col) {
  const defender = getOpponent(attacker);
  const ghostState = state.hidden.ghostWall[defender];

  if (!ghostState?.armed || ghostState.used || !isGhostWallThreat(result)) {
    return false;
  }

  const victim = getGhostWallVictimCell(result, row, col);
  if (!victim) {
    return false;
  }

  const [victimRow, victimCol] = victim;
  if (state.board.cells[victimRow][victimCol] !== attacker) {
    return false;
  }

  state.board.cells[victimRow][victimCol] = null;
  state.board.lastMove = { row: victimRow, col: victimCol };
  state.board.winningLine = [];
  state.skill.pendingTrigger = null;
  state.skill.selectedSkill = null;
  state.skill.warpSource = null;
  ghostState.used = true;

  if (isOwnPerspective(attacker)) {
    showNoticeModal(
      "鬼打墙发动",
      `你刚下在 (${victimRow + 1}, ${victimCol + 1}) 的关键棋子，被对方的“${GHOST_WALL_SKILL.name}”悄悄偷走了。`
    );
    showBoardToast("你的关键棋子被鬼打墙偷走了。", 2400);
    setMessage("棋盘忽起迷障，你刚落下的关键棋子被偷走了。");
    pushLog("你的关键棋子被对手的隐藏技能“鬼打墙”偷走。");
  } else if (isOwnPerspective(defender)) {
    setMessage(`鬼打墙已觉醒：${PLAYER_LABELS[defender]} 在暗影中偷走了一枚关键敌子。`);
    pushLog(`${PLAYER_LABELS[defender]} 的隐藏技能“${GHOST_WALL_SKILL.name}”悄然发动，化解了致命威胁。`);
  } else {
    setMessage("棋盘忽起迷障，一枚关键棋子悄然消失了。");
    pushLog("棋局异动化解了一次致命威胁。");
  }
  queueEffect([[victimRow, victimCol]], "ghost-wall", 1100);
  return true;
}

function updateAwakeningProgress(winner) {
  const loser = getOpponent(winner);
  if (!state.hidden?.loseStreak) {
    state.hidden = {
      ...state.hidden,
      loseStreak: structuredClone(awakeningProgress)
    };
  }

  state.hidden.loseStreak[winner].loseStreak = 0;
  state.hidden.loseStreak[loser].loseStreak += 1;
  syncAwakeningProgressFromState();
}

function isOwnPerspective(player) {
  return !state.online.enabled || state.online.myColor === player;
}

function getGhostWallStatusText() {
  const readyPlayers = Object.entries(state.hidden.ghostWall)
    .filter(([, ghostState]) => ghostState.armed && !ghostState.used)
    .map(([player]) => player);

  if (!readyPlayers.length) {
    return "";
  }

  if (!state.online.enabled) {
    return `${readyPlayers.map((player) => PLAYER_LABELS[player]).join("、")} 持有隐藏技能“${GHOST_WALL_SKILL.name}”`;
  }

  if (readyPlayers.includes(state.online.myColor)) {
    return `你的隐藏技能“${GHOST_WALL_SKILL.name}”待命`;
  }

  return "棋局暗流涌动";
}

function endGame(player, winningLine) {
  updateAwakeningProgress(player);
  noteTurnSkillUsage(player, false);
  state.match.status = "finished";
  state.match.winner = player;
  state.board.winningLine = winningLine.map(([row, col]) => ({ row, col }));
  state.skill.pendingTrigger = null;
  state.skill.selectedSkill = null;
  setMessage(`${PLAYER_LABELS[player]} 已完成五连，战局结束。`);
  pushLog(`${PLAYER_LABELS[player]} 打出终局五连，比赛结束。`);
  queueEffect(winningLine, "convert", 900);
}

function advanceTurn() {
  state.match.currentPlayer = getOpponent(state.match.currentPlayer);
  state.match.turn += 1;
  state.skill.pendingTrigger = null;
  state.skill.selectedSkill = null;
  state.skill.warpSource = null;
  state.board.winningLine = [];

  if (state.ai.enabled) {
    if (state.match.currentPlayer === "black") {
      setMessage("轮到你落子（夜幕执子）。尽量抢占要点，逼出 AI 的失误。");
    } else {
      setMessage("轮到星辉执子（AI）。棋盘上会出现演算遮罩，请等待它落子。");
    }
  } else {
    setMessage(`${PLAYER_LABELS[state.match.currentPlayer]} 行动中。观察局势，争取做出下一条连段。`);
  }
}

function placeStone(row, col, options = {}) {
  if (state.match.status !== "playing") {
    return;
  }

  if (state.skill.pendingTrigger) {
    setMessage("本回合技能尚未处理，请先选择技能或点击“跳过技能”。");
    return;
  }

  const currentPlayer = options.actorPlayer || state.match.currentPlayer;
  const placedColor =
    options.placedColor || (shouldMorphStone() ? getOpponent(currentPlayer) : currentPlayer);
  const transformed = placedColor !== currentPlayer;

  if (state.board.cells[row][col]) {
    setMessage("这个位置已经有棋子了，请换一个落点。");
    return;
  }

  if (hasBlockedCell(row, col, currentPlayer)) {
    setMessage("该位置被对手封锁了，这一手不能落在这里。");
    return;
  }

  state.history.push(cloneStateSnapshot());
  state.board.cells[row][col] = placedColor;
  state.board.lastMove = { row, col };
  clearExpiredBlocks(currentPlayer);
  pushLog(
    transformed
      ? `${PLAYER_LABELS[currentPlayer]} 触发“${COUNTRYSIDE_MORPH_SKILL.name}”，在 (${row + 1}, ${col + 1}) 下成了${PLAYER_LABELS[placedColor]}的棋子。`
      : `${PLAYER_LABELS[currentPlayer]} 落子到 (${row + 1}, ${col + 1})。`
  );
  if (transformed) {
    showBoardToast(getCountrysideMorphToast(currentPlayer, placedColor), 2600);
    setMessage(`“${COUNTRYSIDE_MORPH_SKILL.name}”发动，这一手变成了${PLAYER_LABELS[placedColor]}的棋子。`);
  }
  SFX.place();

  const result = analyzeMove(row, col, placedColor);

  if (maybeTriggerGhostWall(placedColor, result, row, col)) {
    noteTurnSkillUsage(currentPlayer, false);
    const defender = getOpponent(placedColor);
    advanceTurn();
    if (isOwnPerspective(defender)) {
      setMessage(`鬼打墙已生效：${PLAYER_LABELS[defender]} 已偷走敌方关键一子，轮到下一手。`);
    } else {
      setMessage("局势突变，关键一子已经消失，轮到下一手。");
    }
    renderAll();
    return;
  }

  if (result.outcome === "win") {
    endGame(placedColor, result.cells);
    SFX.win();
    renderAll();
    return;
  }

  if (result.outcome === "trigger" && placedColor === currentPlayer) {
    if (isSkillReleaseLocked(currentPlayer)) {
      noteTurnSkillUsage(currentPlayer, false);
      setMessage(
        isOwnPerspective(currentPlayer)
          ? "灵技冷却中：你上一回合已经释放过技能，本回合不能连续释放。"
          : "对手这一手触发了技能窗口，但因为冷却限制被自动跳过。"
      );
      pushLog(`${PLAYER_LABELS[currentPlayer]} 触发了技能窗口，但因连续施法限制被强制跳过。`);
      if (isOwnPerspective(currentPlayer)) {
        showBoardToast("灵技冷却中，本回合不能连续放技能。", 2400);
      }
      advanceTurn();
      renderAll();
      return;
    }

    state.skill.pendingTrigger = {
      tier: result.tier,
      source: { row, col },
      line: result.cells
    };

    const triggerText =
      result.tier === "small" ? "新形成 3 连，小技能已点亮。" : "新形成 4 连，大技能已点亮。";
    setMessage(`${triggerText} 请在弹窗中选择技能。`);
    pushLog(
      `${PLAYER_LABELS[currentPlayer]} 触发了${result.tier === "small" ? "小技能" : "大技能"}窗口。`
    );
    SFX.trigger();
    queueEffect(result.cells, "burst");
    renderAll();
    showSkillModal(result.tier);
    return;
  }

  noteTurnSkillUsage(currentPlayer, false);
  advanceTurn();
  renderAll();
}

function applyBlock(row, col) {
  const blockedFor = getOpponent(state.match.currentPlayer);

  if (state.board.cells[row][col] || hasBlockedCell(row, col, blockedFor)) {
    setMessage("这个格子不能被再次封锁，请选择空白位置。");
    return false;
  }

  state.skill.blockedCells.push({ row, col, blockedFor });
  pushLog(`${PLAYER_LABELS[state.match.currentPlayer]} 对 (${row + 1}, ${col + 1}) 施加了封锁。`);
  setMessage(`封锁已生效：${PLAYER_LABELS[blockedFor]} 下一手不能落在该位置。`);
  queueEffect([[row, col]], "lock", 950);
  return true;
}

function applyShock(row, col) {
  const { row: sourceRow, col: sourceCol } = state.board.lastMove;
  const dr = row - sourceRow;
  const dc = col - sourceCol;
  const landingRow = row + dr;
  const landingCol = col + dc;
  const opponent = getOpponent(state.match.currentPlayer);

  if (
    !isInside(landingRow, landingCol) ||
    state.board.cells[row][col] !== opponent ||
    state.board.cells[landingRow][landingCol]
  ) {
    setMessage("冲击失败：目标必须是紧邻本回合落点的敌子，且前方有空位。");
    return false;
  }

  state.board.cells[landingRow][landingCol] = opponent;
  state.board.cells[row][col] = null;
  pushLog(
    `${PLAYER_LABELS[state.match.currentPlayer]} 将敌子从 (${row + 1}, ${col + 1}) 推动到 (${landingRow + 1}, ${landingCol + 1})。`
  );
  setMessage("冲击已命中，敌子被推离了关键位置。");
  queueEffect(
    [
      [row, col],
      [landingRow, landingCol]
    ],
    "shock"
  );
  return true;
}

function applyBlast(row, col) {
  const opponent = getOpponent(state.match.currentPlayer);
  const cross = [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ].filter(([cellRow, cellCol]) => isInside(cellRow, cellCol));
  const removed = [];

  cross.forEach(([cellRow, cellCol]) => {
    if (state.board.cells[cellRow][cellCol] === opponent) {
      state.board.cells[cellRow][cellCol] = null;
      removed.push([cellRow, cellCol]);
    }
  });

  if (!removed.length) {
    setMessage("爆破落空：十字范围内没有敌子。");
    return false;
  }

  pushLog(
    `${PLAYER_LABELS[state.match.currentPlayer]} 在 (${row + 1}, ${col + 1}) 引爆十字区域，清除了 ${removed.length} 枚敌子。`
  );
  setMessage("爆破生效，战场结构被重新撕开。");
  queueEffect(removed, "blast", 950);
  return true;
}

function applyConvert(row, col) {
  const opponent = getOpponent(state.match.currentPlayer);

  if (state.board.cells[row][col] !== opponent) {
    setMessage("转化失败：目标必须是紧邻本回合落点的敌子。");
    return false;
  }

  state.board.cells[row][col] = state.match.currentPlayer;
  pushLog(
    `${PLAYER_LABELS[state.match.currentPlayer]} 将 (${row + 1}, ${col + 1}) 的敌子转化为己子。`
  );
  setMessage("转化完成。注意：技能改盘不会在本回合直接判胜。");
  queueEffect([[row, col]], "convert", 800);
  return true;
}

function applyWarp(row, col) {
  const currentPlayer = state.match.currentPlayer;

  if (!state.skill.warpSource) {
    if (state.board.cells[row][col] !== currentPlayer) {
      setMessage("传送第一步：请点击紧邻本回合落点的一枚己方棋子。");
      return "continue";
    }
    state.skill.warpSource = { row, col };
    setMessage("已选中传送棋子，现在点击棋盘上的任意空位作为目的地。");
    return "continue";
  }

  const src = state.skill.warpSource;

  if (state.board.cells[row][col]) {
    setMessage("目的地必须是空位。");
    return "continue";
  }

  state.board.cells[row][col] = currentPlayer;
  state.board.cells[src.row][src.col] = null;
  pushLog(
    `${PLAYER_LABELS[currentPlayer]} 将 (${src.row + 1}, ${src.col + 1}) 的己子传送到 (${row + 1}, ${col + 1})。`
  );
  setMessage("传送完成——棋子已瞬移至新阵地。");
  queueEffect([[src.row, src.col], [row, col]], "shock", 700);
  state.skill.warpSource = null;
  return true;
}

function applySiphon(row, col) {
  const opponent = getOpponent(state.match.currentPlayer);
  const affected = [];

  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (Math.abs(dr) + Math.abs(dc) > 2) continue;
      const cr = row + dr;
      const cc = col + dc;
      if (isInside(cr, cc) && state.board.cells[cr][cc] === opponent) {
        state.board.cells[cr][cc] = null;
        affected.push([cr, cc]);
      }
    }
  }

  if (!affected.length) {
    setMessage("虹吸落空：菱形范围内没有敌子。");
    return false;
  }

  pushLog(
    `${PLAYER_LABELS[state.match.currentPlayer]} 在 (${row + 1}, ${col + 1}) 释放虹吸，吸除了 ${affected.length} 枚敌子。`
  );
  setMessage("虹吸生效——敌方阵型出现真空地带。");
  queueEffect(affected, "blast", 900);
  return true;
}

function tryApplySkill(row, col) {
  const skillId = state.skill.selectedSkill;
  const targetableCells = getTargetableCells();

  if (!skillId) {
    setMessage("请先从右侧技能栏选择一个技能。");
    return;
  }

  if (!targetableCells.has(`${row}-${col}`)) {
    setMessage("这个位置不在当前技能的有效目标范围内。");
    return;
  }

  let success = false;

  if (skillId === "block") {
    success = applyBlock(row, col);
  } else if (skillId === "shock") {
    success = applyShock(row, col);
  } else if (skillId === "warp") {
    success = applyWarp(row, col);
  } else if (skillId === "blast") {
    success = applyBlast(row, col);
  } else if (skillId === "convert") {
    success = applyConvert(row, col);
  } else if (skillId === "siphon") {
    success = applySiphon(row, col);
  }

  if (success === "continue") {
    renderAll();
    return;
  }

  if (!success) {
    SFX.error();
    renderAll();
    return;
  }

  maybeShowFirstSkillLimitNotice(state.match.currentPlayer);
  noteTurnSkillUsage(state.match.currentPlayer, true);
  SFX.skillCast(skillId);
  advanceTurn();
  renderAll();
}

function handleBoardClick(row, col) {
  if (state.match.status === "finished") {
    return;
  }

  if (state.match.status === "opening") {
    setMessage("请先完成开局小游戏，先手定下来后才能落子。");
    renderStatus();
    return;
  }

  if (hasPendingUndoRequest()) {
    setMessage(
      state.online.undoRequest?.pendingMine
        ? "悔棋申请已发出，请等待对手确认。"
        : "对手正在请求悔棋，请先处理确认。"
    );
    renderStatus();
    return;
  }

  if (state.online.enabled && state.match.currentPlayer !== state.online.myColor) {
    setMessage("等待对手落子...");
    renderStatus();
    return;
  }

  if (state.ai.enabled && state.match.currentPlayer === "white") {
    setMessage("当前轮到 AI 行动，请等待它完成思考。");
    renderStatus();
    return;
  }

  if (state.skill.selectedSkill) {
    if (state.online.enabled) {
      const skillId = state.skill.selectedSkill;
      const targetableCells = getTargetableCells();
      if (!targetableCells.has(`${row}-${col}`)) {
        setMessage("这个位置不在当前技能的有效目标范围内。");
        return;
      }
      if (skillId === "warp" && !state.skill.warpSource) {
        tryApplySkill(row, col);
        return;
      }
      emitSkill(skillId, row, col);
    } else {
      tryApplySkill(row, col);
    }
    return;
  }

  if (state.online.enabled) {
    if (state.board.cells[row][col] || hasBlockedCell(row, col, state.match.currentPlayer)) {
      setMessage("这个位置不能落子。");
      return;
    }
    emitStone(row, col);
  } else {
    placeStone(row, col);
  }
}

function handleCellHover(row, col) {
  if (state.match.status === "finished" || state.match.status === "opening") {
    return;
  }

  if (state.skill.selectedSkill) {
    state.ui.hoverCell = { row, col };
    updateBoardHoverState();
    return;
  }

  if (state.board.cells[row][col] || hasBlockedCell(row, col, state.match.currentPlayer)) {
    clearHoverCell();
    return;
  }

  state.ui.hoverCell = { row, col };
  updateBoardHoverState();
}

function clearHoverCell() {
  if (!state.ui.hoverCell) {
    return;
  }

  state.ui.hoverCell = null;
  updateBoardHoverState();
}

function updateBoardHoverState() {
  const cells = dom.board.querySelectorAll(".cell");

  cells.forEach((cell) => cell.classList.remove("hovered"));

  if (!state.ui.hoverCell) {
    return;
  }

  const selector = `.cell[data-row="${state.ui.hoverCell.row}"][data-col="${state.ui.hoverCell.col}"]`;
  const hoveredCell = dom.board.querySelector(selector);

  if (hoveredCell) {
    hoveredCell.classList.add("hovered");
  }
}

function resetGame() {
  if (hasPendingUndoRequest()) {
    setMessage("当前有待处理的悔棋请求，请先完成确认。");
    renderAll();
    return;
  }

  if (state.online.enabled && onlineSocket) {
    onlineSocket.emit("new-game-request");
    return;
  }
  doResetGame();
}

function doResetGame() {
  clearAITimer();
  syncAwakeningProgressFromState();
  const mode = state.match.mode;
  const difficulty = state.ai.difficulty;
  const engine = state.ai.engine;
  const onlineState = { ...state.online };
  state = createInitialState(mode);
  state.ai.difficulty = difficulty;
  state.ai.engine = engine === "proxy" ? "proxy" : "local";
  state.online = onlineState;
  state.online.undoRequest = {
    pendingMine: false,
    pendingIncoming: false
  };
  const myGhostArmed =
    state.online.enabled && state.online.myColor
      ? state.hidden.ghostWall[state.online.myColor]?.armed
      : false;
  const anyGhostArmed = Object.values(state.hidden.ghostWall).some((ghostState) => ghostState.armed);
  if (!state.online.enabled) {
    const awakenedPlayers = Object.entries(state.hidden.ghostWall)
      .filter(([, ghostState]) => ghostState.armed)
      .map(([player]) => PLAYER_LABELS[player]);
    if (awakenedPlayers.length) {
      pushLog(`${awakenedPlayers.join("、")} 已觉醒隐藏技能“${GHOST_WALL_SKILL.name}”。`);
      setMessage(`新一局开始：${awakenedPlayers.join("、")} 可在危局中触发“${GHOST_WALL_SKILL.name}”。`);
    }
  } else if (myGhostArmed) {
    pushLog(`你已觉醒隐藏技能“${GHOST_WALL_SKILL.name}”。`);
    setMessage(`新一局开始：你的“${GHOST_WALL_SKILL.name}”已待命，可在危局中自动触发。`);
  } else if (anyGhostArmed) {
    pushLog("棋局深处似乎有异象在酝酿。");
    setMessage("新一局开始：棋局暗流涌动，小心看不见的变数。");
  }
  SFX.newGame();
  if (!state.online.enabled) {
    startOfflineOpeningGame();
    return;
  }
  renderAll();
}

function undoMove() {
  clearAITimer();
  if (state.online.enabled) {
    if (hasPendingUndoRequest()) {
      setMessage(
        state.online.undoRequest?.pendingMine
          ? "悔棋申请已发出，请等待对手确认。"
          : "对手正在等待你的悔棋确认。"
      );
      renderAll();
      return;
    }

    if (!state.history.length) {
      setMessage("还没有可悔的棋步。");
      renderAll();
      return;
    }

    const snapshot = state.history[state.history.length - 1];
    const sessionState = {
      board: structuredClone(snapshot.board),
      match: {
        ...structuredClone(snapshot.match),
        mode: "online"
      },
      skill: structuredClone(snapshot.skill),
      hidden: structuredClone(snapshot.hidden),
      progress: structuredClone(awakeningProgress),
      ui: {
        message: "悔棋成功。你可以重新思考这一手。",
        logs: ["已回退到上一步状态。", ...snapshot.ui.logs].slice(0, 8)
      },
      history: structuredClone(state.history.slice(0, -1))
    };
    state.online.undoRequest = {
      pendingMine: true,
      pendingIncoming: false
    };
    setMessage("悔棋申请已发出，等待对手确认。");
    pushLog("你发起了悔棋申请。");
    renderAll();
    emitUndoRequest(sessionState);
    return;
  }

  if (!state.history.length) {
    setMessage("还没有可悔的棋步。");
    renderAll();
    return;
  }

  const snapshot = state.history.pop();
  restoreSnapshot(snapshot);
  pushLog("已回退到上一步状态。");
  setMessage("悔棋成功。你可以重新思考这一手。");
  renderAll();
}

function skipSkill() {
  if (hasPendingUndoRequest()) {
    setMessage("当前有待处理的悔棋请求，请先完成确认。");
    renderAll();
    return;
  }

  if (!state.skill.pendingTrigger) {
    setMessage("当前没有可跳过的技能窗口。");
    renderAll();
    return;
  }

  if (state.online.enabled) {
    if (state.match.currentPlayer !== state.online.myColor) return;
    if (onlineSocket) onlineSocket.emit("skip-skill");
    return;
  }

  doSkipSkill();
}

function doSkipSkill() {
  state.skill.warpSource = null;
  pushLog(`${PLAYER_LABELS[state.match.currentPlayer]} 放弃了本回合技能。`);
  setMessage("你跳过了技能窗口，回合将正常切换。");
  noteTurnSkillUsage(state.match.currentPlayer, false);
  advanceTurn();
  renderAll();
}

function handleSendChat() {
  if (!state.online.enabled || !dom.chatInput) {
    return;
  }

  const text = dom.chatInput.value.trim();
  if (!text) {
    return;
  }

  emitChatMessage(text);
  dom.chatInput.value = "";
}

function setMode(mode) {
  clearAITimer();
  const previousDifficulty = state.ai.difficulty;
  const previousEngine = state.ai.engine;
  state = createInitialState(mode);

  if (mode === "ai") {
    state.ai.difficulty = previousDifficulty in DIFFICULTY_LABELS ? previousDifficulty : "normal";
    state.ai.engine = previousEngine === "proxy" ? "proxy" : "local";
  }

  state.ui.logs = [
    mode === "ai"
      ? "AI 模式已启用：当前使用本地占位引擎，后续可替换为 DeepSeek 决策。"
      : "已切回本地双人模式，你可以手动控制双方走子。"
  ];
  state.ui.message =
    mode === "ai"
      ? "AI 模式已启用。每局会先做一个小游戏，再决定由谁开局。"
      : "已切回本地双人模式。每局开始前都会先做一个小游戏决定先手。";
  startOfflineOpeningGame();
}

function setDifficulty(level) {
  if (!state.ai.enabled || !(level in DIFFICULTY_LABELS)) {
    return;
  }

  state.ai.difficulty = level;
  pushLog(`AI 难度已切换为 ${DIFFICULTY_LABELS[level]}。`);
  renderAll();
}

function handleGlobalKeydown(event) {
  if (event.defaultPrevented) {
    return;
  }

  const target = event.target;
  const tag = target && target.tagName;

  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const { key } = event;

  if (key === "Escape") {
    if (state.skill.selectedSkill) {
      event.preventDefault();
      state.skill.selectedSkill = null;
      state.skill.warpSource = null;
      setMessage("已取消技能选择。");
      renderAll();
    }

    return;
  }

  if (key === "n" || key === "N") {
    event.preventDefault();
    resetGame();
    return;
  }

  if (key === "u" || key === "U") {
    event.preventDefault();
    undoMove();
    return;
  }

  if (key === "s" || key === "S") {
    if (state.skill.pendingTrigger) {
      event.preventDefault();
      skipSkill();
    }
  }
}

function bindEvents() {
  dom.modeLocal.addEventListener("click", () => setMode("local-pvp"));
  dom.modeAi.addEventListener("click", () => setMode("ai"));
  dom.engineLocal.addEventListener("click", () => setEngine("local"));
  dom.engineProxy.addEventListener("click", () => setEngine("proxy"));
  dom.proxySave.addEventListener("click", saveProxyConfig);
  dom.difficultyButtons.forEach((btn) => {
    btn.addEventListener("click", () => setDifficulty(btn.dataset.difficulty));
  });
  dom.newGame.addEventListener("click", resetGame);
  dom.modalNewGame.addEventListener("click", resetGame);
  if (dom.noticeConfirm) {
    dom.noticeConfirm.addEventListener("click", hideNoticeModal);
  }
  dom.undoMove.addEventListener("click", undoMove);
  dom.skipSkill.addEventListener("click", skipSkill);
  if (dom.undoApprove) {
    dom.undoApprove.addEventListener("click", () => {
      state.online.undoRequest = {
        pendingMine: false,
        pendingIncoming: false
      };
      emitUndoResponse(true);
      setMessage("你已同意对手悔棋，正在同步棋局。");
      renderAll();
    });
  }
  if (dom.undoReject) {
    dom.undoReject.addEventListener("click", () => {
      state.online.undoRequest = {
        pendingMine: false,
        pendingIncoming: false
      };
      emitUndoResponse(false);
      setMessage("你拒绝了这次悔棋请求。");
      renderAll();
    });
  }
  if (dom.chatSend) {
    dom.chatSend.addEventListener("click", handleSendChat);
  }
  if (dom.chatInput) {
    dom.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSendChat();
      }
    });
  }
  document.addEventListener("keydown", handleGlobalKeydown);
  dom.board.addEventListener("mouseover", (event) => {
    const cell = event.target.closest(".cell");

    if (!cell || !dom.board.contains(cell)) {
      return;
    }

    handleCellHover(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  dom.board.addEventListener("mouseleave", clearHoverCell);
}

function hideWelcomeModal() {
  const modal = document.querySelector("#welcome-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}

function dismissWelcome(mode) {
  hideWelcomeModal();

  if (mode === "ai") {
    state = createInitialState("ai");
    state.ai.engine = "proxy";
    state.ui.logs = ["AI 对战模式已启用，DeepSeek 代理已自动激活。你先执黑子。"];
    state.ui.message = "AI 对战模式已启用。先做一个开局小游戏，看看谁先手。";
  } else if (mode === "online") {
    return;
  } else {
    state = createInitialState("local-pvp");
    state.ui.logs = ["本地练习模式：两位玩家轮流在同一台电脑上落子。"];
    state.ui.message = "练习模式已就绪。先做一个开局小游戏，决定谁先开局。";
  }

  startOfflineOpeningGame();
}

function startOnlineGame(color, roomCode) {
  if (
    state.online.enabled &&
    state.online.myColor === color &&
    state.online.roomCode === roomCode
  ) {
    return;
  }

  setLobbyAction("playing");
  hideWelcomeModal();
  const chatMessages = state.online.chatMessages ? [...state.online.chatMessages] : [];
  state = createInitialState("online");
  state.online.myColor = color;
  state.online.roomCode = roomCode;
  state.online.chatMessages = chatMessages;
  onlineColor = color;
  onlineRoomCode = roomCode;
  refreshOnlineSocketAuth();

  const colorName = color === "black" ? "夜幕(黑)" : "星辉(白)";
  state.ui.logs = [`在线对战已开始！你是${colorName}，房间码 ${roomCode}。`];
  state.ui.message = "房间已就绪，正在抽取开局小游戏来决定谁先手。";
  renderAll();
}

function emitStone(row, col) {
  if (onlineSocket) {
    onlineSocket.emit("place-stone", { row, col });
  }
}

function emitSkill(skillId, row, col) {
  if (onlineSocket) {
    onlineSocket.emit("use-skill", {
      skillId,
      row,
      col,
      warpSource: state.skill.warpSource
    });
  }
}

function emitStateSync(sessionState, targetRole = null) {
  if (onlineSocket) {
    onlineSocket.emit("sync-state", {
      sessionState,
      targetRole
    });
  }
}

function emitChatMessage(text) {
  if (onlineSocket) {
    onlineSocket.emit("chat-message", { text });
  }
}

function emitUndoRequest(sessionState) {
  if (onlineSocket) {
    onlineSocket.emit("undo-request", { sessionState });
  }
}

function emitUndoResponse(accepted) {
  if (onlineSocket) {
    onlineSocket.emit("undo-response", { accepted });
  }
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setLobbyAction(action) {
  onlineLobby.action = action;
}

function setRoomStatus(text, show = true) {
  if (dom.roomStatus) dom.roomStatus.hidden = !show;
  if (dom.roomStatusText) dom.roomStatusText.textContent = text;
}

function setRoomControlsDisabled(disabled) {
  if (dom.roomCreate) dom.roomCreate.disabled = disabled;
  if (dom.roomJoin) dom.roomJoin.disabled = disabled;
  if (dom.roomCodeInput) dom.roomCodeInput.disabled = disabled;
}

function setRoomJoinInputDisabled(disabled) {
  if (dom.roomCodeInput) dom.roomCodeInput.disabled = disabled;
}

function setRoomButtonLabels(createText = "创建房间", joinText = "加入") {
  if (dom.roomCreateLabel) {
    dom.roomCreateLabel.textContent = createText;
  }
  if (dom.roomJoinLabel) {
    dom.roomJoinLabel.textContent = joinText;
  }
}

function isLobbyPanelVisible() {
  return Boolean(dom.welcomeRoomPanel && !dom.welcomeRoomPanel.hidden && !state.online.enabled);
}

function reportLobbyError(message) {
  if (!isLobbyPanelVisible()) {
    return;
  }

  setLobbyAction("error");
  setRoomStatus(`联机调试：${message}`);
  setRoomControlsDisabled(false);
  setRoomButtonLabels();
}

function previewCreateRoomClick() {
  if (dom.roomCreate && !dom.roomCreate.disabled) {
    setRoomStatus("已检测到点击“创建房间”，正在处理...");
  }
}

function previewJoinRoomClick() {
  if (dom.roomJoin && !dom.roomJoin.disabled) {
    setRoomStatus("已检测到点击“加入”，正在处理...");
  }
}

function disconnectOnlineSocket() {
  onlineLobby.connectPromise = null;
  onlineLobby.warmupPromise = null;
  setLobbyAction("idle");
  onlineColor = null;
  onlineRoomCode = null;
  setStoredOnlineToken("");

  if (onlineSocket) {
    onlineSocket.disconnect();
    onlineSocket = null;
  }
}

function ensureSocketLibrary() {
  if (typeof window.io !== "function") {
    throw new Error("socket_library_missing");
  }
}

async function warmUpOnlineServer() {
  if (onlineLobby.warmupPromise) {
    return onlineLobby.warmupPromise;
  }

  const url = getServerUrl();
  if (!url) {
    throw new Error("missing_server_url");
  }

  const healthUrl = `${url.replace(/\/$/, "")}/health`;

  onlineLobby.warmupPromise = (async () => {
    const deadline = Date.now() + ONLINE_SERVER_WAKE_TIMEOUT_MS;
    let lastError = null;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          cache: "no-store"
        });

        if (response.ok) {
          return;
        }

        lastError = new Error(`health_http_${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await waitMs(ONLINE_SERVER_WAKE_RETRY_MS);
    }

    throw lastError || new Error("server_wakeup_timeout");
  })();

  try {
    await onlineLobby.warmupPromise;
  } finally {
    onlineLobby.warmupPromise = null;
  }
}

function emitSocketAck(eventName, payload, timeoutMs = ROOM_ACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!onlineSocket) {
      reject(new Error("socket_not_connected"));
      return;
    }

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("socket_ack_timeout"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
    };

    const handleAck = (resp) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(resp || {});
    };

    try {
      if (typeof payload === "undefined") {
        onlineSocket.emit(eventName, handleAck);
      } else {
        onlineSocket.emit(eventName, payload, handleAck);
      }
    } catch (error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

function bindOnlineSocketEvents(socket) {
  if (socket.io) {
    socket.io.on("reconnect_attempt", (attempt) => {
      if (state.online.enabled) {
        setMessage(`联机连接波动，正在尝试第 ${attempt} 次重连...`);
        renderAll();
      } else if (dom.welcomeRoomPanel && !dom.welcomeRoomPanel.hidden) {
        setLobbyAction("reconnecting");
        setRoomStatus(`联机连接波动，正在尝试第 ${attempt} 次重连...`);
      }
    });

    socket.io.on("reconnect_failed", () => {
      if (state.online.enabled) {
        pushLog("联机自动重连失败，已超过最大尝试次数。");
        setMessage("联机自动重连失败，请稍后重新进入房间。");
        renderAll();
      } else if (dom.welcomeRoomPanel && !dom.welcomeRoomPanel.hidden) {
        setLobbyAction("error");
        setRoomStatus("联机自动重连失败，请稍后重试创建或加入房间。");
        setRoomControlsDisabled(false);
        setRoomButtonLabels();
      }
    });
  }

  socket.on("connect", () => {
    if (!state.online.enabled) {
      if (onlineLobby.action === "connecting") {
        setLobbyAction("ready");
        setRoomStatus("已连接联机服务器，可以创建房间或输入房间号加入。");
        setRoomControlsDisabled(false);
      } else if (onlineLobby.action === "reconnecting") {
        setLobbyAction("ready");
        setRoomStatus("联机服务器已重新连接。");
        setRoomControlsDisabled(false);
      }
    }
  });

  socket.on("game-started", (data) => {
    setLobbyAction("starting");
    setRoomStatus("房间已就绪，正在进入对战...", true);
    SFX.newGame();
    startOnlineGame(data.color, data.code || onlineRoomCode);
  });

  socket.on("opening-game-start", (data) => {
    const game = data?.game?.id ? data.game : getOpeningGameById(data?.gameId);
    if (!game) {
      return;
    }
    startOpeningGame(game, {
      roundId: data.roundId,
      submitted: Boolean(data.submitted)
    });
  });

  socket.on("opening-game-result", (data) => {
    if (!data?.starter) {
      return;
    }
    finalizeOpeningGame({
      starter: data.starter,
      summary: data.summary || `${PLAYER_LABELS[data.starter]} 拿到先手。`
    });
  });

  socket.on("session-restored", (data) => {
    onlineRoomCode = data.code || onlineRoomCode;
    refreshOnlineSocketAuth();
    if (data.reconnectToken) {
      setStoredOnlineToken(data.reconnectToken);
    }
    if (data.started) {
      startOnlineGame(data.color, data.code || onlineRoomCode);
      pushLog("联机连接已恢复，正在向对手同步最新盘面。");
      setMessage("连接已恢复，等待最新盘面同步...");
      renderAll();
    } else {
      setLobbyAction("waiting");
      setRoomStatus(`已恢复到房间 ${onlineRoomCode}，等待另一位玩家加入。`);
    }
  });

  socket.on("opponent-joined", (data) => {
    onlineRoomCode = data.code || onlineRoomCode;
    refreshOnlineSocketAuth();
    if (!state.online.enabled) {
      setLobbyAction("starting");
      setRoomStatus(`玩家已加入房间 ${onlineRoomCode}，正在开始对战...`);
    }
  });

  socket.on("stone-placed", (data) => {
    if (state.match.status === "finished") return;
    if (state.board.cells[data.row][data.col]) return;
    placeStone(data.row, data.col, {
      actorPlayer: data.player,
      placedColor: data.placedColor || data.player
    });
  });

  socket.on("skill-used", (data) => {
    if (state.match.status === "finished") return;
    if (data.warpSource) {
      state.skill.warpSource = data.warpSource;
    }
    state.skill.selectedSkill = data.skillId;
    tryApplySkill(data.row, data.col);
  });

  socket.on("skill-skipped", () => {
    if (state.match.status === "finished") return;
    doSkipSkill();
  });

  socket.on("new-game-sync", () => {
    doResetGame();
  });

  socket.on("undo-requested", () => {
    state.online.undoRequest = {
      pendingMine: false,
      pendingIncoming: true
    };
    pushLog("对手发来了悔棋请求。");
    setMessage("对手发来悔棋请求，请先确认。");
    showBoardToast("求求了，让我悔棋吧", 2600);
    renderAll();
  });

  socket.on("undo-request-pending", () => {
    state.online.undoRequest = {
      pendingMine: true,
      pendingIncoming: false
    };
    setMessage("悔棋申请已送达，等待对手确认。");
    renderAll();
  });

  socket.on("undo-approved", (data) => {
    state.online.undoRequest = {
      pendingMine: false,
      pendingIncoming: false
    };

    if (data?.sessionState) {
      applyOnlineSessionState(data.sessionState);
      pushLog("对手同意了悔棋请求，棋局已回退一步。");
      setMessage("悔棋已生效，棋局已回退一步。");
      showBoardToast("悔棋已生效", 2200);
      renderAll();
    }
  });

  socket.on("undo-rejected", () => {
    state.online.undoRequest = {
      pendingMine: false,
      pendingIncoming: false
    };
    pushLog("对手拒绝了悔棋请求。");
    setMessage("对手拒绝了你的悔棋请求。");
    showBoardToast("对手拒绝了悔棋", 2200);
    renderAll();
  });

  socket.on("state-sync", (data) => {
    if (!data?.sessionState) {
      return;
    }

    if (!state.online.enabled && data.code && data.color) {
      startOnlineGame(data.color, data.code);
    }

    applyOnlineSessionState(data.sessionState);
    pushLog("已与对手同步最新对局状态。");
    renderAll();
  });

  socket.on("request-state-sync", (data) => {
    if (!state.online.enabled) {
      return;
    }

    emitStateSync(buildOnlineSessionState(), data?.targetRole || null);
  });

  socket.on("chat-message", (data) => {
    if (!data?.text) {
      return;
    }

    appendChatMessage(data.player, data.text, data.timestamp);
    showBoardToast(getChatToastText(data.player, data.text), 2400);
    renderAll();
  });

  socket.on("opponent-disconnected", () => {
    state.online.undoRequest = {
      pendingMine: false,
      pendingIncoming: false
    };
    if (!state.online.enabled) {
      setLobbyAction("ready");
      setRoomStatus("对手已离开，房间已失效，请重新创建或加入。");
      setRoomControlsDisabled(false);
      setRoomButtonLabels();
      return;
    }

    pushLog("对手连接断开，服务器正在等待其重连。");
    setMessage(`对手连接中断，服务器会保留房间 ${Math.round(ONLINE_RECONNECT_GRACE_MS / 1000)} 秒等待其重连。`);
    renderAll();
  });

  socket.on("disconnect", (reason) => {
    onlineLobby.connectPromise = null;
    state.online.undoRequest = {
      pendingMine: false,
      pendingIncoming: false
    };

    if (reason === "io client disconnect") {
      return;
    }

    if (!state.online.enabled && dom.welcomeRoomPanel && !dom.welcomeRoomPanel.hidden) {
      setLobbyAction("reconnecting");
      setRoomStatus("联机连接已断开，请稍候后重试创建/加入房间。");
      setRoomControlsDisabled(false);
      setRoomButtonLabels();
      return;
    }

    if (state.online.enabled) {
      pushLog(`联机连接已断开：${reason}`);
      setMessage(`联机连接已断开，正在尝试在 ${Math.round(ONLINE_RECONNECT_GRACE_MS / 1000)} 秒内自动恢复...`);
      renderAll();
    }
  });
}

async function ensureOnlineSocket() {
  ensureSocketLibrary();

  if (onlineSocket?.connected) {
    setLobbyAction("ready");
    setRoomStatus("已连接联机服务器，可以创建房间或输入房间号加入。");
    setRoomControlsDisabled(false);
    return onlineSocket;
  }

  if (onlineLobby.connectPromise) {
    return onlineLobby.connectPromise;
  }

  onlineLobby.connectPromise = (async () => {
    const url = getServerUrl();
    if (!url) {
      throw new Error("missing_server_url");
    }

    setLobbyAction("connecting");
    setRoomStatus("正在连接联机服务器，首次可能需要 10-60 秒...");

    await warmUpOnlineServer();

    if (onlineSocket) {
      onlineSocket.disconnect();
      onlineSocket = null;
    }

    const socket = window.io(url, {
      auth: {
        roomCode: onlineRoomCode,
        reconnectToken: onlineReconnectToken
      },
      transports: ["websocket", "polling"],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: ONLINE_SOCKET_RECONNECT_ATTEMPTS,
      reconnectionDelay: ONLINE_SOCKET_RECONNECT_DELAY_MS,
      reconnectionDelayMax: ONLINE_SOCKET_RECONNECT_DELAY_MAX_MS,
      randomizationFactor: 0.35
    });

    bindOnlineSocketEvents(socket);
    onlineSocket = socket;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
      };

      const handleConnect = () => {
        cleanup();
        resolve();
      };

      const handleError = (error) => {
        cleanup();
        reject(error || new Error("socket_connect_error"));
      };

      socket.once("connect", handleConnect);
      socket.once("connect_error", handleError);
    });

    setLobbyAction("ready");
    setRoomStatus("已连接联机服务器，可以创建房间或输入房间号加入。");
    setRoomControlsDisabled(false);
    return socket;
  })();

  try {
    return await onlineLobby.connectPromise;
  } finally {
    onlineLobby.connectPromise = null;
  }
}

function showRoomPanel() {
  if (dom.welcomeModeSelect) dom.welcomeModeSelect.hidden = true;
  if (dom.welcomeRoomPanel) dom.welcomeRoomPanel.hidden = false;
  if (dom.roomCodeInput) dom.roomCodeInput.value = "";
  setRoomButtonLabels();
  setRoomStatus("联机大厅已打开。你可以直接点“创建房间”，或输入房间号后点“加入”。", true);
  setRoomControlsDisabled(false);
  setLobbyAction("idle");

  void ensureOnlineSocket().catch((error) => {
    const message =
      error?.message === "socket_library_missing"
        ? "联机脚本加载失败，请刷新页面后重试。"
        : error?.message === "missing_server_url"
          ? "未配置联机服务器地址，请检查 config.js。"
          : "联机服务器暂时不可用，请稍后再试。";

    setLobbyAction("idle");
    setRoomStatus(message);
    setRoomControlsDisabled(false);
    setRoomButtonLabels();
  });
}

function showModeSelect() {
  if (dom.welcomeModeSelect) dom.welcomeModeSelect.hidden = false;
  if (dom.welcomeRoomPanel) dom.welcomeRoomPanel.hidden = true;
  setRoomStatus("", false);
  disconnectOnlineSocket();
}

async function handleCreateRoom() {
  if (!dom.roomCreate) {
    return;
  }

  try {
    SFX.click();
    setLobbyAction("creating");
    setRoomButtonLabels("创建中...", "加入");
    setRoomStatus("正在创建房间，若服务器刚启动可能需要等待几十秒...");
    if (dom.roomCreate) dom.roomCreate.disabled = true;
    if (dom.roomJoin) dom.roomJoin.disabled = true;
    setRoomJoinInputDisabled(true);
    await ensureOnlineSocket();
    const resp = await emitSocketAck("create-room");

    if (resp.error) {
      throw new Error(resp.error);
    }

    onlineRoomCode = resp.code;
    refreshOnlineSocketAuth();
    if (resp.reconnectToken) {
      setStoredOnlineToken(resp.reconnectToken);
    }
    setLobbyAction("waiting");
    if (dom.roomCreate) dom.roomCreate.disabled = false;
    if (dom.roomJoin) dom.roomJoin.disabled = false;
    setRoomJoinInputDisabled(false);
    setRoomButtonLabels("创建房间", "加入");
    setRoomStatus(`房间码: ${resp.code} — 你是房主，等待另一位玩家加入后将自动开始对战。`);
  } catch (error) {
    const fallbackMessage =
      error?.message === "socket_library_missing"
        ? "联机脚本加载失败，请刷新页面后重试。"
        : error?.message === "socket_ack_timeout"
          ? "创建房间超时，请稍后重试。"
          : error?.message === "missing_server_url"
            ? "未配置联机服务器地址，请检查 config.js。"
            : error?.message || "创建房间失败，请稍后重试。";

    setLobbyAction("ready");
    setRoomStatus(fallbackMessage);
    setRoomControlsDisabled(false);
    setRoomButtonLabels();
  }
}

async function handleJoinRoom() {
  if (!dom.roomJoin || !dom.roomCodeInput) {
    return;
  }

  const code = dom.roomCodeInput.value.trim();
  if (code.length !== 4) {
    setRoomStatus("请输入 4 位房间码");
    return;
  }

  try {
    SFX.click();
    setLobbyAction("joining");
    setRoomButtonLabels("创建房间", "加入中...");
    setRoomStatus(`正在加入房间 ${code}...`);
    if (dom.roomCreate) dom.roomCreate.disabled = true;
    if (dom.roomJoin) dom.roomJoin.disabled = true;
    setRoomJoinInputDisabled(true);
    await ensureOnlineSocket();
    const resp = await emitSocketAck("join-room", { code });

    if (resp.error) {
      throw new Error(resp.error);
    }

    onlineRoomCode = resp.code;
    refreshOnlineSocketAuth();
    if (resp.reconnectToken) {
      setStoredOnlineToken(resp.reconnectToken);
    }
    setLobbyAction("starting");
    if (dom.roomCreate) dom.roomCreate.disabled = false;
    if (dom.roomJoin) dom.roomJoin.disabled = false;
    setRoomJoinInputDisabled(false);
    setRoomButtonLabels("创建房间", "加入");
    setRoomStatus(`已加入房间 ${resp.code}，正在等待房主开始对战...`);
  } catch (error) {
    const fallbackMessage =
      error?.message === "socket_library_missing"
        ? "联机脚本加载失败，请刷新页面后重试。"
        : error?.message === "socket_ack_timeout"
          ? "加入房间超时，请检查房间号或稍后重试。"
          : error?.message === "missing_server_url"
            ? "未配置联机服务器地址，请检查 config.js。"
            : error?.message || "加入房间失败，请稍后重试。";

    setLobbyAction("ready");
    setRoomStatus(fallbackMessage);
    setRoomControlsDisabled(false);
    setRoomButtonLabels();
  }
}

function bindWelcome() {
  const btnOnline = document.querySelector("#welcome-online");
  const btnAi = document.querySelector("#welcome-ai");
  const btnLocal = document.querySelector("#welcome-local");
  const roomActions = document.querySelector(".room-actions");

  if (btnLocal) {
    btnLocal.addEventListener("click", () => {
      SFX.newGame();
      dismissWelcome("local-pvp");
    });
  }

  if (btnAi) {
    btnAi.addEventListener("click", () => {
      SFX.newGame();
      dismissWelcome("ai");
    });
  }

  if (btnOnline) {
    btnOnline.addEventListener("click", () => {
      SFX.click();
      showRoomPanel();
    });
  }

  if (dom.roomBack) {
    dom.roomBack.addEventListener("click", () => {
      SFX.click();
      showModeSelect();
    });
  }

  if (dom.roomCreate) {
    dom.roomCreate.addEventListener("pointerdown", previewCreateRoomClick);
    dom.roomCreate.addEventListener("click", () => {
      void handleCreateRoom();
    });
  }

  if (dom.roomJoin && dom.roomCodeInput) {
    dom.roomCodeInput.addEventListener("input", () => {
      dom.roomCodeInput.value = dom.roomCodeInput.value.replace(/\D/g, "").slice(0, 4);
    });

    dom.roomJoin.addEventListener("pointerdown", previewJoinRoomClick);

    dom.roomJoin.addEventListener("click", () => {
      void handleJoinRoom();
    });

    dom.roomCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        void handleJoinRoom();
      }
    });
  }

  if (roomActions) {
    roomActions.addEventListener("click", (event) => {
      const target = event.target.closest("#room-create, #room-join");
      if (!target) {
        return;
      }

      if (target.id === "room-create") {
        previewCreateRoomClick();
        void handleCreateRoom();
      } else if (target.id === "room-join") {
        previewJoinRoomClick();
        void handleJoinRoom();
      }
    });
  }
}

window.addEventListener("error", (event) => {
  const message = event.error?.message || event.message || "未知脚本错误";
  reportLobbyError(message);
});

window.skillGomokuOnlineCreatePreview = previewCreateRoomClick;
window.skillGomokuOnlineJoinPreview = previewJoinRoomClick;
window.skillGomokuOnlineCreate = () => {
  void handleCreateRoom();
};
window.skillGomokuOnlineJoin = () => {
  void handleJoinRoom();
};

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason?.message || "未知 Promise 异常";
  reportLobbyError(message);
});

function showSkillModal(tier) {
  if (state.ai.enabled && state.match.currentPlayer === "white") return;
  if (state.online.enabled && state.match.currentPlayer !== state.online.myColor) return;

  const modal = document.getElementById("skill-modal");
  const titleEl = document.getElementById("skill-modal-title");
  const tierEl = document.getElementById("skill-modal-tier");
  const descEl = document.getElementById("skill-modal-desc");
  const btnContainer = document.getElementById("skill-modal-buttons");
  const skipBtn = document.getElementById("skill-modal-skip");

  if (!modal) return;

  tierEl.textContent = tier === "small" ? "小技能已就绪" : "大技能已就绪";
  titleEl.textContent = tier === "small" ? "三连成势 — 灵技解封" : "四连惊天 — 神技降世";
  descEl.textContent = "选择一项技能改变局势，或蓄力跳过。";
  btnContainer.innerHTML = "";

  const options = getSkillOptions();
  options.forEach((skill) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "skill-button";
    btn.innerHTML = `<strong>${skill.name}</strong><span>${skill.description}</span>`;
    btn.addEventListener("click", () => {
      hideSkillModal();
      state.skill.selectedSkill = skill.id;
      state.skill.warpSource = null;
      SFX.click();
      setMessage(`已选择「${skill.name}」，请点击棋盘上的有效目标。`);
      renderAll();
    });
    btnContainer.appendChild(btn);
  });

  skipBtn.onclick = () => {
    hideSkillModal();
    skipSkill();
  };

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hideSkillModal() {
  const modal = document.getElementById("skill-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

bindEvents();
bindWelcome();
