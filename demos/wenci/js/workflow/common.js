// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// 文辞AI - 前端主逻辑（合并改编设定页版本）
// ========================================

// API 基地址：部署环境为空（同域 Nginx 代理），本地开发改为 'http://localhost:5002'
// API 基地址：本地 OAuth 测试时设为空（Flask 同时提供前端静态文件，同域访问）
// 如需前后端分离开发（不测OAuth），改为 'http://localhost:5002'
const API_BASE = '';
const SIDEBAR_WIDTH_STORAGE_KEY = "wenciai_task_sidebar_width";

// 从当前页面 URL 提取看板注入的用户信息，确保后续 AJAX 请求都带上身份
const _CURRENT_URL_PARAMS = new URLSearchParams(window.location.search);
const _USER_ID = _CURRENT_URL_PARAMS.get("user_id");
const _USER_NICKNAME = _CURRENT_URL_PARAMS.get("nickname");
function appendUserQuery(url) {
    if (!_USER_ID) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}user_id=${encodeURIComponent(_USER_ID)}&nickname=${encodeURIComponent(_USER_NICKNAME || "")}`;
}
const SIDEBAR_COLLAPSED_STORAGE_KEY = "wenciai_task_sidebar_collapsed";
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 320;

let graphChart = null;
let originalGraphChart = null;
let newGraphChart = null;

const GROUP_COLOR_POOL = ["#00d4ff", "#ff006e", "#ffbe0b", "#8892a4", "#00f5d4", "#b24bff", "#39ff14", "#fb5607", "#8338ec", "#3a86ff"];
const TOTAL_STEPS = 7;
const TOTAL_PROGRESS_STEPS = 3;
const MAX_GENRE_SELECTION = 1;

const WORLDVIEW_OPTIONS_MAP = {
    "现代": "现代", "都市": "现代", "职场": "现代", "校园": "现代", "当代": "现代",
    "年代": "年代", "民国": "年代", "建国": "年代",
    "古代": "古代", "宫廷": "古代", "江湖": "古代", "王朝": "古代",
    "未来": "未来", "科幻": "未来", "末世": "未来", "星际": "未来",
    "玄幻": "玄幻", "仙侠": "玄幻", "修真": "玄幻", "奇幻": "玄幻",
};

const workflowState = {
    currentUser: null,
    tasks: [],
    currentTaskId: "",
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    sidebarCollapsed: false,
    sidebarDragging: false,
    rawNovelText: "",
    splitterResultText: "",
    originalOutlineText: "",
    parsedOutline: null,
    relationshipData: null,
    metadata: null,
    outlineAnalysis: null,
    selectedWorldview: "",
    availableGenres: [],
    selectedGenres: [],
    targetAudience: "",
    selectedScenes: [],
    recommendedScenes: [],
    environmentResult: null,
    characterResult: null,
    storylineResult: null,
    finalFramework: null,
    generatedNovel: null,
    blueprint: {},
    chapterPlan: [],
    chapterDrafts: [],
    selectedDraftChapter: 1,
    autoFollowDraftChapter: true,
    chapterAutosaveTimer: null,
    writeJobId: "",
    writeJobStatus: "idle",
    writePollBusy: false,
    writePollTimer: null,
    writeLastNotifiedStatus: "",
    currentStep: 1,
    selectedCoreScene: "",
    keptOriginalScene: false,
    keptOriginalCharacters: false,
    keptOriginalWorldview: false,
    keptOriginalGenre: false,
    newCharacterBios: null,
    newOutlineText: "",
    isHistoryReferenceExpanded: false,
    historicalReferenceDates: [],
    historicalReferenceBooks: [],
    historicalReferenceDetail: null,
    selectedHistoricalDate: "",
    selectedHistoricalBookId: "",
    currentInputMode: "raw_text",
};

// ========================================
// 粒子背景
// ========================================
function initParticles() {
    const canvas = document.getElementById("particles-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);
    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5; this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5; this.opacity = Math.random() * 0.5 + 0.1;
            this.color = Math.random() > 0.5 ? "0, 212, 255" : "0, 245, 212";
        }
        update() { this.x += this.speedX; this.y += this.speedY; if (this.x < 0 || this.x > canvas.width) this.speedX *= -1; if (this.y < 0 || this.y > canvas.height) this.speedY *= -1; }
        draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`; ctx.fill(); }
    }
    const count = Math.min(80, Math.floor(window.innerWidth * window.innerHeight / 15000));
    const particles = Array.from({ length: count }, () => new Particle());
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => { p.update(); p.draw(); });
        for (let i = 0; i < particles.length; i += 1) {
            for (let j = i + 1; j < particles.length; j += 1) {
                const dx = particles[i].x - particles[j].x; const dy = particles[i].y - particles[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 150) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.strokeStyle = `rgba(0, 212, 255, ${(1 - d / 150) * 0.15})`; ctx.lineWidth = 0.5; ctx.stroke(); }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}

// ========================================
// 通用工具
// ========================================
function getEl(id) { return document.getElementById(id); }

async function fetchJSON(url) {
    const res = await fetch(API_BASE + appendUserQuery(url), { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "请求失败");
    return data;
}

function showToast(msg, isSuccess = false) {
    const toast = getEl("error-toast"); const msgEl = getEl("error-msg");
    const iconEl = toast.querySelector(".error-icon");
    iconEl.textContent = isSuccess ? "✓" : "⚠"; msgEl.textContent = msg;
    toast.style.display = "flex";
    toast.style.borderColor = isSuccess ? "#00f5d4" : "rgba(255, 0, 110, 0.3)";
    toast.style.color = isSuccess ? "#00f5d4" : "";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = "none"; }, isSuccess ? 2500 : 4000);
}
function showError(msg) { showToast(msg, false); }
function showSuccess(msg) { showToast(msg, true); }

