import { describe, expect, it } from 'vitest';
import { readJUnitReport } from '../../src/testing/JUnitReport.js';

const gutReport = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<testsuites name="GutTests" failures="1" tests="3" >',
  '  <testsuite name="test/test_math_gut.gd" tests="3" failures="1" skipped="1" time="0.001028" >',
  '      <testcase name="test_adds_numbers" assertions="1" status="pass" classname="test/test_math_gut.gd" time="0.000891" >',
  '      </testcase>',
  '      <testcase name="test_fails_on_purpose" assertions="1" status="fail" classname="test/test_math_gut.gd" time="0.000092" >',
  '      <failure message="failed"><![CDATA[[2] expected to equal [3]:  one plus one',
  '            at line 9]]></failure></testcase>',
  '      <testcase name="test_pending_one" assertions="0" status="pending" classname="test/test_math_gut.gd" time="0.000045" >',
  '      <skipped message="pending"><![CDATA[not written yet]]></skipped></testcase>',
  '  </testsuite>',
  '</testsuites>',
].join('\n');

const gdUnitReport = [
  '<?xml version="1.0" encoding="UTF-8" ?>',
  '<testsuites id="2026-10-22" name="report_1" tests="3" failures="2" skipped="0" flaky="0" time="0.000">',
  '\t<testsuite id="0" name="math_test" package="test" timestamp="2026-10-22T13:57:27" hostname="localhost" tests="3" failures="2" errors="1" skipped="0" flaky="0" time="0.005">',
  '\t\t<testcase name="test_adds_numbers" classname="math_test" time="0.002">',
  '\t\t</testcase>',
  '\t\t<testcase name="test_fails_on_purpose" classname="math_test" time="0.002">',
  '\t\t\t<failure message="FAILED: res://test/math_test.gd:9" type="FAILURE">',
  '<![CDATA[',
  'Expecting:',
  ' 3',
  ' but was',
  ' 2',
  "\tat 'test_fails_on_purpose' in res://test/math_test.gd:9",
  ']]>',
  '\t\t\t</failure>',
  '\t\t</testcase>',
  '\t\t<testcase name="test_crashes" classname="math_test" time="0.001">',
  '\t\t\t<error message="ERROR: res://test/math_test.gd:13" type="ABORT">',
  '<![CDATA[',
  'Invalid call. Nonexistent function \'jump\' in base \'Nil\'.',
  ']]>',
  '\t\t\t</error>',
  '\t\t</testcase>',
  '\t</testsuite>',
  '</testsuites>',
].join('\n');

describe('readJUnitReport', () => {
  it('reads a GUT report with the line of each failure', () => {
    expect(readJUnitReport(gutReport)).toEqual([
      { suite: 'res://test/test_math_gut.gd', name: 'test_adds_numbers', status: 'passed' },
      {
        suite: 'res://test/test_math_gut.gd',
        name: 'test_fails_on_purpose',
        status: 'failed',
        location: 'res://test/test_math_gut.gd:9',
        message: '[2] expected to equal [3]:  one plus one',
      },
      { suite: 'res://test/test_math_gut.gd', name: 'test_pending_one', status: 'skipped', message: 'not written yet' },
    ]);
  });

  it('reads a gdUnit4 report with failures and errors', () => {
    expect(readJUnitReport(gdUnitReport)).toEqual([
      { suite: 'res://test/math_test.gd', name: 'test_adds_numbers', status: 'passed' },
      { suite: 'res://test/math_test.gd', name: 'test_fails_on_purpose', status: 'failed', location: 'res://test/math_test.gd:9', message: 'Expecting:\n 3\n but was\n 2' },
      { suite: 'res://test/math_test.gd', name: 'test_crashes', status: 'failed', location: 'res://test/math_test.gd:13', message: "Invalid call. Nonexistent function 'jump' in base 'Nil'." },
    ]);
  });

  it('reads a report without tests', () => {
    expect(readJUnitReport('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="GutTests" failures="0" tests="0" >\n</testsuites>')).toEqual([]);
  });
});
