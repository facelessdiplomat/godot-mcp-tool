import { parseXml, type XmlElement } from '../util/XmlDocument.js';

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestCaseResult {
  readonly suite: string;
  readonly name: string;
  readonly status: TestStatus;
  readonly location?: string;
  readonly message?: string;
}

const outcomeElements = new Set(['failure', 'error', 'skipped']);
const scriptLocationPattern = /(res:\/\/[^\s'"]+?\.gd):(\d+)/;
const gutLinePattern = /^\s*at line (\d+)\s*$/m;
const locationLinePatterns = [/^\s*at line \d+\s*$/, /^\s*at '.*' in res:\/\/\S+:\d+\s*$/];

export function readJUnitReport(xml: string): TestCaseResult[] {
  const root = parseXml(xml);
  const suites = root.name === 'testsuite' ? [root] : root.children.filter((child) => child.name === 'testsuite');
  return suites.flatMap((suite) => {
    const suitePath = suitePathOf(suite);
    return suite.children.filter((child) => child.name === 'testcase').map((testCase) => readTestCase(suitePath, testCase));
  });
}

function suitePathOf(suite: XmlElement): string {
  const name = (suite.attributes['name'] ?? '').replace(/^res:\/\//, '');
  if (name.endsWith('.gd')) {
    return `res://${name}`;
  }
  const directory = (suite.attributes['package'] ?? '').replace(/^res:\/\//, '');
  return directory === '' ? `res://${name}.gd` : `res://${directory}/${name}.gd`;
}

function readTestCase(suite: string, testCase: XmlElement): TestCaseResult {
  const name = testCase.attributes['name'] ?? '';
  const outcome = testCase.children.find((child) => outcomeElements.has(child.name));
  if (outcome === undefined) {
    return { suite, name, status: 'passed' };
  }
  const location = locationOf(suite, outcome);
  const message = messageOf(outcome.text);
  return {
    suite,
    name,
    status: outcome.name === 'skipped' ? 'skipped' : 'failed',
    ...(location === undefined ? {} : { location }),
    ...(message === '' ? {} : { message }),
  };
}

function locationOf(suite: string, outcome: XmlElement): string | undefined {
  const scriptLocation = scriptLocationPattern.exec(outcome.attributes['message'] ?? '') ?? scriptLocationPattern.exec(outcome.text);
  if (scriptLocation !== null) {
    return `${scriptLocation[1] ?? ''}:${scriptLocation[2] ?? ''}`;
  }
  const gutLine = gutLinePattern.exec(outcome.text)?.[1];
  return gutLine === undefined ? undefined : `${suite}:${gutLine}`;
}

function messageOf(text: string): string {
  return text
    .split('\n')
    .filter((line) => !locationLinePatterns.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim();
}
