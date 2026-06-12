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

// ===== 音效系统（Web Audio API 合成音效） =====
const SoundSystem = {
    audioCtx: null,
    enabled: true,

    init() {
        if (this.audioCtx) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    },

    // ===== 消除音效 - 清脆电子"叮" =====
    playMatch() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // 单音符电子音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now); // C5
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);

        // 轻微泛音增加清脆感
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1047, now); // C6 泛音
        gain2.gain.setValueAtTime(0.1, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.15);
    },

    // ===== 连击音效 - 递进 level 1-5 =====
    playCombo(level) {
        if (!this.enabled) return;
        this.init();

        // 高连击里程碑：5/10/20 特殊音效
        if (level === 5) {
            this.playComboMilestone(5);
            return;
        }
        if (level === 10) {
            this.playComboMilestone(10);
            return;
        }
        if (level === 20) {
            this.playComboFanfare();
            return;
        }

        // 普通连击：level 1-5 递进
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const clampedLevel = Math.min(level, 5);

        // 音阶：C E G C (Do Mi Sol Do) 随等级增加音符
        const notes = [
            [523],           // Level 1: C
            [523, 659],      // Level 2: C E
            [523, 659, 784], // Level 3: C E G
            [523, 659, 784, 1047], // Level 4: C E G C
            [523, 659, 784, 1047, 1319] // Level 5: C E G C E
        ];

        const freqs = notes[clampedLevel - 1];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.06);
            gain.gain.setValueAtTime(0.2, now + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.06);
            osc.stop(now + i * 0.06 + 0.2);

            // 添加泛音增加亮度
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(freq * 2, now + i * 0.06);
            gain2.gain.setValueAtTime(0.08, now + i * 0.06);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + i * 0.06);
            osc2.stop(now + i * 0.06 + 0.15);
        });
    },

    // ===== 连击里程碑 5/10 =====
    playComboMilestone(milestone) {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // 欢快的上行音阶 + 闪烁感
        const notes = milestone === 5 
            ? [523, 659, 784, 1047, 1319]  // C E G C E
            : [523, 659, 784, 1047, 1319, 1568]; // C E G C E G

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            gain.gain.setValueAtTime(0.25, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.25);
        });

        // 添加闪亮的高频泛音
        const sparkle = ctx.createOscillator();
        const sparkleGain = ctx.createGain();
        sparkle.type = 'sine';
        sparkle.frequency.setValueAtTime(2000, now + 0.2);
        sparkle.frequency.exponentialRampToValueAtTime(3000, now + 0.4);
        sparkleGain.gain.setValueAtTime(0.1, now + 0.2);
        sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        sparkle.connect(sparkleGain);
        sparkleGain.connect(ctx.destination);
        sparkle.start(now + 0.2);
        sparkle.stop(now + 0.5);
    },

    // ===== 20连击 Fanfare 号角 =====
    playComboFanfare() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // 号角音效：强有力的上行和弦
        const chords = [
            [392, 494, 587],  // G B D
            [523, 659, 784],  // C E G
            [659, 784, 988],  // E G B
            [784, 988, 1175], // G B D
        ];

        chords.forEach((chord, chordIdx) => {
            chord.forEach((freq, noteIdx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + chordIdx * 0.1);
                gain.gain.setValueAtTime(0, now + chordIdx * 0.1);
                gain.gain.linearRampToValueAtTime(0.15, now + chordIdx * 0.1 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + chordIdx * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + chordIdx * 0.1);
                osc.stop(now + chordIdx * 0.1 + 0.3);
            });
        });

        // 顶部闪亮
        [1047, 1319, 1568].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + 0.35 + i * 0.05);
            gain.gain.setValueAtTime(0.2, now + 0.35 + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + i * 0.05 + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + 0.35 + i * 0.05);
            osc.stop(now + 0.35 + i * 0.05 + 0.4);
        });
    },

    // ===== 游戏结束音效（下降音） =====
    playGameOver() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        [440, 349, 294, 220].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.2);
            gain.gain.setValueAtTime(0.2, now + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.2);
            osc.stop(now + i * 0.2 + 0.3);
        });
    },

    // ===== 通关音效 - 4秒欢快管弦乐 Fanfare =====
    playLevelComplete() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // 第一段：上行音阶 (0-1s)
        const phrase1 = [523, 659, 784, 1047]; // C E G C
        phrase1.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.15);
            gain.gain.setValueAtTime(0.3, now + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.35);

            // 泛音
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(freq * 2, now + i * 0.15);
            gain2.gain.setValueAtTime(0.1, now + i * 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.25);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + i * 0.15);
            osc2.stop(now + i * 0.15 + 0.25);
        });

        // 第二段：和弦进行 (1-2.5s)
        const chords = [
            { time: 1.0, notes: [523, 659, 784], gain: 0.2 },      // C major
            { time: 1.3, notes: [587, 740, 880], gain: 0.2 },      // D minor
            { time: 1.6, notes: [659, 784, 988], gain: 0.2 },      // E minor
            { time: 1.9, notes: [784, 988, 1175], gain: 0.25 },    // G major
        ];

        chords.forEach(chord => {
            chord.notes.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + chord.time);
                gain.gain.setValueAtTime(chord.gain, now + chord.time);
                gain.gain.exponentialRampToValueAtTime(0.001, now + chord.time + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + chord.time);
                osc.stop(now + chord.time + 0.4);
            });
        });

        // 第三段：高潮 (2.5-4s)
        const finale = [
            { time: 2.5, freq: 1047, duration: 0.5 },  // C
            { time: 2.7, freq: 1319, duration: 0.5 },  // E
            { time: 2.9, freq: 1568, duration: 0.6 },  // G
            { time: 3.2, freq: 2093, duration: 0.8 },  // 高音 C
        ];

        finale.forEach(note => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(note.freq, now + note.time);
            gain.gain.setValueAtTime(0.3, now + note.time);
            gain.gain.setValueAtTime(0.3, now + note.time + note.duration * 0.6);
            gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + note.time);
            osc.stop(now + note.time + note.duration);

            // 泛音增加辉煌感
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(note.freq * 2, now + note.time);
            gain2.gain.setValueAtTime(0.12, now + note.time);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration * 0.8);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + note.time);
            osc2.stop(now + note.time + note.duration * 0.8);
        });

        // 最后的和弦 (3.5-4s)
        [523, 659, 784, 1047].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + 3.5);
            gain.gain.setValueAtTime(0.15, now + 3.5);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + 3.5);
            osc.stop(now + 4.0);
        });
    },

    // ===== 按钮点击音效 =====
    playClick() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    },

    // ===== 提示音效 =====
    playHint() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        [880, 1100].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.15, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.15);
        });
    },

    // ===== 洗牌音效 =====
    playShuffle() {
        if (!this.enabled) return;
        this.init();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        for (let i = 0; i < 6; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(200 + Math.random() * 400, now + i * 0.05);
            gain.gain.setValueAtTime(0.08, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.08);
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
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
    document.getElementById('soundBtn').addEventListener('click', toggleSound);
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

// ===== 网格生成（逆向算法，保证可完成） =====
function generateGrid(config) {
    const { rows, cols, pairs } = config;
    const totalCells = rows * cols;
    const actualPairs = Math.min(pairs, Math.floor(totalCells / 2));

    const deadline = Date.now() + 2000; // 2秒时间限制
    let bestGrid = null;
    let bestScore = -1; // 可消除的卡片数，-1表示还没找到
    let attempt = 0;

    while (Date.now() < deadline) {
        attempt++;
        const grid = createRandomGrid(rows, cols, actualPairs);

        // 相邻约束不通过，跳过
        if (!hasLowAdjacency(grid, rows, cols)) continue;

        const score = solveGrid(grid, rows, cols);

        if (score === totalCells) {
            // 可解！直接使用
            console.log(`布局生成成功，尝试次数: ${attempt}, 得分: ${score}/${totalCells}`);
            gameState.grid = grid;
            return;
        }

        if (score > bestScore) {
            bestScore = score;
            bestGrid = grid;
        }
    }

    // 2秒内未找到完美解，使用消除数最多的布局
    console.log(`布局生成超时，尝试: ${attempt}次，最佳: ${bestScore}/${rows * cols}`);
    gameState.grid = bestGrid || createRandomGrid(rows, cols, actualPairs);
}

// ===== 检查同卡片相邻对总数是否<=2 =====
function hasLowAdjacency(grid, rows, cols) {
    let totalAdjacentPairs = 0;
    
    // 只检查右和下方向，避免重复计数
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const emoji = grid[r][c].emoji;
            if (!emoji) continue;
            
            // 检查右边
            if (c < cols - 1 && grid[r][c+1].emoji === emoji) {
                totalAdjacentPairs++;
            }
            // 检查下边
            if (r < rows - 1 && grid[r+1][c].emoji === emoji) {
                totalAdjacentPairs++;
            }
        }
    }
    
    return totalAdjacentPairs <= 2;
}

