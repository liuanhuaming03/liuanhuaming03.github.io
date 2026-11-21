// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// 章节编辑器事件
// ========================================
function initChapterEditorEvents() {
    const editor = getEl("chapter-editor-text"); if (!editor) return;
    editor.addEventListener("input", () => {
        const draft = getChapterDraft(workflowState.selectedDraftChapter); if (!draft) return;
        draft.text = editor.value; draft.edited = true;
        draft.savedAt = null;
        if (getEl("chapter-editor-word-count")) getEl("chapter-editor-word-count").value = `${countDraftChars(draft.text)} 字`;
        renderChapterDraftList(); updateMergedNovelPreview(); renderChapterEditor();
        if (typeof scheduleCurrentChapterAutosave === "function") scheduleCurrentChapterAutosave();
    });

    // AI 改写：选区检测与浮动按钮
    const floatBtn = getEl("ai-rewrite-float-btn");
    if (!floatBtn) return;

    function hideFloatBtn() {
        floatBtn.style.display = "none";
    }

    function showFloatBtnAt(x, y) {
        floatBtn.style.display = "inline-flex";
        const rect = floatBtn.getBoundingClientRect();
        let left = x + 12;
        let top = y - rect.height - 8;
        if (left + rect.width > window.innerWidth - 12) left = window.innerWidth - rect.width - 12;
        if (top < 8) top = y + 16;
        floatBtn.style.left = `${left}px`;
        floatBtn.style.top = `${top}px`;
    }

    function checkSelection(e) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = String(editor.value || "").slice(start, end).trim();
        if (selected.length > 0 && e && e.clientX != null && e.clientY != null) {
            showFloatBtnAt(e.clientX, e.clientY);
        } else {
            hideFloatBtn();
        }
    }

    editor.addEventListener("mouseup", (e) => {
        // 延迟一小下让选区生效
        setTimeout(() => checkSelection(e), 10);
    });
    editor.addEventListener("keyup", (e) => {
        if (e.shiftKey || e.key === "Shift") return;
        hideFloatBtn();
    });
    editor.addEventListener("scroll", hideFloatBtn);

    floatBtn.addEventListener("click", () => {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = String(editor.value || "").slice(start, end);
        if (!selected.trim()) return;
        openRewriteModal(selected);
        hideFloatBtn();
    });

    // 点击页面其他地方隐藏浮动按钮
    document.addEventListener("mousedown", (e) => {
        if (!floatBtn.contains(e.target) && e.target !== editor) {
            hideFloatBtn();
        }
    });
}

// ========================================
// DOMContentLoaded
// ========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 第一步：先检查认证状态，未登录且 OAuth 启用时立即跳转
    const status = await checkAuthStatus();
    if (status.oauth_enabled && !status.logged_in) {
        redirectToOAuthLogin();
        return;
    }

    initParticles();
    initFileUpload();
    initTaskSidebarInteractions();
    initChapterEditorEvents();
    await loadWorkflowMetadata();
    renderHistoryReferencePanel();
    renderHistoryReferenceStatus();
    try {
        await loadHistoricalReferenceDates({ preserveSelection: false, silent: true });
    } catch {
        // 历史参考加载失败不应阻塞主流程
    }
    hideRelationshipResult();
    switchToStep(1);

    try {
        await loadCurrentUser();
        await loadTaskSidebarList({ autoSelectLatest: true });
        if (!workflowState.currentTaskId) startNewTaskDraft();
    } catch (err) {
        renderTaskSidebar();
        showError(err.message || "初始化任务导航失败");
        startNewTaskDraft();
    }

    // 启动认证心跳轮询
    startAuthHeartbeat();
});
