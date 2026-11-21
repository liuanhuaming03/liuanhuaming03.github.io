from __future__ import annotations

import html
import json
import mimetypes
import re
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

WORKSPACE_ROOT = Path(__file__).resolve().parents[3]  # Desktop/项目（00_hub/career-workbench/backend 往上三级）
DASHBOARD_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = DASHBOARD_DIR / "frontend"
STATE_DIR = DASHBOARD_DIR / "state"
PROGRESS_FILE = STATE_DIR / "career_tasks.json"
CAREER_FILE = STATE_DIR / "career_applications.json"
CAREER_RESUME_FILE = STATE_DIR / "career_resumes.json"
DAILY_PLAN_FILE = STATE_DIR / "daily_plans.json"
OBSIDIAN_CONNECTION_FILE = STATE_DIR / "obsidian_connection.json"
OBSIDIAN_REGISTRY_FILE = Path.home() / "Library/Application Support/obsidian/obsidian.json"
# 2026-11-10 目录搬迁：路径统一从 00_hub/paths.json 读取（相对 Desktop/项目）
HUB_PATHS_FILE = WORKSPACE_ROOT / "00_hub" / "paths.json"
try:
    HUB_PATHS = json.loads(HUB_PATHS_FILE.read_text(encoding="utf-8"))
except (OSError, ValueError):
    HUB_PATHS = {}


def hub_path(key: str, default: str) -> Path:
    return (WORKSPACE_ROOT / Path(HUB_PATHS.get(key, default)).expanduser()).resolve()


def registered_obsidian_vaults() -> dict[str, Any]:
    try:
        return json.loads(OBSIDIAN_REGISTRY_FILE.read_text(encoding="utf-8")).get("vaults", {})
    except (OSError, ValueError):
        return {}


OBSIDIAN_CONNECTION = json.loads(OBSIDIAN_CONNECTION_FILE.read_text(encoding="utf-8"))
OBSIDIAN_VAULT = hub_path("obsidianVault", OBSIDIAN_CONNECTION["vaultPath"])
# 库 ID 以 Obsidian 注册表中“路径等于当前主库”的那一项为准；Obsidian 重新打开库后 ID 会变
OBSIDIAN_VAULT_ID = next(
    (vid for vid, info in registered_obsidian_vaults().items() if info.get("path") and Path(info["path"]).expanduser().resolve() == OBSIDIAN_VAULT),
    OBSIDIAN_CONNECTION["vaultId"],
)
OBSIDIAN_VAULT_NAME = OBSIDIAN_VAULT.name
NOTE_DIRECTORIES = OBSIDIAN_CONNECTION["noteDirectories"]
JOB_ROOT = hub_path("career", "06_career")
JOB_PREFIX = "求职与秋招/"  # 状态文件中保存的逻辑前缀，目录改名后保持不变
JOB_RESUME_DIRS = ["01_简历与证明材料", "02_竞赛与成果证明"]
NOTE_ROOTS = [OBSIDIAN_VAULT / name for name in NOTE_DIRECTORIES]
DAILY_CATEGORIES = ["岗位投递", "LeetCode", "八股文", "简历优化", "面试准备", "测评笔试"]
DAILY_TAGS = ["秋招", "算法", "SQL", "八股", "投递", "简历", "面试", "测评", "高优先级", "可复用产出"]
app = FastAPI(title="秋招工作台", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8008", "http://127.0.0.1:8008"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SaveProgressRequest(BaseModel):
    content: Any


class SaveCareerRequest(BaseModel):
    content: Any


class SaveCareerResumeRequest(BaseModel):
    content: Any


class SaveDailyPlanRequest(BaseModel):
    date: str
    content: Any


def rel(path: Path) -> str:
    resolved = path.resolve()
    if JOB_ROOT.exists() and (resolved == JOB_ROOT.resolve() or JOB_ROOT.resolve() in resolved.parents):
        return JOB_PREFIX + resolved.relative_to(JOB_ROOT.resolve()).as_posix()
    return resolved.relative_to(WORKSPACE_ROOT).as_posix()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"JSON 格式错误: {exc}") from exc


def obsidian_available() -> bool:
    return OBSIDIAN_VAULT.is_dir() and (OBSIDIAN_VAULT / ".obsidian").is_dir()


def obsidian_connection_status() -> dict[str, Any]:
    registered = registered_obsidian_vaults().get(OBSIDIAN_VAULT_ID, {})
    registered_path = registered.get("path")
    linked = bool(registered_path and Path(registered_path).resolve() == OBSIDIAN_VAULT)
    return {
        "available": obsidian_available(),
        "registered": linked,
        "vault": OBSIDIAN_VAULT_NAME,
        "vaultId": OBSIDIAN_VAULT_ID,
        "path": str(OBSIDIAN_VAULT),
        "openUrl": "obsidian://open?" + urllib.parse.urlencode({"vault": OBSIDIAN_VAULT_ID}) if linked else "",
        "directories": [{"path": name, "label": label, "exists": (OBSIDIAN_VAULT / name).is_dir()} for name, label in NOTE_DIRECTORIES.items()],
    }


