// 此文件由 frontend/js/main.js 按任务域拆分而来；保持原 index.html 页面风格、DOM 与交互不变。

// ========================================
// Step 2: 进入改编工作流
// ========================================
function inferStep2TaskTitle() {
    const outlineText = (getEl("input-outline-text")?.value || workflowState.originalOutlineText || workflowState.splitterResultText || "").trim();
    const parsedTitle = workflowState.parsedOutline?.title || workflowState.parsedOutline?.["标题"] || "";
    const source = parsedTitle || outlineText || workflowState.currentTaskId || "未命名任务";
    const firstLine = source.split(/\n+/).find((line) => line.trim()) || source;
    return firstLine.trim().slice(0, 24) || "未命名任务";
}

function inferStep2CurrentStep() {
    if (workflowState.currentStep >= 6 || (getEl("new-outline-text")?.value || workflowState.newOutlineText || "").trim()) {
        return "step2_outline";
    }
    if (workflowState.currentStep >= 5 || workflowState.newCharacterBios) return "step2_characters";
    if (workflowState.currentStep >= 4 || workflowState.selectedWorldview || workflowState.selectedGenres.length || workflowState.selectedCoreScene) {
        return "step2_settings";
    }
    return "step2_input_outline";
}

function getStageStepForStep2State(currentStep) {
    const normalized = String(currentStep || "").trim().toLowerCase();
    if (normalized === "step2_outline") return 6;
    if (normalized === "step2_characters") return 4;
    if (normalized === "step2_settings") return 4;
    return 2;
}

function renderSavedGenreSelection() {
    const genreSelect = getEl("genre-select");
    if (genreSelect && workflowState.selectedGenres[0]) {
        genreSelect.value = workflowState.selectedGenres[0];
    }
}

function renderSavedSceneSelection() {
    const matchedArea = getEl("matched-scenes-area");
    const selection = getEl("new-scene-selection");
    if (!matchedArea || !selection) return;
    const matchedScenes = Array.isArray(workflowState.matchedScenes) ? workflowState.matchedScenes : [];
    if ((!workflowState.selectedCoreScene && !matchedScenes.length) || workflowState.keptOriginalScene) {
        matchedArea.style.display = "none";
        matchedArea.classList.remove("is-visible");
        selection.innerHTML = "";
        return;
    }
    matchedArea.style.display = "block";
    matchedArea.classList.add("is-visible");
    renderSceneSelectionOptions(matchedScenes, workflowState.selectedCoreScene || "");
}

function normalizeMatchedScenes(items) {
    const seen = new Set();
    const result = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
        const name = typeof item === "string"
            ? item.trim()
            : String(item?.name || item?.scene_name || item?.value || "").trim();
        if (!name || seen.has(name)) return;
        seen.add(name);
        result.push(name);
    });
    return result;
}

function renderSceneSelectionOptions(items, selectedScene = "") {
    const selection = getEl("new-scene-selection");
    const matchedArea = getEl("matched-scenes-area");
    if (!selection || !matchedArea) return;

    const normalized = normalizeMatchedScenes(items);
    const currentInput = (getEl("core-scene-input")?.value || "").trim();
    const selected = String(selectedScene || "").trim();
    const customScene = selected && !normalized.includes(selected) ? selected : "";

    const chips = [];
    if (customScene) {
        chips.push({ name: customScene, tag: "自定义" });
    }
    normalized.forEach((name) => chips.push({ name, tag: "候选" }));

    if (!chips.length) {
        matchedArea.style.display = "none";
        matchedArea.classList.remove("is-visible");
        selection.innerHTML = "";
        return;
    }

    matchedArea.style.display = "block";
    matchedArea.classList.add("is-visible");
    selection.innerHTML = chips.map((item) => `
        <div class="scene-option ${item.name === selected ? "scene-option--selected" : ""}" data-value="${escapeHTML(item.name)}">
            <div class="scene-option__name">${escapeHTML(item.name)}</div>
            <div class="scene-option__tag">${escapeHTML(item.tag)}</div>
        </div>
    `).join("");

    selection.querySelectorAll(".scene-option").forEach((el) => {
        el.addEventListener("click", () => {
            const sceneName = el.dataset.value || "";
            workflowState.selectedCoreScene = sceneName;
            workflowState.keptOriginalScene = false;
            if (getEl("core-scene-input")) getEl("core-scene-input").value = sceneName;
            getEl("skip-scene-info")?.classList.remove("is-visible");
            renderSceneSelectionOptions(workflowState.matchedScenes || [], sceneName);
            updateAdaptationConfirmButton();
        });
    });

    if (currentInput && currentInput !== selected && !normalized.includes(currentInput)) {
        workflowState.selectedCoreScene = selected || workflowState.selectedCoreScene;
    }
}

function renderStep2SummaryLabels() {
    if (getEl("outline-worldview-label")) getEl("outline-worldview-label").textContent = workflowState.selectedWorldview || "—";
    if (getEl("outline-genre-label")) getEl("outline-genre-label").textContent = workflowState.selectedGenres.join("、") || "—";
    if (getEl("outline-audience-label")) getEl("outline-audience-label").textContent = workflowState.targetAudience || "—";
    if (getEl("outline-scene-label")) getEl("outline-scene-label").textContent = workflowState.selectedCoreScene || "—";
    if (getEl("header-selection-bar") && (workflowState.selectedWorldview || workflowState.selectedGenres.length)) {
        getEl("header-selection-bar").style.display = "flex";
    }
}

