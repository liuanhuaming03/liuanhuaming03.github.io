// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// Step 7: AI重写 / 正文生成
// ========================================
function inferStep3TaskTitle() {
    const title = (getEl("novel-title-input")?.value || inferNovelTitle() || workflowState.currentTaskId || "未命名任务").trim();
    return title.slice(0, 24) || "未命名任务";
}

function collectStep3DraftPayload() {
    const frameworkText = getEl("rewrite-framework-text")?.value || workflowState.finalFramework?.final_text || workflowState.newOutlineText || "";
    const novelTitle = (getEl("novel-title-input")?.value || inferNovelTitle() || "").trim();
    const model = getEl("novel-model-select")?.value || workflowState.generatedNovel?.model || "volc";
    const totalChapters = Number(workflowState.generatedNovel?.chapter_count || workflowState.chapterDrafts.length || 0);
    const completedChapters = Number(
        workflowState.generatedNovel?.completed_chapters
        || workflowState.chapterDrafts.filter((item) => String(item.text || "").trim()).length
        || 0
    );
    const isGenerationComplete = (
        ["completed", "done", "success"].includes(String(workflowState.writeJobStatus || "").toLowerCase())
        || (totalChapters > 0 && completedChapters >= totalChapters)
    );
    const generatedText = isGenerationComplete
        ? (getEl("generated-novel-text")?.value || workflowState.generatedNovel?.novel_text || workflowState.generatedNovel?.text || "")
        : "";
    const introText = isGenerationComplete
        ? (workflowState.introText || extractIntroFromNovelText(generatedText))
        : "";
    const generatedNovel = {
        ...(workflowState.generatedNovel || {}),
        ...(introText ? { intro_text: introText } : {}),
    };
    return {
        task_id: workflowState.currentTaskId || createClientTaskId("write"),
        title: inferStep3TaskTitle(),
        current_step: "step3_writing",
        framework_text: frameworkText,
        novel_title: novelTitle,
        model,
        write_job_id: workflowState.writeJobId || "",
        write_job_status: workflowState.writeJobStatus || "idle",
        current_stage: getEl("novel-job-status")?.textContent || workflowState.generatedNovel?.current_stage || "",
        current_chapter: workflowState.generatedNovel?.current_chapter || null,
        chapter_count: totalChapters || null,
        completed_chapters: completedChapters,
        selected_draft_chapter: workflowState.selectedDraftChapter || 1,
        auto_follow_draft_chapter: workflowState.autoFollowDraftChapter,
        chapter_plan: workflowState.chapterPlan || [],
        generated_novel: generatedNovel,
        chapter_drafts: workflowState.chapterDrafts || [],
        novel_text: generatedText,
        output_path: workflowState.generatedNovel?.output_path || getEl("generated-novel-output-path")?.textContent || "",
        intro_text: introText,
    };
}

async function saveCurrentStep3Draft() {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId("write");
    try {
        const payload = collectStep3DraftPayload();
        const data = await postJSON("/api/workflow/step3/save", payload);
        workflowState.currentTaskId = data.task_id || workflowState.currentTaskId;
        await loadTaskSidebarList();
        showSuccess("第三环节进度已保存");
    } catch (err) {
        showError(err.message || "保存第三环节进度失败");
    }
}

function normalizeSavedChapterDraft(draft, index) {
    return {
        chapter: Number(draft?.chapter || index + 1),
        status: draft?.status || "pending",
        plot: draft?.plot || "",
        emotion: draft?.emotion || "",
        hook: draft?.hook || "",
        text: draft?.text || "",
        generatedText: draft?.generatedText || draft?.generated_text || draft?.text || "",
        wordCount: Number(draft?.wordCount || draft?.word_count || 0),
        edited: Boolean(draft?.edited || draft?.savedAt || draft?.saved_at || draft?.text),
        checkpointPath: draft?.checkpointPath || draft?.checkpoint_path || "",
        summary: draft?.summary || {},
        sceneCard: draft?.sceneCard || draft?.scene_card || {},
        reference: draft?.reference || {},
        savedAt: draft?.savedAt || draft?.saved_at || null,
        savedTextPath: draft?.savedTextPath || draft?.saved_text_path || "",
        regenerateCount: Number(draft?.regenerateCount || draft?.regenerate_count || 0),
    };
}

