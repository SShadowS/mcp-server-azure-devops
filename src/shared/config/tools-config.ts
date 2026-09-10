/**
 * Tools configuration for enabling/disabling features and individual tools at runtime
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Feature names corresponding to feature modules
 */
export const FEATURE_NAMES = [
  'users',
  'organizations',
  'projects',
  'repositories',
  'work-items',
  'search',
  'pull-requests',
  'pipelines',
  'wikis',
  'test-runs',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/**
 * Mapping of feature names to their tool names
 */
export const FEATURE_TOOLS: Record<FeatureName, string[]> = {
  users: ['get_me'],
  organizations: ['list_organizations'],
  projects: ['list_projects', 'get_project', 'get_project_details'],
  repositories: [
    'get_repository',
    'get_repository_details',
    'list_repositories',
    'get_file_content',
    'get_all_repositories_tree',
    'get_repository_tree',
    'create_branch',
    'create_commit',
    'list_commits',
  ],
  'work-items': [
    'list_work_items',
    'get_work_item',
    'create_work_item',
    'update_work_item',
    'manage_work_item_link',
    'get_work_item_comments',
  ],
  search: ['search_code', 'search_wiki', 'search_work_items'],
  'pull-requests': [
    'create_pull_request',
    'list_pull_requests',
    'get_pull_request_comments',
    'add_pull_request_comment',
    'update_pull_request',
    'get_pull_request_changes',
    'get_pull_request_checks',
    'update_pull_request_comment',
  ],
  pipelines: [
    'list_pipelines',
    'get_pipeline',
    'list_pipeline_runs',
    'get_pipeline_run',
    'download_pipeline_artifact',
    'pipeline_timeline',
    'get_pipeline_log',
    'trigger_pipeline',
  ],
  wikis: [
    'get_wikis',
    'get_wiki_page',
    'create_wiki',
    'update_wiki_page',
    'list_wiki_pages',
    'create_wiki_page',
  ],
  'test-runs': ['get_test_case_results'],
};

/**
 * Build a reverse mapping from tool name to feature name
 */
export const TOOL_TO_FEATURE: Record<string, FeatureName> = Object.entries(
  FEATURE_TOOLS,
).reduce(
  (acc, [feature, tools]) => {
    for (const tool of tools) {
      acc[tool] = feature as FeatureName;
    }
    return acc;
  },
  {} as Record<string, FeatureName>,
);

/**
 * Tools that only read from Azure DevOps.
 *
 * This is an allowlist on purpose: `isWriteTool` treats anything absent from
 * this set as a write, so a newly added tool is blocked in read-only mode until
 * someone classifies it deliberately. `WRITE_TOOLS` exists so the unit tests can
 * assert that every tool the server exposes has been classified.
 */
export const READ_TOOLS: ReadonlySet<string> = new Set([
  // users
  'get_me',
  // organizations
  'list_organizations',
  // projects
  'list_projects',
  'get_project',
  'get_project_details',
  // repositories
  'get_repository',
  'get_repository_details',
  'list_repositories',
  'get_file_content',
  'get_all_repositories_tree',
  'get_repository_tree',
  'list_commits',
  // work items
  'list_work_items',
  'get_work_item',
  'get_work_item_comments',
  // search
  'search_code',
  'search_wiki',
  'search_work_items',
  // pull requests
  'list_pull_requests',
  'get_pull_request_comments',
  'get_pull_request_changes',
  'get_pull_request_checks',
  // pipelines
  'list_pipelines',
  'get_pipeline',
  'list_pipeline_runs',
  'get_pipeline_run',
  'download_pipeline_artifact',
  'pipeline_timeline',
  'get_pipeline_log',
  // wikis
  'get_wikis',
  'get_wiki_page',
  'list_wiki_pages',
  // test runs
  'get_test_case_results',
]);

/**
 * Tools that create, modify, or otherwise cause side effects in Azure DevOps.
 *
 * `trigger_pipeline` is included: it stores nothing itself, but it starts real
 * builds and deployments, which is not something a read-only server should do.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  // repositories
  'create_branch',
  'create_commit',
  // work items
  'create_work_item',
  'update_work_item',
  'manage_work_item_link',
  // pull requests
  'create_pull_request',
  'add_pull_request_comment',
  'update_pull_request',
  'update_pull_request_comment',
  // pipelines
  'trigger_pipeline',
  // wikis
  'create_wiki',
  'update_wiki_page',
  'create_wiki_page',
]);

/**
 * Check whether a tool performs a write.
 *
 * Unknown tools are reported as writes so that read-only mode fails closed.
 *
 * @param toolName The name of the tool to check
 * @returns true if the tool writes, or is not classified as a read
 */
export function isWriteTool(toolName: string): boolean {
  return !READ_TOOLS.has(toolName);
}

/**
 * Zod schema for the tools configuration file
 */
export const ToolsConfigSchema = z
  .object({
    features: z
      .record(
        z.enum(FEATURE_NAMES as unknown as [string, ...string[]]),
        z.boolean(),
      )
      .optional()
      .default({}),
    tools: z
      .object({
        disabled: z.array(z.string()).optional().default([]),
      })
      .optional()
      .default({ disabled: [] }),
    readOnly: z.boolean().optional(),
  })
  .default({});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Default configuration - all features enabled, no tools disabled
 */
export const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  features: {},
  tools: { disabled: [] },
  readOnly: false,
};

