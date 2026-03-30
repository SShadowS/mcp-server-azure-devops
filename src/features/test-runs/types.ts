// src/features/test-runs/types.ts

/**
 * A single test step definition parsed from the work item Steps XML.
 */
export interface TestStepDefinition {
  /** Step ID from the XML (even numbers: 2, 4, 6, ...) */
  stepId: number;
  /** Action text (HTML stripped) */
  action: string;
  /** Expected result text (HTML stripped) */
  expectedResult: string;
}

/**
 * A formatted test step with execution result merged in.
 */
export interface FormattedTestStep {
  stepNumber: number;
  outcome: string;
  action: string;
  expectedResult: string;
  comment: string | null;
}

/**
 * Formatted test suite reference.
 */
export interface FormattedTestSuite {
  id: number;
  name: string;
}

/**
 * Formatted latest test run information.
 */
export interface FormattedLatestRun {
  runId: number;
  outcome: string;
  runBy: string;
  startedDate: string | null;
  completedDate: string | null;
  duration: string | null;
  configuration: string | null;
  testSuite: FormattedTestSuite | null;
  comment: string | null;
  errorMessage: string | null;
}

/**
 * Formatted test case metadata.
 */
export interface FormattedTestCase {
  id: number;
  title: string;
  state: string;
}

/**
 * Complete formatted response from get_test_case_results.
 */
export interface FormattedTestCaseResult {
  testCase: FormattedTestCase;
  latestRun: FormattedLatestRun | null;
  steps: FormattedTestStep[];
}
