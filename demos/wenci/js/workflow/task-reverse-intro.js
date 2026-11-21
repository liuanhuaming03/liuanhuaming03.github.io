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

function reverseIntroListHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="context-empty">暂无</div>';
    return `<ul>${items.map((item) => `<li>${reverseIntroEscape(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")}</ul>`;
}

const REVERSE_INTRO_SOURCE_LABELS = {
    intro_explicit: "导语明确给出",
    intro_inferred: "根据导语推断",
    creative_fill: "可补充设定",
};

const REVERSE_INTRO_FIELD_LABELS = {
    heroine: "女主",
    female_lead: "女主",
    protagonist: "主角",
    narrator: "叙述视角",
    boyfriend: "男友",
    boyfriend_appearance: "男友外貌",
    boyfriend_trait: "男友性格",
    boyfriend_identity: "男友身份",
    male_lead: "男主",
    relationship: "关系定位",
    relationship_dynamic: "关系张力",
    conflict: "核心冲突",
    core_conflict: "核心冲突",
    setting: "故事设定",
    background: "前史背景",
    hook: "爆点",
    ending_hook: "高潮爆点",
    pov: "叙述视角",
    theme: "情绪主题",
};

function reverseIntroHumanizeKey(key) {
    const raw = String(key || "").trim();
    if (!raw) return "设定";
    if (REVERSE_INTRO_FIELD_LABELS[raw]) return REVERSE_INTRO_FIELD_LABELS[raw];
    if (/[\u4e00-\u9fa5]/.test(raw)) return raw;
    return raw
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function reverseIntroReadableValue(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map(reverseIntroReadableValue).filter(Boolean).join("；");
    }
    if (typeof value === "object") {
        const direct = value.value || value.title || value.description || value.summary || value.text || value.content;
        if (direct) return reverseIntroReadableValue(direct);
        return Object.entries(value)
            .filter(([key]) => !["source", "id", "contract_ids"].includes(key))
            .map(([key, item]) => `${reverseIntroHumanizeKey(key)}：${reverseIntroReadableValue(item)}`)
            .filter((text) => !text.endsWith("："))
            .join("；");
    }
    return String(value);
}

function reverseIntroOptionText(item) {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return String(item || "");
    const title = reverseIntroReadableValue(item.title || item.name || item.id);
    const detail = reverseIntroReadableValue(item.value || item.description || item.summary || item.reason || item.content);
    if (title && detail && title !== detail) return `${title}：${detail}`;
    return detail || title || reverseIntroReadableValue(item);
}

function reverseIntroRenderReadableItems(items, emptyText = "暂无") {
    if (!Array.isArray(items) || !items.length) return `<div class="context-empty">${reverseIntroEscape(emptyText)}</div>`;
    return `<ul class="reverse-intro-readable-list">${items
        .map((item) => {
            const title = item.title ? `<span class="reverse-intro-readable-item__title">${reverseIntroEscape(item.title)}</span>` : "";
            return `<li>${title}<span>${reverseIntroEscape(item.text || "")}</span></li>`;
        })
        .join("")}</ul>`;
}

function reverseIntroGroupSettings(setting) {
    const groups = {
        intro_explicit: [],
        intro_inferred: [],
        creative_fill: [],
        other: [],
    };
    Object.entries(setting || {}).forEach(([key, item]) => {
        const source = item && typeof item === "object" ? String(item.source || "").trim() : "";
        const groupKey = REVERSE_INTRO_SOURCE_LABELS[source] ? source : "other";
        const text = reverseIntroReadableValue(item);
        if (!text) return;
        groups[groupKey].push({
            title: reverseIntroHumanizeKey(key),
            text,
        });
    });
    return groups;
}

function reverseIntroFormatConsistency(plan) {
    const contract = plan?.male_lead_consistency_contract || {};
    const rows = [
        { title: "稳定动机", text: reverseIntroReadableValue(contract.core_drive) },
        { title: "行为规则", text: reverseIntroReadableValue(contract.behavior_rules) },
        { title: "转变铺垫", text: reverseIntroReadableValue(contract.transition_beats) },
        { title: "禁止断裂", text: reverseIntroReadableValue(contract.forbidden_breaks) },
    ].filter((item) => item.text);
    return `
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">男主一致性检查</div>
            ${reverseIntroRenderReadableItems(rows, "暂无人物一致性约束")}
        </div>
    `;
}

function reverseIntroFormatRagReferences(plan) {
    const refs = Array.isArray(plan?.rag_references) ? plan.rag_references : [];
    if (!refs.length) {
        return `
            <div class="reverse-intro-block">
                <div class="reverse-intro-block__label">参考片段召回</div>
                <div class="context-empty">暂无召回参考片段，本次框架仅基于导语契约生成。</div>
            </div>
        `;
    }
    const items = refs.map((item, index) => {
        const title = `${item.title || `参考片段${index + 1}`}${item.reason ? ` / ${item.reason}` : ""}`;
        const text = item.text || item.preview || "";
        return { title, text };
    }).filter((item) => item.text);
    return `
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">参考片段召回</div>
            ${reverseIntroRenderReadableItems(items, "暂无召回参考片段")}
        </div>
    `;
}

function reverseIntroRenderContract(payload) {
    const contract = payload?.contract || {};
    const el = getEl("reverse-intro-contract");
    if (!el) return;
    el.innerHTML = `
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">事实</div>
            ${reverseIntroListHtml(contract.facts)}
        </div>
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">不可违背项</div>
            ${reverseIntroListHtml(contract.non_negotiables)}
        </div>
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">悬念空白</div>
            ${reverseIntroListHtml(contract.open_questions)}
        </div>
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">风险词</div>
            ${reverseIntroListHtml(contract.risk_terms)}
        </div>
    `;
}

function reverseIntroFormatSetting(plan) {
    const setting = plan?.tagged_setting || {};
    const options = plan?.creative_fill_options || [];
    const groups = reverseIntroGroupSettings(setting);
    const hasSettings = Object.values(groups).some((items) => items.length);
    const groupHtml = hasSettings
        ? [
            ["intro_explicit", "导语明确给出"],
            ["intro_inferred", "根据导语推断"],
            ["creative_fill", "可补充设定"],
            ["other", "其他设定"],
        ].map(([key, label]) => {
            const items = groups[key] || [];
            if (!items.length) return "";
            return `
                <div class="reverse-intro-readable-group">
                    <div class="reverse-intro-readable-group__title">${label}</div>
                    ${reverseIntroRenderReadableItems(items)}
                </div>
            `;
        }).join("")
        : '<div class="context-empty">暂无设定</div>';
    const optionItems = options
        .map((item) => ({ text: reverseIntroOptionText(item) }))
        .filter((item) => item.text);
    return `
        ${reverseIntroFormatConsistency(plan)}
        ${reverseIntroFormatRagReferences(plan)}
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">设定来源说明</div>
            ${groupHtml}
        </div>
        <div class="reverse-intro-block">
            <div class="reverse-intro-block__label">有限补全方向</div>
            ${reverseIntroRenderReadableItems(optionItems)}
        </div>
    `;
}

function reverseIntroRenderPlan(plan) {
    workflowState.reverseIntro.plan = plan;
    workflowState.reverseIntro.frameworkText = plan?.framework_text || "";
    const settingEl = getEl("reverse-intro-setting");
    const frameworkEl = getEl("reverse-intro-framework");
    if (settingEl) settingEl.innerHTML = reverseIntroFormatSetting(plan);
    if (frameworkEl) frameworkEl.value = workflowState.reverseIntro.frameworkText;
    updateAllTextareaCounters();
}

async function reverseIntroAnalyze() {
    const introText = reverseIntroGetInput();
    if (introText.length < 40) return showError("请先粘贴一段完整导语");
    const model = getEl("reverse-intro-model-select")?.value || "volcengine";
    workflowState.reverseIntro.introText = introText;
    showPageLoading("正在抽取导语契约...");
    reverseIntroSetStatus("正在生成契约");
    try {
        const payload = await postJSON("/api/reverse-intro/analyze", { intro_text: introText, model });
        workflowState.reverseIntro.contract = payload.contract || null;
        reverseIntroRenderContract(payload);
        reverseIntroSetStatus("契约已生成");
        showSuccess("导语契约已生成");
        return payload;
    } catch (err) {
        reverseIntroSetStatus(`契约生成失败：${err.message || "请稍后重试"}`);
        showError(err.message || "导语契约生成失败");
        return null;
    } finally {
        hidePageLoading();
    }
}

async function reverseIntroGeneratePlan() {
    const introText = reverseIntroGetInput();
    if (introText.length < 40) return showError("请先粘贴一段完整导语");
    const model = getEl("reverse-intro-model-select")?.value || "volcengine";
    const chapterCount = Number(getEl("reverse-intro-chapter-count")?.value || 10);
    let contract = workflowState.reverseIntro.contract;
    if (!contract) {
        const analyzed = await reverseIntroAnalyze();
        contract = analyzed?.contract;
        if (!contract) return null;
    }
    showPageLoading("正在生成设定与框架...");
    reverseIntroSetStatus("正在生成框架");
    try {
        const plan = await postJSON("/api/reverse-intro/plan", {
            intro_text: introText,
            contract,
            chapter_count: chapterCount,
            model,
        });
        reverseIntroRenderPlan(plan);
        reverseIntroSetStatus(`${chapterCount}章框架已生成`);
        showSuccess("设定与框架已生成");
        return plan;
    } catch (err) {
        reverseIntroSetStatus(`框架生成失败：${err.message || "请稍后重试"}`);
        showError(err.message || "设定与框架生成失败");
        return null;
    } finally {
        hidePageLoading();
    }
}

function reverseIntroUseFrameworkForWriting() {
    const frameworkText = (getEl("reverse-intro-framework")?.value || workflowState.reverseIntro.frameworkText || "").trim();
    if (!frameworkText) return showError("请先生成或填写导语定制框架");
    workflowState.finalFramework = workflowState.finalFramework || {};
    workflowState.finalFramework.final_text = frameworkText;
    workflowState.newOutlineText = frameworkText;
    if (getEl("rewrite-framework-text")) getEl("rewrite-framework-text").value = frameworkText;
    switchToStep(7);
    showSuccess("已将导语定制框架带入 AI重写，原系统流程未被替换");
}