function applyStep3DraftPayload(payload) {
    workflowState.currentTaskId = String(payload.task_id || workflowState.currentTaskId || "");
    workflowState.finalFramework = { final_text: payload.framework_text || "" };
    workflowState.newOutlineText = payload.framework_text || workflowState.newOutlineText || "";
    workflowState.writeJobId = payload.write_job_id || "";
    workflowState.writeJobStatus = payload.write_job_status || "idle";
    workflowState.writeLastNotifiedStatus = "";
    workflowState.chapterPlan = payload.chapter_plan || [];
    workflowState.generatedNovel = payload.generated_novel || {};
    workflowState.generatedNovel = {
        ...workflowState.generatedNovel,
        title: payload.novel_title || workflowState.generatedNovel.title || "",
        model: payload.model || workflowState.generatedNovel.model || "volc",
        status: payload.write_job_status || workflowState.generatedNovel.status || "idle",
        current_stage: payload.current_stage || workflowState.generatedNovel.current_stage || "",
        current_chapter: payload.current_chapter || workflowState.generatedNovel.current_chapter || null,
        chapter_count: payload.chapter_count || workflowState.generatedNovel.chapter_count || 0,
        completed_chapters: payload.completed_chapters || workflowState.generatedNovel.completed_chapters || 0,
        output_path: payload.output_path || workflowState.generatedNovel.output_path || "",
        chapter_plan: payload.chapter_plan || workflowState.generatedNovel.chapter_plan || [],
        novel_text: payload.novel_text || workflowState.generatedNovel.novel_text || workflowState.generatedNovel.text || "",
        intro_text: payload.intro_text || workflowState.generatedNovel.intro_text || "",
    };
    workflowState.chapterDrafts = (payload.chapter_drafts || []).map(normalizeSavedChapterDraft);
    ensureChapterDrafts(payload.chapter_count || workflowState.chapterDrafts.length || 10);
    hydrateChapterDraftsFromPlan(workflowState.chapterPlan);
    workflowState.selectedDraftChapter = Number(payload.selected_draft_chapter || workflowState.selectedDraftChapter || 1);
    workflowState.autoFollowDraftChapter = Boolean(payload.auto_follow_draft_chapter ?? true);
    workflowState.introText = getCompletedIntroText(workflowState.generatedNovel, payload.novel_text || "");
    if (workflowState.introText) workflowState.generatedNovel.intro_text = workflowState.introText;

    if (getEl("rewrite-framework-text")) {
        const frameworkEl = getEl("rewrite-framework-text");
        frameworkEl.value = payload.framework_text || "";
        frameworkEl.scrollTop = 0;
        if (typeof frameworkEl.setSelectionRange === "function") frameworkEl.setSelectionRange(0, 0);
    }
    if (getEl("novel-title-input")) getEl("novel-title-input").value = payload.novel_title || "";
    if (getEl("novel-model-select")) getEl("novel-model-select").value = payload.model || workflowState.generatedNovel.model || "volc";
    if (getEl("novel-job-status")) getEl("novel-job-status").textContent = payload.current_stage || payload.write_job_status || "等待开始";
    if (getEl("novel-job-progress")) getEl("novel-job-progress").textContent = `${payload.completed_chapters || 0} / ${payload.chapter_count || workflowState.chapterDrafts.length || 0}`;
    if (getEl("novel-job-current-chapter")) getEl("novel-job-current-chapter").textContent = payload.current_chapter ? `第 ${payload.current_chapter} 章` : "—";
    if (getEl("generated-novel-title")) getEl("generated-novel-title").textContent = payload.novel_title || inferNovelTitle() || "未生成";
    if (getEl("generated-novel-output-path")) getEl("generated-novel-output-path").textContent = payload.output_path || "—";

    if (workflowState.writeJobId || workflowState.chapterDrafts.some((item) => String(item.text || "").trim())) {
        getEl("novel-generation-card").style.display = "block";
    }

    renderChapterDraftList();
    renderChapterEditor();
    updateChapterFollowButton();
    updateMergedNovelPreview();

    if (payload.novel_text && getEl("generated-novel-text")) {
        getEl("generated-novel-text").value = payload.novel_text;
        getEl("generated-novel-card").style.display = "block";
    }

    syncCurrentTaskGeneratedChapters();
    renderTaskSidebar();
    switchToStep(7);

    updateStopGenerationButton(workflowState.writeJobStatus);
    if (workflowState.writeJobId && isWriteJobRunningStatus(workflowState.writeJobStatus)) {
        startWriteJobPolling(workflowState.writeJobId);
    } else {
        stopWriteJobPolling();
    }
}

async function loadStep3Draft(taskId, options = {}) {
    const { silent = false } = options;
    try {
        const payload = await fetchJSON(`/api/workflow/step3/load?task_id=${encodeURIComponent(taskId)}`);
        applyStep3DraftPayload(payload);
        if (!silent) showSuccess(`已载入任务：${payload.title || taskId}`);
    } catch (err) {
        switchToStep(7);
        if (!silent) showError(err.message || "加载第三环节保存记录失败");
    }
}