def obsidian_rel(path: Path) -> str:
    resolved = path.resolve()
    if JOB_ROOT.exists() and JOB_ROOT.resolve() in resolved.parents:
        return JOB_PREFIX + resolved.relative_to(JOB_ROOT.resolve()).as_posix()
    return resolved.relative_to(OBSIDIAN_VAULT.resolve()).as_posix()


def safe_obsidian_file(path_text: str) -> Path:
    if not path_text:
        raise HTTPException(status_code=400, detail="缺少笔记路径")
    relative = Path(path_text)
    if relative.is_absolute() or ".." in relative.parts:
        raise HTTPException(status_code=404, detail="笔记路径无效")
    path = (OBSIDIAN_VAULT / relative).resolve()
    # 兼容旧工作台链接，始终定位主库内同名且唯一的笔记。
    if not path.is_file() and (relative.parts[0] in {"20_技术笔记", "10_阅读笔记"} or path_text.startswith(JOB_PREFIX + "05_面试复盘/")):
        candidates = [item for root in NOTE_ROOTS for item in root.rglob(relative.name) if item.is_file() and root.resolve() in item.resolve().parents]
        if len(candidates) == 1:
            path = candidates[0].resolve()
    if not any(root.resolve() in path.parents for root in NOTE_ROOTS) or OBSIDIAN_VAULT not in path.parents:
        raise HTTPException(status_code=404, detail="文件不在主库的求职学习笔记目录内")
    if not path.is_file() or path.suffix.lower() not in {".md", ".markdown", ".canvas"}:
        raise HTTPException(status_code=404, detail="笔记不存在或类型不支持")
    return path


OBSIDIAN_ASSET_SUFFIXES = {
    ".canvas",
    ".docx",
    ".jpeg",
    ".jpg",
    ".markdown",
    ".md",
    ".pdf",
    ".png",
    ".pptx",
    ".txt",
    ".webp",
    ".xlsx",
}


def safe_obsidian_asset(path_text: str) -> Path:
    if not path_text:
        raise HTTPException(status_code=400, detail="缺少 Obsidian 附件路径")
    if path_text.startswith(JOB_PREFIX):
        path = (JOB_ROOT / path_text[len(JOB_PREFIX):]).resolve()
        if not JOB_ROOT.exists() or JOB_ROOT.resolve() not in path.parents:
            raise HTTPException(status_code=404, detail="附件不在允许访问的求职与秋招目录内")
    else:
        path = (OBSIDIAN_VAULT / path_text).resolve()
        vault_root = OBSIDIAN_VAULT.resolve()
        if not obsidian_available() or not (path == vault_root or vault_root in path.parents):
            raise HTTPException(status_code=404, detail="Obsidian 附件不在允许访问的 vault 内")
    if not path.exists() or not path.is_file() or path.suffix.lower() not in OBSIDIAN_ASSET_SUFFIXES:
        raise HTTPException(status_code=404, detail="Obsidian 附件不存在或类型不支持")
    return path


def obsidian_asset_meta(path: Path) -> dict[str, Any]:
    stat = path.stat()
    rel_path = obsidian_rel(path)
    if path.suffix.lower() in {".md", ".markdown", ".canvas"}:
        url = f"/api/obsidian/file?path={urllib.parse.quote(rel_path)}"
    else:
        url = f"/api/obsidian/asset?path={urllib.parse.quote(rel_path)}"
    return {
        "name": path.name,
        "path": rel_path,
        "size": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        "suffix": path.suffix.lower(),
        "url": url,
        "obsidianUrl": obsidian_url(path) if path.suffix.lower() in {".md", ".markdown", ".canvas"} else "",
    }


def obsidian_url(path: Path) -> str:
    resolved = path.resolve()
    if OBSIDIAN_VAULT not in resolved.parents or not obsidian_connection_status()["registered"]:
        return ""
    return "obsidian://open?" + urllib.parse.urlencode(
        {"path": str(resolved), "paneType": "tab"}, quote_via=urllib.parse.quote
    )