function getAdaptationRequirement() {
    const value = getEl("adaptation-user-note")?.value || workflowState.adaptationRequirement || "";
    return value.trim();
}

function applyAdaptationRequirementPreset(text) {
    const input = getEl("adaptation-user-note");
    if (!input) return;
    const current = (input.value || "").trim();
    input.value = current ? `${current}；${text}` : text;
    workflowState.adaptationRequirement = input.value.trim();
}

function extractOriginalCharactersText() {
    let charText = "";
    if (workflowState.originalOutlineText) {
        // Match 人物小传 section regardless of numbering (六、七、八 etc.)
        const match = workflowState.originalOutlineText.match(/【[六七八]、人物小传】([\s\S]*?)(?=【[七八九]、|【[一二三四五六七八九]+、[^人]|$)/);
        if (match) charText = match[1].trim();
    }
    if (!charText) {
        const parsed = workflowState.parsedOutline || {};
        const originalCharacters = parsed.character_biographies || parsed.character_bios || parsed["人设传记"] || parsed["人物小传"] || parsed["六、人物小传"] || parsed.characters || "";
        charText = typeof originalCharacters === "string" ? originalCharacters : JSON.stringify(originalCharacters, null, 2);
    }
    charText = String(charText || "").trim();
    // Normalize: convert literal \n strings to real newlines
    charText = charText.replace(/\\n/g, "\n");
    // Collapse 3+ consecutive newlines to double newlines
    charText = charText.replace(/\n{3,}/g, "\n\n");
    return charText;
}

function fillOriginalCharactersFromAnalysis(options = {}) {
    const { silent = true, force = false } = options;
    const target = getEl("original-characters-display");
    if (!target || (!force && target.value.trim())) return false;
    const charText = extractOriginalCharactersText();
    if (!charText) {
        if (!silent) showError("未找到原始人物小传信息");
        return false;
    }
    target.value = charText;
    target.readOnly = false;
    workflowState.keptOriginalCharacters = true;
    if (force || !workflowState.newCharacterBios) workflowState.newCharacterBios = charText;
    if (getEl("skip-character-value")) getEl("skip-character-value").textContent = "已填入原始人物小传";
    if (getEl("skip-character-info")) getEl("skip-character-info").classList.add("is-visible");
    if (getEl("confirm-character-btn")) getEl("confirm-character-btn").disabled = false;
    updateAllTextareaCounters();
    if (!silent) showSuccess("已填入原始人物小传，可编辑后确认");
    return true;
}

function collectStep2DraftPayload() {
    const outlineInput = (getEl("input-outline-text")?.value || workflowState.originalOutlineText || workflowState.splitterResultText || "").trim();
    const originalCharactersText = getEl("original-characters-display")?.value || "";
    const aiCharactersText = getEl("new-character-bios")?.value || workflowState.newCharacterBios || "";
    const outputOutlineText = getEl("new-outline-text")?.value || workflowState.newOutlineText || "";
    workflowState.adaptationRequirement = getAdaptationRequirement();
    return {
        task_id: workflowState.currentTaskId || createClientTaskId("adapt"),
        title: inferStep2TaskTitle(),
        current_step: inferStep2CurrentStep(),
        selected_worldview: workflowState.selectedWorldview || "",
        selected_genre: workflowState.selectedGenres[0] || "",
        selected_core_scene: workflowState.selectedCoreScene || "",
        target_audience: workflowState.targetAudience || "",
        adaptation_requirement: workflowState.adaptationRequirement || "",
        kept_original_worldview: workflowState.keptOriginalWorldview,
        kept_original_genre: workflowState.keptOriginalGenre,
        kept_original_scene: workflowState.keptOriginalScene,
        kept_original_characters: workflowState.keptOriginalCharacters,
        input_outline_text: outlineInput,
        parsed_outline_json: workflowState.parsedOutline || {},
        relationship_data_json: workflowState.relationshipData || {},
        outline_analysis_json: workflowState.outlineAnalysis || {},
        matched_scenes_json: {
            selected_core_scene: workflowState.selectedCoreScene || "",
            selected_genres: workflowState.selectedGenres || [],
            items: workflowState.matchedScenes || [],
            custom_scene_input: getEl("core-scene-input")?.value?.trim() || "",
        },
        original_characters_text: originalCharactersText,
        ai_generated_characters_text: aiCharactersText,
        new_outline_draft_text: outputOutlineText,
        output_outline_text: outputOutlineText,
    };
}

async function saveCurrentStep2Draft() {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId("adapt");
    try {
        const payload = collectStep2DraftPayload();
        const data = await postJSON("/api/workflow/step2/save", payload);
        workflowState.currentTaskId = data.task_id || workflowState.currentTaskId;
        await loadTaskSidebarList();
        showSuccess("第二环节进度已保存");
    } catch (err) {
        showError(err.message || "保存第二环节进度失败");
    }
}

