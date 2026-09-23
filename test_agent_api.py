import urllib.request
import json

import os

payload = {
    "prompt": "1+1 bang may",
    "provider": "opencode"
}
api_key = os.getenv("AGENT_WRAP_API_KEY", "")
req = urllib.request.Request(
    "http://160.191.50.138:8787/run",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
)
try:
    with urllib.request.urlopen(req) as resp:
        print("SUCCESS:", resp.read().decode())
except Exception as e:
    if hasattr(e, "read"):
        print("ERR:", e.code, e.read().decode())
    else:
        print("ERR:", e)
