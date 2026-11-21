// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// 文辞AI - 前端主逻辑（合并改编设定页版本）
// ========================================

// API 基地址：部署环境优先同域；若被看板壳误载到 manager 域，强制回到文辞AI服务域。
const API_BASE = (() => {
    const host = window.location.hostname;
    if (host === "manager.example.com") return "https://wenci.example.com";
    if (
        window.location.protocol === "file:" ||
        (["localhost", "127.0.0.1"].includes(host) && window.location.port && window.location.port !== "5002")
    ) {
        return "http://127.0.0.1:5002";
    }
    return "";
})();
const SIDEBAR_WIDTH_STORAGE_KEY = "wenciai_task_sidebar_width";
const TASK_TREE_COLLAPSED_STORAGE_KEY = "wenciai_task_tree_collapsed";

// 从当前页面 URL 提取看板注入的用户信息，确保后续 AJAX 请求都带上身份
const _CURRENT_URL_PARAMS = new URLSearchParams(window.location.search);
const _USER_ID = _CURRENT_URL_PARAMS.get("user_id");
const _USER_NICKNAME = _CURRENT_URL_PARAMS.get("nickname");
function appendUserQuery(url) {
    const userId = _USER_ID || (isLocalDebugAuthBypass() ? "999" : "");
    const nickname = _USER_NICKNAME || (isLocalDebugAuthBypass() ? "LocalDev" : "");
    if (!userId) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}user_id=${encodeURIComponent(userId)}&nickname=${encodeURIComponent(nickname)}`;
}
const SIDEBAR_COLLAPSED_STORAGE_KEY = "wenciai_task_sidebar_collapsed";
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 248;

const TOTAL_STEPS = 9;
const TOTAL_PROGRESS_STEPS = 4;
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
    taskTreeCollapsed: {},
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
    adaptationRequirement: "",
    selectedScenes: [],
    recommendedScenes: [],
    matchedScenes: [],
    environmentResult: null,
    characterResult: null,
    storylineResult: null,
    finalFramework: null,
    generatedNovel: null,
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
    selectedHistoricalSource: "weekly_hot",
    selectedHistoricalDate: "",
    selectedHistoricalBookId: "",
    currentInputMode: "raw_text",
    reverseIntro: {
        introText: "",
        contract: null,
        plan: null,
        frameworkText: "",
    },
};

const HISTORY_REFERENCE_SOURCES = [
    {
        key: "weekly_hot",
        label: "近7日爆款书籍",
        shortLabel: "近7日爆款",
        title: "历史爆款参考",
        badge: "近7天",
        summary: "从近一周上榜次数=1且已拆解完成的历史爆款中选取参考样本，完成查看、对比和一键带入。",
        dateLabel: "近一周日期",
        bookLabel: "当天爆款书",
        emptyDates: "近7日暂无可用历史爆款参考",
        emptyBooks: "该日期暂无已拆解完成的历史爆款",
        statusWithData: "当前展示的是已落盘的近7日爆款参考数据。",
        statusEmpty: "近7日暂无可用的历史爆款参考数据。",
        previewPlaceholder: "请选择日期和历史爆款书名，系统会自动展示已拆解好的框架...",
    },
    {
        key: "hourly_top",
        label: "今日小时Top书籍",
        shortLabel: "今日小时Top",
        title: "小时Top参考",
        badge: "今日小时Top",
        summary: "从天芷「书籍小时top-汇总」同步的小时榜书籍中，选取已拆解完成的样本，供拆解框架查看和一键带入。",
        dateLabel: "小时榜日期",
        bookLabel: "小时Top书籍",
        emptyDates: "今日暂无已拆解完成的小时Top参考",
        emptyBooks: "该日期暂无已拆解完成的小时Top书籍",
        statusWithData: "当前展示的是今日小时Top中已落盘的拆解框架。",
        statusEmpty: "今日暂无可用的小时Top拆解框架。",
        previewPlaceholder: "请选择小时Top书籍，系统会展示该书已拆解好的框架...",
    },
];

function normaliseHistoryReferenceSource(source) {
    const key = String(source || "").trim().replace(/-/g, "_");
    return HISTORY_REFERENCE_SOURCES.some((item) => item.key === key) ? key : "weekly_hot";
}

function getHistoryReferenceSourceConfig(source = workflowState.selectedHistoricalSource) {
    const key = normaliseHistoryReferenceSource(source);
    return HISTORY_REFERENCE_SOURCES.find((item) => item.key === key) || HISTORY_REFERENCE_SOURCES[0];
}

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

async function parseJSONResponse(res, fallbackMessage = "请求失败") {
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        const hint = text.trim().startsWith("<")
            ? "接口返回了 HTML 页面，通常是后端接口报错或代理没有命中。"
            : "接口返回了非 JSON 内容。";
        throw new Error(`${hint} HTTP ${res.status}`);
    }
    if (!res.ok || data.error) throw new Error(data.error || fallbackMessage);
    return data;
}

function buildNetworkErrorMessage(error) {
    const raw = String(error?.message || error || "").trim();
    const localHint = "无法连接本地后端，请先启动 http://127.0.0.1:5002（当前页面是本地静态文件，接口调用依赖后端在线）";
    const isNetworkFailure = error instanceof TypeError ||
        /Failed to fetch|Load failed|NetworkError|fetch/i.test(raw);
    if (isNetworkFailure && (window.location.protocol === "file:" || isLocalDebugAuthBypass())) {
        return localHint;
    }
    return raw || "网络请求失败，请稍后重试";
}

async function fetchJSON(url) {
    try {
        const res = await fetch(API_BASE + appendUserQuery(url), { credentials: "include" });
        return parseJSONResponse(res);
    } catch (error) {
        throw new Error(buildNetworkErrorMessage(error));
    }
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

function setTextareaBusy(textareaId, message = "AI 正在处理中...") {
    const textarea = getEl(textareaId);
    if (!textarea) return;
    const host = textarea.closest(".textarea-wrapper") || textarea.parentElement;
    if (!host) return;
    host.classList.add("is-textarea-busy");
    textarea.dataset.previousReadonly = textarea.readOnly ? "1" : "0";
    textarea.readOnly = true;

    let overlay = host.querySelector(".textarea-busy-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "textarea-busy-overlay";
        host.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="textarea-busy-card">
            <div class="textarea-busy-title">${escapeHTML(message)}</div>
            <div class="textarea-busy-bar"><span></span></div>
            <div class="textarea-busy-note">当前文本框已锁定，处理完成后会自动解锁。</div>
        </div>
    `;
}

function clearTextareaBusy(textareaId) {
    const textarea = getEl(textareaId);
    if (!textarea) return;
    const host = textarea.closest(".textarea-wrapper") || textarea.parentElement;
    if (host) {
        host.classList.remove("is-textarea-busy");
        const overlay = host.querySelector(".textarea-busy-overlay");
        if (overlay) overlay.remove();
    }
    textarea.readOnly = textarea.dataset.previousReadonly === "1";
    delete textarea.dataset.previousReadonly;
}

// ========================================
// OAuth 登录状态管理
// ========================================
const OAUTH_CONFIG = {
    authorizeUrl: '',       // 从后端获取，或手动构造
    checkInterval: null,
    currentUser: null,
};

