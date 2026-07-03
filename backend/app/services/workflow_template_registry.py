from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class WorkflowTemplateSpec:
    template_id: str
    label: str
    description: str
    status: str
    stages: tuple[str, ...]
    default_selection_count: int
    synthesis_goal: str
    synthesis_instructions: tuple[str, ...]
    icon: str
    color: str
    result_label: str
    stage_labels: dict[str, str]
    steps: tuple[dict[str, Any], ...]


def _registry_path() -> Path:
    return Path(__file__).resolve().parents[3] / "shared" / "workflow_templates.json"


def _load_registry_payload() -> dict[str, Any]:
    payload = json.loads(_registry_path().read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Workflow template registry must be a JSON object.")
    templates = payload.get("templates")
    if not isinstance(templates, list) or not templates:
        raise ValueError("Workflow template registry must include a non-empty templates list.")
    return payload


def _build_spec(item: dict[str, Any], common_steps: list[dict[str, Any]]) -> WorkflowTemplateSpec:
    if not isinstance(item, dict):
        raise ValueError("Workflow template entries must be JSON objects.")

    execution = item.get("execution") or {}
    ui = item.get("ui") or {}
    template_id = str(item.get("id") or "").strip()
    if not template_id:
        raise ValueError("Workflow template id is required.")

    stages = tuple(str(stage).strip() for stage in execution.get("stages") or [] if str(stage).strip())
    if not stages:
        raise ValueError(f"Workflow template '{template_id}' must define execution.stages.")

    stage_labels = ui.get("stageLabels") or {}
    if not isinstance(stage_labels, dict):
        raise ValueError(f"Workflow template '{template_id}' ui.stageLabels must be an object.")
    for required_stage in (*stages, "discussion", "completed", "queued", "normalize"):
        if required_stage not in stage_labels:
            raise ValueError(f"Workflow template '{template_id}' is missing stage label '{required_stage}'.")

    raw_steps = list(common_steps) + list(ui.get("steps") or [])
    step_ids: list[str] = []
    normalized_steps: list[dict[str, Any]] = []
    for step in raw_steps:
        if not isinstance(step, dict):
            raise ValueError(f"Workflow template '{template_id}' has invalid step definition.")
        step_id = str(step.get("id") or "").strip()
        if not step_id:
            raise ValueError(f"Workflow template '{template_id}' has a step without id.")
        if step_id in step_ids:
            raise ValueError(f"Workflow template '{template_id}' has duplicate step id '{step_id}'.")
        step_ids.append(step_id)
        normalized_steps.append(dict(step))

    instructions = tuple(
        str(item).strip()
        for item in execution.get("synthesisInstructions") or []
        if str(item).strip()
    )
    if not instructions:
        raise ValueError(f"Workflow template '{template_id}' must define synthesisInstructions.")

    return WorkflowTemplateSpec(
        template_id=template_id,
        label=str(item.get("name") or template_id),
        description=str(item.get("description") or ""),
        status=str(item.get("status") or "active"),
        stages=stages,
        default_selection_count=int(execution.get("defaultSelectionCount") or 5),
        synthesis_goal=str(execution.get("synthesisGoal") or ""),
        synthesis_instructions=instructions,
        icon=str(ui.get("icon") or "🔬"),
        color=str(ui.get("color") or "#3b82f6"),
        result_label=str(ui.get("resultLabel") or "工作流结果"),
        stage_labels={str(key): str(value) for key, value in stage_labels.items()},
        steps=tuple(normalized_steps),
    )


@lru_cache(maxsize=1)
def _registry() -> tuple[dict[str, Any], dict[str, WorkflowTemplateSpec]]:
    payload = _load_registry_payload()
    common_steps = payload.get("commonSteps") or []
    if not isinstance(common_steps, list):
        raise ValueError("Workflow template registry commonSteps must be a list.")

    specs: dict[str, WorkflowTemplateSpec] = {}
    for item in payload["templates"]:
        spec = _build_spec(item, common_steps)
        if spec.template_id in specs:
            raise ValueError(f"Duplicate workflow template id '{spec.template_id}'.")
        specs[spec.template_id] = spec
    return payload, specs


def list_workflow_templates() -> list[WorkflowTemplateSpec]:
    _, specs = _registry()
    return list(specs.values())


def get_workflow_template(template_id: str | None) -> WorkflowTemplateSpec:
    _, specs = _registry()
    if template_id and template_id in specs:
        return specs[template_id]
    return specs["literature_survey"]


def get_workflow_templates_payload() -> dict[str, Any]:
    payload, _ = _registry()
    return json.loads(json.dumps(payload))


def clear_workflow_template_cache() -> None:
    _registry.cache_clear()