function downloadTextAsTxt(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function showPageLoading(text = "AI 正在处理中...") {
    const overlay = getEl("page-loading"); const textEl = getEl("page-loading-text"); const bar = getEl("page-progress-bar");
    textEl.textContent = text; overlay.style.display = "flex"; bar.style.width = "0%";
    let progress = 0;
    window._pageLoadingInterval = setInterval(() => { progress += Math.random() * 12; if (progress > 90) progress = 90; bar.style.width = `${progress}%`; }, 500);
}
function hidePageLoading() {
    if (window._pageLoadingInterval) clearInterval(window._pageLoadingInterval);
    const bar = getEl("page-progress-bar"); bar.style.width = "100%";
    setTimeout(() => { getEl("page-loading").style.display = "none"; }, 250);
}

// ========================================
// OAuth 登录状态管理
// ========================================
const OAUTH_CONFIG = {
    authorizeUrl: '',       // 从后端获取，或手动构造
    checkInterval: null,
    currentUser: null,
};

async function checkAuthStatus() {
    try {
        const res = await fetch(API_BASE + appendUserQuery('/auth/status'), { credentials: 'include' });
        const data = await res.json();
        OAUTH_CONFIG.currentUser = data.logged_in ? data.user : null;
        if (data.logged_in) {
            renderUserInfo(data.user);
        }
        return data;
    } catch {
        return { logged_in: false, oauth_enabled: false };
    }
}

function renderUserInfo(user) {
    const container = document.getElementById('user-info-bar');
    if (!container) return;
    if (!user) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = user.nickname || user.userName || user.loginName || user.user_id || '用户';
    const roleEl = document.getElementById('user-display-role');
    if (roleEl) roleEl.textContent = (user.roles || []).join(', ') || '';
}

function redirectToOAuthLogin(authorizeUrl) {
    if (authorizeUrl) {
        window.location.href = authorizeUrl;
    } else {
        // 回退：构造默认授权 URL
        const kanbanBase = 'https://manager.tianzhi8888.com';
        const clientId = 'wenci';
        const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback');
        window.location.href = `${kanbanBase}/oauth/authorize?clientId=${clientId}&redirectUri=${redirectUri}`;
    }
}

async function handleLogout() {
    try {
        await fetch(API_BASE + appendUserQuery('/api/user/logout'), { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    OAUTH_CONFIG.currentUser = null;
    renderUserInfo(null);
    showSuccess('已退出登录');
    // 1秒后刷新页面触发重新登录
    setTimeout(() => window.location.reload(), 1000);
}

function startAuthHeartbeat() {
    setInterval(async () => {
        try {
            const status = await checkAuthStatus();
            if (status.oauth_enabled && !status.logged_in) {
                showError('登录已过期，正在跳转到看板登录...');
                setTimeout(() => redirectToOAuthLogin(), 1500);
            }
        } catch (e) { /* 忽略网络错误 */ }
    }, 30 * 1000);
}

// 监听看板 iframe postMessage 注销通知（若看板支持）
window.addEventListener('message', (event) => {
    if (event.origin !== 'https://manager.tianzhi8888.com') return;
    if (event.data === 'logout') {
        handleLogout();
    }
});

async function postJSON(url, payload) {
    const res = await fetch(API_BASE + appendUserQuery(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
    });
    // 处理 401 未登录
    if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.login_required && data.authorize_url) {
            showError('登录已过期，正在跳转到看板登录...');
            setTimeout(() => redirectToOAuthLogin(data.authorize_url), 1500);
            throw new Error('需要登录');
        }
        throw new Error(data.error || '未登录');
    }
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "请求失败");
    return data;
}

// 包装 fetch GET 请求，也处理 401
async function apiGet(url) {
    const res = await fetch(API_BASE + appendUserQuery(url), { credentials: "include" });
    if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.login_required && data.authorize_url) {
            showError('登录已过期，正在跳转到看板登录...');
            setTimeout(() => redirectToOAuthLogin(data.authorize_url), 1500);
            throw new Error('需要登录');
        }
        throw new Error(data.error || '未登录');
    }
    return res;
}

function copyTextFromTextarea(id) {
    const el = getEl(id); if (!el) return;
    navigator.clipboard.writeText(el.value || "").then(() => showSuccess("已复制到剪贴板")).catch(() => showError("复制失败，请手动复制"));
}

function escapeHTML(str) { const div = document.createElement("div"); div.textContent = String(str || ""); return div.innerHTML; }

function createClientTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampSidebarWidth(value) {
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Number(value) || SIDEBAR_DEFAULT_WIDTH));
}

function loadSidebarPreference() {
    try {
        const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
        const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        workflowState.sidebarWidth = clampSidebarWidth(savedWidth || SIDEBAR_DEFAULT_WIDTH);
        workflowState.sidebarCollapsed = savedCollapsed === "1";
    } catch {
        workflowState.sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
        workflowState.sidebarCollapsed = false;
    }
}

function persistSidebarPreference() {
    try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(workflowState.sidebarWidth));
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, workflowState.sidebarCollapsed ? "1" : "0");
    } catch {
        // ignore storage failures
    }
}

function applySidebarLayout() {
    const shell = document.querySelector(".workflow-shell");
    const icon = getEl("task-sidebar-toggle-icon");
    if (!shell) return;
    const effectiveSidebarWidth = workflowState.sidebarCollapsed ? 0 : clampSidebarWidth(workflowState.sidebarWidth);
    const effectiveDividerWidth = workflowState.sidebarCollapsed ? 0 : 18;
    shell.style.setProperty("--sidebar-width", `${effectiveSidebarWidth}px`);
    shell.style.setProperty("--sidebar-divider-width", `${effectiveDividerWidth}px`);
    shell.classList.toggle("is-sidebar-collapsed", !!workflowState.sidebarCollapsed);
    shell.classList.toggle("is-sidebar-dragging", !!workflowState.sidebarDragging);
    if (icon) icon.textContent = workflowState.sidebarCollapsed ? "›" : "‹";
}

function setSidebarWidth(nextWidth) {
    workflowState.sidebarWidth = clampSidebarWidth(nextWidth);
    applySidebarLayout();
    persistSidebarPreference();
}

function toggleTaskSidebarCollapse() {
    workflowState.sidebarCollapsed = !workflowState.sidebarCollapsed;
    workflowState.sidebarDragging = false;
    applySidebarLayout();
    persistSidebarPreference();
}

function initTaskSidebarInteractions() {
    loadSidebarPreference();
    applySidebarLayout();
    const divider = getEl("task-sidebar-divider");
    const handle = getEl("task-sidebar-toggle");
    if (!divider || !handle || window.innerWidth <= 1024) return;

    const onPointerMove = (event) => {
        if (!workflowState.sidebarDragging) return;
        const shell = document.querySelector(".workflow-shell");
        if (!shell) return;
        const shellRect = shell.getBoundingClientRect();
        const nextWidth = event.clientX - shellRect.left;
        workflowState.sidebarCollapsed = false;
        workflowState.sidebarWidth = clampSidebarWidth(nextWidth);
        applySidebarLayout();
    };

    const stopDragging = () => {
        if (!workflowState.sidebarDragging) return;
        workflowState.sidebarDragging = false;
        applySidebarLayout();
        persistSidebarPreference();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stopDragging);
    };

    divider.addEventListener("pointerdown", (event) => {
        if (event.target === handle || handle.contains(event.target)) return;
        workflowState.sidebarDragging = true;
        workflowState.sidebarCollapsed = false;
        applySidebarLayout();
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stopDragging);
    });
}

function inferStep1TaskTitle() {
    const rawText = (getEl("raw-novel-text")?.value || "").trim();
    const outlineText = (getEl("input-outline-text")?.value || "").trim();
    const referenceTitle = workflowState.historicalReferenceDetail?.title || workflowState.selectedHistoricalBookId || "";
    const source = rawText || outlineText || referenceTitle || "未命名任务";
    const firstLine = source.split(/\n+/).find((line) => line.trim()) || source;
    return firstLine.trim().slice(0, 24) || "未命名任务";
}

function inferStep1CurrentStep() {
    const rawText = (getEl("raw-novel-text")?.value || "").trim();
    const outlineText = (getEl("input-outline-text")?.value || "").trim();
    if (workflowState.outlineAnalysis || workflowState.relationshipData) return "step1_parse_done";
    if (workflowState.splitterResultText || outlineText) return "step1_split_done";
    if (rawText) return "step1_raw_input";
    return "step1_init";
}