function isLocalDebugAuthBypass() {
    return window.location.protocol === "file:" ||
        ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getLocalDebugUser() {
    return {
        user_id: _USER_ID || "999",
        nickname: _USER_NICKNAME || "LocalDev",
        roles: ["local"],
        source: "local_debug",
    };
}

async function checkAuthStatus() {
    if (isLocalDebugAuthBypass()) {
        const user = getLocalDebugUser();
        OAUTH_CONFIG.currentUser = user;
        renderUserInfo(user);
        return { logged_in: true, user, oauth_enabled: false, local_debug: true };
    }
    try {
        const res = await fetch(API_BASE + appendUserQuery('/auth/status'), { credentials: 'include' });
        const data = await parseJSONResponse(res, "获取登录状态失败");
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
        const kanbanBase = 'https://manager.example.com';
        const clientId = 'wenci';
        const isFilePage = window.location.protocol === "file:";
        const localBackendOrigin = API_BASE || "http://127.0.0.1:5002";
        const callbackOrigin = isFilePage ? localBackendOrigin : window.location.origin;
        const redirectUri = encodeURIComponent(`${callbackOrigin}/auth/callback`);
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
    if (isLocalDebugAuthBypass()) return;
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
    if (event.origin !== 'https://manager.example.com') return;
    if (event.data === 'logout') {
        handleLogout();
    }
});

async function postJSON(url, payload) {
    try {
        const res = await fetch(API_BASE + appendUserQuery(url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
        });
        // 处理 401 未登录
        if (res.status === 401) {
            const data = await parseJSONResponse(res, "未登录").catch(() => ({}));
            if (data.login_required && data.authorize_url) {
                showError("登录已过期，正在跳转到看板登录...");
                setTimeout(() => redirectToOAuthLogin(data.authorize_url), 1500);
                throw new Error("需要登录");
            }
            throw new Error(data.error || "未登录");
        }
        return parseJSONResponse(res);
    } catch (error) {
        throw new Error(buildNetworkErrorMessage(error));
    }
}

// 包装 fetch GET 请求，也处理 401
async function apiGet(url) {
    try {
        const res = await fetch(API_BASE + appendUserQuery(url), { credentials: "include" });
        if (res.status === 401) {
            const data = await parseJSONResponse(res, "未登录").catch(() => ({}));
            if (data.login_required && data.authorize_url) {
                showError("登录已过期，正在跳转到看板登录...");
                setTimeout(() => redirectToOAuthLogin(data.authorize_url), 1500);
                throw new Error("需要登录");
            }
            throw new Error(data.error || "未登录");
        }
        return res;
    } catch (error) {
        throw new Error(buildNetworkErrorMessage(error));
    }
}

async function copyTextWithFallback(text) {
    const normalizedText = String(text || "");
    if (!normalizedText) return false;

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(normalizedText);
            return true;
        } catch (_) {
            // 管理后台跨域 iframe 中 Clipboard API 可能被权限策略拒绝，
            // 失败时回退到 document.execCommand("copy")。
        }
    }

    const activeEl = document.activeElement;
    const selection = window.getSelection ? window.getSelection() : null;
    const savedRanges = [];
    if (selection && selection.rangeCount) {
        for (let i = 0; i < selection.rangeCount; i += 1) {
            savedRanges.push(selection.getRangeAt(i));
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = normalizedText;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    let copied = false;
    try {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copied = document.execCommand("copy");
    } catch (_) {
        copied = false;
    } finally {
        document.body.removeChild(textarea);
        if (selection) {
            selection.removeAllRanges();
            savedRanges.forEach((range) => selection.addRange(range));
        }
        if (activeEl && typeof activeEl.focus === "function") {
            activeEl.focus();
        }
    }
    return copied;
}

function copyTextFromTextarea(id) {
    const el = getEl(id); if (!el) return;
    copyTextWithFallback(el.value || "")
        .then((copied) => copied ? showSuccess("已复制到剪贴板") : showError("复制失败，请手动复制"));
}

function escapeHTML(str) { const div = document.createElement("div"); div.textContent = String(str || ""); return div.innerHTML; }

function getTaskModuleSlug(entryStep = "") {
    const normalized = String(entryStep || "").trim().toLowerCase();
    if (["1", "split", "step1"].includes(normalized)) return "split";
    if (["2", "adapt", "step2"].includes(normalized)) return "adapt";
    if (["3", "write", "rewrite", "step3", "step7"].includes(normalized)) return "write";
    if (["4", "intro", "intro-edit", "step4"].includes(normalized)) return "intro";
    if (["reverse_intro", "reverse-intro", "intro-custom"].includes(normalized)) return "reverse_intro";
    return "general";
}

function padDatePart(value) {
    return String(value).padStart(2, "0");
}

function formatTaskTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = padDatePart(date.getMonth() + 1);
    const day = padDatePart(date.getDate());
    const hour = padDatePart(date.getHours());
    const minute = padDatePart(date.getMinutes());
    const second = padDatePart(date.getSeconds());
    return `${year}${month}${day}_${hour}${minute}${second}`;
}

function createShortTaskSuffix() {
    return Math.random().toString(36).slice(2, 4).padEnd(2, "0");
}

function getCurrentTaskUserSlug() {
    const raw = workflowState.currentUser?.user_id || _USER_ID || (isLocalDebugAuthBypass() ? "999" : "local");
    return String(raw || "local").replace(/[^a-zA-Z0-9]/g, "") || "local";
}

function createClientTaskId(entryStep = "general") {
    const moduleSlug = getTaskModuleSlug(entryStep);
    const userId = getCurrentTaskUserSlug();
    return `task_${moduleSlug}_${userId}_${formatTaskTimestamp()}_${createShortTaskSuffix()}`;
}

function showHomeScreen() {
    const page = getEl("workflow-page");
    if (page) page.classList.add("is-home");
    const breadcrumb = getEl("workflow-breadcrumb");
    if (breadcrumb) breadcrumb.textContent = "/ 主界面";
}

function showWorkflowScreen() {
    const page = getEl("workflow-page");
    if (page) page.classList.remove("is-home");
}

function createLocalDebugTaskFromHome(entryStep = "split") {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId(entryStep);
    resetWorkflowForNewTask();
    workflowState.tasks = workflowState.tasks.length ? workflowState.tasks : [{
        task_id: workflowState.currentTaskId,
        task_no: workflowState.currentTaskId,
        title: "本地调试任务",
        current_step: "step1_init",
        current_step_status: "local",
        gmt_modified: "",
        last_summary: "本地调试模式，不依赖服务端创建任务",
        generated_chapters: [],
    }];
    renderTaskSidebar();
    showWorkflowScreen();
    enterModule(entryStep);
}

async function createTaskFromHome(entryStep = "split") {
    if (isLocalDebugAuthBypass()) {
        createLocalDebugTaskFromHome(entryStep);
        return;
    }
    showPageLoading("正在创建任务...");
    try {
        const res = await fetch(API_BASE + appendUserQuery("/api/workflow/task/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                entry_step: entryStep,
                source: "mini_program_home",
            }),
        });
        if (res.status === 404 || res.status === 405) {
            workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId(entryStep);
            resetWorkflowForNewTask();
            renderTaskSidebar();
            showWorkflowScreen();
            enterModule(entryStep);
            showSuccess("已新建本地任务草稿");
            return;
        }
        if (res.status === 401) {
            const authData = await parseJSONResponse(res, "未登录").catch(() => ({}));
            if (authData.login_required && authData.authorize_url) {
                showError("登录已过期，正在跳转到看板登录...");
                setTimeout(() => redirectToOAuthLogin(authData.authorize_url), 1500);
                return;
            }
            throw new Error(authData.error || "未登录");
        }
        const data = await parseJSONResponse(res, "创建任务失败");
        workflowState.currentTaskId = data.task_id || workflowState.currentTaskId || createClientTaskId(entryStep);
        resetWorkflowForNewTask();
        await loadTaskSidebarList();
        showWorkflowScreen();
        enterModule(entryStep);
        showSuccess("已新建任务");
    } catch (err) {
        showError(err.message || "创建任务失败");
    } finally {
        hidePageLoading();
    }
}

function resetWorkflowForNewTask() {
    const nextTaskId = workflowState.currentTaskId;
    resetStep1Workspace();
    workflowState.currentTaskId = nextTaskId;
    resetDownstreamFromWorldview();
    workflowState.selectedWorldview = "";
    workflowState.selectedGenres = [];
    workflowState.targetAudience = "";
    workflowState.finalFramework = null;
    workflowState.generatedNovel = null;
    workflowState.blueprint = {};
    workflowState.chapterPlan = [];
    workflowState.chapterDrafts = [];
    workflowState.introText = "";
    workflowState.reverseIntro = {
        introText: "",
        contract: null,
        plan: null,
        frameworkText: "",
    };
    [
        "rewrite-framework-text", "novel-title-input", "generated-novel-text",
        "new-outline-text", "original-characters-display", "new-character-bios",
        "intro-edit-original", "intro-edit-step2-text", "intro-edit-step3-text",
        "reverse-intro-input", "reverse-intro-framework",
    ].forEach((id) => {
        const el = getEl(id);
        if (el) el.value = "";
    });
    if (getEl("reverse-intro-status")) getEl("reverse-intro-status").textContent = "等待输入";
    ["novel-generation-card", "generated-novel-card"].forEach((id) => {
        const el = getEl(id);
        if (el) el.style.display = "none";
    });
    updateAllTextareaCounters();
}

function clampSidebarWidth(value) {
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Number(value) || SIDEBAR_DEFAULT_WIDTH));
}

function loadSidebarPreference() {
    try {
        const savedTreeCollapsed = JSON.parse(localStorage.getItem(TASK_TREE_COLLAPSED_STORAGE_KEY) || "{}");
        workflowState.sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
        workflowState.sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
        workflowState.taskTreeCollapsed = savedTreeCollapsed && typeof savedTreeCollapsed === "object" ? savedTreeCollapsed : {};
    } catch {
        workflowState.sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
        workflowState.sidebarCollapsed = false;
        workflowState.taskTreeCollapsed = {};
    }
}

function persistSidebarPreference() {
    try {
        localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, workflowState.sidebarCollapsed ? "1" : "0");
        localStorage.setItem(TASK_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify(workflowState.taskTreeCollapsed || {}));
    } catch {
        // ignore storage failures
    }
}

