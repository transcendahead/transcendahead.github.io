/**
 * 美食连连看 - 核心游戏逻辑
 * 包含：游戏状态管理、路径搜索算法、关卡系统、道具系统
 */

// ===== 游戏配置 =====
const CONFIG = {
    // 美食emoji集合（严格筛选，仅保留食物/饮品/甜点）
    foodEmojis: [
        '🍔', '🍕', '🍟', '🌭', '🍿', '🥓', '🥚',
        '🥞', '🧇', '🥨', '🥯', '🥖', '🧀', '🥗', '🥙',
        '🥪', '🌮', '🌯', '🍖', '🍗', '🥩', '🍠',
        '🥟', '🥠', '🍱', '🍘', '🍙', '🍚', '🍛',
        '🍜', '🍝', '🍢', '🍣', '🍤', '🍥', '🍡',
        '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁',
        '🥧', '🍫', '🍬', '🍭', '🍮', '🍯'
    ],

    // 关卡配置
    levels: [
        { rows: 4, cols: 4, time: 60, pairs: 8 },
        { rows: 4, cols: 6, time: 90, pairs: 12 },
        { rows: 5, cols: 6, time: 120, pairs: 15 },
        { rows: 6, cols: 6, time: 150, pairs: 18 },
        { rows: 6, cols: 8, time: 180, pairs: 24 },
        { rows: 8, cols: 8, time: 240, pairs: 32 },
    ],

    // 道具初始数量
    tools: {
        hint: 3,
        shuffle: 3,
        addTime: 2
    },

    // 计分规则
    scoring: {
        baseMatch: 100,
        comboBonus: 50,
        timeBonus: 10
    },

    // 连击配置
    comboTimeout: 10000  // 10秒未匹配则连击中断
};

// ===== 游戏状态 =====
let gameState = {
    level: 1,
    score: 0,
    timeLeft: 0,
    grid: [],          // 二维数组，存储卡片数据
    selected: null,    // 当前选中的卡片
    isPlaying: false,
    isPaused: false,
    combo: 0,
    tools: { ...CONFIG.tools },
    timer: null,
    matchedPairs: 0,
    totalPairs: 0,
    levelCompleting: false,  // 防止关卡完成重复触发
    lastMatchTime: 0,         // 上次成功匹配的时间戳
    cellCenters: null          // 缓存的格子中心坐标 {row,col} -> {x,y}
};

// ===== DOM 元素引用 =====
const elements = {
    menuScreen: document.getElementById('menuScreen'),
    gameBoard: document.getElementById('gameBoard'),
    gameHeader: document.getElementById('gameHeader'),
    gridContainer: document.getElementById('gridContainer'),
    gameCanvas: document.getElementById('gameCanvas'),
    gameFooter: document.getElementById('gameFooter'),
    levelDisplay: document.getElementById('level'),
    scoreDisplay: document.getElementById('score'),
    timeDisplay: document.getElementById('time'),
    comboPopup: document.getElementById('comboPopup'),
    helpModal: document.getElementById('helpModal'),
    gameOverModal: document.getElementById('gameOverModal'),
    hintCount: document.getElementById('hintCount'),
    shuffleCount: document.getElementById('shuffleCount'),
    addTimeCount: document.getElementById('addTimeCount')
};

// ===== 初始化 =====
function init() {
    bindEvents();
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        updateGridSizing();
    });
}

function bindEvents() {
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('helpBtn').addEventListener('click', () => showModal('helpModal'));
    document.getElementById('closeHelpBtn').addEventListener('click', () => hideModal('helpModal'));
    document.getElementById('restartBtn').addEventListener('click', () => {
        hideModal('gameOverModal');
        startGame();
    });
    document.getElementById('menuBtn').addEventListener('click', () => {
        hideModal('gameOverModal');
        showMenu();
    });
    document.getElementById('hintBtn').addEventListener('click', useHint);
    document.getElementById('shuffleBtn').addEventListener('click', useShuffle);
    document.getElementById('addTimeBtn').addEventListener('click', useAddTime);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
}

