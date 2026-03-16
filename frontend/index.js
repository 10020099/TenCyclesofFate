// --- Constants ---
const API_BASE_URL = "/api";

// --- State Management ---
const appState = {
    gameState: null,
    lastRollEventId: null,
};

// --- Smooth Scroll State ---
const scrollState = {
    animationId: null,
    isUserScrolling: false,
    lastScrollTop: 0,
    scrollTimeout: null,
    isFirstRender: true,
};

// --- DOM Elements ---
const DOMElements = {
    loginView: document.getElementById('login-view'),
    gameView: document.getElementById('game-view'),
    loginError: document.getElementById('login-error'),
    loginKeyInput: document.getElementById('login-key-input'),
    loginButton: document.getElementById('login-button'),
    logoutButton: document.getElementById('logout-button'),
    fullscreenButton: document.getElementById('fullscreen-button'),
    narrativeWindow: document.getElementById('narrative-window'),
    characterStatus: document.getElementById('character-status'),
    opportunitiesSpan: document.getElementById('opportunities'),
    actionInput: document.getElementById('action-input'),
    actionButton: document.getElementById('action-button'),
    startTrialButton: document.getElementById('start-trial-button'),
    loadingSpinner: document.getElementById('loading-spinner'),
    rollOverlay: document.getElementById('roll-overlay'),
    rollPanel: document.getElementById('roll-panel'),
    rollType: document.getElementById('roll-type'),
    rollTarget: document.getElementById('roll-target'),
    rollResultDisplay: document.getElementById('roll-result-display'),
    rollOutcome: document.getElementById('roll-outcome'),
    rollValue: document.getElementById('roll-value'),
    // 修改器相关
    modifierToggleButton: document.getElementById('modifier-toggle-button'),
    modifierPanel: document.getElementById('modifier-panel'),
    modifierClose: document.getElementById('modifier-close'),
    modifierApply: document.getElementById('modifier-apply'),
    modOpportunities: document.getElementById('mod-opportunities'),
    modInTrial: document.getElementById('mod-in-trial'),
    modDailySuccess: document.getElementById('mod-daily-success'),
    modPunishment: document.getElementById('mod-punishment'),
    modProcessing: document.getElementById('mod-processing'),
    modCurrentLife: document.getElementById('mod-current-life'),
};

// --- API Client ---
const api = {
    async login(key) {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            credentials: 'include',
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '登录失败');
        }
        return response.json();
    },
    async initGame() {
        const response = await fetch(`${API_BASE_URL}/game/init`, {
            method: 'POST',
            credentials: 'include',
        });
        if (response.status === 401) {
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error('Failed to initialize game session');
        return response.json();
    },
    async logout() {
        await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' });
        window.location.href = '/';
    }
};

// --- WebSocket Manager ---
const socketManager = {
    socket: null,
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${protocol}//${host}${API_BASE_URL}/ws`;
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => { console.log("WebSocket established."); resolve(); };
            this.socket.onmessage = (event) => {
                let message;
                if (event.data instanceof ArrayBuffer) {
                    try {
                        const decompressed = pako.ungzip(new Uint8Array(event.data), { to: 'string' });
                        message = JSON.parse(decompressed);
                    } catch (err) {
                        console.error('Failed to decompress or parse message:', err);
                        return;
                    }
                } else {
                    message = JSON.parse(event.data);
                }
                
                switch (message.type) {
                    case 'full_state':
                        appState.gameState = message.data;
                        checkAndShowRollEvent();
                        render();
                        break;
                    case 'patch':
                        if (appState.gameState && message.patch) {
                            try {
                                const result = jsonpatch.applyPatch(appState.gameState, message.patch, true, false);
                                appState.gameState = result.newDocument;
                                checkAndShowRollEvent();
                                render();
                            } catch (err) {
                                console.error('Failed to apply patch:', err);
                            }
                        }
                        break;
                    case 'error':
                        alert(`WebSocket Error: ${message.detail}`);
                        break;
                }
            };
            this.socket.onclose = () => { console.log("Reconnecting..."); showLoading(true); setTimeout(() => this.connect(), 5000); };
            this.socket.onerror = (error) => { console.error("WebSocket error:", error); DOMElements.loginError.textContent = '无法连接。'; reject(error); };
        });
    },
    sendAction(action) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action }));
        } else {
            alert("连接已断开，请刷新。");
        }
    },
    sendModifierUpdate(stateData) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: "__modifier_update__", state_data: stateData }));
        } else {
            alert("连接已断开，请刷新。");
        }
    }
};

// --- UI & Rendering ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function renderMarkdownSafe(markdownText) {
    const rawHtml = marked.parse(markdownText || "", { mangle: false, headerIds: false });
    return DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onmouseenter", "onmouseleave", "style"],
    });
}

