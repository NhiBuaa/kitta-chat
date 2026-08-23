#!/bin/sh
set -eu

fail_config() {
    printf '%s\n' "K6_EDGE_CONFIG_ERROR=$1" >&2
    exit 78
}

validate_dns_name() {
    hostname=$1
    [ "${#hostname}" -le 253 ] || return 1

    old_ifs=$IFS
    IFS='.'
    set -- $hostname
    IFS=$old_ifs
    [ "$#" -ge 2 ] || return 1

    for label do
        [ -n "$label" ] || return 1
        [ "${#label}" -le 63 ] || return 1
        case "$label" in
            *[!a-z0-9-]*|-*|*-) return 1 ;;
        esac
    done
}

test_authority=${K6_EDGE_ALLOW_TEST_UPSTREAM:-}
case "$test_authority" in
    ""|true) ;;
    *) fail_config INVALID_TEST_AUTHORITY ;;
esac

target=${K6_TARGET:-}
upstream=${BACKEND_UPSTREAM:-}
[ -n "$upstream" ] || fail_config MISSING_BACKEND_UPSTREAM

case "$target" in
    public-demo)
        public_demo=1
        case "$upstream" in
            *:3000) hostname=${upstream%:3000} ;;
            *) fail_config INVALID_BACKEND_UPSTREAM ;;
        esac
        validate_dns_name "$hostname" || fail_config INVALID_BACKEND_UPSTREAM
        case "$hostname" in
            *.railway.internal) ;;
            *.internal.test)
                [ "$test_authority" = true ] || fail_config TEST_AUTHORITY_REQUIRED
                ;;
            *) fail_config INVALID_BACKEND_UPSTREAM ;;
        esac
        ;;
    local-compose)
        public_demo=0
        [ -z "$test_authority" ] || fail_config TEST_AUTHORITY_FORBIDDEN
        [ "$upstream" = "backend:3000" ] || fail_config INVALID_LOCAL_COMPOSE_UPSTREAM
        ;;
    *) fail_config UNSUPPORTED_TARGET ;;
esac

template=${K6_EDGE_CONFIG_TEMPLATE:-/etc/nginx/k6/nginx.conf.template}
output=${K6_EDGE_CONFIG_OUTPUT:-/etc/nginx/nginx.conf}
[ -f "$template" ] || fail_config TEMPLATE_MISSING

output_directory=$(dirname "$output")
[ -d "$output_directory" ] || fail_config OUTPUT_DIRECTORY_MISSING
temporary=$(mktemp "$output_directory/.nginx.conf.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM

sed \
    -e "s/__BACKEND_UPSTREAM__/$upstream/g" \
    -e "s/__K6_PUBLIC_DEMO__/$public_demo/g" \
    "$template" > "$temporary"
if grep -Eq '__BACKEND_UPSTREAM__|__K6_PUBLIC_DEMO__' "$temporary"; then
    fail_config RENDER_INCOMPLETE
fi
mv "$temporary" "$output"
trap - EXIT HUP INT TERM

case "${K6_EDGE_RENDER_ONLY:-}" in
    "") nginx -t -c "$output" ;;
    true) ;;
    *) fail_config INVALID_RENDER_ONLY_AUTHORITY ;;
esac