function inferStep1InputMode() {
    if (workflowState.historicalReferenceDetail?.split_result) return "history_reference";
    if ((getEl("raw-novel-text")?.value || "").trim()) return "raw_text";
    if ((getEl("input-outline-text")?.value || "").trim()) return "outline_text";
    return "raw_text";
}

function getStageStepForStep1State(currentStep) {
    if (currentStep === "step1_raw_input" || currentStep === "step1_init") return 1;
    return 2;
}

function resetStep1Workspace() {
    workflowState.rawNovelText = "";
    workflowState.splitterResultText = "";
    workflowState.originalOutlineText = "";
    workflowState.parsedOutline = null;
    workflowState.relationshipData = null;
    workflowState.outlineAnalysis = null;
    workflowState.currentInputMode = "raw_text";
    workflowState.selectedHistoricalDate = "";
    workflowState.selectedHistoricalBookId = "";
    workflowState.historicalReferenceDetail = null;
    if (getEl("raw-novel-text")) getEl("raw-novel-text").value = "";
    if (getEl("input-outline-text")) getEl("input-outline-text").value = "";
    renderHistoryReferenceDates();
    renderHistoryReferenceBooks();
    renderHistoryReferenceDetail();
    renderHistoryReferenceStatus();
    hideRelationshipResult();
}

function renderTaskSidebar() {
    const userEl = getEl("task-sidebar-user");
    const metaEl = getEl("task-sidebar-meta");
    const listEl = getEl("task-sidebar-list");
    if (!userEl || !metaEl || !listEl) return;
    userEl.textContent = workflowState.currentUser
        ? `${workflowState.currentUser.nickname} · ${workflowState.currentUser.user_id}`
        : "未识别当前用户";
    metaEl.textContent = workflowState.currentTaskId
        ? `当前任务 ID：${workflowState.currentTaskId}`
        : "点击“新建任务”开始新的第一页处理。";
    if (!workflowState.tasks.length) {
        listEl.innerHTML = '<div class="task-sidebar__empty">当前用户还没有已保存的历史任务。先处理第一页内容，再点击“保存当前进度”。</div>';
        return;
    }
    listEl.innerHTML = workflowState.tasks.map((item) => `
        <button
            type="button"
            class="task-sidebar-card ${String(item.task_id) === String(workflowState.currentTaskId) ? "is-active" : ""}"
            onclick="selectTaskFromSidebar('${escapeHTML(String(item.task_id))}')"
        >
            <div class="task-sidebar-card__title">${escapeHTML(item.title || "未命名任务")}</div>
            <div class="task-sidebar-card__status">${escapeHTML(item.current_step || "step1_init")} · ${escapeHTML(item.current_step_status || "init")}</div>
            <div class="task-sidebar-card__time">${escapeHTML(item.gmt_modified || "未保存")}</div>
            <div class="task-sidebar-card__summary">${escapeHTML(item.last_summary || "暂无摘要")}</div>
        </button>
    `).join("");
}

async function loadCurrentUser() {
    workflowState.currentUser = await fetchJSON("/api/me");
    renderTaskSidebar();
}

async function loadTaskSidebarList(options = {}) {
    const { autoSelectLatest = false } = options;
    const data = await fetchJSON("/api/tasks");
    workflowState.tasks = data.items || [];
    renderTaskSidebar();
    if (autoSelectLatest && workflowState.tasks.length) {
        await selectTaskFromSidebar(String(workflowState.tasks[0].task_id), { silent: true });
    }
}

function getTaskModuleFromItem(item) {
    const currentStep = String(item?.current_step || "").trim().toLowerCase();
    if (currentStep === "step3" || currentStep.startsWith("step3")) return "step3";
    if (currentStep === "step2" || currentStep.startsWith("step2")) return "step2";
    return "step1";
}

function startNewTaskDraft() {
    workflowState.currentTaskId = createClientTaskId();
    resetStep1Workspace();
    switchToStep(1);
    renderTaskSidebar();
    showSuccess("已创建新任务草稿，请开始填写第一页内容");
}

function applyStep1DraftPayload(payload) {
    workflowState.currentTaskId = String(payload.task_id || workflowState.currentTaskId || "");
    workflowState.currentInputMode = payload.input_mode || "raw_text";
    workflowState.rawNovelText = payload.raw_source_text || "";
    workflowState.splitterResultText = payload.split_result_text || "";
    workflowState.originalOutlineText = payload.outline_source_text || "";
    workflowState.parsedOutline = payload.parsed_outline_json || null;
    workflowState.relationshipData = payload.relationship_data_json || null;
    workflowState.outlineAnalysis = payload.outline_analysis_json || null;
    workflowState.selectedHistoricalDate = payload.reference_date || "";
    workflowState.selectedHistoricalBookId = payload.reference_book_id || "";
    workflowState.historicalReferenceDetail = payload.reference_title
        ? {
            title: payload.reference_title || "",
            split_result: payload.outline_source_text || payload.split_result_text || "",
            ...(payload.reference_meta_json || {}),
        }
        : null;
    if (getEl("raw-novel-text")) getEl("raw-novel-text").value = workflowState.rawNovelText;
    if (getEl("input-outline-text")) getEl("input-outline-text").value = workflowState.originalOutlineText || workflowState.splitterResultText;
    if (workflowState.relationshipData?.characters?.length) renderRelationshipResult(workflowState.relationshipData);
    else hideRelationshipResult();
    renderHistoryReferenceDates();
    renderHistoryReferenceBooks();
    renderHistoryReferenceStatus();
    renderHistoryReferenceDetail();
    renderTaskSidebar();
    switchToStep(getStageStepForStep1State(payload.current_step));
}

async function loadStep1Draft(taskId, options = {}) {
    const { silent = false } = options;
    try {
        const payload = await fetchJSON(`/api/workflow/step1/load?task_id=${encodeURIComponent(taskId)}`);
        applyStep1DraftPayload(payload);
        if (!silent) showSuccess(`已载入任务：${payload.title || taskId}`);
    } catch (err) {
        if (!silent) showError(err.message || "加载第一页保存记录失败");
    }
}

async function selectTaskFromSidebar(taskId, options = {}) {
    workflowState.currentTaskId = String(taskId || "");
    renderTaskSidebar();
    const taskItem = workflowState.tasks.find((item) => String(item.task_id) === workflowState.currentTaskId);
    const taskModule = getTaskModuleFromItem(taskItem);
    if (taskModule === "step3" && typeof loadStep3Draft === "function") {
        await loadStep3Draft(workflowState.currentTaskId, options);
        return;
    }
    if (taskModule === "step2" && typeof loadStep2Draft === "function") {
        await loadStep2Draft(workflowState.currentTaskId, options);
        return;
    }
    await loadStep1Draft(workflowState.currentTaskId, options);
}