function inferNovelTitle() {
    const parsed = workflowState.parsedOutline || {};
    return parsed.title || parsed["标题"] || parsed["小说标题"] || "";
}

function downloadFrameworkAsTxt() {
    const text = getCurrentFrameworkText();
    if (!text) return showError("还没有可导出的框架文本");
    downloadTextAsTxt(text, "最终框架.txt"); showSuccess("框架已导出为 .txt 文件");
}

async function generateNovelFromFramework() {
    const frameworkText = getEl("rewrite-framework-text")?.value?.trim() || "";
    if (!frameworkText) return showError("请先粘贴或带入最终框架");
    const title = getEl("novel-title-input")?.value?.trim() || inferNovelTitle() || "";
    const model = getEl("novel-model-select")?.value || "volc";
    const sourceText = (workflowState.rawNovelText || getEl("raw-novel-text")?.value || "").trim();
    const taskId = workflowState.currentTaskId || createClientTaskId("write");
    workflowState.currentTaskId = taskId;
    showPageLoading("正在启动逐章小说生成...");
    try {
        const data = await postJSON("/api/pipeline/write/start", {
            framework_text: frameworkText,
            title,
            model,
            source_text: sourceText,
            task_id: taskId,
        });
        const jobId = data.job_id; if (!jobId) throw new Error("未返回 job_id");
        workflowState.currentTaskId = data.task_id || taskId;
        workflowState.writeJobId = jobId; workflowState.writeJobStatus = "running"; workflowState.writeLastNotifiedStatus = "";
        workflowState.introText = "";
        workflowState.chapterPlan = [];
        ensureChapterDrafts(data.chapter_count || 10); renderChapterDraftList(); renderChapterEditor();
        getEl("novel-generation-card").style.display = "block";
        updateStopGenerationButton("running");
        autoCollapseStep3Config();
        await loadTaskSidebarList({ autoSelectLatest: false, silent: true });
        renderTaskSidebar();
        startWriteJobPolling(jobId); showSuccess("正文生成任务已启动，章节将依次生成");
    } catch (err) { showError(err.message || "正文生成启动失败"); }
    finally { hidePageLoading(); }
}

function scheduleCurrentChapterAutosave() {
    if (!workflowState.writeJobId) return;
    if (workflowState.chapterAutosaveTimer) clearTimeout(workflowState.chapterAutosaveTimer);
    workflowState.chapterAutosaveTimer = setTimeout(() => saveCurrentChapterDraft(false), 900);
}

async function saveCurrentChapterDraft(manual = false) {
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    if (!draft || !workflowState.writeJobId) {
        if (manual) showError("当前还没有可保存的章节任务");
        return;
    }
    try {
        const data = await postJSON("/api/pipeline/write/chapter/save", {
            job_id: workflowState.writeJobId,
            chapter: draft.chapter,
            text: draft.text || "",
        });
        draft.savedAt = data.saved_at || draft.savedAt;
        draft.savedTextPath = data.saved_text_path || draft.savedTextPath || "";
        draft.wordCount = Number(data.word_count || draft.wordCount || 0);
        draft.edited = true;
        renderChapterEditor();
        updateMergedNovelPreview();
        syncCurrentTaskGeneratedChapters();
        renderTaskSidebar();
        if (manual) showSuccess(`第${draft.chapter}章已保存`);
    } catch (err) {
        showError(err.message || "章节保存失败");
    }
}

async function regenerateCurrentChapter() {
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    if (!draft || !workflowState.writeJobId) return showError("当前还没有可重生成的章节");
    if (!confirm(`将重新生成第${draft.chapter}章，并自动继续生成后续章节；第${draft.chapter}章之后的当前正文会被刷新。确定继续吗？`)) return;
    showPageLoading(`正在准备从第${draft.chapter}章继续生成...`);
    try {
        const data = await postJSON("/api/pipeline/write/chapter/regenerate", {
            job_id: workflowState.writeJobId,
            chapter: draft.chapter,
            continue_after: true,
        });
        workflowState.writeJobStatus = data.status || "running";
        startWriteJobPolling(workflowState.writeJobId);
        showSuccess(`已从第${draft.chapter}章进入重生成并续写队列`);
    } catch (err) {
        showError(err.message || "章节重生成失败");
    } finally {
        hidePageLoading();
    }
}

function downloadGeneratedNovelAsTxt() {
    const text = getMergedNovelDraftText();
    if (!text) return showError("还没有可导出的正文");
    const title = getEl("generated-novel-title")?.textContent || inferNovelTitle() || "改编新小说";
    downloadTextAsTxt(text, `${title}.txt`); showSuccess("正文已导出为 .txt 文件");
}

