// src/features/test-runs/get-test-case-results/feature.ts
import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  ResultsFilter,
  TestCaseResult,
  TestResultsQuery,
} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '@/shared/errors';
import { defaultProject } from '@/utils/environment';
import { FormattedTestCaseResult } from '../types';
import { parseStepsXml } from './parse-steps-xml';
import {
  formatLatestRun,
  formatTestCaseResult,
  mergeStepsWithResults,
  applyOutcomeFilter,
} from './format-results';

export interface GetTestCaseResultsOptions {
  workItemId: number;
  project?: string;
  outcomeFilter?: 'failed' | 'not_passed';
}

export async function getTestCaseResults(
  connection: WebApi,
  options: GetTestCaseResultsOptions,
): Promise<FormattedTestCaseResult> {
  const project = options.project ?? defaultProject;

  try {
    // Step 1: Fetch work item and validate it's a Test Case
    const witApi = await connection.getWorkItemTrackingApi();
    const workItem = await witApi.getWorkItem(
      options.workItemId,
      undefined,
      undefined,
      WorkItemExpand.None,
    );

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item ${options.workItemId} not found`,
      );
    }

    const workItemType = workItem.fields?.['System.WorkItemType'] as
      | string
      | undefined;
    if (workItemType !== 'Test Case') {
      throw new AzureDevOpsError(
        `Work item ${options.workItemId} is a "${workItemType}", not a Test Case`,
      );
    }

    const testCase = {
      id: options.workItemId,
      title: (workItem.fields?.['System.Title'] as string) ?? '',
      state: (workItem.fields?.['System.State'] as string) ?? '',
    };

    // Step 2: Parse step definitions from Steps XML
    const stepsXml =
      (workItem.fields?.['Microsoft.VSTS.TCM.Steps'] as string) ?? '';
    const stepDefs = parseStepsXml(stepsXml);

    // Step 3: Query for the latest test result for this test case
    const testApi = await connection.getTestApi();
    const query: TestResultsQuery = {
      resultsFilter: {
        automatedTestName: '',
        testCaseId: options.workItemId,
        resultsCount: 1,
      } as ResultsFilter,
    };
    const queryResult = await testApi.getTestResultsByQuery(query, project);
    const results: TestCaseResult[] = queryResult?.results ?? [];

    if (results.length === 0) {
      return formatTestCaseResult(testCase, null, []);
    }

    // Step 4: Get the latest result and its iteration details
    const latestResult = results[0];
    const latestRun = formatLatestRun(latestResult);

    const runId = latestResult.testRun?.id
      ? Number(latestResult.testRun.id)
      : 0;
    const testCaseResultId = latestResult.id ?? 0;

    if (runId === 0 || testCaseResultId === 0) {
      return formatTestCaseResult(testCase, latestRun, []);
    }

    // Step 5: Get test iterations with action results
    const iterations = await testApi.getTestIterations(
      project,
      runId,
      testCaseResultId,
      true, // includeActionResults
    );

    // Use the last iteration (most recent execution)
    const lastIteration =
      iterations && iterations.length > 0
        ? iterations[iterations.length - 1]
        : undefined;

    const actionResults = lastIteration?.actionResults ?? [];
    const iterationComment = lastIteration?.comment ?? null;

    // Step 6: Merge step definitions with action results and apply filter
    const mergedSteps = mergeStepsWithResults(
      stepDefs,
      actionResults,
      iterationComment,
    );
    const filteredSteps = applyOutcomeFilter(
      mergedSteps,
      options.outcomeFilter,
    );

    return formatTestCaseResult(testCase, latestRun, filteredSteps);
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('authentication') ||
        message.includes('unauthorized') ||
        message.includes('401')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }
      if (
        message.includes('not found') ||
        message.includes('does not exist') ||
        message.includes('404')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Resource not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to get test case results: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
