"""Agent skill management API — CRUD for tool-to-agent assignments."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import AgentSkill
from ..schemas import AgentSkillCreate, AgentSkillOut, AgentSkillUpdate
from ..services.tools import TOOL_DEFINITIONS

router = APIRouter(prefix="/api/skills", tags=["skills"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[AgentSkillOut])
def list_skills(agent_type: str | None = None, db: Session = Depends(get_db)):
    """List all skill assignments, optionally filtered by agent_type."""
    q = db.query(AgentSkill)
    if agent_type:
        q = q.filter(AgentSkill.agent_type == agent_type)
    return q.order_by(AgentSkill.agent_type, AgentSkill.tool_name).all()


@router.put("/{skill_id}", response_model=AgentSkillOut)
def update_skill(skill_id: int, body: AgentSkillUpdate, db: Session = Depends(get_db)):
    """Enable or disable a skill assignment."""
    skill = db.query(AgentSkill).filter(AgentSkill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    skill.is_enabled = body.is_enabled
    db.commit()
    db.refresh(skill)
    return skill


@router.post("/", response_model=AgentSkillOut, status_code=201)
def create_skill(body: AgentSkillCreate, db: Session = Depends(get_db)):
    """Add a new tool assignment to an agent type."""
    # Validate tool_name exists in TOOL_DEFINITIONS
    valid_names = {td["function"]["name"] for td in TOOL_DEFINITIONS}
    if body.tool_name not in valid_names:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {body.tool_name}")

    existing = (
        db.query(AgentSkill)
        .filter(AgentSkill.tool_name == body.tool_name, AgentSkill.agent_type == body.agent_type)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Tool already assigned to this agent type")

    skill = AgentSkill(tool_name=body.tool_name, agent_type=body.agent_type, is_enabled=body.is_enabled)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    """Remove a skill assignment."""
    skill = db.query(AgentSkill).filter(AgentSkill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(skill)
    db.commit()
    return {"message": "Skill deleted", "id": skill_id}


@router.get("/available-tools")
def list_available_tools():
    """List all available tool definitions (from TOOL_DEFINITIONS)."""
    return [
        {
            "name": td["function"]["name"],
            "description": td["function"]["description"],
            "parameters": list(td["function"].get("parameters", {}).get("properties", {}).keys()),
        }
        for td in TOOL_DEFINITIONS
    ]
