// 导语编辑 — Step 4 前端逻辑
// 三步管道: 生成第一句 → 结构编排 → 逐句润色

let introEditState = {};

function enterIntroEdit() {
    // 重置所有状态，防止上一轮任务的数据残留
    introEditState = {};
    // 清空所有动态内容
    ["intro-edit-original", "intro-edit-step2-text", "intro-edit-step3-text"].forEach(id => {
        const el = getEl(id);
        if (el) el.value = "";
    });
    ["intro-edit-step1-result", "intro-edit-step2-header", "intro-edit-step2-info", "intro-edit-step3-header", "intro-edit-step3-info"].forEach(id => {
        const el = getEl(id);
        if (el) el.innerHTML = "";
    });
    const confirmBtn1 = getEl("intro-edit-confirm-step1-btn");
    if (confirmBtn1) confirmBtn1.style.display = "none";
    const confirmBtn2 = getEl("intro-edit-confirm-step2-btn");
    if (confirmBtn2) confirmBtn2.style.display = "none";

    const intro = workflowState.introText || "";
    if (intro && getEl("intro-edit-original")) {
        getEl("intro-edit-original").value = intro;
    }
    switchToStep(8);
    hideAllStepCards();
    updateIntroEditStepBar(0);
    updateIntroInteractionState(0);
    // 如果有已保存的 step4 状态，尝试加载
    if (workflowState.currentTaskId) {
        loadStep4Draft(workflowState.currentTaskId, { silent: true });
    }
}

function setIntroButtonBusy(buttonId, busy) {
    const btn = getEl(buttonId);
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("is-loading", busy);
}

function updateIntroInteractionState(step) {
    const activeStep = Number(step) || 0;
    const workbench = document.querySelector("#stage-8 .intro-workbench");
    if (workbench) {
        workbench.dataset.introStep = String(activeStep);
        workbench.classList.toggle("is-processing", activeStep > 0);
    }
    document.querySelectorAll(".intro-tool-btn").forEach((button, index) => {
        const buttonStep = index + 1;
        button.classList.toggle("is-active", buttonStep === activeStep || (activeStep === 0 && buttonStep === 1));
        button.classList.toggle("is-done", buttonStep < activeStep);
    });
}

function hideAllStepCards() {
    ["intro-edit-step1-card", "intro-edit-step2-card", "intro-edit-step3-card"].forEach(id => {
        const el = getEl(id);
        if (el) el.style.display = "none";
    });
    const empty = getEl("intro-panel-empty");
    if (empty) empty.style.display = "block";
}

async function introEditStep1Generate() {
    const originalText = getEl("intro-edit-original")?.value?.trim();
    if (!originalText) return showError("请先输入或带入原始导语文本");

    setIntroButtonBusy("intro-edit-step1-btn", true);
    updateIntroInteractionState(1);

    try {
        const data = await postJSON("/api/workflow/step4/intro/generate_first", {
            original_intro_text: originalText,
        });
        const candidates = data.candidates || [];
        if (!candidates.length) throw new Error("未返回候选第一句");

        introEditState.original_text = originalText;
        introEditState.candidates = candidates;
        introEditState.selected_candidate_idx = 0;

        // 渲染可点击候选卡片
        const resultEl = getEl("intro-edit-step1-result");
        if (resultEl) {
            resultEl.innerHTML = buildCandidateCards(candidates, 0);
        }

        // 绑定点击事件
        bindCandidateClickEvents();

        const confirmBtn = getEl("intro-edit-confirm-step1-btn");
        if (confirmBtn) confirmBtn.style.display = "inline-flex";

        hideAllStepCards();
        showStepCard("intro-edit-step1-card");
        updateIntroEditStepBar(1);

        showSuccess(`已生成 ${candidates.length} 个候选第一句`);
    } catch (err) {
        showError(err.message || "生成第一句失败");
    } finally {
        setIntroButtonBusy("intro-edit-step1-btn", false);
        updateAllTextareaCounters();
    }
}

function buildCandidateCards(candidates, selectedIdx) {
    let html = '<div class="intro-edit-step-title">选择候选第一句</div>';
    candidates.forEach((c, i) => {
        const selClass = i === selectedIdx ? ' intro-edit-candidate--selected' : '';
        html += `<div class="intro-edit-candidate${selClass}" data-candidate-idx="${i}">
            <strong>${escapeHTML(c.sentence)}</strong>
            <div class="intro-edit-candidate-meta">方法论: ${escapeHTML(c.method_used)} | 理由: ${escapeHTML(c.reason)}</div>
        </div>`;
    });
    return html;
}

