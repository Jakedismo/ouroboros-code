import { Config } from '../config/config.js';
import type { ConfigParameters } from '../config/config.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { vi } from 'vitest';

export async function createMockConfig(
  toolRegistryMocks = {},
): Promise<{ config: Config; toolRegistry: ToolRegistry }> {
  const configParams: ConfigParameters = {
    sessionId: 'test-session',
    model: DEFAULT_GEMINI_MODEL,
    targetDir: '.',
    debugMode: false,
    cwd: process.cwd(),
  };
  const config = new Config(configParams);
  await config.initialize();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await config.refreshAuth('test-auth' as any);

  // Mock ToolRegistry
  const mockToolRegistry = {
    getTool: vi.fn(),
    getToolFunctionDeclarationsFiltered: vi.fn().mockReturnValue([]),
    ...toolRegistryMocks,
  } as unknown as ToolRegistry;

  vi.spyOn(config, 'getToolRegistry').mockReturnValue(mockToolRegistry);
  return { config, toolRegistry: mockToolRegistry };
}