function applyStep2DraftPayload(payload) {
    workflowState.currentTaskId = String(payload.task_id || workflowState.currentTaskId || "");
    workflowState.originalOutlineText = payload.input_outline_text || "";
    workflowState.splitterResultText = payload.input_outline_text || workflowState.splitterResultText || "";
    workflowState.parsedOutline = payload.parsed_outline_json || null;
    workflowState.relationshipData = payload.relationship_data_json || null;
    workflowState.outlineAnalysis = payload.outline_analysis_json || null;
    workflowState.selectedWorldview = payload.selected_worldview || "";
    workflowState.selectedGenres = payload.selected_genre ? [payload.selected_genre] : [];
    workflowState.targetAudience = payload.target_audience || "";
    workflowState.selectedCoreScene = payload.selected_core_scene || "";
    workflowState.matchedScenes = normalizeMatchedScenes(payload.matched_scenes_json?.items || []);
    workflowState.adaptationRequirement = payload.adaptation_requirement || payload.core_hook_requirement || "";
    workflowState.keptOriginalWorldview = Boolean(payload.kept_original_worldview);
    workflowState.keptOriginalGenre = Boolean(payload.kept_original_genre);
    workflowState.keptOriginalScene = Boolean(payload.kept_original_scene);
    workflowState.keptOriginalCharacters = Boolean(payload.kept_original_characters);
    workflowState.newCharacterBios = payload.ai_generated_characters_text || payload.original_characters_text || "";
    workflowState.newOutlineText = payload.output_outline_text || payload.new_outline_draft_text || "";
    workflowState.finalFramework = workflowState.newOutlineText ? { final_text: workflowState.newOutlineText } : workflowState.finalFramework;

    if (getEl("input-outline-text")) getEl("input-outline-text").value = workflowState.originalOutlineText;
    if (getEl("original-characters-display")) getEl("original-characters-display").value = payload.original_characters_text || "";
    if (getEl("new-character-bios")) getEl("new-character-bios").value = payload.ai_generated_characters_text || "";
    if (getEl("new-outline-text")) getEl("new-outline-text").value = workflowState.newOutlineText;
    if (getEl("original-scene-text")) getEl("original-scene-text").textContent = workflowState.outlineAnalysis?.original_core_scene || "未知";
    if (getEl("core-scene-input")) {
        getEl("core-scene-input").value =
            payload.matched_scenes_json?.custom_scene_input ||
            workflowState.selectedCoreScene ||
            "";
    }
    if (getEl("adaptation-user-note")) getEl("adaptation-user-note").value = workflowState.adaptationRequirement;

    const worldviewSelect = getEl("worldview-select");
    if (worldviewSelect) worldviewSelect.value = workflowState.selectedWorldview || "";
    if (workflowState.selectedWorldview) renderGenreOptions(workflowState.selectedWorldview);
    renderSavedGenreSelection();

    const audienceSelect = getEl("audience-select");
    if (audienceSelect) audienceSelect.value = workflowState.targetAudience || "";

    if (getEl("skip-worldview-value")) getEl("skip-worldview-value").textContent = workflowState.selectedWorldview || "—";
    if (getEl("skip-worldview-info")) getEl("skip-worldview-info").classList.toggle("is-visible", workflowState.keptOriginalWorldview);
    if (getEl("skip-genre-value")) getEl("skip-genre-value").textContent = `题材：${workflowState.selectedGenres[0] || "未知"} | 频道：${workflowState.targetAudience || "未知"}`;
    if (getEl("skip-genre-info")) getEl("skip-genre-info").classList.toggle("is-visible", workflowState.keptOriginalGenre);
    if (getEl("skip-scene-value")) getEl("skip-scene-value").textContent = workflowState.selectedCoreScene || "—";
    if (getEl("skip-scene-info")) getEl("skip-scene-info").classList.toggle("is-visible", workflowState.keptOriginalScene);
    if (getEl("name-replace-tool")) {
        getEl("name-replace-tool").style.display = "grid";
    }
    if (getEl("confirm-character-btn")) {
        getEl("confirm-character-btn").disabled = !(payload.ai_generated_characters_text || payload.original_characters_text);
    }
    if (getEl("new-outline-result-card")) {
        getEl("new-outline-result-card").style.display = "block";
    }

    renderSavedSceneSelection();
    fillOriginalCharactersFromAnalysis({ silent: true });
    renderStep2SummaryLabels();
    updateAdaptationConfirmButton();
    renderTaskSidebar();
    switchToStep(getStageStepForStep2State(payload.current_step));
}

async function loadStep2Draft(taskId, options = {}) {
    const { silent = false } = options;
    try {
        const payload = await fetchJSON(`/api/workflow/step2/load?task_id=${encodeURIComponent(taskId)}`);
        applyStep2DraftPayload(payload);
        if (!silent) showSuccess(`已载入任务：${payload.title || taskId}`);
    } catch (err) {
        switchToStep(2);
        if (!silent) showError(err.message || "加载第二环节保存记录失败");
    }
}