function createRandomGrid(rows, cols, pairs) {
    const totalCells = rows * cols;
    let cards = [];
    const shuffledEmojis = shuffleArray([...CONFIG.foodEmojis]).slice(0, pairs);

    for (let emoji of shuffledEmojis) {
        cards.push(emoji, emoji);
    }

    while (cards.length < totalCells) {
        cards.push(null);
    }

    cards = shuffleArray(cards);

    const grid = [];
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
        grid.push(row);
    }
    return grid;
}

// ===== 检查布局可解性（确定性批量求解器） =====
// 消除只会开放更多路径，不会阻塞，因此确定性一次遍历即可确定可消除总数
function solveGrid(grid, rows, cols) {
    const state = grid.map(row => row.map(cell => ({ 
        emoji: cell.emoji, 
        matched: false 
    })));
    
    let matchedCount = 0;
    
    while (true) {
        const remaining = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (state[r][c].emoji && !state[r][c].matched) {
                    remaining.push({ row: r, col: c, emoji: state[r][c].emoji });
                }
            }
        }
        
        if (remaining.length === 0) return matchedCount;
        
        // 找到所有可连接配对，全部消除（消除顺序不影响最终结果）
        const allPairs = findConnectablePairsInState(state, remaining, rows, cols);
        if (allPairs.length === 0) return matchedCount;
        
        for (const [a, b] of allPairs) {
            state[a.row][a.col].matched = true;
            state[b.row][b.col].matched = true;
            matchedCount += 2;
        }
    }
}

