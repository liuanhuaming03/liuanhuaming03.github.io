// ========================================
// 并行模式：导语定制 / 逆工作流
// ========================================

function reverseIntroGetInput() {
    return (getEl("reverse-intro-input")?.value || "").trim();
}

function reverseIntroSetStatus(text) {
    const el = getEl("reverse-intro-status");
    if (el) el.textContent = text || "等待输入";
}

function reverseIntroEscape(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function reverseIntroRenderPlan(plan) {
    workflowState.reverseIntro.plan = plan;
    workflowState.reverseIntro.frameworkText = plan?.framework_text || "";
    const frameworkEl = getEl("reverse-intro-framework");
    if (frameworkEl) frameworkEl.value = workflowState.reverseIntro.frameworkText;
    updateAllTextareaCounters();
}

function reverseIntroGetFrameworkText() {
    return (getEl("reverse-intro-framework")?.value || workflowState.reverseIntro.frameworkText || "").trim();
}

async function reverseIntroGeneratePlan() {
    const introText = reverseIntroGetInput();
    if (introText.length < 40) return showError("请先粘贴一段完整导语");
    const model = getEl("reverse-intro-model-select")?.value || "volcengine";
    const chapterCount = Number(getEl("reverse-intro-chapter-count")?.value || 10);
    workflowState.reverseIntro.introText = introText;
    showPageLoading("正在根据导语生成完整梗概...");
    reverseIntroSetStatus("正在生成梗概");
    try {
        const plan = await postJSON("/api/reverse-intro/plan", {
            intro_text: introText,
            chapter_count: chapterCount,
            model,
        });
        reverseIntroRenderPlan(plan);
        reverseIntroSetStatus(`${chapterCount}章梗概已生成`);
        showSuccess("完整梗概已生成");
        return plan;
    } catch (err) {
        reverseIntroSetStatus(`梗概生成失败：${err.message || "请稍后重试"}`);
        showError(err.message || "完整梗概生成失败");
        return null;
    } finally {
        hidePageLoading();
    }
}

function reverseIntroUseFrameworkForWriting() {
    const frameworkText = reverseIntroGetFrameworkText();
    if (!frameworkText) return showError("请先生成或填写导语定制框架");
    workflowState.finalFramework = workflowState.finalFramework || {};
    workflowState.finalFramework.final_text = frameworkText;
    workflowState.newOutlineText = frameworkText;
    if (getEl("rewrite-framework-text")) getEl("rewrite-framework-text").value = frameworkText;
    switchToStep(7);
    showSuccess("已将导语定制框架带入 AI重写，原系统流程未被替换");
}

function reverseIntroUseFrameworkForAdaptation() {
    const frameworkText = reverseIntroGetFrameworkText();
    if (!frameworkText) return showError("请先生成或填写导语定制框架");

    resetStep2Workspace({ preserveOutlineInput: true });
    workflowState.originalOutlineText = frameworkText;
    workflowState.splitterResultText = frameworkText;
    workflowState.parsedOutline = null;
    workflowState.relationshipData = null;
    workflowState.outlineAnalysis = null;
    workflowState.selectedWorldview = "";
    workflowState.finalFramework = null;
    workflowState.newOutlineText = "";

    if (getEl("input-outline-text")) getEl("input-outline-text").value = frameworkText;
    updateAllTextareaCounters();
    switchToStep(2);
    getEl("input-outline-text")?.focus();
    showSuccess("已将导语定制框架带入 AI改编，请继续解析和配置");
}
