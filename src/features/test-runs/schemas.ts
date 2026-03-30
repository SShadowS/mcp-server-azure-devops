// src/features/test-runs/schemas.ts
import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

/**
 * Schema for getting test case results
 */
export const GetTestCaseResultsSchema = z.object({
  workItemId: z.number().int().min(1).describe('The test case work item ID'),
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
