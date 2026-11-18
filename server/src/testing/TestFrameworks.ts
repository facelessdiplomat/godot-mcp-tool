import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type TestFrameworkName = 'GUT' | 'gdUnit4';

export type TestFrameworkKey = 'gut' | 'gdunit4';

export interface TestRunPlan {
  readonly directories: readonly string[];
  readonly scripts: readonly string[];
  readonly testName: string | undefined;
  readonly reportDirectory: string;
  readonly headless: boolean;
}

export interface TestFrameworkRelease {
  readonly tag: string;
  readonly commit: string;
  readonly repository: string;
  readonly addonFolder: string;
  readonly testBase: string;
}

export interface TestFramework {
  readonly key: TestFrameworkKey;
  readonly name: TestFrameworkName;
  readonly release: TestFrameworkRelease;
  readonly entryScript: string;
  readonly selectsTestsByName: boolean;
  readonly configurationFile: string | undefined;
  readonly testConvention: string;
  commandArguments(plan: TestRunPlan): string[];
  findReport(reportDirectory: string): string | undefined;
}

const resourcePrefix = 'res://';

export function entryScriptFile(projectRoot: string, framework: TestFramework): string {
  return join(projectRoot, framework.entryScript.slice(resourcePrefix.length));
}

export const gutFramework: TestFramework = {
  key: 'gut',
  name: 'GUT',
  release: { tag: 'v9.7.1', commit: 'aeb5d4f3f7f0a6c9b5e178876d6c99b791fda605', repository: 'https://github.com/bitwes/Gut.git', addonFolder: 'gut', testBase: 'GutTest' },
  entryScript: 'res://addons/gut/gut_cmdln.gd',
  selectsTestsByName: true,
  configurationFile: '.gutconfig.json',
  testConvention: 'GUT runs scripts whose file names start with "test_" and that extend GutTest.',
  commandArguments: (plan) => [
    '-gexit',
    '-gdisable_colors',
    `-gjunit_xml_file=${plan.reportDirectory}/gut.xml`,
    ...(plan.directories.length > 0 ? [`-gdir=${plan.directories.join(',')}`, '-ginclude_subdirs'] : []),
    ...(plan.scripts.length > 0 ? [`-gtest=${plan.scripts.join(',')}`] : []),
    ...(plan.testName === undefined ? [] : [`-gunit_test_name=${plan.testName}`]),
  ],
  findReport: (reportDirectory) => {
    const reportFile = join(reportDirectory, 'gut.xml');
    return existsSync(reportFile) ? reportFile : undefined;
  },
};

export const gdUnitFramework: TestFramework = {
  key: 'gdunit4',
  name: 'gdUnit4',
  release: {
    tag: 'v6.2.2',
    commit: '0127a55f4543dfc24746f6e5c7ba6f94105d51f2',
    repository: 'https://github.com/godot-gdunit-labs/gdUnit4.git',
    addonFolder: 'gdUnit4',
    testBase: 'GdUnitTestSuite',
  },
  entryScript: 'res://addons/gdUnit4/bin/GdUnitCmdTool.gd',
  selectsTestsByName: false,
  configurationFile: undefined,
  testConvention: 'gdUnit4 runs scripts that extend GdUnitTestSuite.',
  commandArguments: (plan) => [
    ...(plan.headless ? ['--ignoreHeadlessMode'] : []),
    '-c',
    '-rd',
    plan.reportDirectory,
    ...[...plan.directories, ...plan.scripts].flatMap((path) => ['-a', path]),
  ],
  findReport: (reportDirectory) => {
    if (!existsSync(reportDirectory)) {
      return undefined;
    }
    const reportFiles = readdirSync(reportDirectory)
      .filter((entry) => entry.startsWith('report_'))
      .map((entry) => join(reportDirectory, entry, 'results.xml'))
      .filter((reportFile) => existsSync(reportFile));
    return reportFiles.at(-1);
  },
};

export const testFrameworks: readonly TestFramework[] = [gutFramework, gdUnitFramework];