function resetDownstreamFromWorldview() {
    workflowState.availableGenres = []; workflowState.selectedGenres = []; workflowState.targetAudience = "";
    workflowState.selectedScenes = []; workflowState.recommendedScenes = [];
    workflowState.environmentResult = null; workflowState.characterResult = null; workflowState.storylineResult = null;
    workflowState.finalFramework = null; workflowState.generatedNovel = null; workflowState.chapterDrafts = [];
    workflowState.selectedDraftChapter = 1; workflowState.autoFollowDraftChapter = true;
    workflowState.writeJobId = ""; workflowState.writeJobStatus = "idle"; workflowState.writeLastNotifiedStatus = "";
    workflowState.selectedCoreScene = ""; workflowState.keptOriginalScene = false;
    workflowState.keptOriginalCharacters = false; workflowState.newCharacterBios = null; workflowState.newOutlineText = "";
    stopWriteJobPolling();
    if (getEl("genre-user-note")) getEl("genre-user-note").value = "";
    // 重置题材区域
    const genreContainer = getEl("genre-selection");
    if (genreContainer) genreContainer.innerHTML = "";
    const placeholder = getEl("genre-placeholder");
    if (placeholder) placeholder.style.display = "block";
    const preview = getEl("selected-genres-preview");
    if (preview) preview.style.display = "none";
    const genreCount = getEl("selected-genre-count");
    if (genreCount) genreCount.textContent = "已选 0 / 1";
    // 重置audience下拉
    const audienceSelect = getEl("audience-select");
    if (audienceSelect) audienceSelect.selectedIndex = 0;
    // 重置skip info
    const skipGenreInfo = getEl("skip-genre-info");
    if (skipGenreInfo) skipGenreInfo.classList.remove("is-visible");
    const skipSceneInfo = getEl("skip-scene-info");
    if (skipSceneInfo) skipSceneInfo.classList.remove("is-visible");
    // 重置场景匹配区域
    const matchedArea = getEl("matched-scenes-area");
    if (matchedArea) matchedArea.style.display = "none";
    updateAdaptationConfirmButton();
}

function hideResultSections() {
    ["environment-candidates-area", "scene-recommendation-card", "character-result-card",
     "storyline-result-card", "framework-result-card", "novel-generation-card",
     "generated-novel-card", "new-outline-result-card"].forEach((id) => {
        const el = getEl(id); if (el) el.style.display = "none";
    });
}

function getCurrentOutlineText() {
    return (getEl("input-outline-text")?.value || workflowState.originalOutlineText || workflowState.splitterResultText || "").trim();
}
function getCurrentFrameworkText() {
    return (getEl("rewrite-framework-text")?.value || workflowState.finalFramework?.final_text || getEl("new-outline-text")?.value || "").trim();
}
function countDraftChars(text) { return String(text || "").replace(/\s+/g, "").length; }

function stopWriteJobPolling() {
    if (workflowState.writePollTimer) { clearInterval(workflowState.writePollTimer); workflowState.writePollTimer = null; }
    workflowState.writePollBusy = false;
}
function getPreferredFollowChapter() {
    const running = workflowState.generatedNovel?.current_chapter;
    if (running) return Number(running);
    const latestCompleted = [...workflowState.chapterDrafts].filter((item) => String(item.text || "").trim()).sort((a, b) => Number(b.chapter) - Number(a.chapter))[0];
    return latestCompleted ? Number(latestCompleted.chapter) : 1;
}
function updateChapterFollowButton() {
    const btn = getEl("chapter-follow-toggle-btn"); if (!btn) return;
    const textEl = btn.querySelector(".btn-text"); if (!textEl) return;
    textEl.textContent = workflowState.autoFollowDraftChapter ? "跟随中" : "跟随";
}
function toggleChapterAutoFollow() {
    workflowState.autoFollowDraftChapter = !workflowState.autoFollowDraftChapter;
    if (workflowState.autoFollowDraftChapter) {
        workflowState.selectedDraftChapter = getPreferredFollowChapter();
        renderChapterDraftList(); renderChapterEditor();
        showSuccess("已恢复跟随当前生成章节");
    } else { showSuccess("已锁定当前查看章节，后续生成不会自动跳转"); }
    updateChapterFollowButton();
}
function ensureChapterDrafts(count = 10) {
    const total = Math.max(1, Number(count) || 10);
    if (workflowState.chapterDrafts.length === total) return;
    workflowState.chapterDrafts = Array.from({ length: total }, (_, idx) => {
        const existing = workflowState.chapterDrafts[idx];
        return existing || {
            chapter: idx + 1,
            status: "pending",
            plot: "",
            emotion: "",
            hook: "",
            text: "",
            generatedText: "",
            wordCount: 0,
            edited: false,
            checkpointPath: "",
            summary: {},
            sceneCard: {},
            reference: {},
            savedAt: null,
            savedTextPath: "",
            regenerateCount: 0,
        };
    });
}
function getChapterDraft(chapterNo) { return workflowState.chapterDrafts.find((item) => Number(item.chapter) === Number(chapterNo)) || null; }
function getMergedNovelDraftText() {
    const title = (getEl("generated-novel-title")?.textContent || getEl("novel-title-input")?.value || inferNovelTitle() || "改编新小说").trim();
    const filled = workflowState.chapterDrafts.filter((item) => String(item.text || "").trim());
    if (!filled.length) return "";
    const blocks = filled.map((item) => `第${item.chapter}章\n\n${item.text}`);
    return `${title}\n\n${blocks.join("\n\n" + "─".repeat(20) + "\n\n")}`;
}
function updateMergedNovelPreview() {
    const mergedText = getMergedNovelDraftText();
    if (getEl("generated-novel-text")) getEl("generated-novel-text").value = mergedText;
    const totalWords = workflowState.chapterDrafts.reduce((sum, item) => sum + countDraftChars(item.text || ""), 0);
    if (getEl("generated-novel-word-count")) getEl("generated-novel-word-count").textContent = `${totalWords} 字`;
    if (mergedText) getEl("generated-novel-card").style.display = "block";
}
function renderChapterDraftList() {
    const container = getEl("chapter-draft-list"); if (!container) return; container.innerHTML = "";
    workflowState.chapterDrafts.forEach((item) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "chapter-draft-item";
        if (Number(item.chapter) === Number(workflowState.selectedDraftChapter)) button.classList.add("is-active");
        const statusClass = item.edited ? "is-edited" : item.status === "completed" ? "is-completed" : item.status === "generating" ? "is-generating" : "";
        const statusText = item.edited ? "已修改" : item.status === "completed" ? "已完成" : item.status === "generating" ? "生成中" : "待生成";
        button.innerHTML = `<div class="chapter-draft-item__title">第${item.chapter}章</div><div class="chapter-draft-item__meta">${escapeHTML((item.plot || "尚未开始生成").slice(0, 24))}</div><span class="chapter-draft-item__status ${statusClass}">${statusText}</span>`;
        button.addEventListener("click", () => { workflowState.autoFollowDraftChapter = false; workflowState.selectedDraftChapter = item.chapter; renderChapterDraftList(); renderChapterEditor(); updateChapterFollowButton(); });
        container.appendChild(button);
    });
}
function renderChapterEditor() {
    const draft = getChapterDraft(workflowState.selectedDraftChapter) || workflowState.chapterDrafts[0]; if (!draft) return;
    if (getEl("chapter-editor-title")) getEl("chapter-editor-title").value = `第${draft.chapter}章`;
    if (getEl("chapter-editor-word-count")) getEl("chapter-editor-word-count").value = `${countDraftChars(draft.text || "")} 字`;
    if (getEl("chapter-editor-save-status")) {
        if (draft.savedAt) getEl("chapter-editor-save-status").value = `已保存 · ${new Date(draft.savedAt * 1000).toLocaleTimeString()}`;
        else if (draft.edited) getEl("chapter-editor-save-status").value = "待保存";
        else getEl("chapter-editor-save-status").value = "未保存";
    }
    if (getEl("chapter-editor-text") && getEl("chapter-editor-text") !== document.activeElement) getEl("chapter-editor-text").value = draft.text || "";
    const metaParts = [];
    if (draft.plot) metaParts.push(`剧情：${draft.plot}`); if (draft.emotion) metaParts.push(`情绪：${draft.emotion}`);
    if (draft.hook) metaParts.push(`钩子：${draft.hook}`); if (draft.edited) metaParts.push("当前章节已手动修改");
    if (getEl("chapter-editor-meta")) getEl("chapter-editor-meta").textContent = metaParts.join(" · ") || "生成后可在这里实时查看并修改每章正文";
    renderBlueprintPreview();
    renderChapterReferencePreview();
}