/**
 * Environment variables that can enable read-only mode, in precedence order.
 * The namespaced name matches the rest of the server's configuration; the bare
 * name is accepted so a host can flip every MCP server it runs at once.
 */
const READ_ONLY_ENV_VARS = ['AZURE_DEVOPS_READ_ONLY', 'READ_ONLY'] as const;

const TRUTHY_ENV_VALUES = new Set(['true', '1', 'yes']);
const FALSY_ENV_VALUES = new Set(['false', '0', 'no']);

/**
 * Parse a boolean environment variable.
 *
 * @param value The raw environment variable value
 * @param name The variable name, used for the warning on unrecognized values
 * @returns true/false when the variable is set, undefined when it is unset or empty
 */
function parseBooleanEnv(
  value: string | undefined,
  name: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '') {
    return undefined;
  }
  if (TRUTHY_ENV_VALUES.has(normalized)) {
    return true;
  }
  if (!FALSY_ENV_VALUES.has(normalized)) {
    process.stderr.write(
      `WARNING: Unrecognized value '${value}' for ${name}. Treating it as false.\n`,
    );
  }
  return false;
}

/**
 * Resolve read-only mode from the environment.
 *
 * @returns true/false when one of the variables is set, undefined otherwise
 */
function resolveReadOnlyFromEnv(): boolean | undefined {
  for (const name of READ_ONLY_ENV_VARS) {
    const parsed = parseBooleanEnv(process.env[name], name);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Log whether read-only mode is active, so the reason a write tool is missing
 * from the tool list is visible in the server's stderr output.
 *
 * @param config The resolved tools configuration
 */
function logReadOnly(config: ToolsConfig): void {
  if (config.readOnly) {
    process.stderr.write(
      `  Read-only mode: ON (${WRITE_TOOLS.size} write tools disabled)\n`,
    );
  }
}

/**
 * Load the tools configuration from a JSON file
 *
 * @param configPath Optional path to the config file. If not provided, uses
 *                   AZURE_DEVOPS_TOOLS_CONFIG env var or defaults to ./tools.config.json
 * @returns The parsed tools configuration
 */
export function loadToolsConfig(configPath?: string): ToolsConfig {
  const effectivePath =
    configPath ||
    process.env.AZURE_DEVOPS_TOOLS_CONFIG ||
    path.join(process.cwd(), 'tools.config.json');

  const envReadOnly = resolveReadOnlyFromEnv();

  // If the file doesn't exist, all features and tools are enabled, but the
  // read-only environment variable still applies.
  if (!fs.existsSync(effectivePath)) {
    const config: ToolsConfig = {
      ...DEFAULT_TOOLS_CONFIG,
      tools: { ...DEFAULT_TOOLS_CONFIG.tools },
      readOnly: envReadOnly ?? DEFAULT_TOOLS_CONFIG.readOnly ?? false,
    };
    logReadOnly(config);
    return config;
  }

  try {
    const configContent = fs.readFileSync(effectivePath, 'utf-8');
    const rawConfig = JSON.parse(configContent);
    const parsedConfig: ToolsConfig = {
      ...ToolsConfigSchema.parse(rawConfig),
    };
    parsedConfig.readOnly = envReadOnly ?? parsedConfig.readOnly ?? false;

    // Log loaded configuration
    const disabledFeatures = FEATURE_NAMES.filter(
      (f) => !isFeatureEnabled(f, parsedConfig),
    );
    const disabledTools = parsedConfig.tools?.disabled || [];

    process.stderr.write(
      `DEBUG - Tools config loaded from: ${effectivePath}\n`,
    );
    if (disabledFeatures.length > 0) {
      process.stderr.write(
        `  Disabled features: ${disabledFeatures.join(', ')}\n`,
      );
    }
    if (disabledTools.length > 0) {
      process.stderr.write(`  Disabled tools: ${disabledTools.join(', ')}\n`);
    }
    if (disabledFeatures.length === 0 && disabledTools.length === 0) {
      process.stderr.write('  All features and tools enabled\n');
    }
    logReadOnly(parsedConfig);

    return parsedConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in tools config file at ${effectivePath}: ${error.message}`,
      );
    }
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Invalid tools config file at ${effectivePath}:\n${issues}`,
      );
    }
    throw error;
  }
}

