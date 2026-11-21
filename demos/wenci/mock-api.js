/* 文辞 AI 在线演示：拦截前端对后端的请求，返回预置的示例数据。
 * 示例小说、拆解框架、参考片段均为演示用原创文本，不含真实业务数据或模型调用。 */
(function () {
  const RAW_STORY = `订婚宴前一晚，林栖在未婚夫的电脑里看到了一份股权转让协议。
受让人一栏写着她的名字，签字页却已经被人提前签好——笔迹是她的，可她从没见过这份文件。
"明天宴会结束你签个字就行，都是走流程。"周屿从身后抱住她，语气温柔。
林栖没有回头："转让的是我爸留给我的那百分之十二？"
周屿的手僵了一下。
第二天，宴会厅坐满了两家的亲友和公司高层。司仪请准新娘致辞，林栖接过话筒，先放了一段录音。
录音里，周屿和他的合伙人在讨论怎么在婚后三个月内把林家的股份"合法地"转走。
全场安静。周屿冲上台想抢话筒，林栖侧身让开，对台下说："今天不是订婚宴，是我接手公司的第一次股东沟通会。"
她身后的大屏幕亮起：审计报告、资金流向、伪造签名的鉴定结论。
周屿的母亲指着她骂她心机深。林栖笑了笑："阿姨，心机深的人，不会把证据攒到今天才拿出来。"
三个月后，林栖坐进了父亲当年的办公室。桌上放着一封周屿的道歉信，她没拆，直接放进了碎纸机。`;

  const SPLIT_RESULT = `【一、作品信息】
书名：订婚宴上的股东会
题材：现代 · 都市 · 女性成长
目标读者：女频 · 爽感 · 职场逆袭

【二、一句话梗概】
女主在订婚前夜发现未婚夫伪造签名转移自己的股份，在订婚宴上公开证据，夺回公司话语权。

【三、核心场景】
订婚宴当众揭穿 —— 公开场合反转身份，从"准新娘"变成"股东"。

【四、情绪曲线】
压抑（发现协议）→ 隐忍（假装不知）→ 爆发（宴会放录音）→ 释放（接手公司）

【五、章节结构】
第1章：深夜发现伪造签名的股权协议，未婚夫若无其事地催她签字。
第2章：女主暗中收集证据，联系审计与笔迹鉴定，表面配合婚礼筹备。
第3章：订婚宴致辞环节放出录音和审计报告，当众反转，宣布接手公司。

【六、人物小传】
林栖：28 岁，已故企业创始人之女，持有公司 12% 股份。外表温和，做事谨慎，习惯把证据攒够再出手。
周屿：30 岁，林栖的未婚夫，公司副总。擅长包装自己，计划婚后转移林家股份。
周母：周屿的母亲，强势护短，把林栖当作"嫁进来的资源"。
陈律师：林父生前的法律顾问，暗中协助林栖完成证据链。

【七、爽点与钩子】
1. 第1章末：签名是她的笔迹，可她从没见过这份文件。
2. 第2章末：她把一份"新娘致辞"交给司仪，里面夹着一个 U 盘。
3. 第3章末：她没拆道歉信，直接放进碎纸机。`;

  const RELATIONSHIP = {
    characters: [
      { name: "林栖", group: "林家", importance: "主角" },
      { name: "周屿", group: "周家", importance: "重要" },
      { name: "周母", group: "周家", importance: "次要" },
      { name: "陈律师", group: "林家", importance: "次要" },
      { name: "合伙人", group: "周家", importance: "次要" },
    ],
    relationships: [
      { source: "林栖", target: "周屿", relation: "未婚夫妻 / 对立" },
      { source: "周屿", target: "周母", relation: "母子" },
      { source: "周屿", target: "合伙人", relation: "共谋" },
      { source: "陈律师", target: "林栖", relation: "协助" },
      { source: "周母", target: "林栖", relation: "施压" },
    ],
    relationship_summary: "围绕 12% 股份形成两方阵营：林栖与陈律师收集证据，周屿与合伙人策划转移股份，周母在情感上施压。",
  };

  const METADATA = {
    loaded: true,
    worldviews: ["现代", "年代", "古代", "未来", "玄幻"],
    worldview_genre_mapping: {
      现代: ["职场", "家庭", "豪门", "悬疑", "校园"],
      年代: ["家庭", "创业", "知青", "医女"],
      古代: ["宫廷", "宅斗", "江湖", "女官"],
      未来: ["星际", "末世", "赛博"],
      玄幻: ["修仙", "宗门", "系统"],
    },
    worldview_scene_mapping: {},
    all_scenes: [],
    scene_library: [],
  };

  const SCENES = {
    现代: ["年会颁奖台当众揭穿", "董事会投票现场反转", "直播间连线公开证据", "订婚宴致辞放录音", "庭审现场提交新证据", "家族聚餐摊牌"],
    年代: ["生产队大会当众对质", "公社表彰会揭穿冒领", "厂里分房会议反转"],
    古代: ["寿宴献礼当众揭穿", "公堂对质呈上账册", "选秀殿前陈情"],
    未来: ["星舰议会听证会", "全城直播的仲裁庭"],
    玄幻: ["宗门大比当众揭穿", "长老会审问心镜"],
  };

  const NEW_BIOS = `沈知意：26 岁，年代背景下纺织厂技术员，父亲是厂里的老工程师。性格沉稳，记账一丝不苟，手里攥着父亲留下的技术专利署名权。
赵立诚：28 岁，沈知意的未婚夫，厂办秘书。善于钻营，打算婚后把专利署名改到自己名下换取提拔。
赵母：赵立诚的母亲，街道积极分子，嘴上热情，心里把沈家的专利当作嫁妆。
老周师傅：沈父生前的徒弟，管着厂里的档案室，暗中帮沈知意找到原始图纸。`;

  const NEW_OUTLINE = `【一、作品信息】
书名：表彰会上的署名权
题材：年代 · 创业 · 女性成长

【二、一句话梗概】
订亲前夜，沈知意发现未婚夫伪造父亲的专利署名转让书，她在厂里的表彰大会上当众拿出原始图纸，夺回署名权。

【三、核心场景】
厂里分房表彰会当众对质 —— 从"赵家准儿媳"变成"专利署名人"。

【五、章节结构】
第1章：深夜在厂办看到一份署名转让书，签名是父亲的笔迹，可父亲已去世两年。
第2章：沈知意找老周师傅调出原始图纸与档案，表面上照常筹备订亲。
第3章：表彰大会上，她拿出原始图纸和档案编号，当众反转，厂长宣布署名归还沈家。

【六、人物小传】
${NEW_BIOS}

【七、爽点与钩子】
1. 第1章末：转让书的日期，是父亲去世后的第三天。
2. 第2章末：她把发言稿交给主持人，最后一页夹着档案室的借阅单。
3. 第3章末：赵立诚送来的检讨书，她没看，直接塞进了炉子。`;

  const CHAPTERS = [
    {
      chapter: 1,
      plot: "深夜发现伪造的署名转让书",
      emotion: "压抑 → 警觉",
      hook: "转让书的日期，是父亲去世后的第三天。",
      scene_card: {
        opening: "厂办值班室，夜里十一点，桌上的台灯只照亮半张转让书。",
        beats: [
          { beat_function: "发现异常", beat: "沈知意替赵立诚收拾文件，翻出一份《技术署名转让书》。", hook: "签名是父亲的笔迹。", beat_budget: 300 },
          { beat_function: "对话试探", beat: "赵立诚回来，若无其事地催她订亲后去厂里盖章。", dialogue_trigger: "都是走个流程。", beat_budget: 350 },
          { beat_function: "情绪压住", beat: "她没有发作，把日期默默记在手心。", hook: "日期在父亲去世之后。", beat_budget: 250 },
        ],
        chapter_end_hook: "转让书的日期，是父亲去世后的第三天。",
      },
      reference: {
        query_labels: ["对话", "动作", "情绪", "钩子"],
        per_source: { "示例参考库 · 年代短篇 A": 3, "示例参考库 · 职场短篇 B": 2, "示例参考库 · 家庭短篇 C": 2 },
        group_items: {
          对话: [
            { source: "示例参考库 · 职场短篇 B", semantic_tag: "轻描淡写的催促", content_role: "反派台词", text: "“你就签个字，后面的事我都安排好了。”他说得像在讨论晚饭吃什么。" },
            { source: "示例参考库 · 家庭短篇 C", semantic_tag: "反问试探", content_role: "主角台词", text: "“这份东西，你打算什么时候告诉我？”" },
          ],
          动作: [
            { source: "示例参考库 · 年代短篇 A", semantic_tag: "克制的动作", content_role: "情绪外化", text: "她把纸按原样折好，压回抽屉最底下，手指在抽屉边上停了很久。" },
          ],
          情绪: [
            { source: "示例参考库 · 年代短篇 A", semantic_tag: "冷静下的愤怒", content_role: "内心独白", text: "她没哭。哭是要有人看的，现在还不是时候。" },
          ],
          钩子: [
            { source: "示例参考库 · 家庭短篇 C", semantic_tag: "时间线矛盾", content_role: "章尾钩子", text: "落款日期那一栏，写着一个父亲不可能签字的日子。" },
          ],
        },
      },
      summary: { 人物状态: "沈知意已发现伪造，选择隐忍；赵立诚未察觉。", 伏笔: "转让书日期、父亲笔迹。" },
      text: `厂办的灯坏了一盏，剩下那盏照在桌角，把一摞文件照得发黄。
沈知意替赵立诚收拾明天开会要用的材料，最底下压着一张她没见过的纸——《技术署名转让书》。
转让人：沈国华。受让人：赵立诚。
签名是父亲的字，横折的地方习惯往回勾一下，她从小看到大，不会认错。
门口传来脚步声。赵立诚拎着两份饭盒进来，看见她手里的纸，笑容只顿了半秒："正想跟你说呢，订亲以后你去厂里盖个章，都是走个流程。"
"我爸的专利？"
"放在我名下，评职称好看，以后还不是咱俩的。"他把饭盒推到她面前，"先吃饭。"
沈知意把纸按原样折好，放回抽屉最底下。她低头吃饭，一口一口嚼得很慢。
赵立诚以为她答应了，说起订亲那天要请哪些领导。
她没有接话。她在想落款那一栏的日期——
那是父亲去世后的第三天。`,
    },
    {
      chapter: 2,
      plot: "暗中调档，表面筹备订亲",
      emotion: "隐忍 → 笃定",
      hook: "发言稿最后一页，夹着档案室的借阅单。",
      scene_card: {
        opening: "档案室里堆满旧图纸，老周师傅把一盏煤油灯推到她面前。",
        beats: [
          { beat_function: "寻找盟友", beat: "沈知意找到父亲的徒弟老周，说明来意。", beat_budget: 300 },
          { beat_function: "关键证据", beat: "两人在档案柜里找到原始图纸，图纸角落有父亲的签名和归档编号。", hook: "编号与转让书对不上。", beat_budget: 400 },
          { beat_function: "表面配合", beat: "回家后她照常和赵母商量订亲酒席，还主动提出要在表彰会上发言。", beat_budget: 300 },
        ],
        chapter_end_hook: "发言稿最后一页，夹着档案室的借阅单。",
      },
      reference: {
        query_labels: ["动作", "环境", "钩子"],
        per_source: { "示例参考库 · 年代短篇 A": 4, "示例参考库 · 悬疑短篇 D": 1 },
        group_items: {
          动作: [{ source: "示例参考库 · 年代短篇 A", semantic_tag: "翻找旧物", content_role: "推进证据", text: "他拉开最下面一格，灰扑了一脸，里面是一卷用麻绳捆着的图纸。" }],
          环境: [{ source: "示例参考库 · 年代短篇 A", semantic_tag: "年代感环境", content_role: "场景描写", text: "档案室的窗户糊着报纸，风一吹，哗啦哗啦地响。" }],
          钩子: [{ source: "示例参考库 · 悬疑短篇 D", semantic_tag: "证据藏在日常物件里", content_role: "章尾钩子", text: "她把那张单子叠成小方块，夹进了最不起眼的地方。" }],
        },
      },
      summary: { 人物状态: "沈知意拿到原始图纸，取得老周支持；赵家仍以为她会配合。", 伏笔: "归档编号、发言稿。" },
      text: `老周师傅听完，半天没说话，只是把烟掐了。
"你爸的东西，都在三号柜。"
档案室的窗户糊着旧报纸，风一吹哗啦啦响。老周拉开最下面一格，灰扑了一脸，里面是一卷用麻绳捆着的图纸。
图纸右下角，是父亲的签名，旁边盖着厂里的归档章，编号清清楚楚。
"转让书上写的编号，跟这个不一样。"沈知意说。
"那张是后补的。"老周压低声音，"真要办，得有原始档案，档案在我这儿，谁也没来借过。"
她把借阅单填好，小心叠成小方块。
晚上回家，赵母已经在掰着手指算酒席。沈知意坐下来，帮着一起列名单，还说："表彰会那天，我想上台讲两句，谢谢厂里这些年照顾我爸。"
赵母笑得合不拢嘴："应该的，应该的。"
发言稿她写了三页。最后一页的背面，夹着那张借阅单。`,
    },
    {
      chapter: 3,
      plot: "表彰会当众对质，夺回署名权",
      emotion: "爆发 → 释放",
      hook: "检讨书她没看，直接塞进了炉子。",
      scene_card: {
        opening: "礼堂坐满了人，横幅写着“先进生产者表彰大会”。",
        beats: [
          { beat_function: "反转开场", beat: "沈知意上台，没有念感谢词，而是展开了原始图纸。", beat_budget: 350 },
          { beat_function: "当众对质", beat: "她念出两份文件的编号和日期，请档案室当场核对。", dialogue_trigger: "我爸签字的时候，已经走了三天了。", beat_budget: 450 },
          { beat_function: "结果落地", beat: "厂长宣布署名归还沈家，赵立诚被停职调查。", hook: "检讨书被塞进炉子。", beat_budget: 300 },
        ],
        chapter_end_hook: "检讨书她没看，直接塞进了炉子。",
      },
      reference: {
        query_labels: ["对话", "情绪", "钩子"],
        per_source: { "示例参考库 · 职场短篇 B": 3, "示例参考库 · 年代短篇 A": 2 },
        group_items: {
          对话: [{ source: "示例参考库 · 职场短篇 B", semantic_tag: "公开场合的平静反击", content_role: "高潮台词", text: "“我不吵，我只请大家看一样东西。”" }],
          情绪: [{ source: "示例参考库 · 年代短篇 A", semantic_tag: "全场安静", content_role: "氛围", text: "礼堂里安静得能听见吊扇转动的声音。" }],
          钩子: [{ source: "示例参考库 · 职场短篇 B", semantic_tag: "干脆收尾", content_role: "结尾", text: "她连信封都没拆。" }],
        },
      },
      summary: { 人物状态: "沈知意取回署名权；赵立诚停职；赵家婚事告吹。", 伏笔: "全部回收。" },
      text: `主持人念到沈知意的名字，赵立诚在台下带头鼓掌。
她走上台，没有拿发言稿，而是解开一卷麻绳，把图纸在讲台上铺开。
"我爸设计的这台织机，大家都用过。"她说，"图纸右下角是他的签名，归档编号 0473。"
她又举起另一张纸。"这是一份署名转让书，签名也是我爸的笔迹，编号 0517，日期是去年三月十二号。"
台下有人小声算日子。
"我爸是三月九号走的。"沈知意看向赵立诚，"他签字的时候，已经走了三天了。"
礼堂里安静得能听见吊扇转动的声音。赵母站起来想说什么，被旁边的人拉住了。
档案室的老周举起手："原始档案在我这儿，借阅记录也在，谁都可以来查。"
散会前，厂长宣布：专利署名归还沈国华同志，赵立诚停职接受调查。
一周后，赵立诚托人送来一封检讨书。
沈知意正在生炉子，她看了一眼信封，没拆，直接塞了进去。`,
    },
  ];

  const HISTORY_DETAIL = {
    title: "订婚宴上的股东会（示例）",
    book_id: "demo-001",
    rank: 1,
    source: "示例参考库",
    split_result: SPLIT_RESULT,
  };

  // ---------- 状态 ----------
  const jobs = {};
  const tasks = [
    { task_id: "demo-task-1", title: "示例任务：订婚宴上的股东会", current_step: "step1_init", current_step_status: "draft", gmt_modified: "2026-11-21 10:00", last_summary: "已载入示例原文，可点击「AI 拆解」开始。" },
  ];

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function jobStatus(job) {
    const elapsed = (Date.now() - job.started) / 1000;
    const done = Math.min(CHAPTERS.length, Math.floor(elapsed / 2.5));
    const chapters = CHAPTERS.map((c, i) => {
      if (i < done) return { ...c, status: "completed", word_count: c.text.replace(/\s/g, "").length, generated_text: c.text, saved_at: null };
      if (i === done) return { chapter: c.chapter, plot: c.plot, emotion: c.emotion, hook: c.hook, scene_card: c.scene_card, reference: c.reference, status: "running" };
      return { chapter: c.chapter, plot: c.plot, status: "pending" };
    });
    const completed = done >= CHAPTERS.length;
    return {
      job_id: job.id,
      status: completed ? "completed" : "running",
      current_stage: completed ? "全部完成" : `第 ${done + 1} 章：检索参考 → 场景卡 → 生成 → 润色`,
      current_chapter: completed ? null : done + 1,
      completed_chapters: done,
      chapter_count: CHAPTERS.length,
      title: job.title || "表彰会上的署名权",
      output_path: completed ? "（演示环境不写文件）" : "生成中",
      blueprint: { 核心冲突: "伪造署名 vs 原始档案", 情绪曲线: "压抑 → 隐忍 → 爆发 → 释放", 主角目标: "夺回父亲的专利署名权" },
      chapter_plan: CHAPTERS.map((c) => ({ chapter: c.chapter, plot: c.plot, emotion: c.emotion, hook: c.hook })),
      chapters,
    };
  }

  async function handle(path, url, body) {
    if (path === "/auth/status") return json({ logged_in: true, oauth_enabled: false, user: { nickname: "演示用户", roles: ["访客"] } });
    if (path === "/api/me") return json({ user_id: "demo", nickname: "演示用户" });
    if (path === "/api/tasks") return json({ items: tasks });
    if (path === "/api/user/logout") return json({ ok: true });
    if (path === "/api/workflow/metadata") return json(METADATA);
    if (path === "/api/history_reference/dates") return json({ dates: [{ date: "2026-11-20", label: "11月20日", available_count: 1 }] });
    if (path === "/api/history_reference/books") return json({ books: [{ book_id: "demo-001", title: HISTORY_DETAIL.title, rank: 1, source: "示例参考库", is_priority: true }] });
    if (path === "/api/history_reference/detail") return json(HISTORY_DETAIL);
    if (path === "/api/workflow/step1/load")
      return json({ task_id: "demo-task-1", title: tasks[0].title, current_step: "step1_init", input_mode: "raw_text", raw_source_text: RAW_STORY, outline_source_text: "", split_result_text: "" });
    if (/\/api\/workflow\/step[123]\/save$/.test(path)) return json({ ok: true, task_id: body.task_id || "demo-task-1" });
    if (/\/api\/workflow\/step[23]\/load$/.test(path)) return json({ task_id: "demo-task-1" });
    if (path === "/api/pipeline/split") { await wait(1200); return json({ split_result: SPLIT_RESULT }); }
    if (path === "/api/workflow/analyze_outline") {
      await wait(1200);
      return json({
        parsed_outline: { title: "订婚宴上的股东会", 人物小传: SPLIT_RESULT.split("【六、人物小传】")[1].split("【七")[0].trim() },
        relationship_data: RELATIONSHIP,
        outline_analysis: { original_core_scene: "订婚宴致辞放录音", original_worldview: "现代", original_genre: "职场", original_audience: "女频" },
      });
    }
    if (path === "/api/workflow/match_scenes") {
      await wait(700);
      const list = SCENES[body.worldview] || SCENES["现代"];
      return json({ matched_scenes: list.map((name) => ({ name })) });
    }
    if (path === "/api/workflow/generate_characters") { await wait(1200); return json({ character_bios: NEW_BIOS }); }
    if (path === "/api/workflow/generate_new_outline") { await wait(1500); return json({ final_text: NEW_OUTLINE }); }
    if (path === "/api/pipeline/write/start") {
      const id = "demo-job-" + Date.now();
      jobs[id] = { id, started: Date.now(), title: body.title };
      return json({ job_id: id, chapter_count: CHAPTERS.length });
    }
    if (path.startsWith("/api/pipeline/write/status/")) {
      const id = path.split("/").pop();
      const job = jobs[id] || { id, started: Date.now() - 60000 };
      return json(jobStatus(job));
    }
    if (path === "/api/pipeline/write/chapter/save") {
      const text = String(body.text || "");
      return json({ ok: true, saved_at: new Date().toLocaleString("zh-CN"), saved_text_path: "（演示环境不写文件）", word_count: text.replace(/\s/g, "").length });
    }
    if (path === "/api/pipeline/write/chapter/regenerate") {
      const job = jobs[body.job_id]; if (job) job.started = Date.now() - (Number(body.chapter || 1) - 1) * 2500;
      return json({ ok: true, status: "running" });
    }
    if (path === "/api/pipeline/write/chapter/rewrite_selection") {
      await wait(900);
      const src = String(body.selected_text || body.text || "");
      return json({ rewritten_text: src ? src.replace(/。/g, "，") .replace(/，$/, "。") + "（演示：此处会返回模型改写后的句子）" : "（演示改写结果）" });
    }
    return json({ error: "演示环境未提供该接口" }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, opts = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const path = url.pathname.replace(/^.*?(\/api\/|\/auth\/)/, "$1");
    if (!/^\/(api|auth)\//.test(path)) return realFetch(input, opts);
    let body = {};
    try { body = JSON.parse(opts.body || "{}"); } catch (e) {}
    return handle(path, url, body);
  };
})();