async function analyzeOutlineStep() {
    const text = getEl("input-outline-text").value.trim();
    if (!text) return showError("请输入爆款小说拆解结果");
    const analyzeBtn = getEl("step2-analyze-btn");
    if (analyzeBtn) analyzeBtn.disabled = true;
    setTextareaBusy("input-outline-text", "AI 正在解析拆解结构 + 分析元信息");
    try {
        const data = await postJSON("/api/workflow/analyze_outline", { text });
        resetStep2Workspace({ preserveOutlineInput: true });
        workflowState.originalOutlineText = text;
        workflowState.parsedOutline = data.parsed_outline || {};
        workflowState.relationshipData = data.relationship_data || null;
        workflowState.outlineAnalysis = data.outline_analysis || {};
        workflowState.splitterResultText = text;
        updateAllTextareaCounters();

        // 直接到合并设定页(stage-4)
        switchToStep(4);

        // 填充原始场景信息
        const analysis = workflowState.outlineAnalysis || {};
        const originalScene = analysis.original_core_scene || "未知";
        getEl("original-scene-text").textContent = originalScene;
        if (getEl("core-scene-input") && analysis.original_core_scene) {
            getEl("core-scene-input").value = analysis.original_core_scene;
            workflowState.selectedCoreScene = analysis.original_core_scene;
        }
        fillOriginalCharactersFromAnalysis({ silent: true, force: true });

        // 如果分析出了世界观，自动预选下拉
        const analysisWv = analysis.original_worldview;
        if (analysisWv) {
            const matched = WORLDVIEW_OPTIONS_MAP[analysisWv] || null;
            if (matched) {
                workflowState.selectedWorldview = matched;
                const wvSelect = getEl("worldview-select");
                if (wvSelect) { wvSelect.value = matched; }
                renderGenreOptions(matched);
            }
        }

        showSuccess("解析+元信息分析完成，请配置改编设定");
    } catch (err) { showError(err.message || "解析失败"); }
    finally {
        clearTextareaBusy("input-outline-text");
        if (analyzeBtn) analyzeBtn.disabled = false;
    }
}

async function parseOutlineStep() { return analyzeOutlineStep(); }

// ========================================
// Step 3: 兼容旧流程入口
// ========================================
function confirmRelationships() { switchToStep(4); showSuccess("已进入改编设定"); }

// ========================================
// Step 4: 合并设定页 — 世界观+题材+男女频+场景
// ========================================

// 世界观下拉变更
function onWorldviewSelectChange(selectEl) {
    const val = selectEl.value;
    if (!val) return;
    workflowState.selectedWorldview = val;
    workflowState.keptOriginalWorldview = false;
    workflowState.selectedGenres = [];
    workflowState.keptOriginalGenre = false;
    getEl("skip-worldview-info").classList.remove("is-visible");
    getEl("skip-genre-info").classList.remove("is-visible");
    renderGenreOptions(val);
    updateAdaptationConfirmButton();
}

function keepOriginalWorldview() {
    const parsed = workflowState.parsedOutline || {};
    const analysis = workflowState.outlineAnalysis || {};
    const originalWv = analysis.original_worldview || parsed.worldview || parsed["原始小说的世界观"] || "";
    const matched = WORLDVIEW_OPTIONS_MAP[originalWv] || originalWv || "现代";
    workflowState.selectedWorldview = matched;
    workflowState.keptOriginalWorldview = true;
    const wvSelect = getEl("worldview-select");
    if (wvSelect) wvSelect.value = matched;
    getEl("skip-worldview-value").textContent = `${originalWv || "未识别"} → ${matched}`;
    getEl("skip-worldview-info").classList.add("is-visible");
    renderGenreOptions(matched);
    updateAdaptationConfirmButton();
    showSuccess(`保持原始世界观：${matched}`);
}

// 题材渲染
function renderGenreOptions(worldview) {
    const mapping = workflowState.metadata?.worldview_genre_mapping || {};
    const mappedGenres = mapping[worldview];
    const genres = Array.isArray(mappedGenres) && mappedGenres.length
        ? mappedGenres
        : ["家庭", "职场", "校园", "悬疑", "言情"];
    workflowState.availableGenres = genres;
    const select = getEl("genre-select");
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>请选择题材类型</option>';
    genres.forEach((genre) => {
        const option = document.createElement("option");
        option.value = genre;
        option.textContent = genre;
        select.appendChild(option);
    });
    select.style.display = "block";
    if (workflowState.selectedGenres[0] && genres.includes(workflowState.selectedGenres[0])) {
        select.value = workflowState.selectedGenres[0];
    }
    // 隐藏placeholder，显示题材列表
    const placeholder = getEl("genre-placeholder");
    if (placeholder) placeholder.style.display = "none";
}

function onGenreSelectChange(selectEl) {
    const genre = selectEl.value;
    if (!genre) return;
    workflowState.selectedGenres = [genre];
    workflowState.keptOriginalGenre = false;
    getEl("skip-genre-info").classList.remove("is-visible");
    updateAdaptationConfirmButton();
}

function selectGenre(genre) {
    const select = getEl("genre-select");
    if (select) select.value = genre || "";
    workflowState.selectedGenres = genre ? [genre] : [];
    workflowState.keptOriginalGenre = false;
    updateAdaptationConfirmButton();
}

