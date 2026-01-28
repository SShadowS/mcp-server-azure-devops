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
} from './tools-config';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('tools-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AZURE_DEVOPS_TOOLS_CONFIG;
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
});
