# Design: `get_test_case_results` Tool

**Date:** 2026-03-30
**Status:** Draft

## Problem

When an AI agent reads a Test Case work item via `get_work_item`, it only gets the work item fields (title, state, steps XML). It cannot see test execution results — which steps passed, which failed, and the failure comments. This data lives in the Azure DevOps Test API, which the MCP server does not currently expose.

An AI agent investigating a test failure needs this data to understand what went wrong and correct the code.

## Solution

A single tool — `get_test_case_results` — that takes a test case work item ID and returns the latest test execution results including per-step outcomes and comments.

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workItemId` | number | yes | The test case work item ID |
| `project` | string | no | Project name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `outcomeFilter` | enum | no | Filter steps by outcome. Values: `"failed"`, `"not_passed"`, omitted = all steps |

- `"failed"` — only steps with `Failed` outcome
- `"not_passed"` — steps with any outcome other than `Passed` (includes `Failed`, `Unspecified`, `Blocked`, etc.)
- omitted — all steps returned (default)

### Output Shape

```json
{
  "testCase": {
    "id": 75863,
    "title": "TC: Single statement — merge fields %4 and %7 consistent bet...",
    "state": "Ready"
  },
  "latestRun": {
    "runId": 1190801,
    "outcome": "Failed",
    "runBy": "Daniel Stello",
    "startedDate": "2026-03-27T14:05:00Z",
    "completedDate": "2026-03-27T14:15:25Z",
    "duration": "10m 25s",
    "configuration": "Windows 10",
    "testSuite": { "id": 73264, "name": "Document Output - Release 28.0" },
    "comment": null,
    "errorMessage": null
  },
  "steps": [
    {
      "stepNumber": 1,
      "outcome": "Passed",
      "action": "Set up a customer with existing statements and note the current Last Statement No.",
      "expectedResult": "",
      "comment": null
    },
    {
      "stepNumber": 4,
      "outcome": "Failed",
      "action": "Inspect the generated PDF filename and note the values for %4 and %7.",
      "expectedResult": "The filename contains the resolved values for %4 and %7.",
      "comment": "The count for \"Next Statement\" is 1 too low."
    }
  ]
}
```

### Error Cases

- Work item not found → `AzureDevOpsResourceNotFoundError`
- Work item is not a Test Case type → descriptive error message
- No test runs exist for this test case → return response with `latestRun: null` and `steps: []`
- Test API permissions insufficient → `AzureDevOpsAuthenticationError`

## API Call Chain

The tool chains these Azure DevOps API calls internally:

1. **Work Item Tracking API** — `getWorkItem(workItemId)` → fetch test case title, state, and work item type validation
2. **Test API** — `queryTestResultsReportForBuild()` or `getTestResults()` with work item filtering → find test results linked to this work item, sorted by date to identify the latest run
3. **Test API** — from the latest `TestCaseResult`, extract `runId` and `testCaseResultId`
4. **Test API** — `getTestIterations(project, runId, testCaseResultId, includeActionResults: true)` → get per-step `actionResults` with outcomes, action text, expected results, and comments

The `outcomeFilter` is applied after fetching all step results, filtering the `steps` array before returning.

## Feature Structure

```
src/features/test-runs/
├── index.ts                          # Exports, isTestRunsRequest, handleTestRunsRequest
├── tool-definitions.ts               # get_test_case_results tool definition
├── schemas.ts                        # Zod schemas (GetTestCaseResultsSchema)
├── types.ts                          # FormattedTestCaseResult, FormattedStep, etc.
├── get-test-case-results/
│   ├── index.ts                      # Re-exports
│   ├── schema.ts                     # Re-exports from ../schemas.ts
│   ├── feature.ts                    # Core implementation (API call chain)
│   ├── format-results.ts             # Response formatter
│   └── feature.spec.unit.ts          # Unit tests (mocked API calls)
```

### Registration

- Add `testRunsTools` to `allTools` array in `src/server.ts`
- Add `isTestRunsRequest` / `handleTestRunsRequest` routing in the request handler

## Testing Strategy

### Unit Tests (required)

- Mocked API responses for the full call chain
- Verify correct output shape
- Verify `outcomeFilter` filtering logic (all 3 modes)
- Verify error handling (not found, not a test case, no runs)
- Verify response formatting (duration calculation, field mapping)

### Integration Tests (if credentials available)

- Real API call against a known test case with execution history
- Verify end-to-end data flow

## Non-Goals

- Listing test runs across a project or plan (reporting use case — not needed now)
- Creating or updating test runs/results
- Parsing the work item's `Microsoft.VSTS.TCM.Steps` XML separately
- Historical run selection (only latest run returned)
