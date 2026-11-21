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
    return {
        task_id: workflowState.currentTaskId || createClientTaskId(),
        title: inferStep3TaskTitle(),
        current_step: "step3_writing",
        framework_text: frameworkText,
        novel_title: novelTitle,
        enable_polish: getEl("novel-enable-polish")?.checked ?? true,
        write_job_id: workflowState.writeJobId || "",
        write_job_status: workflowState.writeJobStatus || "idle",
        current_stage: getEl("novel-job-status")?.textContent || workflowState.generatedNovel?.current_stage || "",
        current_chapter: workflowState.generatedNovel?.current_chapter || null,
        chapter_count: totalChapters || null,
        completed_chapters: completedChapters,
        selected_draft_chapter: workflowState.selectedDraftChapter || 1,
        auto_follow_draft_chapter: workflowState.autoFollowDraftChapter,
        chapter_plan: workflowState.chapterPlan || [],
        blueprint: workflowState.blueprint || {},
        generated_novel: workflowState.generatedNovel || {},
        chapter_drafts: workflowState.chapterDrafts || [],
        novel_text: generatedText,
        output_path: workflowState.generatedNovel?.output_path || getEl("generated-novel-output-path")?.textContent || "",
    };
}

async function saveCurrentStep3Draft() {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId();
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
    workflowState.blueprint = payload.blueprint || {};
    workflowState.chapterPlan = payload.chapter_plan || [];
    workflowState.generatedNovel = payload.generated_novel || {};
    workflowState.generatedNovel = {
        ...workflowState.generatedNovel,
        title: payload.novel_title || workflowState.generatedNovel.title || "",
        status: payload.write_job_status || workflowState.generatedNovel.status || "idle",
        current_stage: payload.current_stage || workflowState.generatedNovel.current_stage || "",
        current_chapter: payload.current_chapter || workflowState.generatedNovel.current_chapter || null,
        chapter_count: payload.chapter_count || workflowState.generatedNovel.chapter_count || 0,
        completed_chapters: payload.completed_chapters || workflowState.generatedNovel.completed_chapters || 0,
        output_path: payload.output_path || workflowState.generatedNovel.output_path || "",
        blueprint: payload.blueprint || workflowState.generatedNovel.blueprint || {},
        chapter_plan: payload.chapter_plan || workflowState.generatedNovel.chapter_plan || [],
    };
    workflowState.chapterDrafts = (payload.chapter_drafts || []).map(normalizeSavedChapterDraft);
    ensureChapterDrafts(payload.chapter_count || workflowState.chapterDrafts.length || 10);
    workflowState.selectedDraftChapter = Number(payload.selected_draft_chapter || workflowState.selectedDraftChapter || 1);
    workflowState.autoFollowDraftChapter = Boolean(payload.auto_follow_draft_chapter ?? true);

    if (getEl("rewrite-framework-text")) getEl("rewrite-framework-text").value = payload.framework_text || "";
    if (getEl("novel-title-input")) getEl("novel-title-input").value = payload.novel_title || "";
    if (getEl("novel-enable-polish")) getEl("novel-enable-polish").checked = Boolean(payload.enable_polish ?? true);
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

    renderTaskSidebar();
    switchToStep(7);

    if (workflowState.writeJobId && ["running", "queued", "processing"].includes(String(workflowState.writeJobStatus).toLowerCase())) {
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
    const enablePolish = getEl("novel-enable-polish")?.checked ?? true;
    showPageLoading("正在启动逐章小说生成...");
    try {
        const data = await postJSON("/api/pipeline/write/start", {
            framework_text: frameworkText,
            title,
            enable_polish: enablePolish,
            task_id: workflowState.currentTaskId || "",
        });
        const jobId = data.job_id; if (!jobId) throw new Error("未返回 job_id");
        workflowState.writeJobId = jobId; workflowState.writeJobStatus = "running"; workflowState.writeLastNotifiedStatus = "";
        workflowState.blueprint = {};
        workflowState.chapterPlan = [];
        ensureChapterDrafts(data.chapter_count || 10); renderChapterDraftList(); renderChapterEditor();
        getEl("novel-generation-card").style.display = "block";
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
        if (manual) showSuccess(`第${draft.chapter}章已保存`);
    } catch (err) {
        showError(err.message || "章节保存失败");
    }
}

async function regenerateCurrentChapter() {
    const draft = getChapterDraft(workflowState.selectedDraftChapter);
    if (!draft || !workflowState.writeJobId) return showError("当前还没有可重生成的章节");
    if (!confirm(`将重新生成第${draft.chapter}章，并清空它之后章节的当前正文内容。确定继续吗？`)) return;
    showPageLoading(`正在准备重生成第${draft.chapter}章...`);
    try {
        const data = await postJSON("/api/pipeline/write/chapter/regenerate", {
            job_id: workflowState.writeJobId,
            chapter: draft.chapter,
        });
        workflowState.writeJobStatus = data.status || "running";
        startWriteJobPolling(workflowState.writeJobId);
        showSuccess(`第${draft.chapter}章已进入重生成队列`);
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

function openRewriteModal(selectedText) {
    const overlay = getEl("ai-rewrite-modal-overlay");
    const preview = getEl("ai-rewrite-preview");
    const instruction = getEl("ai-rewrite-instruction");
    if (!overlay || !preview || !instruction) return;
    _rewriteSelectionRange = {
        start: getEl("chapter-editor-text").selectionStart,
        end: getEl("chapter-editor-text").selectionEnd,
        text: selectedText,
    };
    preview.value = selectedText.length > 300 ? selectedText.slice(0, 300) + "…" : selectedText;
    instruction.value = "";
    overlay.classList.add("is-active");
    instruction.focus();
}

function closeRewriteModal() {
    const overlay = getEl("ai-rewrite-modal-overlay");
    if (overlay) overlay.classList.remove("is-active");
    _rewriteSelectionRange = null;
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
        const data = await postJSON("/api/pipeline/write/chapter/rewrite_selection", {
            job_id: workflowState.writeJobId || "",
            chapter: draft?.chapter || workflowState.selectedDraftChapter,
            selected_text: _rewriteSelectionRange.text,
            instruction,
        });
        const rewritten = String(data.rewritten_text || "");
        if (!rewritten) throw new Error("返回结果为空");

        const { start, end } = _rewriteSelectionRange;
        const newValue = editor.value.substring(0, start) + rewritten + editor.value.substring(end);
        editor.value = newValue;
        editor.dispatchEvent(new Event("input"));
        editor.setSelectionRange(start, start + rewritten.length);

        showSuccess("改写完成");
        closeRewriteModal();
    } catch (err) {
        showError(err.message || "AI 改写失败");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "发送";
    }
}
