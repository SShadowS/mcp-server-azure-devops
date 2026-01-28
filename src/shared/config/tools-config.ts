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
  })
  .default({});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Default configuration - all features enabled, no tools disabled
 */
export const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  features: {},
  tools: { disabled: [] },
};

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

  // If the file doesn't exist, return default config (all enabled)
  if (!fs.existsSync(effectivePath)) {
    return DEFAULT_TOOLS_CONFIG;
  }

  try {
    const configContent = fs.readFileSync(effectivePath, 'utf-8');
    const rawConfig = JSON.parse(configContent);
    const parsedConfig = ToolsConfigSchema.parse(rawConfig);

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
 * 1. Its parent feature is disabled, OR
 * 2. It's explicitly listed in tools.disabled
 *
 * @param toolName The name of the tool to check
 * @param config The tools configuration
 * @returns true if the tool is enabled
 */
export function isToolEnabled(toolName: string, config: ToolsConfig): boolean {
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