function bindCandidateClickEvents() {
    document.querySelectorAll(".intro-edit-candidate").forEach(el => {
        el.addEventListener("click", () => {
            const idx = parseInt(el.dataset.candidateIdx);
            if (isNaN(idx)) return;
            introEditState.selected_candidate_idx = idx;
            document.querySelectorAll(".intro-edit-candidate").forEach(c => {
                c.classList.toggle("intro-edit-candidate--selected", parseInt(c.dataset.candidateIdx) === idx);
            });
        });
    });
}

async function introEditConfirmStep1() {
    const idx = introEditState.selected_candidate_idx;
    if (idx == null || idx < 0) return showError("请先选择一个候选第一句");
    const candidate = introEditState.candidates[idx];
    if (!candidate) return showError("候选数据异常，请重新生成");

    const selectedSentence = candidate.sentence;
    introEditState.selected_first_sentence = selectedSentence;

    setIntroButtonBusy("intro-edit-confirm-step1-btn", true);
    updateIntroInteractionState(2);

    try {
        const data = await postJSON("/api/workflow/step4/intro/restructure", {
            original_intro_text: introEditState.original_text,
            first_sentence: selectedSentence,
        });

        const restructuredText = data.restructured_text || "";
        introEditState.structured_draft = restructuredText;
        introEditState.structured_result = data;
        renderIntroEditStep2State();

        // 隐藏 Step1，显示 Step2
        hideAllStepCards();
        showStepCard("intro-edit-step2-card");
        if (getEl("intro-edit-confirm-step2-btn")) getEl("intro-edit-confirm-step2-btn").style.display = "inline-flex";
        updateIntroEditStepBar(2);

        showSuccess("结构编排完成");
    } catch (err) {
        showError(err.message || "结构编排失败");
    } finally {
        setIntroButtonBusy("intro-edit-confirm-step1-btn", false);
        updateAllTextareaCounters();
    }
}

async function introEditConfirmStep2() {
    const editedDraft = getEl("intro-edit-step2-text")?.value?.trim();
    if (!editedDraft) return showError("请先完成结构编排");

    setIntroButtonBusy("intro-edit-confirm-step2-btn", true);
    updateIntroInteractionState(3);

    try {
        const data = await postJSON("/api/workflow/step4/intro/polish", {
            draft_text: editedDraft,
            original_intro_text: introEditState.original_text || "",
            selected_skills: null,
        });

        const polishedText = data.polished_text || "";
        introEditState.final_result = polishedText;
        introEditState.polish_result = data;

        // 验证第一句是否被保留
        const selectedFirst = introEditState.selected_first_sentence || "";
        let finalText = polishedText;
        if (selectedFirst && !finalText.startsWith(selectedFirst)) {
            const lines = finalText.split("\n");
            if (lines.length > 0) {
                lines[0] = selectedFirst;
                finalText = lines.join("\n");
            }
        }
        finalText = forceNewlineAfterPeriod(finalText);

        const headerEl = getEl("intro-edit-step3-header");
        if (headerEl) {
            const origLen = (introEditState.original_text || "").length;
            headerEl.innerHTML = `<div class="intro-edit-step-title">润色完成</div>
                <p><strong>第一句（已锁定）:</strong> ${escapeHTML(selectedFirst)}</p>
                <p><strong>字数对比:</strong> 原文 ${origLen} 字 → 最终 ${finalText.length} 字</p>
                <p>下方编辑框可微调最终导语，满意后保存或复制。</p>`;
        }

        if (getEl("intro-edit-step3-text")) {
            getEl("intro-edit-step3-text").value = finalText;
        }

        const infoEl = getEl("intro-edit-step3-info");
        if (infoEl) {
            const changes = data.sentence_changes || [];
            let infoHtml = `<div class="intro-edit-analysis">共处理 <strong>${changes.length}</strong> 处句子级改动</div>`;
            if (changes.length) {
                changes.forEach(ch => {
                    const si = ch.sentence_index ?? "?";
                    const skill = ch.skill_used || "未知";
                    const desc = ch.change_description || "";
                    infoHtml += `<div class="intro-edit-change-item">
                        <strong>第${typeof si === "number" ? si + 1 : si}句</strong> · ${escapeHTML(skill)}<br>
                        ${escapeHTML(desc)}
                    </div>`;
                });
            }
            infoEl.innerHTML = infoHtml;
        }

        // 隐藏 Step2，显示 Step3
        hideAllStepCards();
        showStepCard("intro-edit-step3-card");
        updateIntroEditStepBar(3);

        showSuccess("逐句润色完成");
    } catch (err) {
        showError(err.message || "逐句润色失败");
    } finally {
        setIntroButtonBusy("intro-edit-confirm-step2-btn", false);
        updateAllTextareaCounters();
    }
}

