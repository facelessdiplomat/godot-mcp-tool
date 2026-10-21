#!/usr/bin/env bash
set -euo pipefail

gut_version="v9.7.1"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_directory="${repository_root}/test-project/addons/gut"
download_directory="$(mktemp -d)"
trap 'rm -rf "${download_directory}"' EXIT

git -c advice.detachedHead=false clone --quiet --depth 1 --branch "${gut_version}" https://github.com/bitwes/Gut.git "${download_directory}/gut"
rm -rf "${target_directory}"
mkdir -p "$(dirname "${target_directory}")"
cp -R "${download_directory}/gut/addons/gut" "${target_directory}"
echo "Installed GUT ${gut_version} into ${target_directory}"
