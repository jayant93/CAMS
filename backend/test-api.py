import urllib.request
import json

url = "https://cams-service.cams-memory.workers.dev/api/extract"
data = {
    "task": "conversation",
    "systemPrompt": "You are a test. Return valid JSON with keys: decisions, assumptions, pending, goal.",
    "userText": "Hello world test",
    "deviceId": "test-device-123"
}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "User-Agent": "CAMS-VSCode/0.2.0"
    }
)

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        body = response.read().decode("utf-8")
        print("Response:", json.dumps(json.loads(body), indent=2))
except urllib.error.HTTPError as e:
    print("Status:", e.code)
    print("Error:", e.read().decode("utf-8"))
