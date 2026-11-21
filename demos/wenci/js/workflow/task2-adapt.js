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
    if (normalized === "step2_characters") return 5;
    if (normalized === "step2_settings") return 4;
    return 2;
}

function renderSavedGenreSelection() {
    const previewBox = getEl("selected-genres-preview");
    const tagsContainer = getEl("selected-genres-tags");
    document.querySelectorAll(".genre-tag").forEach((tag) => {
        tag.classList.toggle("genre-tag--selected", workflowState.selectedGenres.includes(tag.dataset.value));
    });
    if (getEl("selected-genre-count")) {
        getEl("selected-genre-count").textContent = `已选 ${workflowState.selectedGenres.length} / ${MAX_GENRE_SELECTION}`;
    }
    if (previewBox && tagsContainer) {
        if (workflowState.selectedGenres.length) {
            previewBox.style.display = "block";
            tagsContainer.innerHTML = workflowState.selectedGenres.map((genre) => `<span class="selected-tag">${escapeHTML(genre)}</span>`).join("");
        } else {
            previewBox.style.display = "none";
            tagsContainer.innerHTML = "";
        }
    }
}

function renderSavedSceneSelection() {
    const matchedArea = getEl("matched-scenes-area");
    const selection = getEl("new-scene-selection");
    if (!matchedArea || !selection) return;
    if (!workflowState.selectedCoreScene || workflowState.keptOriginalScene) {
        matchedArea.style.display = "none";
        selection.innerHTML = "";
        return;
    }
    matchedArea.style.display = "block";
    selection.innerHTML = `
        <div class="scene-option scene-option--selected" data-value="${escapeHTML(workflowState.selectedCoreScene)}">
            <div class="scene-option__name">${escapeHTML(workflowState.selectedCoreScene)}</div>
        </div>
    `;
}

function renderStep2SummaryLabels() {
    if (getEl("outline-worldview-label")) getEl("outline-worldview-label").textContent = workflowState.selectedWorldview || "—";
    if (getEl("outline-genre-label")) getEl("outline-genre-label").textContent = workflowState.selectedGenres.join("、") || "—";
    if (getEl("outline-audience-label")) getEl("outline-audience-label").textContent = workflowState.targetAudience || "—";
    if (getEl("outline-scene-label")) getEl("outline-scene-label").textContent = workflowState.selectedCoreScene || "—";
}

function collectStep2DraftPayload() {
    const outlineInput = (getEl("input-outline-text")?.value || workflowState.originalOutlineText || workflowState.splitterResultText || "").trim();
    const originalCharactersText = getEl("original-characters-display")?.value || "";
    const aiCharactersText = getEl("new-character-bios")?.value || workflowState.newCharacterBios || "";
    const outputOutlineText = getEl("new-outline-text")?.value || workflowState.newOutlineText || "";
    return {
        task_id: workflowState.currentTaskId || createClientTaskId(),
        title: inferStep2TaskTitle(),
        current_step: inferStep2CurrentStep(),
        selected_worldview: workflowState.selectedWorldview || "",
        selected_genre: workflowState.selectedGenres[0] || "",
        selected_core_scene: workflowState.selectedCoreScene || "",
        target_audience: workflowState.targetAudience || "",
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
        },
        original_characters_text: originalCharactersText,
        ai_generated_characters_text: aiCharactersText,
        new_outline_draft_text: outputOutlineText,
        output_outline_text: outputOutlineText,
    };
}

async function saveCurrentStep2Draft() {
    workflowState.currentTaskId = workflowState.currentTaskId || createClientTaskId();
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
    if (getEl("genre-user-note")) getEl("genre-user-note").value = "";

    if (workflowState.relationshipData?.characters?.length) renderRelationshipResult(workflowState.relationshipData);
    else hideRelationshipResult();

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
    if (getEl("generated-characters-area")) {
        getEl("generated-characters-area").style.display = payload.ai_generated_characters_text ? "block" : "none";
    }
    if (getEl("name-replace-tool")) {
        getEl("name-replace-tool").style.display = payload.ai_generated_characters_text ? "block" : "none";
    }
    if (getEl("confirm-character-btn")) {
        getEl("confirm-character-btn").disabled = !(payload.ai_generated_characters_text || payload.original_characters_text);
    }
    if (getEl("new-outline-result-card")) {
        getEl("new-outline-result-card").style.display = workflowState.newOutlineText ? "block" : "none";
    }

    renderSavedSceneSelection();
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
        if (!silent) showError(err.message || "加载第二环节保存记录失败");
    }
}

