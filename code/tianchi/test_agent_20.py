#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import csv
import json
import os
import time
from pathlib import Path
from typing import Dict, Any, List

import requests


# ==================== 必填配置（请直接改这里） ====================
# 1) 填你的 EAS 服务地址（不要带 /answer，脚本会自动拼接）
EAS_ENDPOINT = "PASTE_YOUR_EAS_ENDPOINT_HERE"

# 2) 填你的 EAS Token（Bearer 后面的那一段）
EAS_TOKEN = "PASTE_YOUR_EAS_TOKEN_HERE"
# ===============================================================


def load_questions(path: Path, limit: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            items.append(obj)
            if len(items) >= limit:
                break
    return items


def extract_question(item: Dict[str, Any]) -> str:
    # Common flat keys
    for key in ("question", "Question", "prompt", "query", "text"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    # Nested input/message styles
    inp = item.get("input")
    if isinstance(inp, str) and inp.strip():
        return inp.strip()
    if isinstance(inp, list):
        for part in inp:
            if isinstance(part, dict):
                c = part.get("content")
                if isinstance(c, str) and c.strip():
                    return c.strip()
                if isinstance(c, list):
                    for seg in c:
                        if isinstance(seg, dict):
                            t = seg.get("text")
                            if isinstance(t, str) and t.strip():
                                return t.strip()
    return ""


def is_unknown_like(answer: str) -> bool:
    a = str(answer or "").strip().lower()
    if not a:
        return True
    return a in {
        "unknown",
        "未知",
        "无法确定",
        "不确定",
        "不知道",
        "无法回答",
        "n/a",
        "none",
    }


def parse_sse_answer(resp: requests.Response) -> str:
    event_name = ""
    data_lines: List[str] = []
    final_answer = "unknown"

    def _consume_event(name: str, lines: List[str]) -> str:
        if str(name).strip().lower() != "message" or not lines:
            return "unknown"
        raw = "\n".join(lines).strip()
        if not raw:
            return "unknown"
        try:
            obj = json.loads(raw)
            return str(obj.get("answer", "unknown")).strip() or "unknown"
        except Exception:
            return raw

    for raw_line in resp.iter_lines(decode_unicode=True):
        if raw_line is None:
            continue
        line = str(raw_line).rstrip("\r")
        if not line:
            ans = _consume_event(event_name, data_lines)
            if not is_unknown_like(ans):
                final_answer = ans
            event_name = ""
            data_lines = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].lstrip())

    # Flush tail event if server ended stream without trailing blank line.
    ans = _consume_event(event_name, data_lines)
    if not is_unknown_like(ans):
        final_answer = ans
    return final_answer


def main() -> None:
    default_endpoint = os.getenv("EAS_ENDPOINT") or EAS_ENDPOINT
    default_token = os.getenv("EAS_TOKEN") or EAS_TOKEN

    parser = argparse.ArgumentParser(
        description="Call EAS /answer and export result jsonl + csv stats (20-question default)."
    )
    parser.add_argument("--endpoint", default=default_endpoint, help="EAS endpoint without /answer")
    parser.add_argument("--token", default=default_token, help="EAS bearer token")
    parser.add_argument("--question-file", default="question_revised.jsonl", help="Path to question jsonl")
    parser.add_argument("--num", type=int, default=20, help="How many questions to run (default: 20)")
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Use SSE mode (expects event: Ping heartbeat and final event: Message with {\"answer\": ...})",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Request timeout seconds (competition rule: single request should be <= 600s)",
    )
    parser.add_argument("--output", default="answer_test_20.jsonl", help="Submission output jsonl")
    parser.add_argument("--csv-output", default="answer_test_20.csv", help="CSV stats file")
    args = parser.parse_args()

    if (
        not args.endpoint
        or not args.token
        or "PASTE_YOUR_EAS_TOKEN_HERE" in args.token
    ):
        raise SystemExit(
            "Missing endpoint/token. Please edit EAS_ENDPOINT/EAS_TOKEN at the top of this file "
            "or pass --endpoint --token."
        )

    if args.num < 1:
        raise SystemExit("--num must be >= 1")
    if args.timeout < 1:
        raise SystemExit("--timeout must be >= 1")
    if args.timeout > 600:
        raise SystemExit("--timeout must be <= 600 (competition single-request timeout limit is 10 minutes)")

    endpoint = args.endpoint.rstrip("/") + "/answer"
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json",
    }
    if args.stream:
        headers["Accept"] = "text/event-stream"

    question_path = Path(args.question_file)
    if not question_path.exists():
        raise SystemExit(f"Question file not found: {question_path.resolve()}")

    questions = load_questions(question_path, args.num)
    if not questions:
        raise SystemExit("No questions loaded. Please check question file format.")

    print(f"Testing {len(questions)} questions -> {endpoint}")
    print(f"Question file: {question_path.resolve()}")

    submit_path = Path(args.output)
    csv_path = Path(args.csv_output)

    results: List[Dict[str, Any]] = []
    submit_rows: List[Dict[str, Any]] = []
    ok_count = 0
    total_latency = 0.0

    for idx, item in enumerate(questions, start=1):
        qid = item.get("id", idx)
        question = extract_question(item)

        result = {
            "id": qid,
            "question": question,
            "answer": "unknown",
            "status_code": None,
            "latency_s": None,
            "error": None,
        }

        if not question:
            result["error"] = "empty_question"
            result["latency_s"] = 0.0
            results.append(result)
            submit_rows.append({"id": qid, "answer": "unknown"})
            print(f"[{idx}/{len(questions)}] id={qid} empty question -> unknown")
            continue

        payload = {"question": question}
        if args.stream:
            payload["stream"] = True
        t0 = time.time()

        try:
            resp = requests.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=args.timeout,
                stream=args.stream,
            )
            result["status_code"] = resp.status_code
            result["latency_s"] = round(time.time() - t0, 3)

            if resp.status_code == 200:
                if args.stream:
                    ans = parse_sse_answer(resp)
                else:
                    body = resp.json()
                    ans = str(body.get("answer", "unknown")).strip() or "unknown"
                if is_unknown_like(ans):
                    ans = "unknown"
                result["answer"] = ans
                if not is_unknown_like(result["answer"]):
                    ok_count += 1
            else:
                result["error"] = resp.text[:500]
        except Exception as e:
            result["latency_s"] = round(time.time() - t0, 3)
            result["error"] = str(e)

        results.append(result)
        total_latency += float(result["latency_s"] or 0)
        submit_rows.append({"id": qid, "answer": result["answer"]})

        print(
            f"[{idx}/{len(questions)}] id={qid} status={result['status_code']} "
            f"time={result['latency_s']}s answer={result['answer'][:80]}"
        )

    with submit_path.open("w", encoding="utf-8") as f:
        for row in submit_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "status_code", "latency_s", "answer", "error", "question"],
        )
        writer.writeheader()
        for row in results:
            writer.writerow(row)
        writer.writerow(
            {
                "id": "TOTAL",
                "status_code": f"{ok_count}/{len(results)}_non_unknown",
                "latency_s": round(total_latency, 3),
                "answer": "",
                "error": "",
                "question": "sum_latency_seconds",
            }
        )

    print(f"Done. non-unknown answers: {ok_count}/{len(results)}")
    print(f"Total latency: {round(total_latency, 3)}s")
    print(f"Submit file: {submit_path.resolve()}")
    print(f"CSV stats: {csv_path.resolve()}")


if __name__ == "__main__":
    main()