// ========================================
// 持久化: save / load
// ========================================

async function saveCurrentStep4Draft() {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId("intro");
    const editedText = getEl("intro-edit-step3-text")?.value?.trim() || introEditState.final_result || "";
    try {
        const payload = {
            task_id: workflowState.currentTaskId,
            title: (getEl("novel-title-input")?.value || inferNovelTitle() || "").trim() || "未命名任务",
            current_step: editedText ? "step4_done" : "step4_editing",
            original_intro_text: getEl("intro-edit-original")?.value?.trim() || introEditState.original_text || "",
            edited_intro_text: editedText,
            edit_state_json: introEditState,
            step1_status: "completed",
            step2_status: "completed",
            step3_status: "completed",
            step4_status: editedText ? "completed" : "processing",
        };
        const data = await postJSON("/api/workflow/step4/save", payload);
        workflowState.currentTaskId = data.task_id || workflowState.currentTaskId;
        await loadTaskSidebarList();
        showSuccess("导语编辑进度已保存");
    } catch (err) {
        showError(err.message || "保存导语编辑进度失败");
    }
}

async function loadStep4Draft(taskId, options = {}) {
    const { silent = false } = options;
    try {
        const payload = await fetchJSON(`/api/workflow/step4/load?task_id=${encodeURIComponent(taskId)}`);
        applyStep4DraftPayload(payload);
        if (!silent) showSuccess(`已载入导语编辑进度: ${payload.title || taskId}`);
    } catch (err) {
        switchToStep(8);
        if (!silent) showError(err.message || "加载导语编辑保存记录失败");
    }
}

function applyStep4DraftPayload(payload) {
    if (payload.original_intro_text && getEl("intro-edit-original")) {
        getEl("intro-edit-original").value = payload.original_intro_text;
    }
    if (payload.edited_intro_text && getEl("intro-edit-step3-text")) {
        getEl("intro-edit-step3-text").value = payload.edited_intro_text;
    }
    if (payload.edit_state_json && typeof payload.edit_state_json === "object") {
        introEditState = payload.edit_state_json;
    }
    // 恢复界面：只显示最后完成的步骤
    if (introEditState.final_result) {
        hideAllStepCards();
        showStepCard("intro-edit-step3-card");
        if (getEl("intro-edit-step3-text")) {
            getEl("intro-edit-step3-text").value = introEditState.final_result;
        }
        updateIntroEditStepBar(3);
        updateIntroInteractionState(3);
    } else if (introEditState.structured_draft) {
        hideAllStepCards();
        showStepCard("intro-edit-step2-card");
        renderIntroEditStep2State();
        if (getEl("intro-edit-confirm-step2-btn")) getEl("intro-edit-confirm-step2-btn").style.display = "inline-flex";
        updateIntroEditStepBar(2);
        updateIntroInteractionState(2);
    } else if (introEditState.candidates?.length) {
        hideAllStepCards();
        showStepCard("intro-edit-step1-card");
        const resultEl = getEl("intro-edit-step1-result");
        if (resultEl) {
            resultEl.innerHTML = buildCandidateCards(introEditState.candidates, introEditState.selected_candidate_idx || 0);
            bindCandidateClickEvents();
        }
        const confirmBtn = getEl("intro-edit-confirm-step1-btn");
        if (confirmBtn) confirmBtn.style.display = "inline-flex";
        updateIntroEditStepBar(1);
        updateIntroInteractionState(1);
    }
}

// ========================================
// 辅助函数
// ========================================

function copyEditedIntro() {
    const text = getEl("intro-edit-step3-text")?.value?.trim();
    if (!text) return showError("还没有编辑完成的导语");
    copyTextWithFallback(text).then(
        (copied) => copied ? showSuccess("导语已复制到剪贴板") : showError("复制失败")
    );
}

function showStepCard(id) {
    const card = getEl(id);
    if (card) {
        card.style.display = "block";
        card.classList.remove("intro-panel-section--enter");
        void card.offsetWidth;
        card.classList.add("intro-panel-section--enter");
    }
    const empty = getEl("intro-panel-empty");
    if (empty) empty.style.display = "none";
}

function buildIntroSubstepHtml(stepData, fallbackLabel, fallbackSummary) {
    const step = stepData && typeof stepData === "object" ? stepData : {};
    const label = step.label || fallbackLabel;
    const summary = step.summary || fallbackSummary;
    const focusText = step.focus_text || "";
    let html = `<div class="intro-edit-substep">
        <div class="intro-edit-substep__title">小步骤 · ${escapeHTML(label)}</div>
        <div class="intro-edit-substep__summary">${escapeHTML(summary)}</div>`;
    if (focusText) {
        html += `<div class="intro-edit-substep__focus"><strong>对应内容:</strong> ${escapeHTML(focusText)}</div>`;
    }
    html += `</div>`;
    return html;
}