function keepOriginalGenre() {
    const parsed = workflowState.parsedOutline || {};
    const analysis = workflowState.outlineAnalysis || {};
    const originalGenre = analysis.original_genre || parsed.genre || parsed["题材"] || "";
    const originalAudience = analysis.original_audience || parsed.audience || parsed["频道"] || "";
    const originalWv = analysis.original_worldview || parsed.worldview || parsed["原始小说的世界观"] || "";
    const matchedWv = WORLDVIEW_OPTIONS_MAP[originalWv] || originalWv || workflowState.selectedWorldview || "现代";

    if (!workflowState.selectedWorldview) {
        workflowState.selectedWorldview = matchedWv;
        const wvSelect = getEl("worldview-select");
        if (wvSelect) wvSelect.value = matchedWv;
    }
    const genreSelect = getEl("genre-select");
    if (genreSelect && (genreSelect.style.display === "none" || genreSelect.options.length <= 1)) {
        renderGenreOptions(workflowState.selectedWorldview);
    }

    workflowState.keptOriginalGenre = true;
    if (originalGenre) {
        let matchedGenre = originalGenre;
        let matched = false;
        const allOptions = Array.from(getEl("genre-select")?.options || []).filter((option) => option.value);
        // 精确匹配
        allOptions.forEach((option) => {
            if (option.value === originalGenre) matched = true;
        });
        // 模糊匹配：子串包含
        if (!matched) {
            allOptions.forEach((option) => {
                if (matched) return;
                const v = option.value || "";
                if (v.includes(originalGenre) || originalGenre.includes(v)) {
                    matchedGenre = v;
                    matched = true;
                }
            });
        }
        // 模糊匹配：共同字符最多
        if (!matched && allOptions.length > 0) {
            let bestScore = 0, bestVal = "";
            allOptions.forEach((option) => {
                const v = option.value || "";
                let score = 0;
                for (const ch of originalGenre) { if (v.includes(ch)) score++; }
                if (score > bestScore) { bestScore = score; bestVal = v; }
            });
            if (bestScore >= 2) { matchedGenre = bestVal; matched = true; }
        }
        workflowState.selectedGenres = [matchedGenre];
        if (getEl("genre-select")) {
            if (![...getEl("genre-select").options].some((option) => option.value === matchedGenre)) {
                const option = document.createElement("option");
                option.value = matchedGenre;
                option.textContent = matchedGenre;
                getEl("genre-select").appendChild(option);
            }
            getEl("genre-select").value = matchedGenre;
        }
        if (!matched) {
            console.warn(`[keepOriginalGenre] 无法匹配题材 "${originalGenre}"，请手动选择`);
        }
    }
    if (originalAudience) {
        const normalizedAudience = originalAudience.includes("女") ? "女频" : (originalAudience.includes("男") ? "男频" : originalAudience);
        workflowState.targetAudience = normalizedAudience;
        const audienceSelect = getEl("audience-select");
        if (audienceSelect) audienceSelect.value = normalizedAudience;
    }
    getEl("skip-genre-value").textContent = `题材：${originalGenre || "未知"} | 频道：${originalAudience || "未知"}`;
    getEl("skip-genre-info").classList.add("is-visible");
    updateAdaptationConfirmButton();
    showSuccess(`保持原始题材：${originalGenre || "未知"} / ${originalAudience || "未知"}`);
}

// 男女频下拉变更
function onAudienceSelectChange(selectEl) {
    workflowState.targetAudience = selectEl.value;
    getEl("skip-audience-info")?.classList.remove("is-visible");
    updateAdaptationConfirmButton();
}

function keepOriginalAudience() {
    const parsed = workflowState.parsedOutline || {};
    const analysis = workflowState.outlineAnalysis || {};
    const originalAudience = analysis.original_audience || parsed.audience || parsed["频道"] || parsed["目标读者"] || "";
    if (!originalAudience) return showError("未找到原始目标读者信息");
    const normalizedAudience = originalAudience.includes("女") ? "女频" : (originalAudience.includes("男") ? "男频" : originalAudience);
    workflowState.targetAudience = normalizedAudience;
    const audienceSelect = getEl("audience-select");
    if (audienceSelect) audienceSelect.value = normalizedAudience;
    getEl("skip-audience-value").textContent = `${originalAudience} → ${normalizedAudience}`;
    getEl("skip-audience-info").classList.add("is-visible");
    updateAdaptationConfirmButton();
    showSuccess(`保持原始目标读者：${normalizedAudience}`);
}

// 核心场景
function keepOriginalScene() {
    const analysis = workflowState.outlineAnalysis || {};
    const originalScene = analysis.original_core_scene || "";
    if (!originalScene) return showError("未找到原始核心场景信息");
    workflowState.selectedCoreScene = originalScene;
    workflowState.matchedScenes = [];
    workflowState.keptOriginalScene = true;
    if (getEl("core-scene-input")) getEl("core-scene-input").value = originalScene;
    getEl("skip-scene-value").textContent = originalScene;
    getEl("skip-scene-info").classList.add("is-visible");
    getEl("matched-scenes-area")?.classList.remove("is-visible");
    if (getEl("matched-scenes-area")) getEl("matched-scenes-area").style.display = "none";
    updateAdaptationConfirmButton();
    showSuccess("已保持原始核心场景");
}

