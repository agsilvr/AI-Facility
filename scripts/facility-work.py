#!/usr/bin/env python3
"""Official-app/chat work bridge. Reports facts; never approves or publishes."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:8787'
CLAIMS = Path(__file__).resolve().parents[1] / '.facility-work'

def request(path, body=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Origin': BASE}, method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(json.load(error).get('error', str(error))) from error

def claim_file(key):
    if not key or len(key) > 80 or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in key):
        raise ValueError('Use a lowercase work ID with letters, digits and hyphens')
    return CLAIMS / (key + '.json')

def previous(key):
    try:
        return request('/api/work/' + key + '/context')['work']
    except RuntimeError as error:
        if str(error) != 'No shared work record':
            raise
        return None

def report(key, **fields):
    saved = json.loads(claim_file(key).read_text())
    return request('/api/work/' + key + '/report', {'runToken': saved['runToken'], **fields})['work']

def main():
    argv = sys.argv[1:]
    command = []
    if '--' in argv:
        split = argv.index('--')
        command = argv[split + 1:]
        argv = argv[:split]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['context', 'start', 'checkpoint', 'report', 'run'])
    parser.add_argument('--id', required=True)
    parser.add_argument('--phase', choices=['research', 'design', 'quality', 'listing', 'maintenance'])
    parser.add_argument('--worker', choices=['codex', 'claude', 'qwen'], default='codex')
    parser.add_argument('--title')
    parser.add_argument('--summary')
    parser.add_argument('--context-file', type=Path)
    parser.add_argument('--next-step')
    parser.add_argument('--reference', action='append')
    parser.add_argument('--status', choices=['running', 'waiting', 'paused', 'blocked', 'done'])
    parser.add_argument('--timeout', type=int, default=1800)
    args = parser.parse_args(argv)
    if args.action == 'run' and (not command or not 1 <= args.timeout <= 3600):
        parser.error('run requires a command after -- and a timeout of 1–3600 seconds')
    local = claim_file(args.id)
    if args.action == 'context':
        print(json.dumps(request('/api/work/' + args.id + '/context'), indent=2))
        return
    fields = {k: v for k, v in {'summary': args.summary, 'nextStep': args.next_step,
        'references': args.reference, 'context': args.context_file.read_text() if args.context_file else None}.items() if v is not None}
    if args.action == 'report':
        if args.status:
            fields['status'] = args.status
        work = report(args.id, **fields)
        print(json.dumps({key: work.get(key) for key in ['id', 'phase', 'status', 'heartbeatAt', 'nextStep']}, indent=2))
        return
    if not args.title or not args.phase or not args.summary:
        parser.error('start/checkpoint/run requires --title, --phase and --summary')
    old = previous(args.id)
    body = {'id': args.id, 'title': args.title, 'phase': args.phase, 'worker': args.worker,
        'expectedRevision': old['revision'] if old else 0, **fields}
    checkpoint = args.action == 'checkpoint'
    if checkpoint:
        if args.status not in ['waiting', 'paused', 'blocked', 'done']:
            parser.error('checkpoint requires a non-running --status')
        body['status'] = args.status
    work = request('/api/work/' + ('checkpoint' if checkpoint else 'start'), body)['work']
    if checkpoint:
        print(json.dumps(work, indent=2))
        return
    CLAIMS.mkdir(exist_ok=True, mode=0o700)
    local.write_text(json.dumps({'id': work['id'], 'runToken': work['runToken']}))
    local.chmod(0o600)
    if args.action == 'start':
        print(json.dumps(work, indent=2))
        return
    child = subprocess.Popen(command, start_new_session=True)
    started = time.monotonic()
    next_heartbeat = started
    try:
        while child.poll() is None:
            now = time.monotonic()
            if now - started > args.timeout:
                raise RuntimeError('Bounded command runtime exceeded')
            if now >= next_heartbeat:
                report(args.id)
                next_heartbeat = now + 15
            time.sleep(0.2)
        code = child.returncode
        report(args.id, status='waiting' if code == 0 else 'blocked',
            summary=f'Command completed with exit code {code}. ' + (args.summary or ''),
            nextStep=args.next_step or 'Review the saved output before claiming the next stage.')
        sys.exit(code)
    except BaseException:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=4)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
        try:
            report(args.id, status='blocked', summary='Worker stopped; command terminated. Read saved context before continuing.')
        except Exception:
            pass
        raise

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
