const state = {
  view: "career",
  obsidian: null,
  progress: null,
  career: null,
  resumes: null,
  careerStatusFilter: "all",
  selectedCareerId: "",
  selectedResumeCategory: "ai-agent",
  selectedResumeFillSection: "personal",
  selectedApplicationQuestionGroup: "common",
  resumeMaterialSearch: "",
  dailyPlan: null,
  selectedDate: localDateString(),
  health: null,
};

const pomodoro = {
  mode: "focus",
  running: false,
  focusMinutes: clampNumber(localStorage.getItem("pomodoroFocusMinutes"), 5, 180, 25),
  breakMinutes: clampNumber(localStorage.getItem("pomodoroBreakMinutes"), 1, 60, 5),
  secondsLeft: clampNumber(localStorage.getItem("pomodoroFocusMinutes"), 5, 180, 25) * 60,
  timerId: null,
  taskId: "",
};

const views = {
  overview: ["今日总览", "安排岗位投递、笔试训练和面试准备，跟进今天的求职目标。"],
  career: ["岗位投递", "维护岗位投递、测评、笔试、一面、二面和 Offer 状态。"],
  resumes: ["简历素材", "按岗位方向管理简历版本、投递填表素材和面试口径。"],
  obsidian: ["学习笔记", "搜索技术学习、算法练习和面试复盘笔记。"],
  progress: ["求职任务", "维护长期任务池、周目标和今日计划之外的推进状态。"],
};

state.view = viewsFromHash() || state.view;
if (window.location.protocol !== "file:") history.replaceState(null, "", `#${state.view}`);

const content = document.querySelector("#content");
const notice = document.querySelector("#notice");
const title = document.querySelector("#viewTitle");
const subtitle = document.querySelector("#viewSubtitle");
const localServerUrl = "http://127.0.0.1:8008/";

document.querySelectorAll(".nav button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelector("#refreshBtn").addEventListener("click", () => loadCurrent(true));
window.addEventListener("hashchange", () => {
  const view = viewsFromHash();
  if (view !== state.view) setView(view, false);
});

function viewsFromHash() {
  const value = window.location.hash.replace("#", "");
  return views[value] ? value : "career";
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = `notice ${error ? "error" : ""}`;
  window.setTimeout(() => notice.classList.add("hidden"), 4200);
}

async function api(path, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("当前是 file:// 打开方式，无法连接 dashboard 后端。请使用 http://127.0.0.1:8008/ 打开。");
  }
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (error) {
    throw new Error(`无法连接本地服务：${error.message}。请确认 dashboard 服务正在运行。`);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`${response.status} ${detail.detail || response.statusText}`);
  }
  return response.json();
}

function renderFileMode() {
  title.textContent = "打开方式不对";
  subtitle.textContent = "这个页面需要通过本地 dashboard 服务访问。";
  document.querySelector("#projectRoot").textContent = "请使用 127.0.0.1:8008";
  content.innerHTML = `
    <section class="workbench-hero file-mode">
      <div>
        <span class="eyebrow">需要本地服务</span>
        <h2>不要直接打开 index.html，请用本地网址进入工作台</h2>
        <p>你现在看到的是 <code>file://</code> 页面，浏览器不会正常连接 投递记录、简历素材、今日计划和本地文件预览。</p>
      </div>
      <div class="hero-actions">
        <a class="primary link-button" href="${localServerUrl}">打开正确网站</a>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>正确打开方式</h2>
        <div class="list">
          <div class="item">
            <strong>1. 先启动服务</strong>
            <code>python3 综合工作台/start_dashboard.py</code>
          </div>
          <div class="item">
            <strong>2. 再打开本地网址</strong>
            <code>${localServerUrl}</code>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>为什么不能直接打开 HTML</h2>
        <p>这个 dashboard 不是普通静态网页，它需要后端读取投递记录、简历素材、求职笔记和每日计划。直接打开 HTML 只能看到壳子，看不到真正的数据。</p>
      </div>
    </section>
  `;
}

