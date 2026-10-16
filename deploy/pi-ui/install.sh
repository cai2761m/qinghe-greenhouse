#!/usr/bin/env bash
set -euo pipefail
# Run as root with the release files staged beside this script.
release_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
web_root=/opt/greenhouse/web
backup_dir=/opt/greenhouse/backups
test -f "$web_root/index.html"
test -f "$web_root/gh-bridge.js"
test -f "$release_dir/assets/qinghe-refined.css"
test -f "$release_dir/assets/qinghe-touch.css"
test -f "$release_dir/gh-bridge.js"
mkdir -p "$backup_dir"
backup_file="$backup_dir/ui-before-refinement-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$backup_file" -C /opt/greenhouse web
install -m 644 "$release_dir/assets/qinghe-refined.css" "$web_root/assets/qinghe-refined.css"
install -m 644 "$release_dir/assets/qinghe-touch.css" "$web_root/assets/qinghe-touch.css"
# Atomic replacement avoids serving a partially written bridge script.
install -m 644 "$release_dir/gh-bridge.js" "$web_root/gh-bridge.js.next"
mv "$web_root/gh-bridge.js.next" "$web_root/gh-bridge.js"
python3 - "$web_root/index.html" <<'PY'
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
html = path.read_text(encoding="utf-8")
links = ['<link rel="stylesheet" href="/assets/qinghe-refined.css">',
         '<link rel="stylesheet" href="/assets/qinghe-touch.css">']
if "</head>" not in html:
    raise SystemExit("Cannot find the index.html head; backup is available.")
original = html
for link in links:
    if link not in html:
        html = html.replace("</head>", "  " + link + "\n  </head>")
if html != original:
    next_path = path.with_suffix(".html.next")
    next_path.write_text(html, encoding="utf-8")
    next_path.chmod(0o644)
    next_path.replace(path)
PY
printf 'UI installed. Backup: %s\n' "$backup_file"
