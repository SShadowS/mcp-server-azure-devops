// src/features/test-runs/get-test-case-results/format-results.spec.unit.ts
import {
  formatDuration,
  applyOutcomeFilter,
  mergeStepsWithResults,
} from './format-results';
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
    {
      stepNumber: 1,
      outcome: 'Passed',
      action: 'a',
      expectedResult: '',
      comment: null,
    },
    {
      stepNumber: 2,
      outcome: 'Failed',
      action: 'b',
      expectedResult: '',
      comment: 'bug',
    },
    {
      stepNumber: 3,
      outcome: 'Unspecified',
      action: 'c',
      expectedResult: '',
      comment: null,
    },
    {
      stepNumber: 4,
      outcome: 'Blocked',
      action: 'd',
      expectedResult: '',
      comment: null,
    },
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
      {
        stepNumber: 1,
        outcome: 'Passed',
        action: 'Do action 1',
        expectedResult: 'Result 1',
        comment: null,
      },
      {
        stepNumber: 2,
        outcome: 'Failed',
        action: 'Do action 2',
        expectedResult: 'Result 2',
        comment: 'Value mismatch',
      },
    ]);
  });

  it('should use step definition order when no action results match', () => {
    const stepDefs: TestStepDefinition[] = [
      { stepId: 2, action: 'Do action 1', expectedResult: 'Result 1' },
    ];

    const result = mergeStepsWithResults(stepDefs, [], null);
    expect(result).toEqual([
      {
        stepNumber: 1,
        outcome: 'Unspecified',
        action: 'Do action 1',
        expectedResult: 'Result 1',
        comment: null,
      },
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

    const result = mergeStepsWithResults(
      stepDefs,
      actionResults,
      'Overall iteration comment',
    );
    expect(result).toEqual([
      {
        stepNumber: 1,
        outcome: 'Failed',
        action: 'Do action',
        expectedResult: '',
        comment: 'Overall iteration comment',
      },
    ]);
  });
});