def extract_obsidian_tags(text: str) -> list[str]:
    tags: set[str] = set()

    def add_tag(value: str) -> None:
        cleaned = value.strip().strip("'\"#")
        if not cleaned or cleaned == "-":
            return
        tags.add(cleaned)

    frontmatter = re.match(r"^---\n(.*?)\n---", text, flags=re.S)
    if frontmatter:
        block = frontmatter.group(1)
        tag_line = re.search(r"^tags:\s*(.+)$", block, flags=re.M)
        if tag_line:
            raw = tag_line.group(1).strip().strip("[]")
            for tag in re.split(r"[,，\s]+", raw):
                add_tag(tag)
        tag_list = re.search(r"^tags:\s*\n((?:\s*-\s*.+\n?)+)", block, flags=re.M)
        if tag_list:
            for tag in re.findall(r"^\s*-\s*(.+)$", tag_list.group(1), flags=re.M):
                add_tag(tag)
    for tag in re.findall(r"(?<!\w)#([\w\u4e00-\u9fff/-]+)", text):
        add_tag(tag.strip("/"))
    return sorted(tags)


def obsidian_note_meta(path: Path) -> dict[str, Any]:
    stat = path.stat()
    text = path.read_text(encoding="utf-8", errors="replace") if path.suffix.lower() in {".md", ".markdown"} else ""
    rel_path = obsidian_rel(path)
    links = re.findall(r"\[\[([^\]]+)\]\]", text)
    tags = extract_obsidian_tags(text)
    directory = rel_path.split("/", 1)[0]
    excerpt = re.sub(r"^---.*?---", "", text, flags=re.S).strip()
    excerpt = re.sub(r"\s+", " ", excerpt)[:220]
    return {
        "name": path.stem,
        "fileName": path.name,
        "path": rel_path,
        "absolutePath": str(path.resolve()),
        "category": NOTE_DIRECTORIES.get(directory, directory),
        "source": "Obsidian 主库",
        "empty": not text.strip() if path.suffix.lower() != ".canvas" else stat.st_size == 0,
        "size": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        "suffix": path.suffix.lower(),
        "tags": tags,
        "links": links[:20],
        "linkCount": len(links),
        "excerpt": excerpt,
        "url": f"/api/obsidian/file?path={urllib.parse.quote(rel_path)}",
        "rawUrl": f"/api/obsidian/file?path={urllib.parse.quote(rel_path)}&raw=1",
        "obsidianUrl": obsidian_url(path),
    }


def obsidian_notes(q: str = "", limit: int = 160) -> dict[str, Any]:
    connection = obsidian_connection_status()
    query = q.strip().casefold()
    notes: list[dict[str, Any]] = []
    seen: set[Path] = set()
    for root in NOTE_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            resolved = path.resolve()
            if not path.is_file() or resolved in seen or OBSIDIAN_VAULT not in resolved.parents or root.resolve() not in resolved.parents:
                continue
            if any(part.startswith(".") for part in path.relative_to(OBSIDIAN_VAULT).parts):
                continue
            if path.suffix.lower() not in {".md", ".markdown", ".canvas"}:
                continue
            seen.add(resolved)
            meta = obsidian_note_meta(path)
            if query:
                text = path.read_text(encoding="utf-8", errors="replace")
                search_text = " ".join([meta["name"], meta["path"], meta["category"], " ".join(meta["tags"]), text]).casefold()
                if query not in search_text:
                    continue
                match = text.casefold().find(query)
                if match >= 0:
                    meta["excerpt"] = ("…" if match > 80 else "") + re.sub(r"\s+", " ", text[max(0, match - 80):match + len(query) + 160])
            notes.append(meta)
    notes.sort(key=lambda item: item["modified"], reverse=True)
    categories: dict[str, int] = {}
    tags: dict[str, int] = {}
    for note in notes:
        categories[note["category"]] = categories.get(note["category"], 0) + 1
        for tag in note["tags"]:
            tags[tag] = tags.get(tag, 0) + 1
    return {
        **connection,
        "notes": notes[:limit],
        "total": len(notes),
        "emptyCount": sum(1 for note in notes if note["empty"]),
        "categories": categories,
        "tags": dict(sorted(tags.items(), key=lambda item: item[1], reverse=True)[:40]),
        "query": q.strip(),
        "searchUrl": "obsidian://search?" + urllib.parse.urlencode({"vault": OBSIDIAN_VAULT_ID, "query": q.strip()}, quote_via=urllib.parse.quote) if connection["registered"] and query else "",
        "message": "已连接正在使用的 Obsidian 主库" if connection["registered"] else "主库尚未在 Obsidian 注册，请先在 Obsidian 打开该文件夹。",
    }


def inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" target="_blank" rel="noreferrer">\1</a>', escaped)
    return escaped


