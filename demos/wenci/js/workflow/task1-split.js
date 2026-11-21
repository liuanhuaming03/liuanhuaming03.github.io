// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// Step 1: AI 拆解
// ========================================
async function splitNovelStep() {
    const rawText = getEl("raw-novel-text").value.trim();
    if (!rawText) return showError("请先粘贴原始小说正文");
    showPageLoading("AI 正在拆解原文，生成标准化框架...");
    try {
        const data = await postJSON("/api/pipeline/split", { text: rawText });
        workflowState.rawNovelText = rawText;
        workflowState.splitterResultText = data.split_result || data.result || "";
        getEl("input-outline-text").value = workflowState.splitterResultText;
        switchToStep(2); showSuccess("拆解完成，请检查结果后进入改编工作流");
    } catch (err) { showError(err.message || "拆解失败"); }
    finally { hidePageLoading(); }
}

function collectStep1DraftPayload() {
    const detail = workflowState.historicalReferenceDetail || {};
    return {
        task_id: workflowState.currentTaskId || createClientTaskId(),
        title: inferStep1TaskTitle(),
        current_step: inferStep1CurrentStep(),
        input_mode: inferStep1InputMode(),
        raw_source_text: (getEl("raw-novel-text")?.value || "").trim(),
        outline_source_text: (getEl("input-outline-text")?.value || "").trim(),
        split_result_text: workflowState.splitterResultText || (getEl("input-outline-text")?.value || "").trim(),
        parsed_outline_json: workflowState.parsedOutline || {},
        relationship_data_json: workflowState.relationshipData || {},
        outline_analysis_json: workflowState.outlineAnalysis || {},
        reference_date: workflowState.selectedHistoricalDate || "",
        reference_book_id: workflowState.selectedHistoricalBookId || "",
        reference_title: detail.title || "",
        reference_meta_json: detail ? {
            book_id: detail.book_id || workflowState.selectedHistoricalBookId || "",
            rank: detail.rank || "",
            source: detail.source || "history_reference",
        } : {},
    };
}

async function saveCurrentStep1Draft() {
    if (!workflowState.currentUser) return showError("当前用户信息尚未完成初始化，请稍后重试");
    const payload = collectStep1DraftPayload();
    workflowState.currentTaskId = payload.task_id;
    try {
        const data = await postJSON("/api/workflow/step1/save", payload);
        await loadTaskSidebarList({ autoSelectLatest: false });
        workflowState.currentTaskId = String(data.task_id || payload.task_id);
        renderTaskSidebar();
        showSuccess("第一页当前进度已保存，刷新页面后可恢复");
    } catch (err) {
        showError(err.message || "保存第一页进度失败");
    }
}