function setView(view, updateHash = true) {
  view = views[view] ? view : "career";
  state.view = view;
  if (!updateHash && window.location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (updateHash) window.location.hash = view;
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  title.textContent = views[view][0];
  document.querySelector("#currentPageLabel").textContent = views[view][0];
  document.querySelector("#workspaceDate").textContent = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()) + " · 本机工作台";
  const pageActions = {overview: ["管理投递", "career"], career: ["简历素材", "resumes"], resumes: ["管理投递", "career"], obsidian: ["求职任务", "progress"], progress: ["今日计划", "overview"]};
  const pageAction = document.querySelector("#pagePrimaryAction");
  pageAction.textContent = pageActions[view][0];
  pageAction.href = `#${pageActions[view][1]}`;
  document.querySelectorAll(".nav button").forEach(button => {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  subtitle.textContent = views[view][1];
  loadCurrent();
}

async function loadCurrent(force = false) {
  content.innerHTML = `<section class="panel"><h2>加载中</h2><p>正在读取本地项目索引...</p></section>`;
  try {
    if (!state.health || force) {
      state.health = await api("/api/health");
      document.querySelector("#projectRoot").textContent = state.health.projectRoot || "未知";
    }
    if (state.view === "overview") await loadOverview(force);
    if (state.view === "career") await loadCareer(force);
    if (state.view === "resumes") await loadResumes(force);
    if (state.view === "obsidian") await loadObsidian(force);
    if (state.view === "progress") await loadProgress(force);
  } catch (error) {
    content.innerHTML = `<section class="panel"><h2>读取失败</h2><p>${escapeHtml(error.message)}</p></section>`;
  }
}

async function loadOverview(force = false) {
  if (!state.career || force) state.career = await api("/api/career");
  if (!state.progress || force) state.progress = await api("/api/progress");
  if (!state.dailyPlan || force || state.dailyPlan.date !== state.selectedDate) state.dailyPlan = await api(`/api/daily-plan?date=${encodeURIComponent(state.selectedDate)}`);
  const summary = state.career.summary || {};
  content.innerHTML = `
    <section class="workbench-hero today-hero">
      <div class="hero-main"><span class="eyebrow">今天的工作重点</span><h2>让每一份准备，都向机会靠近。</h2><p>跟进投递反馈，完成笔试训练，准备下一场面试。</p><div class="hero-actions"><a class="primary link-button" href="#career">管理投递</a><a class="secondary link-button" href="#resumes">简历素材</a></div></div>
      <div class="hero-side-summary"><span>今日计划</span><strong>${state.dailyPlan.summary?.remaining || 0} 项待完成 · ${summary.interviewing || 0} 个面试中</strong><p>从一个明确的小目标开始。</p><a href="#progress">查看求职任务</a></div>
    </section>
    <section class="grid cards calm-cards">${metric("全部岗位", summary.total || 0)}${metric("流程中", summary.applied || 0)}${metric("面试中", summary.interviewing || 0)}${metric("Offer", summary.offers || 0)}</section>
    ${dailyPlanPanel(state.dailyPlan, true)}
    <section class="grid two"><div class="panel"><h2>投递漏斗</h2>${careerFunnel(summary.byStatus || {})}</div><div class="panel"><h2>求职任务</h2><div class="list">${(state.progress.items || []).filter(item => item.status !== "completed").slice(0, 6).map(compactTaskItem).join("") || "<p>暂无待办任务，可到任务页添加。</p>"}</div></div></section>
  `;
  bindDailyPlanControls();
}

async function loadCareer(force = false) {
  if (!state.career || force) state.career = await api("/api/career");
  const summary = state.career.summary || {};
  content.innerHTML = `
    <section class="workbench-hero career-hero">
      <div class="hero-main">
        <span class="eyebrow">当前求职重点</span>
        <h2>从岗位投递，到下一次面试。</h2>
        <p>记录每个岗位的进展，明确下一步。把投递、笔试和面试准备放在一起，有序推进。</p>
        <div class="hero-actions"><button id="addCareerBtn" class="primary">新增岗位</button><button id="saveCareerBtn" class="secondary">保存投递进度</button></div>
      </div>
      <div class="hero-side-summary"><span>本轮投递</span><strong>${summary.total ?? 0} 个岗位 · ${summary.interviewing ?? 0} 个面试中</strong><p>流程中 ${summary.applied ?? 0} · Offer ${summary.offers ?? 0}</p><a href="#progress">查看求职任务</a></div>
    </section>
    <section class="grid cards calm-cards">
      ${metric("全部岗位", summary.total ?? 0)}
      ${metric("未投递", summary.notApplied ?? 0)}
      ${metric("流程中", summary.applied ?? 0)}
      ${metric("面试中", summary.interviewing ?? 0)}
    </section>
    <section class="panel career-quick-add">
      <div class="item-row">
        <div>
          <span class="eyebrow">今日投递记录</span>
          <h2>快速写入今天投递的岗位</h2>
        </div>
        <span class="badge blue">${localDateString()}</span>
      </div>
      <div class="career-quick-grid">
        <input id="quickCareerCompany" placeholder="公司名称" aria-label="公司名称" />
        <input id="quickCareerPosition" placeholder="岗位名称" aria-label="岗位名称" />
        <input id="quickCareerCity" placeholder="城市" aria-label="城市" />
        <select id="quickCareerStatus" aria-label="投递进度">
          ${(state.career.statuses || []).map((status) => `<option value="${status}" ${status === "已投递" ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <input id="quickCareerJobUrl" placeholder="岗位链接 / JD 链接" aria-label="岗位链接" />
        <input id="quickCareerChannel" placeholder="渠道：官网 / 牛客 / BOSS / 内推" aria-label="投递渠道" />
        <input id="quickCareerDate" type="date" value="${localDateString()}" aria-label="投递日期" />
        <input id="quickCareerNextStep" placeholder="下一步：笔试 / 约面 / 补简历 / 等反馈" aria-label="下一步" />
        <button id="quickAddCareerBtn" class="primary">加入今日记录</button>
      </div>
    </section>
    <section class="grid two career-layout">
      <div class="panel">
        <div class="item-row">
          <h2>投递漏斗</h2>
          <span class="badge">更新时间：${escapeHtml(state.career.updatedAt || "-")}</span>
        </div>
        ${careerFunnel(summary.byStatus || {})}
      </div>
      <div class="panel">
        <h2>本周建议</h2>
        <div class="list compact-list">
          <div class="compact-task"><div><strong>每天 2 个有效投递</strong><p>先投与数据分析、算法、能源数字化、AI 产品相关岗位。</p></div><span class="badge blue">秋招</span></div>
          <div class="compact-task"><div><strong>复盘项目经历</strong><p>梳理项目职责、技术方案和量化成果，准备 STAR 项目描述。</p></div><span class="badge green">简历</span></div>
          <div class="compact-task"><div><strong>笔试固定训练</strong><p>把 SQL、Python、机器学习基础和业务分析题放到任务页追踪。</p></div><span class="badge amber">笔试</span></div>
        </div>
      </div>
    </section>
    ${careerAssessmentTracker(state.career.items || [])}
    <section class="panel">
      <div class="item-row">
        <h2>岗位清单</h2>
        <span class="badge">${summary.total ?? 0} 个岗位</span>
      </div>
      <div id="careerEditor" class="career-editor"></div>
    </section>
  `;
  renderCareerRows();
  document.querySelector("#addCareerBtn").addEventListener("click", addCareerItem);
  document.querySelector("#quickAddCareerBtn").addEventListener("click", addQuickCareerItem);
  document.querySelector("#saveCareerBtn").addEventListener("click", saveCareer);
}

async function loadResumes(force = false) {
  if (!state.resumes || force) state.resumes = await api("/api/career/resumes");
  if (!state.career || force) state.career = await api("/api/career");
  const summary = state.resumes.summary || {};
  content.innerHTML = `
    <section class="workbench-hero resume-hero resume-apply-hero">
      <div>
        <span class="eyebrow">秋招官网填写台</span>
        <h2>先选方向，再复制简历、项目和问卷答案</h2>
        <p>把官网投递最常填的内容集中到一屏：方向对应简历、项目顺序、AI 使用案例、职业规划、作品集和附件材料。</p>
      </div>
      <div class="hero-actions">
        <button id="addResumeVersionBtn" class="secondary">新增简历版本</button>
        <button id="copyResumePackBtn" class="secondary">复制当前方向包</button>
        <button id="saveResumesBtn" class="primary">保存简历素材</button>
      </div>
    </section>
    <section class="resume-status-strip">
      <span>${summary.categoryCount ?? 0} 个投递方向</span>
      <span>${summary.resumeCount ?? 0} 份简历/材料</span>
      <span>${applicationQuestions().length || summary.fillItemCount || 0} 条官网答案</span>
      <span>${summary.assetCount ?? 0} 个附件</span>
      <span>${escapeHtml(state.resumes.message || "")}</span>
    </section>
    <section class="resume-apply-grid">
      <aside class="panel resume-direction-desk">
        <div class="item-row">
          <div>
            <span class="eyebrow">方向与简历</span>
            <h2>投哪个方向，就用哪份版本</h2>
          </div>
        </div>
        <div id="resumeCategoryTabs" class="resume-direction-list"></div>
        <div id="resumeCategoryPanel" class="resume-direction-focus"></div>
      </aside>
      <section class="panel resume-question-panel">
        <div class="item-row">
          <div>
            <span class="eyebrow">官网填写问题库</span>
            <h2>常见问题直接复制，答案可现场改</h2>
          </div>
          <div class="button-row inline-actions">
            <input id="resumeMaterialSearch" class="resume-search" value="${escapeAttr(state.resumeMaterialSearch || "")}" placeholder="搜索 AI 使用、Agent、到岗、作品集" aria-label="搜索官网填写问题" />
            <button id="addResumeFillItemBtn" class="secondary compact-button">新增问题</button>
          </div>
        </div>
        <div id="resumeQuestionTabs" class="resume-tabs compact"></div>
        <div id="resumeQuestionBank" class="resume-question-bank"></div>
        <details class="resume-legacy-bank">
          <summary>旧素材库：项目、教育、面试速记等完整资料</summary>
          <div id="resumeFillTabs" class="resume-tabs compact"></div>
          <div id="resumeFillBank" class="resume-fill-bank"></div>
        </details>
      </section>
      <aside id="resumeSupportPanel" class="resume-support-stack"></aside>
    </section>
  `;
  renderResumeDirectionDesk();
  renderApplicationQuestions();
  renderResumeFillBank();
  renderResumeSupportPanel();
  bindResumeControls();
}

function bindResumeControls() {
  document.querySelector("#saveResumesBtn")?.addEventListener("click", saveResumes);
  document.querySelector("#copyResumePackBtn")?.addEventListener("click", copySelectedResumePack);
  document.querySelector("#addResumeVersionBtn")?.addEventListener("click", addResumeVersion);
  document.querySelector("#addResumeFillItemBtn")?.addEventListener("click", addApplicationQuestion);
  document.querySelector("#resumeMaterialSearch")?.addEventListener("input", (event) => {
    collectResumeDraft();
    state.resumeMaterialSearch = event.currentTarget.value || "";
    renderApplicationQuestions();
    renderResumeFillBank();
    const input = document.querySelector("#resumeMaterialSearch");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
}

function resumeCategories() {
  return state.resumes?.categories || [];
}

function resumeFillSections() {
  return state.resumes?.fillSections || [];
}

function selectedResumeCategory() {
  const categories = resumeCategories();
  if (!categories.some((category) => category.id === state.selectedResumeCategory)) {
    state.selectedResumeCategory = categories[0]?.id || "";
  }
  return categories.find((category) => category.id === state.selectedResumeCategory) || null;
}

function selectedResumeFillSection() {
  const sections = resumeFillSections();
  if (!sections.some((section) => section.id === state.selectedResumeFillSection)) {
    state.selectedResumeFillSection = sections[0]?.id || "";
  }
  return sections.find((section) => section.id === state.selectedResumeFillSection) || null;
}

function applicationQuestionGroups() {
  return [
    { id: "common", title: "常用必填", hint: "个人优势、到岗、城市、作品集等官网高频项。" },
    { id: "ai-agent", title: "AI / Agent", hint: "AI 使用案例、Agent、RAG、AI Coding 和效果提升。" },
    { id: "projects", title: "项目经历", hint: "阿里云、文辞 AI、本地工作台和挑战复盘。" },
    { id: "internship", title: "实习经历", hint: "实习职责、团队协作和独立负责部分。" },
    { id: "career", title: "职业规划", hint: "岗位动机、职业目标和方向匹配。" },
    { id: "attachments", title: "附件 / 链接", hint: "GitHub、作品集、证书、成绩单和材料清单。" },
    { id: "game", title: "待补专项", hint: "游戏经历和游戏 AI 问答，先占位后补真实内容。" },
  ];
}

function applicationQuestions() {
  if (!Array.isArray(state.resumes?.applicationQuestions)) {
    state.resumes.applicationQuestions = applicationQuestionsFromLegacy();
  }
  return state.resumes.applicationQuestions || [];
}

function applicationQuestionsFromLegacy() {
  return resumeFillSections().flatMap((section) => (section.items || []).map((item, index) => ({
    id: `legacy-${section.id}-${index}`,
    groupId: section.id === "forms" ? "common" : section.id,
    title: item.label || "未命名问题",
    questionPatterns: [item.label || ""],
    value: resumeItemText(item),
    note: item.note || section.description || "",
    tags: item.tags || [],
    categoryIds: ["ai-agent", "agent-algorithm", "ai-application-dev", "supply-chain-ai", "game-ai"],
    answerType: "textarea",
  })));
}

function selectedApplicationQuestionGroup() {
  const groups = applicationQuestionGroups();
  if (!groups.some((group) => group.id === state.selectedApplicationQuestionGroup)) {
    state.selectedApplicationQuestionGroup = groups[0]?.id || "common";
  }
  return groups.find((group) => group.id === state.selectedApplicationQuestionGroup) || groups[0];
}

function renderResumeDirectionDesk() {
  const tabs = document.querySelector("#resumeCategoryTabs");
  const panel = document.querySelector("#resumeCategoryPanel");
  if (!tabs || !panel) return;
  const categories = resumeCategories();
  const active = selectedResumeCategory();
  tabs.innerHTML = categories.map((category) => resumeDirectionButton(category)).join("") || "<p>还没有岗位方向。</p>";
  panel.innerHTML = active ? resumeDirectionFocus(active) : `<div class="empty-state">还没有简历方向数据。</div>`;
  tabs.querySelectorAll("[data-resume-category]").forEach((button) => {
    button.addEventListener("click", () => {
      collectResumeDraft();
      state.selectedResumeCategory = button.dataset.resumeCategory || "";
      renderResumeDirectionDesk();
      renderApplicationQuestions();
      renderResumeSupportPanel();
    });
  });
}

function resumeDirectionButton(category) {
  const recommended = (state.resumes.resumes || []).find((resume) => resume.id === category.recommendedResumeId);
  const active = category.id === state.selectedResumeCategory ? "active" : "";
  return `
    <button class="resume-direction-button ${active}" data-resume-category="${escapeAttr(category.id)}" type="button">
      <span>
        <strong>${escapeHtml(category.name)}</strong>
        <em>${escapeHtml((category.targetRoles || []).slice(0, 2).join(" / ") || "待补岗位")}</em>
      </span>
      <small>${escapeHtml(recommended?.title || "待选简历")}</small>
    </button>
  `;
}

function resumeDirectionFocus(category) {
  const categoryIndex = resumeCategories().findIndex((item) => item.id === category.id);
  const resumes = (state.resumes.resumes || [])
    .map((resume, index) => [resume, index])
    .filter(([resume]) => (resume.categoryIds || []).includes(category.id));
  const recommended = (state.resumes.resumes || []).find((resume) => resume.id === category.recommendedResumeId);
  return `
    <div class="resume-direction-summary" data-resume-category-editor="${escapeAttr(category.id)}" data-category-index="${categoryIndex}">
      <div class="resume-current-card">
        <span class="badge green">推荐简历</span>
        <h3>${escapeHtml(recommended?.title || "待选择")}</h3>
        <p>${escapeHtml(recommended?.roleFit || category.positioning || "")}</p>
        <div class="button-row">
          ${recommended?.file?.url ? `<a class="primary link-button compact-button" href="${escapeAttr(recommended.file.url)}" target="_blank">打开简历</a>` : ""}
          ${recommended?.filePath ? `<button class="secondary compact-button" data-copy-text="${escapeAttr(recommended.filePath)}" data-copy-label="已复制简历路径。">复制路径</button>` : ""}
        </div>
      </div>
      ${resumeCompactList("项目顺序", category.projectOrder)}
      ${resumeCompactList("核心证据", category.evidence)}
      ${resumeCompactList("风险提醒", category.risks)}
      <details class="resume-version-drawer">
        <summary>查看简历版本与方向策略</summary>
        <div class="resume-version-grid">
          ${resumes.map(([resume, index]) => resumeVersionCard(resume, index)).join("") || `<div class="empty-state">该方向还没有绑定简历版本。</div>`}
        </div>
        <details class="resume-edit-box">
          <summary>编辑方向策略</summary>
          <div class="resume-category-edit-grid">
            <label>
              <span>方向定位</span>
              <textarea data-resume-category-field="positioning">${escapeHtml(category.positioning || "")}</textarea>
            </label>
            <label>
              <span>目标岗位，每行一条</span>
              <textarea data-resume-category-field="targetRoles" data-value-kind="lines">${escapeHtml(listToText(category.targetRoles))}</textarea>
            </label>
            <label>
              <span>项目顺序，每行一条</span>
              <textarea data-resume-category-field="projectOrder" data-value-kind="lines">${escapeHtml(listToText(category.projectOrder))}</textarea>
            </label>
            <label>
              <span>核心证据，每行一条</span>
              <textarea data-resume-category-field="evidence" data-value-kind="lines">${escapeHtml(listToText(category.evidence))}</textarea>
            </label>
            <label>
              <span>投递填写重点，每行一条</span>
              <textarea data-resume-category-field="fillFocus" data-value-kind="lines">${escapeHtml(listToText(category.fillFocus))}</textarea>
            </label>
            <label>
              <span>风险提醒，每行一条</span>
              <textarea data-resume-category-field="risks" data-value-kind="lines">${escapeHtml(listToText(category.risks))}</textarea>
            </label>
            <label>
              <span>下一步，每行一条</span>
              <textarea data-resume-category-field="nextActions" data-value-kind="lines">${escapeHtml(listToText(category.nextActions))}</textarea>
            </label>
            <label>
              <span>推荐简历 ID</span>
              <input data-resume-category-field="recommendedResumeId" value="${escapeAttr(category.recommendedResumeId || "")}" />
            </label>
          </div>
        </details>
      </details>
    </div>
  `;
}

function resumeCompactList(titleText, items = []) {
  const rows = Array.isArray(items) ? items : [items].filter(Boolean);
  return `
    <div class="resume-compact-list">
      <strong>${escapeHtml(titleText)}</strong>
      ${rows.map((item) => `<p>${escapeHtml(item)}</p>`).join("") || "<p>待补充</p>"}
    </div>
  `;
}

function renderApplicationQuestions() {
  const tabs = document.querySelector("#resumeQuestionTabs");
  const bank = document.querySelector("#resumeQuestionBank");
  if (!tabs || !bank) return;
  const groups = applicationQuestionGroups();
  const active = selectedApplicationQuestionGroup();
  const category = selectedResumeCategory();
  const query = (state.resumeMaterialSearch || "").trim().toLowerCase();
  tabs.innerHTML = groups.map((group) => {
    const count = applicationQuestions().filter((item) => item.groupId === group.id).length;
    return `
      <button class="secondary chip ${group.id === state.selectedApplicationQuestionGroup ? "active" : ""}" data-question-group="${escapeAttr(group.id)}">
        ${escapeHtml(group.title)} <span>${count}</span>
      </button>
    `;
  }).join("");
  const rows = applicationQuestions()
    .map((item, index) => [item, index])
    .filter(([item]) => query || !active?.id || item.groupId === active.id)
    .filter(([item]) => {
      if (query) return true;
      const categoryIds = item.categoryIds || [];
      return !category?.id || !categoryIds.length || categoryIds.includes(category.id);
    })
    .filter(([item]) => {
      if (!query) return true;
      return [
        item.title,
        (item.questionPatterns || []).join(" "),
        resumeItemText(item),
        item.note,
        tagsToText(item.tags || []),
      ].join(" ").toLowerCase().includes(query);
    });
  bank.innerHTML = `
    <div class="resume-section-intro slim">
      <div>
        <strong>${escapeHtml(query ? `搜索结果：${state.resumeMaterialSearch}` : active?.title || "官网问题")}</strong>
        <p>${escapeHtml(query ? "搜索会跨方向和分组查找，适合官网投递时临时定位题目。" : active?.hint || "")}</p>
      </div>
      <span class="badge">${rows.length} 条</span>
    </div>
    <div class="resume-question-list">
      ${rows.map(([item, index]) => applicationQuestionRow(item, index)).join("") || `<div class="empty-state">这个方向下暂时没有匹配问题。</div>`}
    </div>
  `;
  tabs.querySelectorAll("[data-question-group]").forEach((button) => {
    button.addEventListener("click", () => {
      collectResumeDraft();
      state.selectedApplicationQuestionGroup = button.dataset.questionGroup || "common";
      state.resumeMaterialSearch = "";
      const input = document.querySelector("#resumeMaterialSearch");
      if (input) input.value = "";
      renderApplicationQuestions();
    });
  });
  bank.querySelectorAll("[data-delete-application-question]").forEach((button) => {
    button.addEventListener("click", () => deleteApplicationQuestion(Number(button.dataset.deleteApplicationQuestion)));
  });
}

function applicationQuestionRow(item, index) {
  const inputId = `application-question-${safeDomId(item.id || index)}`;
  const patterns = Array.isArray(item.questionPatterns) ? item.questionPatterns : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return `
    <article class="application-question-card" data-application-question-index="${index}">
      <div class="application-question-head">
        <input data-application-question-field="title" value="${escapeAttr(item.title || "")}" aria-label="问题标题" />
        <div class="button-row inline-actions">
          <button class="secondary compact-button" data-copy-source="${escapeAttr(inputId)}" data-copy-label="已复制官网答案。">复制答案</button>
          <button class="danger compact-button" data-delete-application-question="${index}" type="button">删除</button>
        </div>
      </div>
      ${patterns.length ? `<p class="question-patterns">${patterns.map((pattern) => escapeHtml(pattern)).join(" / ")}</p>` : ""}
      <textarea id="${escapeAttr(inputId)}" data-application-question-field="value" placeholder="投递官网可直接复制的答案">${escapeHtml(resumeItemText(item))}</textarea>
      <div class="question-card-footer">
        <span>${escapeHtml(item.note || "投递前可按公司和岗位名称轻微替换。")}</span>
        <div>${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div>
      </div>
      <details class="question-more">
        <summary>更多设置</summary>
        <div class="resume-fill-meta">
          <input data-application-question-field="groupId" value="${escapeAttr(item.groupId || "")}" placeholder="分组 ID" />
          <input data-application-question-field="categoryIds" data-value-kind="tags" value="${escapeAttr(tagsToText(item.categoryIds || []))}" placeholder="适用方向 ID" />
          <input data-application-question-field="tags" data-value-kind="tags" value="${escapeAttr(tagsToText(item.tags || []))}" placeholder="标签，用逗号分隔" />
          <input data-application-question-field="questionPatterns" data-value-kind="tags" value="${escapeAttr(tagsToText(patterns))}" placeholder="官网题目写法" />
          <input data-application-question-field="note" value="${escapeAttr(item.note || "")}" placeholder="备注 / 使用场景" />
          <input data-application-question-field="answerType" value="${escapeAttr(item.answerType || "textarea")}" placeholder="答案类型" />
        </div>
      </details>
    </article>
  `;
}

function renderResumeSupportPanel() {
  const panel = document.querySelector("#resumeSupportPanel");
  if (!panel) return;
  const category = selectedResumeCategory();
  const recommended = (state.resumes.resumes || []).find((resume) => resume.id === category?.recommendedResumeId);
  const assets = state.resumes?.assetFiles || [];
  const keyAssets = assets.filter((asset) => /简历|证件照|证书|成绩单|天池|mcm|mathor/i.test(asset.name)).slice(0, 8);
  panel.innerHTML = `
    <section class="panel">
      <div class="item-row">
        <h2>当前投递提示</h2>
        <span class="badge">${state.career?.summary?.total ?? 0} 个岗位</span>
      </div>
      ${resumeCareerSignals(state.career?.items || [])}
    </section>
    <section class="panel resume-now-card">
      <h2>当前方向</h2>
      <p><strong>${escapeHtml(category?.name || "未选择")}</strong></p>
      <p>${escapeHtml(category?.positioning || "")}</p>
      <div class="resume-current-card small">
        <span class="badge green">推荐</span>
        <strong>${escapeHtml(recommended?.title || "待选择简历")}</strong>
        <div class="button-row">
          ${recommended?.file?.url ? `<a class="primary link-button compact-button" href="${escapeAttr(recommended.file.url)}" target="_blank">打开</a>` : ""}
          ${recommended?.filePath ? `<button class="secondary compact-button" data-copy-text="${escapeAttr(recommended.filePath)}" data-copy-label="已复制简历路径。">复制路径</button>` : ""}
        </div>
      </div>
    </section>
    <section class="panel">
      <details class="resume-support-details" open>
        <summary>待补字段提醒</summary>
        <div class="list compact-list">${resumeTodoCards().join("") || "<p>暂无待补字段。</p>"}</div>
      </details>
    </section>
    <section class="panel resume-assets-panel">
      <details class="resume-support-details">
        <summary>附件快捷打开 <span>${assets.length} 个</span></summary>
        <div class="list compact-list">
          ${keyAssets.map(resumeAssetCard).join("") || "<p>没有扫描到附件。</p>"}
        </div>
      </details>
    </section>
    <section class="panel">
      <details class="resume-support-details">
        <summary>针对你的建议</summary>
        <div class="list compact-list">${(state.resumes.suggestions || []).map(resumeSuggestionCard).join("") || "<p>暂无建议。</p>"}</div>
      </details>
    </section>
  `;
}

function resumeTodoCards() {
  return applicationQuestions()
    .filter((item) => /待补|核对|补充|真实/.test([item.value, item.note, item.title].join(" ")))
    .slice(0, 5)
    .map((item) => `
      <div class="compact-task">
        <div>
          <strong>${escapeHtml(item.title || "")}</strong>
          <p>${escapeHtml(item.note || resumeItemText(item)).slice(0, 120)}</p>
        </div>
        <span class="badge amber">待补</span>
      </div>
    `);
}

function resumeAssetCard(asset) {
  return `
    <div class="resume-asset-card">
      <div class="item-row">
        <strong>${escapeHtml(asset.name)}</strong>
        <span class="badge">${escapeHtml(asset.suffix || "file")}</span>
      </div>
      <code>${escapeHtml(asset.path)}</code>
      <div class="button-row">
        <a class="secondary link-button compact-button" href="${escapeAttr(asset.url || "#")}" target="_blank">打开</a>
        <button class="secondary compact-button" data-copy-text="${escapeAttr(asset.path)}" data-copy-label="已复制附件路径。">复制路径</button>
      </div>
    </div>
  `;
}

function renderResumeCategories() {
  const tabs = document.querySelector("#resumeCategoryTabs");
  const panel = document.querySelector("#resumeCategoryPanel");
  if (!tabs || !panel) return;
  const categories = resumeCategories();
  const active = selectedResumeCategory();
  tabs.innerHTML = categories.map((category) => `
    <button class="secondary chip ${category.id === state.selectedResumeCategory ? "active" : ""}" data-resume-category="${escapeAttr(category.id)}">
      ${escapeHtml(category.name)}
    </button>
  `).join("") || "<p>还没有岗位方向。</p>";
  panel.innerHTML = active ? resumeCategoryDetail(active) : `<div class="empty-state">还没有简历方向数据。</div>`;
  tabs.querySelectorAll("[data-resume-category]").forEach((button) => {
    button.addEventListener("click", () => {
      collectResumeDraft();
      state.selectedResumeCategory = button.dataset.resumeCategory || "";
      renderResumeCategories();
    });
  });
}

function resumeCategoryDetail(category) {
  const categoryIndex = resumeCategories().findIndex((item) => item.id === category.id);
  const resumes = (state.resumes.resumes || [])
    .map((resume, index) => [resume, index])
    .filter(([resume]) => (resume.categoryIds || []).includes(category.id));
  const recommended = (state.resumes.resumes || []).find((resume) => resume.id === category.recommendedResumeId);
  return `
    <div class="resume-category-detail" data-resume-category-editor="${escapeAttr(category.id)}" data-category-index="${categoryIndex}">
      <div class="resume-category-head">
        <div>
          <h3>${escapeHtml(category.name)}</h3>
          <p>${escapeHtml(category.positioning || "")}</p>
        </div>
        <span class="badge green">推荐：${escapeHtml(recommended?.title || "待选择")}</span>
      </div>
      <div class="resume-direction-grid">
        ${resumeInfoBlock("目标岗位", category.targetRoles)}
        ${resumeInfoBlock("项目顺序", category.projectOrder)}
        ${resumeInfoBlock("核心证据", category.evidence)}
        ${resumeInfoBlock("风险提醒", category.risks)}
      </div>
      <details class="resume-edit-box">
        <summary>编辑方向策略</summary>
        <div class="resume-category-edit-grid">
          <label>
            <span>方向定位</span>
            <textarea data-resume-category-field="positioning">${escapeHtml(category.positioning || "")}</textarea>
          </label>
          <label>
            <span>目标岗位，每行一条</span>
            <textarea data-resume-category-field="targetRoles" data-value-kind="lines">${escapeHtml(listToText(category.targetRoles))}</textarea>
          </label>
          <label>
            <span>项目顺序，每行一条</span>
            <textarea data-resume-category-field="projectOrder" data-value-kind="lines">${escapeHtml(listToText(category.projectOrder))}</textarea>
          </label>
          <label>
            <span>核心证据，每行一条</span>
            <textarea data-resume-category-field="evidence" data-value-kind="lines">${escapeHtml(listToText(category.evidence))}</textarea>
          </label>
          <label>
            <span>投递填写重点，每行一条</span>
            <textarea data-resume-category-field="fillFocus" data-value-kind="lines">${escapeHtml(listToText(category.fillFocus))}</textarea>
          </label>
          <label>
            <span>风险提醒，每行一条</span>
            <textarea data-resume-category-field="risks" data-value-kind="lines">${escapeHtml(listToText(category.risks))}</textarea>
          </label>
          <label>
            <span>下一步，每行一条</span>
            <textarea data-resume-category-field="nextActions" data-value-kind="lines">${escapeHtml(listToText(category.nextActions))}</textarea>
          </label>
          <label>
            <span>推荐简历 ID</span>
            <input data-resume-category-field="recommendedResumeId" value="${escapeAttr(category.recommendedResumeId || "")}" />
          </label>
        </div>
      </details>
      <div class="resume-version-grid">
        ${resumes.map(([resume, index]) => resumeVersionCard(resume, index)).join("") || `<div class="empty-state">该方向还没有绑定简历版本。</div>`}
      </div>
    </div>
  `;
}

function resumeInfoBlock(titleText, items = []) {
  const rows = Array.isArray(items) ? items : [items].filter(Boolean);
  return `
    <div class="resume-info-block">
      <strong>${escapeHtml(titleText)}</strong>
      <div>${rows.map((item) => `<p>${escapeHtml(item)}</p>`).join("") || "<p>待补充</p>"}</div>
    </div>
  `;
}

function resumeVersionCard(resume, index) {
  const file = resume.file;
  const preview = resume.preview;
  const image = preview?.url || (file?.suffix && [".png", ".jpg", ".jpeg", ".webp"].includes(file.suffix) ? file.url : "");
  return `
    <div class="resume-version-card" data-resume-index="${index}">
      ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(resume.title || "简历预览")}" loading="lazy" />` : ""}
      <div class="item-row">
        <input class="resume-title-input" data-resume-field="title" value="${escapeAttr(resume.title || "")}" aria-label="简历标题" />
        <span class="badge ${resume.status === "主投" ? "green" : resume.status === "历史版" ? "amber" : "blue"}">${escapeHtml(resume.status || "草稿")}</span>
      </div>
      <div class="resume-card-fields">
        <input data-resume-field="status" value="${escapeAttr(resume.status || "")}" placeholder="状态：主投 / 方向版 / 历史版" />
        <input data-resume-field="versionDate" value="${escapeAttr(resume.versionDate || "")}" placeholder="版本日期" />
        <input data-resume-field="categoryIds" data-value-kind="tags" value="${escapeAttr(tagsToText(resume.categoryIds || []))}" placeholder="绑定方向 ID" />
        <input data-resume-field="tags" data-value-kind="tags" value="${escapeAttr(tagsToText(resume.tags || []))}" placeholder="标签" />
        <input data-resume-field="filePath" value="${escapeAttr(resume.filePath || "")}" placeholder="Obsidian 文件路径" />
        <input data-resume-field="previewPath" value="${escapeAttr(resume.previewPath || "")}" placeholder="预览图路径" />
      </div>
      <textarea data-resume-field="roleFit" placeholder="适合哪些岗位">${escapeHtml(resume.roleFit || "")}</textarea>
      <textarea data-resume-field="notes" placeholder="投递备注">${escapeHtml(resume.notes || "")}</textarea>
      <div class="button-row">
        ${file?.url ? `<a class="primary link-button" href="${escapeAttr(file.url)}" target="_blank">打开简历</a>` : ""}
        ${preview?.url ? `<a class="secondary link-button" href="${escapeAttr(preview.url)}" target="_blank">打开预览</a>` : ""}
        <button class="secondary" data-copy-source="${escapeAttr(`resume-path-${index}`)}">复制路径</button>
      </div>
      <span id="resume-path-${index}" class="visually-hidden">${escapeHtml(resume.filePath || "")}</span>
    </div>
  `;
}

function renderResumeFillBank() {
  const tabs = document.querySelector("#resumeFillTabs");
  const bank = document.querySelector("#resumeFillBank");
  if (!tabs || !bank) return;
  const sections = resumeFillSections();
  const active = selectedResumeFillSection();
  const query = (state.resumeMaterialSearch || "").trim().toLowerCase();
  tabs.innerHTML = sections.map((section) => `
    <button class="secondary chip ${section.id === state.selectedResumeFillSection ? "active" : ""}" data-resume-fill-section="${escapeAttr(section.id)}">
      ${escapeHtml(section.title)} <span>${(section.items || []).length}</span>
    </button>
  `).join("") || "<p>还没有素材分类。</p>";
  const rows = active ? (active.items || [])
    .map((item, index) => [item, index])
    .filter(([item]) => {
      if (!query) return true;
      return [item.label, resumeItemText(item), item.note, tagsToText(item.tags || [])].join(" ").toLowerCase().includes(query);
    }) : [];
  bank.innerHTML = active ? `
    <div class="resume-section-intro">
      <div>
        <strong>${escapeHtml(active.title)}</strong>
        <p>${escapeHtml(active.description || "")}</p>
      </div>
      <span class="badge">${rows.length}/${(active.items || []).length}</span>
    </div>
    <div class="resume-fill-list">
      ${rows.map(([item, index]) => resumeFillRow(active, item, index)).join("") || `<div class="empty-state">没有匹配的素材。</div>`}
    </div>
  ` : `<div class="empty-state">还没有素材分类。</div>`;
  tabs.querySelectorAll("[data-resume-fill-section]").forEach((button) => {
    button.addEventListener("click", () => {
      collectResumeDraft();
      state.selectedResumeFillSection = button.dataset.resumeFillSection || "";
      state.resumeMaterialSearch = "";
      document.querySelector("#resumeMaterialSearch").value = "";
      renderResumeFillBank();
    });
  });
  bank.querySelectorAll("[data-delete-resume-fill]").forEach((button) => {
    button.addEventListener("click", () => deleteResumeFillItem(Number(button.dataset.deleteResumeFill)));
  });
}

function resumeFillRow(section, item, index) {
  const inputId = `resume-fill-${safeDomId(section.id)}-${index}`;
  return `
    <div class="resume-fill-row" data-resume-fill-row="${index}">
      <div class="resume-fill-head">
        <input data-resume-fill-field="label" value="${escapeAttr(item.label || "")}" aria-label="素材标题" />
        <div class="button-row inline-actions">
          <button class="secondary compact-button" data-copy-source="${escapeAttr(inputId)}" data-copy-label="已复制素材。">复制</button>
          <button class="danger compact-button" data-delete-resume-fill="${index}" type="button">删除</button>
        </div>
      </div>
      <textarea id="${escapeAttr(inputId)}" data-resume-fill-field="value" placeholder="投递时要复制的内容">${escapeHtml(resumeItemText(item))}</textarea>
      <div class="resume-fill-meta">
        <input data-resume-fill-field="note" value="${escapeAttr(item.note || "")}" placeholder="备注 / 使用场景" />
        <input data-resume-fill-field="tags" data-value-kind="tags" value="${escapeAttr(tagsToText(item.tags || []))}" placeholder="标签，用逗号分隔" />
      </div>
    </div>
  `;
}

function renderResumeAssets() {
  const target = document.querySelector("#resumeAssetList");
  if (!target) return;
  const assets = state.resumes?.assetFiles || [];
  target.innerHTML = assets.map((asset) => `
    <div class="resume-asset-card">
      <div class="item-row">
        <strong>${escapeHtml(asset.name)}</strong>
        <span class="badge">${escapeHtml(asset.suffix || "file")}</span>
      </div>
      <code>${escapeHtml(asset.path)}</code>
      <p>${formatSize(asset.size || 0)} · ${escapeHtml(asset.modified || "")}</p>
      <div class="button-row">
        <a class="secondary link-button" href="${escapeAttr(asset.url || "#")}" target="_blank">打开</a>
        <button class="secondary compact-button" data-copy-text="${escapeAttr(asset.path)}" data-copy-label="已复制附件路径。">复制路径</button>
      </div>
    </div>
  `).join("") || `<div class="empty-state">没有扫描到附件。</div>`;
}

function resumeSuggestionCard(item) {
  const active = (item.categoryIds || []).includes(state.selectedResumeCategory);
  return `
    <div class="compact-task resume-suggestion ${active ? "active" : ""}">
      <div>
        <strong>${escapeHtml(item.title || "")}</strong>
        <p>${escapeHtml(item.detail || "")}</p>
        ${item.action ? `<code>${escapeHtml(item.action)}</code>` : ""}
      </div>
      <span class="badge ${item.priority === "high" ? "blue" : "amber"}">${escapeHtml(item.priority || "medium")}</span>
    </div>
  `;
}

function resumeCareerSignals(items = []) {
  const signals = [
    ["AI Agent", /agent|rag|大模型|智能体|llm/i],
    ["AI 应用开发", /应用开发|全栈|研发效能|coding|codex|claude|cursor/i],
    ["供应链/能源", /供应链|物流|能源|电力|p2p|库存|分仓/i],
    ["游戏 AI", /游戏|玩家|个性化|推荐|用户画像|生命周期/i],
  ].map(([label, pattern]) => ({
    label,
    count: items.filter((item) => pattern.test([item.company, item.position, item.requirements, (item.tags || []).join(" ")].join(" "))).length,
  }));
  return `
    <div class="resume-signal-list">
      ${signals.map((signal) => `
        <div class="resume-signal">
          <span>${escapeHtml(signal.label)}</span>
          <strong>${signal.count}</strong>
        </div>
      `).join("")}
    </div>
    <p>你的当前投递池已经明显偏向 Agent、AI 应用和游戏 AI，简历页会优先围绕这几类来组织素材。</p>
  `;
}

function collectResumeDraft() {
  document.querySelectorAll("[data-resume-category-editor]").forEach((editor) => {
    const category = state.resumes.categories?.[Number(editor.dataset.categoryIndex)];
    if (!category) return;
    editor.querySelectorAll("[data-resume-category-field]").forEach((field) => {
      const key = field.dataset.resumeCategoryField;
      category[key] = field.dataset.valueKind === "lines" ? linesToList(field.value) : field.value;
    });
  });
  document.querySelectorAll("[data-resume-index]").forEach((row) => {
    const resume = state.resumes.resumes?.[Number(row.dataset.resumeIndex)];
    if (!resume) return;
    row.querySelectorAll("[data-resume-field]").forEach((field) => {
      const key = field.dataset.resumeField;
      resume[key] = field.dataset.valueKind === "tags" ? splitTags(field.value) : field.value;
    });
  });
  document.querySelectorAll("[data-application-question-index]").forEach((row) => {
    const question = applicationQuestions()[Number(row.dataset.applicationQuestionIndex)];
    if (!question) return;
    row.querySelectorAll("[data-application-question-field]").forEach((field) => {
      const key = field.dataset.applicationQuestionField;
      question[key] = field.dataset.valueKind === "tags" ? splitTags(field.value) : field.value;
    });
  });
  const section = selectedResumeFillSection();
  if (!section) return;
  document.querySelectorAll("[data-resume-fill-row]").forEach((row) => {
    const item = section.items?.[Number(row.dataset.resumeFillRow)];
    if (!item) return;
    row.querySelectorAll("[data-resume-fill-field]").forEach((field) => {
      const key = field.dataset.resumeFillField;
      item[key] = field.dataset.valueKind === "tags" ? splitTags(field.value) : field.value;
    });
  });
}

function addResumeVersion() {
  collectResumeDraft();
  const categoryId = state.selectedResumeCategory || resumeCategories()[0]?.id || "ai-agent";
  const resume = {
    id: `resume-${Date.now()}`,
    title: "新简历版本",
    status: "草稿",
    versionDate: localDateString(),
    categoryIds: [categoryId],
    filePath: "",
    previewPath: "",
    roleFit: "补充这份简历适合的岗位类型。",
    notes: "",
    tags: [],
  };
  state.resumes.resumes = state.resumes.resumes || [];
  state.resumes.resumes.unshift(resume);
  renderResumeDirectionDesk();
  renderResumeSupportPanel();
  showNotice("已新增简历版本，填写文件路径后保存。");
}

function addApplicationQuestion() {
  collectResumeDraft();
  const groupId = state.selectedApplicationQuestionGroup || applicationQuestionGroups()[0]?.id || "common";
  const categoryId = state.selectedResumeCategory || resumeCategories()[0]?.id || "ai-agent";
  state.resumes.applicationQuestions = applicationQuestions();
  state.resumes.applicationQuestions.unshift({
    id: `application-question-${Date.now()}`,
    groupId,
    title: "新官网问题",
    questionPatterns: ["待补充官网题目"],
    value: "待补充",
    note: "补完后可在投递官网直接复制。",
    tags: [],
    categoryIds: [categoryId],
    answerType: "textarea",
  });
  state.resumeMaterialSearch = "";
  const input = document.querySelector("#resumeMaterialSearch");
  if (input) input.value = "";
  renderApplicationQuestions();
  renderResumeSupportPanel();
  showNotice("已新增官网问题，编辑后记得保存。");
}

function deleteApplicationQuestion(index) {
  collectResumeDraft();
  const questions = applicationQuestions();
  if (!questions[index]) return;
  if (!window.confirm(`确认删除这条官网问题吗？\n\n${questions[index].title || "未命名问题"}`)) return;
  questions.splice(index, 1);
  renderApplicationQuestions();
  renderResumeSupportPanel();
  showNotice("已删除该官网问题，保存后写入本地文件。");
}

function addResumeFillItem() {
  collectResumeDraft();
  const section = selectedResumeFillSection();
  if (!section) return;
  section.items = section.items || [];
  section.items.unshift({
    label: "新素材",
    value: "待补充",
    note: "",
    tags: [],
  });
  state.resumeMaterialSearch = "";
  document.querySelector("#resumeMaterialSearch").value = "";
  renderResumeFillBank();
  showNotice("已新增投递素材，编辑后记得保存。");
}

function deleteResumeFillItem(index) {
  collectResumeDraft();
  const section = selectedResumeFillSection();
  if (!section?.items?.[index]) return;
  if (!window.confirm(`确认删除这条素材吗？\n\n${section.items[index].label || "未命名素材"}`)) return;
  section.items.splice(index, 1);
  renderResumeFillBank();
  showNotice("已删除该素材，保存后写入本地文件。");
}

async function saveResumes() {
  collectResumeDraft();
  const contentToSave = {
    updatedAt: state.resumes.updatedAt,
    categories: state.resumes.categories || [],
    resumes: state.resumes.resumes || [],
    applicationQuestions: applicationQuestions(),
    fillSections: state.resumes.fillSections || [],
    suggestions: state.resumes.suggestions || [],
  };
  const result = await api("/api/career/resumes/save", {
    method: "POST",
    body: JSON.stringify({ content: contentToSave }),
  });
  state.resumes = result.content;
  showNotice(`已保存简历素材库：${result.file}`);
  renderResumeDirectionDesk();
  renderApplicationQuestions();
  renderResumeFillBank();
  renderResumeSupportPanel();
}

function copySelectedResumePack() {
  collectResumeDraft();
  const text = selectedResumePackText();
  copyToClipboard(text, "已复制当前方向的简历素材。");
}

function selectedResumePackText() {
  const category = selectedResumeCategory();
  if (!category) return "";
  const resumes = (state.resumes.resumes || []).filter((resume) => (resume.categoryIds || []).includes(category.id));
  const questions = applicationQuestions().filter((item) => {
    const categoryIds = item.categoryIds || [];
    return !categoryIds.length || categoryIds.includes(category.id);
  });
  const sectionLines = resumeFillSections().map((section) => [
    `## ${section.title}`,
    ...(section.items || []).map((item) => `### ${item.label}\n${resumeItemText(item)}`),
  ].join("\n\n"));
  return [
    `# ${category.name} 简历投递素材`,
    "",
    "## 方向定位",
    category.positioning || "",
    "",
    "## 目标岗位",
    listToText(category.targetRoles),
    "",
    "## 推荐项目顺序",
    listToText(category.projectOrder),
    "",
    "## 核心证据",
    listToText(category.evidence),
    "",
    "## 可用简历",
    resumes.map((resume) => `- ${resume.title}（${resume.status || "未标记"}）：${resume.filePath || "未绑定文件"}`).join("\n"),
    "",
    "## 官网填写问题",
    questions.map((item) => `### ${item.title}\n${resumeItemText(item)}`).join("\n\n"),
    "",
    "## 旧素材库",
    sectionLines.join("\n\n"),
  ].join("\n");
}

function resumeItemText(item) {
  if (Array.isArray(item?.value)) return item.value.join("\n");
  return String(item?.value || "");
}

function listToText(value) {
  if (Array.isArray(value)) return value.join("\n");
  return String(value || "");
}

function linesToList(value) {
  return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function safeDomId(value) {
  return String(value || "item").replace(/[^\w-]/g, "-");
}

async function loadObsidian(force = false) {
  if (!state.obsidian || force) state.obsidian = await api("/api/obsidian/notes?limit=180");
  const data = state.obsidian;
  content.innerHTML = `
    <section class="workbench-hero obsidian-hero">
      <div><span class="eyebrow">Obsidian 主库</span><h2>一份笔记，两个入口</h2><p>笔记原件保存在 Obsidian 主库；工作台检索并预览同一文件。在 Obsidian 修改后，点击刷新笔记即可更新。</p></div>
      <div class="hero-actions">${data.openUrl ? `<a class="primary link-button" href="${escapeAttr(data.openUrl)}">打开当前主库</a>` : ""}<button id="refreshObsidianBtn" class="secondary">刷新笔记</button></div>
    </section>
    <section class="panel notes-connection">
      <div class="item-row"><h2>当前连接</h2><span class="badge ${data.registered ? "green" : "amber"}">${data.registered ? "已与 Obsidian 对齐" : "需要打开主库"}</span></div>
      <p>${escapeHtml(data.message || "")}</p><code>${escapeHtml(data.path || "")}</code>
      <p>展示范围：${(data.directories || []).map(item => `${escapeHtml(item.path)}（${escapeHtml(item.label)}${item.exists ? "" : "，目录缺失"}）`).join("、")}。</p>
      <p class="note-hint">只展示当前主库中的求职学习目录；简历、JD 和附件由简历页管理。</p>
    </section>
    <section class="grid cards calm-cards">${metric("主库笔记", data.total || 0)}${metric("有正文", (data.total || 0) - (data.emptyCount || 0))}${metric("空白待补", data.emptyCount || 0)}${metric("分类", Object.keys(data.categories || {}).length)}</section>
    <section class="panel obsidian-search-panel">
      <div class="obsidian-search-shell"><div class="obsidian-search-copy"><span class="eyebrow">全文检索</span><h2>找笔记，再到 Obsidian 继续写</h2><p>搜索标题、正文、路径和标签。</p></div>
      <div class="obsidian-search-controls"><div class="obsidian-search-bar"><input id="obsidianSearchInput" placeholder="输入关键词：LeetCode / SQL / RAG / 面试" aria-label="搜索主库笔记" /><button id="obsidianSearchBtn" class="primary">搜索</button></div>
      <div class="reference-chips obsidian-quick-chips">${["LeetCode", "SQL", "八股文", "AI_Agent", "大模型", "简历", "面试"].map(term => `<button class="secondary chip" data-obsidian-query="${escapeAttr(term)}">${escapeHtml(term)}</button>`).join("")}<button class="secondary chip" data-obsidian-query="">显示全部</button></div></div></div>
      <div class="obsidian-category-list">${Object.entries(data.categories || {}).map(([name, count]) => `<button class="category-pill" data-obsidian-query="${escapeAttr(name)}"><span>${escapeHtml(name)}</span><strong>${count}</strong></button>`).join("")}</div>
    </section>
    <section id="obsidianSearchResults" class="panel">${obsidianResults(data)}</section>
  `;
  document.querySelector("#refreshObsidianBtn").addEventListener("click", () => loadObsidian(true));
  document.querySelector("#obsidianSearchBtn").addEventListener("click", searchObsidianNotes);
  document.querySelector("#obsidianSearchInput").addEventListener("keydown", event => { if (event.key === "Enter") searchObsidianNotes(); });
  document.querySelectorAll("[data-obsidian-query]").forEach(button => button.addEventListener("click", () => {
    document.querySelector("#obsidianSearchInput").value = button.dataset.obsidianQuery || "";
    searchObsidianNotes();
  }));
}

function obsidianResults(data) {
  return `<div class="item-row"><h2>${data.query ? `“${escapeHtml(data.query)}” 的搜索结果` : "主库笔记清单"}</h2><span class="badge">${data.total || 0} 篇</span></div>
    ${data.searchUrl ? `<p><a class="link-button secondary" href="${escapeAttr(data.searchUrl)}">在 Obsidian 搜索同一关键词</a></p>` : ""}
    <div class="list library-list">${(data.notes || []).map(obsidianNoteCard).join("") || "<p>没有匹配笔记，可修改关键词或显示全部。</p>"}</div>`;
}

function obsidianNoteCard(note) {
  return `<div class="obsidian-note-card item">
    <div class="item-row"><strong>${escapeHtml(note.name || note.fileName || "")}</strong><span class="badge">${escapeHtml(note.category || "笔记")}</span></div>
    <code>${escapeHtml(note.path || "")}</code>
    ${note.empty ? '<p class="note-empty">这是一篇空白笔记，文件存在，正文尚未填写。</p>' : `<p>${escapeHtml(note.excerpt || "")}</p>`}
    <div class="tag-line">${(note.tags || []).slice(0, 5).map(tag => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="button-row">${note.obsidianUrl ? `<a class="primary link-button" href="${escapeAttr(note.obsidianUrl)}">在 Obsidian 打开</a>` : ""}<a class="secondary link-button" href="${escapeAttr(note.url || "#")}" target="_blank">网页预览</a><button class="secondary" data-copy-text="${escapeAttr(note.absolutePath || "")}" data-copy-label="已复制笔记原件路径。">复制文件路径</button></div>
  </div>`;
}

async function searchObsidianNotes() {
  const query = document.querySelector("#obsidianSearchInput")?.value.trim() || "";
  const panel = document.querySelector("#obsidianSearchResults");
  if (!panel) return;
  panel.innerHTML = "<h2>搜索中</h2><p>正在检索主库笔记正文…</p>";
  try {
    const result = await api(`/api/obsidian/notes?q=${encodeURIComponent(query)}&limit=180`);
    panel.innerHTML = obsidianResults(result);
  } catch (error) {
    panel.innerHTML = `<h2>搜索未完成</h2><p>${escapeHtml(error.message)}</p>`;
  }
}

async function loadProgress(force = false) {
  if (!state.progress || force) state.progress = await api("/api/progress");
  if (!state.dailyPlan || force) state.dailyPlan = await api(`/api/daily-plan?date=${encodeURIComponent(state.selectedDate)}`);
  const items = state.progress.items || [];
  content.innerHTML = `
    <section class="workbench-hero compact-hero">
      <div>
        <span class="eyebrow">任务池</span>
        <h2>管理长期任务，今日 Todo 只做执行入口</h2>
        <p>这里维护投递、简历、笔试和面试的长期任务；每日计划支持按日期安排和番茄钟专注。</p>
      </div>
      <div class="hero-actions">
        <button id="addProgressBtn" class="secondary">新增任务</button>
        <button id="saveProgressBtn" class="primary">保存任务</button>
      </div>
    </section>
    ${dailyPlanPanel(state.dailyPlan, false)}
    <section class="grid cards calm-cards">
      ${metric("全部任务", items.length)}
      ${metric("进行中", items.filter(item => ["running", "in_review"].includes(item.status)).length)}
      ${metric("已完成", items.filter(item => item.status === "completed").length)}
      ${metric("高优先级", (state.progress.items || []).filter((item) => item.priority === "high").length)}
    </section>
    <section class="panel">
      <div class="item-row">
        <h2>长期任务编辑</h2>
        <span class="badge">更新时间：${escapeHtml(state.progress.updatedAt || "-")}</span>
      </div>
      <div id="progressEditor" class="progress-board"></div>
    </section>
  `;
  bindDailyPlanControls();
  renderProgressRows();
  document.querySelector("#addProgressBtn").addEventListener("click", () => {
    state.progress.items.push({
      id: `task-${Date.now()}`,
      title: "新求职任务",
      status: "todo",
      priority: "medium",
      category: "career",
      risk: "",
      nextStep: "",
      notes: "",
    });
    renderProgressRows();
  });
  document.querySelector("#saveProgressBtn").addEventListener("click", saveProgress);
}

function renderProgressRows() {
  const items = state.progress.items || [];
  document.querySelector("#progressEditor").innerHTML = [
    ["career", "投递跟进"], ["resume", "简历准备"], ["study", "笔试学习"], ["interview", "面试准备"]
  ].map(([category, name]) => {
    const rows = items.map((item, index) => [item, index]).filter(([item]) => (item.category || "career") === category);
    return `<div class="progress-column"><h3>${name} <span class="badge">${rows.length}</span></h3>${rows.map(([item, index]) => progressEditorRow(item, index)).join("") || "<p>暂无任务。</p>"}</div>`;
  }).join("");
}

function progressEditorRow(item, index) {
  return `
    <div class="progress-row" data-index="${index}">
      <input data-field="title" value="${escapeAttr(item.title)}" aria-label="任务标题" />
      <div class="progress-selects">
        <select data-field="category" aria-label="任务类型">
          ${[
            ["career", "投递跟进"],
            ["resume", "简历准备"],
            ["study", "笔试学习"],
            ["interview", "面试准备"],
          ].map(([value, label]) => `<option value="${value}" ${(item.category || "career") === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <select data-field="status" aria-label="任务状态">
          ${["todo", "running", "in_review", "completed", "blocked"].map((value) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}
        </select>
        <select data-field="priority" aria-label="优先级">
          ${["high", "medium", "low"].map((value) => `<option value="${value}" ${item.priority === value ? "selected" : ""}>${priorityLabel(value)}</option>`).join("")}
        </select>
      </div>
      <textarea data-field="nextStep" placeholder="下一步">${escapeHtml(item.nextStep || "")}</textarea>
      <textarea data-field="risk" placeholder="风险 / 备注">${escapeHtml(item.risk || item.notes || "")}</textarea>
    </div>
  `;
}

async function saveProgress() {
  document.querySelectorAll(".progress-row").forEach((row) => {
    const item = state.progress.items[Number(row.dataset.index)];
    row.querySelectorAll("[data-field]").forEach((field) => {
      item[field.dataset.field] = field.value;
    });
  });
  const result = await api("/api/progress/save", {
    method: "POST",
    body: JSON.stringify({ content: state.progress }),
  });
  showNotice(`已保存进度：${result.file}`);
  state.progress = await api("/api/progress");
  renderProgressRows();
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shiftDateText(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function dailyPlanPanel(plan, compact = false) {
  const summary = plan?.summary || {};
  const completion = Number(summary.completionRate || 0);
  const achievement = Number(summary.achievementRate || 0);
  const recommendations = plan?.recommendations || [];
  const tagSuggestions = plan?.tagSuggestions || [];
  return `
    <section class="panel daily-plan-panel ${compact ? "compact-daily" : ""}">
      <div class="daily-plan-head">
        <div>
          <span class="eyebrow">日期计划</span>
          <h2>${formatDateTitle(plan?.date || state.selectedDate)} Todo</h2>
          <p>${escapeHtml(plan?.focus || "今天至少留下一个可复用产出。")}</p>
        </div>
        <div class="date-tools">
          <button class="secondary" data-date-today="true">今天</button>
          <button class="secondary" data-date-shift="-1">前一天</button>
          <input id="dailyDateInput" type="date" value="${escapeAttr(plan?.date || state.selectedDate)}" aria-label="计划日期" />
          <button class="secondary" data-date-shift="1">后一天</button>
          <button id="addDailyTodoBtn" class="secondary">新增 Todo</button>
          <button id="saveDailyPlanBtn" class="primary">保存今日计划</button>
        </div>
      </div>
      <div class="daily-morning-box">
        <label>
          <span>今日主线</span>
          <input id="dailyFocusInput" value="${escapeAttr(plan?.focus || "")}" placeholder="今天最重要的一句话" />
        </label>
        <label>
          <span>早晨记录</span>
          <textarea id="dailyMorningNoteInput" placeholder="打开电脑后先写：今天要完成什么，做到什么程度才算达标。">${escapeHtml(plan?.morningNote || "")}</textarea>
        </label>
      </div>
      <div class="daily-plan-summary">
        <div class="daily-ring" style="--value:${completion}"><strong>${completion}%</strong><span>完成度</span></div>
        <div class="daily-summary-grid">
          <div><strong>${summary.done ?? 0}</strong><span>已完成</span></div>
          <div><strong>${summary.achieved ?? 0}</strong><span>已达标</span></div>
          <div><strong>${summary.remaining ?? 0}</strong><span>未完成</span></div>
          <div><strong>${summary.total ?? 0}</strong><span>今日事项</span></div>
          <div><strong>${achievement}%</strong><span>达标率</span></div>
          <div><strong>${summary.completedPomodoros ?? 0}/${summary.plannedPomodoros ?? 0}</strong><span>番茄钟</span></div>
        </div>
      </div>
      <div class="daily-workspace">
        <div>
          <div class="item-row">
            <h3>我的 Todo</h3>
            <div class="button-row inline-actions">
              <span class="badge">${summary.total ?? 0} 项</span>
              <button id="addDailyTodoInlineBtn" class="secondary compact-button">添加 Todo</button>
            </div>
          </div>
          <div id="dailyTodoList" class="daily-todo-list"></div>
        </div>
        <aside class="daily-recommend-panel">
          ${pomodoroPanel(plan)}
          <div class="item-row">
            <h3>推荐今日 Todo</h3>
            <span class="badge green">可一键加入</span>
          </div>
          <div class="daily-tag-cloud">
            ${tagSuggestions.map((tag) => `<button class="tag-chip" data-add-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}
          </div>
          <div class="list compact-list">
            ${recommendations.map((item, index) => recommendedTodoCard(item, index)).join("") || "<p>暂无推荐。</p>"}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function bindDailyPlanControls() {
  renderDailyTodoRows();
  document.querySelector("#dailyDateInput")?.addEventListener("change", async (event) => {
    state.selectedDate = event.currentTarget.value || localDateString();
    state.dailyPlan = await api(`/api/daily-plan?date=${encodeURIComponent(state.selectedDate)}`);
    loadCurrent(false);
  });
  document.querySelectorAll("[data-date-shift]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedDate = shiftDateText(state.dailyPlan?.date || state.selectedDate, Number(button.dataset.dateShift));
      state.dailyPlan = await api(`/api/daily-plan?date=${encodeURIComponent(state.selectedDate)}`);
      loadCurrent(false);
    });
  });
  document.querySelector("#addDailyTodoBtn")?.addEventListener("click", addDailyTodo);
  document.querySelector("#addDailyTodoInlineBtn")?.addEventListener("click", addDailyTodo);
  document.querySelector("#saveDailyPlanBtn")?.addEventListener("click", saveDailyPlan);
  document.querySelector("[data-date-today]")?.addEventListener("click", async () => {
    state.selectedDate = localDateString();
    state.dailyPlan = await api(`/api/daily-plan?date=${encodeURIComponent(state.selectedDate)}`);
    loadCurrent(false);
  });
  document.querySelectorAll("[data-add-recommendation]").forEach((button) => {
    button.addEventListener("click", () => addRecommendedTodo(Number(button.dataset.addRecommendation)));
  });
  document.querySelectorAll("[data-add-tag]").forEach((button) => {
    button.addEventListener("click", () => addTagToLastFocusedTodo(button.dataset.addTag || ""));
  });
  bindPomodoroControls();
}

function renderDailyTodoRows() {
  const target = document.querySelector("#dailyTodoList");
  if (!target) return;
  const items = state.dailyPlan?.items || [];
  target.innerHTML = `
    ${items.map((item, index) => dailyTodoRow(item, index)).join("") || "<p>今天还没有 todo。</p>"}
  `;
  target.querySelectorAll(".daily-check input").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const row = checkbox.closest(".daily-row");
      row.classList.toggle("done", checkbox.checked);
      row.querySelector('[data-daily-field="status"]').value = checkbox.checked ? "done" : "todo";
    });
  });
  target.querySelectorAll('[data-daily-field="status"]').forEach((select) => {
    select.addEventListener("change", () => {
      const row = select.closest(".daily-row");
      const checked = select.value === "done";
      row.classList.toggle("done", checked);
      row.querySelector(".daily-check input").checked = checked;
    });
  });
  target.querySelectorAll("[data-delete-daily-todo]").forEach((button) => {
    button.addEventListener("click", () => deleteDailyTodo(Number(button.dataset.deleteDailyTodo)));
  });
  bindDailyPomodoroButtons();
}

function bindDailyPomodoroButtons() {
  document.querySelectorAll("[data-start-pomodoro]").forEach((button) => {
    button.addEventListener("click", () => {
      startPomodoroForTask(button.dataset.startPomodoro || "");
    });
  });
}

function dailyTodoRow(item, index) {
  const done = item.status === "done";
  const categories = state.dailyPlan?.categories || ["岗位投递", "LeetCode", "八股文", "简历优化", "面试准备", "测评笔试"];
  const tags = splitTags(item.tags);
  const status = item.status || "todo";
  return `
    <div class="daily-row ${done ? "done" : ""}" data-index="${index}">
      <div class="daily-main">
        <div class="daily-title-line">
          <label class="daily-check">
            <input type="checkbox" ${done ? "checked" : ""} aria-label="完成状态" />
            <span></span>
          </label>
          <input class="daily-title-input" data-daily-field="title" value="${escapeAttr(item.title || "")}" placeholder="今天要完成什么" aria-label="Todo 标题" />
          <button class="danger compact-button" data-delete-daily-todo="${index}" aria-label="删除 Todo">删除</button>
        </div>
        <div class="daily-brief">
          <span>${escapeHtml(item.category || "岗位投递")}</span>
          <span>${escapeHtml(dailyStatusLabel(status))}</span>
          ${item.timeBlock ? `<span>${escapeHtml(item.timeBlock)}</span>` : ""}
          ${item.estimatedMinutes ? `<span>${escapeHtml(String(item.estimatedMinutes))} 分钟</span>` : ""}
          ${Number(item.plannedPomodoros || 0) ? `<span>${escapeHtml(String(item.completedPomodoros || 0))}/${escapeHtml(String(item.plannedPomodoros || 0))} 番茄</span>` : ""}
          ${tags.slice(0, 4).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="daily-meta-grid">
          <label>
            <span>类型</span>
            <select data-daily-field="category" aria-label="任务类型">
              ${categories.map((category) => `<option value="${category}" ${(item.category || "岗位投递") === category ? "selected" : ""}>${category}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>状态</span>
            <select data-daily-field="status" aria-label="状态">
              ${["todo", "running", "done"].map((value) => `<option value="${value}" ${(item.status || "todo") === value ? "selected" : ""}>${dailyStatusLabel(value)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>时间段</span>
            <input data-daily-field="timeBlock" value="${escapeAttr(item.timeBlock || "")}" placeholder="上午 / 下午 / 晚上" aria-label="时间段" />
          </label>
          <label>
            <span>分钟</span>
            <input data-daily-field="estimatedMinutes" type="number" min="0" value="${escapeAttr(item.estimatedMinutes ?? "")}" placeholder="分钟" aria-label="预计分钟" />
          </label>
        </div>
        <div class="daily-control-line">
          <label class="goal-toggle">
            <input data-daily-field="goalMet" type="checkbox" ${item.goalMet ? "checked" : ""} />
            <span>达到目标</span>
          </label>
          <label class="pomodoro-mini-field">
            <span>计划番茄</span>
            <input data-daily-field="plannedPomodoros" type="number" min="0" value="${escapeAttr(item.plannedPomodoros ?? 0)}" aria-label="计划番茄数" />
          </label>
          <label class="pomodoro-mini-field">
            <span>完成番茄</span>
            <input data-daily-field="completedPomodoros" type="number" min="0" value="${escapeAttr(item.completedPomodoros ?? 0)}" aria-label="完成番茄数" />
          </label>
          <button class="secondary" data-start-pomodoro="${escapeAttr(item.id || "")}">开始专注</button>
          <input class="daily-tags-input" data-daily-field="tags" value="${escapeAttr(tagsToText(item.tags))}" placeholder="标签：秋招, 投递, 面试" aria-label="标签" />
        </div>
        <div class="daily-note-grid">
          <label>
            <span>关联</span>
            <input data-daily-field="linkedTo" value="${escapeAttr(item.linkedTo || "")}" placeholder="公司 / 岗位 / 题型" aria-label="关联对象" />
          </label>
          <label>
            <span>备注</span>
            <textarea data-daily-field="notes" placeholder="备注、产出、复盘">${escapeHtml(item.notes || "")}</textarea>
          </label>
        </div>
      </div>
    </div>
  `;
}

function collectDailyPlan() {
  const rows = document.querySelectorAll(".daily-row");
  rows.forEach((row) => {
    const item = state.dailyPlan.items[Number(row.dataset.index)];
    row.querySelectorAll("[data-daily-field]").forEach((field) => {
      const key = field.dataset.dailyField;
      if (field.type === "number") item[key] = Number(field.value || 0);
      else if (field.type === "checkbox") item[key] = field.checked;
      else if (key === "tags") item[key] = splitTags(field.value);
      else item[key] = field.value;
    });
  });
  state.dailyPlan.focus = document.querySelector("#dailyFocusInput")?.value || state.dailyPlan.focus || "今天至少留下一个可复用产出。";
  state.dailyPlan.morningNote = document.querySelector("#dailyMorningNoteInput")?.value || "";
}

function addDailyTodo() {
  collectDailyPlan();
  if (!state.dailyPlan.items) state.dailyPlan.items = [];
  state.dailyPlan.items.push({
    id: `${state.dailyPlan.date || state.selectedDate}-todo-${Date.now()}`,
    title: "新的今日 Todo",
    category: "岗位投递",
    status: "todo",
    goalMet: false,
    tags: ["秋招"],
    timeBlock: "",
    estimatedMinutes: 30,
    plannedPomodoros: 1,
    completedPomodoros: 0,
    linkedTo: "",
    notes: "",
  });
  renderDailyTodoRows();
  showNotice("已新增 Todo，编辑后记得保存今日计划。");
}

function deleteDailyTodo(index) {
  collectDailyPlan();
  const item = state.dailyPlan?.items?.[index];
  if (!item) return;
  if (!window.confirm(`确认删除这个 Todo 吗？\n\n${item.title || "未命名 Todo"}`)) return;
  state.dailyPlan.items.splice(index, 1);
  renderDailyTodoRows();
  renderPomodoroOnly();
  showNotice("Todo 已删除，记得保存今日计划。");
}

function addRecommendedTodo(index) {
  collectDailyPlan();
  const item = state.dailyPlan?.recommendations?.[index];
  if (!item) return;
  if (!state.dailyPlan.items) state.dailyPlan.items = [];
  state.dailyPlan.items.push({
    ...item,
    id: `${state.dailyPlan.date || state.selectedDate}-todo-${Date.now()}`,
    status: "todo",
    goalMet: false,
    completedPomodoros: 0,
  });
  renderDailyTodoRows();
  showNotice("已加入推荐 Todo，记得保存今日计划。");
}

function pomodoroPanel(plan) {
  const items = plan?.items || [];
  const currentTaskId = pomodoro.taskId || items[0]?.id || "";
  const totalSeconds = pomodoroDurationSeconds(pomodoro.mode);
  const elapsed = Math.max(totalSeconds - pomodoro.secondsLeft, 0);
  const progress = Math.min(100, Math.round((elapsed / totalSeconds) * 100));
  return `
    <div class="pomodoro-panel">
      <div class="item-row">
        <div>
          <h3>番茄专注</h3>
          <p>${pomodoro.mode === "break" ? `短休息 ${pomodoro.breakMinutes} 分钟` : `专注 ${pomodoro.focusMinutes} 分钟`}</p>
        </div>
        <span id="pomodoroStatusBadge" class="badge ${pomodoro.running ? "blue" : ""}">${pomodoro.running ? "进行中" : "待开始"}</span>
      </div>
      <div class="pomodoro-settings prominent">
        <label>
          <span>专注分钟</span>
          <input id="pomodoroFocusMinutes" type="number" min="5" max="180" step="5" value="${escapeAttr(pomodoro.focusMinutes)}" />
        </label>
        <label>
          <span>休息分钟</span>
          <input id="pomodoroBreakMinutes" type="number" min="1" max="60" step="1" value="${escapeAttr(pomodoro.breakMinutes)}" />
        </label>
      </div>
      <div id="pomodoroTimerDial" class="pomodoro-timer" style="--value:${progress}" title="点击可修改专注/休息时间">
        <strong id="pomodoroTime">${formatPomodoroTime(pomodoro.secondsLeft)}</strong>
        <span>${pomodoro.mode === "break" ? "休息" : "专注"} · 点击设置</span>
      </div>
      <select id="pomodoroTaskSelect" aria-label="选择番茄绑定任务">
        ${items.map((item) => `<option value="${escapeAttr(item.id || "")}" ${currentTaskId === item.id ? "selected" : ""}>${escapeHtml(item.title || "未命名 Todo")}</option>`).join("")}
      </select>
      <div class="button-row">
        <button id="pomodoroStartPauseBtn" class="primary">${pomodoro.running ? "暂停" : "开始"}</button>
        <button id="pomodoroCompleteBtn" class="secondary">完成 1 个番茄</button>
        <button id="pomodoroResetBtn" class="secondary">重置</button>
      </div>
    </div>
  `;
}

function bindPomodoroControls() {
  bindDailyPomodoroButtons();
  document.querySelector("#pomodoroTaskSelect")?.addEventListener("change", (event) => {
    pomodoro.taskId = event.currentTarget.value;
  });
  document.querySelector("#pomodoroStartPauseBtn")?.addEventListener("click", togglePomodoro);
  document.querySelector("#pomodoroResetBtn")?.addEventListener("click", resetPomodoro);
  document.querySelector("#pomodoroCompleteBtn")?.addEventListener("click", completePomodoro);
  document.querySelector("#pomodoroFocusMinutes")?.addEventListener("change", updatePomodoroSettings);
  document.querySelector("#pomodoroBreakMinutes")?.addEventListener("change", updatePomodoroSettings);
  document.querySelector("#pomodoroTimerDial")?.addEventListener("click", () => {
    document.querySelector("#pomodoroFocusMinutes")?.focus();
  });
}

function togglePomodoro() {
  if (pomodoro.running) {
    stopPomodoroTimer();
    showNotice("番茄钟已暂停。");
    return;
  }
  collectDailyPlan();
  pomodoro.taskId = document.querySelector("#pomodoroTaskSelect")?.value || pomodoro.taskId || state.dailyPlan?.items?.[0]?.id || "";
  startPomodoroTimer();
  showNotice(`开始 ${pomodoro.focusMinutes} 分钟专注。`);
}

function startPomodoroForTask(taskId) {
  collectDailyPlan();
  pomodoro.taskId = taskId || pomodoro.taskId || state.dailyPlan?.items?.[0]?.id || "";
  pomodoro.mode = "focus";
  pomodoro.secondsLeft = pomodoroDurationSeconds("focus");
  renderPomodoroOnly();
  startPomodoroTimer();
  showNotice(`已开始 ${pomodoro.focusMinutes} 分钟专注。`);
}

function startPomodoroTimer() {
  if (pomodoro.timerId) window.clearInterval(pomodoro.timerId);
  pomodoro.running = true;
  pomodoro.timerId = window.setInterval(tickPomodoro, 1000);
  updatePomodoroDisplay();
}

function tickPomodoro() {
  pomodoro.secondsLeft = Math.max(pomodoro.secondsLeft - 1, 0);
  updatePomodoroDisplay();
  if (pomodoro.secondsLeft > 0) return;
  stopPomodoroTimer();
  if (pomodoro.mode === "focus") {
    completePomodoro(false);
    pomodoro.mode = "break";
    pomodoro.secondsLeft = pomodoroDurationSeconds("break");
    showNotice(`一个番茄完成了，休息 ${pomodoro.breakMinutes} 分钟。`);
  } else {
    pomodoro.mode = "focus";
    pomodoro.secondsLeft = pomodoroDurationSeconds("focus");
    showNotice("休息结束，可以开始下一个番茄。");
  }
  renderPomodoroOnly();
}

function stopPomodoroTimer() {
  if (pomodoro.timerId) window.clearInterval(pomodoro.timerId);
  pomodoro.timerId = null;
  pomodoro.running = false;
  updatePomodoroDisplay();
}

function resetPomodoro() {
  stopPomodoroTimer();
  pomodoro.mode = "focus";
  pomodoro.secondsLeft = pomodoroDurationSeconds("focus");
  renderPomodoroOnly();
}

function completePomodoro(show = true) {
  collectDailyPlan();
  const selectedId = document.querySelector("#pomodoroTaskSelect")?.value || pomodoro.taskId;
  const item = (state.dailyPlan?.items || []).find((todo) => todo.id === selectedId);
  if (!item) {
    if (show) showNotice("请先选择一个 Todo。", true);
    return;
  }
  item.completedPomodoros = Number(item.completedPomodoros || 0) + 1;
  if (Number(item.plannedPomodoros || 0) > 0 && item.completedPomodoros >= Number(item.plannedPomodoros || 0)) {
    item.goalMet = true;
  }
  pomodoro.taskId = item.id;
  renderDailyTodoRows();
  renderPomodoroOnly();
  if (show) showNotice("已给当前 Todo 增加 1 个完成番茄，记得保存今日计划。");
}

function renderPomodoroOnly() {
  const panel = document.querySelector(".pomodoro-panel");
  if (!panel || !state.dailyPlan) return;
  panel.outerHTML = pomodoroPanel(state.dailyPlan);
  bindPomodoroControls();
}

function updatePomodoroDisplay() {
  const time = document.querySelector("#pomodoroTime");
  if (time) time.textContent = formatPomodoroTime(pomodoro.secondsLeft);
  const badge = document.querySelector("#pomodoroStatusBadge");
  if (badge) {
    badge.textContent = pomodoro.running ? "进行中" : "待开始";
    badge.classList.toggle("blue", pomodoro.running);
  }
  const startPause = document.querySelector("#pomodoroStartPauseBtn");
  if (startPause) startPause.textContent = pomodoro.running ? "暂停" : "开始";
  const panel = document.querySelector(".pomodoro-panel");
  const timer = document.querySelector(".pomodoro-timer");
  if (!panel || !timer) return;
  const totalSeconds = pomodoroDurationSeconds(pomodoro.mode);
  const elapsed = Math.max(totalSeconds - pomodoro.secondsLeft, 0);
  timer.style.setProperty("--value", String(Math.min(100, Math.round((elapsed / totalSeconds) * 100))));
}

function pomodoroDurationSeconds(mode = pomodoro.mode) {
  return Math.max(mode === "break" ? pomodoro.breakMinutes : pomodoro.focusMinutes, 1) * 60;
}

function updatePomodoroSettings() {
  const focus = clampNumber(document.querySelector("#pomodoroFocusMinutes")?.value, 5, 180, 25);
  const rest = clampNumber(document.querySelector("#pomodoroBreakMinutes")?.value, 1, 60, 5);
  pomodoro.focusMinutes = focus;
  pomodoro.breakMinutes = rest;
  localStorage.setItem("pomodoroFocusMinutes", String(focus));
  localStorage.setItem("pomodoroBreakMinutes", String(rest));
  if (!pomodoro.running) {
    pomodoro.secondsLeft = pomodoroDurationSeconds(pomodoro.mode);
    renderPomodoroOnly();
  } else {
    updatePomodoroDisplay();
  }
  showNotice(`番茄时间已设置：专注 ${focus} 分钟，休息 ${rest} 分钟。`);
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function formatPomodoroTime(seconds) {
  const safe = Math.max(Number(seconds || 0), 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function addTagToLastFocusedTodo(tag) {
  if (!tag) return;
  const inputs = Array.from(document.querySelectorAll('[data-daily-field="tags"]'));
  const target = inputs.find((input) => input === document.activeElement) || inputs[inputs.length - 1];
  if (!target) return;
  const tags = splitTags(target.value);
  if (!tags.includes(tag)) tags.push(tag);
  target.value = tags.join(", ");
}

function recommendedTodoCard(item, index) {
  return `
    <div class="recommend-card">
      <div>
        <strong>${escapeHtml(item.title || "")}</strong>
        <p>${escapeHtml([item.category, item.timeBlock, item.estimatedMinutes ? `${item.estimatedMinutes} 分钟` : ""].filter(Boolean).join(" · "))}</p>
        <div class="tag-line">${(item.tags || []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <button class="secondary" data-add-recommendation="${index}">加入</button>
    </div>
  `;
}

function splitTags(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  return String(value || "").split(/[,，#\s]+/).map((tag) => tag.trim()).filter(Boolean);
}

function tagsToText(value) {
  return splitTags(value).join(", ");
}

async function saveDailyPlan() {
  collectDailyPlan();
  const result = await api("/api/daily-plan/save", {
    method: "POST",
    body: JSON.stringify({ date: state.dailyPlan.date || state.selectedDate, content: state.dailyPlan }),
  });
  state.dailyPlan = result.plan;
  showNotice(`已保存 ${state.dailyPlan.date} 的每日计划：${result.file}`);
  loadCurrent(false);
}

function formatDateTitle(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  if (Number.isNaN(date.getTime())) return dateText || "今天";
  return `${dateText} ${weekdays[date.getDay()]}`;
}

function dailyStatusLabel(status) {
  return { todo: "待办", running: "进行中", done: "已完成" }[status || "todo"] || status;
}

function normalizeExternalUrl(url) {
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

function renderCareerRows() {
  const items = state.career.items || [];
  const statuses = state.career.statuses || ["未投递", "已投递", "测评", "笔试", "一面", "二面", "HR面", "Offer", "拒绝", "放弃"];
  if (!items.some((item) => item.id === state.selectedCareerId)) state.selectedCareerId = items[0]?.id || "";
  const query = (document.querySelector("#careerSearchInput")?.value || "").trim().toLowerCase();
  const statusFilter = state.careerStatusFilter || "all";
  const filteredItems = items
    .map((item, index) => [item, index])
    .filter(([item]) => statusFilter === "all" || (item.status || "未投递") === statusFilter)
    .filter(([item]) => {
      if (!query) return true;
      return [item.company, item.position, item.city, item.channel, item.batch, item.requirements, item.tags?.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  const selectedIndex = items.findIndex((item) => item.id === state.selectedCareerId);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
  document.querySelector("#careerEditor").innerHTML = `
    <div class="career-toolbar">
      <input id="careerSearchInput" value="${escapeAttr(query)}" placeholder="搜索公司、岗位、城市、JD 关键词" aria-label="搜索岗位" />
      <select id="careerStatusFilter" aria-label="按状态筛选">
        <option value="all" ${statusFilter === "all" ? "selected" : ""}>全部状态</option>
        ${statuses.map((status) => `<option value="${status}" ${statusFilter === status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
    </div>
    <div class="career-workspace">
      <aside class="career-list" aria-label="岗位列表">
        ${filteredItems.map(([item, index]) => careerListItem(item, index)).join("") || "<p class=\"empty-state\">没有匹配的岗位。</p>"}
      </aside>
      <section class="career-detail-panel">
        ${selectedItem ? careerEditorRow(selectedItem, selectedIndex, statuses) : "<p class=\"empty-state\">先新增一个岗位，再在这里查看详情。</p>"}
      </section>
    </div>
  `;
  document.querySelector("#careerSearchInput")?.addEventListener("input", (event) => {
    window.clearTimeout(state.careerSearchTimer);
    state.careerSearchTimer = window.setTimeout(() => {
      careerDraftFromRows();
      renderCareerRows();
      document.querySelector("#careerSearchInput")?.focus();
    }, 180);
  });
  document.querySelector("#careerStatusFilter")?.addEventListener("change", (event) => {
    careerDraftFromRows();
    state.careerStatusFilter = event.target.value;
    renderCareerRows();
  });
  document.querySelectorAll("[data-career-select]").forEach((button) => {
    button.addEventListener("click", () => {
      careerDraftFromRows();
      state.selectedCareerId = button.dataset.careerSelect;
      renderCareerRows();
    });
  });
}

function careerListItem(item, index) {
  const appliedDate = item.appliedDate || item.date || "";
  const active = item.id === state.selectedCareerId ? "active" : "";
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
  return `
    <button class="career-list-item ${active}" data-career-select="${escapeAttr(item.id || `career-${index}`)}" type="button">
      <span class="career-list-title">
        <strong>${escapeHtml(item.company || "未命名公司")}</strong>
        <span class="badge ${careerStatusClass(item.status || "未投递")}">${escapeHtml(item.status || "未投递")}</span>
      </span>
      <span class="career-list-position">${escapeHtml(item.position || "未填写岗位")}</span>
      <span class="career-list-meta">${escapeHtml([item.city, appliedDate, item.batch].filter(Boolean).join(" · "))}</span>
      ${tags.length ? `<span class="career-list-tags">${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>` : ""}
    </button>
  `;
}

function careerEditorRow(item, index, statuses) {
  const appliedDate = item.appliedDate || item.date || "";
  const jobUrl = normalizeExternalUrl(item.jobUrl || "");
  return `
    <div class="career-row career-detail" data-career-editor data-index="${index}">
      <div class="career-detail-head">
        <div>
          <span class="eyebrow">岗位详情</span>
          <h2>${escapeHtml(item.company || "未命名公司")}</h2>
          <p>${escapeHtml(item.position || "未填写岗位名称")}</p>
        </div>
        <div class="career-detail-actions">
          ${jobUrl ? `<a class="secondary link-button" href="${escapeAttr(jobUrl)}" target="_blank" rel="noreferrer">打开岗位</a>` : ""}
          <button class="danger tiny-button" data-career-delete="${index}" type="button">删除</button>
        </div>
      </div>
      <div class="career-title-row">
        <input data-field="company" value="${escapeAttr(item.company || "")}" placeholder="公司" aria-label="公司" />
        <select data-field="status" aria-label="投递状态">
          ${statuses.map((status) => `<option value="${status}" ${(item.status || "未投递") === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <input data-field="position" value="${escapeAttr(item.position || "")}" placeholder="岗位名称" aria-label="岗位名称" />
      <div class="career-meta-row">
        <span class="badge ${careerStatusClass(item.status || "未投递")}">${escapeHtml(item.status || "未投递")}</span>
        <span>${appliedDate ? `投递日期 ${escapeHtml(appliedDate)}` : "未记录投递日期"}</span>
        ${item.updatedAt ? `<span>更新 ${escapeHtml(item.updatedAt)}</span>` : ""}
      </div>
      <div class="career-fields">
        <input data-field="city" value="${escapeAttr(item.city || "")}" placeholder="城市" aria-label="城市" />
        <input data-field="channel" value="${escapeAttr(item.channel || "")}" placeholder="渠道" aria-label="渠道" />
        <input data-field="jobUrl" value="${escapeAttr(item.jobUrl || "")}" placeholder="岗位链接 / JD 链接" aria-label="岗位链接" />
        <input data-field="appliedDate" type="date" value="${escapeAttr(appliedDate)}" aria-label="投递日期" />
        <select data-field="priority" aria-label="优先级">
          ${["high", "medium", "low"].map((value) => `<option value="${value}" ${(item.priority || "medium") === value ? "selected" : ""}>${priorityLabel(value)}</option>`).join("")}
        </select>
        <input data-field="deadline" value="${escapeAttr(item.deadline || "")}" placeholder="截止时间" aria-label="截止时间" />
        <input data-field="salary" value="${escapeAttr(item.salary || "")}" placeholder="薪资 / 实习补贴" aria-label="薪资" />
        <input data-field="batch" value="${escapeAttr(item.batch || "")}" placeholder="批次：提前批 / 秋招 / 实习" aria-label="招聘批次" />
      </div>
      <div class="career-info-grid">
        <label class="career-field-stack wide">
          <span>职位介绍 / JD</span>
          <textarea class="career-jd-textarea" data-field="requirements" placeholder="职责、硬性要求、加分项">${escapeHtml(item.requirements || "")}</textarea>
        </label>
        <label class="career-field-stack">
          <span>简历匹配点</span>
          <textarea data-field="matchPoints" placeholder="把 JD 里的职责映射到你的项目、实习和比赛证据">${escapeHtml(item.matchPoints || "")}</textarea>
        </label>
        <label class="career-field-stack">
          <span>准备事项</span>
          <textarea data-field="preparation" placeholder="笔试、八股、项目追问、业务场景、公司信息">${escapeHtml(item.preparation || "")}</textarea>
        </label>
        <label class="career-field-stack">
          <span>下一步</span>
          <textarea data-field="nextStep" placeholder="补简历、等反馈、准备笔试、约面、跟进内推">${escapeHtml(item.nextStep || "")}</textarea>
        </label>
        <label class="career-field-stack">
          <span>备注</span>
          <textarea data-field="notes" placeholder="截图来源、投递账号、特殊要求、面试记录">${escapeHtml(item.notes || "")}</textarea>
        </label>
      </div>
    </div>
  `;
}

function careerDraftFromRows() {
  document.querySelectorAll("[data-career-editor]").forEach((row) => {
    const item = state.career.items[Number(row.dataset.index)];
    if (!item) return;
    row.querySelectorAll("[data-field]").forEach((field) => {
      item[field.dataset.field] = field.value;
    });
  });
}

function addCareerItem() {
  careerDraftFromRows();
  if (!state.career.items) state.career.items = [];
  const item = {
    id: `job-${Date.now()}`,
    company: "",
    position: "",
    city: "",
    channel: "",
    jobUrl: "",
    status: "未投递",
    priority: "medium",
    appliedDate: "",
    deadline: "",
    salary: "",
    batch: "",
    requirements: "",
    matchPoints: "",
    preparation: "",
    nextStep: "补充 JD，判断是否投递。",
    notes: "",
    updatedAt: localDateString(),
  };
  state.career.items.unshift(item);
  state.selectedCareerId = item.id;
  state.careerStatusFilter = "all";
  renderCareerRows();
}

function addQuickCareerItem() {
  careerDraftFromRows();
  const company = document.querySelector("#quickCareerCompany").value.trim();
  const position = document.querySelector("#quickCareerPosition").value.trim();
  const city = document.querySelector("#quickCareerCity").value.trim();
  if (!company && !position) {
    showNotice("至少填写公司名称或岗位名称，再加入今日记录。", true);
    return;
  }
  if (!state.career.items) state.career.items = [];
  const item = {
    id: `job-${Date.now()}`,
    company,
    position,
    city,
    channel: document.querySelector("#quickCareerChannel").value.trim(),
    jobUrl: document.querySelector("#quickCareerJobUrl").value.trim(),
    status: document.querySelector("#quickCareerStatus").value || "已投递",
    priority: "medium",
    appliedDate: document.querySelector("#quickCareerDate").value || localDateString(),
    deadline: "",
    salary: "",
    batch: "",
    requirements: "",
    matchPoints: "",
    preparation: "",
    nextStep: document.querySelector("#quickCareerNextStep").value.trim() || "等待反馈，并准备笔试/面试。",
    notes: "",
    updatedAt: localDateString(),
  };
  state.career.items.unshift(item);
  state.selectedCareerId = item.id;
  state.careerStatusFilter = "all";
  ["#quickCareerCompany", "#quickCareerPosition", "#quickCareerCity", "#quickCareerJobUrl", "#quickCareerChannel", "#quickCareerNextStep"].forEach((selector) => {
    document.querySelector(selector).value = "";
  });
  renderCareerRows();
  showNotice("已加入今日投递记录，记得点击“保存投递进度”。");
}

async function saveCareer() {
  careerDraftFromRows();
  state.career.items = (state.career.items || []).map((item) => ({
    ...item,
    updatedAt: localDateString(),
  }));
  const result = await api("/api/career/save", {
    method: "POST",
    body: JSON.stringify({ content: { updatedAt: state.career.updatedAt, items: state.career.items || [] } }),
  });
  showNotice(`已保存秋招投递进度：${result.file}`);
  state.career = await api("/api/career");
  renderCareerRows();
}

document.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-career-delete]");
  if (!deleteButton) return;
  careerDraftFromRows();
  const index = Number(deleteButton.dataset.careerDelete);
  const deletedId = state.career.items[index]?.id;
  state.career.items.splice(index, 1);
  if (state.selectedCareerId === deletedId) state.selectedCareerId = state.career.items[0]?.id || "";
  renderCareerRows();
  showNotice("已从页面移除该岗位，点击保存后写入本地文件。");
});

document.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy-source], [data-copy-text]");
  if (!copyButton) return;
  const sourceId = copyButton.dataset.copySource;
  const source = sourceId ? document.getElementById(sourceId) : null;
  const text = source ? ("value" in source ? source.value : source.textContent) : copyButton.dataset.copyText;
  copyToClipboard(text || "", copyButton.dataset.copyLabel || "已复制。");
});

function careerFunnel(byStatus = {}) {
  const statuses = ["未投递", "已投递", "测评", "笔试", "一面", "二面", "HR面", "Offer"];
  const maxValue = Math.max(...statuses.map((status) => Number(byStatus[status] || 0)), 1);
  return `
    <div class="career-funnel">
      ${statuses.map((status) => `
        <div class="funnel-step">
          <div class="item-row">
            <strong>${escapeHtml(status)}</strong>
            <span class="badge ${careerStatusClass(status)}">${Number(byStatus[status] || 0)}</span>
          </div>
          <div class="funnel-bar"><span style="width:${Math.max(8, (Number(byStatus[status] || 0) / maxValue) * 100)}%"></span></div>
        </div>
      `).join("")}
    </div>
  `;
}

function careerAssessmentTracker(items = []) {
  const rows = items.filter(hasAssessmentRecord);
  const pending = rows.filter((item) => !assessmentCompleted(item) && !["拒绝", "放弃"].includes(item.status || ""));
  const completed = rows.filter(assessmentCompleted);
  pending.sort((a, b) => assessmentSortValue(a) - assessmentSortValue(b));
  completed.sort((a, b) => String(b.assessmentDate || b.assessmentCompletedAt || "").localeCompare(String(a.assessmentDate || a.assessmentCompletedAt || "")));
  return `
    <section class="panel assessment-tracker">
      <div class="item-row">
        <div>
          <span class="eyebrow">测评追踪</span>
          <h2>已完成和未完成的测评</h2>
        </div>
        <div class="button-row inline-actions">
          <span class="badge amber">${pending.length} 待完成/待确认</span>
          <span class="badge green">${completed.length} 已完成</span>
        </div>
      </div>
      <div class="assessment-grid">
        <div>
          <h3>待完成 / 待确认</h3>
          <div class="list compact-list">
            ${pending.map((item) => assessmentCard(item, false)).join("") || "<p>当前没有待完成测评。</p>"}
          </div>
        </div>
        <div>
          <h3>已完成</h3>
          <div class="list compact-list">
            ${completed.map((item) => assessmentCard(item, true)).join("") || "<p>还没有已完成测评记录。</p>"}
          </div>
        </div>
      </div>
    </section>
  `;
}

function hasAssessmentRecord(item) {
  const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
  return Boolean(
    (item.status || "") === "测评" ||
    item.assessmentStatus ||
    item.assessmentDeadline ||
    item.assessmentDate ||
    item.assessmentName ||
    /测评|人才测评|心理测评|在线测评/.test(tags)
  );
}

function assessmentCompleted(item) {
  const text = [item.assessmentStatus, Array.isArray(item.tags) ? item.tags.join(" ") : ""].filter(Boolean).join(" ");
  return /测评已完成|心理测评已完成|已完成/.test(text) && !/待完成|待确认|未完成|待补救|已过期/.test(text);
}

function assessmentSortValue(item) {
  const raw = String(item.assessmentDeadline || item.deadline || "");
  if (raw.includes("已过期")) return -1;
  const value = Date.parse(raw.replace(" ", "T"));
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function assessmentCard(item, completed) {
  const dateLabel = completed
    ? `完成：${item.assessmentDate || item.assessmentCompletedAt || "已完成"}`
    : `截止：${item.assessmentDeadline || item.deadline || "待确认"}`;
  const statusText = completed ? item.assessmentStatus || "已完成" : item.assessmentStatus || item.status || "待完成";
  return `
    <div class="compact-task assessment-task">
      <div>
        <strong>${escapeHtml(item.company || "未命名公司")}</strong>
        <p>${escapeHtml(item.position || "未填写岗位")}</p>
        <p>${escapeHtml(dateLabel)}</p>
      </div>
      <span class="badge ${completed ? "green" : "amber"}">${escapeHtml(statusText)}</span>
    </div>
  `;
}

function careerOverviewMini(careerData) {
  const summary = careerData?.summary || {};
  return `
    <div class="career-mini">
      <div><strong>${summary.total ?? 0}</strong><span>岗位</span></div>
      <div><strong>${summary.notApplied ?? 0}</strong><span>未投递</span></div>
      <div><strong>${summary.interviewing ?? 0}</strong><span>面试中</span></div>
      <div><strong>${summary.offers ?? 0}</strong><span>Offer</span></div>
    </div>
    ${careerFunnel(summary.byStatus || {})}
  `;
}

function careerStatusClass(status) {
  if (status === "Offer") return "green";
  if (["一面", "二面", "HR面"].includes(status)) return "blue";
  if (status === "测评") return "amber";
  if (["拒绝", "放弃"].includes(status)) return "amber";
  return "";
}

function metric(label, value) {
  const hints = {"全部岗位": "已登记的求职机会", "未投递": "待确认匹配与投递", "流程中": "投递、测评、笔试及面试", "面试中": "一面、二面与 HR 面", "Offer": "已收到的录用进展"};
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${hints[label] ? `<small>${escapeHtml(hints[label])}</small>` : ""}</div>`;
}

function compactTaskItem(item) {
  return `
    <div class="compact-task">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.nextStep || item.notes || "")}</p>
      </div>
      <span class="badge ${item.status === "completed" ? "green" : item.priority === "high" ? "blue" : ""}">${statusLabel(item.status)}</span>
    </div>
  `;
}

function priorityLabel(priority) {
  return { high: "高优先级", medium: "中优先级", low: "低优先级" }[priority || "medium"] || priority;
}

function priorityClass(priority) {
  return priority === "high" ? "blue" : priority === "medium" ? "amber" : "";
}

function statusLabel(status) {
  return {
    todo: "待办",
    running: "进行中",
    in_review: "复核中",
    completed: "已完成",
    blocked: "卡住",
  }[status || "todo"] || status || "待办";
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyToClipboard(button.dataset.copy || "", "命令已复制。");
    });
  });
}

async function copyToClipboard(text, message = "已复制。") {
  const value = String(text || "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      fallbackCopyText(value);
    }
    showNotice(message);
  } catch {
    fallbackCopyText(value);
    showNotice(message);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtmlTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

if (window.location.protocol === "file:") {
  renderFileMode();
} else {
  setView(state.view, false);
}
