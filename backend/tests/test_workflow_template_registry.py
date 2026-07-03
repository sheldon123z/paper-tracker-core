from __future__ import annotations

import unittest

from backend.app.services.workflow_template_registry import (
    get_workflow_template,
    get_workflow_templates_payload,
    list_workflow_templates,
)


class WorkflowTemplateRegistryTests(unittest.TestCase):
    def test_registry_exposes_all_templates_from_shared_source(self):
        payload = get_workflow_templates_payload()
        specs = list_workflow_templates()

        self.assertGreaterEqual(len(payload["templates"]), 5)
        self.assertEqual(len(specs), len(payload["templates"]))

    def test_template_spec_contains_execution_and_ui_contract(self):
        template = get_workflow_template("literature_survey")

        self.assertEqual(template.template_id, "literature_survey")
        self.assertIn("normalize", template.stages)
        self.assertIn("discussion", template.stage_labels)
        self.assertIn("completed", template.stage_labels)
        self.assertTrue(template.steps)
        self.assertTrue(template.synthesis_instructions)
