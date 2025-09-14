// Test setup for Chrome extension APIs
import { vi } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

// Make chrome available globally
(globalThis as any).chrome = mockChrome;