function renderBlueprintPreview() {
    const blueprintView = getEl("novel-blueprint-view");
    const blueprint = workflowState.generatedNovel?.blueprint || workflowState.blueprint || {};
    if (blueprintView) blueprintView.innerHTML = formatBlueprintSummary(blueprint);
}

function pickBlueprintValue(blueprint, keys) {
    for (const key of keys) {
        const value = blueprint && blueprint[key];
        if (Array.isArray(value) && value.length) return value.join("、");
        if (value && typeof value === "object") return JSON.stringify(value, null, 2);
        if (String(value || "").trim()) return String(value).trim();
    }
    return "";
}

function formatBlueprintSummary(blueprint) {
    if (!blueprint || typeof blueprint !== "object" || !Object.keys(blueprint).length) {
        return '<div class="context-empty">蓝图生成后会显示核心冲突、反转和人物动力。</div>';
    }
    const items = [
        ["类型", ["genre", "story_type", "category"]],
        ["主角", ["protagonist", "heroine", "hero"]],
        ["反派", ["antagonist", "villain"]],
        ["核心冲突", ["core_conflict", "conflict"]],
        ["核心反转", ["core_reversal", "reversal"]],
        ["情绪引擎", ["emotional_engine", "emotion_engine"]],
        ["爽点承诺", ["payoff_promise", "reader_payoff", "payoff"]],
        ["章线功能", ["chapter_functions"]],
    ];
    const cards = items.map(([label, keys]) => {
        const value = pickBlueprintValue(blueprint, keys);
        if (!value) return "";
        return `<div class="blueprint-summary-item"><span>${escapeHTML(label)}</span><p>${escapeHTML(value)}</p></div>`;
    }).filter(Boolean);
    return cards.length ? cards.join("") : '<div class="context-empty">当前蓝图暂时没有可摘要展示的字段。</div>';
}

function formatReferencePayload(reference) {
    if (!reference || typeof reference !== "object" || !Object.keys(reference).length) return "";
    const parts = [];
    const perSource = reference.per_source && typeof reference.per_source === "object" ? reference.per_source : {};
    const groupItems = reference.group_items && typeof reference.group_items === "object" ? reference.group_items : {};
    const labels = Array.isArray(reference.query_labels) ? reference.query_labels : [];
    if (labels.length) parts.push(`检索标签：${labels.join(" / ")}`);
    if (reference.groups && typeof reference.groups === "object" && Object.keys(reference.groups).length) {
        parts.push(`检索分组：${Object.keys(reference.groups).join("、")}`);
    }
    const sourceEntries = Object.entries(perSource).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
    if (sourceEntries.length) {
        parts.push("参考来源：");
        sourceEntries.slice(0, 8).forEach(([source, count], idx) => {
            parts.push(`${idx + 1}. ${source}（${count} 条）`);
        });
    }
    const snippets = [];
    Object.entries(groupItems).forEach(([label, items]) => {
        (Array.isArray(items) ? items : []).forEach((item) => {
            if (!item || typeof item !== "object") return;
            snippets.push({
                label,
                source: item.source || item.title || item.book || "",
                text: item.text || item.excerpt || item.chunk_text || item.action_view_text || "",
            });
        });
    });
    if (snippets.length) {
        parts.push("参考片段：");
        snippets.slice(0, 10).forEach((item, idx) => {
            parts.push(`${idx + 1}. ${item.label}${item.source ? `｜${item.source}` : ""}`);
            if (item.text) parts.push(item.text);
        });
    }
    if (!sourceEntries.length && !snippets.length) {
        parts.push("当前章已完成检索，但没有命中可展示的爆款片段。可以检查 RAG 数据库是否已构建，或当前章标签是否过窄。");
    }
    return parts.join("\n\n");
}

function normalizeSceneBeats(sceneCard) {
    const beats = sceneCard?.beats;
    if (!Array.isArray(beats)) return [];
    return beats.map((beat, idx) => {
        if (typeof beat === "string") return { title: `拍点 ${idx + 1}`, text: beat };
        if (!beat || typeof beat !== "object") return { title: `拍点 ${idx + 1}`, text: "" };
        return {
            title: beat.beat_function || beat.beat_type || beat.function || `拍点 ${idx + 1}`,
            text: beat.beat || beat.plot || beat.action || beat.summary || "",
            dialogue: beat.dialogue_trigger || "",
            hook: beat.hook || beat.payoff || beat.consequence || "",
            budget: beat.beat_budget || beat.budget || "",
        };
    });
}

function formatSceneCardView(sceneCard) {
    if (!sceneCard || typeof sceneCard !== "object" || !Object.keys(sceneCard).length) {
        return '<div class="context-empty">场景卡生成后会显示开场、关键拍点和章尾钩子。</div>';
    }
    const opening = sceneCard.opening || sceneCard.scene_opening || sceneCard.start || "";
    const endHook = sceneCard.chapter_end_hook || sceneCard.end_hook || sceneCard.hook || "";
    const beats = normalizeSceneBeats(sceneCard);
    const cards = [];
    if (opening) {
        cards.push(`<div class="scene-card-block scene-card-block--opening"><span>开场切入</span><p>${escapeHTML(opening)}</p></div>`);
    }
    if (beats.length) {
        cards.push(`<div class="scene-beat-list">${beats.map((beat, idx) => `
            <div class="scene-beat-item">
                <div class="scene-beat-index">${idx + 1}</div>
                <div class="scene-beat-body">
                    <strong>${escapeHTML(beat.title || `拍点 ${idx + 1}`)}</strong>
                    ${beat.text ? `<p>${escapeHTML(beat.text)}</p>` : ""}
                    ${beat.dialogue ? `<em>对白触发：${escapeHTML(beat.dialogue)}</em>` : ""}
                    ${beat.hook ? `<em>结果/钩子：${escapeHTML(beat.hook)}</em>` : ""}
                    ${beat.budget ? `<small>${escapeHTML(String(beat.budget))} 字左右</small>` : ""}
                </div>
            </div>
        `).join("")}</div>`);
    }
    if (endHook) {
        cards.push(`<div class="scene-card-block scene-card-block--hook"><span>章尾钩子</span><p>${escapeHTML(endHook)}</p></div>`);
    }
    if (!cards.length) {
        cards.push(`<details class="context-raw-json"><summary>查看原始场景卡</summary><pre>${escapeHTML(JSON.stringify(sceneCard, null, 2))}</pre></details>`);
    }
    return cards.join("");
}