// --- Smooth Scroll Functions ---
function stopSmoothScroll() {
    if (scrollState.animationId) {
        cancelAnimationFrame(scrollState.animationId);
        scrollState.animationId = null;
    }
}

function smoothScrollToBottom(element, pixelsPerSecond = 150) {
    stopSmoothScroll();
    if (scrollState.isUserScrolling) return;
    
    const startScrollTop = element.scrollTop;
    const minScrollDistance = 50;
    
    function tryStartScroll(retryCount = 0) {
        const targetScrollTop = element.scrollHeight - element.clientHeight;
        const distance = targetScrollTop - startScrollTop;
        
        if (distance < minScrollDistance && retryCount < 10) {
            setTimeout(() => tryStartScroll(retryCount + 1), 100);
            return;
        }
        if (distance <= 0) return;
        if (scrollState.isUserScrolling) return;
        
        const startTime = performance.now();
        const duration = (distance / pixelsPerSecond) * 1000;
        
        function animateScroll(currentTime) {
            if (scrollState.isUserScrolling) {
                scrollState.animationId = null;
                return;
            }
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - (1 - progress) * (1 - progress);
            element.scrollTop = startScrollTop + (distance * easeProgress);
            if (progress < 1) {
                scrollState.animationId = requestAnimationFrame(animateScroll);
            } else {
                scrollState.animationId = null;
            }
        }
        scrollState.animationId = requestAnimationFrame(animateScroll);
    }
    tryStartScroll();
}

function setupScrollInterruptListener(element) {
    element.addEventListener('wheel', () => {
        scrollState.isUserScrolling = true;
        stopSmoothScroll();
        if (scrollState.scrollTimeout) clearTimeout(scrollState.scrollTimeout);
        scrollState.scrollTimeout = setTimeout(() => { scrollState.isUserScrolling = false; }, 2000);
    }, { passive: true });
    
    element.addEventListener('touchstart', () => {
        scrollState.isUserScrolling = true;
        stopSmoothScroll();
    }, { passive: true });
    
    element.addEventListener('touchend', () => {
        if (scrollState.scrollTimeout) clearTimeout(scrollState.scrollTimeout);
        scrollState.scrollTimeout = setTimeout(() => { scrollState.isUserScrolling = false; }, 2000);
    }, { passive: true });
}

function showLoading(isLoading) {
    const showFullscreenSpinner = isLoading && !appState.gameState;
    DOMElements.loadingSpinner.style.display = showFullscreenSpinner ? 'flex' : 'none';
    
    const isProcessing = appState.gameState ? appState.gameState.is_processing : false;
    const buttonsDisabled = isLoading || isProcessing;
    DOMElements.actionInput.disabled = buttonsDisabled;
    DOMElements.actionButton.disabled = buttonsDisabled;
    DOMElements.startTrialButton.disabled = buttonsDisabled;
    
    if (buttonsDisabled && appState.gameState) {
        DOMElements.actionButton.textContent = '⏳';
    } else {
        DOMElements.actionButton.textContent = '定';
    }
}

function render() {
    if (!appState.gameState) { showLoading(true); return; }
    showLoading(appState.gameState.is_processing);
    DOMElements.opportunitiesSpan.textContent = appState.gameState.opportunities_remaining;
    renderCharacterStatus();

    const historyContainer = document.createDocumentFragment();
    (appState.gameState.display_history || []).forEach(text => {
        const p = document.createElement('div');
        p.innerHTML = renderMarkdownSafe(text);
        if (text.startsWith('> ')) p.classList.add('user-input-message');
        else if (text.startsWith('【')) p.classList.add('system-message');
        historyContainer.appendChild(p);
    });
    DOMElements.narrativeWindow.innerHTML = '';
    DOMElements.narrativeWindow.appendChild(historyContainer);
    
    if (scrollState.isFirstRender) {
        DOMElements.narrativeWindow.scrollTop = DOMElements.narrativeWindow.scrollHeight;
        scrollState.isFirstRender = false;
    } else {
        smoothScrollToBottom(DOMElements.narrativeWindow, 150);
    }
    
    const { is_in_trial, daily_success_achieved, opportunities_remaining, modifier_mode } = appState.gameState;
    DOMElements.actionInput.parentElement.classList.toggle('hidden', !(is_in_trial || daily_success_achieved || opportunities_remaining < 0));
    const startButton = DOMElements.startTrialButton;
    startButton.classList.toggle('hidden', is_in_trial || daily_success_achieved || opportunities_remaining < 0);

    if (daily_success_achieved) {
         startButton.textContent = "今日功德圆满";
         startButton.disabled = true;
    } else if (opportunities_remaining <= 0) {
        startButton.textContent = "机缘已尽";
        startButton.disabled = true;
    } else {
        if (opportunities_remaining === 10) {
            startButton.textContent = "开始第一次试炼";
        } else {
            startButton.textContent = "开启下一次试炼";
        }
        startButton.disabled = appState.gameState.is_processing;
    }

    // --- 修改器 UI 状态 ---
    if (modifier_mode) {
        DOMElements.modifierToggleButton.classList.remove('hidden');
        // 修改器模式下，解除所有限制
        DOMElements.actionInput.parentElement.classList.remove('hidden');
        DOMElements.actionInput.disabled = appState.gameState.is_processing;
        DOMElements.actionButton.disabled = appState.gameState.is_processing;
    } else {
        DOMElements.modifierToggleButton.classList.add('hidden');
        DOMElements.modifierPanel.classList.add('hidden');
    }
}

