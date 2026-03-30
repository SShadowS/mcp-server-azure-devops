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
