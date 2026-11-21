// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// Step 1: AI 拆解
// ========================================
const REQUIRED_SPLIT_SECTIONS = [
    "【一、世界观】",
    "【二、核心梗】",
    "【三、故事背景】",
    "【四、故事梗概】",
    "【五、一句话卖点】",
    "【六、人物关系】",
    "【七、人物小传】",
    "【八、小说大纲】",
];

function inspectSplitResultStructure(text) {
    const normalized = String(text || "");
    const missingSections = REQUIRED_SPLIT_SECTIONS.filter((section) => !normalized.includes(section));
    const chapterCount = (normalized.match(/(^|\n)第\s*([1-9][0-9]{0,2})\s*章[:：]?/g) || []).length;
    return {
        isValid: missingSections.length === 0 && chapterCount >= 10,
        missingSections,
        chapterCount,
    };
}

async function splitNovelStep() {
    const rawText = getEl("raw-novel-text").value.trim();
    if (!rawText) return showError("请先粘贴原始小说正文");
    const splitBtn = getEl("step1-split-btn");
    if (splitBtn) splitBtn.disabled = true;
    setTextareaBusy("raw-novel-text", "AI 正在拆解原文，生成标准化框架");
    try {
        const data = await postJSON("/api/pipeline/split", { text: rawText });
        workflowState.rawNovelText = rawText;
        workflowState.splitterResultText = data.split_result || data.result || "";
        workflowState.originalOutlineText = workflowState.splitterResultText;
        getEl("input-outline-text").value = workflowState.splitterResultText;
        updateAllTextareaCounters();
        const structureCheck = data.structure_check || inspectSplitResultStructure(workflowState.splitterResultText);
        switchToStep(2);
        if (!structureCheck.is_valid) {
            const missingText = structureCheck.missing_sections?.length
                ? `缺少：${structureCheck.missing_sections.join("、")}`
                : "";
            const chapterText = `识别到 ${structureCheck.chapter_count || 0} 章`;
            const separator = missingText ? "；" : "";
            showError(`拆解已返回，但格式不完整，${missingText}${separator}${chapterText}。请先检查后再进入 AI改编。`);
            return;
        }
        showSuccess("拆解完成，请检查结果后进入改编工作流");
    } catch (err) { showError(err.message || "拆解失败"); }
    finally {
        clearTextareaBusy("raw-novel-text");
        if (splitBtn) splitBtn.disabled = false;
    }
}

function collectStep1DraftPayload() {
    const detail = workflowState.historicalReferenceDetail || {};
    return {
        task_id: workflowState.currentTaskId || createClientTaskId("split"),
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