// ========================================
// AI 改写选中段落
// ========================================
let _rewriteSelectionRange = null;
let _lastRewriteUndo = null;

function openRewriteModal({ start, end, text }) {
    const overlay = getEl("ai-rewrite-modal-overlay");
    const preview = getEl("ai-rewrite-preview");
    const instruction = getEl("ai-rewrite-instruction");
    const modal = overlay?.querySelector(".rewrite-modal");
    if (!overlay || !preview || !instruction) return;
    _rewriteSelectionRange = { start, end, text };
    preview.value = text.length > 300 ? text.slice(0, 300) + "…" : text;
    instruction.value = "";
    // 重置弹窗位置（恢复居中）
    if (modal) {
        modal.style.position = "";
        modal.style.left = "";
        modal.style.top = "";
        modal.style.margin = "";
    }
    overlay.classList.add("is-active");
    instruction.focus();
}

function closeRewriteModal() {
    const overlay = getEl("ai-rewrite-modal-overlay");
    if (overlay) overlay.classList.remove("is-active");
    _rewriteSelectionRange = null;
}

function extractSentences(text, count, fromEnd = false) {
    const matches = text.match(/[^\n。！？…]+[\n。！？…]*/g) || [];
    if (fromEnd) {
        return matches.slice(-count).join("").trim();
    }
    return matches.slice(0, count).join("").trim();
}

async function submitRewriteSelection() {
    const editor = getEl("chapter-editor-text");
    const instructionEl = getEl("ai-rewrite-instruction");
    const submitBtn = getEl("ai-rewrite-submit-btn");
    if (!editor || !_rewriteSelectionRange || !instructionEl || !submitBtn) return;

    const instruction = instructionEl.value.trim();
    if (!instruction) {
        showError("请输入修改意见");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "改写中…";

    try {
        const draft = getChapterDraft(workflowState.selectedDraftChapter);
        const { start, end, text } = _rewriteSelectionRange;
        const textBefore = editor.value.substring(0, start);
        const textAfter = editor.value.substring(end);
        const prevContext = extractSentences(textBefore, 10, true);
        const nextContext = extractSentences(textAfter, 10, false);

        const data = await postJSON("/api/pipeline/write/chapter/rewrite_selection", {
            job_id: workflowState.writeJobId || "",
            chapter: draft?.chapter || workflowState.selectedDraftChapter,
            selected_text: text,
            instruction,
            prev_context: prevContext,
            next_context: nextContext,
        });
        let rewritten = String(data.rewritten_text || "");
        if (!rewritten) throw new Error("返回结果为空");
        // 压缩连续换行，防止模型返回多余的空行
        rewritten = rewritten.replace(/\n{2,}/g, "\n");

        // 防御性校验：编辑器内容是否在弹窗打开期间被修改
        const currentSelected = editor.value.substring(start, end);
        let newValue;
        let replaceStart = start;
        if (currentSelected === text) {
            newValue = editor.value.substring(0, start) + rewritten + editor.value.substring(end);
        } else if (editor.value.includes(text)) {
            // 索引已失效，降级为字符串查找替换（仅替换第一处）
            newValue = editor.value.replace(text, rewritten);
            replaceStart = editor.value.indexOf(text);
        } else {
            throw new Error("编辑器内容已变化，请关闭弹窗后重新选择文本");
        }

        // 保存撤销状态，以便 Ctrl+Z 回退到改写前版本
        _lastRewriteUndo = {
            oldValue: editor.value,
            start: replaceStart,
            end: replaceStart + text.length,
        };

        editor.value = newValue;
        editor.dispatchEvent(new Event("input"));

        // 关闭弹窗、重新聚焦编辑器并高亮改写后的文字，让用户一眼看到修改位置
        closeRewriteModal();
        editor.focus();
        // 两步设置选区：先把光标放到改写段落起始处，避免浏览器直接跳到底部
        editor.setSelectionRange(replaceStart, replaceStart);
        editor.setSelectionRange(replaceStart, replaceStart + rewritten.length);
        // 将改写段落滚动到编辑器可视区域中上部
        const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 24;
        const linesBefore = editor.value.substring(0, replaceStart).split('\n').length;
        const targetScroll = Math.max(0, (linesBefore - 1) * lineHeight - editor.clientHeight / 3);
        editor.scrollTop = targetScroll;
    } catch (err) {
        showError(err.message || "AI 改写失败");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "发送";
    }
}

// ========================================
// AI 改写弹窗拖动
// ========================================
(function initRewriteModalDrag() {
    const overlay = getEl("ai-rewrite-modal-overlay");
    const modal = overlay?.querySelector(".rewrite-modal");
    const header = modal?.querySelector(".rewrite-modal__header");
    if (!overlay || !modal || !header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = modal.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        modal.style.position = "fixed";
        modal.style.left = `${initialLeft}px`;
        modal.style.top = `${initialTop}px`;
        modal.style.margin = "0";
        header.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        modal.style.left = `${initialLeft + dx}px`;
        modal.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = "move";
        }
    });
})();