function onCoreSceneInputChange(inputEl) {
    workflowState.selectedCoreScene = (inputEl.value || "").trim();
    workflowState.keptOriginalScene = false;
    getEl("skip-scene-info")?.classList.remove("is-visible");
    updateAdaptationConfirmButton();
}

function applyManualCoreScene() {
    const inputEl = getEl("core-scene-input");
    const sceneName = (inputEl?.value || "").trim();
    if (!sceneName) return showError("请先输入核心场景");
    workflowState.selectedCoreScene = sceneName;
    workflowState.keptOriginalScene = false;
    workflowState.matchedScenes = normalizeMatchedScenes([sceneName, ...(workflowState.matchedScenes || [])]);
    getEl("skip-scene-info")?.classList.remove("is-visible");
    renderSceneSelectionOptions(workflowState.matchedScenes, sceneName);
    updateAdaptationConfirmButton();
    showSuccess(`已使用自定义场景：${sceneName}`);
}

async function matchScenesFromLibrary() {
    const analysis = workflowState.outlineAnalysis || {};
    const originalScene = analysis.original_core_scene || getEl("core-scene-input")?.value?.trim() || "";
    const worldview = workflowState.selectedWorldview || "";
    if (!originalScene) return showError("请先保持原始场景或输入核心场景");
    showPageLoading("正在从场景库匹配相似场景...");
    try {
        const data = await postJSON("/api/workflow/match_scenes", { original_scene: originalScene, worldview: worldview, top_k: 10 });
        const container = getEl("new-scene-selection");
        const scenes = data.matched_scenes || [];
        if (!scenes.length) {
            workflowState.matchedScenes = [];
            const fallbackScene = workflowState.selectedCoreScene || getEl("core-scene-input")?.value?.trim() || "";
            renderSceneSelectionOptions([], fallbackScene);
            if (container) {
                container.insertAdjacentHTML("beforeend", '<div class="scene-selection__empty">未匹配到相似场景，可直接手动输入核心场景。</div>');
            }
            showSuccess("未匹配到相似场景，已保留当前输入场景");
            return;
        }
        workflowState.matchedScenes = normalizeMatchedScenes(scenes);
        renderSceneSelectionOptions(workflowState.matchedScenes, workflowState.selectedCoreScene || "");
        showSuccess(`匹配到 ${scenes.length} 个相似场景`);
    } catch (err) { showError(err.message || "场景匹配失败"); }
    finally { hidePageLoading(); }
}

// 统一确认按钮状态
function updateAdaptationConfirmButton() {
    const btn = getEl("confirm-adaptation-btn");
    if (!btn) return;
    const hasWorldview = !!workflowState.selectedWorldview;
    const hasGenre = workflowState.selectedGenres.length > 0;
    const hasAudience = !!workflowState.targetAudience;
    const hasScene = !!workflowState.selectedCoreScene;
    btn.disabled = !(hasWorldview && hasGenre && hasAudience && hasScene);
}

// 统一确认
function confirmAdaptationSettings() {
    if (!workflowState.selectedWorldview) return showError("请先选择世界观");
    if (!workflowState.selectedGenres.length) return showError("请至少选择一个题材");
    if (!workflowState.targetAudience) return showError("请选择目标读者");
    if (!workflowState.selectedCoreScene) return showError("请选择核心场景");
    workflowState.adaptationRequirement = getAdaptationRequirement();

    getEl("original-characters-display")?.focus();
    showSuccess("改编设定已确认，请在本页选择人物方案");
}

function confirmMergedAdaptationAndGoOutline() {
    if (!workflowState.selectedWorldview) return showError("请先选择世界观");
    if (!workflowState.selectedGenres.length) return showError("请至少选择一个题材");
    if (!workflowState.targetAudience) return showError("请选择目标读者");
    if (!workflowState.selectedCoreScene) return showError("请选择核心场景");

    const generated = getEl("new-character-bios")?.value?.trim() || "";
    const original = getEl("original-characters-display")?.value?.trim() || "";
    if (generated) {
        workflowState.newCharacterBios = generated;
        workflowState.keptOriginalCharacters = false;
    } else if (original) {
        workflowState.newCharacterBios = original;
        workflowState.keptOriginalCharacters = true;
    }
    if (!workflowState.newCharacterBios) return showError("请先填写或生成候选人物小传");

    renderStep2SummaryLabels();
    switchToStep(6);
    showSuccess("已确认设定与人物，请生成新大纲");
}

// ========================================
// Step 5: 人物信息替换
// ========================================
function keepOriginalCharacters() {
    const target = getEl("original-characters-display");
    if (target) target.value = "";
    fillOriginalCharactersFromAnalysis({ silent: false });
}

