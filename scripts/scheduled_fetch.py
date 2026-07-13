#!/usr/bin/env python3
import argparse
import logging
import os

import requests


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("scheduled-fetch")


def run(base_url: str, service_token: str):
    endpoint = f"{base_url.rstrip('/')}/api/scheduler/trigger-all"
    if not service_token:
        raise RuntimeError("PAPER_TRACKER_SERVICE_TOKEN is required")
    response = requests.post(endpoint, headers={"X-Service-Token": service_token}, timeout=30)
    response.raise_for_status()
    logger.info("Ingestion finished: %s", response.json())


def main():
    parser = argparse.ArgumentParser(description="Trigger Paper Tracker Core feed ingestion")
    parser.add_argument("--base-url", default="http://localhost:5002", help="API base URL")
    parser.add_argument("--service-token", default=os.getenv("PAPER_TRACKER_SERVICE_TOKEN", ""))
    args = parser.parse_args()
    run(args.base_url, args.service_token)


if __name__ == "__main__":
    main()
