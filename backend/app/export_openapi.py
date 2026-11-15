"""Write the OpenAPI schema to a file (used by `npm run gen:api` to generate frontend types)."""

import json
import sys
from pathlib import Path

from .config import Settings
from .main import create_app

if __name__ == "__main__":
    out = Path(sys.argv[1])
    schema = create_app(Settings(watch=False)).openapi()
    out.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
