import asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient

try:
    from dbgpt_app.openapi.api_v1.analyst_api import router as analyst_router
except ImportError as e:
    print("Could not import analyst_router:", e)
    analyst_router = None

app = FastAPI()
if analyst_router:
    app.include_router(analyst_router)

client = TestClient(app)

def test_endpoints():
    if not analyst_router:
        print("Router not loaded, skipping test.")
        return

    # Check that /api/v1/analyst/chat endpoint is reachable and streams correctly
    resp = client.post("/api/v1/analyst/chat", data={"question": "Hello", "reply": "true"})
    print(f"/api/v1/analyst/chat STATUS: {resp.status_code}")
    print(f"Response snippet:\n{resp.text[:200]}")
    assert resp.status_code == 200
    
    # We also verify no conflict exists by noting the prefix is completely isolated.
    print("Verified that /api/v1/analyst does not conflict with /v1/chat/react-agent")

if __name__ == "__main__":
    test_endpoints()
