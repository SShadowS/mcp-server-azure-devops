import * as fs from 'fs';
import {
  loadToolsConfig,
  isFeatureEnabled,
  isToolEnabled,
  getEnabledTools,
  getDisabledTools,
  DEFAULT_TOOLS_CONFIG,
  FEATURE_NAMES,
  FEATURE_TOOLS,
  TOOL_TO_FEATURE,
  ToolsConfig,
  READ_TOOLS,
  WRITE_TOOLS,
  isWriteTool,
  getToolDisabledReason,
} from './tools-config';

import { usersTools } from '../../features/users/tool-definitions';
import { organizationsTools } from '../../features/organizations/tool-definitions';
import { projectsTools } from '../../features/projects/tool-definitions';
import { repositoriesTools } from '../../features/repositories/tool-definitions';
import { workItemsTools } from '../../features/work-items/tool-definitions';
import { searchTools } from '../../features/search/tool-definitions';
import { pullRequestsTools } from '../../features/pull-requests/tool-definitions';
import { pipelinesTools } from '../../features/pipelines/tool-definitions';
import { wikisTools } from '../../features/wikis/tool-definitions';
import { testRunsTools } from '../../features/test-runs/tool-definitions';

const ALL_SERVER_TOOL_NAMES = [
  ...usersTools,
  ...organizationsTools,
  ...projectsTools,
  ...repositoriesTools,
  ...workItemsTools,
  ...searchTools,
  ...pullRequestsTools,
  ...pipelinesTools,
  ...wikisTools,
  ...testRunsTools,
].map((tool) => tool.name);

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('tools-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AZURE_DEVOPS_TOOLS_CONFIG;
    delete process.env.AZURE_DEVOPS_READ_ONLY;
    delete process.env.READ_ONLY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('FEATURE_TOOLS mapping', () => {
    it('should have all feature names defined', () => {
      for (const featureName of FEATURE_NAMES) {
        expect(FEATURE_TOOLS[featureName]).toBeDefined();
        expect(Array.isArray(FEATURE_TOOLS[featureName])).toBe(true);
      }
    });

    it('should have unique tool names across all features', () => {
      const allTools: string[] = [];
      for (const tools of Object.values(FEATURE_TOOLS)) {
        allTools.push(...tools);
      }
      const uniqueTools = new Set(allTools);
      expect(uniqueTools.size).toBe(allTools.length);
    });
  });

  describe('TOOL_TO_FEATURE mapping', () => {
    it('should map each tool to its feature', () => {
      for (const [feature, tools] of Object.entries(FEATURE_TOOLS)) {
        for (const tool of tools) {
          expect(TOOL_TO_FEATURE[tool]).toBe(feature);
        }
      }
    });
  });

  describe('loadToolsConfig', () => {
    it('should return default config when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const config = loadToolsConfig();

      expect(config).toEqual(DEFAULT_TOOLS_CONFIG);
    });

    it('should load and parse valid config file', () => {
      const configContent = JSON.stringify({
        features: {
          pipelines: false,
        },
        tools: {
          disabled: ['trigger_pipeline'],
        },
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configContent);

      const config = loadToolsConfig('/path/to/config.json');

      expect(config.features?.pipelines).toBe(false);
      expect(config.tools?.disabled).toContain('trigger_pipeline');
    });

    it('should use AZURE_DEVOPS_TOOLS_CONFIG env var if set', () => {
      process.env.AZURE_DEVOPS_TOOLS_CONFIG = '/custom/path/config.json';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');

      loadToolsConfig();

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        '/custom/path/config.json',
      );
    });

    it('should throw error for invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{ invalid json }');

      expect(() => loadToolsConfig('/path/to/config.json')).toThrow(
        /Invalid JSON/,
      );
    });

    it('should throw error for invalid config schema', () => {
      const invalidConfig = JSON.stringify({
        features: {
          'invalid-feature': true,
        },
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => loadToolsConfig('/path/to/config.json')).toThrow(
        /Invalid tools config/,
      );
    });

    it('should handle empty config object', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');

      const config = loadToolsConfig();

      expect(config.features).toEqual({});
      expect(config.tools?.disabled).toEqual([]);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for features not specified in config', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
      };

      expect(isFeatureEnabled('pipelines', config)).toBe(true);
      expect(isFeatureEnabled('wikis', config)).toBe(true);
    });

    it('should return true for features explicitly enabled', () => {
      const config: ToolsConfig = {
        features: { pipelines: true },
        tools: { disabled: [] },
      };

      expect(isFeatureEnabled('pipelines', config)).toBe(true);
    });

    it('should return false for features explicitly disabled', () => {
      const config: ToolsConfig = {
        features: { pipelines: false, wikis: false },
        tools: { disabled: [] },
      };

      expect(isFeatureEnabled('pipelines', config)).toBe(false);
      expect(isFeatureEnabled('wikis', config)).toBe(false);
    });
  });

  describe('isToolEnabled', () => {
    it('should return true for tools in enabled features', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
      };

      expect(isToolEnabled('list_pipelines', config)).toBe(true);
      expect(isToolEnabled('get_wiki_page', config)).toBe(true);
    });

    it('should return false for tools in disabled features', () => {
      const config: ToolsConfig = {
        features: { pipelines: false },
        tools: { disabled: [] },
      };

      expect(isToolEnabled('list_pipelines', config)).toBe(false);
      expect(isToolEnabled('trigger_pipeline', config)).toBe(false);
    });

    it('should return false for explicitly disabled tools', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: ['trigger_pipeline', 'create_wiki'] },
      };

      expect(isToolEnabled('trigger_pipeline', config)).toBe(false);
      expect(isToolEnabled('create_wiki', config)).toBe(false);
      // Other tools in same feature should still be enabled
      expect(isToolEnabled('list_pipelines', config)).toBe(true);
      expect(isToolEnabled('get_wiki_page', config)).toBe(true);
    });

    it('should return true for unknown tools (not in any feature)', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
      };

      expect(isToolEnabled('unknown_tool', config)).toBe(true);
    });

    it('should return false for unknown tools explicitly disabled', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: ['unknown_tool'] },
      };

      expect(isToolEnabled('unknown_tool', config)).toBe(false);
    });
  });

  describe('getEnabledTools', () => {
    it('should return all tools when no restrictions', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
      };

      const enabled = getEnabledTools(allTools, config);

      expect(enabled).toEqual(allTools);
    });

    it('should exclude tools from disabled features', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: { pipelines: false },
        tools: { disabled: [] },
      };

      const enabled = getEnabledTools(allTools, config);

      expect(enabled).toEqual(['get_wiki_page']);
    });

    it('should exclude explicitly disabled tools', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: ['trigger_pipeline'] },
      };

      const enabled = getEnabledTools(allTools, config);

      expect(enabled).toEqual(['list_pipelines', 'get_wiki_page']);
    });
  });

  describe('getDisabledTools', () => {
    it('should return empty array when no restrictions', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
      };

      const disabled = getDisabledTools(allTools, config);

      expect(disabled).toEqual([]);
    });

    it('should return tools from disabled features', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: { pipelines: false },
        tools: { disabled: [] },
      };

      const disabled = getDisabledTools(allTools, config);

      expect(disabled).toEqual(['list_pipelines', 'trigger_pipeline']);
    });

    it('should return explicitly disabled tools', () => {
      const allTools = ['list_pipelines', 'trigger_pipeline', 'get_wiki_page'];
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: ['trigger_pipeline'] },
      };

      const disabled = getDisabledTools(allTools, config);

      expect(disabled).toEqual(['trigger_pipeline']);
    });
  });

  describe('tool read/write classification', () => {
    it('should classify every tool the server exposes as either read or write', () => {
      const classified = new Set([...READ_TOOLS, ...WRITE_TOOLS]);
      const unclassified = ALL_SERVER_TOOL_NAMES.filter(
        (name) => !classified.has(name),
      );

      expect(unclassified).toEqual([]);
    });

    it('should not classify tools the server does not expose', () => {
      const serverTools = new Set(ALL_SERVER_TOOL_NAMES);
      const stale = [...READ_TOOLS, ...WRITE_TOOLS].filter(
        (name) => !serverTools.has(name),
      );

      expect(stale).toEqual([]);
    });

    it('should not classify a tool as both read and write', () => {
      const overlap = [...WRITE_TOOLS].filter((name) => READ_TOOLS.has(name));

      expect(overlap).toEqual([]);
    });

    it('should treat a known mutating tool as a write tool', () => {
      expect(isWriteTool('create_work_item')).toBe(true);
      expect(isWriteTool('update_wiki_page')).toBe(true);
    });

    it('should treat trigger_pipeline as a write tool', () => {
      expect(isWriteTool('trigger_pipeline')).toBe(true);
    });

    it('should treat a known read tool as not a write tool', () => {
      expect(isWriteTool('get_work_item')).toBe(false);
      expect(isWriteTool('download_pipeline_artifact')).toBe(false);
    });

    it('should treat an unclassified tool as a write tool', () => {
      expect(isWriteTool('some_future_tool')).toBe(true);
    });
  });

  describe('read-only mode', () => {
    const readOnlyConfig: ToolsConfig = {
      features: {},
      tools: { disabled: [] },
      readOnly: true,
    };

    it('should disable write tools when read-only is enabled', () => {
      expect(isToolEnabled('create_work_item', readOnlyConfig)).toBe(false);
      expect(isToolEnabled('trigger_pipeline', readOnlyConfig)).toBe(false);
    });

    it('should keep read tools enabled when read-only is enabled', () => {
      expect(isToolEnabled('get_work_item', readOnlyConfig)).toBe(true);
      expect(isToolEnabled('list_pipelines', readOnlyConfig)).toBe(true);
    });

    it('should disable unclassified tools when read-only is enabled', () => {
      expect(isToolEnabled('some_future_tool', readOnlyConfig)).toBe(false);
    });

    it('should keep write tools enabled when read-only is disabled', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: [] },
        readOnly: false,
      };

      expect(isToolEnabled('create_work_item', config)).toBe(true);
    });

    it('should not re-enable a tool that is explicitly disabled', () => {
      const config: ToolsConfig = {
        features: {},
        tools: { disabled: ['get_work_item'] },
        readOnly: true,
      };

      expect(isToolEnabled('get_work_item', config)).toBe(false);
    });

    it('should not re-enable a read tool whose feature is disabled', () => {
      const config: ToolsConfig = {
        features: { wikis: false },
        tools: { disabled: [] },
        readOnly: true,
      };

      expect(isToolEnabled('get_wikis', config)).toBe(false);
    });

    it('should report every write tool as disabled via getDisabledTools', () => {
      const disabled = getDisabledTools(ALL_SERVER_TOOL_NAMES, readOnlyConfig);

      expect(disabled.sort()).toEqual([...WRITE_TOOLS].sort());
    });

    it('should report every read tool as enabled via getEnabledTools', () => {
      const enabled = getEnabledTools(ALL_SERVER_TOOL_NAMES, readOnlyConfig);

      expect(enabled.sort()).toEqual([...READ_TOOLS].sort());
    });
  });

  describe('loadToolsConfig read-only resolution', () => {
    it('should default read-only to false with no config file and no env var', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(loadToolsConfig().readOnly).toBe(false);
    });

    it('should enable read-only from READ_ONLY with no config file', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.READ_ONLY = 'true';

      expect(loadToolsConfig().readOnly).toBe(true);
    });

    it('should enable read-only from AZURE_DEVOPS_READ_ONLY', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.AZURE_DEVOPS_READ_ONLY = 'true';

      expect(loadToolsConfig().readOnly).toBe(true);
    });

    it('should let AZURE_DEVOPS_READ_ONLY override READ_ONLY', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.AZURE_DEVOPS_READ_ONLY = 'false';
      process.env.READ_ONLY = 'true';

      expect(loadToolsConfig().readOnly).toBe(false);
    });

    it.each(['true', 'TRUE', 'True', '1', 'yes', 'YES', ' true '])(
      'should treat %p as enabling read-only',
      (value) => {
        mockFs.existsSync.mockReturnValue(false);
        process.env.READ_ONLY = value;

        expect(loadToolsConfig().readOnly).toBe(true);
      },
    );

    it.each(['false', '0', 'no', '', 'maybe'])(
      'should treat %p as not enabling read-only',
      (value) => {
        mockFs.existsSync.mockReturnValue(false);
        process.env.READ_ONLY = value;

        expect(loadToolsConfig().readOnly).toBe(false);
      },
    );

    it('should read the readOnly flag from the config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ readOnly: true }));

      expect(loadToolsConfig().readOnly).toBe(true);
    });

    it('should let the env var override the config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ readOnly: true }));
      process.env.AZURE_DEVOPS_READ_ONLY = 'false';

      expect(loadToolsConfig().readOnly).toBe(false);
    });

    it('should let the env var enable read-only over a false file flag', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ readOnly: false }));
      process.env.READ_ONLY = 'true';

      expect(loadToolsConfig().readOnly).toBe(true);
    });

    it('should not mutate DEFAULT_TOOLS_CONFIG when read-only is enabled', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.READ_ONLY = 'true';

      loadToolsConfig();

      expect(DEFAULT_TOOLS_CONFIG.readOnly).toBe(false);
    });
  });

  describe('getToolDisabledReason', () => {
    const enabledConfig: ToolsConfig = {
      features: {},
      tools: { disabled: [] },
      readOnly: false,
    };

    it('should return undefined for an enabled tool', () => {
      expect(
        getToolDisabledReason('create_work_item', enabledConfig),
      ).toBeUndefined();
    });

    it('should blame read-only mode for a blocked write tool', () => {
      const config: ToolsConfig = { ...enabledConfig, readOnly: true };

      const reason = getToolDisabledReason('create_work_item', config);

      expect(reason).toContain('read-only mode');
      expect(reason).toContain('AZURE_DEVOPS_READ_ONLY');
      expect(reason).not.toContain('tools.config.json');
    });

    it('should name the disabled feature when a feature is off', () => {
      const config: ToolsConfig = {
        ...enabledConfig,
        features: { wikis: false },
      };

      const reason = getToolDisabledReason('get_wikis', config);

      expect(reason).toContain("feature 'wikis'");
      expect(reason).toContain('tools.config.json');
    });

    it('should blame configuration for an explicitly disabled tool', () => {
      const config: ToolsConfig = {
        ...enabledConfig,
        tools: { disabled: ['get_work_item'] },
      };

      const reason = getToolDisabledReason('get_work_item', config);

      expect(reason).toContain('tools.config.json');
      expect(reason).not.toContain('read-only mode');
    });

    it('should prefer the read-only reason over the feature reason', () => {
      const config: ToolsConfig = {
        ...enabledConfig,
        features: { wikis: false },
        readOnly: true,
      };

      expect(getToolDisabledReason('create_wiki', config)).toContain(
        'read-only mode',
      );
    });

    it('should report an unknown tool as blocked by read-only mode', () => {
      const config: ToolsConfig = { ...enabledConfig, readOnly: true };

      expect(getToolDisabledReason('some_future_tool', config)).toContain(
        'read-only mode',
      );
    });
  });
});