function formatReferenceCards(reference) {
    if (!reference || typeof reference !== "object" || !Object.keys(reference).length) {
        return '<div class="context-empty">参考片段会按“对话 / 动作 / 情绪 / 环境 / 钩子”等类型整理显示。</div>';
    }
    const groupItems = reference.group_items && typeof reference.group_items === "object" ? reference.group_items : {};
    const labels = Array.isArray(reference.query_labels) && reference.query_labels.length ? reference.query_labels : Object.keys(groupItems);
    const sections = labels.map((label) => {
        const items = Array.isArray(groupItems[label]) ? groupItems[label] : [];
        if (!items.length) return "";
        const topItems = items.slice(0, 4).map((item, idx) => {
            const text = item?.text || item?.excerpt || item?.chunk_text || item?.action_view_text || "";
            const source = item?.source || item?.title || item?.book || "";
            const meta = [source, item?.semantic_tag || item?.style_tag || "", item?.content_role || ""].filter(Boolean).join(" · ");
            return `
                <article class="reference-card">
                    <div class="reference-card__head">
                        <span>${idx + 1}</span>
                        <strong>${escapeHTML(label)}</strong>
                    </div>
                    ${meta ? `<div class="reference-card__meta">${escapeHTML(meta)}</div>` : ""}
                    <p>${escapeHTML(text || "该条参考暂未返回正文片段。")}</p>
                </article>
            `;
        }).join("");
        return `
            <details class="reference-group" open>
                <summary>${escapeHTML(label)} <span>${items.length} 条</span></summary>
                <div class="reference-group__items">${topItems}</div>
            </details>
        `;
    }).filter(Boolean);
    if (!sections.length) {
        return '<div class="context-empty">当前章已完成检索，但没有命中可展示的爆款片段。可以检查 RAG 数据库是否已构建，或当前章标签是否过窄。</div>';
    }
    return sections.join("");
}

function renderChapterReferencePreview() {
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    const sceneCardView = getEl("chapter-scene-card-view");
    const referenceView = getEl("chapter-reference-view");
    const meta = getEl("chapter-reference-meta");
    if (!draft) {
        if (sceneCardView) sceneCardView.innerHTML = '<div class="context-empty">场景卡生成后会显示在这里。</div>';
        if (referenceView) referenceView.innerHTML = '<div class="context-empty">当前章参考到的爆款小说片段会显示在这里。</div>';
        if (meta) meta.textContent = "生成当前章时检索到的参考片段会显示在这里。";
        return;
    }
    if (sceneCardView) sceneCardView.innerHTML = formatSceneCardView(draft.sceneCard);
    if (referenceView) referenceView.innerHTML = formatReferenceCards(draft.reference);
    if (meta) {
        const groupItems = draft.reference?.group_items && typeof draft.reference.group_items === "object" ? draft.reference.group_items : {};
        const refCount = Object.values(groupItems).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        meta.textContent = refCount ? `当前章已载入 ${refCount} 条参考片段，可边看边修改正文。` : "当前章暂未命中可展示的参考片段。";
    }
}

function setGenerationInfoTab(tabName) {
    const target = String(tabName || "reference");
    document.querySelectorAll(".chapter-context-tab").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.contextTab === target);
    });
    document.querySelectorAll(".chapter-context-pane").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.contextPane === target);
    });
}
function copyCurrentChapterDraft() {
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    if (!draft || !String(draft.text || "").trim()) return showError("当前章节还没有可复制的内容");
    navigator.clipboard.writeText(draft.text || "").then(() => showSuccess(`第${draft.chapter}章已复制到剪贴板`)).catch(() => showError("复制失败"));
}
function applyWriteJobStatus(job) {
    workflowState.writeJobStatus = job.status || "running"; workflowState.generatedNovel = job;
    workflowState.blueprint = job.blueprint || workflowState.blueprint || {};
    workflowState.chapterPlan = job.chapter_plan || workflowState.chapterPlan || [];
    ensureChapterDrafts(job.chapter_count || (job.chapters || []).length || 10);
    (job.chapters || []).forEach((chapterData) => {
        const chapter = getChapterDraft(chapterData.chapter); if (!chapter) return;
        chapter.status = chapterData.status || chapter.status; chapter.plot = chapterData.plot || chapter.plot;
        chapter.emotion = chapterData.emotion || chapter.emotion; chapter.hook = chapterData.hook || chapter.hook;
        chapter.wordCount = Number(chapterData.word_count || chapter.wordCount || 0);
        chapter.checkpointPath = chapterData.checkpoint_path || chapter.checkpointPath || "";
        chapter.summary = chapterData.summary || chapter.summary || {};
        chapter.sceneCard = chapterData.scene_card || chapter.sceneCard || {};
        chapter.reference = chapterData.reference || chapter.reference || {};
        chapter.savedAt = chapterData.saved_at || chapter.savedAt || null;
        chapter.savedTextPath = chapterData.saved_text_path || chapter.savedTextPath || "";
        chapter.regenerateCount = Number(chapterData.regenerate_count || chapter.regenerateCount || 0);
        chapter.edited = Boolean(chapterData.edited || chapter.edited);
        const incomingText = String(chapterData.text || "");
        const generatedText = String(chapterData.generated_text || chapterData.text || "");
        if (generatedText) chapter.generatedText = generatedText;
        if (incomingText) {
            if (!chapter.edited || !String(chapter.text || "").trim()) chapter.text = incomingText;
            else if (chapter.savedTextPath && incomingText === chapter.generatedText) chapter.text = chapter.text;
        }
    });
    if (workflowState.autoFollowDraftChapter) workflowState.selectedDraftChapter = getPreferredFollowChapter();
    else if (!getChapterDraft(workflowState.selectedDraftChapter)?.text) {
        const firstCompleted = workflowState.chapterDrafts.find((item) => String(item.text || "").trim());
        if (firstCompleted) workflowState.selectedDraftChapter = firstCompleted.chapter;
    }
    getEl("novel-generation-card").style.display = "block";
    if (getEl("novel-job-status")) getEl("novel-job-status").textContent = job.current_stage || job.status || "进行中";
    if (getEl("novel-job-progress")) getEl("novel-job-progress").textContent = `${job.completed_chapters || 0} / ${job.chapter_count || workflowState.chapterDrafts.length}`;
    if (getEl("novel-job-current-chapter")) getEl("novel-job-current-chapter").textContent = job.current_chapter ? `第 ${job.current_chapter} 章` : "—";
    if (getEl("generated-novel-title")) getEl("generated-novel-title").textContent = job.title || inferNovelTitle();
    if (getEl("generated-novel-output-path")) getEl("generated-novel-output-path").textContent = job.output_path || "生成中";
    renderChapterDraftList(); renderChapterEditor(); updateChapterFollowButton(); updateMergedNovelPreview();
    if (job.status === "completed" && workflowState.writeLastNotifiedStatus !== "completed") { workflowState.writeLastNotifiedStatus = "completed"; showSuccess("整本小说已逐章生成完成"); }
    else if (job.status === "error" && workflowState.writeLastNotifiedStatus !== "error") { workflowState.writeLastNotifiedStatus = "error"; showError(job.error || "正文生成失败"); }
}
async function pollWriteJobStatus(jobId) {
    if (!jobId || workflowState.writePollBusy) return; workflowState.writePollBusy = true;
    try {
        const res = await fetch(API_BASE + appendUserQuery(`/api/pipeline/write/status/${jobId}`)); const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "获取正文生成状态失败");
        applyWriteJobStatus(data);
        if (data.status === "completed" || data.status === "error") stopWriteJobPolling();
    } catch (err) { stopWriteJobPolling(); showError(err.message || "获取正文生成状态失败"); }
    finally { workflowState.writePollBusy = false; }
}
function startWriteJobPolling(jobId) { stopWriteJobPolling(); workflowState.writeJobId = jobId; pollWriteJobStatus(jobId); workflowState.writePollTimer = setInterval(() => pollWriteJobStatus(jobId), 1800); }