function resizeCanvas() {
    const canvas = elements.gameCanvas;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

// ===== 游戏流程控制 =====
function startGame() {
    gameState.level = 1;
    gameState.score = 0;
    gameState.tools = { ...CONFIG.tools };
    startLevel();
}

function startLevel() {
    const levelConfig = CONFIG.levels[Math.min(gameState.level - 1, CONFIG.levels.length - 1)];

    gameState.timeLeft = levelConfig.time;
    gameState.matchedPairs = 0;
    gameState.totalPairs = levelConfig.pairs;
    gameState.combo = 0;
    gameState.selected = null;
    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.levelCompleting = false;
    gameState.lastMatchTime = 0;

    updateUI();
    generateGrid(levelConfig);
    showGameBoard();  // 必须先显示面板，否则renderGrid中clientWidth为0
    renderGrid();
    startTimer();
    updateToolButtons();

    // 开局检查：若无可用匹配则自动洗牌
    if (!hasValidMoves()) {
        autoShuffle();
    }
}

function showMenu() {
    stopTimer();
    gameState.isPlaying = false;
    elements.menuScreen.style.display = 'block';
    elements.gameBoard.classList.remove('active');
    elements.gameFooter.classList.remove('active');
    elements.gameHeader.classList.remove('active');
}

function showGameBoard() {
    elements.menuScreen.style.display = 'none';
    elements.gameBoard.classList.add('active');
    elements.gameFooter.classList.add('active');
    elements.gameHeader.classList.add('active');
}

// ===== 网格生成 =====
function generateGrid(config) {
    const { rows, cols, pairs } = config;
    const totalCells = rows * cols;

    // 确保有足够空间放置所有配对
    const actualPairs = Math.min(pairs, Math.floor(totalCells / 2));

    // 创建卡片数组
    let cards = [];
    const shuffledEmojis = shuffleArray([...CONFIG.foodEmojis]).slice(0, actualPairs);

    for (let emoji of shuffledEmojis) {
        cards.push(emoji, emoji);
    }

    // 如果格子数多于配对数，添加空白格
    while (cards.length < totalCells) {
        cards.push(null);
    }

    // 打乱顺序
    cards = shuffleArray(cards);

    // 填充二维网格
    gameState.grid = [];
    let index = 0;
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                emoji: cards[index],
                row: r,
                col: c,
                matched: false,
                element: null
            });
            index++;
        }
        gameState.grid.push(row);
    }
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===== 渲染网格 =====
function renderGrid() {
    const container = elements.gridContainer;
    container.innerHTML = '';

    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    // 动态计算卡片尺寸，确保在任意屏幕宽度下完整显示
    const boardEl = container.parentElement;
    const maxWidth = boardEl.clientWidth - 20;  // 减去padding (10px×2)
    const maxHeight = boardEl.clientHeight - 20;
    const gap = 8;
    const maxCardW = Math.max(1, Math.floor((maxWidth - (cols - 1) * gap) / cols));
    const maxCardH = Math.max(1, Math.floor((maxHeight - (rows - 1) * gap) / rows));
    const cardSize = Math.max(24, Math.min(maxCardW, maxCardH, 60)); // 桌面端上限60px，移动端下限24px
    const fontSize = Math.round(cardSize * 0.5);
    const gapPx = Math.min(gap, Math.round(cardSize * 0.13)); // gap随卡片缩放

    container.style.gridTemplateColumns = `repeat(${cols}, ${cardSize}px)`;
    container.style.gridTemplateRows = `repeat(${rows}, ${cardSize}px)`;
    container.style.gap = gapPx + 'px';

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = gameState.grid[r][c];
            const card = document.createElement('div');
            card.className = 'card';
            card.style.width = cardSize + 'px';
            card.style.height = cardSize + 'px';
            card.style.fontSize = fontSize + 'px';
            card.dataset.row = r;
            card.dataset.col = c;

            if (cell.emoji) {
                card.textContent = cell.emoji;
                card.addEventListener('click', () => onCardClick(r, c));
            } else {
                card.classList.add('empty');
            }

            cell.element = card;
            container.appendChild(card);
        }
    }

    // 缓存所有格子的中心像素坐标（消除后DOM坐标会漂移，必须使用缓存）
    // 延迟到下一帧等待浏览器完成布局渲染，否则getBoundingClientRect返回全0
    requestAnimationFrame(() => {
        requestAnimationFrame(() => cacheCellCenters());
    });
}