function renderIntroEditStep2State() {
    const restructuredText = forceNewlineAfterPeriod(introEditState.structured_draft || "");
    const selectedSentence = introEditState.selected_first_sentence || "";
    const structuredResult = introEditState.structured_result || {};

    const headerEl = getEl("intro-edit-step2-header");
    if (headerEl) {
        const wordCount = restructuredText.length;
        headerEl.innerHTML = `<div class="intro-edit-step-title">整体编排完成</div>
            <p><strong>选定的第一句:</strong> ${escapeHTML(selectedSentence)}</p>
            <p><strong>字数:</strong> ${wordCount} 字</p>
            <p>本轮会显式展示两个小步骤：先做<strong>衔接</strong>，再完成<strong>转折</strong>。下方编辑框可微调编排结果，确认后进入润色。</p>`;
    }

    if (getEl("intro-edit-step2-text")) {
        getEl("intro-edit-step2-text").value = restructuredText;
    }
    if (getEl("intro-edit-step3-text") && !getEl("intro-edit-step3-text").value.trim()) {
        getEl("intro-edit-step3-text").value = restructuredText;
    }

    const infoEl = getEl("intro-edit-step2-info");
    if (infoEl) {
        let infoHtml = `<div class="intro-edit-analysis"><strong>编排策略:</strong> ${escapeHTML(structuredResult.skill_used || "未知")}</div>`;
        infoHtml += buildIntroSubstepHtml(structuredResult.bridge_step, "衔接", "承接开头爽点/虐点，补齐中段推进。");
        infoHtml += buildIntroSubstepHtml(structuredResult.turn_step, "转折", "在结尾翻上去，抛出底牌、反打或悬念。");
        const changes = structuredResult.changes || [];
        if (changes.length) {
            infoHtml += '<div class="intro-edit-changes"><strong>具体改动:</strong><ul>';
            changes.forEach(ch => {
                infoHtml += `<li><strong>[${escapeHTML(ch.type)}]</strong> ${escapeHTML(ch.description)}</li>`;
            });
            infoHtml += '</ul></div>';
        }
        if (structuredResult.reasoning) {
            infoHtml += `<div class="intro-edit-reasoning"><strong>编排思路:</strong> ${escapeHTML(structuredResult.reasoning)}</div>`;
        }
        infoEl.innerHTML = infoHtml;
    }
}

function updateIntroEditStepBar(currentStep) {
    document.querySelectorAll(".intro-edit-step").forEach(el => {
        const step = parseInt(el.dataset.introStep);
        el.classList.remove("is-active", "is-done");
        if (step < currentStep) el.classList.add("is-done");
        else if (step === currentStep) el.classList.add("is-active");
    });
}

function forceNewlineAfterPeriod(text) {
    if (!text) return text;
    // Character-by-character state machine: track whether we're inside
    // quotation marks so we never break dialogue mid-sentence.
    const SENTENCE_END = new Set(["。", "？", "！"]);
    const CLOSING = new Set(["」", "』", "”", "）", "】", "》", "〉", ")"]);

    // Directional quotes: opening char maps to closing char.
    // Straight quotes (", ') toggle: same char opens and closes.
    const DIRECTIONAL = { "“": "”", "「": "」", "『": "』" };
    const OPEN = new Set(Object.keys(DIRECTIONAL));
    const CLOSE = new Set(Object.values(DIRECTIONAL));

    let out = "";
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out += ch;

        if (OPEN.has(ch)) {
            inQuote = true;
        } else if (CLOSE.has(ch) && inQuote) {
            inQuote = false;
        } else if (ch === "\"" || ch === "'") {
            // Straight quotes toggle
            inQuote = !inQuote;
        }

        // Only add newline if we are NOT inside quotes
        if (!inQuote && SENTENCE_END.has(ch) && i + 1 < text.length) {
            const next = text[i + 1];
            if (next !== "\n" && !CLOSING.has(next) && next !== "”" && next !== "\"" && next !== "'") {
                out += "\n";
            }
        }
    }

    out = out.replace(/\n{3,}/g, "\n\n");
    // Safety net: remove any newline between sentence-end punctuation and closing quote
    // catches ？\n"  。\n」  ！\n"  etc.
    out = out.replace(/([。？！])\n(["」』”])/g, "$1$2");
    return out.trim();
}

function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