// ========================================
// 输入配置区折叠 / 展开
// ========================================
let _step3ConfigCollapsed = false;

function toggleStep3Config() {
    const card = getEl("step3-config-card");
    const arrow = getEl("step3-config-arrow");
    if (!card) return;
    _step3ConfigCollapsed = !_step3ConfigCollapsed;
    if (_step3ConfigCollapsed) {
        card.classList.add("is-collapsed");
        if (arrow) arrow.textContent = "▶";
    } else {
        card.classList.remove("is-collapsed");
        if (arrow) arrow.textContent = "▼";
    }
    updateStep3ConfigHint();
}

function updateStep3ConfigHint() {
    const hint = getEl("step3-config-hint");
    if (!hint) return;
    if (_step3ConfigCollapsed) {
        const title = (getEl("novel-title-input")?.value || inferNovelTitle() || "").trim();
        const framework = (getEl("rewrite-framework-text")?.value || "").trim();
        hint.textContent = title ? `标题：${title.slice(0, 20)}` : framework ? `框架：${framework.slice(0, 20)}…` : "最终框架、标题与生成接口";
    } else {
        hint.textContent = "最终框架、标题与生成接口";
    }
}

// 生成开始后自动折叠输入配置
function autoCollapseStep3Config() {
    if (_step3ConfigCollapsed) return; // 用户已手动折叠，不覆盖
    const card = getEl("step3-config-card");
    const arrow = getEl("step3-config-arrow");
    if (!card) return;
    _step3ConfigCollapsed = true;
    card.classList.add("is-collapsed");
    if (arrow) arrow.textContent = "▶";
    updateStep3ConfigHint();
}

// ========================================
// 章节侧栏折叠
// ========================================
let _chapterSidebarCollapsed = false;

function toggleChapterSidebar() {
    const sidebar = getEl("chapter-sidebar");
    if (!sidebar) return;
    _chapterSidebarCollapsed = !_chapterSidebarCollapsed;
    if (_chapterSidebarCollapsed) {
        sidebar.classList.add("is-collapsed");
    } else {
        sidebar.classList.remove("is-collapsed");
    }
}

// ========================================
// 右侧参考面板折叠
// ========================================
let _contextPanelCollapsed = true;

function applyContextPanelState() {
    const panel = getEl("chapter-context-panel");
    const icon = document.querySelector(".chapter-context-panel__toggle-icon");
    if (!panel) return;
    if (_contextPanelCollapsed) {
        panel.classList.add("is-collapsed");
        if (icon) icon.textContent = "▶";
    } else {
        panel.classList.remove("is-collapsed");
        if (icon) icon.textContent = "◀";
    }
}

function initContextPanelPreference() {
    try {
        const saved = localStorage.getItem("wenciai_context_panel_collapsed");
        _contextPanelCollapsed = saved === null ? true : saved === "true";
    } catch {
        _contextPanelCollapsed = true;
    }
    applyContextPanelState();
}

function toggleContextPanel() {
    _contextPanelCollapsed = !_contextPanelCollapsed;
    try {
        localStorage.setItem("wenciai_context_panel_collapsed", String(_contextPanelCollapsed));
    } catch {
        // localStorage 不可用时，仅保留本次页面状态
    }
    applyContextPanelState();
}

// ========================================
// 中断生成
// ========================================
async function stopGeneration() {
    const jobId = workflowState.writeJobId;
    if (!jobId) return;
    if (!confirm("确定要中断当前生成任务吗？已生成的章节内容会保留。")) return;
    stopWriteJobPolling();
    try {
        const data = await postJSON("/api/pipeline/write/cancel", { job_id: jobId });
        workflowState.writeJobStatus = data.status || "canceled";
        applyWriteJobStatus(data);
        showSuccess("生成已中断，已生成章节已保留");
    } catch (e) {
        workflowState.writeJobStatus = "stopped";
        if (getEl("novel-job-status")) getEl("novel-job-status").textContent = "已中断";
        updateStopGenerationButton("stopped");
        showError(e.message || "中断请求失败，请稍后刷新状态");
    }
}