async function analyzeOutlineStep() {
    const text = getEl("input-outline-text").value.trim();
    if (!text) return showError("请输入爆款小说拆解结果");
    showPageLoading("AI 正在解析拆解结构 + 分析元信息...");
    try {
        const data = await postJSON("/api/workflow/analyze_outline", { text });
        workflowState.originalOutlineText = text;
        workflowState.parsedOutline = data.parsed_outline || {};
        workflowState.relationshipData = data.relationship_data || null;
        workflowState.outlineAnalysis = data.outline_analysis || {};
        workflowState.splitterResultText = text;

        if (workflowState.relationshipData?.characters?.length) {
            renderRelationshipResult(workflowState.relationshipData);
        } else {
            hideRelationshipResult();
            showError("人物关系数据为空，可能解析异常。");
        }

        // 直接到合并设定页(stage-4)
        switchToStep(4);

        // 填充原始场景信息
        const analysis = workflowState.outlineAnalysis || {};
        const originalScene = analysis.original_core_scene || "未知";
        getEl("original-scene-text").textContent = originalScene;

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
    finally { hidePageLoading(); }
}

async function parseOutlineStep() { return analyzeOutlineStep(); }

// ========================================
// Step 3: 人物关系确认 (保留但跳过)
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
    const genres = mapping[worldview] || ["家庭", "职场", "校园", "悬疑", "言情"];
    workflowState.availableGenres = genres;
    const container = getEl("genre-selection");
    container.innerHTML = "";
    genres.forEach((genre) => {
        const div = document.createElement("div");
        div.className = "genre-tag";
        div.dataset.value = genre;
        div.textContent = genre;
        div.addEventListener("click", () => selectGenre(genre, div));
        container.appendChild(div);
    });
    // 隐藏placeholder，显示题材列表
    const placeholder = getEl("genre-placeholder");
    if (placeholder) placeholder.style.display = "none";
    getEl("selected-genre-count").textContent = `已选 ${workflowState.selectedGenres.length} / ${MAX_GENRE_SELECTION}`;
}

function selectGenre(genre, el) {
    const idx = workflowState.selectedGenres.indexOf(genre);
    if (idx >= 0) {
        workflowState.selectedGenres.splice(idx, 1);
        el.classList.remove("genre-tag--selected");
    } else {
        if (workflowState.selectedGenres.length >= MAX_GENRE_SELECTION) {
            const oldGenre = workflowState.selectedGenres.shift();
            document.querySelectorAll(".genre-tag").forEach((t) => { if (t.dataset.value === oldGenre) t.classList.remove("genre-tag--selected"); });
        }
        workflowState.selectedGenres.push(genre);
        el.classList.add("genre-tag--selected");
    }
    workflowState.keptOriginalGenre = false;
    getEl("skip-genre-info").classList.remove("is-visible");
    getEl("selected-genre-count").textContent = `已选 ${workflowState.selectedGenres.length} / ${MAX_GENRE_SELECTION}`;
    const previewBox = getEl("selected-genres-preview");
    const tagsContainer = getEl("selected-genres-tags");
    if (workflowState.selectedGenres.length > 0) {
        previewBox.style.display = "block";
        tagsContainer.innerHTML = workflowState.selectedGenres.map((g) => `<span class="selected-tag">${g}</span>`).join("");
    } else { previewBox.style.display = "none"; }
    updateAdaptationConfirmButton();
}