function applySidebarLayout() {
    const shell = document.querySelector(".workflow-shell");
    const page = getEl("workflow-page");
    const icon = getEl("task-sidebar-toggle-icon");
    const toggleBtn = getEl("task-sidebar-toggle");
    const restoreBtn = getEl("task-sidebar-restore");
    if (!shell) return;
    const effectiveSidebarWidth = workflowState.sidebarCollapsed ? 0 : SIDEBAR_DEFAULT_WIDTH;
    const effectiveDividerWidth = workflowState.sidebarCollapsed ? 0 : 18;
    shell.style.setProperty("--sidebar-width", `${effectiveSidebarWidth}px`);
    shell.style.setProperty("--sidebar-divider-width", `${effectiveDividerWidth}px`);
    shell.classList.toggle("is-sidebar-collapsed", !!workflowState.sidebarCollapsed);
    shell.classList.toggle("is-sidebar-dragging", !!workflowState.sidebarDragging);
    if (page) page.classList.toggle("is-sidebar-collapsed", !!workflowState.sidebarCollapsed);
    if (icon) icon.textContent = workflowState.sidebarCollapsed ? "›" : "‹";
    if (toggleBtn) {
        const label = workflowState.sidebarCollapsed ? "展开任务文件栏" : "收起任务文件栏";
        toggleBtn.setAttribute("aria-label", label);
        toggleBtn.setAttribute("title", label);
    }
    if (restoreBtn) {
        restoreBtn.hidden = !workflowState.sidebarCollapsed;
        restoreBtn.setAttribute("aria-hidden", workflowState.sidebarCollapsed ? "false" : "true");
    }
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

function toggleTaskTreeFromSidebar(taskId) {
    const normalizedTaskId = String(taskId || "");
    if (!normalizedTaskId) return;
    const taskItem = workflowState.tasks.find((item) => String(item.task_id || "") === normalizedTaskId);
    const chapters = Array.isArray(taskItem?.generated_chapters) ? taskItem.generated_chapters : [];
    if (chapters.length) {
        workflowState.taskTreeCollapsed[normalizedTaskId] = !workflowState.taskTreeCollapsed[normalizedTaskId];
        persistSidebarPreference();
        renderTaskSidebar();
    }
    if (workflowState.currentTaskId !== normalizedTaskId) {
        selectTaskFromSidebar(normalizedTaskId, { silent: true });
    }
}

async function deleteTaskFromSidebar(taskId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const normalizedTaskId = String(taskId || "");
    if (!normalizedTaskId) return;
    const taskItem = workflowState.tasks.find((item) => String(item.task_id || "") === normalizedTaskId);
    const title = taskItem?.title || normalizedTaskId;
    if (!window.confirm(`确认删除任务「${title}」吗？\n\n线上会同步删除数据库中的任务及各步骤草稿、章节正文记录，删除后不可恢复。`)) return;
    try {
        await postJSON("/api/workflow/task/delete", { task_id: normalizedTaskId });
        delete workflowState.taskTreeCollapsed[normalizedTaskId];
        workflowState.tasks = workflowState.tasks.filter((item) => String(item.task_id || "") !== normalizedTaskId);
        if (String(workflowState.currentTaskId || "") === normalizedTaskId) {
            workflowState.currentTaskId = "";
            resetWorkflowForNewTask();
            showHomeScreen();
        }
        await loadTaskSidebarList({ autoSelectLatest: false, silent: true });
        renderTaskSidebar();
        showSuccess("任务已删除");
    } catch (err) {
        showError(err.message || "删除任务失败");
    }
}

function applyEditorAssistLayout() {
    const shell = document.querySelector(".workflow-shell");
    const toggle = getEl("editor-assist-toggle");
    if (!shell) return;
    const shouldShowAssist = Number(workflowState.currentStep) === 7;
    shell.classList.toggle("is-editor-assist-hidden", !shouldShowAssist);
    shell.classList.toggle("is-editor-assist-collapsed", !!workflowState.editorAssistCollapsed);
    if (toggle) toggle.textContent = workflowState.editorAssistCollapsed ? "‹" : "›";
}

function toggleEditorAssistCollapse() {
    workflowState.editorAssistCollapsed = !workflowState.editorAssistCollapsed;
    applyEditorAssistLayout();
}

function toggleEditorPanelTab(tabName) {
    const normalized = tabName || "references";
    workflowState.editorAssistCollapsed = false;
    applyEditorAssistLayout();
    document.querySelectorAll("[data-editor-tab]").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.editorTab === normalized);
    });
    document.querySelectorAll("[data-editor-panel]").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.editorPanel === normalized);
    });
}

function getVisibleEditor() {
    const selectors = [
        "#raw-novel-text",
        "#input-outline-text",
        "#new-character-bios",
        "#new-outline-text",
        "#rewrite-framework-text",
        "#chapter-editor-text",
        "#generated-novel-text",
        "#intro-edit-source",
        "#intro-edit-step3-text",
    ];
    return selectors
        .map((selector) => document.querySelector(selector))
        .find((el) => el && el.offsetParent !== null);
}

function focusPrimaryEditor() {
    const editor = getVisibleEditor();
    if (!editor) return showError("当前步骤没有可聚焦的编辑区");
    editor.focus();
    if (typeof editor.setSelectionRange === "function") {
        const len = String(editor.value || "").length;
        editor.setSelectionRange(len, len);
    }
    showSuccess("已聚焦当前编辑区");
}

function copyActiveEditorText() {
    const editor = getVisibleEditor();
    const text = editor?.value || "";
    if (!text.trim()) return showError("当前编辑区还没有内容可复制");
    copyTextWithFallback(text).then(
        (copied) => copied ? showSuccess("已复制当前编辑区内容") : showError("复制失败，请手动复制")
    );
}

function updateEditorWorkbenchMode(step) {
    const modeEl = getEl("editor-current-mode");
    if (!modeEl) return;
    modeEl.textContent = "";
    modeEl.style.display = "none";
}

function initTaskSidebarInteractions() {
    loadSidebarPreference();
    applySidebarLayout();
    applyEditorAssistLayout();
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
    workflowState.selectedHistoricalSource = "weekly_hot";
    workflowState.selectedHistoricalDate = "";
    workflowState.selectedHistoricalBookId = "";
    workflowState.historicalReferenceDetail = null;
    if (getEl("raw-novel-text")) getEl("raw-novel-text").value = "";
    if (getEl("input-outline-text")) getEl("input-outline-text").value = "";
    renderHistoryReferenceSources();
    renderHistoryReferenceDates();
    renderHistoryReferenceBooks();
    renderHistoryReferenceDetail();
    renderHistoryReferenceStatus();
}

function renderTaskSidebar() {
    const userEl = getEl("task-sidebar-user");
    const metaEl = getEl("task-sidebar-meta");
    const listEl = getEl("task-sidebar-list");
    if (!userEl || !metaEl || !listEl) return;
    userEl.textContent = workflowState.currentUser
        ? `${workflowState.currentUser.nickname} · ${workflowState.currentUser.user_id}`
        : "未识别用户";
    metaEl.textContent = workflowState.currentTaskId
        ? `当前：${workflowState.currentTaskId}`
        : "请选择首页入口或新建任务。";
    if (!workflowState.tasks.length) {
        listEl.innerHTML = '<div class="task-sidebar__empty">暂无任务记录。</div>';
        return;
    }
    listEl.innerHTML = workflowState.tasks.map((item, index) => {
        const taskId = String(item.task_id || "");
        const taskLabel = String(item.title || item.task_no || taskId || `任务${index + 1}`).trim();
        const taskTooltip = taskId && taskId !== taskLabel ? `${taskLabel}\n${taskId}` : taskLabel;
        const isActive = taskId === String(workflowState.currentTaskId);
        const chapters = Array.isArray(item.generated_chapters) ? item.generated_chapters : [];
        const isCollapsed = Boolean(workflowState.taskTreeCollapsed?.[taskId]);
        const chapterRows = chapters.length && !isCollapsed ? `
            <div class="task-tree__children">
                ${chapters.map((chapter) => {
                    const chapterNo = Number(chapter.chapter_no || chapter.chapter || 0);
                    const title = getTaskSidebarChapterTitle(chapter, chapterNo);
                    return `
                        <button class="task-tree__chapter" type="button" title="${escapeHTML(title)}" onclick="selectTaskChapterFromSidebar('${escapeHTML(taskId)}', ${chapterNo || 1})">
                            <span class="task-tree__branch">□</span>
                            <span class="task-tree__chapter-title">${escapeHTML(title)}</span>
                        </button>
                    `;
                }).join("")}
            </div>
        ` : "";
        return `
            <div class="task-tree__item ${isActive ? "is-active" : ""} ${isCollapsed ? "is-collapsed" : ""}">
                <div class="task-tree__row">
                    <button
                        class="task-tree__task"
                        type="button"
                        title="${escapeHTML(taskTooltip)}"
                        aria-expanded="${chapters.length ? String(!isCollapsed) : "false"}"
                        onclick="toggleTaskTreeFromSidebar('${escapeHTML(taskId)}')"
                    >
                        <span class="task-tree__caret">${chapters.length ? (isCollapsed ? "▸" : "▾") : "•"}</span>
                        <span class="task-tree__title">任务${index + 1}: ${escapeHTML(taskLabel)}</span>
                    </button>
                    <button
                        class="task-tree__delete"
                        type="button"
                        title="删除任务"
                        aria-label="删除任务 ${escapeHTML(taskLabel)}"
                        onclick="deleteTaskFromSidebar('${escapeHTML(taskId)}', event)"
                    >×</button>
                </div>
                ${chapterRows}
            </div>
        `;
    }).join("");
}

