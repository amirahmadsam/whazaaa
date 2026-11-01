#!/usr/bin/env python3
"""اسکریپت‌های افزونه (extension-src/) را به‌ترتیب manifest.json همراه shim.js در یک فایل bundle.js می‌گذارد.
   اگر افزونه را به‌روز کردی: پوشه‌ی extension-src را جایگزین کن و این را اجرا کن:  python3 tools/build_bundle.py"""
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
ext = root / "extension-src"
man = json.loads((ext / "manifest.json").read_text(encoding="utf-8"))
cs = man["content_scripts"]

start_files, idle_files = [], []
for block in cs:
    if block.get("run_at") == "document_start":
        start_files += block["js"]
    else:
        idle_files += block["js"]


def wrap(name, src):
    return "\n;try{\n" + src + "\n}catch(e){try{console.error('didehban:%s',e)}catch(_){}}\n" % name


parts = ["(function(){\nif(window.__dbBundle)return;window.__dbBundle=true;\n"]
parts.append((root / "tools" / "shim.js").read_text(encoding="utf-8"))
for f in start_files:
    parts.append(wrap(f, (ext / f).read_text(encoding="utf-8")))
parts.append("\nfunction __dbIdle(){\n")
for f in idle_files:
    parts.append(wrap(f, (ext / f).read_text(encoding="utf-8")))
parts.append("\n}\n")
parts.append(
    "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(__dbIdle,0)});}"
    "else{setTimeout(__dbIdle,0);}\n})();\n"
)

out = root / "app" / "src" / "main" / "assets" / "bundle.js"
out.write_text("".join(parts), encoding="utf-8")
print("start:", start_files)
print("idle :", idle_files)
print("wrote", out, out.stat().st_size, "bytes")