function keepOriginalGenre() {
    const parsed = workflowState.parsedOutline || {};
    const analysis = workflowState.outlineAnalysis || {};
    const originalGenre = analysis.original_genre || parsed.genre || parsed["题材"] || "";
    const originalAudience = analysis.original_audience || parsed.audience || parsed["频道"] || "";
    workflowState.keptOriginalGenre = true;
    if (originalGenre) {
        let matchedGenre = originalGenre;
        let matched = false;
        const allTags = document.querySelectorAll(".genre-tag");
        // 精确匹配
        allTags.forEach((tag) => {
            if (tag.dataset.value === originalGenre) matched = true;
        });
        // 模糊匹配：子串包含
        if (!matched) {
            allTags.forEach((tag) => {
                if (matched) return;
                const v = tag.dataset.value || "";
                if (v.includes(originalGenre) || originalGenre.includes(v)) {
                    matchedGenre = v;
                    matched = true;
                }
            });
        }
        // 模糊匹配：共同字符最多
        if (!matched && allTags.length > 0) {
            let bestScore = 0, bestVal = "";
            allTags.forEach((tag) => {
                const v = tag.dataset.value || "";
                let score = 0;
                for (const ch of originalGenre) { if (v.includes(ch)) score++; }
                if (score > bestScore) { bestScore = score; bestVal = v; }
            });
            if (bestScore >= 2) { matchedGenre = bestVal; matched = true; }
        }
        workflowState.selectedGenres = [matchedGenre];
        allTags.forEach((tag) => {
            tag.classList.toggle("genre-tag--selected", tag.dataset.value === matchedGenre);
        });
        if (!matched) {
            console.warn(`[keepOriginalGenre] 无法匹配题材 "${originalGenre}"，请手动选择`);
            allTags.forEach((tag) => tag.classList.remove("genre-tag--selected"));
            workflowState.selectedGenres = [];
        }
    }
    if (originalAudience) {
        workflowState.targetAudience = originalAudience;
        const audienceSelect = getEl("audience-select");
        if (audienceSelect) audienceSelect.value = originalAudience;
    }
    getEl("skip-genre-value").textContent = `题材：${originalGenre || "未知"} | 频道：${originalAudience || "未知"}`;
    getEl("skip-genre-info").classList.add("is-visible");
    updateAdaptationConfirmButton();
    showSuccess(`保持原始题材：${originalGenre || "未知"} / ${originalAudience || "未知"}`);
}

// 男女频下拉变更
function onAudienceSelectChange(selectEl) {
    workflowState.targetAudience = selectEl.value;
    updateAdaptationConfirmButton();
}

// 核心场景
function keepOriginalScene() {
    const analysis = workflowState.outlineAnalysis || {};
    const originalScene = analysis.original_core_scene || "";
    if (!originalScene) return showError("未找到原始核心场景信息");
    workflowState.selectedCoreScene = originalScene;
    workflowState.keptOriginalScene = true;
    getEl("skip-scene-value").textContent = originalScene;
    getEl("skip-scene-info").classList.add("is-visible");
    getEl("matched-scenes-area").style.display = "none";
    updateAdaptationConfirmButton();
    showSuccess("已保持原始核心场景");
}