function syncCurrentTaskGeneratedChapters() {
    if (!workflowState.currentTaskId) return;
    const task = workflowState.tasks.find((item) => String(item.task_id) === String(workflowState.currentTaskId));
    if (!task) return;
    const chapters = (workflowState.chapterDrafts || [])
        .filter((item) => String(item.text || item.generatedText || "").trim())
        .map((item) => ({
            chapter_no: Number(item.chapter),
            title: getChapterDisplayTitle(item, Number(item.chapter), `已生成的文本第${Number(item.chapter)}章`),
            sidebar_title: getTaskSidebarChapterTitle(item, Number(item.chapter)),
            plot: getChapterConcretePlot(item, Number(item.chapter)),
            status: item.edited ? "edited" : (item.status || "completed"),
        }));
    task.generated_chapters = chapters;
}

async function loadCurrentUser() {
    if (isLocalDebugAuthBypass()) {
        workflowState.currentUser = getLocalDebugUser();
        renderUserInfo(workflowState.currentUser);
        renderTaskSidebar();
        return;
    }
    workflowState.currentUser = await fetchJSON("/api/me");
    renderTaskSidebar();
}

async function loadTaskSidebarList(options = {}) {
    const { autoSelectLatest = false, silent = false } = options;
    try {
        const data = await fetchJSON("/api/tasks");
        workflowState.tasks = data.items || [];
        renderTaskSidebar();
        if (autoSelectLatest && workflowState.tasks.length) {
            await selectTaskFromSidebar(String(workflowState.tasks[0].task_id), { silent: true });
        }
    } catch (err) {
        workflowState.tasks = [];
        renderTaskSidebar();
        console.warn("任务列表加载失败", err);
        if (!silent) throw err;
    }
}

function getTaskModuleFromItem(item) {
    const entryStep = String(item?.entry_step || "").trim().toLowerCase();
    if (entryStep === "reverse_intro" || entryStep === "reverse-intro") return "reverse_intro";
    if (entryStep === "intro") return "step4";
    if (entryStep === "write") return "step3";
    if (entryStep === "adapt") return "step2";
    const currentStep = String(item?.current_step || "").trim().toLowerCase();
    if (currentStep === "reverse_intro" || currentStep.startsWith("reverse_intro")) return "reverse_intro";
    if (currentStep === "step4" || currentStep.startsWith("step4")) return "step4";
    if (currentStep === "step3" || currentStep.startsWith("step3")) return "step3";
    if (currentStep === "step2" || currentStep.startsWith("step2")) return "step2";
    return "step1";
}

async function startNewTaskDraft() {
    await createTaskFromHome("split");
}

function applyStep1DraftPayload(payload) {
    resetStep2Workspace({ preserveOutlineInput: true });
    workflowState.currentTaskId = String(payload.task_id || workflowState.currentTaskId || "");
    workflowState.currentInputMode = payload.input_mode || "raw_text";
    workflowState.rawNovelText = payload.raw_source_text || "";
    workflowState.splitterResultText = payload.split_result_text || "";
    workflowState.originalOutlineText = payload.outline_source_text || "";
    workflowState.parsedOutline = payload.parsed_outline_json || null;
    workflowState.relationshipData = payload.relationship_data_json || null;
    workflowState.outlineAnalysis = payload.outline_analysis_json || null;
    workflowState.selectedHistoricalSource = normaliseHistoryReferenceSource(payload.reference_meta_json?.source || "");
    workflowState.selectedHistoricalDate = payload.reference_date || "";
    workflowState.selectedHistoricalBookId = payload.reference_book_id || "";
    workflowState.historicalReferenceDetail = payload.reference_title
        ? {
            title: payload.reference_title || "",
            split_result: payload.outline_source_text || payload.split_result_text || "",
            ...(payload.reference_meta_json || {}),
            source: workflowState.selectedHistoricalSource,
        }
        : null;
    if (getEl("raw-novel-text")) getEl("raw-novel-text").value = workflowState.rawNovelText;
    if (getEl("input-outline-text")) getEl("input-outline-text").value = workflowState.originalOutlineText || workflowState.splitterResultText;
    renderHistoryReferenceSources();
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
    showWorkflowScreen();
    const taskItem = workflowState.tasks.find((item) => String(item.task_id) === workflowState.currentTaskId);
    const taskModule = getTaskModuleFromItem(taskItem);
    if (taskModule === "reverse_intro") {
        switchToStep(9);
        return;
    }
    if (taskModule === "step4" && typeof loadStep4Draft === "function") {
        enterIntroEdit();
        await loadStep4Draft(workflowState.currentTaskId, options);
        return;
    }
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

async function selectTaskChapterFromSidebar(taskId, chapterNo) {
    await selectTaskFromSidebar(taskId, { silent: true });
    workflowState.selectedDraftChapter = Number(chapterNo) || 1;
    workflowState.autoFollowDraftChapter = false;
    if (typeof renderChapterDraftList === "function") renderChapterDraftList();
    if (typeof renderChapterEditor === "function") renderChapterEditor();
    if (typeof updateChapterFollowButton === "function") updateChapterFollowButton();
    switchToStep(7);
}

function initTextareaCounters() {
    document.querySelectorAll("textarea").forEach((textarea) => {
        const parent = ensureTextareaEditor(textarea);
        if (textarea.dataset.counterReady === "1") return;
        textarea.dataset.counterReady = "1";
        if (parent) parent.classList.add("textarea-counter-host");
        let counter = textarea.parentElement?.querySelector(":scope > .textarea-counter");
        if (!counter) {
            counter = document.createElement("div");
            counter.className = "textarea-counter";
            counter.setAttribute("aria-hidden", "true");
            const focusBorder = textarea.nextElementSibling?.classList?.contains("textarea-border")
                ? textarea.nextElementSibling
                : null;
            (focusBorder || textarea).insertAdjacentElement("afterend", counter);
        }
        textarea.addEventListener("input", () => {
            updateTextareaCounter(textarea);
            updateTextareaLineNumbers(textarea);
        });
        textarea.addEventListener("paste", () => {
            window.setTimeout(() => {
                updateTextareaCounter(textarea);
                updateTextareaLineNumbers(textarea);
            }, 0);
        });
        textarea.addEventListener("scroll", () => updateTextareaLineNumbers(textarea));
        updateTextareaCounter(textarea);
        updateTextareaLineNumbers(textarea);
    });
}

function initTextareaEditorObserver() {
    if (window.__textareaEditorObserverReady) return;
    window.__textareaEditorObserverReady = true;
    document.addEventListener("paste", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        target.style.lineHeight = "1.5";
        window.setTimeout(() => {
            ensureTextareaEditor(target);
            updateTextareaCounter(target);
            updateTextareaLineNumbers(target);
        }, 0);
    }, true);
    if (!window.MutationObserver) return;
    const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLTextAreaElement) {
                    ensureTextareaEditor(node);
                    shouldUpdate = true;
                    return;
                }
                if (node instanceof HTMLElement && node.querySelector?.("textarea")) {
                    node.querySelectorAll("textarea").forEach((textarea) => ensureTextareaEditor(textarea));
                    shouldUpdate = true;
                }
            });
        });
        if (shouldUpdate) {
            window.requestAnimationFrame(() => initTextareaCounters());
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function ensureTextareaEditor(textarea) {
    if (!textarea) return null;
    textarea.style.lineHeight = "1.5";
    let host = textarea.parentElement;
    if (!host?.classList?.contains("textarea-wrapper")) {
        const wrapper = document.createElement("div");
        wrapper.className = "textarea-wrapper";
        host.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);
        host = wrapper;
    }
    host.classList.add("textarea-line-number-host");
    let lineNumbers = Array.from(host.children).find((node) => node.classList?.contains("textarea-line-numbers"));
    if (!lineNumbers) {
        lineNumbers = document.createElement("div");
        lineNumbers.className = "textarea-line-numbers";
        lineNumbers.setAttribute("aria-hidden", "true");
        host.insertBefore(lineNumbers, textarea);
    }
    if (window.ResizeObserver && textarea.dataset.lineNumberResizeReady !== "1") {
        textarea.dataset.lineNumberResizeReady = "1";
        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(() => updateTextareaLineNumbers(textarea));
        });
        resizeObserver.observe(textarea);
    }
    return host;
}

function updateTextareaLineNumbers(textarea) {
    if (!textarea) return;
    const host = textarea.parentElement;
    const lineNumbers = host ? Array.from(host.children).find((node) => node.classList?.contains("textarea-line-numbers")) : null;
    if (!lineNumbers) return;
    const lineCount = Math.max(1, String(textarea.value || "").split("\n").length);
    const currentCount = Number(lineNumbers.dataset.lineCount || "0");
    if (currentCount !== lineCount) {
        lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, index) => `<span>${index + 1}</span>`).join("");
        lineNumbers.dataset.lineCount = String(lineCount);
    }
    const style = window.getComputedStyle(textarea);
    lineNumbers.style.fontSize = style.fontSize;
    lineNumbers.style.lineHeight = style.lineHeight;
    lineNumbers.style.paddingTop = style.paddingTop;
    lineNumbers.style.paddingBottom = style.paddingBottom;
    lineNumbers.style.height = `${textarea.clientHeight}px`;
    lineNumbers.style.transform = "none";
    lineNumbers.scrollTop = textarea.scrollTop;
}

