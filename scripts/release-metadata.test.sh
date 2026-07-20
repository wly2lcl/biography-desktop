#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
metadata_script="$project_root/scripts/release-metadata.sh"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

assert_output() {
  local expected_tag="$1"
  local expected_apple_signed="$2"
  local expected_windows_signed="$3"
  local expected_signed="$4"
  local output="$5"
  grep -qx "tag=$expected_tag" "$output"
  grep -qx "apple_signed=$expected_apple_signed" "$output"
  grep -qx "windows_signed=$expected_windows_signed" "$output"
  grep -qx "signed=$expected_signed" "$output"
}

signed_output="$(mktemp)"
env \
  EVENT_NAME=push \
  REF_NAME=v1.2.3 \
  PACKAGE_VERSION=1.2.3 \
  GITHUB_OUTPUT="$signed_output" \
  APPLE_CERTIFICATE=x \
  APPLE_CERTIFICATE_PASSWORD=x \
  APPLE_SIGNING_IDENTITY=x \
  APPLE_ID=x \
  APPLE_PASSWORD=x \
  APPLE_TEAM_ID=x \
  WINDOWS_CERTIFICATE=x \
  WINDOWS_CERTIFICATE_PASSWORD=x \
  WINDOWS_CERTIFICATE_THUMBPRINT=x \
  WINDOWS_TIMESTAMP_URL=https://timestamp.example.com \
  bash "$metadata_script"
assert_output v1.2.3 true true true "$signed_output"

unsigned_tag_output="$(mktemp)"
env \
  EVENT_NAME=push \
  REF_NAME=v1.2.4 \
  PACKAGE_VERSION=1.2.4 \
  GITHUB_OUTPUT="$unsigned_tag_output" \
  APPLE_CERTIFICATE= \
  APPLE_CERTIFICATE_PASSWORD= \
  APPLE_SIGNING_IDENTITY= \
  APPLE_ID= \
  APPLE_PASSWORD= \
  APPLE_TEAM_ID= \
  WINDOWS_CERTIFICATE= \
  WINDOWS_CERTIFICATE_PASSWORD= \
  WINDOWS_CERTIFICATE_THUMBPRINT= \
  bash "$metadata_script"
assert_output v1.2.4 false false false "$unsigned_tag_output"

apple_only_output="$(mktemp)"
env \
  EVENT_NAME=push \
  REF_NAME=v1.2.5 \
  PACKAGE_VERSION=1.2.5 \
  GITHUB_OUTPUT="$apple_only_output" \
  APPLE_CERTIFICATE=x \
  APPLE_CERTIFICATE_PASSWORD=x \
  APPLE_SIGNING_IDENTITY=x \
  APPLE_ID=x \
  APPLE_PASSWORD=x \
  APPLE_TEAM_ID=x \
  WINDOWS_CERTIFICATE= \
  WINDOWS_CERTIFICATE_PASSWORD= \
  WINDOWS_CERTIFICATE_THUMBPRINT= \
  WINDOWS_TIMESTAMP_URL= \
  bash "$metadata_script"
assert_output v1.2.5 true false false "$apple_only_output"

windows_only_output="$(mktemp)"
env \
  EVENT_NAME=push \
  REF_NAME=v1.2.6 \
  PACKAGE_VERSION=1.2.6 \
  GITHUB_OUTPUT="$windows_only_output" \
  APPLE_CERTIFICATE= \
  APPLE_CERTIFICATE_PASSWORD= \
  APPLE_SIGNING_IDENTITY= \
  APPLE_ID= \
  APPLE_PASSWORD= \
  APPLE_TEAM_ID= \
  WINDOWS_CERTIFICATE=x \
  WINDOWS_CERTIFICATE_PASSWORD=x \
  WINDOWS_CERTIFICATE_THUMBPRINT=x \
  WINDOWS_TIMESTAMP_URL=https://timestamp.example.com \
  bash "$metadata_script"
assert_output v1.2.6 false true false "$windows_only_output"

