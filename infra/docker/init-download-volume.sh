#!/bin/sh
set -eu

target=/var/lib/ai-agent-platform/downloads

if ! [ -d "$target" ] || [ -L "$target" ]; then
  echo "download volume root must be a real directory" >&2
  exit 1
fi

if [ -n "$(find "$target" -xdev ! -type d ! -type f -print -quit)" ]; then
  echo "download volume contains an unsupported file type" >&2
  exit 1
fi

find "$target" -xdev -type d -exec chown 1000:1000 {} +
find "$target" -xdev -type f -exec chown 1000:1000 {} +
find "$target" -xdev -type d -exec chmod 0750 {} +
find "$target" -xdev -type f -exec chmod 0640 {} +
