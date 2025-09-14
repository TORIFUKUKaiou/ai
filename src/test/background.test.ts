/**
 * Unit tests for background script message passing functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ToukonMessage,
  StatusMessage,
  isToukonMessage,
  isStatusMessage,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
} from '../types.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    lastError: null as any,
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

// Make chrome available globally
(global as any).chrome = mockChrome;

// Import after setting up mocks
const { ToukonBackgroundScript } = await import('../background.js');

describe('Background Script Message Passing', () => {
  let backgroundScript: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    backgroundScript = new ToukonBackgroundScript();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Message Validation', () => {
    it('should validate ToukonMessage correctly', () => {
      const validMessage: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      expect(isToukonMessage(validMessage)).toBe(true);
      expect(isToukonMessage({})).toBe(false);
      expect(isToukonMessage(null)).toBe(false);
      expect(isToukonMessage({ action: 'WRONG_ACTION' })).toBe(false);
    });

    it('should validate StatusMessage correctly', () => {
      const validMessage: StatusMessage = {
        action: 'STATUS_UPDATE',
        replacementCount: 5,
        success: true,
      };

      expect(isStatusMessage(validMessage)).toBe(true);
      expect(isStatusMessage({})).toBe(false);
      expect(isStatusMessage(null)).toBe(false);
      expect(isStatusMessage({ action: 'STATUS_UPDATE' })).toBe(false);
    });
  });

  describe('Tab Access Validation', () => {
    it('should handle valid tab access', async () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 3,
          success: true,
        });
      });

      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      const result = await backgroundScript.handlePopupMessage(message);

      expect(result.success).toBe(true);
      expect(result.replacementCount).toBe(3);
    });

    it('should reject chrome:// URLs', async () => {
      const mockTab = {
        id: 1,
        url: 'chrome://settings',
        title: 'Settings',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      await expect(backgroundScript.handlePopupMessage(message)).rejects.toThrow(TabAccessError);
    });

    it('should reject chrome-extension:// URLs', async () => {
      const mockTab = {
        id: 1,
        url: 'chrome-extension://abc123/popup.html',
        title: 'Extension',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      await expect(backgroundScript.handlePopupMessage(message)).rejects.toThrow(TabAccessError);
    });

    it('should handle no active tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      await expect(backgroundScript.handlePopupMessage(message)).rejects.toThrow(TabAccessError);
    });
  });

  describe('Content Script Communication', () => {
    beforeEach(() => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);
    });

    it('should handle successful content script response', async () => {
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 5,
          success: true,
        });
      });

      const result = await backgroundScript.executeContentScript(1);

      expect(result.success).toBe(true);
      expect(result.replacementCount).toBe(5);
    });

    it('should handle content script error', async () => {
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'DOM access denied',
        });
      });

      const result = await backgroundScript.executeContentScript(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM access denied');
    });

    it('should handle connection error', async () => {
      mockChrome.runtime.lastError = { message: 'Could not establish connection' };
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        callback(null);
      });

      await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(ContentScriptError);
    });

    it('should handle timeout', async () => {
      // Mock a delayed response that exceeds timeout
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        setTimeout(() => {
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 0,
            success: true,
          });
        }, 15000); // Longer than 10s timeout
      });

      await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(MessagePassingError);
    }, 12000);

    it('should validate response format', async () => {
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        callback({ invalid: 'response' });
      });

      await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(MessagePassingError);
    });
  });

  describe('Error Handling', () => {
    it('should provide user-friendly error messages', () => {
      const tabError = new TabAccessError('Cannot access tab');
      const contentError = new ContentScriptError('Script failed');
      const messageError = new MessagePassingError('Communication failed');

      expect(backgroundScript.getErrorMessage(tabError)).toBe('このページでは使用できません');
      expect(backgroundScript.getErrorMessage(contentError)).toBe(
        'ページの読み込みが完了していません。リフレッシュして再試行してください。',
      );
      expect(backgroundScript.getErrorMessage(messageError)).toBe(
        '通信エラーが発生しました。再試行してください。',
      );
    });

    it('should handle unknown errors gracefully', () => {
      const unknownError = new Error('Unknown error');
      expect(backgroundScript.getErrorMessage(unknownError)).toBe('Unknown error');

      const nonError = 'string error';
      expect(backgroundScript.getErrorMessage(nonError)).toBe('不明なエラーが発生しました');
    });
  });
});

describe('Message Type Guards', () => {
  it('should correctly identify ToukonMessage', () => {
    const validMessage: ToukonMessage = {
      action: 'INJECT_TOUKON',
      timestamp: 1234567890,
    };

    expect(isToukonMessage(validMessage)).toBe(true);
    expect(isToukonMessage({ action: 'INJECT_TOUKON' })).toBe(false);
    expect(isToukonMessage({ timestamp: 123 })).toBe(false);
    expect(isToukonMessage(null)).toBe(false);
    expect(isToukonMessage(undefined)).toBe(false);
  });

  it('should correctly identify StatusMessage', () => {
    const validMessage: StatusMessage = {
      action: 'STATUS_UPDATE',
      replacementCount: 5,
      success: true,
    };

    expect(isStatusMessage(validMessage)).toBe(true);
    expect(isStatusMessage({ action: 'STATUS_UPDATE', success: true })).toBe(false);
    expect(isStatusMessage({ replacementCount: 5, success: true })).toBe(false);
    expect(isStatusMessage(null)).toBe(false);
    expect(isStatusMessage(undefined)).toBe(false);
  });
});