test_repo="$temp_dir/repository"
git init -q "$test_repo"
git -C "$test_repo" config user.name "Release Test"
git -C "$test_repo" config user.email "release-test@example.com"
printf 'first\n' > "$test_repo/release.txt"
printf '{"version":"2.0.0"}\n' > "$test_repo/package.json"
git -C "$test_repo" add release.txt package.json
git -C "$test_repo" commit -qm "first"
first_commit="$(git -C "$test_repo" rev-parse HEAD)"
printf 'second\n' > "$test_repo/release.txt"
git -C "$test_repo" commit -qam "second"
second_commit="$(git -C "$test_repo" rev-parse HEAD)"

manual_output="$temp_dir/manual-output"
(
  cd "$test_repo"
  env \
    EVENT_NAME=workflow_dispatch \
    INPUT_STABLE=false \
    GITHUB_SHA="$second_commit" \
    GITHUB_OUTPUT="$manual_output" \
    bash "$metadata_script"
)
assert_output v2.0.0 false false false "$manual_output"

manual_signed_artifacts_output="$temp_dir/manual-signed-artifacts-output"
(
  cd "$test_repo"
  env \
    EVENT_NAME=workflow_dispatch \
    PACKAGE_VERSION=2.0.0 \
    INPUT_STABLE=false \
    GITHUB_SHA="$second_commit" \
    GITHUB_OUTPUT="$manual_signed_artifacts_output" \
    APPLE_CERTIFICATE=x \
    APPLE_CERTIFICATE_PASSWORD=x \
    APPLE_SIGNING_IDENTITY=x \
    APPLE_ID=x \
    APPLE_PASSWORD=x \
    APPLE_TEAM_ID=x \
    WINDOWS_CERTIFICATE=x \
    WINDOWS_CERTIFICATE_PASSWORD=x \
    WINDOWS_CERTIFICATE_THUMBPRINT=x \
    WINDOWS_TIMESTAMP_URL=https://timestamp.example.com \
    bash "$metadata_script"
)
assert_output v2.0.0 true true false "$manual_signed_artifacts_output"

git -C "$test_repo" tag v2.0.1 "$second_commit"
lightweight_output="$temp_dir/lightweight-output"
(
  cd "$test_repo"
  env \
    EVENT_NAME=workflow_dispatch \
    PACKAGE_VERSION=2.0.1 \
    INPUT_STABLE=false \
    GITHUB_SHA="$second_commit" \
    GITHUB_OUTPUT="$lightweight_output" \
    bash "$metadata_script"
)
assert_output v2.0.1 false false false "$lightweight_output"

git -C "$test_repo" tag -a v2.0.2 -m "annotated release" "$second_commit"
annotated_output="$temp_dir/annotated-output"
(
  cd "$test_repo"
  env \
    EVENT_NAME=workflow_dispatch \
    PACKAGE_VERSION=2.0.2 \
    INPUT_STABLE=false \
    GITHUB_SHA="$second_commit" \
    GITHUB_OUTPUT="$annotated_output" \
    bash "$metadata_script"
)
assert_output v2.0.2 false false false "$annotated_output"

git -C "$test_repo" tag v2.0.3 "$first_commit"
if (
  cd "$test_repo"
  env \
    EVENT_NAME=workflow_dispatch \
    PACKAGE_VERSION=2.0.3 \
    INPUT_STABLE=false \
    GITHUB_SHA="$second_commit" \
    GITHUB_OUTPUT="$temp_dir/mismatched-tag-output" \
    bash "$metadata_script"
); then
  echo "Expected an existing tag on another commit to fail" >&2
  exit 1
fi

if env \
  EVENT_NAME=push \
  REF_NAME=v9.9.9 \
  PACKAGE_VERSION=1.0.0 \
  GITHUB_OUTPUT="$(mktemp)" \
  bash "$metadata_script"; then
  echo "Expected a mismatched release tag to fail" >&2
  exit 1
fi