def markdown_table(lines: list[str]) -> str:
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) < 2:
        return ""
    headers = rows[0]
    body = rows[2:] if re.match(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[1]) else rows[1:]
    html_rows = [
        "<thead><tr>"
        + "".join(f"<th>{inline_markdown(cell)}</th>" for cell in headers)
        + "</tr></thead>"
    ]
    html_rows.append(
        "<tbody>"
        + "".join(
            "<tr>" + "".join(f"<td>{inline_markdown(cell)}</td>" for cell in row) + "</tr>"
            for row in body
        )
        + "</tbody>"
    )
    return '<div class="table-wrap"><table>' + "".join(html_rows) + "</table></div>"


def render_markdown_body(text: str) -> str:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    parts: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    table_lines: list[str] = []
    code_lines: list[str] = []
    in_code = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            parts.append("<p>" + inline_markdown(" ".join(item.strip() for item in paragraph)) + "</p>")
            paragraph = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            parts.append("<ul>" + "".join(f"<li>{inline_markdown(item)}</li>" for item in list_items) + "</ul>")
            list_items = []

    def flush_table() -> None:
        nonlocal table_lines
        if table_lines:
            rendered = markdown_table(table_lines)
            if rendered:
                parts.append(rendered)
            else:
                parts.extend("<p>" + inline_markdown(line) + "</p>" for line in table_lines)
            table_lines = []

    for raw_line in lines:
        line = raw_line.rstrip()
        if line.strip().startswith("```"):
            if in_code:
                parts.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")
                code_lines = []
                in_code = False
            else:
                flush_paragraph()
                flush_list()
                flush_table()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue

        if not line.strip():
            flush_paragraph()
            flush_list()
            flush_table()
            continue

        if line.lstrip().startswith("|"):
            flush_paragraph()
            flush_list()
            table_lines.append(line)
            continue

        flush_table()
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            flush_list()
            level = min(len(heading.group(1)), 4)
            parts.append(f"<h{level}>{inline_markdown(heading.group(2).strip())}</h{level}>")
            continue

        if re.match(r"^\s*[-*_]{3,}\s*$", line):
            flush_paragraph()
            flush_list()
            parts.append("<hr>")
            continue

        bullet = re.match(r"^\s*(?:[-*+]|\d+\.)\s+(.+)$", line)
        if bullet:
            flush_paragraph()
            list_items.append(bullet.group(1).strip())
            continue

        flush_list()
        paragraph.append(line)

    flush_paragraph()
    flush_list()
    flush_table()
    if in_code and code_lines:
        parts.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")
    return "\n".join(parts)