// ===== 更新网格尺寸（窗口resize时动态调整，无需重建DOM） =====
function updateGridSizing() {
    if (!gameState.grid.length) return;

    const container = elements.gridContainer;
    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    const boardEl = container.parentElement;
    const maxWidth = boardEl.clientWidth - 20;
    const maxHeight = boardEl.clientHeight - 20;
    const gap = 8;
    const maxCardW = Math.max(1, Math.floor((maxWidth - (cols - 1) * gap) / cols));
    const maxCardH = Math.max(1, Math.floor((maxHeight - (rows - 1) * gap) / rows));
    const cardSize = Math.max(24, Math.min(maxCardW, maxCardH, 60));
    const fontSize = Math.round(cardSize * 0.5);
    const gapPx = Math.min(gap, Math.round(cardSize * 0.13));

    container.style.gridTemplateColumns = `repeat(${cols}, ${cardSize}px)`;
    container.style.gridTemplateRows = `repeat(${rows}, ${cardSize}px)`;
    container.style.gap = gapPx + 'px';

    const cards = container.querySelectorAll('.card');
    cards.forEach(card => {
        card.style.width = cardSize + 'px';
        card.style.height = cardSize + 'px';
        card.style.fontSize = fontSize + 'px';
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => cacheCellCenters());
    });
}

// ===== 缓存格子中心坐标 =====
function cacheCellCenters() {
    const canvasRect = elements.gameCanvas.getBoundingClientRect();
    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;
    const centers = {};

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const rect = gameState.grid[r][c].element.getBoundingClientRect();
            centers[`${r},${c}`] = {
                x: rect.left + rect.width / 2 - canvasRect.left,
                y: rect.top + rect.height / 2 - canvasRect.top
            };
        }
    }

    // 计算步长（用于推算边界外的点）
    let stepX = 60, stepY = 60;
    if (cols > 1) {
        const r0 = gameState.grid[0][0].element.getBoundingClientRect();
        const r1 = gameState.grid[0][1].element.getBoundingClientRect();
        stepX = r1.left - r0.left;
    }
    if (rows > 1) {
        const r0 = gameState.grid[0][0].element.getBoundingClientRect();
        const r1 = gameState.grid[1][0].element.getBoundingClientRect();
        stepY = r1.top - r0.top;
    }

    gameState.cellCenters = { centers, stepX, stepY, rows, cols };
}

// ===== 卡片点击处理 =====
function onCardClick(row, col) {
    if (!gameState.isPlaying || gameState.isPaused) return;

    const cell = gameState.grid[row][col];
    if (!cell.emoji || cell.matched) return;

    // 检查连击是否超时（超过10秒未成功匹配则重置）
    if (gameState.combo > 0 && Date.now() - gameState.lastMatchTime > CONFIG.comboTimeout) {
        gameState.combo = 0;
    }

    // 如果点击已选中的卡片，取消选中
    if (gameState.selected && gameState.selected.row === row && gameState.selected.col === col) {
        deselectCard();
        return;
    }

    // 选中卡片
    if (!gameState.selected) {
        selectCard(cell);
    } else {
        // 尝试匹配
        const first = gameState.selected;
        const second = cell;

        if (first.emoji === second.emoji) {
            const path = findPath(first, second);
            if (path) {
                // 匹配成功
                matchCards(first, second, path);
            } else {
                // 无法连接，匹配失败，连击中断
                gameState.combo = 0;
                deselectCard();
                selectCard(cell);
            }
        } else {
            // 不同emoji，仅切换选中，不中断连击
            deselectCard();
            selectCard(cell);
        }
    }
}

function selectCard(cell) {
    gameState.selected = cell;
    cell.element.classList.add('selected');
}

function deselectCard() {
    if (gameState.selected) {
        gameState.selected.element.classList.remove('selected');
        gameState.selected = null;
    }
}