async function generateCandidateCharacters() {
    const originalChars = getEl("original-characters-display").value || "";
    const worldview = workflowState.selectedWorldview || "";
    const genre = workflowState.selectedGenres[0] || "";
    const audience = workflowState.targetAudience || "";
    const scene = workflowState.selectedCoreScene || "";
    const adaptationRequirement = getAdaptationRequirement();
    workflowState.adaptationRequirement = adaptationRequirement;
    const candidateBtn = document.querySelector("#stage-4 .stage-action-btn--mint");
    if (candidateBtn) candidateBtn.disabled = true;
    setTextareaBusy("new-character-bios", "AI 正在生成候选人物小传");
    try {
        const data = await postJSON("/api/workflow/generate_characters", {
            original_characters: originalChars, worldview, genre, audience, core_scene: scene,
            adaptation_requirement: adaptationRequirement,
            original_outline: workflowState.originalOutlineText || "",
        });
        const newBios = data.character_bios || data.new_characters || "";
        const bioText = typeof newBios === "string" ? newBios : JSON.stringify(newBios, null, 2);
        getEl("new-character-bios").value = bioText;
        if (getEl("name-replace-tool")) getEl("name-replace-tool").style.display = "grid";
        workflowState.keptOriginalCharacters = false;
        workflowState.newCharacterBios = bioText;
        getEl("skip-character-info")?.classList.remove("is-visible");
        if (getEl("confirm-character-btn")) getEl("confirm-character-btn").disabled = false;
        updateAllTextareaCounters();
        showSuccess("候选人物小传已生成，可编辑后确认");
    } catch (err) { showError(err.message || "人物生成失败"); }
    finally {
        clearTextareaBusy("new-character-bios");
        if (candidateBtn) candidateBtn.disabled = false;
    }
}

function confirmCharacters() {
    if (workflowState.keptOriginalCharacters) {
        // 保持原样模式：从编辑框获取最新内容（用户可能编辑过）
        const editedOriginal = getEl("original-characters-display")?.value || "";
        if (editedOriginal.trim()) workflowState.newCharacterBios = editedOriginal;
    } else {
        const edited = getEl("new-character-bios")?.value || "";
        if (edited.trim()) workflowState.newCharacterBios = edited;
    }
    if (!workflowState.newCharacterBios) return showError("请先选择人物方案");
    // 填充 stage-6 和顶部 header 的选择汇总
    getEl("outline-worldview-label").textContent = workflowState.selectedWorldview || "—";
    getEl("outline-genre-label").textContent = workflowState.selectedGenres.join("、") || "—";
    getEl("outline-audience-label").textContent = workflowState.targetAudience || "—";
    getEl("outline-scene-label").textContent = workflowState.selectedCoreScene || "—";
    if (getEl("header-selection-bar")) getEl("header-selection-bar").style.display = "flex";
    switchToStep(6);
    showSuccess("人物已确认，请生成新大纲");
}

// ========================================
// Step 6: 新大纲生成
// ========================================
async function generateNewOutline() {
    const outlineCard = getEl("new-outline-result-card");
    if (outlineCard) outlineCard.style.display = "block";
    const generateBtn = document.querySelector("#stage-6 .button-group .btn-primary");
    const allOriginal = workflowState.keptOriginalWorldview && workflowState.keptOriginalGenre && workflowState.keptOriginalScene && workflowState.keptOriginalCharacters;
    if (allOriginal) {
        workflowState.newOutlineText = workflowState.originalOutlineText;
        getEl("new-outline-text").value = workflowState.originalOutlineText;
        updateAllTextareaCounters();
        showSuccess("全部保持原样，已输出原始大纲"); return;
    }
    const adaptationRequirement = getAdaptationRequirement();
    workflowState.adaptationRequirement = adaptationRequirement;
    if (generateBtn) generateBtn.disabled = true;
    setTextareaBusy("new-outline-text", "AI 正在生成新大纲");
    try {
        const data = await postJSON("/api/workflow/generate_new_outline", {
            original_outline: workflowState.originalOutlineText || "",
            parsed_outline: workflowState.parsedOutline || {},
            worldview: workflowState.selectedWorldview || "",
            genre: workflowState.selectedGenres[0] || "",
            audience: workflowState.targetAudience || "",
            core_scene: workflowState.selectedCoreScene || "",
            adaptation_requirement: adaptationRequirement,
            character_bios: workflowState.newCharacterBios || "",
            kept_original_worldview: workflowState.keptOriginalWorldview,
            kept_original_genre: workflowState.keptOriginalGenre,
            kept_original_scene: workflowState.keptOriginalScene,
            kept_original_characters: workflowState.keptOriginalCharacters,
        });
        const outlineText = data.final_text || data.new_outline || data.outline || "";
        workflowState.newOutlineText = outlineText;
        getEl("new-outline-text").value = outlineText;
        updateAllTextareaCounters();
        showSuccess("新大纲已生成，可编辑后确认进入正文生成");
    } catch (err) { showError(err.message || "新大纲生成失败"); }
    finally {
        clearTextareaBusy("new-outline-text");
        if (generateBtn) generateBtn.disabled = false;
    }
}

function goToWritingStepFromOutline() {
    const outlineText = getEl("new-outline-text")?.value || workflowState.newOutlineText || "";
    if (!outlineText.trim()) return showError("请先生成新大纲");
    workflowState.newOutlineText = outlineText;
    workflowState.finalFramework = workflowState.finalFramework || {};
    workflowState.finalFramework.final_text = outlineText;
    switchToStep(7);
    showSuccess("已进入正文生成步骤");
}