def external_markdown_page(file_path: Path, title: str, raw_url: str, open_url: str, source_label: str) -> str:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    open_button = f'<a class="button primary" href="{html.escape(open_url)}">在 Obsidian 打开</a>' if open_url else ""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <style>
    body {{
      margin: 0;
      background: #f6f8fb;
      color: #1f2937;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.75;
    }}
    main {{
      max-width: 980px;
      margin: 0 auto;
      padding: 42px 22px 72px;
    }}
    .toolbar {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      padding: 14px;
      border: 1px solid #dfe5ef;
      border-radius: 12px;
      background: #fff;
    }}
    .toolbar span {{ color: #64748b; font-size: 13px; }}
    .button {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 13px;
      border: 1px solid #d7deea;
      border-radius: 8px;
      color: #22304a;
      text-decoration: none;
      background: #fff;
      font-size: 14px;
      font-weight: 700;
    }}
    .button.primary {{ background: #4668df; color: #fff; border-color: #4668df; }}
    article {{
      padding: 34px;
      border: 1px solid #dfe5ef;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 18px 48px rgba(30, 41, 59, 0.08);
    }}
    h1, h2, h3 {{ line-height: 1.3; color: #172033; }}
    code {{ background: #f1f5f9; padding: 2px 5px; border-radius: 5px; }}
    pre {{ overflow: auto; padding: 14px; border-radius: 10px; background: #0f172a; color: #e2e8f0; }}
    table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
    th, td {{ border: 1px solid #dfe5ef; padding: 8px 10px; text-align: left; vertical-align: top; }}
    blockquote {{ margin: 16px 0; padding-left: 14px; border-left: 4px solid #c7d2fe; color: #475569; }}
  </style>
</head>
<body>
  <main>
    <div class="toolbar">
      <span>{html.escape(source_label)} · {html.escape(file_path.name)}</span>
      <div>
        {open_button}
        <a class="button" href="{html.escape(raw_url)}">查看原文</a>
      </div>
    </div>
    <article>{render_markdown_body(text)}</article>
  </main>
</body>
</html>"""


def default_progress() -> dict[str, Any]:
    return {"updatedAt": datetime.now().isoformat(timespec="seconds"), "items": []}


CAREER_STATUSES = ["未投递", "已投递", "测评", "笔试", "一面", "二面", "HR面", "Offer", "拒绝", "放弃"]


def default_career_applications() -> dict[str, Any]:
    return {"updatedAt": datetime.now().isoformat(timespec="seconds"), "items": []}


def career_summary(content: dict[str, Any]) -> dict[str, Any]:
    items = content.get("items", []) if isinstance(content, dict) else []
    by_status = {status: 0 for status in CAREER_STATUSES}
    for item in items:
        status = item.get("status") or "未投递"
        by_status[status] = by_status.get(status, 0) + 1
    active_statuses = {"已投递", "测评", "笔试", "一面", "二面", "HR面", "Offer"}
    return {
        "total": len(items),
        "notApplied": by_status.get("未投递", 0),
        "applied": sum(by_status.get(status, 0) for status in active_statuses),
        "interviewing": sum(by_status.get(status, 0) for status in {"一面", "二面", "HR面"}),
        "offers": by_status.get("Offer", 0),
        "byStatus": by_status,
    }


def default_career_resumes() -> dict[str, Any]:
    return {
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "categories": [
            {
                "id": "ai-agent",
                "name": "AI Agent",
                "targetRoles": ["AI Agent 开发工程师", "智能体应用研发", "企业智能 / Agentic Workflow"],
                "recommendedResumeId": "resume-ai-agent-autumn",
                "positioning": "主打 Research Agent、RAG、工具调用、流式服务和 AI Coding 落地经验。",
                "projectOrder": ["Research Agent 问答系统", "文辞 AI RAG 工作台", "毕业论文多 Agent 研究"],
                "evidence": ["阿里云 Data+AI top 6%", "准确率 13% 提升至 52%", "RAG 命中率 50% 提升至 79%"],
                "fillFocus": ["强调 Agent = LLM + 规划 + 记忆 + 工具", "用 Badcase 分析解释迭代方法"],
                "risks": ["需要持续补足数据结构、算法题和计算机基础表达。"],
                "nextActions": ["每投一个 Agent 岗位都补一条 JD 对应证据。"],
            }
        ],
        "resumes": [
            {
                "id": "resume-ai-agent-autumn",
                "title": "AI Agent 秋招主投简历",
                "status": "主投",
                "versionDate": "2026-09-09",
                "categoryIds": ["ai-agent"],
                "filePath": "求职与秋招/01_简历与证明材料/当前版本/ai agent_阮景怡.pdf（秋招）.pdf",
                "previewPath": "求职与秋招/01_简历与证明材料/当前版本/ai agent_阮景怡.pdf (秋招).png",
                "roleFit": "适合 AI Agent、AI 应用研发、智能体算法和企业智能岗位。",
                "notes": "从“求职与秋招/01_简历与证明材料”读取；可在页面中继续补分类和投递口径。",
                "tags": ["AI Agent", "RAG", "FastAPI"],
            }
        ],
        "applicationQuestions": [
            {
                "id": "common-ai-example",
                "groupId": "ai-agent",
                "title": "简述一次使用 AI 解决问题的实际例子",
                "questionPatterns": ["请简述一个你使用 AI 解决问题的实际例子", "AI 使用经验", "大模型解决问题案例"],
                "value": "一个实际例子是我在阿里云 Data+AI 工程师全球大奖赛中，用 AI Agent 解决复杂研究问答准确率低的问题。项目初期基线准确率约为 13%，我基于 Qwen-Plus、LangChain/AgentScope 设计 Research Agent，将问题拆解后结合多源搜索、RAG 检索、ReAct 推理、Rerank 和答案归一化，提高证据召回与回答稳定性，最终将准确率提升至 52%，进入高校赛道 top 6%。之后在文辞 AI 项目中，我也将类似思路用于长文本生成工作台，优化 RAG 参考片段召回和章节生成流程，提升了内容生成效率与质量。",
                "note": "适合官网简答题，可按字数删去最后一句。",
                "tags": ["AI 使用", "Agent", "RAG"],
                "categoryIds": ["ai-agent", "agent-algorithm", "ai-application-dev"],
                "answerType": "textarea",
            }
        ],
        "fillSections": [
            {
                "id": "personal",
                "title": "个人信息",
                "description": "投递表单高频基础字段。",
                "items": [
                    {"label": "姓名", "value": "阮景怡", "note": "中英文名按岗位要求填写。", "tags": ["基础信息"]},
                    {"label": "当前身份", "value": "中国地质大学管理科学与工程硕士在读，2027 届毕业。", "note": "", "tags": ["教育"]},
                ],
            }
        ],
        "suggestions": [
            {
                "id": "focus-agent",
                "priority": "high",
                "title": "主线继续押 AI Agent / AI 应用",
                "detail": "你的证据链最完整，能同时覆盖 RAG、Agent、工程部署和 Badcase 优化。",
                "action": "每个高优先级岗位保存一份 JD-证据映射。",
                "categoryIds": ["ai-agent"],
            }
        ],
    }


def career_resume_assets(limit: int = 160) -> list[dict[str, Any]]:
    bases = [JOB_ROOT / name for name in JOB_RESUME_DIRS]
    assets = [
        obsidian_asset_meta(path)
        for base in bases
        if base.is_dir()
        for path in base.rglob("*")
        if path.is_file() and not path.name.startswith(".") and path.suffix.lower() in OBSIDIAN_ASSET_SUFFIXES
    ]
    assets.sort(key=lambda item: (item.get("modified", ""), item.get("name", "")), reverse=True)
    return assets[:limit]


def career_resume_summary(content: dict[str, Any], assets: list[dict[str, Any]]) -> dict[str, Any]:
    resumes = content.get("resumes", []) if isinstance(content, dict) else []
    categories = content.get("categories", []) if isinstance(content, dict) else []
    sections = content.get("fillSections", []) if isinstance(content, dict) else []
    questions = content.get("applicationQuestions", []) if isinstance(content, dict) else []
    by_category = {category.get("id", ""): 0 for category in categories if category.get("id")}
    for resume in resumes:
        for category_id in resume.get("categoryIds", []) or []:
            by_category[category_id] = by_category.get(category_id, 0) + 1
    fill_item_count = sum(len(section.get("items", []) or []) for section in sections)
    question_count = len(questions) if isinstance(questions, list) else 0
    return {
        "resumeCount": len(resumes),
        "categoryCount": len(categories),
        "fillSectionCount": len(sections),
        "fillItemCount": fill_item_count,
        "applicationQuestionCount": question_count,
        "assetCount": len(assets),
        "primaryCount": sum(1 for resume in resumes if "主" in str(resume.get("status", ""))),
        "byCategory": by_category,
    }


def clean_career_resume_state(content: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(content)
    for transient_key in ("summary", "assetFiles", "statuses", "message"):
        cleaned.pop(transient_key, None)
    for resume in cleaned.get("resumes", []) if isinstance(cleaned.get("resumes"), list) else []:
        if isinstance(resume, dict):
            resume.pop("file", None)
            resume.pop("preview", None)
    return cleaned


def career_resumes_payload() -> dict[str, Any]:
    content = read_json(CAREER_RESUME_FILE) if CAREER_RESUME_FILE.exists() else default_career_resumes()
    if not isinstance(content, dict):
        content = default_career_resumes()
    content.setdefault("categories", [])
    content.setdefault("resumes", [])
    content.setdefault("applicationQuestions", [])
    content.setdefault("fillSections", [])
    content.setdefault("suggestions", [])
    assets = career_resume_assets()
    asset_by_path = {item["path"]: item for item in assets}
    for resume in content.get("resumes", []):
        if not isinstance(resume, dict):
            continue
        file_path = str(resume.get("filePath") or "").strip()
        preview_path = str(resume.get("previewPath") or "").strip()
        if file_path in asset_by_path:
            resume["file"] = asset_by_path[file_path]
        if preview_path in asset_by_path:
            resume["preview"] = asset_by_path[preview_path]
    return {
        **content,
        "assetFiles": assets,
        "summary": career_resume_summary(content, assets),
        "message": "简历目录已连接" if JOB_ROOT.exists() else "未找到“求职与秋招”简历目录",
    }


def today_text() -> str:
    return datetime.now().date().isoformat()


def validate_date_text(date_text: str | None) -> str:
    value = (date_text or today_text()).strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise HTTPException(status_code=400, detail="日期格式必须是 YYYY-MM-DD")
    return value


def default_daily_items(date_text: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{date_text}-leetcode",
            "title": "刷 1-2 道 LeetCode / SQL 题",
            "category": "LeetCode",
            "status": "todo",
            "goalMet": False,
            "tags": ["算法", "秋招"],
            "plannedPomodoros": 2,
            "completedPomodoros": 0,
            "timeBlock": "晚上",
            "estimatedMinutes": 60,
            "linkedTo": "笔试准备",
            "notes": "记录题型、错因和复盘日期。",
        },
        {
            "id": f"{date_text}-baguwen",
            "title": "背 1 个八股模块并整理面试话术",
            "category": "八股文",
            "status": "todo",
            "goalMet": False,
            "tags": ["八股", "秋招"],
            "plannedPomodoros": 1,
            "completedPomodoros": 0,
            "timeBlock": "晚上",
            "estimatedMinutes": 30,
            "linkedTo": "一面 / 二面",
            "notes": "优先 SQL、Python、机器学习基础、项目追问。",
        },
        {
            "id": f"{date_text}-application",
            "title": "投递或维护 1-2 个岗位",
            "category": "岗位投递",
            "status": "todo",
            "goalMet": False,
            "tags": ["投递", "秋招"],
            "plannedPomodoros": 1,
            "completedPomodoros": 0,
            "timeBlock": "晚间收尾",
            "estimatedMinutes": 30,
            "linkedTo": "秋招投递漏斗",
            "notes": "补 JD 要点，把项目经历映射到岗位要求。",
        },
    ]


def default_daily_plan(date_text: str) -> dict[str, Any]:
    return {
        "date": date_text,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "focus": "围绕岗位投递、笔试训练和面试准备，完成今天的求职目标。",
        "morningNote": "早晨先写下今天最想完成的 3 件事，再开始做。",
        "items": default_daily_items(date_text),
    }


def recommended_daily_items(date_text: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{date_text}-rec-leetcode",
            "title": "完成 1 道算法或 SQL 题并写错因",
            "category": "LeetCode",
            "status": "todo",
            "goalMet": False,
            "tags": ["算法", "秋招"],
            "plannedPomodoros": 2,
            "completedPomodoros": 0,
            "timeBlock": "晚上",
            "estimatedMinutes": 45,
            "linkedTo": "笔试准备",
            "notes": "只求稳定推进，记录题型和下次复习日期。",
        },
        {
            "id": f"{date_text}-rec-career",
            "title": "更新 1 个岗位投递状态或简历匹配点",
            "category": "岗位投递",
            "status": "todo",
            "goalMet": False,
            "tags": ["投递", "秋招"],
            "plannedPomodoros": 1,
            "completedPomodoros": 0,
            "timeBlock": "晚间收尾",
            "estimatedMinutes": 25,
            "linkedTo": "秋招投递漏斗",
            "notes": "把下一步动作写清楚：投递、笔试、面试准备或复盘。",
        },
    ]


def read_daily_plans() -> dict[str, Any]:
    if not DAILY_PLAN_FILE.exists():
        return {"updatedAt": datetime.now().isoformat(timespec="seconds"), "plans": {}}
    content = read_json(DAILY_PLAN_FILE)
    if not isinstance(content, dict):
        return {"updatedAt": datetime.now().isoformat(timespec="seconds"), "plans": {}}
    content.setdefault("plans", {})
    return content


def daily_plan_summary(plan: dict[str, Any]) -> dict[str, Any]:
    items = plan.get("items", []) if isinstance(plan, dict) else []
    done = sum(1 for item in items if item.get("status") == "done")
    achieved = sum(1 for item in items if item.get("goalMet") is True)
    planned_pomodoros = sum(int(item.get("plannedPomodoros") or 0) for item in items)
    completed_pomodoros = sum(int(item.get("completedPomodoros") or 0) for item in items)
    by_category = {category: 0 for category in DAILY_CATEGORIES}
    by_tag: dict[str, int] = {}
    for item in items:
        category = item.get("category") or "岗位投递"
        by_category[category] = by_category.get(category, 0) + 1
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = [tag.strip() for tag in re.split(r"[,，#\s]+", tags) if tag.strip()]
        for tag in tags:
            by_tag[str(tag)] = by_tag.get(str(tag), 0) + 1
    return {
        "total": len(items),
        "done": done,
        "achieved": achieved,
        "plannedPomodoros": planned_pomodoros,
        "completedPomodoros": completed_pomodoros,
        "remaining": max(len(items) - done, 0),
        "completionRate": round((done / len(items)) * 100) if items else 0,
        "achievementRate": round((achieved / len(items)) * 100) if items else 0,
        "pomodoroRate": round((completed_pomodoros / planned_pomodoros) * 100) if planned_pomodoros else 0,
        "byCategory": by_category,
        "byTag": by_tag,
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(
        FRONTEND_DIR / "index.html",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/app.js")
def frontend_script() -> FileResponse:
    return FileResponse(
        FRONTEND_DIR / "app.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/styles.css")
def frontend_styles() -> FileResponse:
    return FileResponse(
        FRONTEND_DIR / "styles.css",
        media_type="text/css",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "projectName": "秋招工作台",
        "projectRoot": str(JOB_ROOT),
        "obsidian": obsidian_connection_status(),
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@app.get("/api/obsidian/notes")
def obsidian_notes_endpoint(q: str = "", limit: int = Query(160, ge=1, le=300)) -> dict[str, Any]:
    return obsidian_notes(q, limit)


@app.get("/api/obsidian/file")
def serve_obsidian_file(path: str, raw: int = 0):
    file_path = safe_obsidian_file(path)
    if file_path.suffix.lower() in {".md", ".markdown"} and not raw:
        rel_path = obsidian_rel(file_path)
        return HTMLResponse(
            external_markdown_page(
                file_path,
                file_path.name,
                f"/api/obsidian/file?path={urllib.parse.quote(rel_path)}&raw=1",
                obsidian_url(file_path),
                f"Obsidian · {OBSIDIAN_VAULT_NAME}",
            ),
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
            },
        )
    media_type = mimetypes.guess_type(file_path.name)[0] or "text/plain"
    return FileResponse(file_path, media_type=media_type, filename=None, headers={"Cache-Control": "no-store"})


@app.get("/api/obsidian/asset")
def serve_obsidian_asset(path: str):
    file_path = safe_obsidian_asset(path)
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    filename = file_path.name if file_path.suffix.lower() in {".docx", ".xlsx", ".pptx"} else None
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=filename,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/progress")
def progress() -> dict[str, Any]:
    if not PROGRESS_FILE.exists():
        return default_progress()
    return read_json(PROGRESS_FILE)


@app.post("/api/progress/save")
def save_progress(payload: SaveProgressRequest) -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    content = payload.content
    if isinstance(content, dict):
        content["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    PROGRESS_FILE.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "file": rel(PROGRESS_FILE)}


@app.get("/api/daily-plan")
def daily_plan(date: str | None = None) -> dict[str, Any]:
    date_text = validate_date_text(date)
    store = read_daily_plans()
    plan = store.get("plans", {}).get(date_text) or default_daily_plan(date_text)
    plan["summary"] = daily_plan_summary(plan)
    plan["categories"] = DAILY_CATEGORIES
    plan["tagSuggestions"] = DAILY_TAGS
    plan["recommendations"] = recommended_daily_items(date_text)
    return plan


@app.post("/api/daily-plan/save")
def save_daily_plan(payload: SaveDailyPlanRequest) -> dict[str, Any]:
    date_text = validate_date_text(payload.date)
    if not isinstance(payload.content, dict):
        raise HTTPException(status_code=400, detail="每日计划必须是 JSON 对象")
    store = read_daily_plans()
    plan = payload.content
    plan["date"] = date_text
    plan["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    for transient_key in ("summary", "categories", "tagSuggestions", "recommendations"):
        plan.pop(transient_key, None)
    plan.setdefault("focus", "围绕岗位投递、笔试训练和面试准备，完成今天的求职目标。")
    plan.setdefault("morningNote", "")
    for item in plan.get("items", []) if isinstance(plan.get("items"), list) else []:
        if isinstance(item.get("tags"), str):
            item["tags"] = [tag.strip() for tag in re.split(r"[,，#\s]+", item["tags"]) if tag.strip()]
        item["goalMet"] = bool(item.get("goalMet"))
        item["plannedPomodoros"] = int(item.get("plannedPomodoros") or 0)
        item["completedPomodoros"] = int(item.get("completedPomodoros") or 0)
    store["updatedAt"] = plan["updatedAt"]
    store.setdefault("plans", {})[date_text] = plan
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    DAILY_PLAN_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "file": rel(DAILY_PLAN_FILE), "plan": daily_plan(date_text)}


@app.get("/api/career")
def career() -> dict[str, Any]:
    content = read_json(CAREER_FILE) if CAREER_FILE.exists() else default_career_applications()
    if not isinstance(content, dict):
        content = default_career_applications()
    return {
        **content,
        "statuses": CAREER_STATUSES,
        "summary": career_summary(content),
    }


@app.get("/api/career/resumes")
def career_resumes() -> dict[str, Any]:
    return career_resumes_payload()


@app.post("/api/career/resumes/save")
def save_career_resumes(payload: SaveCareerResumeRequest) -> dict[str, Any]:
    if not isinstance(payload.content, dict):
        raise HTTPException(status_code=400, detail="简历素材库必须是 JSON 对象")
    content = clean_career_resume_state(payload.content)
    content["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    content.setdefault("categories", [])
    content.setdefault("resumes", [])
    content.setdefault("applicationQuestions", [])
    content.setdefault("fillSections", [])
    content.setdefault("suggestions", [])
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    CAREER_RESUME_FILE.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "file": rel(CAREER_RESUME_FILE), "content": career_resumes_payload()}


@app.post("/api/career/save")
def save_career(payload: SaveCareerRequest) -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    content = payload.content
    if not isinstance(content, dict):
        raise HTTPException(status_code=400, detail="岗位投递进度必须是 JSON 对象")
    content["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    CAREER_FILE.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "file": rel(CAREER_FILE), "summary": career_summary(content)}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
