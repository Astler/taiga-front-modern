#!/bin/sh
set -eu

: "${TAIGA_API_URL:=/api/v1/}"
: "${TAIGA_EVENTS_URL:=/events}"
: "${TAIGA_LEGACY_URL:=/legacy/}"

for value in "$TAIGA_API_URL" "$TAIGA_EVENTS_URL" "$TAIGA_LEGACY_URL"; do
    if printf '%s' "$value" | grep -q '["<>]' || \
        printf '%s' "$value" | grep -q '\\' || \
        printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:]]'; then
        echo "Runtime URLs cannot contain quotes, angle brackets, backslashes, or control characters" >&2
        exit 1
    fi
done

export TAIGA_API_URL TAIGA_EVENTS_URL TAIGA_LEGACY_URL

envsubst '${TAIGA_API_URL} ${TAIGA_EVENTS_URL} ${TAIGA_LEGACY_URL}' \
    < /usr/share/nginx/html/config.template.json \
    > /usr/share/nginx/html/config.json

