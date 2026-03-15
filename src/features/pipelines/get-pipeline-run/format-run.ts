import {
  RunState,
  RunResult,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import type { PipelineRunDetails } from '../types';

export type BuildOutcome =
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'partiallySucceeded'
  | 'inProgress'
  | 'canceling'
  | 'unknown';

const RUN_STATE_NAMES: Record<number, string> = {
  [RunState.Unknown]: 'unknown',
  [RunState.InProgress]: 'inProgress',
  [RunState.Canceling]: 'canceling',
  [RunState.Completed]: 'completed',
};

const RUN_RESULT_NAMES: Record<number, string> = {
  [RunResult.Unknown]: 'unknown',
  [RunResult.Succeeded]: 'succeeded',
  [RunResult.Failed]: 'failed',
  [RunResult.Canceled]: 'canceled',
};

export function resolveRunState(state: RunState | number | undefined): string {
  if (state === undefined || state === null) return 'unknown';
  return RUN_STATE_NAMES[state] ?? 'unknown';
}

export function resolveRunResult(
  result: RunResult | number | undefined,
): string {
  if (result === undefined || result === null) return 'unknown';
  return RUN_RESULT_NAMES[result] ?? 'unknown';
}

export function computeBuildOutcome(
  state: RunState | number | undefined,
  result: RunResult | number | undefined,
): BuildOutcome {
  const stateName = resolveRunState(state);
  if (stateName !== 'completed') {
    return stateName as BuildOutcome;
  }
  const resultName = resolveRunResult(result);
  return resultName as BuildOutcome;
}

export interface FormattedPipelineRun {
  buildOutcome: BuildOutcome;
  id: number | undefined;
  name: string | undefined;
  state: string;
  result: string;
  createdDate: Date | undefined;
  finishedDate: Date | undefined;
  pipeline: any;
  url: string | undefined;
  _links: any;
  resources: any;
  templateParameters: any;
  variables: any;
  yamlDetails: any;
  artifacts: any;
  [key: string]: unknown;
}

export function formatPipelineRun(
  run: PipelineRunDetails,
): FormattedPipelineRun {
  const buildOutcome = computeBuildOutcome(
    run.state as unknown as number,
    run.result as unknown as number,
  );
  const webUrl = run._links?.web?.href;
  return {
    buildOutcome,
    id: run.id,
    name: run.name,
    state: resolveRunState(run.state as unknown as number),
    result: resolveRunResult(run.result as unknown as number),
    createdDate: run.createdDate,
    finishedDate: run.finishedDate,
    pipeline: run.pipeline,
    url: webUrl ?? run.url,
    _links: run._links,
    resources: run.resources,
    templateParameters: run.templateParameters,
    variables: run.variables,
    yamlDetails: (run as any).yamlDetails,
    artifacts: (run as any).artifacts,
  };
}
