#!/usr/bin/env bash
set -euo pipefail

gdunit4_version="v6.2.2"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_directory="${repository_root}/test-project/addons/gdUnit4"
download_directory="$(mktemp -d)"
trap 'rm -rf "${download_directory}"' EXIT

git -c advice.detachedHead=false clone --quiet --depth 1 --branch "${gdunit4_version}" https://github.com/godot-gdunit-labs/gdUnit4.git "${download_directory}/gdunit4"
mkdir -p "${download_directory}/package"
git -C "${download_directory}/gdunit4" archive --format=tar HEAD addons/gdUnit4 | tar -x -C "${download_directory}/package"
rm -rf "${target_directory}"
mkdir -p "$(dirname "${target_directory}")"
cp -R "${download_directory}/package/addons/gdUnit4" "${target_directory}"
echo "Installed gdUnit4 ${gdunit4_version} into ${target_directory}"
