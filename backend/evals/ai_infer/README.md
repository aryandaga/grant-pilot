# AI Infer Endpoint Evaluation

This folder is the evaluation showcase for one AI endpoint:

- Endpoint: `POST /api/ai/query`
- Mode: `infer`
- Implementation prompt: `backend/app/routers/ai.py::build_prompt(mode="infer")`

The `infer` mode is the cleanest endpoint to evaluate because it should answer only from provided document context. That makes input and ground truth stable.

## 3.1 Dataset

`dataset.jsonl` contains five examples. Each row includes:

- `endpoint`
- `mode`
- input question
- input document text
- `ground_truth`
- `must_include` facts

## 3.2 Evaluation Implementation

`run_eval.py` evaluates answers with two checks:

- LLM-as-judge: asks the configured Venice/Grok model to grade correctness and faithfulness from 0 to 5.
- Deterministic coverage: checks whether required facts from `must_include` appear in the answer.

Run from `backend`:

```powershell
python evals/ai_infer/run_eval.py
```

For a fast smoke test:

```powershell
python evals/ai_infer/run_eval.py --limit 1
```

Results are written to:

```text
backend/evals/ai_infer/results/
```

## 3.3 Baselines

The evaluator compares three systems:

1. `endpoint_infer_prompt`
   - Uses the actual `build_prompt(mode="infer")` prompt from the production endpoint.

2. `baseline_single_llm_prompt`
   - A minimal one-shot prompt: documents plus question, no strict infer instructions.

3. `baseline_agentic_tool_loop`
   - A tiny agentic baseline:
     - LLM plans a search query.
     - The script executes a lexical `search_context` tool.
     - LLM answers from tool observations.

This gives you the required dataset, judge implementation, single-prompt baseline, and agentic baseline for one AI endpoint.