// ========================================
// 批量姓名替换
// ========================================
function batchReplaceName(target = "generated") {
    const normalizedTarget = target === "original" ? "original" : "generated";
    const oldName = getEl(`old-name-input-${normalizedTarget}`)?.value?.trim() || getEl("old-name-input")?.value?.trim();
    const newName = getEl(`new-name-input-${normalizedTarget}`)?.value?.trim() || getEl("new-name-input")?.value?.trim();
    if (!oldName) return showError("请输入要替换的原始姓名");
    if (!newName) return showError("请输入新姓名");
    if (oldName === newName) return showError("新旧姓名相同，无需替换");
    const regex = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    let totalCount = 0;
    const targetTextareaId = normalizedTarget === "original" ? "original-characters-display" : "new-character-bios";
    const targetEl = getEl(targetTextareaId);
    if (targetEl && targetEl.value.includes(oldName)) {
        const matches = targetEl.value.match(regex);
        const count = matches ? matches.length : 0;
        targetEl.value = targetEl.value.replace(regex, newName);
        totalCount += count;
    }
    if (normalizedTarget === "generated" && workflowState.newCharacterBios && typeof workflowState.newCharacterBios === "string") {
        workflowState.newCharacterBios = workflowState.newCharacterBios.replace(regex, newName);
    }
    if (normalizedTarget === "original" && workflowState.keptOriginalCharacters && targetEl?.value?.trim()) {
        workflowState.newCharacterBios = targetEl.value;
    }
    updateAllTextareaCounters();
    const resultEl = getEl(`name-replace-result-${normalizedTarget}`) || getEl("name-replace-result");
    if (resultEl) {
        if (totalCount > 0) { resultEl.textContent = `✓ 已将「${oldName}」替换为「${newName}」，共替换 ${totalCount} 处`; resultEl.className = "name-replace-result is-success"; }
        else { resultEl.textContent = `未找到「${oldName}」，请检查姓名是否正确`; resultEl.className = "name-replace-result is-empty"; }
    }
    if (totalCount > 0) showSuccess(`已替换 ${totalCount} 处「${oldName}」→「${newName}」`);
    else showError(`未找到「${oldName}」`);
}

async function smartReplaceCharacterNames(target = "generated") {
    const normalizedTarget = "generated";
    const targetTextareaId = "new-character-bios";
    const targetEl = getEl(targetTextareaId);
    const targetText = targetEl?.value?.trim() || "";
    const originalCharacters = getEl("original-characters-display")?.value?.trim() || "";
    const generatedCharacters = getEl("new-character-bios")?.value?.trim() || workflowState.newCharacterBios || "";
    const worldview = workflowState.selectedWorldview || "";
    const genre = workflowState.selectedGenres[0] || "";
    const audience = workflowState.targetAudience || "";
    const scene = workflowState.selectedCoreScene || "";
    const adaptationRequirement = getAdaptationRequirement();
    const resultEl = getEl(`name-replace-result-${normalizedTarget}`) || getEl("name-replace-result");

    if (!targetText) return showError("当前人物小传为空，无法执行 AI 智能替换");

    workflowState.adaptationRequirement = adaptationRequirement;

    if (resultEl) {
        resultEl.textContent = "AI 正在检查候选人物小传中的旧名、混名与串名...";
        resultEl.className = "name-replace-result";
    }

    try {
        const data = await postJSON("/api/workflow/ai_replace_character_names", {
            target_type: normalizedTarget,
            target_text: targetText,
            original_characters: originalCharacters,
            generated_characters: generatedCharacters,
            worldview,
            genre,
            audience,
            core_scene: scene,
            adaptation_requirement: adaptationRequirement,
            original_outline: workflowState.originalOutlineText || "",
        });

        const replacedText = (data.replaced_text || "").trim();
        const mappings = Array.isArray(data.name_mappings) ? data.name_mappings : [];
        if (!replacedText) throw new Error("AI 未返回替换结果");

        const textChanged = replacedText !== targetText;
        const hasMappings = mappings.length > 0;

        if (targetEl) targetEl.value = replacedText;
        workflowState.newCharacterBios = replacedText;
        workflowState.keptOriginalCharacters = false;

        updateAllTextareaCounters();

        const summary = hasMappings
            ? mappings
                .map(item => `「${item.old_name || "?"}」→「${item.new_name || "?"}」`)
                .join("，")
            : "未检测到需要替换的旧名或混名";

        if (resultEl) {
            resultEl.textContent = `${hasMappings || textChanged ? "✓ " : ""}${summary}`;
            resultEl.className = hasMappings || textChanged
                ? "name-replace-result is-success"
                : "name-replace-result is-empty";
        }
        if (hasMappings || textChanged) {
            showSuccess(data.summary || `AI 已完成智能替换，共处理 ${mappings.length || 0} 组姓名`);
        } else {
            showSuccess(data.summary || "AI 检查完成，当前候选人物小传未发现需要替换的旧名或混名");
        }
    } catch (err) {
        if (resultEl) {
            resultEl.textContent = err.message || "AI 智能替换失败";
            resultEl.className = "name-replace-result is-empty";
        }
        showError(err.message || "AI 智能替换失败");
    }
}