function updateTextareaCounter(textarea) {
    if (!textarea) return;
    const counter = textarea.parentElement?.querySelector(":scope > .textarea-counter") || null;
    const charCount = countDraftChars(textarea.value || "");
    if (textarea.dataset.counterTarget) {
        const target = getEl(textarea.dataset.counterTarget);
        if (target) target.textContent = `${textarea.readOnly || textarea.disabled ? "只读" : "可编辑"} · ${charCount} 字`;
    }
    if (!counter) return;
    if (textarea.readOnly || textarea.disabled) {
        counter.style.display = "none";
        return;
    }
    counter.style.display = "block";
    counter.textContent = `${charCount} 字`;
}

function updateAllTextareaCounters() {
    document.querySelectorAll("textarea").forEach((textarea) => {
        ensureTextareaEditor(textarea);
        updateTextareaCounter(textarea);
        updateTextareaLineNumbers(textarea);
    });
}

function resetDownstreamFromWorldview() {
    workflowState.availableGenres = []; workflowState.selectedGenres = []; workflowState.targetAudience = "";
    workflowState.selectedScenes = []; workflowState.recommendedScenes = [];
    workflowState.matchedScenes = [];
    workflowState.environmentResult = null; workflowState.characterResult = null; workflowState.storylineResult = null;
    workflowState.finalFramework = null; workflowState.generatedNovel = null; workflowState.chapterDrafts = [];
    workflowState.selectedDraftChapter = 1; workflowState.autoFollowDraftChapter = true;
    workflowState.writeJobId = ""; workflowState.writeJobStatus = "idle"; workflowState.writeLastNotifiedStatus = "";
    workflowState.selectedCoreScene = ""; workflowState.keptOriginalScene = false;
    workflowState.keptOriginalCharacters = false; workflowState.newCharacterBios = null; workflowState.newOutlineText = "";
    workflowState.adaptationRequirement = "";
    stopWriteJobPolling();
    if (getEl("adaptation-user-note")) getEl("adaptation-user-note").value = "";
    // 重置题材区域
    const genreSelect = getEl("genre-select");
    if (genreSelect) {
        genreSelect.innerHTML = '<option value="" disabled selected>请选择题材类型</option>';
        genreSelect.style.display = "none";
    }
    const placeholder = getEl("genre-placeholder");
    if (placeholder) placeholder.style.display = "block";
    const preview = getEl("selected-genres-preview");
    if (preview) preview.style.display = "none";
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
    if (matchedArea) {
        matchedArea.classList.remove("is-visible");
        matchedArea.style.display = "none";
    }
    if (getEl("core-scene-input")) getEl("core-scene-input").value = "";
    updateAdaptationConfirmButton();
}

function resetStep2Workspace(options = {}) {
    const { preserveOutlineInput = false } = options;
    workflowState.selectedWorldview = "";
    workflowState.selectedGenres = [];
    workflowState.targetAudience = "";
    workflowState.selectedCoreScene = "";
    workflowState.matchedScenes = [];
    workflowState.keptOriginalWorldview = false;
    workflowState.keptOriginalGenre = false;
    workflowState.keptOriginalScene = false;
    workflowState.keptOriginalCharacters = false;
    workflowState.newCharacterBios = null;
    workflowState.newOutlineText = "";

    if (!preserveOutlineInput && getEl("input-outline-text")) getEl("input-outline-text").value = "";
    if (getEl("worldview-select")) getEl("worldview-select").selectedIndex = 0;
    if (getEl("audience-select")) getEl("audience-select").selectedIndex = 0;
    if (getEl("genre-select")) {
        getEl("genre-select").innerHTML = '<option value="" disabled selected>请选择题材类型</option>';
        getEl("genre-select").style.display = "none";
    }
    if (getEl("genre-placeholder")) getEl("genre-placeholder").style.display = "block";
    if (getEl("core-scene-input")) getEl("core-scene-input").value = "";
    if (getEl("original-scene-text")) getEl("original-scene-text").textContent = "未知";
    if (getEl("original-characters-display")) getEl("original-characters-display").value = "";
    if (getEl("new-character-bios")) getEl("new-character-bios").value = "";
    if (getEl("new-outline-text")) getEl("new-outline-text").value = "";
    if (getEl("skip-worldview-info")) getEl("skip-worldview-info").classList.remove("is-visible");
    if (getEl("skip-genre-info")) getEl("skip-genre-info").classList.remove("is-visible");
    if (getEl("skip-scene-info")) getEl("skip-scene-info").classList.remove("is-visible");
    if (getEl("skip-character-info")) getEl("skip-character-info").classList.remove("is-visible");
    if (getEl("matched-scenes-area")) {
        getEl("matched-scenes-area").classList.remove("is-visible");
        getEl("matched-scenes-area").style.display = "none";
    }
    if (getEl("new-scene-selection")) getEl("new-scene-selection").innerHTML = "";
    if (getEl("confirm-character-btn")) getEl("confirm-character-btn").disabled = true;
    if (getEl("confirm-adaptation-btn")) getEl("confirm-adaptation-btn").disabled = true;
    if (getEl("name-replace-tool")) getEl("name-replace-tool").style.display = "none";
    if (getEl("new-outline-result-card")) getEl("new-outline-result-card").style.display = "none";
    updateAllTextareaCounters();
}

