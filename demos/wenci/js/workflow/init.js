// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// 章节编辑器事件
// ========================================
function initChapterEditorEvents() {
    const editor = getEl("chapter-editor-text"); if (!editor) return;
    editor.addEventListener("input", (e) => {
        if (e.isTrusted) {
            _lastRewriteUndo = null;
        }
        const draft = getChapterDraft(workflowState.selectedDraftChapter); if (!draft) return;
        draft.text = editor.value; draft.edited = true;
        draft.savedAt = null;
        if (getEl("chapter-editor-word-count")) getEl("chapter-editor-word-count").value = `${countDraftChars(draft.text)} 字`;
        renderChapterDraftList(); updateMergedNovelPreview(); renderChapterEditor();
        if (typeof scheduleCurrentChapterAutosave === "function") scheduleCurrentChapterAutosave();
    });

    editor.addEventListener("keydown", (e) => {
        const isUndo = (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey;
        if (isUndo && _lastRewriteUndo) {
            e.preventDefault();
            const { oldValue, start, end } = _lastRewriteUndo;
            editor.value = oldValue;
            editor.dispatchEvent(new Event("input"));
            editor.focus();
            editor.setSelectionRange(start, end);
            _lastRewriteUndo = null;
        }
    });

    // AI 改写：选区检测与浮动按钮
    const floatBtn = getEl("ai-rewrite-float-btn");

    function hideFloatBtn() {
        if (!floatBtn) return;
        floatBtn.style.display = "none";
    }

    function showFloatBtnAt(x, y) {
        if (!floatBtn) return;
        floatBtn.style.display = "inline-flex";
        const rect = floatBtn.getBoundingClientRect();
        const btnHeight = rect.height || 32;
        const btnWidth = rect.width || 85;
        let left = x + 12;
        let top = y - btnHeight - 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (left + btnWidth > vw - 12) left = vw - btnWidth - 12;
        if (left < 8) left = 8;
        if (top < 8) top = y + 16;
        if (top + btnHeight > vh - 8) top = vh - btnHeight - 8;
        if (top < 8) top = 8;
        floatBtn.style.left = `${left}px`;
        floatBtn.style.top = `${top}px`;
    }

    function checkSelection(e) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = String(editor.value || "").slice(start, end).trim();
        if (selected.length > 0) {
            let x, y;
            if (e && e.clientX != null && e.clientY != null) {
                x = e.clientX;
                y = e.clientY;
            } else {
                // 键盘选区无鼠标坐标时，显示在编辑器中部偏上
                const editorRect = editor.getBoundingClientRect();
                x = editorRect.left + editorRect.width / 2;
                y = editorRect.top + 120;
            }
            showFloatBtnAt(x, y);
        } else {
            hideFloatBtn();
        }
    }

    editor.addEventListener("mouseup", (e) => {
        // 延迟一小下让选区生效
        setTimeout(() => checkSelection(e), 10);
    });
    editor.addEventListener("keyup", (e) => {
        if (e.shiftKey || e.key === "Shift") {
            setTimeout(() => checkSelection(e), 10);
            return;
        }
        hideFloatBtn();
    });
    editor.addEventListener("scroll", hideFloatBtn);

    if (floatBtn) {
        floatBtn.addEventListener("click", () => {
            editor.focus();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const selected = String(editor.value || "").slice(start, end);
            if (!selected.trim()) return;
            openRewriteModal({ start, end, text: selected });
            hideFloatBtn();
        });
    }

    // 点击页面其他地方隐藏浮动按钮
    document.addEventListener("mousedown", (e) => {
        if (!floatBtn || (!floatBtn.contains(e.target) && e.target !== editor)) {
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
    initContextPanelPreference();
    initTextareaCounters();
    initTextareaEditorObserver();
    await loadWorkflowMetadata();
    renderHistoryReferencePanel();
    renderHistoryReferenceStatus();
    try {
        await loadHistoricalReferenceDates({ preserveSelection: false, silent: true });
    } catch {
        // 历史参考加载失败不应阻塞主流程
    }
    showHomeScreen();

    try {
        await loadCurrentUser();
        await loadTaskSidebarList({ autoSelectLatest: false, silent: true });
    } catch (err) {
        renderTaskSidebar();
        if (!isLocalDebugAuthBypass()) {
            showError(err.message || "初始化任务导航失败");
        }
    }

    // 启动认证心跳轮询
    startAuthHeartbeat();
});
