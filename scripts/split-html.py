from pathlib import Path

html = Path("gestione-spese-condominiali-supabase.html").read_text(encoding="utf-8")
start = html.index("<style>") + len("<style>")
end = html.index("</style>")
css = html[start:end].strip()
Path("css").mkdir(exist_ok=True)
Path("css/app.css").write_text(css, encoding="utf-8")

marker = '<script type="module">'
body_start = html.index("<body>")
body_end = html.index(marker)
body = html[body_start:body_end].strip()
js_start = body_end + len(marker)
js_end = html.index("</script>", js_start)
js = html[js_start:js_end].strip()
Path("js").mkdir(exist_ok=True)
Path("_extracted_body.html").write_text(body, encoding="utf-8")
Path("_extracted_main.js").write_text(js, encoding="utf-8")
print("done", len(css), len(body), len(js))
