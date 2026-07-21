#!/bin/sh

set -eu
umask 077

if ! [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' "secret environment loader must start as root" >&2
  exit 1
fi

if [ -z "${SECRET_RUN_AS-}" ]; then
  printf '%s\n' "SECRET_RUN_AS is required" >&2
  exit 1
fi
case "$SECRET_RUN_AS" in
  postgres|agent|node|skill-registry) run_as=$SECRET_RUN_AS ;;
  *)
    printf '%s\n' "invalid SECRET_RUN_AS target" >&2
    exit 1
    ;;
esac

if [ "$#" -eq 0 ]; then
  printf '%s\n' "command is required" >&2
  exit 1
fi

gosu_path=
for candidate in /usr/local/bin/gosu /usr/sbin/gosu /usr/bin/gosu; do
  if [ -x "$candidate" ]; then
    gosu_path=$candidate
    break
  fi
done
if [ -z "$gosu_path" ] || ! id "$run_as" >/dev/null 2>&1; then
  printf '%s\n' "runtime privilege drop is unavailable" >&2
  exit 1
fi

if [ -z "${SECRET_ENV_SPECS-}" ]; then
  printf '%s\n' "SECRET_ENV_SPECS is required" >&2
  exit 1
fi

for specification in $SECRET_ENV_SPECS; do
  case "$specification" in
    *=*) ;;
    *)
      printf '%s\n' "invalid secret environment specification" >&2
      exit 1
      ;;
  esac

  variable_name=${specification%%=*}
  secret_file=${specification#*=}
  case "$variable_name" in
    ''|[0-9]*|*[!A-Z0-9_]*)
      printf '%s\n' "invalid secret environment variable name" >&2
      exit 1
      ;;
  esac
  case "$secret_file" in
    /run/secrets/*) ;;
    *)
      printf '%s\n' "$variable_name secret path must be under /run/secrets" >&2
      exit 1
      ;;
  esac
  if [ ! -r "$secret_file" ]; then
    printf '%s\n' "$variable_name secret is unavailable" >&2
    exit 1
  fi

  secret_value=$(cat "$secret_file")
  case "$secret_value" in
    *[![:space:]]*) ;;
    *)
      printf '%s\n' "$variable_name secret must not be blank" >&2
      exit 1
      ;;
  esac
  export "$variable_name=$secret_value"
  unset secret_value
done

unset SECRET_ENV_SPECS
unset SECRET_RUN_AS
exec "$gosu_path" "$run_as" "$@"
