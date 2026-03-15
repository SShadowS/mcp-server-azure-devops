import {
  RunState,
  RunResult,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import { computeBuildOutcome } from './format-run';

describe('computeBuildOutcome', () => {
  it('returns "succeeded" when state=Completed and result=Succeeded', () => {
    expect(computeBuildOutcome(RunState.Completed, RunResult.Succeeded)).toBe(
      'succeeded',
    );
  });
  it('returns "failed" when state=Completed and result=Failed', () => {
    expect(computeBuildOutcome(RunState.Completed, RunResult.Failed)).toBe(
      'failed',
    );
  });
  it('returns "canceled" when state=Completed and result=Canceled', () => {
    expect(computeBuildOutcome(RunState.Completed, RunResult.Canceled)).toBe(
      'canceled',
    );
  });
  it('returns "unknown" when state=Completed and result=Unknown', () => {
    expect(computeBuildOutcome(RunState.Completed, RunResult.Unknown)).toBe(
      'unknown',
    );
  });
  it('returns "inProgress" when state=InProgress', () => {
    expect(computeBuildOutcome(RunState.InProgress, RunResult.Unknown)).toBe(
      'inProgress',
    );
  });
  it('returns "canceling" when state=Canceling', () => {
    expect(computeBuildOutcome(RunState.Canceling, RunResult.Unknown)).toBe(
      'canceling',
    );
  });
  it('returns "unknown" when state=Unknown', () => {
    expect(computeBuildOutcome(RunState.Unknown, RunResult.Unknown)).toBe(
      'unknown',
    );
  });
  it('returns "unknown" when state and result are undefined', () => {
    expect(computeBuildOutcome(undefined, undefined)).toBe('unknown');
  });
});
