# `get_test_case_results` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `get_test_case_results` MCP tool that returns the latest test execution results (including per-step outcomes and comments) for a test case work item, enabling AI agents to investigate test failures.

**Architecture:** Single tool in a new `test-runs` feature module. Chains Work Item Tracking API (validate test case, get step definitions from Steps XML) with Test API (query latest test result, get iteration step outcomes). Correlates step definitions with action results by step ID.

**Tech Stack:** TypeScript, Zod, azure-devops-node-api (ITestApi, IWorkItemTrackingApi), fast-xml-parser (for Steps XML)

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/features/test-runs/types.ts` | Create | TypeScript interfaces for formatted output |
| `src/features/test-runs/schemas.ts` | Create | Zod schema for `GetTestCaseResultsSchema` |
| `src/features/test-runs/get-test-case-results/schema.ts` | Create | Re-exports schema |
| `src/features/test-runs/get-test-case-results/parse-steps-xml.ts` | Create | Parse `Microsoft.VSTS.TCM.Steps` XML into step definitions |
| `src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts` | Create | Tests for XML parser |
| `src/features/test-runs/get-test-case-results/format-results.ts` | Create | Format API data into output shape |
| `src/features/test-runs/get-test-case-results/format-results.spec.unit.ts` | Create | Tests for formatter |
| `src/features/test-runs/get-test-case-results/feature.ts` | Create | Core implementation — API call chain |
| `src/features/test-runs/get-test-case-results/feature.spec.unit.ts` | Create | Tests for feature with mocked APIs |
| `src/features/test-runs/get-test-case-results/index.ts` | Create | Re-exports |
| `src/features/test-runs/tool-definitions.ts` | Create | MCP tool definition |
| `src/features/test-runs/index.ts` | Create | Feature entry point with request handler |
| `src/server.ts` | Modify | Register test-runs feature |

---

### Task 1: Install XML parser dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install fast-xml-parser**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npm install fast-xml-parser
```

This lightweight XML parser will be used to parse the `Microsoft.VSTS.TCM.Steps` field from test case work items. The Steps field contains an XML string with step definitions (action text and expected results).

- [ ] **Step 2: Verify installation**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && node -e "const { XMLParser } = require('fast-xml-parser'); console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add package.json package-lock.json && git commit -m "chore: add fast-xml-parser dependency for test steps XML parsing"
```

---

### Task 2: Create types and schema

**Files:**
- Create: `src/features/test-runs/types.ts`
- Create: `src/features/test-runs/schemas.ts`
- Create: `src/features/test-runs/get-test-case-results/schema.ts`

- [ ] **Step 1: Create types.ts**

```typescript
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
```

- [ ] **Step 2: Create schemas.ts**

```typescript
// src/features/test-runs/schemas.ts
import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

/**
 * Schema for getting test case results
 */
export const GetTestCaseResultsSchema = z.object({
  workItemId: z
    .number()
    .int()
    .min(1)
    .describe('The test case work item ID'),
  project: z
    .string()
    .optional()
    .describe(`The project name or ID (Default: ${defaultProject})`),
  outcomeFilter: z
    .enum(['failed', 'not_passed'])
    .optional()
    .describe(
      'Filter steps by outcome. "failed" returns only Failed steps. "not_passed" returns all non-Passed steps (Failed, Unspecified, Blocked, etc.). Omit to return all steps.',
    ),
});
```

- [ ] **Step 3: Create get-test-case-results/schema.ts**

```typescript
// src/features/test-runs/get-test-case-results/schema.ts
export { GetTestCaseResultsSchema } from '../schemas';
```

- [ ] **Step 4: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/features/test-runs/types.ts src/features/test-runs/schemas.ts src/features/test-runs/get-test-case-results/schema.ts && git commit -m "feat(test-runs): add types and schema for get_test_case_results"
```

---

### Task 3: Create Steps XML parser with tests

**Files:**
- Create: `src/features/test-runs/get-test-case-results/parse-steps-xml.ts`
- Create: `src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts`

The `Microsoft.VSTS.TCM.Steps` field contains XML like:
```xml
<steps id="0" last="5">
  <step id="2" type="ActionStep">
    <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;Set up a customer&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;Customer exists&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
    <description/>
  </step>
  <step id="4" type="ActionStep">
    <parameterizedString isformatted="true">&lt;P&gt;Do something&lt;/P&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
    <description/>
  </step>
</steps>
```