// ===== 路径搜索算法（BFS） =====
function findPath(start, end) {
    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    // 扩展网格（包含边界）
    const extRows = rows + 2;
    const extCols = cols + 2;

    // 检查某个扩展坐标是否可通行
    function isPassable(er, ec) {
        if (er === 0 || er === extRows - 1 || ec === 0 || ec === extCols - 1) {
            return true; // 边界外总是可通行
        }
        const r = er - 1;
        const c = ec - 1;
        const cell = gameState.grid[r][c];
        return cell.matched || cell.emoji === null ||
               (r === start.row && c === start.col) ||
               (r === end.row && c === end.col);
    }

    // BFS搜索
    const startExt = { r: start.row + 1, c: start.col + 1 };
    const endExt = { r: end.row + 1, c: end.col + 1 };

    const queue = [{ ...startExt, turns: 0, dir: null, path: [{ ...startExt }] }];
    const visited = new Set();
    visited.add(`${startExt.r},${startExt.c}`);

    const directions = [
        { dr: -1, dc: 0, name: 'up' },
        { dr: 1, dc: 0, name: 'down' },
        { dr: 0, dc: -1, name: 'left' },
        { dr: 0, dc: 1, name: 'right' }
    ];

    while (queue.length > 0) {
        const current = queue.shift();

        if (current.r === endExt.r && current.c === endExt.c) {
            // 找到路径，转换回原始坐标
            return current.path.map(p => ({ row: p.r - 1, col: p.c - 1 }));
        }

        for (const dir of directions) {
            const nr = current.r + dir.dr;
            const nc = current.c + dir.dc;

            if (nr < 0 || nr >= extRows || nc < 0 || nc >= extCols) continue;
            if (!isPassable(nr, nc)) continue;

            const newTurns = current.dir !== null && current.dir !== dir.name
                ? current.turns + 1
                : current.turns;

            if (newTurns > 2) continue;

            const key = `${nr},${nc},${newTurns},${dir.name}`;
            if (visited.has(key)) continue;
            visited.add(key);

            queue.push({
                r: nr,
                c: nc,
                turns: newTurns,
                dir: dir.name,
                path: [...current.path, { r: nr, c: nc }]
            });
        }
    }

    return null;
}

// ===== 匹配处理 =====
function matchCards(first, second, path) {
    // 绘制连接线
    drawPath(path);

    // 标记为已匹配
    first.matched = true;
    second.matched = true;
    gameState.matchedPairs++;

    // 更新连击计数和时间戳
    gameState.combo++;
    gameState.lastMatchTime = Date.now();

    // 计算得分（连击越多，单次加分越高）
    const baseScore = CONFIG.scoring.baseMatch;
    const comboBonus = Math.max(0, (gameState.combo - 1) * CONFIG.scoring.comboBonus);
    const totalPoints = baseScore + comboBonus;
    gameState.score += totalPoints;

    // 显示连击
    if (gameState.combo >= 2) {
        showCombo(gameState.combo);
    }

    // 动画效果
    first.element.classList.remove('selected');
    first.element.classList.add('matched');
    second.element.classList.add('matched');

    gameState.selected = null;
    updateUI();

    // 延迟清除
    setTimeout(() => {
        first.element.classList.add('empty');
        first.element.textContent = '';
        second.element.classList.add('empty');
        second.element.textContent = '';
        clearCanvas();

        // 检查关卡完成
        if (gameState.matchedPairs >= gameState.totalPairs) {
            levelComplete();
        } else {
            // 检查是否还有可消除的配对
            if (!hasValidMoves()) {
                autoShuffle();
            }
        }
    }, 250);
}

// ===== 路径简化：只保留起点、终点和拐弯点 =====
function simplifyPath(path) {
    if (path.length <= 2) return path;

    const simplified = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const next = path[i + 1];

        // 计算前后两段的方向
        const dir1Row = curr.row - prev.row;
        const dir1Col = curr.col - prev.col;
        const dir2Row = next.row - curr.row;
        const dir2Col = next.col - curr.col;

        // 方向不同（拐弯点），保留
        if (dir1Row !== dir2Row || dir1Col !== dir2Col) {
            simplified.push(curr);
        }
    }

    simplified.push(path[path.length - 1]);
    return simplified;
}