function renderValue(container, value, level = 0) {
    if (Array.isArray(value)) {
        value.forEach(item => renderValue(container, item, level + 1));
    } else if (typeof value === 'object' && value !== null) {
        const subContainer = document.createElement('div');
        subContainer.style.paddingLeft = `${level * 10}px`;
        Object.entries(value).forEach(([key, val]) => {
            const propDiv = document.createElement('div');
            propDiv.classList.add('property-item');
            const keySpan = document.createElement('span');
            keySpan.classList.add('property-key');
            keySpan.textContent = `${key}: `;
            propDiv.appendChild(keySpan);
            renderValue(propDiv, val, level + 1);
            subContainer.appendChild(propDiv);
        });
        container.appendChild(subContainer);
    } else {
        const valueSpan = document.createElement('span');
        valueSpan.classList.add('property-value');
        valueSpan.textContent = value;
        container.appendChild(valueSpan);
    }
}

function renderCharacterStatus() {
    const { current_life } = appState.gameState;
    const container = DOMElements.characterStatus;
    container.innerHTML = '';

    if (!current_life) {
        container.textContent = '静待天命...';
        return;
    }

    Object.entries(current_life).forEach(([key, value]) => {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = key;
        details.appendChild(summary);
        const content = document.createElement('div');
        content.classList.add('details-content');
        renderValue(content, value);
        details.appendChild(content);
        container.appendChild(details);
    });
}

function checkAndShowRollEvent() {
    const rollEvent = appState.gameState?.roll_event;
    if (rollEvent && rollEvent.id && rollEvent.id !== appState.lastRollEventId) {
        appState.lastRollEventId = rollEvent.id;
        renderRollEvent(rollEvent);
    }
}

function renderRollEvent(rollEvent) {
    DOMElements.rollType.textContent = `判定: ${rollEvent.type}`;
    DOMElements.rollTarget.textContent = `(<= ${rollEvent.target})`;
    DOMElements.rollOutcome.textContent = rollEvent.outcome;
    DOMElements.rollOutcome.className = `outcome-${rollEvent.outcome}`;
    DOMElements.rollValue.textContent = rollEvent.result;
    DOMElements.rollResultDisplay.classList.add('hidden');
    DOMElements.rollOverlay.classList.remove('hidden');
    setTimeout(() => DOMElements.rollResultDisplay.classList.remove('hidden'), 1000);
    setTimeout(() => DOMElements.rollOverlay.classList.add('hidden'), 3000);
}

// --- Modifier Panel ---
function openModifierPanel() {
    if (!appState.gameState) return;
    // 同步当前状态到面板
    DOMElements.modOpportunities.value = appState.gameState.opportunities_remaining || 0;
    DOMElements.modInTrial.checked = !!appState.gameState.is_in_trial;
    DOMElements.modDailySuccess.checked = !!appState.gameState.daily_success_achieved;
    DOMElements.modPunishment.checked = false;
    DOMElements.modProcessing.checked = false;
    // 填充 current_life JSON
    if (appState.gameState.current_life) {
        DOMElements.modCurrentLife.value = JSON.stringify(appState.gameState.current_life, null, 2);
    } else {
        DOMElements.modCurrentLife.value = '';
        DOMElements.modCurrentLife.placeholder = '角色不在试炼中时为空...';
    }
    DOMElements.modifierPanel.classList.remove('hidden');
}

function closeModifierPanel() {
    DOMElements.modifierPanel.classList.add('hidden');
}

