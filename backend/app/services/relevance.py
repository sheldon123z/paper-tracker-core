import os
from collections import defaultdict

DEFAULT_KEYWORDS = {
    "llm": 2.0,
    "transformer": 1.5,
    "retrieval": 1.2,
    "multimodal": 1.0,
    "agent": 0.8,
    "benchmark": 0.6,
}

CATEGORY_KEYWORDS = {
    "NLP": ["language", "text", "translation", "nlp", "token"],
    "CV": ["vision", "image", "video", "detection", "segmentation"],
    "ML Systems": ["system", "inference", "latency", "throughput", "serving"],
    "LLM": ["llm", "transformer", "prompt", "alignment", "instruction"],
    "Robotics": ["robot", "control", "manipulation", "trajectory"],
}


def load_keywords_from_env() -> dict[str, float]:
    raw = os.getenv("TRACKER_KEYWORDS", "")
    if not raw.strip():
        return DEFAULT_KEYWORDS

    parsed: dict[str, float] = {}
    for item in raw.split(","):
        key_value = item.strip().split(":")
        if not key_value or not key_value[0].strip():
            continue
        keyword = key_value[0].strip().lower()
        try:
            weight = float(key_value[1]) if len(key_value) > 1 else 1.0
        except ValueError:
            weight = 1.0
        parsed[keyword] = weight

    return parsed or DEFAULT_KEYWORDS


def score_relevance(title: str, abstract: str, keyword_map: dict[str, float] | None = None) -> float:
    lookup = keyword_map or DEFAULT_KEYWORDS
    text = f"{title} {abstract}".lower()
    score = 0.0
    for keyword, weight in lookup.items():
        if keyword in text:
            score += weight
    return round(min(score, 10.0), 2)


def infer_category(title: str, abstract: str) -> str:
    text = f"{title} {abstract}".lower()
    matches = defaultdict(int)

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                matches[category] += 1

    if not matches:
        return "Uncategorized"

    return max(matches, key=matches.get)
