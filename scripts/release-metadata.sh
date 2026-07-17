#!/usr/bin/env bash
set -euo pipefail

if [[ "${EVENT_NAME:-}" == "push" ]]; then
  tag="${REF_NAME:?REF_NAME is required for tag pushes}"
  request_stable=true
else
  tag="v${INPUT_VERSION:?INPUT_VERSION is required for manual releases}"
  request_stable="${INPUT_STABLE:-false}"
  workflow_commit="${GITHUB_SHA:?GITHUB_SHA is required for manual releases}"

  if ! resolved_workflow_commit="$(git rev-parse "${workflow_commit}^{commit}")"; then
    printf 'Manual release commit %s is unavailable in the checkout\n' "$workflow_commit" >&2
    exit 1
  fi

  if git show-ref --verify --quiet "refs/tags/${tag}"; then
    resolved_tag_commit="$(git rev-parse "${tag}^{commit}")"
    if [[ "$resolved_tag_commit" != "$resolved_workflow_commit" ]]; then
      printf 'Existing tag %s points to %s instead of workflow commit %s\n' \
        "$tag" "$resolved_tag_commit" "$resolved_workflow_commit" >&2
      exit 1
    fi
  fi
fi

manifest_version="${PACKAGE_VERSION:-$(node -p "require('./package.json').version")}"
expected_tag="v${manifest_version}"
if [[ "$tag" != "$expected_tag" ]]; then
  printf 'Release tag %s does not match manifest version %s\n' "$tag" "$manifest_version" >&2
  exit 1
fi

apple_signed=false
if [[ -n "${APPLE_CERTIFICATE:-}" \
  && -n "${APPLE_CERTIFICATE_PASSWORD:-}" \
  && -n "${APPLE_SIGNING_IDENTITY:-}" \
  && -n "${APPLE_ID:-}" \
  && -n "${APPLE_PASSWORD:-}" \
  && -n "${APPLE_TEAM_ID:-}" ]]; then
  apple_signed=true
fi

windows_signed=false
if [[ -n "${WINDOWS_CERTIFICATE:-}" \
  && -n "${WINDOWS_CERTIFICATE_PASSWORD:-}" \
  && -n "${WINDOWS_CERTIFICATE_THUMBPRINT:-}" \
  && -n "${WINDOWS_TIMESTAMP_URL:-}" ]]; then
  windows_signed=true
fi

signed=false
if [[ "$request_stable" == "true" \
  && "$apple_signed" == "true" \
  && "$windows_signed" == "true" ]]; then
  signed=true
fi

output="${GITHUB_OUTPUT:-/dev/stdout}"
printf 'tag=%s\n' "$tag" >> "$output"
printf 'apple_signed=%s\n' "$apple_signed" >> "$output"
printf 'windows_signed=%s\n' "$windows_signed" >> "$output"
printf 'signed=%s\n' "$signed" >> "$output"