// 确定性求解器（从已有状态开始，部分格子已matched）
function solveFromState(state, rows, cols) {
    let matchedCount = 0;
    
    while (true) {
        const remaining = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (state[r][c].emoji && !state[r][c].matched) {
                    remaining.push({ row: r, col: c, emoji: state[r][c].emoji });
                }
            }
        }
        
        if (remaining.length === 0) return rows * cols;
        
        const allPairs = findConnectablePairsInState(state, remaining, rows, cols);
        if (allPairs.length === 0) return matchedCount;
        
        for (const [a, b] of allPairs) {
            state[a.row][a.col].matched = true;
            state[b.row][b.col].matched = true;
            matchedCount += 2;
        }
    }
}

function findConnectablePairsInState(state, cards, rows, cols) {
    const pairs = [];
    
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].emoji === cards[j].emoji) {
                if (canConnectInState(state, cards[i], cards[j], rows, cols)) {
                    pairs.push([cards[i], cards[j]]);
                }
            }
        }
    }
    
    return pairs;
}

function canConnectInState(state, start, end, rows, cols) {
    const extRows = rows + 2;
    const extCols = cols + 2;

    function isPassable(er, ec) {
        if (er === 0 || er === extRows - 1 || ec === 0 || ec === extCols - 1) {
            return true;
        }
        const r = er - 1;
        const c = ec - 1;
        const cell = state[r][c];
        return cell.matched || cell.emoji === null ||
               (r === start.row && c === start.col) ||
               (r === end.row && c === end.col);
    }

    const startExt = { r: start.row + 1, c: start.col + 1 };
    const endExt = { r: end.row + 1, c: end.col + 1 };

    const queue = [{ ...startExt, turns: 0, dir: null }];
    const visited = new Set();
    visited.add(`${startExt.r},${startExt.c},0,null`);

    const directions = [
        { dr: -1, dc: 0, name: 'up' },
        { dr: 1, dc: 0, name: 'down' },
        { dr: 0, dc: -1, name: 'left' },
        { dr: 0, dc: 1, name: 'right' }
    ];

    while (queue.length > 0) {
        const current = queue.shift();

        if (current.r === endExt.r && current.c === endExt.c) {
            return true;
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

            queue.push({ r: nr, c: nc, turns: newTurns, dir: dir.name });
        }
    }

    return false;
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

    // 播放音效：连击时只播放连击音效，避免混音
    if (gameState.combo >= 2) {
        showCombo(gameState.combo);
        SoundSystem.playCombo(gameState.combo);
    } else {
        SoundSystem.playMatch();
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
    const totalCells = rows * cols;

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

    const deadline = Date.now() + 1000; // 1秒时间限制
    let bestShuffle = null;
    let bestScore = -1;
    let attempt = 0;

    while (Date.now() < deadline) {
        attempt++;
        const shuffledEmojis = shuffleArray([...emojis]);
        let index = 0;
        
        const tempState = gameState.grid.map(row => 
            row.map(cell => ({ emoji: cell.emoji, matched: cell.matched }))
        );
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = tempState[r][c];
                if (cell.emoji && !cell.matched) {
                    cell.emoji = shuffledEmojis[index++];
                }
            }
        }
        
        // 相邻约束不通过，跳过
        if (!hasLowAdjacency(tempState, rows, cols)) continue;

        const score = solveFromState(tempState, rows, cols);
        
        if (score === totalCells) {
            // 可解！直接应用
            applyShuffle(shuffledEmojis);
            console.log(`洗牌成功，尝试次数: ${attempt}`);
            return;
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestShuffle = shuffledEmojis;
        }
    }

    // 超时，使用最佳结果
    console.log(`洗牌超时，尝试: ${attempt}次，最佳: ${bestScore}/${totalCells}`);
    applyShuffle(bestShuffle || shuffleArray([...emojis]));
}

function applyShuffle(shuffledEmojis) {
    const rows = gameState.grid.length;
    const cols = gameState.grid[0].length;
    let index = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = gameState.grid[r][c];
            if (cell.emoji && !cell.matched) {
                cell.emoji = shuffledEmojis[index++];
                cell.element.textContent = cell.emoji;
            }
        }
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

                            SoundSystem.playHint();

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
    SoundSystem.playShuffle();
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

function toggleSound() {
    const enabled = SoundSystem.toggle();
    document.getElementById('soundIcon').textContent = enabled ? '🔊' : '🔇';
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

    // 播放通关音效
    SoundSystem.playLevelComplete();

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

    // 播放游戏结束音效
    if (isWin) {
        // 通关音效已在 levelComplete 中播放
    } else {
        SoundSystem.playGameOver();
    }

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
