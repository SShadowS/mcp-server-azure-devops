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
        'Microsoft.VSTS.TCM.Steps':
          '<steps id="0" last="1"><step id="2" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Do something&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString><description/></step></steps>',
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
          {
            actionPath: '00000004',
            stepIdentifier: '4',
            outcome: 'Failed',
            errorMessage: 'Broken',
          },
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
