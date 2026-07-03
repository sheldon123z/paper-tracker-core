"""导出 OpenAPI JSON schema 到 docs/openapi.json"""

import json
import sys

sys.path.insert(0, "backend")
from app.main import app  # noqa: E402

schema = app.openapi()

with open("docs/openapi.json", "w", encoding="utf-8") as f:
    json.dump(schema, f, indent=2, ensure_ascii=False)

print(f"Exported {len(schema['paths'])} paths to docs/openapi.json")
