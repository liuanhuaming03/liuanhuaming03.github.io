# -*- coding: utf-8 -*-
import asyncio
import os
import re
import json
import time
from typing import Any, AsyncIterator, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import Request as FastAPIRequest
from fastapi.responses import StreamingResponse
from agentscope_runtime.engine import AgentApp
from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent

# tracing（可选）
os.environ["LANGSMITH_OTEL_ENABLED"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGSMITH_OTEL_ONLY"] = "false"
chat_agent = None
chat_agent_query = None

agent_app = AgentApp(
    app_name="CompetitionAgent",
    app_description="Competition-ready QA agent",
)

llm_instance = None
llm_hq_instance = None
iqs_enabled = False
tavily_enabled = False
serpapi_enabled = False

# Search provider defaults (keep tunable constants in code)
IQS_API_URL_DEFAULT = "https://cloud-iqs.aliyuncs.com/search/llm"
TAVILY_API_URL = "https://api.tavily.com/search"
SERPAPI_API_URL = "https://serpapi.com/search.json"

IQS_TIMEOUT_SECONDS = 8
TAVILY_TIMEOUT_SECONDS = 7
SERPAPI_TIMEOUT_SECONDS = 7

MAX_QUERY_REWRITES = 3
SEARCH_TOPK_PER_PROVIDER = 4
MAX_PROVIDER_PER_QUESTION = 3
RERANK_TOPN = 8
EVIDENCE_MAX_ITEMS = 8
EVIDENCE_MAX_CHARS = 2400
MAX_ANSWER_CHARS = 220
SEARCH_BUDGET_SECONDS = 28
PROVIDER_TASK_TIMEOUT_SECONDS = 10
LLM_CALL_TIMEOUT_SECONDS = 22
SANITIZE_TIMEOUT_SECONDS = 4
PROVIDER_MAX_FAILS = 2
PROVIDER_COOLDOWN_SECONDS = 300
LONG_QUESTION_CHAR_THRESHOLD = 220
LONG_QUESTION_TOKEN_THRESHOLD = 70
LONG_QUERY_KEYWORD_LIMIT = 18
ASK_HARD_TIMEOUT_SECONDS = 55
ENABLE_SEARCH_FALLBACK = True
CONSERVATIVE_VERIFY_ENABLED = False
VERIFY_TIMEOUT_SECONDS = 7
FORMAT_FIX_TIMEOUT_SECONDS = 6
HQ_MODEL_NAME = "qwen-plus"
HQ_CALL_TIMEOUT_SECONDS = 26
ENABLE_QUERY_DECOMPOSITION = True
MAX_DECOMPOSE_EXTRA_QUERIES = 2
ENABLE_ITERATIVE_RETRIEVAL = True
ITERATIVE_ENTITY_MAX = 2
ITERATIVE_SEED_DOCS = 3
ITERATIVE_PROVIDER_LIMIT = 1
MIN_DOC_OVERLAP_TOKENS = 2
SSE_PING_INTERVAL_SECONDS = 15
SSE_PING_EVENT_NAME = "Ping"
SSE_FINAL_EVENT_NAME = "Message"
FORCE_BEST_EFFORT_ANSWER = False
FORCE_ANSWER_TIMEOUT_SECONDS = 16
ENABLE_REACT_REASONING = False
REACT_CALL_TIMEOUT_SECONDS = 10
REACT_ONLY_ON_HARD_QUESTION = True
RAG_CACHE_TTL_SECONDS = 600
RAG_CACHE_MAX_ITEMS = 256
FORCE_RETRIEVAL_ON_COMPLEX_QUESTION = False
USE_DIRECT_LLM_IF_EVIDENCE_EMPTY = True
GLOBAL_TIMEOUT_GUARD_SECONDS = 3
STEP_TIMEOUT_MIN_SECONDS = 1
DOC_TITLE_MAX_WORDS = 22
STRICT_RETRIEVAL_TRIGGER = True
ENABLE_HEURISTIC_DOC_GUESS = False
ENABLE_LAST_RESORT_FORCE = False

EN_STOPWORD_MINI = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "about",
}
EN_QUERY_WORD_RE = re.compile(r"^(?:who|what|where|when|which|whose|how|please|answer|question)$", re.IGNORECASE)
ZH_QUERY_WORD_RE = re.compile(r"^(?:请问|请回答|直接回答|答案|格式|这个|那个|其中|相关|通过|进行|可以|之间|包括)$")
ZH_PLACEHOLDER_RE = re.compile(r"^(?:某[\u4e00-\u9fff]|一(?:个|种|位))$")
FAILURE_SIGNAL_RE = re.compile(
    r"(?:"
    r"none of the provided|cannot(?:\s+be)?(?:\s+answered|\s+determine)?|can't\s+determine|"
    r"insufficient|not enough|no clear answer|无法确定|信息不足|证据不足|没有足够信息|根据现有证据无法"
    r")",
    re.IGNORECASE,
)
FAILURE_CONTEXT_RE = re.compile(
    r"(?:evidence|information|answer|determine|provided|search results|证据|信息|答案|回答|确定)",
    re.IGNORECASE,
)
VERBOSE_CUE_RE = re.compile(
    r"(?:根据|步骤|分析|首先|其次|because|therefore|based on|the answer is|final answer|答案(?:如下|是|为))",
    re.IGNORECASE,
)
YEAR_QUESTION_RE = re.compile(
    r"(?:\b(?:what|which|in which)\s+year\b|\byear\s+(?:was|is)\b|哪一年|哪年|年份|发射年份|出版年份|成立年份)",
    re.IGNORECASE,
)
PAGE_COUNT_RE = re.compile(
    r"(?:\bpage\s*count\b|\bnumber of pages\b|\btotal pages\b|\bhow many pages\b|页数|总页数|多少页)",
    re.IGNORECASE,
)
NUMERIC_QUESTION_RE = re.compile(
    r"(?:\bhow many\b|\bhow much\b|\bnumber of\b|\bcount of\b|\btotal(?:\s+number)?\b|多少|几(?:个|位|年|页)?|总数|数量)",
    re.IGNORECASE,
)

provider_failures: Dict[str, int] = {"iqs": 0, "tavily": 0, "serpapi": 0}
provider_disabled_until: Dict[str, float] = {"iqs": 0.0, "tavily": 0.0, "serpapi": 0.0}
rag_doc_cache: Dict[str, Dict[str, Any]] = {}
rag_doc_cache_order: List[str] = []


def _clean_env(name: str, default: str = "") -> str:
    val = os.getenv(name, default)
    if val is None:
        return default
    val = str(val).strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
        val = val[1:-1].strip()
    return val


def _clean_env_any(names: List[str], default: str = "") -> str:
    for name in names:
        val = _clean_env(name)
        if val:
            return val
    return default


def _iqs_api_key() -> str:
    return _clean_env_any(["IQS_API_KEY", "IQS_TOKEN", "IQS_BEARER_TOKEN", "IQS_API_TOKEN"])


def _tavily_api_key() -> str:
    return _clean_env_any(["TAVILY_API_KEY", "TAVILY_KEY", "TAVILY_API_TOKEN"])


def _serpapi_api_key() -> str:
    return _clean_env_any(["SERPAPI_API_KEY", "SERP_API_KEY", "SERPAPI_KEY"])


def _iqs_api_url() -> str:
    return _clean_env_any(["IQS_API_URL", "IQS_URL"], IQS_API_URL_DEFAULT)


def _time_left(deadline_ts: float) -> float:
    return max(0.0, float(deadline_ts) - time.time())


def _step_timeout(deadline_ts: float, default_timeout_s: float, min_timeout_s: float = STEP_TIMEOUT_MIN_SECONDS) -> float:
    left = _time_left(deadline_ts)
    if left <= min_timeout_s:
        return 0.0
    return min(float(default_timeout_s), max(float(min_timeout_s), left - 0.15))


def _as_int(raw: str, default: int, min_value: int, max_value: int) -> int:
    try:
        val = int(str(raw).strip())
        return max(min_value, min(max_value, val))
    except Exception:
        return default


def _truthy(value: Any) -> bool:
    v = str(value or "").strip().lower()
    return v in {"1", "true", "yes", "y", "on"}


def _sse_event(event_name: str, payload: Dict[str, Any]) -> str:
    data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event_name}\ndata: {data}\n\n"


def _sse_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


def _should_stream_response(payload: Dict[str, Any], request: FastAPIRequest = None) -> bool:
    if _truthy(payload.get("stream")):
        return True
    if request is None:
        return False
    try:
        if _truthy(request.query_params.get("stream")):
            return True
        accept = str(request.headers.get("accept", "")).lower()
        return "text/event-stream" in accept
    except Exception:
        return False


def _contains_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", str(text or "")))


def _question_tokens(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9\-\.]{1,}|[\u4e00-\u9fff]{2,}|\d{4}", str(text or ""))
    out: List[str] = []
    for t in tokens:
        clean = t.strip("-.")
        if clean:
            out.append(clean)
    return out


def _is_query_stopword(token: str) -> bool:
    t = str(token or "").strip()
    if not t:
        return True
    low = t.lower()
    if low in EN_STOPWORD_MINI:
        return True
    if EN_QUERY_WORD_RE.fullmatch(low):
        return True
    if ZH_QUERY_WORD_RE.fullmatch(t) or ZH_PLACEHOLDER_RE.fullmatch(t):
        return True
    if re.fullmatch(r"(?:[a-z]{1,2}|[A-Z]{1,2})", t):
        return True
    return False


def _question_focus_hint(question: str) -> str:
    q = str(question or "")
    if re.search(r"title of this paper|论文.*标题|paper title", q, flags=re.IGNORECASE):
        return "paper title"
    if re.search(r"documentary|纪录片", q, flags=re.IGNORECASE):
        return "documentary name"
    if re.search(r"podcast|播客", q, flags=re.IGNORECASE):
        return "podcast name"
    if re.search(r"publication|news publication|报纸|媒体|刊物", q, flags=re.IGNORECASE):
        return "publication name"
    if re.search(r"host star|主星", q, flags=re.IGNORECASE):
        return "host star"
    if re.search(r"founded|founding year|成立年份|创立年份|哪一年", q, flags=re.IGNORECASE):
        return "founded year"
    if _requires_english_name(q):
        return "official english name"
    return ""


