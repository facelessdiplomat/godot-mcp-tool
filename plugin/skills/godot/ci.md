# Continuous integration

A GitHub Actions workflow that checks the game on every push and pull request: it downloads the official Godot
build, imports the project, runs its tests and exports a Linux build that it keeps as an artifact.

## Before writing it

- The Godot version: `godot_status` names the version of the editor, such as 4.7.2. The workflow downloads the same
  version, written as the release names it: 4.7.2, or 4.7 for the first release of 4.7.
- The tests: GUT lives in `res://addons/gut`, gdUnit4 in `res://addons/gdUnit4`. The workflow runs the copy in the
  repository, so the addon folder must be committed. A project without tests needs some first; see
  [testing.md](testing.md).
- The export preset: `res://export_presets.cfg` must be committed and hold a preset for Linux; `export_preset_add`
  with `platform: "Linux"` adds one named "Linux". Passwords and signing keys do not belong in it: Godot keeps them
  in `.godot/export_credentials.cfg`, and `.godot/` is not committed.
- The default branch of the repository, `main` in the example below. Assets kept in Git LFS need `lfs: true` in the
  checkout step.

## Pin what it downloads

- Godot: the workflow checks each archive against its SHA-512 sum, written into the workflow. Read the sums from
  `SHA512-SUMS.txt` of the release, and use the lines without `mono`, which are for C# projects:

```bash
curl -sL https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/SHA512-SUMS.txt | grep -E " Godot_v4.7.2-stable_(linux.x86_64.zip|export_templates.tpz)$"
```

- Actions: by the full commit SHA of a release, since a tag such as `v7` can move. The example pins
  actions/checkout v7.0.1, actions/cache v6.1.0 and actions/upload-artifact v7.0.2;
  `gh api repos/actions/checkout/commits/v7.0.1 --jq .sha` prints such a SHA.

## The workflow

`.github/workflows/godot.yml`, for a project with GUT tests in `res://test` and a preset named "Linux":

```yaml
name: Godot

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

env:
  GODOT_VERSION: 4.7.2
  GODOT_SHA512: 9aa00f7a605200940bce3027a567b782f49bd8e940dd06ae9e987bd65aee1b1467edd56ed84fcdcbdd44354bf613bdbb4e5d2913e925850368e150c59ed54c65
  TEMPLATES_SHA512: ca4d71c4d7b81dfc15d1a98baa07534aa95b03fdda78a0075b06672e1648d2e5f40980c9adc28d23e1b92e732ee7bf3461997aa804af74ec2fcd7a93ccb84079
  RELEASES: https://github.com/godotengine/godot-builds/releases/download

jobs:
  check:
    name: Test and export
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    defaults:
      run:
        shell: bash
    steps:
      - name: Check out the repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false

      - name: Download Godot
        run: |
          archive="Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"
          curl --fail --silent --show-error --location --output "$RUNNER_TEMP/$archive" "$RELEASES/${GODOT_VERSION}-stable/$archive"
          echo "$GODOT_SHA512  $RUNNER_TEMP/$archive" | sha512sum --check --strict
          unzip -q "$RUNNER_TEMP/$archive" -d "$RUNNER_TEMP/godot"
          echo "GODOT=$RUNNER_TEMP/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64" >> "$GITHUB_ENV"

      - name: Import the project
        run: '"$GODOT" --headless --path . --import'

      - name: Run the tests
        run: |
          "$GODOT" --headless --path . -s res://addons/gut/gut_cmdln.gd -gexit -gdisable_colors -gdir=res://test -ginclude_subdirs 2>&1 | tee "$RUNNER_TEMP/tests.log"
          if grep -E "^SCRIPT ERROR: (Parse|Compile) Error: " "$RUNNER_TEMP/tests.log"; then
            echo "::error::A script failed to load, so its tests did not run."
            exit 1
          fi

      - name: Restore the export templates
        id: templates
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: ~/.local/share/godot/export_templates/${{ env.GODOT_VERSION }}.stable
          key: godot-linux-templates-${{ env.GODOT_VERSION }}

      - name: Download the export templates
        if: steps.templates.outputs.cache-hit != 'true'
        run: |
          archive="Godot_v${GODOT_VERSION}-stable_export_templates.tpz"
          templates="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"
          curl --fail --silent --show-error --location --output "$RUNNER_TEMP/$archive" "$RELEASES/${GODOT_VERSION}-stable/$archive"
          echo "$TEMPLATES_SHA512  $RUNNER_TEMP/$archive" | sha512sum --check --strict
          mkdir -p "$templates"
          unzip -q -j "$RUNNER_TEMP/$archive" "templates/linux_*.x86_64" templates/version.txt -d "$templates"
          rm "$RUNNER_TEMP/$archive"

      - name: Export for Linux
        run: |
          mkdir -p build/linux
          "$GODOT" --headless --path . --export-release "Linux" build/linux/game.x86_64

      - name: Keep the build
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
        with:
          name: game-linux
          path: build/linux
          if-no-files-found: error
```

- `shell: bash` makes a pipe fail when its first command fails, so a failed test fails the step through `tee`.
- GUT exits with 1 when a test fails, but with 0 when a test script does not load at all; the `grep` catches that
  case, which `test_run` reports as a script that failed to load. A project with `.gutconfig.json` can drop `-gdir`
  and `-ginclude_subdirs`: GUT reads that file by itself.
- gdUnit4 instead of GUT: run
  `"$GODOT" --headless --path . -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -c -a res://test`
  without the `grep`. It reports script errors itself and exits with 0 when every test passes, 100 when a test
  fails, 101 when tests leave orphan nodes behind and 105 on script errors; append `|| [ $? -eq 101 ]` to accept
  orphan nodes.
- `--export-release` needs the export templates of the same version; the full archive is about 1.3 GB, so the first
  run downloads it and keeps only the Linux templates in the cache for the next runs. Other platforms export from the
  same runner: add their template files to the `unzip` line, such as `"templates/windows_*_x86_64.exe"` for a
  "Windows Desktop" preset, and an export step per preset. Name the file after the game instead of `game`.

## Check it before pushing

- Run the import and the tests locally the same way: the import with the Godot executable that `godot_status`
  names, `<godot> --headless --path . --import`, and the tests with `test_run`, which uses the same command line.
- Tell the user what the first run should show: an import without errors, the same number of tests as `test_run`
  ran, a template download of about 1.3 GB that later runs restore from the cache, and the `game-linux` artifact on
  the summary page of the run.
