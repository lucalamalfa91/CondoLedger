import re
import subprocess
import sys

ref = sys.argv[1] if len(sys.argv) > 1 else "5d9f18c:gestione-spese-condominiali-supabase.html"
text = subprocess.check_output(["git", "show", ref], text=True, encoding="utf-8")
url = re.search(r"DEFAULT_SUPABASE_URL = '([^']+)'", text)
key = re.search(r"DEFAULT_SUPABASE_ANON_KEY = '([^']+)'", text)
print("URL:", url.group(1) if url else "NOT FOUND")
print("KEY:", key.group(1) if key else "NOT FOUND")