def _extract_salient_terms(question: str, limit: int = 12) -> List[str]:
    q = str(question or "")
    terms: List[str] = []

    # Quoted spans usually carry key entities/titles.
    for pat in (r"[\"“”'‘’]([^\"“”'‘’]{3,100})[\"“”'‘’]", r"[（(]([^（）()]{3,80})[）)]"):
        for m in re.findall(pat, q):
            text = " ".join(str(m).split()).strip()
            if text and text.lower() != "question":
                terms.append(text)

    # Scientific and mixed tokens (e.g., MRC-5 / SLC7A11 / xCT).
    terms.extend(re.findall(r"\b[A-Za-z]{1,8}\d[A-Za-z0-9\-]{0,12}\b", q))
    terms.extend(re.findall(r"\b[A-Za-z]{2,10}-\d{1,5}\b", q))

    # Capitalized noun phrases.
    for m in re.findall(r"\b[A-Z][A-Za-z0-9&.'\-]{1,}(?:\s+[A-Z][A-Za-z0-9&.'\-]{1,}){0,4}\b", q):
        terms.append(m.strip())

    # Core tokens after stopword filtering.
    for t in _question_tokens(q):
        if not _is_query_stopword(t):
            terms.append(t)

    dedup: List[str] = []
    seen = set()
    for t in terms:
        key = str(t).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        dedup.append(str(t).strip())
        if len(dedup) >= max(1, int(limit)):
            break
    return dedup


def _is_long_question(question: str) -> bool:
    q = str(question or "")
    if len(q) >= LONG_QUESTION_CHAR_THRESHOLD:
        return True
    return len(_question_tokens(q)) >= LONG_QUESTION_TOKEN_THRESHOLD


def _normalize_answer(text: str) -> str:
    if not text:
        return "unknown"
    t = str(text).strip()
    t = re.sub(r"^```(?:json|text)?\s*", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"\s*```$", "", t).strip()
    t = t.strip('"').strip("'")
    t = t.replace("\r", " ").replace("\n", " ")
    t = " ".join(t.split())
    low = t.lower()
    if low in {"unknown", "未知", "无法确定", "不确定", "不知道", "无法回答"}:
        return "unknown"
    if re.fullmatch(r"[-+]?\d+(\.0+)?", t):
        try:
            t = str(int(float(t)))
        except Exception:
            pass
    return t if t else "unknown"


def _looks_like_tool_trace(text: str) -> bool:
    t = str(text or "").strip().lower()
    if not t:
        return False
    markers = (
        "<tool_call>",
        "</tool_call>",
        "tool_call",
        '"name": "iqs_search"',
        '"name": "tavily_search"',
        '"name": "serpapi_search"',
        "iqs_search(",
        "tavily_search(",
        "serpapi_search(",
    )
    return any(m in t for m in markers)


def _looks_like_failure_explanation(text: str) -> bool:
    t = str(text or "").strip().lower()
    if not t:
        return False
    if not FAILURE_SIGNAL_RE.search(t):
        return False
    return bool(FAILURE_CONTEXT_RE.search(t))