function applyModifierChanges() {
    if (!appState.gameState) return;
    const stateData = {};
    
    const newOpportunities = parseInt(DOMElements.modOpportunities.value, 10);
    if (!isNaN(newOpportunities) && newOpportunities !== appState.gameState.opportunities_remaining) {
        stateData.opportunities_remaining = newOpportunities;
    }
    if (DOMElements.modInTrial.checked !== !!appState.gameState.is_in_trial) {
        stateData.is_in_trial = DOMElements.modInTrial.checked;
    }
    if (DOMElements.modDailySuccess.checked !== !!appState.gameState.daily_success_achieved) {
        stateData.daily_success_achieved = DOMElements.modDailySuccess.checked;
    }
    if (DOMElements.modPunishment.checked) {
        stateData.pending_punishment = null;
    }
    if (DOMElements.modProcessing.checked) {
        stateData.is_processing = false;
    }
    // current_life JSON 编辑
    const lifeText = DOMElements.modCurrentLife.value.trim();
    if (lifeText) {
        try {
            const newLife = JSON.parse(lifeText);
            // 只有内容变化了才提交
            if (JSON.stringify(newLife) !== JSON.stringify(appState.gameState.current_life)) {
                stateData.current_life = newLife;
            }
        } catch (e) {
            alert('current_life JSON 格式错误，请检查！\n\n' + e.message);
            return;
        }
    } else if (appState.gameState.current_life !== null) {
        // 清空了 textarea，设为 null
        stateData.current_life = null;
    }

    if (Object.keys(stateData).length > 0) {
        socketManager.sendModifierUpdate(stateData);
        closeModifierPanel();
    } else {
        alert("没有检测到任何修改。");
    }
}

// --- Fullscreen Management ---
function toggleFullscreen() {
    document.body.classList.toggle('app-fullscreen');
    updateFullscreenButton();
}

function updateFullscreenButton() {
    const isFullscreen = document.body.classList.contains('app-fullscreen');
    if (DOMElements.fullscreenButton) {
        DOMElements.fullscreenButton.textContent = isFullscreen ? '⛶' : '⛶';
        DOMElements.fullscreenButton.title = isFullscreen ? '退出全屏' : '全屏模式';
    }
}

// --- Event Handlers ---
function handleLogout() {
    api.logout();
}

function handleAction(actionOverride = null) {
    const action = actionOverride || DOMElements.actionInput.value.trim();
    if (!action) return;

    if (action === "开始试炼") {
        // Allow starting a new trial even if the previous async task is in its finally block
    } else {
        if (appState.gameState && appState.gameState.is_processing) return;
    }

    DOMElements.actionInput.value = '';
    socketManager.sendAction(action);
}

async function handleLogin() {
    const key = DOMElements.loginKeyInput.value.trim();
    if (!key) {
        DOMElements.loginError.textContent = '请输入密钥。';
        return;
    }
    DOMElements.loginError.textContent = '';
    DOMElements.loginButton.disabled = true;
    DOMElements.loginButton.textContent = '正在登录...';

    try {
        await api.login(key);
        await initializeGame();
    } catch (error) {
        DOMElements.loginError.textContent = error.message || '登录失败，请重试。';
        DOMElements.loginButton.disabled = false;
        DOMElements.loginButton.textContent = '踏入轮回';
    }
}

// --- Initialization ---
async function initializeGame() {
    showLoading(true);
    try {
        const initialState = await api.initGame();
        appState.gameState = initialState;
        render();
        showView('game-view');
        await socketManager.connect();
        console.log("Initialization complete and WebSocket is ready.");
    } catch (error) {
        showView('login-view');
        DOMElements.loginButton.disabled = false;
        DOMElements.loginButton.textContent = '踏入轮回';
        if (error.message !== 'Unauthorized') {
             console.error(`Session initialization failed: ${error.message}`);
        }
    } finally {
        showLoading(false);
    }
}

function init() {
    // 尝试自动登录（如果 cookie 中已有 player_key）
    initializeGame();

    // Setup scroll interrupt listener
    setupScrollInterruptListener(DOMElements.narrativeWindow);

    // Setup event listeners
    DOMElements.logoutButton.addEventListener('click', handleLogout);
    DOMElements.fullscreenButton.addEventListener('click', toggleFullscreen);
    DOMElements.actionButton.addEventListener('click', () => handleAction());
    DOMElements.actionInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAction(); });
    DOMElements.startTrialButton.addEventListener('click', () => handleAction("开始试炼"));

    // Login event listeners
    DOMElements.loginButton.addEventListener('click', handleLogin);
    DOMElements.loginKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

    // Modifier event listeners
    DOMElements.modifierToggleButton.addEventListener('click', openModifierPanel);
    DOMElements.modifierClose.addEventListener('click', closeModifierPanel);
    DOMElements.modifierApply.addEventListener('click', applyModifierChanges);
}

// --- Start the App ---
init();