function hideResultSections() {
    ["environment-candidates-area", "scene-recommendation-card", "character-result-card",
     "storyline-result-card", "framework-result-card", "novel-generation-card",
     "generated-novel-card"].forEach((id) => {
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

function normalizeChapterNo(value, fallback = 0) {
    const chapterNo = Number(value);
    return Number.isFinite(chapterNo) && chapterNo > 0 ? chapterNo : fallback;
}

function findChapterPlanItem(chapterNo, plan = workflowState.chapterPlan) {
    const normalized = normalizeChapterNo(chapterNo);
    if (!normalized || !Array.isArray(plan)) return null;
    return plan.find((item, index) => {
        const itemChapter = normalizeChapterNo(item?.chapter || item?.chapter_no || item?.chapterNo, index + 1);
        return itemChapter === normalized;
    }) || null;
}

function isGenericChapterPlot(value) {
    const text = String(value || "").trim();
    if (!text) return true;
    return ["推进剧情", "尚未开始生成", "待生成", "生成中", "已完成", "失败", "生成失败"].includes(text);
}

function getChapterTextSummary(text) {
    const firstLine = String(text || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .find(Boolean);
    if (!firstLine) return "";
    return firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine;
}

function getChapterConcretePlot(item, fallbackChapterNo = 0) {
    const chapterNo = normalizeChapterNo(item?.chapter || item?.chapter_no || item?.chapterNo, fallbackChapterNo);
    const planItem = findChapterPlanItem(chapterNo);
    const candidates = [
        item?.plot,
        item?.title,
        item?.summary?.plot,
        item?.summary?.summary,
        item?.summary?.text,
        planItem?.plot,
        planItem?.title,
        planItem?.summary,
        planItem?.chapter_summary,
        item?.sceneCard?.opening,
        item?.scene_card?.opening,
        getChapterTextSummary(item?.text || item?.generatedText || item?.generated_text),
    ];
    return String(candidates.find((value) => !isGenericChapterPlot(value)) || "").trim();
}

function getChapterDisplayTitle(item, fallbackChapterNo = 0, fallbackText = "") {
    const concrete = getChapterConcretePlot(item, fallbackChapterNo);
    if (concrete) return concrete.length > 60 ? `${concrete.slice(0, 60)}…` : concrete;
    const chapterNo = normalizeChapterNo(item?.chapter || item?.chapter_no || item?.chapterNo, fallbackChapterNo);
    return fallbackText || (chapterNo ? `第${chapterNo}章` : "未命名章节");
}

function formatChineseChapterNo(value) {
    const chapterNo = normalizeChapterNo(value);
    if (!chapterNo) return "本章";
    const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if (chapterNo <= 10) return `第${chapterNo === 10 ? "十" : digits[chapterNo]}章`;
    if (chapterNo < 20) return `第十${digits[chapterNo % 10]}章`;
    if (chapterNo < 100) {
        const tens = Math.floor(chapterNo / 10);
        const ones = chapterNo % 10;
        return `第${digits[tens]}十${ones ? digits[ones] : ""}章`;
    }
    return `第${chapterNo}章`;
}

function normalizeSidebarChapterTitle(value) {
    let text = String(value || "").trim();
    if (!text || isGenericChapterPlot(text)) return "";
    text = text
        .replace(/^第[一二三四五六七八九十百千万\d]+章[：:、\s-]*/u, "")
        .replace(/^已生成的文本第\d+章[：:、\s-]*/u, "")
        .trim();
    if (!text || isGenericChapterPlot(text)) return "";
    const firstLine = text.split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
    const sentenceCut = firstLine.search(/[。！？；;.!?]/);
    const commaCut = firstLine.search(/[，,、]/);
    let title = firstLine;
    if (sentenceCut > 0) title = firstLine.slice(0, sentenceCut);
    else if (commaCut > 8) title = firstLine.slice(0, commaCut);
    title = title.replace(/\s+/g, " ").trim();
    return title.length > 22 ? `${title.slice(0, 22)}…` : title;
}

function getTaskSidebarChapterTitle(item, fallbackChapterNo = 0) {
    const chapterNo = normalizeChapterNo(item?.chapter || item?.chapter_no || item?.chapterNo, fallbackChapterNo);
    const planItem = findChapterPlanItem(chapterNo);
    const candidates = [
        item?.sidebar_title,
        item?.chapter_title,
        item?.chapterTitle,
        item?.name,
        planItem?.chapter_title,
        planItem?.chapterTitle,
        planItem?.title,
        planItem?.name,
        item?.plot,
        planItem?.plot,
        item?.title,
        getChapterTextSummary(item?.text || item?.generatedText || item?.generated_text),
        item?.stage_label,
        planItem?.stage_label,
    ];
    const title = candidates.map(normalizeSidebarChapterTitle).find(Boolean) || "未命名章节";
    return `${formatChineseChapterNo(chapterNo)}：${title}`;
}

function hydrateChapterDraftsFromPlan(plan = workflowState.chapterPlan) {
    if (!Array.isArray(workflowState.chapterDrafts) || !workflowState.chapterDrafts.length) return;
    workflowState.chapterDrafts.forEach((draft) => {
        const chapterNo = normalizeChapterNo(draft?.chapter);
        const planItem = findChapterPlanItem(chapterNo, plan);
        const concretePlot = getChapterConcretePlot(draft, chapterNo);
        if (isGenericChapterPlot(draft.plot) && concretePlot) draft.plot = concretePlot;
        if (planItem) {
            if (!draft.emotion && planItem.emotion) draft.emotion = planItem.emotion;
            if (!draft.hook && (planItem.hook || planItem.end_hook || planItem.chapter_end_hook)) {
                draft.hook = planItem.hook || planItem.end_hook || planItem.chapter_end_hook;
            }
        }
    });
}

function stopWriteJobPolling() {
    if (workflowState.writePollTimer) { clearInterval(workflowState.writePollTimer); workflowState.writePollTimer = null; }
    workflowState.writePollBusy = false;
    if (getEl("stop-generation-btn")) getEl("stop-generation-btn").style.display = "none";
}

function isWriteJobRunningStatus(status) {
    return ["running", "queued", "processing", "generating"].includes(String(status || "").toLowerCase());
}

function isWriteJobCompleteStatus(status) {
    return ["completed", "done", "success"].includes(String(status || "").toLowerCase());
}

function shouldExposeIntroForWriteJob(job = workflowState.generatedNovel) {
    const status = job?.status || workflowState.writeJobStatus || "";
    if (isWriteJobCompleteStatus(status)) return true;
    const totalChapters = Number(job?.chapter_count || workflowState.chapterDrafts.length || 0);
    const completedChapters = Number(job?.completed_chapters || 0);
    return totalChapters > 0 && completedChapters >= totalChapters;
}

function extractIntroFromNovelText(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const introHeader = raw.match(/(?:^|\n)\s*导语\s*(?:\n|$)/);
    if (!introHeader) return "";
    const start = introHeader.index + introHeader[0].length;
    const rest = raw.slice(start);
    const endMatch = rest.match(/\n\s*(?:[─-]{3,}|第\s*1\s*章|第\s*一\s*章)\s*(?:\n|$)/);
    const intro = endMatch ? rest.slice(0, endMatch.index) : rest;
    return intro.trim();
}

function getCompletedIntroText(job = workflowState.generatedNovel, fallbackNovelText = "") {
    if (!shouldExposeIntroForWriteJob(job)) return "";
    const directIntro = String(job?.intro_text || job?.intro || workflowState.introText || "").trim();
    if (directIntro) return directIntro;
    const novelText = fallbackNovelText
        || job?.novel_text
        || job?.text
        || getEl("generated-novel-text")?.value
        || "";
    return extractIntroFromNovelText(novelText);
}

function updateStopGenerationButton(status = workflowState.writeJobStatus) {
    const stopBtn = getEl("stop-generation-btn");
    if (!stopBtn) return;
    stopBtn.style.display = isWriteJobRunningStatus(status) ? "inline-flex" : "none";
}

function formatChapterSavedTime(value) {
    if (!value) return "";
    const raw = Number(value);
    let date;
    if (Number.isFinite(raw)) {
        date = new Date(raw < 100000000000 ? raw * 1000 : raw);
    } else {
        date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return "";
    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    const intro = getCompletedIntroText(workflowState.generatedNovel);
    const introBlock = intro ? `导语\n\n${intro}\n\n${"─".repeat(20)}\n\n` : "";
    const blocks = filled.map((item) => `第${item.chapter}章\n\n${item.text}`);
    return `${title}\n\n${introBlock}${blocks.join("\n\n" + "─".repeat(20) + "\n\n")}`;
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

    // 导语只在整本生成完成后展示，避免逐章生成中提前出现。
    if (workflowState.introText && shouldExposeIntroForWriteJob()) {
        const introBtn = document.createElement("button"); introBtn.type = "button";
        introBtn.className = "chapter-draft-item chapter-draft-item--intro";
        if (workflowState.selectedDraftChapter === 0) introBtn.classList.add("is-active");
        introBtn.innerHTML = '<div class="chapter-draft-item__title">导语</div><div class="chapter-draft-item__meta">小说开头文案</div><span class="chapter-draft-item__status is-completed">已完成</span>';
        introBtn.addEventListener("click", () => { workflowState.selectedDraftChapter = 0; renderChapterDraftList(); renderIntroContent(); });
        container.appendChild(introBtn);
    }

    workflowState.chapterDrafts.forEach((item) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "chapter-draft-item";
        if (Number(item.chapter) === Number(workflowState.selectedDraftChapter)) button.classList.add("is-active");
        const statusClass = item.edited ? "is-edited" : item.status === "completed" ? "is-completed" : item.status === "generating" ? "is-generating" : item.status === "error" ? "is-error" : "";
        const statusText = item.edited ? "已修改" : item.status === "completed" ? "已完成" : item.status === "generating" ? "生成中" : item.status === "error" ? "失败" : "待生成";
        const plotText = getChapterDisplayTitle(item, item.chapter, "尚未开始生成");
        const displayPlot = plotText.length > 60 ? plotText.slice(0, 60) + "…" : plotText;
        button.innerHTML = `<div class="chapter-draft-item__title">第${item.chapter}章</div><div class="chapter-draft-item__meta">${escapeHTML(displayPlot)}</div><span class="chapter-draft-item__status ${statusClass}">${statusText}</span>`;
        button.addEventListener("click", () => { workflowState.autoFollowDraftChapter = false; workflowState.selectedDraftChapter = item.chapter; renderChapterDraftList(); renderChapterEditor(); updateChapterFollowButton(); });
        container.appendChild(button);
    });
}
function renderIntroContent() {
    if (!workflowState.introText || !shouldExposeIntroForWriteJob()) return;
    const intro = workflowState.introText;
    if (getEl("chapter-editor-title")) getEl("chapter-editor-title").value = "导语";
    if (getEl("chapter-editor-word-count")) getEl("chapter-editor-word-count").value = `${countDraftChars(intro)} 字`;
    if (getEl("chapter-editor-save-status")) getEl("chapter-editor-save-status").value = "系统生成";
    if (getEl("chapter-editor-text") && getEl("chapter-editor-text") !== document.activeElement) getEl("chapter-editor-text").value = intro;
    if (getEl("chapter-editor-meta")) getEl("chapter-editor-meta").textContent = "AI 从完整小说中提取最爆冲突场景，重写为导语开篇文案";
}

function renderChapterEditor() {
    if (workflowState.selectedDraftChapter === 0) {
        if (workflowState.introText && shouldExposeIntroForWriteJob()) { renderIntroContent(); return; }
        workflowState.selectedDraftChapter = getPreferredFollowChapter();
    }
    const draft = getChapterDraft(workflowState.selectedDraftChapter) || workflowState.chapterDrafts[0]; if (!draft) return;
    if (getEl("chapter-editor-title")) getEl("chapter-editor-title").value = `第${draft.chapter}章`;
    if (getEl("chapter-editor-word-count")) getEl("chapter-editor-word-count").value = `${countDraftChars(draft.text || "")} 字`;
    if (getEl("chapter-editor-save-status")) {
        const savedTime = formatChapterSavedTime(draft.savedAt);
        if (savedTime) getEl("chapter-editor-save-status").value = `已保存 · ${savedTime}`;
        else if (draft.edited) getEl("chapter-editor-save-status").value = "待保存";
        else getEl("chapter-editor-save-status").value = "未保存";
    }
    if (getEl("chapter-editor-text") && getEl("chapter-editor-text") !== document.activeElement) getEl("chapter-editor-text").value = draft.text || "";
    const concretePlot = getChapterConcretePlot(draft, draft.chapter);
    const metaParts = [];
    if (concretePlot) metaParts.push(`剧情：${concretePlot}`); if (draft.emotion) metaParts.push(`情绪：${draft.emotion}`);
    if (draft.hook) metaParts.push(`钩子：${draft.hook}`); if (draft.edited) metaParts.push("当前章节已手动修改");
    if (getEl("chapter-editor-meta")) getEl("chapter-editor-meta").textContent = metaParts.join(" · ") || "";
    if (getEl("write-toolbar-plot")) getEl("write-toolbar-plot").textContent = concretePlot || "";
    renderChapterReferencePreview();
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
    const assistRefView = getEl("editor-assist-reference-view");
    const assistRefMeta = getEl("editor-assist-reference-meta");
    if (!draft) {
        const isIntro = workflowState.selectedDraftChapter === 0;
        if (sceneCardView) sceneCardView.innerHTML = isIntro
            ? '<div class="context-empty">导语由 AI 从完整小说中提取最爆冲突场景生成，非逐章检索。</div>'
            : '<div class="context-empty">场景卡生成后会显示在这里。</div>';
        if (referenceView) referenceView.innerHTML = isIntro
            ? '<div class="context-empty">导语不依赖 RAG 参考片段，由独立导语模型生成。</div>'
            : '<div class="context-empty">当前章参考到的爆款小说片段会显示在这里。</div>';
        if (meta) meta.textContent = isIntro
            ? "导语基于 novel_introduction 模块，用完整小说 + 爆款导语语料库 + LLM 评审生成。"
            : "生成当前章时检索到的参考片段会显示在这里。";
        if (assistRefView) assistRefView.innerHTML = '<div class="context-empty">选中章节后可查看对应参考片段</div>';
        if (assistRefMeta) assistRefMeta.textContent = "";
        return;
    }
    if (sceneCardView) sceneCardView.innerHTML = formatSceneCardView(draft.sceneCard);
    const referenceHTML = formatReferenceCards(draft.reference);
    if (referenceView) referenceView.innerHTML = referenceHTML;
    if (assistRefView) assistRefView.innerHTML = referenceHTML;
    if (meta) {
        const groupItems = draft.reference?.group_items && typeof draft.reference.group_items === "object" ? draft.reference.group_items : {};
        const refCount = Object.values(groupItems).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        meta.textContent = refCount ? `当前章已载入 ${refCount} 条参考片段，可边看边修改正文。` : "当前章暂未命中可展示的参考片段。";
    }
    if (assistRefMeta) {
        const groupItems = draft.reference?.group_items && typeof draft.reference.group_items === "object" ? draft.reference.group_items : {};
        const refCount = Object.values(groupItems).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        assistRefMeta.textContent = refCount ? `当前章命中 ${refCount} 条参考片段` : "当前章暂未命中参考片段";
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
    if (workflowState.selectedDraftChapter === 0) {
        const intro = workflowState.introText;
        if (!intro || !shouldExposeIntroForWriteJob()) return showError("整本生成完成后才可复制导语");
        copyTextWithFallback(intro).then((copied) => copied ? showSuccess("导语已复制到剪贴板") : showError("复制失败"));
        return;
    }
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    if (!draft || !String(draft.text || "").trim()) return showError("当前章节还没有可复制的内容");
    copyTextWithFallback(draft.text || "").then(
        (copied) => copied ? showSuccess(`第${draft.chapter}章已复制到剪贴板`) : showError("复制失败")
    );
}
function applyWriteJobStatus(job) {
    workflowState.writeJobStatus = job.status || "running"; workflowState.generatedNovel = job;
    workflowState.chapterPlan = job.chapter_plan || workflowState.chapterPlan || [];
    workflowState.introText = getCompletedIntroText(job);
    if (workflowState.introText) workflowState.generatedNovel.intro_text = workflowState.introText;
    ensureChapterDrafts(job.chapter_count || (job.chapters || []).length || 10);
    hydrateChapterDraftsFromPlan(workflowState.chapterPlan);
    (job.chapters || []).forEach((chapterData) => {
        const chapter = getChapterDraft(chapterData.chapter); if (!chapter) return;
        chapter.status = chapterData.status || chapter.status;
        const planItem = findChapterPlanItem(chapterData.chapter, workflowState.chapterPlan);
        const incomingPlot = chapterData.plot || planItem?.plot || planItem?.title || "";
        if (!isGenericChapterPlot(incomingPlot) || isGenericChapterPlot(chapter.plot)) {
            chapter.plot = incomingPlot || chapter.plot;
        }
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
    hydrateChapterDraftsFromPlan(workflowState.chapterPlan);
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
    syncCurrentTaskGeneratedChapters();
    renderTaskSidebar();
    updateStopGenerationButton(job.status);
    if (job.status === "completed" && workflowState.writeLastNotifiedStatus !== "completed") { workflowState.writeLastNotifiedStatus = "completed"; showSuccess("整本小说已逐章生成完成"); }
    else if (job.status === "error" && workflowState.writeLastNotifiedStatus !== "error") { workflowState.writeLastNotifiedStatus = "error"; showError(job.error || "正文生成失败"); }
}
async function pollWriteJobStatus(jobId) {
    if (!jobId || workflowState.writePollBusy) return; workflowState.writePollBusy = true;
    try {
        const res = await fetch(API_BASE + appendUserQuery(`/api/pipeline/write/status/${jobId}`));
        const data = await parseJSONResponse(res, "获取正文生成状态失败");
        applyWriteJobStatus(data);
        if (["completed", "error", "canceled", "stopped"].includes(String(data.status || "").toLowerCase())) stopWriteJobPolling();
    } catch (err) { stopWriteJobPolling(); showError(err.message || "获取正文生成状态失败"); }
    finally { workflowState.writePollBusy = false; }
}
function startWriteJobPolling(jobId) { stopWriteJobPolling(); workflowState.writeJobId = jobId; pollWriteJobStatus(jobId); workflowState.writePollTimer = setInterval(() => pollWriteJobStatus(jobId), 1800); updateStopGenerationButton("running"); }

function syncRewriteFrameworkInput() {
    const rewriteInput = getEl("rewrite-framework-text"); if (!rewriteInput) return;
    const currentText = rewriteInput.value.trim();
    const sourceText = (workflowState.finalFramework?.final_text || workflowState.newOutlineText || getEl("new-outline-text")?.value || "").trim();
    if (!currentText && sourceText) {
        rewriteInput.value = sourceText;
        rewriteInput.scrollTop = 0;
        if (typeof rewriteInput.setSelectionRange === "function") rewriteInput.setSelectionRange(0, 0);
    }
}
function useCurrentFrameworkForWriting() {
    const sourceText = (workflowState.finalFramework?.final_text || workflowState.newOutlineText || getEl("new-outline-text")?.value || "").trim();
    if (!sourceText) return showError("当前工作流里还没有可带入的最终框架");
    const rewriteInput = getEl("rewrite-framework-text");
    rewriteInput.value = sourceText;
    rewriteInput.scrollTop = 0;
    if (typeof rewriteInput.setSelectionRange === "function") rewriteInput.setSelectionRange(0, 0);
    workflowState.finalFramework = workflowState.finalFramework || {};
    workflowState.finalFramework.final_text = sourceText;
    if (getEl("novel-title-input") && !getEl("novel-title-input").value.trim()) getEl("novel-title-input").value = inferNovelTitle();
    showSuccess("已带入当前内容，可以直接生成正文");
}

// ========================================
// 模块入口 & 步骤切换
// ========================================
// 新步骤映射: 1=拆解, 2=拆解输入, 4=合并设定页, 5=人物替换, 6=新大纲, 7=AI重写

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
        return;
    }
    if (module === "intro") {
        enterIntroEdit(); showSuccess("已进入 导语优化模块"); return;
    }
    if (module === "reverse_intro") {
        switchToStep(9);
        getEl("reverse-intro-input")?.focus();
        showSuccess("已进入 导语定制模式");
        return;
    }
}

function getProgressStepForStage(step) {
    if (step === 9) return 9;
    if (step <= 1) return 1;
    if (step <= 6) return 2;
    if (step <= 7) return 3;
    return 4;
}

function updateAdaptationSubsteps(step) {
    const container = getEl("adaptation-substeps");
    if (container) {
        const inAdaptation = step >= 2 && step <= 6;
        container.classList.toggle("is-visible", inAdaptation);
        container.classList.toggle("is-muted", !inAdaptation);
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
    showWorkflowScreen();
    workflowState.currentStep = step;
    updateEditorWorkbenchMode(step);
    applyEditorAssistLayout();
    const breadcrumb = getEl("workflow-breadcrumb");
    if (breadcrumb) {
        const labels = {
            1: "/ AI拆解 / 原文输入",
            2: "/ AI改编 / 拆解输入",
            3: "/ AI改编 / 设定与人物",
            4: "/ AI改编 / 设定与人物",
            5: "/ AI改编 / 设定与人物",
            6: "/ AI改编 / 新大纲",
            7: "/ AI重写",
            8: "/ 导语优化",
            9: "/ 导语定制 / 逆工作流",
        };
        breadcrumb.textContent = labels[step] || "/ 工作台";
    }
    const progressStep = getProgressStepForStage(step);
    document.querySelectorAll(".progress-step").forEach((node) => {
        const n = Number(node.dataset.step);
        node.classList.remove("is-active", "is-done");
        if (progressStep !== 9 && n < progressStep) node.classList.add("is-done");
        else if (n === progressStep) node.classList.add("is-active");
    });
    updateAdaptationSubsteps(step);
    if (step === 7) syncRewriteFrameworkInput();
    for (let i = 1; i <= TOTAL_STEPS; i += 1) {
        const el = getEl(`stage-${i}`);
        if (el) el.style.display = i === step ? "block" : "none";
    }
    if (step === 6 && getEl("new-outline-result-card")) {
        getEl("new-outline-result-card").style.display = "block";
    }
    updateAllTextareaCounters();
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
    if (!expanded) closeHistoryReferenceFilters();
}

function closeHistoryReferenceFilters(except = "") {
    const filters = [
        { key: "source", el: getEl("history-reference-source-menu")?.closest(".history-reference-filter") },
        { key: "date", el: getEl("history-reference-date-menu")?.closest(".history-reference-filter") },
        { key: "book", el: getEl("history-reference-book-menu")?.closest(".history-reference-filter") },
    ];
    filters.forEach(({ key, el }) => {
        if (el && key !== except) el.classList.remove("is-open");
    });
}

function toggleHistoryReferenceFilter(kind) {
    const key = ["source", "date", "book"].includes(kind) ? kind : "date";
    const menuMap = {
        source: "history-reference-source-menu",
        date: "history-reference-date-menu",
        book: "history-reference-book-menu",
    };
    const menu = getEl(menuMap[key]);
    const filter = menu?.closest(".history-reference-filter");
    if (!filter) return;
    const willOpen = !filter.classList.contains("is-open");
    closeHistoryReferenceFilters(key);
    filter.classList.toggle("is-open", willOpen);
}

function renderHistoryReferenceStatus() {
    const config = getHistoryReferenceSourceConfig();
    const sourceEl = getEl("history-reference-current-source");
    const dateEl = getEl("history-reference-current-date");
    const bookEl = getEl("history-reference-current-book");
    const autoStatusEl = getEl("history-reference-auto-status");
    const titleEl = getEl("history-reference-workbench-title");
    const badgeEl = getEl("history-reference-source-badge");
    const summaryEl = getEl("history-reference-summary");
    const dateLabelEl = getEl("history-reference-date-label");
    const bookLabelEl = getEl("history-reference-book-label");
    const previewEl = getEl("history-reference-preview");
    if (sourceEl) sourceEl.textContent = config.label;
    if (dateEl) dateEl.textContent = workflowState.selectedHistoricalDate || "未选择";
    if (bookEl) bookEl.textContent = workflowState.historicalReferenceDetail?.title || "未选择";
    if (titleEl) titleEl.textContent = config.title;
    if (badgeEl) badgeEl.textContent = config.badge;
    if (summaryEl) summaryEl.textContent = config.summary;
    if (dateLabelEl) dateLabelEl.textContent = config.dateLabel;
    if (bookLabelEl) bookLabelEl.textContent = config.bookLabel;
    if (previewEl && !previewEl.value) previewEl.placeholder = config.previewPlaceholder;
    if (autoStatusEl) {
        if (workflowState.historicalReferenceDates.length) {
            autoStatusEl.textContent = config.statusWithData;
        } else {
            autoStatusEl.textContent = config.statusEmpty;
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
    const config = getHistoryReferenceSourceConfig();
    const dates = workflowState.historicalReferenceDates || [];
    if (!dates.length) {
        container.innerHTML = `<div class="history-reference-empty">${escapeHTML(config.emptyDates)}</div>`;
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
            <span class="history-reference-item__meta">${escapeHTML(item.available_count + " 本")}${item.is_today ? " · 今日" : ""}${item.is_priority ? " · 前一日" : ""}</span>
        </button>
    `).join("");
}

function renderHistoryReferenceBooks() {
    const container = getEl("history-reference-books");
    if (!container) return;
    const config = getHistoryReferenceSourceConfig();
    const isHourlyTop = workflowState.selectedHistoricalSource === "hourly_top";
    const books = workflowState.historicalReferenceBooks || [];
    if (!workflowState.selectedHistoricalDate) {
        container.innerHTML = '<div class="history-reference-empty">请先选择日期</div>';
        renderHistoryReferenceStatus();
        return;
    }
    if (!books.length) {
        container.innerHTML = `<div class="history-reference-empty">${escapeHTML(config.emptyBooks)}</div>`;
        renderHistoryReferenceStatus();
        return;
    }
    container.innerHTML = books.map((item) => `
        <button
            type="button"
            class="history-reference-item ${workflowState.selectedHistoricalBookId === item.book_id ? "is-active" : ""}"
            onclick="selectHistoricalBook('${escapeHTML(item.book_id)}')"
        >
            <span class="history-reference-item__title">${isHourlyTop ? "小时TOP" : "TOP"}${escapeHTML(String(item.rank || ""))} · ${escapeHTML(item.title)}</span>
            <span class="history-reference-item__meta">${isHourlyTop && item.first_rank_hour !== undefined && item.first_rank_hour !== "" ? `首次上榜小时：${escapeHTML(String(item.first_rank_hour))} · ` : ""}书籍ID：${escapeHTML(item.book_id)}</span>
        </button>
    `).join("");
}

function renderHistoryReferenceSources() {
    const container = getEl("history-reference-sources");
    if (!container) return;
    container.innerHTML = HISTORY_REFERENCE_SOURCES.map((item) => `
        <button
            type="button"
            class="history-reference-item ${workflowState.selectedHistoricalSource === item.key ? "is-active" : ""}"
            onclick="selectHistoricalSource('${escapeHTML(item.key)}')"
        >
            <span class="history-reference-item__title">${escapeHTML(item.label)}</span>
            <span class="history-reference-item__meta">${escapeHTML(item.summary)}</span>
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
    workflowState.selectedHistoricalSource = normaliseHistoryReferenceSource(workflowState.selectedHistoricalSource);
    const previousDate = preserveSelection ? workflowState.selectedHistoricalDate : "";
    const previousBookId = preserveSelection ? workflowState.selectedHistoricalBookId : "";
    try {
        const source = workflowState.selectedHistoricalSource;
        const res = await fetch(API_BASE + appendUserQuery(`/api/history_reference/dates?max_days=7&source=${encodeURIComponent(source)}`));
        const data = await parseJSONResponse(res, "加载日期失败");
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
        const source = workflowState.selectedHistoricalSource;
        const res = await fetch(API_BASE + appendUserQuery(`/api/history_reference/books?date=${encodeURIComponent(dateText)}&source=${encodeURIComponent(source)}`));
        const data = await parseJSONResponse(res, "加载书单失败");
        workflowState.historicalReferenceBooks = data.books || [];
        renderHistoryReferenceBooks();
        if (!silent) {
            closeHistoryReferenceFilters("book");
            getEl("history-reference-book-menu")?.closest(".history-reference-filter")?.classList.add("is-open");
        }
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
        const source = workflowState.selectedHistoricalSource;
        const res = await fetch(API_BASE + appendUserQuery(`/api/history_reference/detail?date=${encodeURIComponent(dateText)}&book_id=${encodeURIComponent(bookId)}&source=${encodeURIComponent(source)}`));
        const data = await parseJSONResponse(res, "加载详情失败");
        workflowState.historicalReferenceDetail = data;
        renderHistoryReferenceDetail();
        if (!silent) closeHistoryReferenceFilters();
    } catch (err) {
        if (!silent) showError(err.message || "加载历史爆款详情失败");
    }
}

async function selectHistoricalSource(source, options = {}) {
    const { silent = false } = options;
    const nextSource = normaliseHistoryReferenceSource(source);
    if (workflowState.selectedHistoricalSource === nextSource && workflowState.historicalReferenceDates.length) {
        closeHistoryReferenceFilters("date");
        getEl("history-reference-date-menu")?.closest(".history-reference-filter")?.classList.add("is-open");
        return;
    }
    workflowState.selectedHistoricalSource = nextSource;
    workflowState.selectedHistoricalDate = "";
    workflowState.selectedHistoricalBookId = "";
    workflowState.historicalReferenceDates = [];
    workflowState.historicalReferenceBooks = [];
    workflowState.historicalReferenceDetail = null;
    renderHistoryReferenceSources();
    renderHistoryReferenceDates();
    renderHistoryReferenceBooks();
    renderHistoryReferenceDetail();
    renderHistoryReferenceStatus();
    await loadHistoricalReferenceDates({ preserveSelection: false, silent });
    if (!silent) {
        closeHistoryReferenceFilters("date");
        getEl("history-reference-date-menu")?.closest(".history-reference-filter")?.classList.add("is-open");
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

// ========================================
// 元数据
// ========================================
async function loadWorkflowMetadata() {
    try {
        const res = await fetch(API_BASE + appendUserQuery("/api/workflow/metadata"));
        workflowState.metadata = await parseJSONResponse(res, "加载工作流元数据失败");
    }
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
            reader.onload = (ev) => {
                const target = getEl(targetId);
                if (target) {
                    target.value = ev.target.result;
                    updateTextareaCounter(target);
                    updateTextareaLineNumbers(target);
                }
                showSuccess(`已加载文件：${file.name}`);
            };
            reader.readAsText(file);
        });
    }
    bindFileInput("upload-raw-file", "raw-novel-text");
    bindFileInput("upload-txt-file", "input-outline-text");
    bindFileInput("upload-framework-file", "rewrite-framework-text");
}
