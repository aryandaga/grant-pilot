"""Evaluate the /api/ai/query infer-mode prompt against baselines.

Run from backend:
    python evals/ai_infer/run_eval.py

The script uses VENICE_API_KEY from backend/.env. It writes JSON results to
evals/ai_infer/results/.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

from app.routers.ai import build_prompt, generate_ai_answer  # noqa: E402

DATASET_PATH = Path(__file__).with_name("dataset.jsonl")
RESULTS_DIR = Path(__file__).with_name("results")


@dataclass
class EvalExample:
    id: str
    endpoint: str
    mode: str
    question: str
    documents: list[dict[str, str]]
    ground_truth: str
    must_include: list[str]


def load_dataset(path: Path) -> list[EvalExample]:
    examples: list[EvalExample] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        examples.append(
            EvalExample(
                id=row["id"],
                endpoint=row["endpoint"],
                mode=row["mode"],
                question=row["input"]["question"],
                documents=row["input"]["documents"],
                ground_truth=row["ground_truth"],
                must_include=row["must_include"],
            )
        )
    return examples


def context_from_documents(documents: list[dict[str, str]]) -> str:
    return "\n\n".join(f"Document: {doc['name']}\n{doc['text']}" for doc in documents)


def endpoint_infer_candidate(example: EvalExample) -> str:
    prompt = build_prompt(
        mode="infer",
        query=example.question,
        context=context_from_documents(example.documents),
        has_context=bool(example.documents),
    )
    return generate_ai_answer(prompt, enable_web_search=False)


def single_prompt_baseline(example: EvalExample) -> str:
    prompt = f"""Answer the question using the provided documents.

Documents:
{context_from_documents(example.documents)}

Question:
{example.question}

Answer:"""
    return generate_ai_answer(prompt, enable_web_search=False)


def lexical_search(query: str, documents: list[dict[str, str]], limit: int = 2) -> list[str]:
    query_terms = {term.lower() for term in re.findall(r"[a-zA-Z0-9]+", query) if len(term) > 2}
    scored: list[tuple[int, str]] = []
    for doc in documents:
        sentences = re.split(r"(?<=[.!?])\s+", doc["text"])
        for sentence in sentences:
            sentence_terms = {term.lower() for term in re.findall(r"[a-zA-Z0-9]+", sentence)}
            score = len(query_terms & sentence_terms)
            scored.append((score, f"{doc['name']}: {sentence.strip()}"))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [text for score, text in scored[:limit] if score > 0]


def agentic_baseline(example: EvalExample) -> str:
    """Tiny tool-using baseline: plan a search, execute it, then answer."""
    plan_prompt = f"""You are an agent deciding how to answer a document question.
Return JSON only with this shape: {{"search_query": "...", "reason": "..."}}.

Question: {example.question}
Available documents: {", ".join(doc["name"] for doc in example.documents)}
"""
    plan_text = generate_ai_answer(plan_prompt, enable_web_search=False)
    try:
        plan = json.loads(plan_text[plan_text.find("{") : plan_text.rfind("}") + 1])
        search_query = str(plan.get("search_query") or example.question)
    except Exception:
        search_query = example.question

    observations = lexical_search(search_query, example.documents)
    if not observations:
        observations = [context_from_documents(example.documents)]

    answer_prompt = f"""You are a tool-using document QA agent.
You searched the documents with query: {search_query}

Tool observations:
{chr(10).join(f"- {item}" for item in observations)}

Answer the original question using only the observations.
Original question: {example.question}
"""
    return generate_ai_answer(answer_prompt, enable_web_search=False)


def judge_answer(example: EvalExample, candidate: str) -> dict[str, Any]:
    contains = {
        item: item.lower() in candidate.lower()
        for item in example.must_include
    }
    coverage_score = sum(contains.values()) / max(len(contains), 1)

    judge_prompt = f"""You are evaluating a document-QA answer for faithfulness and correctness.
Return JSON only:
{{
  "score": 0-5,
  "faithful": true/false,
  "reason": "short explanation"
}}

Question: {example.question}
Ground truth: {example.ground_truth}
Required facts: {example.must_include}
Candidate answer: {candidate}
"""
    judge_text = generate_ai_answer(judge_prompt, enable_web_search=False)
    try:
        judge_json = json.loads(judge_text[judge_text.find("{") : judge_text.rfind("}") + 1])
    except Exception:
        judge_json = {"score": None, "faithful": None, "reason": judge_text[:500]}

    return {
        "llm_judge": judge_json,
        "must_include_hits": contains,
        "coverage_score": round(coverage_score, 3),
    }


def run_eval(limit: int | None = None) -> dict[str, Any]:
    examples = load_dataset(DATASET_PATH)
    if limit is not None:
        examples = examples[:limit]

    systems = {
        "endpoint_infer_prompt": endpoint_infer_candidate,
        "baseline_single_llm_prompt": single_prompt_baseline,
        "baseline_agentic_tool_loop": agentic_baseline,
    }

    results: list[dict[str, Any]] = []
    for example in examples:
        for system_name, runner in systems.items():
            print(f"Running {system_name} on {example.id}...")
            candidate = runner(example)
            judgment = judge_answer(example, candidate)
            results.append(
                {
                    "example_id": example.id,
                    "endpoint": example.endpoint,
                    "mode": example.mode,
                    "system": system_name,
                    "question": example.question,
                    "ground_truth": example.ground_truth,
                    "answer": candidate,
                    "judgment": judgment,
                }
            )

    summary: dict[str, Any] = {}
    for system_name in systems:
        subset = [row for row in results if row["system"] == system_name]
        judge_scores = [
            row["judgment"]["llm_judge"].get("score")
            for row in subset
            if isinstance(row["judgment"]["llm_judge"].get("score"), (int, float))
        ]
        summary[system_name] = {
            "examples": len(subset),
            "avg_coverage_score": round(
                sum(row["judgment"]["coverage_score"] for row in subset) / max(len(subset), 1),
                3,
            ),
            "avg_llm_judge_score": round(sum(judge_scores) / len(judge_scores), 3) if judge_scores else None,
        }

    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(DATASET_PATH),
        "endpoint_under_eval": "/api/ai/query",
        "mode_under_eval": "infer",
        "summary": summary,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if not os.getenv("VENICE_API_KEY"):
        raise SystemExit("VENICE_API_KEY is not configured. Set it in backend/.env before running evals.")

    output = run_eval(limit=args.limit)
    RESULTS_DIR.mkdir(exist_ok=True)
    out_path = RESULTS_DIR / f"eval-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], indent=2))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
