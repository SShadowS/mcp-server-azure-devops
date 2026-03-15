import {
  RunState,
  RunResult,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import { computeBuildOutcome, formatPipelineRun } from './format-run';
import type { PipelineRunDetails } from '../types';

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

describe('formatPipelineRun', () => {
  const baseRun = {
    id: 636518,
    name: '28.0.0.194865',
    state: RunState.Completed,
    result: RunResult.Failed,
    createdDate: new Date('2026-03-14T20:48:47.618Z'),
    finishedDate: new Date('2026-03-14T21:15:47.015Z'),
    pipeline: {
      id: 973,
      revision: 2,
      name: 'Document Output CI PR',
      folder: '\\',
      url: 'https://api/pipelines/973',
    },
    url: 'https://dev.azure.com/org/project/_apis/pipelines/973/runs/636518',
    _links: {
      self: {
        href: 'https://dev.azure.com/org/project/_apis/pipelines/973/runs/636518',
      },
      web: {
        href: 'https://dev.azure.com/org/project/_build/results?buildId=636518',
      },
    },
    templateParameters: {},
    resources: { repositories: {} },
    yamlDetails: {
      includedTemplates: [{ yamlFile: 'build.yml', repoAlias: 'self' }],
    },
    artifacts: [{ name: 'drop', type: 'PipelineArtifact' }],
  } as unknown as PipelineRunDetails;

  it('adds buildOutcome as first key', () => {
    const formatted = formatPipelineRun(baseRun);
    const keys = Object.keys(formatted);
    expect(keys[0]).toBe('buildOutcome');
    expect(formatted.buildOutcome).toBe('failed');
  });
  it('converts state and result to strings', () => {
    const formatted = formatPipelineRun(baseRun);
    expect(formatted.state).toBe('completed');
    expect(formatted.result).toBe('failed');
  });
  it('uses web URL as primary url', () => {
    const formatted = formatPipelineRun(baseRun);
    expect(formatted.url).toBe(
      'https://dev.azure.com/org/project/_build/results?buildId=636518',
    );
  });
  it('places yamlDetails and artifacts after core fields', () => {
    const formatted = formatPipelineRun(baseRun);
    const keys = Object.keys(formatted);
    expect(keys.indexOf('yamlDetails')).toBeGreaterThan(keys.indexOf('id'));
    expect(keys.indexOf('artifacts')).toBeGreaterThan(keys.indexOf('id'));
  });
  it('preserves API URL in _links.self', () => {
    const formatted = formatPipelineRun(baseRun);
    expect(formatted._links?.self?.href).toBe(
      'https://dev.azure.com/org/project/_apis/pipelines/973/runs/636518',
    );
  });
});
