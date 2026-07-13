#!/usr/bin/env python3
import argparse
import logging

import requests


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("scheduled-fetch")


def run(base_url: str):
    endpoint = f"{base_url.rstrip('/')}/api/run"
    response = requests.post(endpoint, timeout=30)
    response.raise_for_status()
    logger.info("Ingestion finished: %s", response.json())


def main():
    parser = argparse.ArgumentParser(description="Trigger Paper Tracker Core feed ingestion")
    parser.add_argument("--base-url", default="http://localhost:5002", help="API base URL")
    args = parser.parse_args()
    run(args.base_url)


if __name__ == "__main__":
    main()
