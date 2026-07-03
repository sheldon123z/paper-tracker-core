from pathlib import Path

import uvicorn
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=5002, reload=True)
