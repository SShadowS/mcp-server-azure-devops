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
