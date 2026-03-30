// src/features/test-runs/get-test-case-results/format-results.ts
import {
  TestActionResultModel,
  TestCaseResult,
} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {
  FormattedTestCaseResult,
  FormattedTestStep,
  FormattedLatestRun,
  FormattedTestCase,
  TestStepDefinition,
} from '../types';

/**
 * Format milliseconds into a human-readable duration string (e.g., "10m 25s").
 */
export function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined || ms === null) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Filter steps by outcome.
 */
export function applyOutcomeFilter(
  steps: FormattedTestStep[],
  filter: 'failed' | 'not_passed' | undefined,
): FormattedTestStep[] {
  if (!filter) return steps;
  if (filter === 'failed') {
    return steps.filter((s) => s.outcome === 'Failed');
  }
  return steps.filter((s) => s.outcome !== 'Passed');
}

/**
 * Merge step definitions (from Steps XML) with action results (from Test API).
 */
export function mergeStepsWithResults(
  stepDefs: TestStepDefinition[],
  actionResults: TestActionResultModel[],
  iterationComment: string | null,
): FormattedTestStep[] {
  const resultsByStepId = new Map<number, TestActionResultModel>();
  for (const ar of actionResults) {
    const stepId = ar.stepIdentifier
      ? Number(ar.stepIdentifier)
      : ar.actionPath
        ? parseInt(ar.actionPath, 16)
        : 0;
    if (stepId > 0) {
      resultsByStepId.set(stepId, ar);
    }
  }

  return stepDefs.map((def, index) => {
    const actionResult = resultsByStepId.get(def.stepId);
    const outcome = actionResult?.outcome ?? 'Unspecified';
    const comment =
      actionResult?.errorMessage ??
      (outcome !== 'Passed' ? iterationComment : null) ??
      null;

    return {
      stepNumber: index + 1,
      outcome,
      action: def.action,
      expectedResult: def.expectedResult,
      comment,
    };
  });
}

/**
 * Format a TestCaseResult into the latest run section of the response.
 */
export function formatLatestRun(result: TestCaseResult): FormattedLatestRun {
  const runId = result.testRun?.id ? Number(result.testRun.id) : 0;
  const runBy =
    result.runBy?.displayName ?? result.runBy?.uniqueName ?? 'Unknown';

  return {
    runId,
    outcome: result.outcome ?? 'Unspecified',
    runBy,
    startedDate: result.startedDate?.toISOString() ?? null,
    completedDate: result.completedDate?.toISOString() ?? null,
    duration: formatDuration(result.durationInMs),
    configuration: result.configuration?.name ?? null,
    testSuite: result.testSuite?.id
      ? { id: Number(result.testSuite.id), name: result.testSuite.name ?? '' }
      : null,
    comment: result.comment ?? null,
    errorMessage: result.errorMessage ?? null,
  };
}

/**
 * Format the complete test case result response.
 */
export function formatTestCaseResult(
  testCase: FormattedTestCase,
  latestRun: FormattedLatestRun | null,
  steps: FormattedTestStep[],
): FormattedTestCaseResult {
  return { testCase, latestRun, steps };
}
