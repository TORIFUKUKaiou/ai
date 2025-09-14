/**
 * Comprehensive unit tests for message passing system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ToukonMessage,
  StatusMessage,
  HealthCheckMessage,
  HealthCheckResponse,
  isToukonMessage,
  isStatusMessage,
  isHealthCheckMessage,
  isHealthCheckResponse,
  isValidExtensionMessage,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
} from '../types.js';

describe('Message Passing System', () => {
  describe('Message Type Validation', () => {
    describe('ToukonMessage validation', () => {
      it('should validate correct ToukonMessage', () => {
        const validMessage: ToukonMessage = {
          action: 'INJECT_TOUKON',
          timestamp: Date.now(),
        };

        expect(isToukonMessage(validMessage)).toBe(true);
      });

      it('should validate ToukonMessage with optional tabId', () => {
        const validMessage: ToukonMessage = {
          action: 'INJECT_TOUKON',
          timestamp: Date.now(),
          tabId: 123,
        };

        expect(isToukonMessage(validMessage)).toBe(true);
      });

      it('should reject invalid ToukonMessage', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'WRONG_ACTION' },
          { action: 'INJECT_TOUKON' }, // missing timestamp
          { timestamp: Date.now() }, // missing action
          { action: 'INJECT_TOUKON', timestamp: 'invalid' }, // wrong timestamp type
          { action: 'INJECT_TOUKON', timestamp: Date.now(), tabId: 'invalid' }, // wrong tabId type
        ];

        invalidMessages.forEach((message) => {
          expect(isToukonMessage(message)).toBe(false);
        });
      });
    });

    describe('StatusMessage validation', () => {
      it('should validate correct StatusMessage', () => {
        const validMessage: StatusMessage = {
          action: 'STATUS_UPDATE',
          replacementCount: 5,
          success: true,
        };

        expect(isStatusMessage(validMessage)).toBe(true);
      });

      it('should validate StatusMessage with optional fields', () => {
        const validMessage: StatusMessage = {
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'Test error',
          timestamp: Date.now(),
        };

        expect(isStatusMessage(validMessage)).toBe(true);
      });

      it('should reject invalid StatusMessage', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'STATUS_UPDATE' }, // missing required fields
          { action: 'STATUS_UPDATE', replacementCount: 5 }, // missing success
          { action: 'STATUS_UPDATE', success: true }, // missing replacementCount
          { action: 'STATUS_UPDATE', replacementCount: 'invalid', success: true }, // wrong type
          { action: 'STATUS_UPDATE', replacementCount: 5, success: 'invalid' }, // wrong type
          { action: 'STATUS_UPDATE', replacementCount: 5, success: true, error: 123 }, // wrong error type
          { action: 'STATUS_UPDATE', replacementCount: 5, success: true, timestamp: 'invalid' }, // wrong timestamp type
        ];

        invalidMessages.forEach((message) => {
          expect(isStatusMessage(message)).toBe(false);
        });
      });
    });

    describe('HealthCheckMessage validation', () => {
      it('should validate correct HealthCheckMessage', () => {
        const validMessage: HealthCheckMessage = {
          action: 'HEALTH_CHECK',
          timestamp: Date.now(),
        };

        expect(isHealthCheckMessage(validMessage)).toBe(true);
      });

      it('should reject invalid HealthCheckMessage', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'HEALTH_CHECK' }, // missing timestamp
          { timestamp: Date.now() }, // missing action
          { action: 'WRONG_ACTION', timestamp: Date.now() }, // wrong action
          { action: 'HEALTH_CHECK', timestamp: 'invalid' }, // wrong timestamp type
        ];

        invalidMessages.forEach((message) => {
          expect(isHealthCheckMessage(message)).toBe(false);
        });
      });
    });

    describe('HealthCheckResponse validation', () => {
      it('should validate correct HealthCheckResponse', () => {
        const validMessages: HealthCheckResponse[] = [
          {
            action: 'HEALTH_CHECK_RESPONSE',
            status: 'ready',
            timestamp: Date.now(),
          },
          {
            action: 'HEALTH_CHECK_RESPONSE',
            status: 'error',
            timestamp: Date.now(),
            error: 'Test error',
          },
        ];

        validMessages.forEach((message) => {
          expect(isHealthCheckResponse(message)).toBe(true);
        });
      });

      it('should reject invalid HealthCheckResponse', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'HEALTH_CHECK_RESPONSE' }, // missing required fields
          { action: 'HEALTH_CHECK_RESPONSE', timestamp: Date.now() }, // missing status
          { action: 'HEALTH_CHECK_RESPONSE', status: 'ready' }, // missing timestamp
          { action: 'HEALTH_CHECK_RESPONSE', status: 'invalid', timestamp: Date.now() }, // invalid status
          { action: 'HEALTH_CHECK_RESPONSE', status: 'ready', timestamp: 'invalid' }, // wrong timestamp type
          { action: 'HEALTH_CHECK_RESPONSE', status: 'ready', timestamp: Date.now(), error: 123 }, // wrong error type
        ];

        invalidMessages.forEach((message) => {
          expect(isHealthCheckResponse(message)).toBe(false);
        });
      });
    });

    describe('Generic message validation', () => {
      it('should validate any valid extension message', () => {
        const validMessages = [
          { action: 'INJECT_TOUKON', timestamp: Date.now() },
          { action: 'STATUS_UPDATE', replacementCount: 5, success: true },
          { action: 'HEALTH_CHECK', timestamp: Date.now() },
          { action: 'HEALTH_CHECK_RESPONSE', status: 'ready', timestamp: Date.now() },
        ];

        validMessages.forEach((message) => {
          expect(isValidExtensionMessage(message)).toBe(true);
        });
      });

      it('should reject invalid messages', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'UNKNOWN_ACTION' },
          { invalid: 'message' },
        ];

        invalidMessages.forEach((message) => {
          expect(isValidExtensionMessage(message)).toBe(false);
        });
      });
    });
  });

  describe('Message Routing and Error Handling', () => {
    let mockChrome: any;
    let backgroundScript: any;

    beforeEach(async () => {
      // Mock Chrome APIs
      mockChrome = {
        runtime: {
          onMessage: {
            addListener: vi.fn(),
          },
          onInstalled: {
            addListener: vi.fn(),
          },
          lastError: null,
        },
        tabs: {
          query: vi.fn(),
          sendMessage: vi.fn(),
        },
      };

      (global as any).chrome = mockChrome;

      // Import and create background script instance
      const { ToukonBackgroundScript } = await import('../background.js');
      backgroundScript = new ToukonBackgroundScript();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Message routing', () => {
      it('should route ToukonMessage correctly', async () => {
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
            timestamp: Date.now(),
          });
        });

        const message: ToukonMessage = {
          action: 'INJECT_TOUKON',
          timestamp: Date.now(),
        };

        const result = await backgroundScript.handleToukonMessage(message, {});

        expect(result.success).toBe(true);
        expect(result.replacementCount).toBe(3);
        expect(typeof result.timestamp).toBe('number');
      });

      it('should handle HealthCheck messages', async () => {
        const mockTab = {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
        };

        mockChrome.tabs.query.mockResolvedValue([mockTab]);

        const message: HealthCheckMessage = {
          action: 'HEALTH_CHECK',
          timestamp: Date.now(),
        };

        const result = await backgroundScript.handleHealthCheck(message);

        expect(result.action).toBe('HEALTH_CHECK_RESPONSE');
        expect(result.status).toBe('ready');
        expect(typeof result.timestamp).toBe('number');
      });

      it('should handle targeted tab injection', async () => {
        const targetTabId = 123;

        mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
          expect(tabId).toBe(targetTabId);
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 2,
            success: true,
            timestamp: Date.now(),
          });
        });

        const message: ToukonMessage = {
          action: 'INJECT_TOUKON',
          timestamp: Date.now(),
          tabId: targetTabId,
        };

        const result = await backgroundScript.handleToukonMessage(message, {});

        expect(result.success).toBe(true);
        expect(result.replacementCount).toBe(2);
      });
    });

    describe('Error handling and recovery', () => {
      it('should handle tab access errors gracefully', async () => {
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

        await expect(backgroundScript.handleToukonMessage(message, {})).rejects.toThrow(
          TabAccessError,
        );
      });

      it('should handle content script communication errors', async () => {
        const mockTab = {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
        };

        mockChrome.tabs.query.mockResolvedValue([mockTab]);
        mockChrome.runtime.lastError = { message: 'Could not establish connection' };
        mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
          callback(null);
        });

        await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(ContentScriptError);
      });

      it('should handle message timeout', async () => {
        const mockTab = {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
        };

        mockChrome.tabs.query.mockResolvedValue([mockTab]);

        // Mock a delayed response that exceeds timeout
        mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
          // Never call callback to simulate timeout
        });

        await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(MessagePassingError);
      }, 12000);

      it('should validate response format', async () => {
        const mockTab = {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
        };

        mockChrome.tabs.query.mockResolvedValue([mockTab]);
        mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
          callback({ invalid: 'response' });
        });

        await expect(backgroundScript.executeContentScript(1)).rejects.toThrow(MessagePassingError);
      });

      it('should provide localized error messages', () => {
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
    });

    describe('Message validation in routing', () => {
      it('should reject malformed messages', () => {
        const sendResponse = vi.fn();
        const invalidMessages = [
          null,
          undefined,
          {},
          { action: 'UNKNOWN' },
          { invalid: 'message' },
        ];

        invalidMessages.forEach((message) => {
          (backgroundScript as any).routeMessage(message, {}, sendResponse);

          expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'STATUS_UPDATE',
              success: false,
              error: expect.any(String),
            }),
          );

          sendResponse.mockClear();
        });
      });

      it('should handle routing errors gracefully', () => {
        const sendResponse = vi.fn();

        // Mock a scenario that throws during routing
        const problematicMessage = {
          action: 'INJECT_TOUKON',
          timestamp: Date.now(),
        };

        // Mock getCurrentTab to throw
        mockChrome.tabs.query.mockRejectedValue(new Error('Tab query failed'));

        (backgroundScript as any).routeMessage(problematicMessage, {}, sendResponse);

        // Should eventually call sendResponse with error
        setTimeout(() => {
          expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'STATUS_UPDATE',
              success: false,
              error: expect.any(String),
            }),
          );
        }, 100);
      });
    });
  });

  describe('Content Script Message Handling', () => {
    let mockChrome: any;

    beforeEach(() => {
      // Ensure fresh module evaluation for each test so content script registers listeners per-mock
      vi.resetModules();
      mockChrome = {
        runtime: {
          onMessage: {
            addListener: vi.fn(),
          },
        },
      };

      (global as any).chrome = mockChrome;

      // Mock DOM
      document.body = document.createElement('body');

      // Mock document.readyState
      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'complete',
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      // Ensure body exists for cleanup even if tests overrode it
      const hasBody = !!(document as any).body;
      if (!hasBody) {
        Object.defineProperty(document, 'body', {
          value: document.createElement('body'),
          writable: true,
          configurable: true,
        });
      }
      document.body.innerHTML = '';
    });

    it('should handle ToukonMessage in content script', async () => {
      const sendResponse = vi.fn();
      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      // Set up some test content
      document.body.innerHTML = '<div>This is AI technology</div>';

      // Import content script to trigger message listener setup
      await import('../content.js');

      // Get the message listener that was registered
      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Call the listener
      messageListener(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_UPDATE',
          success: true,
          replacementCount: expect.any(Number),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should handle HealthCheckMessage in content script', async () => {
      const sendResponse = vi.fn();
      const message: HealthCheckMessage = {
        action: 'HEALTH_CHECK',
        timestamp: Date.now(),
      };

      // Import content script to trigger message listener setup
      await import('../content.js');

      // Get the message listener that was registered
      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Call the listener
      messageListener(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'HEALTH_CHECK_RESPONSE',
          status: 'ready',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should handle invalid messages in content script', async () => {
      const sendResponse = vi.fn();
      const invalidMessage = { invalid: 'message' };

      // Import content script to trigger message listener setup
      await import('../content.js');

      // Get the message listener that was registered
      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Call the listener
      messageListener(invalidMessage, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_UPDATE',
          success: false,
          error: 'Invalid message format',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should handle content script errors gracefully', async () => {
      const sendResponse = vi.fn();
      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      // Mock document.body to be null to trigger error
      Object.defineProperty(document, 'body', {
        get: () => null,
        configurable: true,
      });

      // Import content script to trigger message listener setup
      await import('../content.js');

      // Get the message listener that was registered
      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Call the listener
      messageListener(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_UPDATE',
          success: true, // Should still succeed with 0 replacements
          replacementCount: 0,
          timestamp: expect.any(Number),
        }),
      );
    });
  });
});