// ===== 绘制连接路径 =====
function drawPath(path) {
    // 简化路径，只保留拐弯点
    const simplePath = simplifyPath(path);

    const canvas = elements.gameCanvas;
    const ctx = canvas.getContext('2d');
    const canvasRect = canvas.getBoundingClientRect();

    // 重新设置canvas尺寸确保与显示一致
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.offsetWidth;
    const displayHeight = canvas.offsetHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;
    const cached = gameState.cellCenters;

    // 使用缓存的格子中心坐标（避免消除后DOM重排导致坐标漂移）
    function getCellCenter(row, col) {
        // 网格内的点：直接查缓存
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
            return cached.centers[`${row},${col}`];
        }

        // 边界外的点：基于最近的边缘格子缓存坐标 + 步长推算
        const refRow = Math.max(0, Math.min(rows - 1, row));
        const refCol = Math.max(0, Math.min(cols - 1, col));
        const ref = cached.centers[`${refRow},${refCol}`];
        const dRow = row - refRow;
        const dCol = col - refCol;

        return {
            x: ref.x + dCol * cached.stepX,
            y: ref.y + dRow * cached.stepY
        };
    }

    // 收集所有点的坐标
    const points = simplePath.map(p => getCellCenter(p.row, p.col));

    // 绘制发光外轮廓线
    ctx.strokeStyle = '#00d9ff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#00d9ff';
    ctx.shadowBlur = 20;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 绘制内层亮白线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 绘制端点圆点装饰
    ctx.fillStyle = '#ffffff';
    for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 延迟清除（匹配动画完成后）
    setTimeout(() => {
        clearCanvas();
    }, 800);
}

function clearCanvas() {
    const canvas = elements.gameCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ===== 检查是否有可移动的路径 =====
function hasValidMoves() {
    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    const cards = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = gameState.grid[r][c];
            if (cell.emoji && !cell.matched) {
                cards.push(cell);
            }
        }
    }

    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].emoji === cards[j].emoji) {
                const path = findPath(cards[i], cards[j]);
                if (path) return true;
            }
        }
    }

    return false;
}

// ===== 自动洗牌 =====
function autoShuffle() {
    showCombo('自动洗牌!');

    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    // 收集所有未匹配的emoji
    let emojis = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = gameState.grid[r][c];
            if (cell.emoji && !cell.matched) {
                emojis.push(cell.emoji);
            }
        }
    }

    // 打乱并重新分配
    emojis = shuffleArray(emojis);
    let index = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = gameState.grid[r][c];
            if (cell.emoji && !cell.matched) {
                cell.emoji = emojis[index++];
                cell.element.textContent = cell.emoji;
            }
        }
    }

    // 如果洗牌后仍然没有可消除的，再次洗牌
    if (!hasValidMoves() && emojis.length > 0) {
        setTimeout(autoShuffle, 500);
    }
}

// ===== 道具功能 =====
function useHint() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.tools.hint <= 0) return;

    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;

    // 找到一对可消除的卡片
    for (let r1 = 0; r1 < rows; r1++) {
        for (let c1 = 0; c1 < cols; c1++) {
            const cell1 = gameState.grid[r1][c1];
            if (!cell1.emoji || cell1.matched) continue;

            for (let r2 = r1; r2 < rows; r2++) {
                for (let c2 = (r2 === r1 ? c1 + 1 : 0); c2 < cols; c2++) {
                    const cell2 = gameState.grid[r2][c2];
                    if (!cell2.emoji || cell2.matched) continue;

                    if (cell1.emoji === cell2.emoji) {
                        const path = findPath(cell1, cell2);
                        if (path) {
                            gameState.tools.hint--;
                            updateToolButtons();

                            cell1.element.classList.add('hint');
                            cell2.element.classList.add('hint');

                            setTimeout(() => {
                                cell1.element.classList.remove('hint');
                                cell2.element.classList.remove('hint');
                            }, 2000);

                            return;
                        }
                    }
                }
            }
        }
    }
}