function syncRewriteFrameworkInput() {
    const rewriteInput = getEl("rewrite-framework-text"); if (!rewriteInput) return;
    const currentText = rewriteInput.value.trim();
    const sourceText = (workflowState.finalFramework?.final_text || workflowState.newOutlineText || getEl("new-outline-text")?.value || "").trim();
    if (!currentText && sourceText) rewriteInput.value = sourceText;
}
function useCurrentFrameworkForWriting() {
    const sourceText = (workflowState.finalFramework?.final_text || workflowState.newOutlineText || getEl("new-outline-text")?.value || "").trim();
    if (!sourceText) return showError("当前工作流里还没有可带入的最终框架");
    getEl("rewrite-framework-text").value = sourceText;
    workflowState.finalFramework = workflowState.finalFramework || {};
    workflowState.finalFramework.final_text = sourceText;
    if (getEl("novel-title-input") && !getEl("novel-title-input").value.trim()) getEl("novel-title-input").value = inferNovelTitle();
    showSuccess("已带入当前内容，可以直接生成正文");
}

// ========================================
// 模块入口 & 步骤切换
// ========================================
// 新步骤映射: 1=拆解, 2=拆解输入, 3=人物关系(跳过), 4=合并设定页, 5=人物替换, 6=新大纲, 7=AI重写

function enterModule(module) {
    if (module === "split") { switchToStep(1); getEl("raw-novel-text")?.focus(); showSuccess("已进入 AI拆解模块"); return; }
    if (module === "adapt") {
        if (workflowState.outlineAnalysis || workflowState.relationshipData) {
            const lastStep = workflowState.currentStep;
            if (lastStep >= 4 && lastStep <= 6) switchToStep(lastStep);
            else switchToStep(4);
            showSuccess("已回到 AI改编模块，继续当前进度");
        } else { switchToStep(2); getEl("input-outline-text")?.focus(); showSuccess("已进入 AI改编模块，请粘贴或上传拆解稿"); }
        return;
    }
    if (module === "write") {
        syncRewriteFrameworkInput(); switchToStep(7); getEl("rewrite-framework-text")?.focus();
        if (getCurrentFrameworkText()) showSuccess("已进入 AI重写模块，可以直接生成正文");
        else showSuccess("已进入 AI重写模块，请先粘贴或上传最终框架");
    }
}

function getProgressStepForStage(step) {
    if (step <= 1) return 1;
    if (step <= 6) return 2;
    return 3;
}

function updateAdaptationSubsteps(step) {
    const container = getEl("adaptation-substeps");
    if (container) {
        const isAdaptationStage = step >= 2 && step <= 6;
        container.classList.toggle("is-visible", isAdaptationStage);
        container.classList.toggle("is-muted", !isAdaptationStage);
    }
    document.querySelectorAll(".progress-substep").forEach((node) => {
        const stage = Number(node.dataset.stage);
        node.classList.remove("is-active", "is-done");
        if (step >= 7) { node.classList.add("is-done"); return; }
        if (step > stage) node.classList.add("is-done");
        else if (step === stage) node.classList.add("is-active");
    });
}

