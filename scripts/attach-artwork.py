#!/usr/bin/env python3
"""Return an explicitly selected generated PNG to its local draft handoff. Never approves it."""
import argparse
import base64
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("task_id")
parser.add_argument("request_id")
parser.add_argument("png", type=Path)
parser.add_argument("--port", type=int, default=8787)
args = parser.parse_args()
if not 1 <= args.port <= 65535:
    parser.error("Invalid localhost port")
if any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in args.task_id):
    parser.error("Invalid task ID")
if args.png.stat().st_size > 16 * 1024 * 1024:
    parser.error("PNG exceeds the 16 MB handoff limit")
payload = json.dumps({"requestId": args.request_id, "pngBase64": base64.b64encode(args.png.read_bytes()).decode("ascii")}).encode()
request = Request(f"http://127.0.0.1:{args.port}/api/tasks/{args.task_id}/artwork", data=payload, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urlopen(request, timeout=30) as response:
        print(response.read().decode())
except HTTPError as error:
    raise SystemExit(error.read().decode()) from error
