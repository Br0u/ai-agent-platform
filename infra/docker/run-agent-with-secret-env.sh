#!/bin/sh

set -eu

if [ -z "${MODEL_PROVIDER-}" ] && [ -z "${MODEL_ID-}" ]; then
  unset MODEL_PROVIDER MODEL_ID MODEL_BASE_URL
  SECRET_ENV_SPECS=${SECRET_ENV_SPECS%MODEL_API_KEY=/run/secrets/model_api_key}
  export SECRET_ENV_SPECS
elif [ -z "${MODEL_BASE_URL-}" ]; then
  unset MODEL_BASE_URL
fi

exec /opt/aap/run-with-secret-env.sh "$@"
