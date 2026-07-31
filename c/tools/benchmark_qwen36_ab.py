#!/usr/bin/env python3
"""Deterministic A/B benchmark for llama.cpp vs the Qwen3.6 Colibri fork."""

import argparse
import difflib
import json
import statistics
import time
import urllib.error
import urllib.request


DEFAULT_PROMPTS = [
    "Вычисли 17 * 23 и одной фразой объясни способ проверки.",
    "Продолжи последовательность 2, 6, 12, 20, 30 и кратко назови правило.",
    "Назови столицу Франции и реку, на которой она стоит, одним предложением.",
    "Исправь ошибку в Python-выражении: values = [x*2 for x in range(5) if x % 2 = 0]",
    "Сожми смысл фразы до одного предложения: резервная копия не считается проверенной, пока не выполнено тестовое восстановление.",
]


def request_json(url, payload=None, timeout=600):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def model_id(base, timeout):
    body = request_json(base.rstrip("/") + "/v1/models", timeout=timeout)
    return body["data"][0]["id"]


def decode_tps(body, wall_s):
    timings = body.get("timings") or {}
    for key in ("predicted_per_second", "tokens_per_sec"):
        value = timings.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return float(value), key
    tokens = (body.get("usage") or {}).get("completion_tokens", 0)
    return (float(tokens) / wall_s if wall_s > 0 else 0.0), "wall"


def run_one(base, model, prompt, max_tokens, timeout):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Отвечай кратко и точно."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0,
        "seed": 42,
        "stream": False,
    }
    started = time.perf_counter()
    body = request_json(base.rstrip("/") + "/v1/chat/completions", payload, timeout)
    wall_s = time.perf_counter() - started
    text = body["choices"][0]["message"]["content"]
    tps, source = decode_tps(body, wall_s)
    return {
        "text": text,
        "wall_s": wall_s,
        "decode_tps": tps,
        "tps_source": source,
        "usage": body.get("usage") or {},
        "timings": body.get("timings") or {},
    }


def aggregate(rows):
    rates = [row["decode_tps"] for row in rows]
    return {
        "median_decode_tps": statistics.median(rates),
        "min_decode_tps": min(rates),
        "max_decode_tps": max(rates),
        "median_wall_s": statistics.median(row["wall_s"] for row in rows),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default="http://192.168.31.59:8080")
    parser.add_argument("--candidate", default="http://192.168.31.59:18080")
    parser.add_argument("--suite", help="JSON array of prompt strings")
    parser.add_argument("--max-tokens", type=int, default=96)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--out", help="Write the full JSON result to this path")
    args = parser.parse_args()

    prompts = DEFAULT_PROMPTS
    if args.suite:
        with open(args.suite, encoding="utf-8") as handle:
            prompts = json.load(handle)
        if not isinstance(prompts, list) or not all(isinstance(x, str) for x in prompts):
            raise SystemExit("--suite must contain a JSON array of strings")

    models = {
        "baseline": model_id(args.baseline, args.timeout),
        "candidate": model_id(args.candidate, args.timeout),
    }
    result = {"models": models, "prompts": [], "quality": {}}
    for index, prompt in enumerate(prompts, 1):
        print(f"[{index}/{len(prompts)}] baseline", flush=True)
        baseline = run_one(args.baseline, models["baseline"], prompt, args.max_tokens, args.timeout)
        print(f"[{index}/{len(prompts)}] candidate", flush=True)
        candidate = run_one(args.candidate, models["candidate"], prompt, args.max_tokens, args.timeout)
        ratio = difflib.SequenceMatcher(None, baseline["text"], candidate["text"]).ratio()
        result["prompts"].append({
            "prompt": prompt,
            "baseline": baseline,
            "candidate": candidate,
            "exact_text_match": baseline["text"] == candidate["text"],
            "text_similarity": ratio,
        })

    b_rows = [x["baseline"] for x in result["prompts"]]
    c_rows = [x["candidate"] for x in result["prompts"]]
    b_agg, c_agg = aggregate(b_rows), aggregate(c_rows)
    result["aggregate"] = {"baseline": b_agg, "candidate": c_agg}
    result["aggregate"]["speedup"] = c_agg["median_decode_tps"] / b_agg["median_decode_tps"]
    result["quality"] = {
        "exact_match_rate": sum(x["exact_text_match"] for x in result["prompts"]) / len(result["prompts"]),
        "mean_text_similarity": statistics.mean(x["text_similarity"] for x in result["prompts"]),
        "note": "Text similarity is a regression screen, not a substitute for task-specific evaluation.",
    }

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    print(rendered)


if __name__ == "__main__":
    main()
