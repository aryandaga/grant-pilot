from typing import TypedDict


class InvestorStage(TypedDict):
    key: str
    label: str
    short_label: str
    order: int


INVESTOR_STAGES: list[InvestorStage] = [
    {"key": "cold", "label": "Cold", "short_label": "Cold", "order": 0},
    {"key": "initial", "label": "Initial", "short_label": "Initial", "order": 1},
    {"key": "proposal", "label": "Proposal", "short_label": "Proposal", "order": 2},
    {"key": "visit_campus", "label": "Visit Campus", "short_label": "Campus Visit", "order": 3},
    {
        "key": "verbal_commitment",
        "label": "Verbal Commitment",
        "short_label": "Verbal Commit",
        "order": 4,
    },
    {"key": "mou", "label": "MOU", "short_label": "MOU", "order": 5},
    {"key": "draw_down_1", "label": "Draw Down 1", "short_label": "DD1", "order": 6},
    {"key": "draw_down_2", "label": "Draw Down 2", "short_label": "DD2", "order": 7},
    {"key": "draw_down_3", "label": "Draw Down 3", "short_label": "DD3", "order": 8},
    {"key": "draw_down_4", "label": "Draw Down 4", "short_label": "DD4", "order": 9},
]

INVESTOR_STAGE_KEYS = {stage["key"] for stage in INVESTOR_STAGES}

LEGACY_STAGE_MAP = {
    "pre_seed": "cold",
    "seed": "initial",
    "grant": "proposal",
    "qualified": "proposal",
    "series_a": "proposal",
    "diligent": "visit_campus",
    "series_b": "visit_campus",
    "commit": "verbal_commitment",
    "received": "draw_down_4",
}


def normalize_investor_stage(stage: str | None) -> str:
    if not stage:
        return "cold"
    cleaned = stage.strip().lower()
    return LEGACY_STAGE_MAP.get(cleaned, cleaned)