Each `<step>` has two `<parameterizedString>` children: first is the action, second is the expected result. The text is HTML-encoded within the XML attributes.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts
import { parseStepsXml, stripHtml } from './parse-steps-xml';

describe('stripHtml', () => {
  it('should strip HTML tags from text', () => {
    expect(stripHtml('<DIV><P>Hello world</P></DIV>')).toBe('Hello world');
  });

  it('should handle plain text without tags', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('should return empty string for empty paragraph', () => {
    expect(stripHtml('<P></P>')).toBe('');
  });

  it('should handle nested tags', () => {
    expect(stripHtml('<DIV><P><B>bold</B> and normal</P></DIV>')).toBe(
      'bold and normal',
    );
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('&lt;value&gt; &amp; &quot;quoted&quot;')).toBe(
      '<value> & "quoted"',
    );
  });
});

describe('parseStepsXml', () => {
  it('should parse steps with action and expected result', () => {
    const xml = `<steps id="0" last="3">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Set up a customer&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;Customer exists&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
      <step id="4" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Click submit&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      { stepId: 2, action: 'Set up a customer', expectedResult: 'Customer exists' },
      { stepId: 4, action: 'Click submit', expectedResult: '' },
    ]);
  });

  it('should handle single step', () => {
    const xml = `<steps id="0" last="1">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Do something&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;Something happens&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      { stepId: 2, action: 'Do something', expectedResult: 'Something happens' },
    ]);
  });

  it('should return empty array for empty or undefined input', () => {
    expect(parseStepsXml('')).toEqual([]);
    expect(parseStepsXml(undefined as unknown as string)).toEqual([]);
  });

  it('should handle HTML-wrapped content in parameterizedString', () => {
    const xml = `<steps id="0" last="1">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;Inspect the generated PDF filename and note the values for %4 and %7.&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;The filename contains the resolved values for %4 and %7.&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      {
        stepId: 2,
        action: 'Inspect the generated PDF filename and note the values for %4 and %7.',
        expectedResult: 'The filename contains the resolved values for %4 and %7.',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: FAIL — module `./parse-steps-xml` not found.

- [ ] **Step 3: Implement parse-steps-xml.ts**

```typescript
// src/features/test-runs/get-test-case-results/parse-steps-xml.ts
import { XMLParser } from 'fast-xml-parser';
import { TestStepDefinition } from '../types';

/**
 * Strip HTML tags from a string and decode common HTML entities.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  // Decode HTML entities first
  let text = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, '');
  return text.trim();
}

/**
 * Parse the Microsoft.VSTS.TCM.Steps XML field into step definitions.
 *
 * The XML format is:
 * <steps id="0" last="N">
 *   <step id="2" type="ActionStep">
 *     <parameterizedString isformatted="true">HTML-encoded action</parameterizedString>
 *     <parameterizedString isformatted="true">HTML-encoded expected result</parameterizedString>
 *     <description/>
 *   </step>
 *   ...
 * </steps>
 *
 * Step IDs are sequential even numbers (2, 4, 6, ...).
 * Each step has two parameterizedString children: action and expected result.
 */
export function parseStepsXml(xml: string): TestStepDefinition[] {
  if (!xml) return [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'step' || name === 'parameterizedString',
  });

  const parsed = parser.parse(xml);
  const steps = parsed?.steps?.step;
  if (!steps || !Array.isArray(steps)) return [];

  return steps.map((step: Record<string, unknown>) => {
    const strings = step.parameterizedString as string[] | undefined;
    const actionRaw = Array.isArray(strings) ? String(strings[0] ?? '') : '';
    const expectedRaw = Array.isArray(strings) ? String(strings[1] ?? '') : '';

    return {
      stepId: Number(step['@_id']),
      action: stripHtml(actionRaw),
      expectedResult: stripHtml(expectedRaw),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/features/test-runs/get-test-case-results/parse-steps-xml.ts src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts && git commit -m "feat(test-runs): add Steps XML parser with tests"
```

---

### Task 4: Create response formatter with tests

**Files:**
- Create: `src/features/test-runs/get-test-case-results/format-results.ts`
- Create: `src/features/test-runs/get-test-case-results/format-results.spec.unit.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/test-runs/get-test-case-results/format-results.spec.unit.ts
import { formatDuration, applyOutcomeFilter, mergeStepsWithResults } from './format-results';
import { TestStepDefinition } from '../types';
import { TestActionResultModel } from 'azure-devops-node-api/interfaces/TestInterfaces';

describe('formatDuration', () => {
  it('should format milliseconds into human-readable duration', () => {
    expect(formatDuration(625000)).toBe('10m 25s');
  });

  it('should handle hours', () => {
    expect(formatDuration(3661000)).toBe('1h 1m 1s');
  });

  it('should handle seconds only', () => {
    expect(formatDuration(45000)).toBe('45s');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('should return null for undefined input', () => {
    expect(formatDuration(undefined)).toBeNull();
  });
});

describe('applyOutcomeFilter', () => {
  const steps = [
    { stepNumber: 1, outcome: 'Passed', action: 'a', expectedResult: '', comment: null },
    { stepNumber: 2, outcome: 'Failed', action: 'b', expectedResult: '', comment: 'bug' },
    { stepNumber: 3, outcome: 'Unspecified', action: 'c', expectedResult: '', comment: null },
    { stepNumber: 4, outcome: 'Blocked', action: 'd', expectedResult: '', comment: null },
  ];

  it('should return all steps when filter is undefined', () => {
    expect(applyOutcomeFilter(steps, undefined)).toEqual(steps);
  });

  it('should return only Failed steps for "failed" filter', () => {
    const result = applyOutcomeFilter(steps, 'failed');
    expect(result).toEqual([steps[1]]);
  });

  it('should return non-Passed steps for "not_passed" filter', () => {
    const result = applyOutcomeFilter(steps, 'not_passed');
    expect(result).toEqual([steps[1], steps[2], steps[3]]);
  });
});

describe('mergeStepsWithResults', () => {
  it('should merge step definitions with action results by step ID', () => {
    const stepDefs: TestStepDefinition[] = [
      { stepId: 2, action: 'Do action 1', expectedResult: 'Result 1' },
      { stepId: 4, action: 'Do action 2', expectedResult: 'Result 2' },
    ];

    const actionResults: TestActionResultModel[] = [
      {
        actionPath: '00000002',
        outcome: 'Passed',
        stepIdentifier: '2',
      } as TestActionResultModel,
      {
        actionPath: '00000004',
        outcome: 'Failed',
        stepIdentifier: '4',
        errorMessage: 'Value mismatch',
      } as TestActionResultModel,
    ];

    const result = mergeStepsWithResults(stepDefs, actionResults, null);
    expect(result).toEqual([
      { stepNumber: 1, outcome: 'Passed', action: 'Do action 1', expectedResult: 'Result 1', comment: null },
      { stepNumber: 2, outcome: 'Failed', action: 'Do action 2', expectedResult: 'Result 2', comment: 'Value mismatch' },
    ]);
  });

  it('should use step definition order when no action results match', () => {
    const stepDefs: TestStepDefinition[] = [
      { stepId: 2, action: 'Do action 1', expectedResult: 'Result 1' },
    ];

    const result = mergeStepsWithResults(stepDefs, [], null);
    expect(result).toEqual([
      { stepNumber: 1, outcome: 'Unspecified', action: 'Do action 1', expectedResult: 'Result 1', comment: null },
    ]);
  });

  it('should use iteration comment for step if action result has no errorMessage', () => {
    const stepDefs: TestStepDefinition[] = [
      { stepId: 2, action: 'Do action', expectedResult: '' },
    ];

    const actionResults: TestActionResultModel[] = [
      {
        actionPath: '00000002',
        outcome: 'Failed',
        stepIdentifier: '2',
      } as TestActionResultModel,
    ];

    const result = mergeStepsWithResults(stepDefs, actionResults, 'Overall iteration comment');
    expect(result).toEqual([
      { stepNumber: 1, outcome: 'Failed', action: 'Do action', expectedResult: '', comment: 'Overall iteration comment' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/format-results.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: FAIL — module `./format-results` not found.

- [ ] **Step 3: Implement format-results.ts**

```typescript
// src/features/test-runs/get-test-case-results/format-results.ts
import {
  TestActionResultModel,
  TestCaseResult,
  TestIterationDetailsModel,
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
 * - "failed": only steps with "Failed" outcome
 * - "not_passed": all steps except "Passed"
 * - undefined: all steps
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
 * Merge step definitions (from Steps XML) with action results (from Test API)
 * by matching step IDs. Step definitions provide action/expected text;
 * action results provide outcome/comment.
 *
 * The actionPath in TestActionResultModel is a hex-encoded step ID
 * (e.g., step id 2 = "00000002").
 */
export function mergeStepsWithResults(
  stepDefs: TestStepDefinition[],
  actionResults: TestActionResultModel[],
  iterationComment: string | null,
): FormattedTestStep[] {
  // Build a lookup from step ID to action result
  const resultsByStepId = new Map<number, TestActionResultModel>();
  for (const ar of actionResults) {
    // actionPath is hex (e.g., "00000002") or stepIdentifier is the decimal string
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
    const comment = actionResult?.errorMessage ?? (outcome !== 'Passed' ? iterationComment : null) ?? null;

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
export function formatLatestRun(
  result: TestCaseResult,
): FormattedLatestRun {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/format-results.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/features/test-runs/get-test-case-results/format-results.ts src/features/test-runs/get-test-case-results/format-results.spec.unit.ts && git commit -m "feat(test-runs): add response formatter with tests"
```

---

### Task 5: Create core feature implementation with tests

**Files:**
- Create: `src/features/test-runs/get-test-case-results/feature.ts`
- Create: `src/features/test-runs/get-test-case-results/feature.spec.unit.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/test-runs/get-test-case-results/feature.spec.unit.ts
import { WebApi } from 'azure-devops-node-api';
import { getTestCaseResults } from './feature';

// Mock the Azure DevOps API
const mockGetWorkItem = jest.fn();
const mockGetTestResultsByQuery = jest.fn();
const mockGetTestIterations = jest.fn();

const mockConnection = {
  getWorkItemTrackingApi: jest.fn().mockResolvedValue({
    getWorkItem: mockGetWorkItem,
  }),
  getTestApi: jest.fn().mockResolvedValue({
    getTestResultsByQuery: mockGetTestResultsByQuery,
    getTestIterations: mockGetTestIterations,
  }),
} as unknown as WebApi;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTestCaseResults', () => {
  it('should return formatted test case results with step outcomes', async () => {
    // Arrange: work item is a test case
    mockGetWorkItem.mockResolvedValue({
      id: 75863,
      fields: {
        'System.WorkItemType': 'Test Case',
        'System.Title': 'TC: Single statement — merge fields %4 and %7',
        'System.State': 'Ready',
        'Microsoft.VSTS.TCM.Steps': `<steps id="0" last="2">
          <step id="2" type="ActionStep">
            <parameterizedString isformatted="true">&lt;P&gt;Set up a customer&lt;/P&gt;</parameterizedString>
            <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
            <description/>
          </step>
          <step id="4" type="ActionStep">
            <parameterizedString isformatted="true">&lt;P&gt;Inspect the PDF&lt;/P&gt;</parameterizedString>
            <parameterizedString isformatted="true">&lt;P&gt;Values match&lt;/P&gt;</parameterizedString>
            <description/>
          </step>
        </steps>`,
      },
    });

    // Arrange: test results query returns one result
    mockGetTestResultsByQuery.mockResolvedValue({
      results: [
        {
          id: 100001,
          testRun: { id: '1190801', name: 'Run 1190801' },
          outcome: 'Failed',
          runBy: { displayName: 'Daniel Stello' },
          startedDate: new Date('2026-03-27T14:05:00Z'),
          completedDate: new Date('2026-03-27T14:15:25Z'),
          durationInMs: 625000,
          configuration: { name: 'Windows 10' },
          testSuite: { id: '73264', name: 'Document Output - Release 28.0' },
          comment: null,
          errorMessage: null,
        },
      ],
    });

    // Arrange: iterations return step-level outcomes
    mockGetTestIterations.mockResolvedValue([
      {
        id: 1,
        outcome: 'Failed',
        actionResults: [
          { actionPath: '00000002', stepIdentifier: '2', outcome: 'Passed' },
          {
            actionPath: '00000004',
            stepIdentifier: '4',
            outcome: 'Failed',
            errorMessage: 'The count for "Next Statement" is 1 too low.',
          },
        ],
      },
    ]);

    // Act
    const result = await getTestCaseResults(mockConnection, {
      workItemId: 75863,
      project: 'MyProject',
    });

    // Assert
    expect(result.testCase).toEqual({
      id: 75863,
      title: 'TC: Single statement — merge fields %4 and %7',
      state: 'Ready',
    });
    expect(result.latestRun).toMatchObject({
      runId: 1190801,
      outcome: 'Failed',
      runBy: 'Daniel Stello',
      duration: '10m 25s',
    });
    expect(result.steps).toEqual([
      {
        stepNumber: 1,
        outcome: 'Passed',
        action: 'Set up a customer',
        expectedResult: '',
        comment: null,
      },
      {
        stepNumber: 2,
        outcome: 'Failed',
        action: 'Inspect the PDF',
        expectedResult: 'Values match',
        comment: 'The count for "Next Statement" is 1 too low.',
      },
    ]);
  });

  it('should throw error when work item is not a Test Case', async () => {
    mockGetWorkItem.mockResolvedValue({
      id: 12345,
      fields: {
        'System.WorkItemType': 'Bug',
        'System.Title': 'Some bug',
        'System.State': 'Active',
      },
    });

    await expect(
      getTestCaseResults(mockConnection, {
        workItemId: 12345,
        project: 'MyProject',
      }),
    ).rejects.toThrow('Work item 12345 is a "Bug", not a Test Case');
  });

  it('should return null latestRun and empty steps when no test results exist', async () => {
    mockGetWorkItem.mockResolvedValue({
      id: 99999,
      fields: {
        'System.WorkItemType': 'Test Case',
        'System.Title': 'Untested TC',
        'System.State': 'Design',
        'Microsoft.VSTS.TCM.Steps': '<steps id="0" last="1"><step id="2" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Do something&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString><description/></step></steps>',
      },
    });

    mockGetTestResultsByQuery.mockResolvedValue({
      results: [],
    });

    const result = await getTestCaseResults(mockConnection, {
      workItemId: 99999,
      project: 'MyProject',
    });

    expect(result.testCase.id).toBe(99999);
    expect(result.latestRun).toBeNull();
    expect(result.steps).toEqual([]);
  });

  it('should apply outcomeFilter "failed"', async () => {
    mockGetWorkItem.mockResolvedValue({
      id: 100,
      fields: {
        'System.WorkItemType': 'Test Case',
        'System.Title': 'TC',
        'System.State': 'Ready',
        'Microsoft.VSTS.TCM.Steps': `<steps id="0" last="2">
          <step id="2" type="ActionStep">
            <parameterizedString isformatted="true">&lt;P&gt;Step 1&lt;/P&gt;</parameterizedString>
            <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
            <description/>
          </step>
          <step id="4" type="ActionStep">
            <parameterizedString isformatted="true">&lt;P&gt;Step 2&lt;/P&gt;</parameterizedString>
            <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
            <description/>
          </step>
        </steps>`,
      },
    });

    mockGetTestResultsByQuery.mockResolvedValue({
      results: [
        {
          id: 1,
          testRun: { id: '100' },
          outcome: 'Failed',
          runBy: { displayName: 'Tester' },
          startedDate: new Date(),
          completedDate: new Date(),
          durationInMs: 1000,
          configuration: null,
          testSuite: null,
          comment: null,
          errorMessage: null,
        },
      ],
    });

    mockGetTestIterations.mockResolvedValue([
      {
        id: 1,
        actionResults: [
          { actionPath: '00000002', stepIdentifier: '2', outcome: 'Passed' },
          { actionPath: '00000004', stepIdentifier: '4', outcome: 'Failed', errorMessage: 'Broken' },
        ],
      },
    ]);

    const result = await getTestCaseResults(mockConnection, {
      workItemId: 100,
      project: 'MyProject',
      outcomeFilter: 'failed',
    });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].outcome).toBe('Failed');
    expect(result.steps[0].action).toBe('Step 2');
  });

  it('should throw AzureDevOpsResourceNotFoundError when work item not found', async () => {
    mockGetWorkItem.mockResolvedValue(null);

    await expect(
      getTestCaseResults(mockConnection, {
        workItemId: 999999,
        project: 'MyProject',
      }),
    ).rejects.toThrow('Work item 999999 not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/feature.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: FAIL — module `./feature` not found.

- [ ] **Step 3: Implement feature.ts**

```typescript
// src/features/test-runs/get-test-case-results/feature.ts
import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
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

    const workItemType =
      workItem.fields?.['System.WorkItemType'] as string | undefined;
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
        testCaseId: options.workItemId,
        resultsCount: 1,
      },
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npx jest src/features/test-runs/get-test-case-results/feature.spec.unit.ts --config jest.unit.config.js --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/features/test-runs/get-test-case-results/feature.ts src/features/test-runs/get-test-case-results/feature.spec.unit.ts && git commit -m "feat(test-runs): add getTestCaseResults implementation with tests"
```

---

### Task 6: Create tool definition, re-exports, and feature index

**Files:**
- Create: `src/features/test-runs/get-test-case-results/index.ts`
- Create: `src/features/test-runs/tool-definitions.ts`
- Create: `src/features/test-runs/index.ts`

- [ ] **Step 1: Create get-test-case-results/index.ts**

```typescript
// src/features/test-runs/get-test-case-results/index.ts
export * from './feature';
export * from './schema';
```

- [ ] **Step 2: Create tool-definitions.ts**

```typescript
// src/features/test-runs/tool-definitions.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { GetTestCaseResultsSchema } from './get-test-case-results/schema';

export const testRunsTools: ToolDefinition[] = [
  {
    name: 'get_test_case_results',
    description:
      'Get the latest test execution results for a test case work item, including per-step outcomes and failure comments. Use this to investigate why a test case failed.',
    inputSchema: zodToJsonSchema(GetTestCaseResultsSchema),
    mcp_enabled: true,
  },
];
```

- [ ] **Step 3: Create index.ts (feature entry point)**

```typescript
// src/features/test-runs/index.ts
export * from './types';
export * from './get-test-case-results';
export * from './tool-definitions';

import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { GetTestCaseResultsSchema } from './get-test-case-results';
import { getTestCaseResults } from './get-test-case-results';
import { defaultProject } from '../../utils/environment';

/**
 * Checks if the request is for the test-runs feature.
 */
export const isTestRunsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  return ['get_test_case_results'].includes(request.params.name);
};

/**
 * Handles test-runs feature requests.
 */
export const handleTestRunsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'get_test_case_results': {
      const args = GetTestCaseResultsSchema.parse(request.params.arguments);
      const result = await getTestCaseResults(connection, {
        ...args,
        project: args.project ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown test-runs tool: ${request.params.name}`);
  }
};
```

- [ ] **Step 4: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/features/test-runs/get-test-case-results/index.ts src/features/test-runs/tool-definitions.ts src/features/test-runs/index.ts && git commit -m "feat(test-runs): add tool definition and feature entry point"
```

---

### Task 7: Register feature in server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add import for test-runs feature**

Add this import block alongside the other feature imports in `src/server.ts` (after the wikis import around line 77):

```typescript
import {
  testRunsTools,
  isTestRunsRequest,
  handleTestRunsRequest,
} from './features/test-runs';
```

- [ ] **Step 2: Add testRunsTools to allTools array**

In the `allTools` array (around line 140), add `...testRunsTools` after `...wikisTools`:

```typescript
  const allTools: ToolDefinition[] = [
    ...usersTools,
    ...organizationsTools,
    ...projectsTools,
    ...repositoriesTools,
    ...workItemsTools,
    ...searchTools,
    ...pullRequestsTools,
    ...pipelinesTools,
    ...wikisTools,
    ...testRunsTools,
  ];
```

- [ ] **Step 3: Add request routing**

In the request routing section (around line 371, after the wikis handler), add:

```typescript
      if (isTestRunsRequest(request)) {
        return await handleTestRunsRequest(connection, request);
      }
```

- [ ] **Step 4: Commit**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add src/server.ts && git commit -m "feat(test-runs): register test-runs feature in server"
```

---

### Task 8: Build, lint, and run all tests

**Files:** None (verification only)

- [ ] **Step 1: Run linter and formatter**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npm run lint:fix && npm run format
```

Expected: No errors. Some files may be auto-formatted.

- [ ] **Step 2: Build the project**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Run unit tests**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && npm run test:unit
```

Expected: All tests pass, including the new test-runs tests.

- [ ] **Step 4: Fix any issues found, then commit**

If lint/format changed files:

```bash
cd /u/Git/mcp/mcp-server-azure-devops && git add -u && git commit -m "chore: fix lint and format for test-runs feature"
```

- [ ] **Step 5: Verify the new tool appears in tool list**

```bash
cd /u/Git/mcp/mcp-server-azure-devops && node -e "const { testRunsTools } = require('./dist/features/test-runs'); console.log(JSON.stringify(testRunsTools.map(t => t.name)));"
```

Expected: `["get_test_case_results"]`