function useShuffle() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.tools.shuffle <= 0) return;

    gameState.tools.shuffle--;
    updateToolButtons();
    autoShuffle();
}

function useAddTime() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.tools.addTime <= 0) return;

    gameState.tools.addTime--;
    gameState.timeLeft += 15;
    updateToolButtons();
    updateUI();

    // 时间增加动画
    const timeDisplay = elements.timeDisplay;
    timeDisplay.style.color = '#00ff00';
    setTimeout(() => {
        timeDisplay.style.color = '';
    }, 500);
}

function togglePause() {
    if (!gameState.isPlaying) return;

    gameState.isPaused = !gameState.isPaused;

    if (gameState.isPaused) {
        stopTimer();
        showPauseOverlay();
    } else {
        startTimer();
        hidePauseOverlay();
    }
}

function showPauseOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'pause-overlay';
    overlay.id = 'pauseOverlay';
    overlay.innerHTML = `
        <div>⏸️ 游戏暂停</div>
        <button class="btn btn-primary" onclick="togglePause()">继续游戏</button>
    `;
    document.body.appendChild(overlay);
}

function hidePauseOverlay() {
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) overlay.remove();
}

// ===== 计时器 =====
function startTimer() {
    stopTimer();
    gameState.timer = setInterval(() => {
        if (gameState.isPaused) return;

        gameState.timeLeft--;
        updateUI();

        if (gameState.timeLeft <= 10) {
            document.querySelector('.time-info').classList.add('warning');
        }

        if (gameState.timeLeft <= 0) {
            gameOver(false);
        }
    }, 1000);
}

function stopTimer() {
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
}

// ===== 关卡完成 =====
function levelComplete() {
    if (gameState.levelCompleting) return; // 防止重复触发
    gameState.levelCompleting = true;
    stopTimer();
    gameState.isPlaying = false;

    // 时间奖励
    const timeBonus = gameState.timeLeft * CONFIG.scoring.timeBonus;
    gameState.score += timeBonus;

    // 道具奖励
    gameState.tools.hint++;
    gameState.tools.shuffle++;

    updateUI();

    setTimeout(() => {
        if (gameState.level >= CONFIG.levels.length) {
            gameOver(true);
        } else {
            gameState.level++;
            showCombo(`第 ${gameState.level - 1} 关完成!`);
            setTimeout(() => {
                startLevel();
            }, 1500);
        }
    }, 1000);
}

// ===== 游戏结束 =====
function gameOver(isWin) {
    stopTimer();
    gameState.isPlaying = false;

    const title = document.getElementById('gameOverTitle');
    const message = document.getElementById('gameOverMessage');

    if (isWin) {
        title.textContent = '🎉 恭喜通关!';
        message.textContent = '你完成了所有关卡，真厉害！';
    } else {
        title.textContent = '⏰ 时间到!';
        message.textContent = '别灰心，再试一次吧！';
    }

    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalLevel').textContent = gameState.level;

    showModal('gameOverModal');
}

// ===== UI 更新 =====
function updateUI() {
    elements.levelDisplay.textContent = gameState.level;
    elements.scoreDisplay.textContent = gameState.score;
    elements.timeDisplay.textContent = gameState.timeLeft;
}

function updateToolButtons() {
    elements.hintCount.textContent = gameState.tools.hint;
    elements.shuffleCount.textContent = gameState.tools.shuffle;
    elements.addTimeCount.textContent = gameState.tools.addTime;

    document.getElementById('hintBtn').disabled = gameState.tools.hint <= 0;
    document.getElementById('shuffleBtn').disabled = gameState.tools.shuffle <= 0;
    document.getElementById('addTimeBtn').disabled = gameState.tools.addTime <= 0;
}

function showCombo(text) {
    const popup = elements.comboPopup;
    popup.textContent = typeof text === 'number' ? `${text} 连击!` : text;
    popup.classList.remove('show');
    void popup.offsetWidth; // 强制重排
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 1000);
}

function showModal(id) {
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== 启动游戏 =====
window.addEventListener('load', init);
