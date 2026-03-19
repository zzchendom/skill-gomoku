const starterBoard = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9]
];

const boardElement = document.querySelector("#board");
const messageElement = document.querySelector("#message");

function renderBoard(board) {
  boardElement.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const cell = document.createElement("div");
      cell.className = "cell";

      if ((colIndex + 1) % 3 === 0 && colIndex !== 8) {
        cell.classList.add("box-right");
      }

      if ((rowIndex + 1) % 3 === 0 && rowIndex !== 8) {
        cell.classList.add("box-bottom");
      }

      cell.textContent = value === 0 ? "" : String(value);
      boardElement.appendChild(cell);
    });
  });
}

function setMessage(text) {
  messageElement.textContent = text;
}

document.querySelector("#new-game").addEventListener("click", () => {
  renderBoard(starterBoard);
  setMessage("已重新加载示例棋盘。下一课我们会把它升级成真正可交互的游戏。");
});

document.querySelector("#check-board").addEventListener("click", () => {
  setMessage("当前还是静态版本。我们很快会加上输入校验和胜利检测。");
});

document.querySelector("#reset-board").addEventListener("click", () => {
  renderBoard(starterBoard);
  setMessage("棋盘已重置。");
});

renderBoard(starterBoard);