function switchToStep(step) {
    workflowState.currentStep = step;
    const progressStep = getProgressStepForStage(step);
    document.querySelectorAll(".progress-step").forEach((node) => {
        const n = Number(node.dataset.step);
        node.classList.remove("is-active", "is-done");
        if (n < progressStep) node.classList.add("is-done");
        else if (n === progressStep) node.classList.add("is-active");
    });
    updateAdaptationSubsteps(step);
    if (step === 7) syncRewriteFrameworkInput();
    for (let i = 1; i <= TOTAL_STEPS; i += 1) {
        const el = getEl(`stage-${i}`);
        if (el) el.style.display = i === step ? "block" : "none";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistoryReferencePanel() {
    const panel = getEl("history-reference-panel");
    const toggle = getEl("history-reference-toggle");
    if (!panel || !toggle) return;
    const expanded = Boolean(workflowState.isHistoryReferenceExpanded);
    panel.style.display = expanded ? "block" : "none";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.classList.toggle("is-active", expanded);
}

function renderHistoryReferenceStatus() {
    const dateEl = getEl("history-reference-current-date");
    const bookEl = getEl("history-reference-current-book");
    const autoStatusEl = getEl("history-reference-auto-status");
    if (dateEl) dateEl.textContent = workflowState.selectedHistoricalDate || "未选择";
    if (bookEl) bookEl.textContent = workflowState.historicalReferenceDetail?.title || "未选择";
    if (autoStatusEl) {
        if (workflowState.historicalReferenceDates.length) {
            autoStatusEl.textContent = "当前展示的是已落盘的历史爆款参考数据。";
        } else {
            autoStatusEl.textContent = "近一周暂无可用的历史爆款参考数据。";
        }
    }
}

function toggleHistoryReferencePanel() {
    workflowState.isHistoryReferenceExpanded = !workflowState.isHistoryReferenceExpanded;
    renderHistoryReferencePanel();
}

function closeHistoryReferencePanel() {
    if (!workflowState.isHistoryReferenceExpanded) return;
    workflowState.isHistoryReferenceExpanded = false;
    renderHistoryReferencePanel();
}

function renderHistoryReferenceDates() {
    const container = getEl("history-reference-dates");
    if (!container) return;
    const dates = workflowState.historicalReferenceDates || [];
    if (!dates.length) {
        container.innerHTML = '<div class="history-reference-empty">近一周暂无可用历史爆款参考</div>';
        renderHistoryReferenceStatus();
        return;
    }
    container.innerHTML = dates.map((item) => `
        <button
            type="button"
            class="history-reference-item ${workflowState.selectedHistoricalDate === item.date ? "is-active" : ""}"
            onclick="selectHistoricalDate('${escapeHTML(item.date)}')"
        >
            <span class="history-reference-item__title">${escapeHTML(item.date)}</span>
            <span class="history-reference-item__meta">${escapeHTML(item.available_count + " 本")}${item.is_priority ? " · 前一日" : ""}</span>
        </button>
    `).join("");
}

function renderHistoryReferenceBooks() {
    const container = getEl("history-reference-books");
    if (!container) return;
    const books = workflowState.historicalReferenceBooks || [];
    if (!workflowState.selectedHistoricalDate) {
        container.innerHTML = '<div class="history-reference-empty">请先选择日期</div>';
        renderHistoryReferenceStatus();
        return;
    }
    if (!books.length) {
        container.innerHTML = '<div class="history-reference-empty">该日期暂无已拆解完成的历史爆款</div>';
        renderHistoryReferenceStatus();
        return;
    }
    container.innerHTML = books.map((item) => `
        <button
            type="button"
            class="history-reference-item ${workflowState.selectedHistoricalBookId === item.book_id ? "is-active" : ""}"
            onclick="selectHistoricalBook('${escapeHTML(item.book_id)}')"
        >
            <span class="history-reference-item__title">TOP${escapeHTML(String(item.rank))} · ${escapeHTML(item.title)}</span>
            <span class="history-reference-item__meta">书籍ID：${escapeHTML(item.book_id)}</span>
        </button>
    `).join("");
}

function renderHistoryReferenceDetail() {
    const preview = getEl("history-reference-preview");
    const fillBtn = getEl("history-reference-fill-btn");
    const goBtn = getEl("history-reference-go-step2-btn");
    const detail = workflowState.historicalReferenceDetail;
    if (!preview || !fillBtn || !goBtn) return;
    if (!detail || !detail.split_result) {
        preview.value = "";
        fillBtn.disabled = true;
        goBtn.disabled = true;
        renderHistoryReferenceStatus();
        return;
    }
    preview.value = detail.split_result;
    fillBtn.disabled = false;
    goBtn.disabled = false;
    renderHistoryReferenceStatus();
}

async function loadHistoricalReferenceDates(options = {}) {
    const { preserveSelection = true, silent = false } = options;
    const previousDate = preserveSelection ? workflowState.selectedHistoricalDate : "";
    const previousBookId = preserveSelection ? workflowState.selectedHistoricalBookId : "";
    try {
        const res = await fetch(API_BASE + appendUserQuery('/api/history_reference/dates?max_days=7'));
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "加载日期失败");
        workflowState.historicalReferenceDates = data.dates || [];
        renderHistoryReferenceDates();
        if (workflowState.historicalReferenceDates.length) {
            const targetDate = workflowState.historicalReferenceDates.some((item) => item.date === previousDate)
                ? previousDate
                : workflowState.historicalReferenceDates[0].date;
            await selectHistoricalDate(targetDate, { preferredBookId: previousBookId, silent: true });
        } else {
            workflowState.selectedHistoricalDate = "";
            workflowState.selectedHistoricalBookId = "";
            workflowState.historicalReferenceDetail = null;
            renderHistoryReferenceBooks();
            renderHistoryReferenceDetail();
        }
    } catch (err) {
        if (!silent) showError(err.message || "历史爆款参考加载失败");
    }
}

async function selectHistoricalDate(dateText, options = {}) {
    const { preferredBookId = "", silent = false } = options;
    workflowState.selectedHistoricalDate = dateText;
    workflowState.selectedHistoricalBookId = "";
    workflowState.historicalReferenceBooks = [];
    workflowState.historicalReferenceDetail = null;
    renderHistoryReferenceDates();
    renderHistoryReferenceBooks();
    renderHistoryReferenceDetail();
    try {
        const res = await fetch(API_BASE + appendUserQuery(`/api/history_reference/books?date=${encodeURIComponent(dateText)}`));
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "加载书单失败");
        workflowState.historicalReferenceBooks = data.books || [];
        renderHistoryReferenceBooks();
        if (workflowState.historicalReferenceBooks.length) {
            const targetBookId = workflowState.historicalReferenceBooks.some((item) => item.book_id === preferredBookId)
                ? preferredBookId
                : workflowState.historicalReferenceBooks[0].book_id;
            await selectHistoricalBook(targetBookId, { silent: true });
        }
    } catch (err) {
        if (!silent) showError(err.message || "加载历史爆款书单失败");
    }
}

async function selectHistoricalBook(bookId, options = {}) {
    const { silent = false } = options;
    workflowState.selectedHistoricalBookId = bookId;
    workflowState.historicalReferenceDetail = null;
    renderHistoryReferenceBooks();
    renderHistoryReferenceDetail();
    try {
        const dateText = workflowState.selectedHistoricalDate;
        const res = await fetch(API_BASE + appendUserQuery(`/api/history_reference/detail?date=${encodeURIComponent(dateText)}&book_id=${encodeURIComponent(bookId)}`));
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "加载详情失败");
        workflowState.historicalReferenceDetail = data;
        renderHistoryReferenceDetail();
    } catch (err) {
        if (!silent) showError(err.message || "加载历史爆款详情失败");
    }
}

function fillHistoricalReferenceToStep2() {
    const detail = workflowState.historicalReferenceDetail;
    if (!detail?.split_result) return showError("请先选择一份历史爆款拆解框架");
    getEl("input-outline-text").value = detail.split_result;
    workflowState.originalOutlineText = detail.split_result;
    showSuccess(`已填入《${detail.title || "历史爆款"}》的拆解框架`);
}

function goToStep2WithHistoricalReference() {
    fillHistoricalReferenceToStep2();
    switchToStep(2);
    getEl("input-outline-text")?.focus();
}

function hideRelationshipResult() {
    const card = getEl("step1-relationship-card");
    if (card) card.style.display = "none";
    if (graphChart) {
        graphChart.dispose();
        graphChart = null;
    }
}

function renderRelationshipResult(data) {
    const characters = data.characters || [];
    const relationships = data.relationships || [];
    const groups = new Set(characters.map((c) => c.group || "未分组"));
    getEl("stat-characters").textContent = characters.length;
    getEl("stat-relations").textContent = relationships.length;
    getEl("stat-groups").textContent = groups.size;
    getEl("relationship-summary-text").textContent = data.relationship_summary || "";
    getEl("step1-relationship-card").style.display = "block";
    if (graphChart) {
        graphChart.dispose();
        graphChart = null;
    }
    graphChart = renderRelationshipGraph("graph-chart", data);
}

// ========================================
// 元数据
// ========================================
async function loadWorkflowMetadata() {
    try { const res = await fetch(API_BASE + appendUserQuery("/api/workflow/metadata")); workflowState.metadata = await res.json(); }
    catch { workflowState.metadata = { loaded: false, worldviews: ["现代", "年代", "古代", "未来", "玄幻"], worldview_genre_mapping: {}, worldview_scene_mapping: {}, all_scenes: [], scene_library: [] }; }
}

// ========================================
// 上传
// ========================================
function initFileUpload() {
    function bindFileInput(inputId, targetId) {
        const fileInput = getEl(inputId); if (!fileInput) return;
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { const target = getEl(targetId); if (target) target.value = ev.target.result; showSuccess(`已加载文件：${file.name}`); };
            reader.readAsText(file);
        });
    }
    bindFileInput("upload-raw-file", "raw-novel-text");
    bindFileInput("upload-txt-file", "input-outline-text");
    bindFileInput("upload-framework-file", "rewrite-framework-text");
}