async function matchScenesFromLibrary() {
    const analysis = workflowState.outlineAnalysis || {};
    const originalScene = analysis.original_core_scene || "";
    const worldview = workflowState.selectedWorldview || "";
    showPageLoading("正在从场景库匹配相似场景...");
    try {
        const data = await postJSON("/api/workflow/match_scenes", { original_scene: originalScene, worldview: worldview, top_k: 10 });
        const container = getEl("new-scene-selection");
        container.innerHTML = "";
        (data.matched_scenes || []).forEach(scene => {
            const el = document.createElement("div");
            el.className = "scene-option";
            el.dataset.value = scene.name || scene.scene_name || "";
            el.innerHTML = `<div class="scene-option__name">${escapeHTML(scene.name || scene.scene_name || "")}</div>`;
            el.addEventListener("click", () => {
                const sceneName = scene.name || scene.scene_name || "";
                workflowState.selectedCoreScene = sceneName;
                workflowState.keptOriginalScene = false;
                getEl("skip-scene-info").classList.remove("is-visible");
                document.querySelectorAll("#new-scene-selection .scene-option").forEach(opt => {
                    opt.classList.toggle("scene-option--selected", opt.dataset.value === sceneName);
                });
                updateAdaptationConfirmButton();
            });
            container.appendChild(el);
        });
        getEl("matched-scenes-area").style.display = "block";
        showSuccess(`匹配到 ${(data.matched_scenes || []).length} 个相似场景`);
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

    // stage-5 初始化：清空编辑框，隐藏各区域
    getEl("original-characters-display").value = "";
    getEl("original-characters-display").readOnly = false;
    getEl("generated-characters-area").style.display = "none";
    getEl("skip-character-info").classList.remove("is-visible");
    getEl("name-replace-tool").style.display = "none";
    getEl("confirm-character-btn").disabled = true;
    workflowState.keptOriginalCharacters = false;
    workflowState.newCharacterBios = null;

    switchToStep(5);
    showSuccess("改编设定已确认，请选择人物方案");
}

// ========================================
// Step 5: 人物信息替换
// ========================================
function keepOriginalCharacters() {
    // 从原始大纲提取人物小传
    let charText = "";
    if (workflowState.originalOutlineText) {
        const match = workflowState.originalOutlineText.match(/【六、人物小传】([\s\S]*?)(?=【七、|$)/);
        if (match) charText = match[1].trim();
    }
    if (!charText) {
        const parsed = workflowState.parsedOutline || {};
        const originalCharacters = parsed.character_biographies || parsed.character_bios || parsed["人设传记"] || parsed["人物小传"] || parsed["六、人物小传"] || parsed.characters || "";
        charText = typeof originalCharacters === "string" ? originalCharacters : JSON.stringify(originalCharacters, null, 2);
    }
    if (!charText.trim()) return showError("未找到原始人物小传信息");

    // 填入编辑框
    getEl("original-characters-display").value = charText;
    getEl("original-characters-display").readOnly = false;

    workflowState.keptOriginalCharacters = true;
    workflowState.newCharacterBios = charText;

    // 隐藏AI生成区域、隐藏skip-info-box、隐藏姓名替换工具
    getEl("generated-characters-area").style.display = "none";
    getEl("skip-character-info").classList.remove("is-visible");
    getEl("name-replace-tool").style.display = "none";

    getEl("confirm-character-btn").disabled = false;
    showSuccess("已填入原始人物小传，可编辑后确认");
}

async function generateCandidateCharacters() {
    const originalChars = getEl("original-characters-display").value || "";
    const worldview = workflowState.selectedWorldview || "";
    const genre = workflowState.selectedGenres[0] || "";
    const audience = workflowState.targetAudience || "";
    const scene = workflowState.selectedCoreScene || "";
    showPageLoading("AI 正在生成候选人物小传...");
    try {
        const data = await postJSON("/api/workflow/generate_characters", {
            original_characters: originalChars, worldview, genre, audience, core_scene: scene,
            original_outline: workflowState.originalOutlineText || "",
        });
        const newBios = data.character_bios || data.new_characters || "";
        const bioText = typeof newBios === "string" ? newBios : JSON.stringify(newBios, null, 2);
        getEl("new-character-bios").value = bioText;
        getEl("generated-characters-area").style.display = "block";
        getEl("name-replace-tool").style.display = "block";
        workflowState.keptOriginalCharacters = false;
        workflowState.newCharacterBios = bioText;
        getEl("skip-character-info").classList.remove("is-visible");
        getEl("confirm-character-btn").disabled = false;
        showSuccess("候选人物小传已生成，可编辑后确认");
    } catch (err) { showError(err.message || "人物生成失败"); }
    finally { hidePageLoading(); }
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
    // 填充 stage-6 的选择汇总
    getEl("outline-worldview-label").textContent = workflowState.selectedWorldview || "—";
    getEl("outline-genre-label").textContent = workflowState.selectedGenres.join("、") || "—";
    getEl("outline-audience-label").textContent = workflowState.targetAudience || "—";
    getEl("outline-scene-label").textContent = workflowState.selectedCoreScene || "—";
    switchToStep(6);
    showSuccess("人物已确认，请生成新大纲");
}

// ========================================
// Step 6: 新大纲生成
// ========================================
async function generateNewOutline() {
    const allOriginal = workflowState.keptOriginalWorldview && workflowState.keptOriginalGenre && workflowState.keptOriginalScene && workflowState.keptOriginalCharacters;
    if (allOriginal) {
        workflowState.newOutlineText = workflowState.originalOutlineText;
        getEl("new-outline-text").value = workflowState.originalOutlineText;
        getEl("new-outline-result-card").style.display = "block";
        showSuccess("全部保持原样，已输出原始大纲"); return;
    }
    showPageLoading("AI 正在生成新大纲...");
    try {
        const data = await postJSON("/api/workflow/generate_new_outline", {
            original_outline: workflowState.originalOutlineText || "",
            parsed_outline: workflowState.parsedOutline || {},
            worldview: workflowState.selectedWorldview || "",
            genre: workflowState.selectedGenres[0] || "",
            audience: workflowState.targetAudience || "",
            core_scene: workflowState.selectedCoreScene || "",
            character_bios: workflowState.newCharacterBios || "",
            kept_original_worldview: workflowState.keptOriginalWorldview,
            kept_original_genre: workflowState.keptOriginalGenre,
            kept_original_scene: workflowState.keptOriginalScene,
            kept_original_characters: workflowState.keptOriginalCharacters,
        });
        const outlineText = data.final_text || data.new_outline || data.outline || "";
        workflowState.newOutlineText = outlineText;
        getEl("new-outline-text").value = outlineText;
        getEl("new-outline-result-card").style.display = "block";
        showSuccess("新大纲已生成，可编辑后确认进入正文生成");
    } catch (err) { showError(err.message || "新大纲生成失败"); }
    finally { hidePageLoading(); }
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
// 人物关系图谱渲染 (保留)
// ========================================
function renderRelationshipGraph(container, data) {
    if (!data || !data.characters || !container) return;
    const chartDom = typeof container === "string" ? getEl(container) : container;
    if (!chartDom) return;
    const chart = echarts.init(chartDom);
    const groups = [...new Set(data.characters.map((c) => c.group || "默认"))];
    const nodes = data.characters.map((c) => ({
        name: c.name, symbolSize: c.importance === "主角" ? 50 : c.importance === "重要" ? 35 : 25,
        category: groups.indexOf(c.group || "默认"),
        itemStyle: { color: GROUP_COLOR_POOL[groups.indexOf(c.group || "默认") % GROUP_COLOR_POOL.length] },
        label: { show: true, fontSize: 12, color: "#e0e6ed" },
    }));
    const links = (data.relationships || []).map((r) => ({
        source: r.source, target: r.target,
        label: { show: true, formatter: r.relation || "", fontSize: 10, color: "#8892a4" },
        lineStyle: { color: "#334155", width: 1.5, curveness: 0.2 },
    }));
    const categories = groups.map((g, i) => ({ name: g, itemStyle: { color: GROUP_COLOR_POOL[i % GROUP_COLOR_POOL.length] } }));
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "item", backgroundColor: "#1a2332", borderColor: "#334155", textStyle: { color: "#e0e6ed" } },
        legend: { data: groups, textStyle: { color: "#8892a4" }, top: 10 },
        series: [{ type: "graph", layout: "force", data: nodes, links, categories, roam: true, force: { repulsion: 300, edgeLength: [100, 200] }, emphasis: { focus: "adjacency", lineStyle: { width: 3 } } }],
    });
    window.addEventListener("resize", () => chart.resize());
    return chart;
}



