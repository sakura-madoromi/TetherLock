#!/usr/bin/env python3
"""Run the Flutter APP MQTT service end-to-end against the real Tauri backend."""
import json,os,subprocess,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[2]
endpoint=os.environ.get('TAURI_DRIVER_URL','http://127.0.0.1:4464')
def request(method,path,data=None):
 r=urllib.request.Request(endpoint+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'},method=method)
 return json.load(urllib.request.urlopen(r,timeout=60))['value']
session=request('POST','/session',{'capabilities':{'alwaysMatch':{'tauri:options':{'application':str(root/'apps/simulator/src-tauri/target/debug/tetherlock-simulator-tauri')}}}})['sessionId']
try:
 request('POST',f'/session/{session}/timeouts',{'script':20000})
 dart=os.environ.get('DART_BIN','dart')
 subprocess.run([dart,'run','tool/mqtt_simulator_e2e.dart'],cwd=root/'apps/controller',env={**os.environ,'TETHERLOCK_TAURI_SESSION':session,'TETHERLOCK_TAURI_DRIVER':endpoint},check=True)
finally:request('DELETE',f'/session/{session}',{})
