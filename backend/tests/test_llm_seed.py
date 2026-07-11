from __future__ import annotations

import unittest
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.models import LLMConfig
from backend.app.services import seed as seed_module
from backend.tests.support import TEST_ENCRYPTION_KEY, make_test_session_factory, patched_env


class LLMSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def tearDown(self):
        with self.session_factory() as db:
            for model in reversed(LLMConfig.metadata.sorted_tables):
                db.execute(model.delete())
            db.commit()

    def test_auto_seed_is_disabled_by_default(self):
        with patched_env(
            AUTO_SEED_LLM_CONFIGS=None,
            ENCRYPTION_KEY=TEST_ENCRYPTION_KEY,
            OLLAMA_MODELS=r"D:\Ollama\models",
        ):
            with self.session_factory() as db:
                seed_module.seed_llm_configs(db)
                self.assertEqual(db.query(LLMConfig).count(), 0)

    def test_auto_seed_still_works_after_explicit_opt_in(self):
        ollama_seed = {
            "provider": "ollama",
            "env_key": "OLLAMA_API_KEY",
            "env_base_url": "OLLAMA_API_BASE",
            "env_models": "OLLAMA_MODELS",
            "env_model": "OLLAMA_MODEL",
            "default_model": "qwen3:8b",
        }
        with patch.object(seed_module, "_LLM_PROVIDER_SEEDS", [ollama_seed]):
            with patched_env(
                AUTO_SEED_LLM_CONFIGS="true",
                ENCRYPTION_KEY=TEST_ENCRYPTION_KEY,
                OLLAMA_API_KEY=None,
                OLLAMA_API_BASE=None,
                OLLAMA_MODELS="qwen3:8b",
                OLLAMA_MODEL=None,
            ):
                with self.session_factory() as db:
                    seed_module.seed_llm_configs(db)
                    configs = db.query(LLMConfig).all()

        self.assertEqual(len(configs), 1)
        self.assertEqual(configs[0].provider, "ollama")
        self.assertEqual(configs[0].model_name, "qwen3:8b")


if __name__ == "__main__":
    unittest.main()