// ========================================
// 批量姓名替换
// ========================================
function batchReplaceName() {
    const oldName = getEl("old-name-input")?.value?.trim();
    const newName = getEl("new-name-input")?.value?.trim();
    if (!oldName) return showError("请输入要替换的原始姓名");
    if (!newName) return showError("请输入新姓名");
    if (oldName === newName) return showError("新旧姓名相同，无需替换");
    const regex = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    let totalCount = 0;
    const originalEl = getEl("original-characters-display");
    if (originalEl && originalEl.value.includes(oldName)) {
        const matches = originalEl.value.match(regex); const count = matches ? matches.length : 0;
        originalEl.value = originalEl.value.replace(regex, newName); totalCount += count;
    }
    const newBiosEl = getEl("new-character-bios");
    if (newBiosEl && newBiosEl.value.includes(oldName)) {
        const matches = newBiosEl.value.match(regex); const count = matches ? matches.length : 0;
        newBiosEl.value = newBiosEl.value.replace(regex, newName); totalCount += count;
    }
    if (workflowState.newCharacterBios && typeof workflowState.newCharacterBios === "string") {
        workflowState.newCharacterBios = workflowState.newCharacterBios.replace(regex, newName);
    }
    const resultEl = getEl("name-replace-result");
    if (resultEl) {
        if (totalCount > 0) { resultEl.textContent = `✓ 已将「${oldName}」替换为「${newName}」，共替换 ${totalCount} 处`; resultEl.className = "name-replace-result is-success"; }
        else { resultEl.textContent = `未找到「${oldName}」，请检查姓名是否正确`; resultEl.className = "name-replace-result is-empty"; }
    }
    if (totalCount > 0) showSuccess(`已替换 ${totalCount} 处「${oldName}」→「${newName}」`);
    else showError(`未找到「${oldName}」`);
}