def _extract_answer_from_json_like(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""
    if not (raw.startswith("{") and raw.endswith("}")):
        return ""
    try:
        obj = json.loads(raw)
    except Exception:
        return ""
    if not isinstance(obj, dict):
        return ""
    for key in ("answer", "final_answer", "final", "output", "result"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _compact_answer(text: str) -> str:
    if _looks_like_tool_trace(text):
        return "unknown"

    json_answer = _extract_answer_from_json_like(text)
    if json_answer:
        text = json_answer

    t = _normalize_answer(text)
    if t == "unknown":
        return t
    t = re.sub(
        r"^(?:最后的答案|答案(?:是|为)?|最终答案|结论|新名字是|名称是|"
        r"the answer is|the name is|the english name(?: is)?|the chinese name(?: is)?|"
        r"answer(?: is)?|final answer)\s*[:：]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"^(?:the\s+english\s+name\s+of.+?\s+is|the\s+name\s+of.+?\s+is)\s+",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"^(?:based on (?:the )?(?:provided )?evidence[:,]?\s*)?(?:the\s+)?"
        r"(?:publication|podcast|documentary|paper|journal|host star|company|organization|institution|title|answer)"
        r"(?:\s+name)?\s+is\s*[:：]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"^(?:根据(?:提供的)?证据[，,:：\s]*)?(?:该|这个|此)?"
        r"(?:论文|播客|纪录片|期刊|机构|公司|组织|主星|标题|答案)"
        r"(?:名称)?(?:是|为)\s*[:：]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = t.splitlines()[0].strip()
    # Remove common list prefixes without destroying numeric answers like "1996".
    t = re.sub(r"^(?:[-*•]+|\d{1,2}[.)])\s+", "", t).strip()
    # Extract quoted span when model wraps final answer with narrative text.
    quoted = re.findall(r"[\"“”'‘’]([^\"“”'‘’]{2,140})[\"“”'‘’]", t)
    if quoted and len(t.split()) > 6:
        t = quoted[0].strip()
    t = re.sub(r"^[\"'“”‘’`]+|[\"'“”‘’`]+$", "", t).strip()
    t = t.strip("《》")
    t = re.sub(r"[。．.!！?？,，;；:：]+$", "", t).strip()
    if _looks_like_failure_explanation(t):
        return "unknown"
    low = t.lower()
    if low in {"unknown", "未知", "无法确定", "不确定", "不知道", "无法回答"}:
        return "unknown"
    if len(t) > MAX_ANSWER_CHARS:
        t = t[:MAX_ANSWER_CHARS].strip()
    return t or "unknown"


def _is_verbose_answer(text: str) -> bool:
    t = str(text or "")
    if len(t) > MAX_ANSWER_CHARS:
        return True
    if _looks_like_failure_explanation(t):
        return True
    if VERBOSE_CUE_RE.search(t):
        return True
    # Two or more sentence boundaries usually means explanation, not final entity answer.
    return len(re.findall(r"[。.!?！？;；]", t)) >= 2


def _is_overlong_name_like_answer(question: str, answer: str) -> bool:
    a = str(answer or "").strip()
    if not a or a.lower() == "unknown":
        return False
    if _requires_numeric_answer(question):
        return False

    if _question_is_english(question):
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'\\-]*", a)
        # Most expected answers are names/nouns/numbers; very long English phrases are likely hallucination.
        return len(words) >= 12

    if _contains_cjk(question):
        # Chinese answers are usually short entities; long sentence-like text is suspicious.
        cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", a))
        return cjk_chars >= 24

    return False


def _need_search_fallback(raw_text: str, compact_text: str) -> bool:
    c = str(compact_text or "").strip().lower()
    if not c or c == "unknown":
        return True
    if _looks_like_tool_trace(raw_text) or _looks_like_tool_trace(compact_text):
        return True
    if _looks_like_failure_explanation(raw_text) or _looks_like_failure_explanation(compact_text):
        return True

    uncertain_markers = (
        "unknown",
        "not sure",
        "i don't know",
        "cannot determine",
        "insufficient",
        "无法确定",
        "不确定",
        "不清楚",
        "未知",
        "需要更多信息",
    )
    r = str(raw_text or "").strip().lower()
    if any(m in r for m in uncertain_markers):
        return True
    if any(m in c for m in uncertain_markers):
        return True
    return False


def _is_fact_heavy_question(question: str) -> bool:
    q = str(question or "").strip()
    if not q:
        return False
    if _is_long_question(q):
        return True
    low = q.lower()
    markers = (
        "between",
        "inclusive",
        "as of",
        "in the same year",
        "first published",
        "what is the name",
        "which",
        "who is",
        "截至",
        "之间",
        "同一年",
        "发表于",
        "名称是什么",
        "请问",
    )
    hit = sum(1 for m in markers if m in low or m in q)
    return hit >= 2


def _is_placeholder_answer(answer: str) -> bool:
    a = str(answer or "").strip()
    low = a.lower()
    if not a:
        return True
    exact_bad = {
        "the name of the podcast",
        "name of the podcast",
        "the podcast name",
        "podcast name",
        "the name of the person",
        "the name of the company",
        "the answer",
        "答案",
        "播客名称",
        "该播客名称",
        "这个播客的名字",
    }
    if low in exact_bad or a in exact_bad:
        return True
    bad_prefix = (
        "the name of",
        "name of",
        "the title of",
        "title of",
        "the answer is",
        "answer:",
        "答案是",
        "答案为",
        "名称是",
    )
    if any(low.startswith(p) for p in bad_prefix):
        return True
    # If answer contains almost only generic words, treat as placeholder.
    if re.fullmatch(r"(the|a|an|name|title|of|podcast|person|company|organization|\s)+", low):
        return True
    return False


def _contains_uncertainty(text: str) -> bool:
    low = str(text or "").strip().lower()
    markers = (
        "unknown",
        "not sure",
        "cannot determine",
        "insufficient",
        "不确定",
        "无法确定",
        "信息不足",
        "证据不足",
    )
    return any(m in low for m in markers)


def _question_is_english(question: str) -> bool:
    q = str(question or "")
    en_chars = len(re.findall(r"[A-Za-z]", q))
    zh_chars = len(re.findall(r"[\u4e00-\u9fff]", q))
    if en_chars == 0 and zh_chars == 0:
        return False
    return en_chars > zh_chars * 2


def _requires_english_name(question: str) -> bool:
    q = str(question or "")
    low = q.lower()
    markers = (
        "英文名",
        "英文名称",
        "english name",
        "in english",
        "official english",
        "first and last english name",
        "请回答设备英文名",
        "请回答设备英文名称",
    )
    return any(m in q or m in low for m in markers)


def _requires_chinese_name(question: str) -> bool:
    q = str(question or "")
    low = q.lower()
    markers = ("中文名", "中文名称", "chinese name", "in chinese")
    return any(m in q or m in low for m in markers)


def _requires_numeric_answer(question: str) -> bool:
    q = str(question or "")
    low = q.lower()
    markers = (
        "直接回答数字",
        "只回答数字",
        "阿拉伯数字",
        "answer with arabic numerals",
        "answer with numerals",
    )
    return any(m in q or m in low for m in markers)


def _question_prefers_year(question: str) -> bool:
    q = str(question or "")
    return bool(YEAR_QUESTION_RE.search(q))


def _question_prefers_page_count(question: str) -> bool:
    q = str(question or "")
    return bool(PAGE_COUNT_RE.search(q))


def _question_likely_numeric(question: str) -> bool:
    if _requires_numeric_answer(question) or _question_prefers_year(question) or _question_prefers_page_count(question):
        return True
    q = str(question or "")
    return bool(NUMERIC_QUESTION_RE.search(q))


def _parse_english_number_words(text: str) -> int:
    raw = str(text or "").lower().replace("-", " ")
    tokens = re.findall(r"[a-z]+", raw)
    if not tokens:
        return -1

    units = {
        "zero": 0,
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
        "ten": 10,
        "eleven": 11,
        "twelve": 12,
        "thirteen": 13,
        "fourteen": 14,
        "fifteen": 15,
        "sixteen": 16,
        "seventeen": 17,
        "eighteen": 18,
        "nineteen": 19,
    }
    tens = {
        "twenty": 20,
        "thirty": 30,
        "forty": 40,
        "fifty": 50,
        "sixty": 60,
        "seventy": 70,
        "eighty": 80,
        "ninety": 90,
    }
    scales = {"hundred": 100, "thousand": 1000, "million": 1000000}
    valid = set(units) | set(tens) | set(scales) | {"and"}

    if not any(t in units or t in tens for t in tokens):
        return -1
    if any(t not in valid for t in tokens):
        return -1

    # Year-like style: "nineteen ninety six", "twenty sixteen"
    if len(tokens) >= 2 and tokens[0] in {"eighteen", "nineteen", "twenty"}:
        head = units.get(tokens[0], -1)
        tail = _parse_english_number_words(" ".join(tokens[1:]))
        if head > 0 and 0 <= tail <= 99:
            return head * 100 + tail

    total = 0
    current = 0
    for t in tokens:
        if t == "and":
            continue
        if t in units:
            current += units[t]
            continue
        if t in tens:
            current += tens[t]
            continue
        if t == "hundred":
            current = max(1, current) * 100
            continue
        scale = scales.get(t)
        if scale:
            total += max(1, current) * scale
            current = 0
            continue
        return -1
    value = total + current
    return value if value >= 0 else -1


def _parse_chinese_number_words(text: str) -> int:
    raw = str(text or "")
    if not raw:
        return -1
    digits_map = {
        "零": "0",
        "〇": "0",
        "一": "1",
        "二": "2",
        "两": "2",
        "三": "3",
        "四": "4",
        "五": "5",
        "六": "6",
        "七": "7",
        "八": "8",
        "九": "9",
    }
    # Year-like style: 二零一八 / 一九七八
    only_digits_style = re.findall(r"[零〇一二两三四五六七八九]{3,6}", raw)
    if only_digits_style:
        s = only_digits_style[0]
        converted = "".join(digits_map.get(ch, "") for ch in s)
        if converted.isdigit():
            return int(converted)

    part = re.search(r"[零〇一二两三四五六七八九十百千]{1,12}", raw)
    if not part:
        return -1
    s = part.group(0)
    unit_map = {"十": 10, "百": 100, "千": 1000}
    num_map = {k: int(v) for k, v in digits_map.items()}
    total = 0
    num = 0
    for ch in s:
        if ch in num_map:
            num = num_map[ch]
            continue
        unit = unit_map.get(ch)
        if not unit:
            return -1
        if num == 0:
            num = 1
        total += num * unit
        num = 0
    total += num
    return total if total >= 0 else -1


def _extract_spelled_number(answer: str) -> str:
    a = str(answer or "").strip()
    if not a:
        return ""
    en = _parse_english_number_words(a)
    if en >= 0:
        return str(en)
    zh = _parse_chinese_number_words(a)
    if zh >= 0:
        return str(zh)
    return ""


def _normalize_numeric_for_question(question: str, answer: str) -> str:
    a = str(answer or "")
    nums = re.findall(r"-?\d+(?:\.\d+)?", a.replace(",", ""))
    if not nums:
        spelled = _extract_spelled_number(a)
        if spelled:
            nums = [spelled]
        else:
            return _compact_answer(a)

    q = str(question or "")
    if _question_prefers_year(q):
        for n in nums:
            if re.fullmatch(r"(18|19|20)\d{2}", n):
                return n

    if _question_prefers_page_count(q):
        non_year = [n for n in nums if not re.fullmatch(r"(18|19|20)\d{2}", n)]
        if non_year:
            return _normalize_numeric(non_year[0])

    if _question_likely_numeric(q):
        non_year = [n for n in nums if not re.fullmatch(r"(18|19|20)\d{2}", n)]
        if non_year:
            return _normalize_numeric(non_year[0])

    return _normalize_numeric(nums[0])


def _target_language_by_question(question: str) -> str:
    # Explicit format requirement has highest priority.
    if _requires_english_name(question):
        return "en"
    if _requires_chinese_name(question):
        return "zh"

    # Default rule in competition: keep answer language aligned with question language.
    if _question_is_english(question):
        return "en"
    if _contains_cjk(question):
        return "zh"
    return "any"


def _extract_english_from_parentheses(answer: str) -> str:
    a = str(answer or "")
    # e.g. 玛丽·西格斯（Mary Sibley）
    matches = re.findall(r"[（(]\s*([A-Za-z][A-Za-z .,'\\-]{1,120})\s*[）)]", a)
    if matches:
        return matches[0].strip()
    return ""


def _extract_chinese_from_mixed(answer: str) -> str:
    a = str(answer or "")
    # keep text before first parenthesis as Chinese candidate
    left = re.split(r"[（(]", a)[0].strip()
    if _contains_cjk(left):
        return left
    # fallback: extract contiguous Chinese phrase
    zh = re.findall(r"[\u4e00-\u9fff·]{2,}", a)
    if zh:
        return zh[0].strip()
    return ""


def _normalize_numeric(answer: str) -> str:
    a = str(answer or "")
    nums = re.findall(r"-?\d+(?:\.\d+)?", a.replace(",", ""))
    if not nums:
        spelled = _extract_spelled_number(a)
        if spelled:
            nums = [spelled]
        else:
            # Keep best-effort textual answer rather than forcing unknown.
            return _compact_answer(a)
    # prefer year-like number when available
    for n in nums:
        if re.fullmatch(r"(18|19|20)\d{2}", n):
            return n
    n0 = nums[0]
    if re.fullmatch(r"-?\d+\.0+", n0):
        try:
            return str(int(float(n0)))
        except Exception:
            return n0
    return n0


def _apply_pair_format(question: str, answer: str) -> str:
    q = str(question or "")
    a = str(answer or "").strip()
    if not a:
        return a
    # Chinese pair format: 张三和李四
    if "形如：张三和李四" in q or "格式形如：张三和李四" in q:
        if "和" in a:
            return a
        parts = [p.strip() for p in re.split(r"[、,，;/；]|\\band\\b|&", a, flags=re.IGNORECASE) if p.strip()]
        if len(parts) >= 2:
            return f"{parts[0]}和{parts[1]}"
    # English first+last name
    if "first and last english name" in q.lower():
        if " " not in a and re.search(r"[a-z][A-Z]", a):
            a = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", a).strip()
        words = re.findall(r"[A-Za-z][A-Za-z'\\-]+", a)
        if len(words) >= 2:
            return f"{words[0]} {words[-1]}"
    return a


async def _llm_format_fix(question: str, candidate: str, target: str) -> str:
    if llm_instance is None:
        return _compact_answer(candidate)
    prompt = (
        "你是答案格式修正器，只做语言/格式修正，不补充新事实。\n"
        "输出必须是纯文本的最终答案，不要解释。\n"
        "若候选答案本身不是 unknown，请优先做翻译或格式整理，不要输出 unknown。\n\n"
        f"目标格式：{target}\n"
        f"问题：{question}\n"
        f"候选答案：{candidate}\n"
        "修正后答案："
    )
    try:
        resp = await asyncio.wait_for(llm_instance.ainvoke(prompt), timeout=FORMAT_FIX_TIMEOUT_SECONDS)
        return _compact_answer(str(getattr(resp, "content", "") or ""))
    except Exception:
        return _compact_answer(candidate)


async def _normalize_answer_by_question(question: str, answer: str) -> str:
    ans = _compact_answer(answer)
    if ans == "unknown":
        return "unknown"

    ans = _apply_pair_format(question, ans)

    if _requires_numeric_answer(question) or _question_likely_numeric(question):
        return _normalize_numeric_for_question(question, ans)

    target_lang = _target_language_by_question(question)

    if target_lang == "en":
        par_en = _extract_english_from_parentheses(ans)
        if par_en:
            ans = par_en
        if _contains_cjk(ans):
            fixed = await _llm_format_fix(question, ans, "English name")
            ans = fixed if fixed else ans
        if _contains_cjk(ans):
            # Best effort: extract English tokens if possible, otherwise keep original.
            words = re.findall(r"[A-Za-z][A-Za-z'\\-]+", str(ans))
            if len(words) >= 2:
                return _compact_answer(f"{words[0]} {words[-1]}")
            if words:
                return _compact_answer(" ".join(words[:4]))
            return _compact_answer(answer)
        return _compact_answer(ans)

    if target_lang == "zh":
        zh = _extract_chinese_from_mixed(ans)
        if zh:
            ans = zh
        if not _contains_cjk(ans):
            fixed = await _llm_format_fix(question, ans, "中文名称")
            ans = fixed if fixed else ans
        if not _contains_cjk(ans):
            # Best effort: keep candidate instead of forcing unknown.
            return _compact_answer(answer)
        return _compact_answer(ans)

    return _compact_answer(ans)


async def _verify_answer_conservative(question: str, candidate: str) -> str:
    cand = _compact_answer(candidate)
    if cand == "unknown":
        return "unknown"
    if llm_instance is None:
        return cand

    prompt = (
        "你是竞赛答案审查器。目标是减少幻觉。\n"
        "给定问题与候选答案，在没有外部检索条件下进行保守判断：\n"
        "只有当你对候选答案高度确定时输出 ACCEPT；否则输出 REJECT。\n"
        "仅输出一个词：ACCEPT 或 REJECT。\n\n"
        f"问题：{question}\n"
        f"候选答案：{cand}\n"
        "审查结论："
    )
    try:
        resp = await asyncio.wait_for(llm_instance.ainvoke(prompt), timeout=VERIFY_TIMEOUT_SECONDS)
        verdict = str(getattr(resp, "content", "") or "").strip().upper()
        if "ACCEPT" in verdict and "REJECT" not in verdict:
            return cand
        return "unknown"
    except Exception:
        return "unknown"


def _build_prompt(question: str) -> str:
    return (
        "你是竞赛答题助手。\n"
        "请尽量给出最可能且规范的最终答案，不要输出解释。\n"
        "若题目未声明特殊格式，答案语言必须与问题语言一致。\n"
        "只输出最终答案本体，不要解释，不要前后缀。\n"
        "中文题用中文答，英文题用英文答；若题目规定格式必须严格遵守。\n\n"
        f"问题：{question}\n"
        "最终答案："
    )


def _build_grounded_prompt(question: str, evidence: str) -> str:
    return (
        "你是竞赛答题助手。\n"
        "请仅基于提供的证据回答问题。\n"
        "证据不完整时，请给出最可能的单一答案，不要输出 unknown。\n"
        "若题目未声明特殊格式，答案语言必须与问题语言一致。\n"
        "只输出最终答案本体，不要解释，不要前后缀。\n"
        "中文题用中文答，英文题用英文答；若题目规定格式必须严格遵守。\n\n"
        f"问题：{question}\n\n"
        f"证据：\n{evidence}\n\n"
        "最终答案："
    )


def _build_best_effort_prompt(question: str, evidence: str, candidate: str) -> str:
    return (
        "你是竞赛答题助手（兜底模式）。\n"
        "必须输出一个单一最终答案，不能输出 unknown。\n"
        "若题目未声明特殊格式，答案语言必须与问题语言一致。\n"
        "只输出答案本体，不要解释。\n\n"
        f"问题：{question}\n\n"
        f"候选答案：{candidate or 'N/A'}\n\n"
        f"检索证据：\n{evidence or 'N/A'}\n\n"
        "最终答案："
    )


async def _force_best_effort_answer(
    question: str,
    evidence: str,
    candidate: str,
    timeout_s: float = FORCE_ANSWER_TIMEOUT_SECONDS,
) -> str:
    model = llm_hq_instance if llm_hq_instance is not None else llm_instance
    if model is None:
        return _compact_answer(candidate)
    try:
        resp = await asyncio.wait_for(
            model.ainvoke(_build_best_effort_prompt(question, evidence, candidate)),
            timeout=max(1.0, float(timeout_s)),
        )
        out = _compact_answer(str(getattr(resp, "content", "") or ""))
        if out == "unknown":
            out = _compact_answer(candidate)
        return out
    except Exception:
        return _compact_answer(candidate)


def _build_iqs_headers() -> dict:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    api_key = _iqs_api_key()
    if api_key:
        headers["Authorization"] = api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
    return headers


def _http_json_request(
    method: str,
    url: str,
    headers: Dict[str, str],
    timeout_s: int,
    payload: Dict[str, Any] = None,
) -> Dict[str, Any]:
    try:
        method = str(method or "GET").upper()
        req_url = url
        data = None
        req_headers = dict(headers or {})

        if method == "GET" and payload:
            sep = "&" if "?" in req_url else "?"
            req_url = f"{req_url}{sep}{urlencode(payload)}"
        elif payload is not None:
            req_headers["Content-Type"] = req_headers.get("Content-Type", "application/json")
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        req = Request(req_url, data=data, headers=req_headers, method=method)
        with urlopen(req, timeout=timeout_s) as resp:
            text = resp.read().decode("utf-8", errors="replace").strip()
        return json.loads(text) if text else {}
    except HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            detail = str(e)
        return {"error": f"http_{e.code}", "detail": detail}
    except URLError as e:
        return {"error": "url_error", "detail": str(e)}
    except json.JSONDecodeError as e:
        return {"error": "invalid_json", "detail": str(e)}
    except Exception as e:
        return {"error": "request_failed", "detail": str(e)}


def _pick_text(d: dict, keys: List[str]) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _normalize_doc(item: dict, source: str) -> dict:
    title = _pick_text(item, ["title", "name", "headline"])
    url = _pick_text(item, ["url", "link", "href", "source"])
    snippet = _pick_text(item, ["snippet", "description", "summary", "content", "text", "body"])
    snippet = " ".join(snippet.replace("\n", " ").split())
    if len(snippet) > 320:
        snippet = f"{snippet[:317]}..."
    return {
        "title": title,
        "url": url,
        "snippet": snippet,
        "source": source,
    }


def _extract_iqs_items(data: Any, top_k: int) -> List[dict]:
    containers: List[dict] = []
    if isinstance(data, list):
        containers = [x for x in data if isinstance(x, dict)]
    elif isinstance(data, dict):
        candidate_keys = ("results", "items", "data", "docs", "organic", "organic_results", "hits", "value")
        for key in candidate_keys:
            value = data.get(key)
            if isinstance(value, list):
                containers.extend([x for x in value if isinstance(x, dict)])
            elif isinstance(value, dict):
                inner = value.get("value") or value.get("items") or value.get("results")
                if isinstance(inner, list):
                    containers.extend([x for x in inner if isinstance(x, dict)])
        if not containers:
            for value in data.values():
                if isinstance(value, list) and value and isinstance(value[0], dict):
                    containers.extend([x for x in value if isinstance(x, dict)])

    cleaned: List[dict] = []
    for item in containers:
        doc = _normalize_doc(item, "iqs")
        if doc["title"] or doc["url"] or doc["snippet"]:
            cleaned.append(doc)
        if len(cleaned) >= top_k:
            break
    return cleaned


def _extract_tavily_items(data: Any, top_k: int) -> List[dict]:
    if not isinstance(data, dict):
        return []
    results = data.get("results")
    if not isinstance(results, list):
        return []

    cleaned: List[dict] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        norm = {
            "title": str(item.get("title", "")).strip(),
            "url": str(item.get("url", "")).strip(),
            "snippet": " ".join(str(item.get("content", "")).replace("\n", " ").split()),
            "source": "tavily",
        }
        if len(norm["snippet"]) > 320:
            norm["snippet"] = norm["snippet"][:317] + "..."
        if norm["title"] or norm["url"] or norm["snippet"]:
            cleaned.append(norm)
        if len(cleaned) >= top_k:
            break
    return cleaned


def _extract_serpapi_items(data: Any, top_k: int) -> List[dict]:
    if not isinstance(data, dict):
        return []

    cleaned: List[dict] = []

    answer_box = data.get("answer_box")
    if isinstance(answer_box, dict):
        ab = {
            "title": str(answer_box.get("title", "")).strip(),
            "url": str(answer_box.get("link", answer_box.get("source", ""))).strip(),
            "snippet": " ".join(
                str(
                    answer_box.get("snippet")
                    or answer_box.get("answer")
                    or answer_box.get("result")
                    or ""
                ).replace("\n", " ").split()
            ),
            "source": "serpapi",
        }
        if ab["title"] or ab["url"] or ab["snippet"]:
            cleaned.append(ab)

    organic = data.get("organic_results")
    if isinstance(organic, list):
        for item in organic:
            if not isinstance(item, dict):
                continue
            norm = {
                "title": str(item.get("title", "")).strip(),
                "url": str(item.get("link", "")).strip(),
                "snippet": " ".join(str(item.get("snippet", "")).replace("\n", " ").split()),
                "source": "serpapi",
            }
            if len(norm["snippet"]) > 320:
                norm["snippet"] = norm["snippet"][:317] + "..."
            if norm["title"] or norm["url"] or norm["snippet"]:
                cleaned.append(norm)
            if len(cleaned) >= top_k:
                break

    return cleaned[:top_k]


def _run_iqs_search_sync(query: str, top_k: int) -> List[dict]:
    payload = {"query": query, "numResults": top_k}
    resp = _http_json_request(
        method="POST",
        url=_iqs_api_url(),
        headers=_build_iqs_headers(),
        timeout_s=IQS_TIMEOUT_SECONDS,
        payload=payload,
    )
    if isinstance(resp, dict) and resp.get("error"):
        return []
    return _extract_iqs_items(resp, top_k)


def _run_tavily_search_sync(query: str, top_k: int) -> List[dict]:
    api_key = _tavily_api_key()
    if not api_key:
        return []
    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": top_k,
        "include_answer": False,
        "include_raw_content": False,
    }
    resp = _http_json_request(
        method="POST",
        url=TAVILY_API_URL,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout_s=TAVILY_TIMEOUT_SECONDS,
        payload=payload,
    )
    if isinstance(resp, dict) and resp.get("error"):
        return []
    return _extract_tavily_items(resp, top_k)


def _run_serpapi_search_sync(query: str, top_k: int) -> List[dict]:
    api_key = _serpapi_api_key()
    if not api_key:
        return []
    params = {
        "engine": "google",
        "q": query,
        "api_key": api_key,
        "num": top_k,
        "no_cache": "true",
    }
    resp = _http_json_request(
        method="GET",
        url=SERPAPI_API_URL,
        headers={"Accept": "application/json"},
        timeout_s=SERPAPI_TIMEOUT_SECONDS,
        payload=params,
    )
    if isinstance(resp, dict) and resp.get("error"):
        return []
    return _extract_serpapi_items(resp, top_k)


def _rewrite_queries(question: str) -> List[str]:
    q = str(question or "").strip()
    if not q:
        return []

    focus_hint = _question_focus_hint(q)
    queries: List[str] = []

    # Remove explicit answer-format constraints from search query body.
    stripped = re.split(
        r"(?:要求格式|请回答|直接回答|请只回答|answer with|please answer|respond with)",
        q,
        flags=re.IGNORECASE,
    )[0].strip(" ，。,:：;；")

    if _is_long_question(q):
        salient_terms = _extract_salient_terms(stripped or q, limit=max(8, LONG_QUERY_KEYWORD_LIMIT))
        if salient_terms:
            queries.append(" ".join(salient_terms[:LONG_QUERY_KEYWORD_LIMIT]).strip())

        tokens = [t for t in _question_tokens(stripped or q) if not _is_query_stopword(t)]
        if tokens:
            key_q = " ".join(tokens[:LONG_QUERY_KEYWORD_LIMIT]).strip()
            if key_q:
                queries.append(key_q)

        # Keep short tail constraint for multi-hop relation hints.
        tail = re.split(r"[?？。.!！]", q.strip())[-1].strip() or q.strip()
        tail = " ".join(tail.split())
        if tail:
            queries.append(tail[:120])
    else:
        queries.append(q)
        if stripped and stripped != q:
            queries.append(stripped)

        tokens = [t for t in _question_tokens(stripped or q) if not _is_query_stopword(t)]
        if tokens:
            key_q = " ".join(tokens[:10]).strip()
            if key_q:
                queries.append(key_q)

        salient_terms = _extract_salient_terms(stripped or q, limit=10)
        if salient_terms:
            queries.append(" ".join(salient_terms[:10]).strip())

    if focus_hint:
        base = queries[0] if queries else stripped or q
        queries.append(f"{base} {focus_hint}".strip())

    if not queries:
        queries = [q[:LONG_QUESTION_CHAR_THRESHOLD]]

    dedup: List[str] = []
    seen = set()
    for item in queries:
        cleaned = " ".join(str(item or "").split()).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        dedup.append(cleaned)
        if len(dedup) >= MAX_QUERY_REWRITES:
            break
    return dedup


def _build_decomposed_queries(question: str) -> List[str]:
    queries = _rewrite_queries(question)
    if not queries or not ENABLE_QUERY_DECOMPOSITION:
        return queries

    base = queries[0]
    q = str(question or "")
    extras: List[str] = []
    if re.search(r"founder|creator|author|president|ceo|创始人|作者|总统|主席|首席执行官", q, flags=re.IGNORECASE):
        extras.append(f"{base} founder")
    if re.search(r"company|organization|institution|club|school|公司|机构|组织|俱乐部|学校", q, flags=re.IGNORECASE):
        extras.append(f"{base} company")
    if re.search(r"year|when|date|published|founded|哪一年|年份|何时|什么时候|成立|发表", q, flags=re.IGNORECASE):
        extras.append(f"{base} year")
    if re.search(r"paper|journal|论文|期刊", q, flags=re.IGNORECASE):
        extras.append(f"{base} paper title")
    if re.search(r"podcast|播客", q, flags=re.IGNORECASE):
        extras.append(f"{base} podcast")
    if re.search(r"documentary|纪录片", q, flags=re.IGNORECASE):
        extras.append(f"{base} documentary")
    if re.search(r"publication|news publication|报纸|媒体|刊物", q, flags=re.IGNORECASE):
        extras.append(f"{base} publication")
    if re.search(r"host star|主星", q, flags=re.IGNORECASE):
        extras.append(f"{base} host star")
    if _requires_english_name(q):
        extras.append(f"{base} official english name")
    if _requires_chinese_name(q):
        extras.append(f"{base} 中文名")

    # Slightly favor constraints near question tail for multi-hop questions.
    tail = re.split(r"[?？。.!！]", q.strip())[-1].strip()
    if tail and tail != base:
        extras.append(tail[:100])

    dedup: List[str] = []
    seen = set()
    for item in queries + extras:
        k = item.strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        dedup.append(item.strip())
        if len(dedup) >= max(1, min(MAX_QUERY_REWRITES, 1 + MAX_DECOMPOSE_EXTRA_QUERIES)):
            break
    return dedup


def _select_providers(question: str) -> List[str]:
    providers: List[str] = []
    now = time.time()

    def _available(name: str) -> bool:
        return now >= provider_disabled_until.get(name, 0.0)

    # Accuracy-first strategy: prefer IQS + Tavily + SerpAPI when available.
    if iqs_enabled and _available("iqs"):
        providers.append("iqs")

    if tavily_enabled and _available("tavily"):
        providers.append("tavily")

    if serpapi_enabled and _available("serpapi"):
        providers.append("serpapi")

    return providers[:MAX_PROVIDER_PER_QUESTION]


def _mark_provider_result(provider: str, docs: List[dict]) -> None:
    if provider not in provider_failures:
        return
    if docs:
        provider_failures[provider] = 0
        return
    # Empty results are normal for some hard queries; do not penalize provider health.
    return


def _tokenize(text: str) -> set:
    return {t for t in re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}", str(text or "").lower()) if t}


def _domain(url: str) -> str:
    m = re.match(r"https?://([^/]+)", str(url or "").strip().lower())
    return m.group(1) if m else ""


def _overlap_token_count(question: str, text: str) -> int:
    q_tokens = _tokenize(question)
    t_tokens = _tokenize(text)
    if not q_tokens or not t_tokens:
        return 0
    return len(q_tokens & t_tokens)


def _score_doc(question: str, doc: dict) -> float:
    q_tokens = _tokenize(question)
    title = str(doc.get("title", "") or "")
    snippet = str(doc.get("snippet", "") or "")
    d_text = f"{title} {snippet}"
    d_tokens = _tokenize(d_text)
    t_tokens = _tokenize(title)
    if not q_tokens:
        return 0.0

    overlap = len(q_tokens & d_tokens) / max(1, len(q_tokens))
    title_overlap = len(q_tokens & t_tokens) / max(1, len(q_tokens))
    year_bonus = 0.12 if re.search(r"\b(19|20)\d{2}\b", question) and re.search(r"\b(19|20)\d{2}\b", d_text) else 0.0

    domain = _domain(doc.get("url", ""))
    trust_bonus = 0.0
    if any(k in domain for k in (".gov", ".edu", "britannica", "official")):
        trust_bonus = 0.1

    source_bonus = 0.03 if doc.get("source") in {"iqs", "tavily", "serpapi"} else 0.0
    # Weighted formula aligned with tech report:
    # score = overlap * 0.5 + title_overlap * 0.3 + trust_bonus + year_bonus + source_bonus
    return overlap * 0.5 + title_overlap * 0.3 + year_bonus + trust_bonus + source_bonus


def _dedup_docs(docs: List[dict]) -> List[dict]:
    out: List[dict] = []
    seen = set()
    for d in docs:
        key = (
            str(d.get("url", "")).strip().lower(),
            str(d.get("title", "")).strip().lower(),
            str(d.get("snippet", "")).strip()[:80].lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def _rerank_docs(question: str, docs: List[dict], top_n: int) -> List[dict]:
    scored = []
    for d in docs:
        d2 = dict(d)
        d2["_score"] = _score_doc(question, d)
        scored.append(d2)
    scored.sort(key=lambda x: x.get("_score", 0.0), reverse=True)
    return scored[:top_n]


def _filter_docs_by_overlap(question: str, docs: List[dict], min_overlap_tokens: int = MIN_DOC_OVERLAP_TOKENS) -> List[dict]:
    if not docs:
        return docs
    filtered = []
    for d in docs:
        text = f"{d.get('title', '')} {d.get('snippet', '')}"
        if _overlap_token_count(question, text) >= min_overlap_tokens:
            filtered.append(d)
    return filtered if filtered else docs


def _extract_entities_from_docs(question: str, docs: List[dict], max_entities: int = ITERATIVE_ENTITY_MAX) -> List[str]:
    if not docs or max_entities <= 0:
        return []

    q_low = str(question or "").lower()
    counts: Dict[str, int] = {}

    def _add(entity: str, weight: int = 1) -> None:
        e = str(entity or "").strip(" \t\r\n,.;:()[]{}\"'")
        if len(e) < 2:
            return
        if re.fullmatch(r"\d+", e):
            return
        if e.lower() in {"unknown", "wikipedia", "google", "iqs"}:
            return
        if e.lower() in q_low:
            return
        counts[e] = counts.get(e, 0) + weight

    seed_docs = docs[:ITERATIVE_SEED_DOCS]
    for d in seed_docs:
        title = str(d.get("title", "") or "")
        snippet = str(d.get("snippet", "") or "")

        # English proper noun phrases (1-4 words)
        for m in re.findall(r"\b[A-Z][A-Za-z0-9&.'\-]{1,}(?:\s+[A-Z][A-Za-z0-9&.'\-]{1,}){0,3}\b", title):
            _add(m, weight=2)
        for m in re.findall(r"\b[A-Z][A-Za-z0-9&.'\-]{1,}(?:\s+[A-Z][A-Za-z0-9&.'\-]{1,}){0,3}\b", snippet):
            _add(m, weight=1)

        # Chinese entity-like spans
        for m in re.findall(r"[\u4e00-\u9fff·]{2,12}", title):
            _add(m, weight=2)
        for m in re.findall(r"[\u4e00-\u9fff·]{2,12}", snippet):
            _add(m, weight=1)

    ranked = sorted(counts.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)
    return [k for k, _ in ranked[:max_entities]]


def _build_evidence_from_docs(docs: List[dict], max_items: int = EVIDENCE_MAX_ITEMS) -> str:
    lines: List[str] = []
    for idx, d in enumerate(docs[:max_items], start=1):
        source = str(d.get("source", "")).strip() or "search"
        title = str(d.get("title", "")).strip()
        snippet = str(d.get("snippet", "")).strip()
        url = str(d.get("url", "")).strip()
        piece = " | ".join([p for p in [title, snippet, url] if p])
        if piece:
            lines.append(f"[{idx}][{source}] {piece}")

    text = "\n".join(lines).strip()
    if len(text) > EVIDENCE_MAX_CHARS:
        text = text[:EVIDENCE_MAX_CHARS]
    return text


async def _sanitize_answer(question: str, candidate: str, timeout_s: float = SANITIZE_TIMEOUT_SECONDS) -> str:
    if llm_instance is None:
        return _compact_answer(candidate)
    prompt = (
        "你是答案清洗器。请从候选文本中抽取最终答案本体。\n"
        "只输出答案，不要解释；若无法抽取，输出 unknown。\n\n"
        f"问题：{question}\n"
        f"候选文本：{candidate}\n"
        "最终答案："
    )
    try:
        resp = await asyncio.wait_for(llm_instance.ainvoke(prompt), timeout=max(1.0, float(timeout_s)))
        content = str(getattr(resp, "content", "") or "")
        return _compact_answer(content)
    except Exception:
        return _compact_answer(candidate)


def _should_sanitize_candidate(question: str, candidate: str) -> bool:
    c = str(candidate or "").strip()
    if not c or c.lower() == "unknown":
        return False
    if _is_verbose_answer(c):
        return True
    if _looks_like_tool_trace(c) or _looks_like_failure_explanation(c):
        return True
    if re.search(r"(?:^|[\s:])(?:the answer is|答案是|答案为)\b", c, flags=re.IGNORECASE):
        return True
    if _question_is_english(question):
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'\\-]*", c)
        return len(words) >= 10
    if _contains_cjk(question):
        return len(re.findall(r"[\u4e00-\u9fff]", c)) >= 20
    return False


def _is_valid_answer_candidate(question: str, answer: str) -> bool:
    a = _compact_answer(answer)
    if a == "unknown":
        return False
    if _looks_like_tool_trace(a) or _looks_like_failure_explanation(a):
        return False
    if _is_placeholder_answer(a):
        return False
    if (_requires_numeric_answer(question) or _question_likely_numeric(question)) and not re.search(r"-?\d", a):
        # Allow spelled numbers if we can normalize them.
        if not _extract_spelled_number(a):
            return False
    return True


def _question_expects_title_like(question: str) -> bool:
    q = str(question or "")
    return bool(
        re.search(
            r"title of|name of the (?:podcast|documentary|publication|paper)|"
            r"论文.*标题|播客.*名称|纪录片.*名称|刊物.*名称|期刊.*名称",
            q,
            flags=re.IGNORECASE,
        )
    )


def _question_expects_host_star(question: str) -> bool:
    q = str(question or "")
    return bool(re.search(r"host star|主星", q, flags=re.IGNORECASE))


def _clean_doc_title(title: str) -> str:
    t = str(title or "").strip()
    if not t:
        return ""
    t = re.sub(
        r"\s*[-–—|]\s*(?:Wikipedia|Britannica|official.*|YouTube|X|Twitter|Facebook|LinkedIn)$",
        "",
        t,
        flags=re.IGNORECASE,
    ).strip()
    t = re.sub(r"\s*\|\s*[^|]{1,40}$", "", t).strip()
    t = re.sub(r"\s*-\s*[^-]{1,40}$", "", t).strip()
    return t


def _extract_host_star_from_text(text: str) -> str:
    s = str(text or "")
    if not s:
        return ""
    patterns = [
        r"host star(?:\s+is|\s*:)?\s*([A-Z][A-Za-z0-9\-\s]{1,36})",
        r"orbiting\s+(?:a|an|the)?\s*([A-Z][A-Za-z0-9\-\s]{1,36})\s*(?:red dwarf|star)",
    ]
    for p in patterns:
        m = re.search(p, s, flags=re.IGNORECASE)
        if not m:
            continue
        cand = " ".join(m.group(1).split()).strip(" ,.;:()[]")
        if not cand:
            continue
        if len(cand.split()) > 5:
            continue
        if cand.lower() in {"red dwarf", "dwarf star", "star"}:
            continue
        return cand
    return ""


def _extract_title_like_from_text(text: str) -> str:
    s = str(text or "")
    if not s:
        return ""
    zh_quoted = re.findall(r"《([^》]{2,140})》", s)
    for q in zh_quoted:
        cand = " ".join(q.split()).strip()
        if 1 <= len(cand.split()) <= DOC_TITLE_MAX_WORDS and not _looks_like_failure_explanation(cand):
            return cand
    quoted = re.findall(r"[\"“”'‘’]([^\"“”'‘’]{3,140})[\"“”'‘’]", s)
    for q in quoted:
        cand = " ".join(q.split()).strip()
        if 2 <= len(cand.split()) <= DOC_TITLE_MAX_WORDS and not _looks_like_failure_explanation(cand):
            return cand

    m = re.search(r"(?:title|titled)\s*[:：]?\s*([A-Z][^.;\n]{3,160})", s, flags=re.IGNORECASE)
    if m:
        cand = " ".join(m.group(1).split()).strip()
        if 2 <= len(cand.split()) <= DOC_TITLE_MAX_WORDS:
            return cand
    return ""


def _best_guess_from_docs(question: str, docs: List[dict], evidence_text: str = "") -> str:
    if _requires_numeric_answer(question) or _question_likely_numeric(question):
        text = evidence_text or " ".join(
            f"{d.get('title', '')} {d.get('snippet', '')}" for d in (docs or [])[:3]
        )
        return _normalize_numeric_for_question(question, text)

    expect_host_star = _question_expects_host_star(question)
    expect_title_like = _question_expects_title_like(question)

    for d in docs or []:
        title = _clean_doc_title(str(d.get("title", "") or ""))
        snippet = str(d.get("snippet", "") or "").strip()

        if expect_host_star:
            host = _extract_host_star_from_text(f"{title}. {snippet}")
            host = _compact_answer(host)
            if host != "unknown" and not _looks_like_tool_trace(host):
                return host

        if expect_title_like:
            t_like = _extract_title_like_from_text(title) or _extract_title_like_from_text(snippet)
            t_like = _compact_answer(t_like)
            if t_like != "unknown" and not _is_placeholder_answer(t_like):
                return t_like

        if not title:
            continue
        if len(re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{1,}", title)) > DOC_TITLE_MAX_WORDS:
            continue
        c = _compact_answer(title)
        if c != "unknown" and not _looks_like_tool_trace(c) and not _is_placeholder_answer(c):
            return c

    if evidence_text:
        if expect_host_star:
            host = _extract_host_star_from_text(evidence_text)
            host = _compact_answer(host)
            if host != "unknown":
                return host

        if expect_title_like:
            t_like = _extract_title_like_from_text(evidence_text)
            t_like = _compact_answer(t_like)
            if t_like != "unknown" and not _is_placeholder_answer(t_like):
                return t_like

        first = evidence_text.splitlines()[0] if evidence_text.splitlines() else ""
        first = re.sub(r"^\[\d+\]\[[^\]]+\]\s*", "", first).strip()
        first = first.split(" | ")[0].strip()
        c = _compact_answer(first)
        if c != "unknown":
            return c

    return "unknown"


async def _finalize_candidate(
    question: str,
    raw_text: str,
    sanitize_timeout_s: float = SANITIZE_TIMEOUT_SECONDS,
) -> str:
    if _looks_like_tool_trace(raw_text):
        return "unknown"

    candidate = _compact_answer(raw_text)
    if candidate == "unknown":
        return "unknown"
    if _looks_like_tool_trace(candidate) or _looks_like_failure_explanation(candidate):
        return "unknown"
    if _contains_uncertainty(raw_text) or _is_placeholder_answer(candidate):
        return "unknown"

    if sanitize_timeout_s > 0 and _should_sanitize_candidate(question, candidate):
        cleaned = await _sanitize_answer(question, candidate, timeout_s=sanitize_timeout_s)
        if cleaned != "unknown":
            candidate = cleaned

    candidate = await _normalize_answer_by_question(question, candidate)
    if not _is_valid_answer_candidate(question, candidate):
        return "unknown"
    return candidate


async def _run_provider_async(provider: str, query: str, top_k: int) -> List[dict]:
    def _run() -> List[dict]:
        if provider == "iqs":
            return _run_iqs_search_sync(query, top_k)
        if provider == "tavily":
            return _run_tavily_search_sync(query, top_k)
        if provider == "serpapi":
            return _run_serpapi_search_sync(query, top_k)
        return []

    return await asyncio.to_thread(_run)


async def _iterative_retrieve_by_entities(question: str, seed_docs: List[dict], providers: List[str]) -> List[dict]:
    if not ENABLE_ITERATIVE_RETRIEVAL:
        return []
    entities = _extract_entities_from_docs(question, seed_docs, max_entities=ITERATIVE_ENTITY_MAX)
    if not entities:
        return []

    selected_providers = (providers or [])[:max(1, ITERATIVE_PROVIDER_LIMIT)]
    if not selected_providers:
        return []

    tasks = []
    task_meta = []
    for provider in selected_providers:
        for ent in entities:
            tasks.append(
                asyncio.wait_for(
                    _run_provider_async(provider, ent, SEARCH_TOPK_PER_PROVIDER),
                    timeout=PROVIDER_TASK_TIMEOUT_SECONDS,
                )
            )
            task_meta.append(provider)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    docs: List[dict] = []
    for provider, r in zip(task_meta, results):
        if isinstance(r, Exception):
            _mark_provider_result(provider, [])
            continue
        if isinstance(r, list):
            if r:
                _mark_provider_result(provider, r)
                docs.extend(r)
            continue
        _mark_provider_result(provider, [])
    return _dedup_docs(docs)


async def _retrieve_docs(question: str) -> List[dict]:
    cached = _rag_cache_get(question)
    if cached:
        return cached

    providers = _select_providers(question)
    if not providers:
        return []

    queries = _build_decomposed_queries(question)
    if not queries:
        return []

    tasks = []
    task_meta = []
    for provider in providers:
        for q in queries:
            tasks.append(
                asyncio.wait_for(
                    _run_provider_async(provider, q, SEARCH_TOPK_PER_PROVIDER),
                    timeout=PROVIDER_TASK_TIMEOUT_SECONDS,
                )
            )
            task_meta.append(provider)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    docs: List[dict] = []
    for provider, r in zip(task_meta, results):
        if isinstance(r, Exception):
            _mark_provider_result(provider, [])
            continue
        if isinstance(r, list):
            if r:
                _mark_provider_result(provider, r)
                docs.extend(r)
            continue
        _mark_provider_result(provider, [])

    docs = _dedup_docs(docs)
    docs = _filter_docs_by_overlap(question, docs, min_overlap_tokens=MIN_DOC_OVERLAP_TOKENS)
    ranked = _rerank_docs(question, docs, top_n=RERANK_TOPN)

    # Iterative retrieval: Search -> Entity -> Search.
    extra_docs = await _iterative_retrieve_by_entities(question, ranked, providers)
    if extra_docs:
        merged = _dedup_docs(ranked + extra_docs)
        merged = _filter_docs_by_overlap(question, merged, min_overlap_tokens=MIN_DOC_OVERLAP_TOKENS)
        ranked = _rerank_docs(question, merged, top_n=RERANK_TOPN)

    _rag_cache_set(question, ranked)
    return ranked


async def _ask_hq(prompt: str, timeout_s: float = HQ_CALL_TIMEOUT_SECONDS) -> str:
    if llm_hq_instance is None:
        return "unknown"
    try:
        resp = await asyncio.wait_for(llm_hq_instance.ainvoke(prompt), timeout=max(1.0, float(timeout_s)))
        return _compact_answer(str(getattr(resp, "content", "") or ""))
    except Exception:
        return "unknown"


@tool("iqs_search")
def iqs_search(query: str, top_k: int = 5) -> str:
    """Search IQS and return compact JSON evidence for factual QA."""
    q = str(query or "").strip()
    if not q:
        return json.dumps({"error": "empty_query", "results": []}, ensure_ascii=False)
    k = _as_int(str(top_k), default=5, min_value=1, max_value=10)
    docs = _run_iqs_search_sync(q, k)
    return json.dumps({"query": q, "results": docs}, ensure_ascii=False)


@tool("tavily_search")
def tavily_search(query: str, top_k: int = 5) -> str:
    """Search Tavily and return compact JSON evidence for factual QA."""
    q = str(query or "").strip()
    if not q:
        return json.dumps({"error": "empty_query", "results": []}, ensure_ascii=False)
    k = _as_int(str(top_k), default=5, min_value=1, max_value=10)
    docs = _run_tavily_search_sync(q, k)
    return json.dumps({"query": q, "results": docs}, ensure_ascii=False)


@tool("serpapi_search")
def serpapi_search(query: str, top_k: int = 5) -> str:
    """Search SerpAPI Google and return compact JSON evidence for factual QA."""
    q = str(query or "").strip()
    if not q:
        return json.dumps({"error": "empty_query", "results": []}, ensure_ascii=False)
    k = _as_int(str(top_k), default=5, min_value=1, max_value=10)
    docs = _run_serpapi_search_sync(q, k)
    return json.dumps({"query": q, "results": docs}, ensure_ascii=False)


def _parse_question_text(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "question" in obj:
            return str(obj["question"]).strip()
    except Exception:
        pass
    return text


def _rag_cache_key(question: str) -> str:
    return re.sub(r"\s+", " ", str(question or "").strip().lower())


def _rag_cache_get(question: str) -> List[dict]:
    if RAG_CACHE_TTL_SECONDS <= 0:
        return []
    key = _rag_cache_key(question)
    if not key:
        return []
    item = rag_doc_cache.get(key)
    if not item:
        return []
    ts = float(item.get("ts", 0.0))
    if time.time() - ts > RAG_CACHE_TTL_SECONDS:
        rag_doc_cache.pop(key, None)
        try:
            rag_doc_cache_order.remove(key)
        except Exception:
            pass
        return []
    docs = item.get("docs", [])
    return docs if isinstance(docs, list) else []


def _rag_cache_set(question: str, docs: List[dict]) -> None:
    if RAG_CACHE_TTL_SECONDS <= 0:
        return
    key = _rag_cache_key(question)
    if not key:
        return
    rag_doc_cache[key] = {"ts": time.time(), "docs": docs or []}
    try:
        rag_doc_cache_order.remove(key)
    except Exception:
        pass
    rag_doc_cache_order.append(key)
    while len(rag_doc_cache_order) > RAG_CACHE_MAX_ITEMS:
        old_key = rag_doc_cache_order.pop(0)
        rag_doc_cache.pop(old_key, None)


def _build_react_prompt(question: str) -> str:
    return (
        "你是竞赛答题助手（ReAct检索模式）。\n"
        "优先调用可用搜索工具进行事实核验，再给出最终答案。\n"
        "最终输出必须是单一答案本体，不要解释，不要前后缀。\n"
        "若题目未声明特殊格式，答案语言与问题语言一致。\n"
        "若题目规定格式，必须严格遵守。\n\n"
        f"问题：{question}\n"
        "最终答案："
    )


def _extract_agent_answer_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, AIMessage):
        return str(getattr(result, "content", "") or "")
    if isinstance(result, dict):
        messages = result.get("messages")
        if isinstance(messages, list):
            for m in reversed(messages):
                if isinstance(m, AIMessage):
                    text = str(getattr(m, "content", "") or "")
                    if text.strip():
                        return text
                if isinstance(m, dict):
                    role = str(m.get("role", "")).lower()
                    if role in {"assistant", "ai"}:
                        text = str(m.get("content", "") or "")
                        if text.strip():
                            return text
        output = result.get("output")
        if isinstance(output, str):
            return output
    return str(getattr(result, "content", "") or "")


async def _ask_react(question: str, timeout_s: float = REACT_CALL_TIMEOUT_SECONDS) -> str:
    if chat_agent is None:
        return "unknown"
    try:
        result = await asyncio.wait_for(
            chat_agent.ainvoke({"messages": [HumanMessage(content=_build_react_prompt(question))]}),
            timeout=max(1.0, float(timeout_s)),
        )
        text = _extract_agent_answer_text(result)
        if _looks_like_tool_trace(text):
            return "unknown"
        return _compact_answer(text)
    except Exception:
        return "unknown"


def _extract_question_from_msgs(msgs: List[BaseMessage]) -> str:
    for m in reversed(msgs or []):
        if isinstance(m, HumanMessage):
            content = getattr(m, "content", "")
            if isinstance(content, str):
                q = _parse_question_text(content)
                if q:
                    return q
            elif isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("text"):
                        parts.append(str(item["text"]))
                q = _parse_question_text(" ".join(parts))
                if q:
                    return q
    return ""


async def _ask(question: str) -> str:
    question = str(question or "").strip()
    if not question or llm_instance is None:
        return "unknown"

    deadline = time.time() + max(8.0, float(ASK_HARD_TIMEOUT_SECONDS - GLOBAL_TIMEOUT_GUARD_SECONDS))
    direct_answer = "unknown"
    direct_raw = ""
    evidence_text = ""
    retrieved_docs: List[dict] = []

    llm_ok = True

    # Step 1: prioritize direct LLM answer.
    first_timeout = _step_timeout(deadline, LLM_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
    if first_timeout > 0:
        try:
            resp = await asyncio.wait_for(
                llm_instance.ainvoke(_build_prompt(question)),
                timeout=first_timeout,
            )
            direct_raw = str(getattr(resp, "content", "") or "")
            direct_answer = await _finalize_candidate(
                question,
                direct_raw,
                sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
            )

            # For hard factual questions, run a conservative acceptance gate.
            if direct_answer != "unknown" and CONSERVATIVE_VERIFY_ENABLED and _is_fact_heavy_question(question):
                direct_answer = await _verify_answer_conservative(question, direct_answer)
        except Exception:
            direct_answer = "unknown"
            llm_ok = False
    else:
        llm_ok = False

    # For English unknown cases, use a stronger model before retrieval.
    if direct_answer == "unknown" and llm_hq_instance is not None and _question_is_english(question):
        hq_timeout = _step_timeout(deadline, HQ_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
        if hq_timeout > 0:
            hq_direct_raw = await _ask_hq(_build_prompt(question), timeout_s=hq_timeout)
            hq_direct = await _finalize_candidate(
                question,
                hq_direct_raw,
                sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
            )
            if hq_direct != "unknown":
                direct_answer = hq_direct
                llm_ok = True

    if not ENABLE_SEARCH_FALLBACK:
        if _is_valid_answer_candidate(question, direct_answer):
            return direct_answer
        direct_fallback = _compact_answer(direct_raw)
        if _is_valid_answer_candidate(question, direct_fallback):
            normalized = await _normalize_answer_by_question(question, direct_fallback)
            if _is_valid_answer_candidate(question, normalized):
                return normalized
        return "unknown"

    # Stable-accuracy mode: keep direct LLM output when valid, retrieve only on clear failure.
    if _is_valid_answer_candidate(question, direct_answer):
        return direct_answer

    need_retrieval = (not llm_ok) or direct_answer == "unknown" or (not _is_valid_answer_candidate(question, direct_answer))
    if not STRICT_RETRIEVAL_TRIGGER:
        need_retrieval = need_retrieval or _need_search_fallback(direct_raw, direct_answer) or _is_overlong_name_like_answer(
            question, direct_answer
        ) or (
            FORCE_RETRIEVAL_ON_COMPLEX_QUESTION
            and (_is_fact_heavy_question(question) or _is_long_question(question))
        )

    if not need_retrieval:
        return "unknown"

    # Step 1.5: ReAct reasoning with tools on hard questions.
    use_react = (
        ENABLE_REACT_REASONING
        and chat_agent is not None
        and (
            (not REACT_ONLY_ON_HARD_QUESTION)
            or _is_fact_heavy_question(question)
            or _is_long_question(question)
        )
    )
    if use_react:
        react_timeout = _step_timeout(deadline, REACT_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
        if react_timeout > 0:
            react_raw = await _ask_react(question, timeout_s=react_timeout)
            react_answer = await _finalize_candidate(
                question,
                react_raw,
                sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
            )
            if _is_valid_answer_candidate(question, react_answer):
                return react_answer

    # Step 2: fallback to retrieval only when direct answer is missing/uncertain.
    try:
        search_timeout = _step_timeout(deadline, SEARCH_BUDGET_SECONDS, min_timeout_s=2)
        if search_timeout <= 0:
            raise TimeoutError("search budget exhausted")

        retrieved_docs = await asyncio.wait_for(_retrieve_docs(question), timeout=search_timeout)
        evidence = _build_evidence_from_docs(retrieved_docs)
        evidence_text = evidence

        if evidence:
            grounded_timeout = _step_timeout(deadline, LLM_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
            if grounded_timeout > 0:
                resp = await asyncio.wait_for(
                    llm_instance.ainvoke(_build_grounded_prompt(question, evidence)),
                    timeout=grounded_timeout,
                )
                grounded_raw = str(getattr(resp, "content", "") or "")
                grounded = await _finalize_candidate(
                    question,
                    grounded_raw,
                    sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
                )
                if _is_valid_answer_candidate(question, grounded):
                    return grounded

            # Primary model failed on evidence; escalate to stronger model.
            if llm_hq_instance is not None:
                hq_timeout = _step_timeout(deadline, HQ_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
                if hq_timeout > 0:
                    hq_grounded_raw = await _ask_hq(_build_grounded_prompt(question, evidence), timeout_s=hq_timeout)
                    hq_grounded = await _finalize_candidate(
                        question,
                        hq_grounded_raw,
                        sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
                    )
                    if _is_valid_answer_candidate(question, hq_grounded):
                        return hq_grounded
        else:
            # If retrieval returned no evidence, prefer keeping a direct LLM answer over unknown.
            if USE_DIRECT_LLM_IF_EVIDENCE_EMPTY:
                if _is_valid_answer_candidate(question, direct_answer):
                    return direct_answer
                direct_candidate = _compact_answer(direct_raw)
                if _is_valid_answer_candidate(question, direct_candidate):
                    normalized_direct = await _normalize_answer_by_question(question, direct_candidate)
                    if _is_valid_answer_candidate(question, normalized_direct):
                        return normalized_direct
    except Exception:
        pass

    # Retrieval path failed; final strong-model fallback.
    if direct_answer == "unknown" and llm_hq_instance is not None:
        hq_timeout = _step_timeout(deadline, HQ_CALL_TIMEOUT_SECONDS, min_timeout_s=2)
        if hq_timeout > 0:
            hq_direct_raw = await _ask_hq(_build_prompt(question), timeout_s=hq_timeout)
            hq_direct = await _finalize_candidate(
                question,
                hq_direct_raw,
                sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
            )
            if _is_valid_answer_candidate(question, hq_direct):
                return hq_direct

    # Retrieval did not improve; keep direct answer if available.
    if _is_valid_answer_candidate(question, direct_answer):
        return direct_answer

    if FORCE_BEST_EFFORT_ANSWER:
        force_timeout = _step_timeout(deadline, FORCE_ANSWER_TIMEOUT_SECONDS, min_timeout_s=1)
        if force_timeout > 0:
            forced_raw = await _force_best_effort_answer(
                question,
                evidence_text,
                direct_raw,
                timeout_s=force_timeout,
            )
            forced = await _finalize_candidate(
                question,
                forced_raw,
                sanitize_timeout_s=_step_timeout(deadline, SANITIZE_TIMEOUT_SECONDS, min_timeout_s=0.6),
            )
            if _is_valid_answer_candidate(question, forced):
                return forced

    # Final non-unknown fallback from direct/model output or top evidence title.
    direct_fallback = _compact_answer(direct_raw)
    if _is_valid_answer_candidate(question, direct_fallback):
        normalized = await _normalize_answer_by_question(question, direct_fallback)
        if _is_valid_answer_candidate(question, normalized):
            return normalized

    if ENABLE_HEURISTIC_DOC_GUESS:
        guessed = _best_guess_from_docs(question, retrieved_docs, evidence_text=evidence_text)
        if guessed != "unknown":
            guessed = await _normalize_answer_by_question(question, guessed)
            if _is_valid_answer_candidate(question, guessed):
                return guessed

    # Optional last-resort forcing (disabled in stable mode to avoid low-precision guesses).
    if ENABLE_LAST_RESORT_FORCE:
        last_timeout = _step_timeout(deadline, 4, min_timeout_s=1)
        if last_timeout > 0:
            try:
                resp = await asyncio.wait_for(
                    llm_instance.ainvoke(_build_best_effort_prompt(question, evidence_text, direct_raw)),
                    timeout=last_timeout,
                )
                last = _compact_answer(str(getattr(resp, "content", "") or ""))
                if last != "unknown" and not _looks_like_tool_trace(last):
                    last = await _normalize_answer_by_question(question, last)
                    if _is_valid_answer_candidate(question, last):
                        return last
            except Exception:
                pass

    return "unknown"


@agent_app.init
async def initialize(self):
    global llm_instance, llm_hq_instance
    api_key = _clean_env("DASHSCOPE_API_KEY")
    if not api_key:
        raise ValueError("Missing DASHSCOPE_API_KEY in environment variables")

    model = _clean_env("QWEN_MODEL", "qwen-plus")
    base_url = _clean_env("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    timeout_raw = _clean_env("REQUEST_TIMEOUT", "60")
    timeout = int(timeout_raw) if timeout_raw.isdigit() else 60

    llm_instance = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        max_tokens=128,
        timeout=timeout,
        max_retries=0,
    )
    try:
        if model != HQ_MODEL_NAME:
            llm_hq_instance = ChatOpenAI(
                model=HQ_MODEL_NAME,
                api_key=api_key,
                base_url=base_url,
                temperature=0,
                max_tokens=128,
                timeout=timeout,
                max_retries=0,
            )
        else:
            llm_hq_instance = llm_instance
    except Exception:
        llm_hq_instance = None

    global chat_agent, chat_agent_query, iqs_enabled, tavily_enabled, serpapi_enabled
    iqs_enabled = bool(_iqs_api_key())
    tavily_enabled = bool(_tavily_api_key())
    serpapi_enabled = bool(_serpapi_api_key())

    tools = []
    if ENABLE_SEARCH_FALLBACK:
        if iqs_enabled:
            tools.append(iqs_search)
        if tavily_enabled:
            tools.append(tavily_search)
        if serpapi_enabled:
            tools.append(serpapi_search)

    chat_agent = create_agent(
        llm_instance,
        tools=tools,
        system_prompt=(
            "你是竞赛答题助手。"
            "当问题需要事实检索时，可使用 iqs_search、tavily_search、serpapi_search。"
            "最终只输出答案本体，不要解释，不要前后缀。"
            "中文题用中文答，英文题用英文答；若题目规定格式必须严格遵守。"
        ),
    )
    # Online dialog adapter compatibility: keep query stream tool-free.
    # Competition scoring path uses /answer and is not affected by this.
    chat_agent_query = create_agent(
        llm_instance,
        tools=[],
        system_prompt=(
            "你是竞赛答题助手。"
            "只输出最终答案，不要解释。"
            "中文题用中文答，英文题用英文答。"
        ),
    )


@agent_app.query(framework="langgraph")
async def query_func(
    self,
    msgs: List[BaseMessage],
    request: AgentRequest = None,
    **kwargs,
) -> AsyncIterator[tuple[BaseMessage, bool]]:
    # Keep LangGraph query output in official message-stream shape for adapter stability.
    if chat_agent_query is None:
        yield AIMessage(content="unknown"), True
        return

    try:
        in_msgs = msgs or []
        if not in_msgs:
            for key in ("question", "query", "prompt", "input"):
                v = kwargs.get(key)
                if isinstance(v, str) and v.strip():
                    in_msgs = [HumanMessage(content=v.strip())]
                    break

        session_id = getattr(request, "session_id", None) or "studio_session"
        async for chunk, _ in chat_agent_query.astream(
            input={"messages": in_msgs},
            stream_mode="messages",
            config={"configurable": {"thread_id": session_id}},
        ):
            is_last_chunk = True if getattr(chunk, "chunk_position", "") == "last" else False
            yield chunk, is_last_chunk
    except Exception:
        yield AIMessage(content="unknown"), True


@agent_app.endpoint("/answer", methods=["POST"])
async def answer_endpoint(body: dict, request: FastAPIRequest = None):
    async def _ask_with_timeout(question: str) -> str:
        try:
            answer = await asyncio.wait_for(_ask(question), timeout=ASK_HARD_TIMEOUT_SECONDS)
        except Exception:
            answer = "unknown"
        return _compact_answer(answer)

    async def _answer_sse_stream(question: str) -> AsyncIterator[str]:
        answer_task = asyncio.create_task(_ask_with_timeout(question))
        # Send first ping immediately so gateways see traffic quickly.
        yield _sse_event(SSE_PING_EVENT_NAME, {"ts": int(time.time())})
        try:
            while not answer_task.done():
                await asyncio.sleep(SSE_PING_INTERVAL_SECONDS)
                if answer_task.done():
                    break
                yield _sse_event(SSE_PING_EVENT_NAME, {"ts": int(time.time())})
            answer = await answer_task
        except asyncio.CancelledError:
            answer_task.cancel()
            raise
        except Exception:
            answer = "unknown"
        yield _sse_event(SSE_FINAL_EVENT_NAME, {"answer": _compact_answer(answer)})

    payload = body or {}
    stream_mode = _should_stream_response(payload, request)
    question = str(payload.get("question", "")).strip()
    if not question and "messages" in payload:
        try:
            messages = payload.get("messages") or []
            for m in reversed(messages):
                if isinstance(m, dict) and m.get("role") == "user":
                    question = _parse_question_text(str(m.get("content", "")))
                    if question:
                        break
        except Exception:
            question = ""

    if not question:
        if stream_mode:
            async def _unknown_sse() -> AsyncIterator[str]:
                yield _sse_event(SSE_FINAL_EVENT_NAME, {"answer": "unknown"})

            return StreamingResponse(
                _unknown_sse(),
                media_type="text/event-stream",
                headers=_sse_headers(),
            )
        return {"answer": "unknown"}

    if stream_mode:
        return StreamingResponse(
            _answer_sse_stream(question),
            media_type="text/event-stream",
            headers=_sse_headers(),
        )

    answer = await _ask_with_timeout(question)
    return {"answer": answer}


@agent_app.endpoint("/health", methods=["GET"])
async def health():
    return {
        "status": "ok",
        "llm_ready": llm_instance is not None,
        "llm_hq_ready": llm_hq_instance is not None,
        "conservative_verify": CONSERVATIVE_VERIFY_ENABLED,
        "providers": {
            "iqs": iqs_enabled,
            "tavily": tavily_enabled,
            "serpapi": serpapi_enabled,
        },
    }


@agent_app.endpoint("/", methods=["GET"])
async def root():
    return {"message": "CompetitionAgent is running", "endpoints": ["/answer", "/health"]}
