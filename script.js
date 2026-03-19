const BOARD_SIZE = 15;
const WIN_LENGTH = 5;
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];

const SKILLS = {
  block: {
    id: "block",
    tier: "small",
    name: "封锁",
    description: "封印一个空格，使对手在下一手无法落子到该位置。"
  },
  shock: {
    id: "shock",
    tier: "small",
    name: "冲击",
    description: "推动一枚紧邻本回合落点的敌子 1 格，若前方无空位则失效。"
  },
  blast: {
    id: "blast",
    tier: "large",
    name: "爆破",
    description: "清除目标十字范围内的敌子，制造战场空洞。"
  },
  convert: {
    id: "convert",
    tier: "large",
    name: "转化",
    description: "转化一枚紧邻本回合落点的敌子，但本回合不会因此直接判胜。"
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

const dom = {
  board: document.querySelector("#board"),
  message: document.querySelector("#message"),
  modeLabel: document.querySelector("#mode-label"),
  turnLabel: document.querySelector("#turn-label"),
  phaseLabel: document.querySelector("#phase-label"),
  triggerLabel: document.querySelector("#trigger-label"),
  blackBadge: document.querySelector("#black-badge"),
  whiteBadge: document.querySelector("#white-badge"),
  skillHint: document.querySelector("#skill-hint"),
  skillList: document.querySelector("#skill-list"),
  logList: document.querySelector("#log-list"),
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

function createInitialState() {
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
      mode: "local-pvp"
    },
    skill: {
      pendingTrigger: null,
      selectedSkill: null,
      blockedCells: []
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
      enabled: false,
      provider: "reserved",
      pendingAction: null
    },
    history: []
  };
}

function getAIMove() {
  return null;
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

function getSkillOptions() {
  if (!state.skill.pendingTrigger) {
    return [];
  }

  if (state.skill.pendingTrigger.tier === "small") {
    return [SKILLS.block, SKILLS.shock];
  }

  return [SKILLS.blast, SKILLS.convert];
}

function renderStatus() {
  const phaseKey = getPhaseKey();
  dom.modeLabel.textContent = "本地双人 · AI 预留";
  dom.turnLabel.textContent = `第 ${state.match.turn} 手`;
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

      if (state.skill.selectedSkill) {
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
  state.board.winningLine = [];
  setMessage(`${PLAYER_LABELS[state.match.currentPlayer]} 行动中。观察局势，争取做出下一条连段。`);
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

  const result = analyzeMove(row, col, currentPlayer);

  if (result.outcome === "win") {
    endGame(currentPlayer, result.cells);
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
    setMessage(`${triggerText} 你可以从右侧技能栏中选择一项技能，或点击“跳过技能”。`);
    pushLog(
      `${PLAYER_LABELS[currentPlayer]} 触发了${result.tier === "small" ? "小技能" : "大技能"}窗口。`
    );
    queueEffect(result.cells, "burst");
    renderAll();
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
  queueEffect([[row, col]], "burst");
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
  queueEffect(removed, "burst", 800);
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
  }

  if (skillId === "shock") {
    success = applyShock(row, col);
  }

  if (skillId === "blast") {
    success = applyBlast(row, col);
  }

  if (skillId === "convert") {
    success = applyConvert(row, col);
  }

  if (!success) {
    renderAll();
    return;
  }

  advanceTurn();
  renderAll();
}

function handleBoardClick(row, col) {
  if (state.match.status === "finished") {
    return;
  }

  if (state.skill.selectedSkill) {
    tryApplySkill(row, col);
    return;
  }

  placeStone(row, col);
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
  state = createInitialState();
  renderAll();
}

function undoMove() {
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

  pushLog(`${PLAYER_LABELS[state.match.currentPlayer]} 放弃了本回合技能。`);
  setMessage("你跳过了技能窗口，回合将正常切换。");
  advanceTurn();
  renderAll();
}

function bindEvents() {
  dom.newGame.addEventListener("click", resetGame);
  dom.modalNewGame.addEventListener("click", resetGame);
  dom.undoMove.addEventListener("click", undoMove);
  dom.skipSkill.addEventListener("click", skipSkill);
  dom.board.addEventListener("mouseover", (event) => {
    const cell = event.target.closest(".cell");

    if (!cell || !dom.board.contains(cell)) {
      return;
    }

    handleCellHover(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  dom.board.addEventListener("mouseleave", clearHoverCell);
}

bindEvents();
renderAll();
