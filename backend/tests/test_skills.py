"""Comprehensive tests for skills management API."""

from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import AgentSkill
from backend.app.routes import skills as skills_module
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SkillsRouteTests(unittest.TestCase):
    """Tests for /api/skills endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(skills_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[skills_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(AgentSkill.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    # -------------------------------------------------------------------------
    # GET /api/skills/ - List skills
    # -------------------------------------------------------------------------

    def test_list_skills_empty(self):
        """Test listing skills when database is empty."""
        response = self.client.get("/api/skills/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_skills_with_data(self):
        """Test listing skills with multiple entries."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.add(AgentSkill(tool_name="get_paper_detail", agent_type="paper", is_enabled=False))
            db.add(AgentSkill(tool_name="search_papers", agent_type="global", is_enabled=True))
            db.commit()

        response = self.client.get("/api/skills/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 3)

        # Verify ordering by agent_type, then tool_name
        self.assertEqual(data[0]["agent_type"], "global")
        self.assertEqual(data[0]["tool_name"], "search_papers")
        self.assertEqual(data[1]["agent_type"], "paper")
        self.assertEqual(data[1]["tool_name"], "get_paper_detail")
        self.assertEqual(data[2]["agent_type"], "paper")
        self.assertEqual(data[2]["tool_name"], "search_papers")

    def test_list_skills_filter_by_agent_type_paper(self):
        """Test filtering skills by agent_type=paper."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.add(AgentSkill(tool_name="search_papers", agent_type="global", is_enabled=True))
            db.add(AgentSkill(tool_name="search_papers", agent_type="assistant", is_enabled=True))
            db.commit()

        response = self.client.get("/api/skills/?agent_type=paper")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["agent_type"], "paper")
        self.assertEqual(data[0]["tool_name"], "search_papers")

    def test_list_skills_filter_by_agent_type_global(self):
        """Test filtering skills by agent_type=global."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.add(AgentSkill(tool_name="search_papers", agent_type="global", is_enabled=True))
            db.add(AgentSkill(tool_name="get_research_stats", agent_type="global", is_enabled=True))
            db.commit()

        response = self.client.get("/api/skills/?agent_type=global")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        for item in data:
            self.assertEqual(item["agent_type"], "global")

    def test_list_skills_filter_by_agent_type_assistant(self):
        """Test filtering skills by agent_type=assistant."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="assistant", is_enabled=True))
            db.add(AgentSkill(tool_name="get_paper_detail", agent_type="assistant", is_enabled=False))
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.commit()

        response = self.client.get("/api/skills/?agent_type=assistant")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        for item in data:
            self.assertEqual(item["agent_type"], "assistant")

    def test_list_skills_filter_no_matches(self):
        """Test filtering with agent_type that has no matches."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.commit()

        response = self.client.get("/api/skills/?agent_type=nonexistent")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    # -------------------------------------------------------------------------
    # PUT /api/skills/{skill_id} - Update skill (enable/disable)
    # -------------------------------------------------------------------------

    def test_toggle_skill_enable(self):
        """Test enabling a disabled skill."""
        with self.session_factory() as db:
            skill = AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=False)
            db.add(skill)
            db.commit()
            skill_id = skill.id

        response = self.client.put(f"/api/skills/{skill_id}", json={"is_enabled": True})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_enabled"])
        self.assertEqual(data["tool_name"], "search_papers")

    def test_toggle_skill_disable(self):
        """Test disabling an enabled skill."""
        with self.session_factory() as db:
            skill = AgentSkill(tool_name="get_paper_detail", agent_type="global", is_enabled=True)
            db.add(skill)
            db.commit()
            skill_id = skill.id

        response = self.client.put(f"/api/skills/{skill_id}", json={"is_enabled": False})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["is_enabled"])

    def test_toggle_skill_not_found(self):
        """Test updating a non-existent skill."""
        response = self.client.put("/api/skills/99999", json={"is_enabled": True})
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"])

    def test_toggle_skill_idempotent(self):
        """Test that setting is_enabled to same value works."""
        with self.session_factory() as db:
            skill = AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True)
            db.add(skill)
            db.commit()
            skill_id = skill.id

        # Set to True when already True
        response = self.client.put(f"/api/skills/{skill_id}", json={"is_enabled": True})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_enabled"])

    # -------------------------------------------------------------------------
    # POST /api/skills/ - Create skill assignment
    # -------------------------------------------------------------------------

    def test_create_skill_success(self):
        """Test creating a new skill assignment."""
        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "search_papers",
                "agent_type": "paper",
                "is_enabled": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["tool_name"], "search_papers")
        self.assertEqual(data["agent_type"], "paper")
        self.assertTrue(data["is_enabled"])
        self.assertIn("id", data)

    def test_create_skill_disabled_by_default(self):
        """Test creating a skill with is_enabled=False."""
        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "get_paper_detail",
                "agent_type": "global",
                "is_enabled": False,
            },
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertFalse(data["is_enabled"])

    def test_create_skill_duplicate_handling(self):
        """Test that duplicate skill assignment returns 409."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.commit()

        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "search_papers",
                "agent_type": "paper",
                "is_enabled": True,
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("already assigned", response.json()["detail"])

    def test_create_skill_same_tool_different_agent_type(self):
        """Test that same tool can be assigned to different agent types."""
        with self.session_factory() as db:
            db.add(AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True))
            db.commit()

        # Should succeed for global agent type
        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "search_papers",
                "agent_type": "global",
                "is_enabled": True,
            },
        )
        self.assertEqual(response.status_code, 201)

    def test_create_skill_invalid_tool_name(self):
        """Test creating skill with unknown tool name returns 400."""
        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "nonexistent_tool",
                "agent_type": "paper",
                "is_enabled": True,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown tool", response.json()["detail"])

    def test_create_skill_multiple_valid_tools(self):
        """Test creating multiple valid skill assignments."""
        tools_to_create = [
            ("search_papers", "paper"),
            ("get_paper_detail", "paper"),
            ("get_research_stats", "global"),
            ("get_latest_papers", "assistant"),
        ]

        for tool_name, agent_type in tools_to_create:
            response = self.client.post(
                "/api/skills/",
                json={"tool_name": tool_name, "agent_type": agent_type, "is_enabled": True},
            )
            self.assertEqual(response.status_code, 201, f"Failed for {tool_name}/{agent_type}")

        # Verify all were created
        response = self.client.get("/api/skills/")
        self.assertEqual(len(response.json()), 4)

    # -------------------------------------------------------------------------
    # DELETE /api/skills/{skill_id} - Delete skill
    # -------------------------------------------------------------------------

    def test_delete_skill_success(self):
        """Test deleting an existing skill."""
        with self.session_factory() as db:
            skill = AgentSkill(tool_name="search_papers", agent_type="paper", is_enabled=True)
            db.add(skill)
            db.commit()
            skill_id = skill.id

        response = self.client.delete(f"/api/skills/{skill_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted", data["message"])
        self.assertEqual(data["id"], skill_id)

        # Verify it's gone
        response = self.client.get("/api/skills/")
        self.assertEqual(len(response.json()), 0)

    def test_delete_skill_not_found(self):
        """Test deleting a non-existent skill."""
        response = self.client.delete("/api/skills/99999")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"])

    def test_delete_skill_and_recreate(self):
        """Test deleting a skill and recreating it."""
        with self.session_factory() as db:
            skill = AgentSkill(tool_name="get_paper_detail", agent_type="paper", is_enabled=True)
            db.add(skill)
            db.commit()
            skill_id = skill.id

        # Delete
        response = self.client.delete(f"/api/skills/{skill_id}")
        self.assertEqual(response.status_code, 200)

        # Recreate should succeed now
        response = self.client.post(
            "/api/skills/",
            json={
                "tool_name": "get_paper_detail",
                "agent_type": "paper",
                "is_enabled": True,
            },
        )
        self.assertEqual(response.status_code, 201)

    # -------------------------------------------------------------------------
    # GET /api/skills/available-tools - List available tools
    # -------------------------------------------------------------------------

    def test_list_available_tools(self):
        """Test listing all available tool definitions."""
        response = self.client.get("/api/skills/available-tools")
        self.assertEqual(response.status_code, 200)
        tools = response.json()

        # Verify we have tools
        self.assertGreater(len(tools), 10)

        # Verify structure of each tool
        for tool in tools:
            self.assertIn("name", tool)
            self.assertIn("description", tool)
            self.assertIn("parameters", tool)

        # Verify some known tools exist
        tool_names = [t["name"] for t in tools]
        self.assertIn("search_papers", tool_names)
        self.assertIn("get_paper_detail", tool_names)
        self.assertIn("get_research_stats", tool_names)

    def test_available_tools_includes_core_paper_tools(self):
        """Test that core paper tools are in available tools."""
        response = self.client.get("/api/skills/available-tools")
        tools = response.json()
        tool_names = [t["name"] for t in tools]

        core_paper_tools = [
            "search_papers",
            "get_paper_detail",
            "get_latest_papers",
            "get_category_papers",
            "compare_papers",
        ]
        for tool_name in core_paper_tools:
            self.assertIn(tool_name, tool_names)

    def test_available_tools_includes_stats_tools(self):
        """Test that stats tools are in available tools."""
        response = self.client.get("/api/skills/available-tools")
        tools = response.json()
        tool_names = [t["name"] for t in tools]

        stats_tools = [
            "get_research_stats",
            "get_reading_progress",
            "get_tag_analysis",
            "find_duplicates",
        ]
        for tool_name in stats_tools:
            self.assertIn(tool_name, tool_names)


class SkillsIntegrationTests(unittest.TestCase):
    """Integration tests for skills workflow."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(skills_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[skills_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(AgentSkill.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_full_skill_lifecycle(self):
        """Test complete lifecycle: create -> list -> update -> delete."""
        # Create
        create_response = self.client.post(
            "/api/skills/",
            json={"tool_name": "search_papers", "agent_type": "paper", "is_enabled": True},
        )
        self.assertEqual(create_response.status_code, 201)
        skill_id = create_response.json()["id"]

        # List
        list_response = self.client.get("/api/skills/")
        self.assertEqual(len(list_response.json()), 1)

        # Update (disable)
        update_response = self.client.put(f"/api/skills/{skill_id}", json={"is_enabled": False})
        self.assertEqual(update_response.status_code, 200)
        self.assertFalse(update_response.json()["is_enabled"])

        # Delete
        delete_response = self.client.delete(f"/api/skills/{skill_id}")
        self.assertEqual(delete_response.status_code, 200)

        # Verify empty
        final_list = self.client.get("/api/skills/")
        self.assertEqual(len(final_list.json()), 0)

    def test_bulk_skill_management(self):
        """Test managing multiple skills for different agent types."""
        # Create skills for all agent types
        agent_types = ["paper", "global", "assistant"]
        tools = ["search_papers", "get_paper_detail", "get_research_stats"]

        for agent_type in agent_types:
            for tool in tools:
                response = self.client.post(
                    "/api/skills/",
                    json={"tool_name": tool, "agent_type": agent_type, "is_enabled": True},
                )
                self.assertEqual(response.status_code, 201)

        # Verify all created
        all_skills = self.client.get("/api/skills/").json()
        self.assertEqual(len(all_skills), 9)  # 3 agent types x 3 tools

        # Disable all skills for paper agent
        paper_skills = [s for s in all_skills if s["agent_type"] == "paper"]
        for skill in paper_skills:
            response = self.client.put(f"/api/skills/{skill['id']}", json={"is_enabled": False})
            self.assertEqual(response.status_code, 200)

        # Verify paper skills are disabled
        paper_skills_refresh = self.client.get("/api/skills/?agent_type=paper").json()
        for skill in paper_skills_refresh:
            self.assertFalse(skill["is_enabled"])

        # Delete all global skills
        global_skills = [s for s in all_skills if s["agent_type"] == "global"]
        for skill in global_skills:
            response = self.client.delete(f"/api/skills/{skill['id']}")
            self.assertEqual(response.status_code, 200)

        # Verify only assistant and paper skills remain
        remaining = self.client.get("/api/skills/").json()
        self.assertEqual(len(remaining), 6)  # 3 paper + 3 assistant


if __name__ == "__main__":
    unittest.main()
