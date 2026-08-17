#!/bin/sh
set -eu

target=/var/lib/ai-agent-platform/downloads

if ! [ -d "$target" ] || [ -L "$target" ]; then
  echo "download volume root must be a real directory" >&2
  exit 1
fi

validate_tree() {
  if invalid_entry="$(find "$target" -xdev ! -type d ! -type f -print -quit)"; then
    :
  else
    echo "download volume scan failed" >&2
    exit 1
  fi
  if [ -n "$invalid_entry" ]; then
    echo "download volume contains an unsupported file type" >&2
    exit 1
  fi
}

# Compose keeps every other service waiting, so no other download_data consumer
# can write during this pass. The second scan is fail-closed, not atomic traversal.
validate_tree
find "$target" -xdev -type d -exec chown -h 1000:1000 {} +
find "$target" -xdev -type f -exec chown -h 1000:1000 {} +
find "$target" -xdev -type d -exec chmod 0750 {} +
find "$target" -xdev -type f -exec chmod 0640 {} +
validate_tree
