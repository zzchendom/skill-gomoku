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

let onlineSocket = null;
let onlineColor = null;
let onlineRoomCode = null;

const dom = {
  board: document.querySelector("#board"),
  message: document.querySelector("#message"),
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
  modalNewGame: document.querySelector("#modal-new-game")
};

let state = createInitialState();

function createInitialBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function createInitialState(mode = "local-pvp") {
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
      status: "playing",
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
      hoverCell: null
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
      roomCode: null
    },
    history: []
  };
}

function cloneStateSnapshot() {
  return {
    board: structuredClone(state.board),
    match: structuredClone(state.match),
    skill: structuredClone(state.skill),
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
    ui: {
      message: snapshot.ui.message,
      logs: snapshot.ui.logs,
      effects: [],
      hoverCell: snapshot.ui.hoverCell
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

  let turnText = `第 ${state.match.turn} 手`;
  if (state.online.enabled && state.match.status === "playing") {
    turnText += state.match.currentPlayer === state.online.myColor
      ? " · 你的回合" : " · 对手回合";
  } else if (state.ai.enabled && state.match.status === "playing") {
    turnText +=
      state.match.currentPlayer === "black" ? " · 你的回合" : " · AI 回合";
  }
  dom.turnLabel.textContent = turnText;
  dom.phaseLabel.textContent = getPhaseLabel();
  document.body.dataset.turn = state.match.currentPlayer;
  document.body.dataset.phase = phaseKey;

  if (state.match.status === "finished") {
    dom.triggerLabel.textContent = `${PLAYER_LABELS[state.match.winner]} 完成终局`;
  } else if (state.skill.pendingTrigger) {
    const spark = state.skill.pendingTrigger.tier === "small" ? "3 连小技能" : "4 连大技能";
    dom.triggerLabel.textContent = `${spark} 已点亮`;
  } else {
    dom.triggerLabel.textContent = "等待连段触发";
  }

  dom.blackBadge.classList.toggle("active", state.match.currentPlayer === "black");
  dom.whiteBadge.classList.toggle("active", state.match.currentPlayer === "white");
  dom.message.textContent = state.ui.message;
  dom.undoMove.disabled = state.history.length === 0;
  dom.skipSkill.disabled = !state.skill.pendingTrigger;
  dom.modeLocal.classList.toggle("active", !state.ai.enabled);
  dom.modeAi.classList.toggle("active", state.ai.enabled);

  if (dom.aiDifficultyRow) {
    dom.aiDifficultyRow.hidden = !state.ai.enabled;
  }

  if (dom.aiEngineRow) {
    const hasDefaultProxy = Boolean(getDefaultProxyUrl());
    dom.aiEngineRow.hidden = !state.ai.enabled || hasDefaultProxy;
  }

  if (dom.engineLocal && dom.engineProxy) {
    dom.engineLocal.classList.toggle("active", state.ai.engine !== "proxy");
    dom.engineProxy.classList.toggle("active", state.ai.engine === "proxy");
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
    btn.disabled = !state.ai.enabled;
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
    dom.skillHint.textContent = "未触发";
    dom.skillList.innerHTML = `
      <button class="skill-button" type="button" disabled>
        等待连段触发
        <small>先落子形成 3 连或 4 连，再从这里选择本回合技能。</small>
      </button>
    `;
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

  dom.board.classList.toggle("preview-black", state.match.currentPlayer === "black");
  dom.board.classList.toggle("preview-white", state.match.currentPlayer === "white");
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
  dom.winnerText.textContent =
    state.match.winner === "black"
      ? "夜幕执子完成了终局五连。下一局试试抢先打出 4 连大技能。"
      : "星辉执子完成了终局五连。下一局可以尝试围绕中心布局更快触发技能。";
}

function renderAll() {
  renderStatus();
  renderSkills();
  renderLogs();
  renderBoard();
  renderWinnerModal();
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
  if (!state.ai.enabled || state.match.status === "finished") {
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

function endGame(player, winningLine) {
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

function placeStone(row, col) {
  if (state.match.status === "finished") {
    return;
  }

  if (state.skill.pendingTrigger) {
    setMessage("本回合技能尚未处理，请先选择技能或点击“跳过技能”。");
    return;
  }

  const currentPlayer = state.match.currentPlayer;

  if (state.board.cells[row][col]) {
    setMessage("这个位置已经有棋子了，请换一个落点。");
    return;
  }

  if (hasBlockedCell(row, col, currentPlayer)) {
    setMessage("该位置被对手封锁了，这一手不能落在这里。");
    return;
  }

  state.history.push(cloneStateSnapshot());
  state.board.cells[row][col] = currentPlayer;
  state.board.lastMove = { row, col };
  clearExpiredBlocks(currentPlayer);
  pushLog(`${PLAYER_LABELS[currentPlayer]} 落子到 (${row + 1}, ${col + 1})。`);
  SFX.place();

  const result = analyzeMove(row, col, currentPlayer);

  if (result.outcome === "win") {
    endGame(currentPlayer, result.cells);
    SFX.win();
    renderAll();
    return;
  }

  if (result.outcome === "trigger") {
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

  SFX.skillCast(skillId);
  advanceTurn();
  renderAll();
}

function handleBoardClick(row, col) {
  if (state.match.status === "finished") {
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
  if (state.match.status === "finished") {
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
  if (state.online.enabled && onlineSocket) {
    onlineSocket.emit("new-game-request");
    return;
  }
  doResetGame();
}

function doResetGame() {
  clearAITimer();
  const mode = state.match.mode;
  const difficulty = state.ai.difficulty;
  const engine = state.ai.engine;
  const onlineState = { ...state.online };
  state = createInitialState(mode);
  state.ai.difficulty = difficulty;
  state.ai.engine = engine === "proxy" ? "proxy" : "local";
  state.online = onlineState;
  SFX.newGame();
  renderAll();
}

function undoMove() {
  clearAITimer();
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
  advanceTurn();
  renderAll();
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
      ? "AI 模式已启用。你先执黑子，白子会在短暂思考后自动落子。"
      : "已切回本地双人模式，双方都由你手动操作。";
  renderAll();
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
  dom.undoMove.addEventListener("click", undoMove);
  dom.skipSkill.addEventListener("click", skipSkill);
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
    state.ui.message = "你执黑子先行，AI 将在你落子后自动思考并应答。";
  } else if (mode === "online") {
    return;
  } else {
    state = createInitialState("local-pvp");
    state.ui.logs = ["本地练习模式：两位玩家轮流在同一台电脑上落子。"];
    state.ui.message = "练习模式已就绪——夜幕执子先行，争取做出 3 连来点亮技能面板。";
  }

  renderAll();
}

function startOnlineGame(color, roomCode) {
  hideWelcomeModal();
  state = createInitialState("online");
  state.online.myColor = color;
  state.online.roomCode = roomCode;
  onlineColor = color;
  onlineRoomCode = roomCode;

  const colorName = color === "black" ? "夜幕(黑)" : "星辉(白)";
  state.ui.logs = [`在线对战已开始！你是${colorName}，房间码 ${roomCode}。`];
  state.ui.message = color === "black"
    ? "你先行——落子开始对局。"
    : "等待对手（黑方）先行...";
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

function connectSocket(onConnect, onFail) {
  const url = getServerUrl();
  if (!url) {
    setRoomStatus("未配置服务器地址，请检查 config.js");
    if (onFail) onFail();
    return;
  }

  if (onlineSocket) {
    onlineSocket.disconnect();
    onlineSocket = null;
  }

  setRoomStatus("正在唤醒服务器，首次可能需要 30-60 秒...");

  let settled = false;

  onlineSocket = io(url, {
    transports: ["polling", "websocket"],
    timeout: 90000,
    reconnection: false
  });

  onlineSocket.on("connect", () => {
    if (settled) return;
    settled = true;
    setRoomStatus("已连接，正在创建房间...");
    if (onConnect) onConnect();
  });

  onlineSocket.on("connect_error", (err) => {
    if (settled) return;
    settled = true;
    setRoomStatus("连接失败：" + (err.message || "网络异常") + "，请重试");
    if (onFail) onFail();
  });

  onlineSocket.on("opponent-joined", (data) => {
    SFX.newGame();
    startOnlineGame(data.color, onlineRoomCode);
  });

  onlineSocket.on("stone-placed", (data) => {
    if (state.match.status === "finished") return;
    if (state.board.cells[data.row][data.col]) return;
    placeStone(data.row, data.col);
  });

  onlineSocket.on("skill-used", (data) => {
    if (state.match.status === "finished") return;
    if (data.warpSource) {
      state.skill.warpSource = data.warpSource;
    }
    state.skill.selectedSkill = data.skillId;
    tryApplySkill(data.row, data.col);
  });

  onlineSocket.on("skill-skipped", () => {
    if (state.match.status === "finished") return;
    doSkipSkill();
  });

  onlineSocket.on("new-game-sync", () => {
    doResetGame();
  });

  onlineSocket.on("opponent-disconnected", () => {
    pushLog("对手已断开连接。");
    setMessage("对手已离开房间，对局中断。");
    renderAll();
  });
}

function setRoomStatus(text, show = true) {
  const el = document.querySelector("#room-status");
  const textEl = document.querySelector("#room-status-text");
  if (el) el.hidden = !show;
  if (textEl) textEl.textContent = text;
}

function showRoomPanel() {
  const modeSelect = document.querySelector("#welcome-mode-select");
  const roomPanel = document.querySelector("#welcome-room-panel");
  if (modeSelect) modeSelect.hidden = true;
  if (roomPanel) roomPanel.hidden = false;
}

function showModeSelect() {
  const modeSelect = document.querySelector("#welcome-mode-select");
  const roomPanel = document.querySelector("#welcome-room-panel");
  if (modeSelect) modeSelect.hidden = false;
  if (roomPanel) roomPanel.hidden = true;
  setRoomStatus("", false);
  if (onlineSocket) {
    onlineSocket.disconnect();
    onlineSocket = null;
  }
}

function bindWelcome() {
  const btnOnline = document.querySelector("#welcome-online");
  const btnAi = document.querySelector("#welcome-ai");
  const btnLocal = document.querySelector("#welcome-local");
  const btnBack = document.querySelector("#room-back");
  const btnCreate = document.querySelector("#room-create");
  const btnJoin = document.querySelector("#room-join");
  const inputCode = document.querySelector("#room-code-input");

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

  if (btnBack) {
    btnBack.addEventListener("click", () => {
      SFX.click();
      showModeSelect();
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener("click", () => {
      if (btnCreate.disabled) return;
      SFX.click();
      btnCreate.disabled = true;
      connectSocket(
        () => {
          onlineSocket.emit("create-room", (resp) => {
            btnCreate.disabled = false;
            if (resp.error) {
              setRoomStatus(resp.error);
              return;
            }
            onlineRoomCode = resp.code;
            setRoomStatus(`房间码: ${resp.code} — 把这个码发给朋友，等待加入...`);
          });
        },
        () => { btnCreate.disabled = false; }
      );
    });
  }

  if (btnJoin && inputCode) {
    const doJoin = () => {
      const code = inputCode.value.trim();
      if (code.length !== 4) {
        setRoomStatus("请输入 4 位房间码");
        return;
      }
      if (btnJoin.disabled) return;
      SFX.click();
      btnJoin.disabled = true;
      connectSocket(
        () => {
          onlineSocket.emit("join-room", { code }, (resp) => {
            btnJoin.disabled = false;
            if (resp.error) {
              setRoomStatus(resp.error);
              return;
            }
            onlineRoomCode = resp.code;
            SFX.newGame();
            startOnlineGame(resp.color, resp.code);
          });
        },
        () => { btnJoin.disabled = false; }
      );
    };

    btnJoin.addEventListener("click", doJoin);
    inputCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doJoin();
    });
  }
}

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
    doSkipSkill();
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
