#!/bin/sh

set -eu

key_file="${1:-}"
if [ -z "$key_file" ] || [ ! -r "$key_file" ] || [ ! -s "$key_file" ]; then
  echo "backup encryption key file is missing or empty" >&2
  exit 78
fi

line_count="$(LC_ALL=C awk 'END { print NR }' "$key_file")"
first_line_bytes="$(LC_ALL=C awk 'NR == 1 { print length($0); exit }' "$key_file")"

if [ "$line_count" != "1" ] || \
   [ -z "$first_line_bytes" ] || \
   [ "$first_line_bytes" -lt 32 ] || \
   LC_ALL=C grep -q '[[:space:]]' "$key_file"; then
  echo "backup encryption key must be one non-whitespace line of at least 32 bytes" >&2
  exit 78
fi