/**
 * Check if a feature is enabled in the configuration
 *
 * Features default to enabled (true) if not explicitly specified
 *
 * @param featureName The name of the feature to check
 * @param config The tools configuration
 * @returns true if the feature is enabled
 */
export function isFeatureEnabled(
  featureName: FeatureName,
  config: ToolsConfig,
): boolean {
  // If the feature is not specified in config, it's enabled by default
  if (config.features?.[featureName] === undefined) {
    return true;
  }
  return config.features[featureName];
}

/**
 * Check if a tool is enabled in the configuration
 *
 * A tool is disabled if:
 * 1. Read-only mode is on and the tool is not a known read tool, OR
 * 2. Its parent feature is disabled, OR
 * 3. It's explicitly listed in tools.disabled
 *
 * Read-only mode can only remove tools; it never re-enables a tool that the
 * configuration disabled.
 *
 * @param toolName The name of the tool to check
 * @param config The tools configuration
 * @returns true if the tool is enabled
 */
export function isToolEnabled(toolName: string, config: ToolsConfig): boolean {
  // Check if read-only mode blocks this tool
  if (config.readOnly && isWriteTool(toolName)) {
    return false;
  }

  // Check if the tool's feature is disabled
  const featureName = TOOL_TO_FEATURE[toolName];
  if (featureName && !isFeatureEnabled(featureName, config)) {
    return false;
  }

  // Check if the tool is explicitly disabled
  if (config.tools?.disabled?.includes(toolName)) {
    return false;
  }

  return true;
}

/**
 * Explain why a tool is unavailable.
 *
 * Used by the CallTool handler so a caller can tell read-only mode apart from
 * an ordinary tools.config.json exclusion.
 *
 * @param toolName The name of the tool to check
 * @param config The tools configuration
 * @returns A human-readable reason, or undefined if the tool is enabled
 */
export function getToolDisabledReason(
  toolName: string,
  config: ToolsConfig,
): string | undefined {
  if (isToolEnabled(toolName, config)) {
    return undefined;
  }

  if (config.readOnly && isWriteTool(toolName)) {
    return (
      `Tool '${toolName}' performs a write and is disabled because the server ` +
      `is running in read-only mode. Unset AZURE_DEVOPS_READ_ONLY (or READ_ONLY) ` +
      `to enable it.`
    );
  }

  const featureName = TOOL_TO_FEATURE[toolName];
  if (featureName && !isFeatureEnabled(featureName, config)) {
    return (
      `Tool '${toolName}' is disabled because its feature '${featureName}' is ` +
      `disabled. Check your tools.config.json file.`
    );
  }

  return `Tool '${toolName}' is disabled by configuration. Check your tools.config.json file.`;
}

/**
 * Get a list of all enabled tools based on the configuration
 *
 * @param allToolNames Array of all available tool names
 * @param config The tools configuration
 * @returns Array of enabled tool names
 */
export function getEnabledTools(
  allToolNames: string[],
  config: ToolsConfig,
): string[] {
  return allToolNames.filter((toolName) => isToolEnabled(toolName, config));
}

/**
 * Get a list of all disabled tools based on the configuration
 *
 * @param allToolNames Array of all available tool names
 * @param config The tools configuration
 * @returns Array of disabled tool names
 */
export function getDisabledTools(
  allToolNames: string[],
  config: ToolsConfig,
): string[] {
  return allToolNames.filter((toolName) => !isToolEnabled(toolName, config));
}
