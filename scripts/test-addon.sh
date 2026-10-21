#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
godot_binary="${GODOT_BIN:?Set GODOT_BIN to the path of the Godot executable}"

"${godot_binary}" --headless --path "${repository_root}/test-project" --import >/dev/null 2>&1 || true
"${godot_binary}" --headless --path "${repository_root}/test-project" \
  -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit -ginclude_subdirs -gexit
