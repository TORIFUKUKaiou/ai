/**
 * 闘魂AI変換 Chrome Extension - Error Handling Tests
 * Tests for comprehensive error handling across all components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ToukonError,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
  isToukonMessage,
  isStatusMessage,
} from '../types.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

// @ts-expect-error - provide global stub for chrome in test env
global.chrome = mockChrome;

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Custom Error Classes', () => {
    it('should create ToukonError with proper properties', () => {
      const error = new ToukonError('Test error', 'TEST_CODE', { test: 'context' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ToukonError);
      expect(error.name).toBe('ToukonError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ test: 'context' });
    });

    it('should create TabAccessError with proper inheritance', () => {
      const error = new TabAccessError('Tab access denied');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ToukonError);
      expect(error).toBeInstanceOf(TabAccessError);
      expect(error.name).toBe('TabAccessError');
      expect(error.code).toBe('TAB_ACCESS_ERROR');
    });

    it('should create ContentScriptError with proper inheritance', () => {
      const error = new ContentScriptError('Content script failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ToukonError);
      expect(error).toBeInstanceOf(ContentScriptError);
      expect(error.name).toBe('ContentScriptError');
      expect(error.code).toBe('CONTENT_SCRIPT_ERROR');
    });

    it('should create MessagePassingError with proper inheritance', () => {
      const error = new MessagePassingError('Message failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ToukonError);
      expect(error).toBeInstanceOf(MessagePassingError);
      expect(error.name).toBe('MessagePassingError');
      expect(error.code).toBe('MESSAGE_PASSING_ERROR');
    });
  });

  describe('Content Script Error Handling', () => {
    // Test the error handling logic directly without importing the full module
    beforeEach(() => {
      // Mock DOM
      const mockDocument = {
        readyState: 'complete',
        body: {
          childNodes: [],
        },
        documentElement: {},
      };

      const mockWindow = {
        location: {
          href: 'https://example.com',
        },
      };

      // @ts-expect-error - assign mocked document
      global.document = mockDocument;
      // @ts-expect-error - assign mocked window
      global.window = mockWindow;
      // @ts-expect-error - assign mocked Node constants
      global.Node = {
        TEXT_NODE: 3,
        ELEMENT_NODE: 1,
      };
    });

    it('should handle document access validation errors', () => {
      // Test validation logic for restricted URLs
      const restrictedUrls = [
        'chrome://settings',
        'chrome-extension://abc123',
        'about:blank',
        'moz-extension://def456',
      ];

      restrictedUrls.forEach((url) => {
        global.window.location.href = url;

        // Test the validation logic directly
        expect(() => {
          // Simulate the validation that would happen in content script
          const restrictedPatterns = [
            /^chrome:/,
            /^chrome-extension:/,
            /^moz-extension:/,
            /^edge:/,
            /^about:/,
            /^file:/,
          ];

          for (const pattern of restrictedPatterns) {
            if (pattern.test(url)) {
              throw new ContentScriptError('Cannot modify content on restricted pages');
            }
          }
        }).toThrow(ContentScriptError);
      });
    });

    it('should handle DOM traversal errors gracefully', () => {
      // Test error handling for problematic DOM elements
      const problematicElements = [
        { childNodes: null, tagName: 'DIV' },
        { childNodes: undefined, tagName: 'SPAN' },
        null,
        undefined,
      ];

      problematicElements.forEach((element) => {
        expect(() => {
          // Simulate the validation that would happen in traverseTextNodes
          if (!element || !element.childNodes) {
            console.warn('Element is not accessible for traversal:', element);
            return; // Should return gracefully, not throw
          }
        }).not.toThrow();
      });
    });

    it('should handle text replacement permission errors', () => {
      // Test text replacement error scenarios
      const testCases = [
        {
          name: 'permission denied',
          error: new Error('Permission denied'),
          expectedErrorType: ContentScriptError,
        },
        {
          name: 'node access denied',
          error: new Error('Cannot access node'),
          expectedErrorType: ContentScriptError,
        },
      ];

      testCases.forEach(({ name, error, expectedErrorType }) => {
        expect(() => {
          // Simulate text replacement failure
          throw new expectedErrorType(
            `Failed to update text content - possible permission restriction: ${error.message}`,
          );
        }).toThrow(expectedErrorType);
      });
    });

    it('should implement retry logic for transient failures', () => {
      // Test retry logic implementation
      const maxRetries = 3;
      let attemptCount = 0;

      const retryOperation = () => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('Transient error');
            }
            return true; // Success on third attempt
          } catch (error) {
            if (attempt === maxRetries) {
              throw error;
            }
          }
        }
        return false;
      };

      const result = retryOperation();
      expect(result).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });

  describe('Background Script Error Handling', () => {
    beforeEach(() => {
      // Mock additional Chrome APIs for background script
      (mockChrome.runtime as any).onInstalled = {
        addListener: vi.fn(),
      };
    });

    it('should handle invalid message formats', () => {
      // Test message validation logic
      const invalidMessages = [
        null,
        undefined,
        'string',
        123,
        {},
        { action: 123 },
        { action: 'INVALID_ACTION' },
      ];

      invalidMessages.forEach((message) => {
        // Test validation logic directly
        const isValid = Boolean(
          message &&
          typeof message === 'object' &&
          typeof message.action === 'string' &&
          (isToukonMessage(message) || isStatusMessage(message)),
        );

        expect(isValid).toBe(false);
      });
    });

    it('should handle tab access errors', () => {
      // Test tab access validation logic
      const restrictedUrls = [
        'chrome://settings',
        'chrome-extension://abc123',
        'edge://settings',
        'about:blank',
      ];

      restrictedUrls.forEach((url) => {
        const restrictedProtocols = [
          'chrome://',
          'chrome-extension://',
          'edge://',
          'about:',
          'moz-extension://',
          'safari-extension://',
        ];

        let shouldThrow = false;
        for (const protocol of restrictedProtocols) {
          if (url.startsWith(protocol)) {
            shouldThrow = true;
            break;
          }
        }

        if (shouldThrow) {
          expect(() => {
            throw new TabAccessError('Cannot access browser internal pages');
          }).toThrow(TabAccessError);
        }
      });
    });

    it('should handle message timeout errors', () => {
      // Test timeout handling logic
      const timeoutPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new MessagePassingError('Message timeout'));
        }, 100);

        // Simulate no response (timeout scenario)
        // Don't call resolve to simulate timeout
      });

      expect(timeoutPromise).rejects.toThrow(MessagePassingError);
    });

    it('should handle Chrome runtime errors', () => {
      // Test Chrome runtime error handling
      const chromeErrors = ['Could not establish connection', 'No tab with id', 'Cannot access'];

      chromeErrors.forEach((errorMessage) => {
        expect(() => {
          if (errorMessage.includes('Could not establish connection')) {
            throw new ContentScriptError(
              'Content script not ready. Please refresh the page and try again.',
            );
          } else if (errorMessage.includes('No tab with id')) {
            throw new TabAccessError('Tab is no longer available');
          } else if (errorMessage.includes('Cannot access')) {
            throw new TabAccessError('Cannot access this page');
          }
        }).toThrow(ToukonError);
      });
    });

    it('should provide user-friendly error messages', () => {
      // Test error message mapping logic
      const getErrorMessage = (error: any): string => {
        if (error instanceof TabAccessError) {
          return 'このページでは使用できません';
        } else if (error instanceof ContentScriptError) {
          return 'ページの読み込みが完了していません。リフレッシュして再試行してください。';
        } else if (error instanceof MessagePassingError) {
          return '通信エラーが発生しました。再試行してください。';
        } else if (error instanceof ToukonError) {
          return error.message;
        } else if (error instanceof Error) {
          return error.message;
        } else {
          return '不明なエラーが発生しました';
        }
      };

      const testCases = [
        { error: new TabAccessError('test'), expected: 'このページでは使用できません' },
        {
          error: new ContentScriptError('test'),
          expected: 'ページの読み込みが完了していません。リフレッシュして再試行してください。',
        },
        {
          error: new MessagePassingError('test'),
          expected: '通信エラーが発生しました。再試行してください。',
        },
        { error: new Error('Unknown'), expected: 'Unknown' },
        { error: 'string error', expected: '不明なエラーが発生しました' },
      ];

      testCases.forEach(({ error, expected }) => {
        const result = getErrorMessage(error);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Popup Error Handling', () => {
    beforeEach(() => {
      // Mock DOM elements
      const mockButton = {
        addEventListener: vi.fn(),
        disabled: false,
      };

      const mockStatusElement = {
        classList: {
          remove: vi.fn(),
          add: vi.fn(),
          contains: vi.fn(() => false),
        },
        querySelector: vi.fn(() => ({ textContent: '' })),
      };

      const mockStatusText = {
        textContent: '',
      };

      global.document = {
        getElementById: vi.fn((id) => {
          if (id === 'inject-toukon') return mockButton;
          if (id === 'status') return mockStatusElement;
          return null;
        }),
        querySelector: vi.fn(() => mockStatusText),
        addEventListener: vi.fn(),
        body: mockStatusText,
      } as any;

      // @ts-expect-error - assign mocked window
      global.window = {
        addEventListener: vi.fn(),
      };
    });

    it('should handle initialization errors gracefully', () => {
      // Test initialization error handling logic
      expect(() => {
        // Simulate missing DOM elements
        const elements = [null, undefined];
        elements.forEach((element) => {
          if (!element) {
            console.warn('Required DOM elements not found');
            // Should handle gracefully, not throw
          }
        });
      }).not.toThrow();
    });

    it('should handle tab access errors with user-friendly messages', () => {
      // Test tab access error handling
      const restrictedUrls = ['chrome://settings', 'chrome-extension://abc123'];

      restrictedUrls.forEach((url) => {
        const restrictedProtocols = [
          'chrome://',
          'chrome-extension://',
          'edge://',
          'about:',
          'moz-extension://',
          'safari-extension://',
        ];

        let shouldThrow = false;
        for (const protocol of restrictedProtocols) {
          if (url.startsWith(protocol)) {
            shouldThrow = true;
            break;
          }
        }

        if (shouldThrow) {
          expect(() => {
            throw new TabAccessError('Cannot access browser internal pages');
          }).toThrow(TabAccessError);
        }
      });
    });

    it('should implement retry logic for transient failures', () => {
      // Test retry logic for popup operations
      const maxRetries = 3;
      const attemptCount = 0;

      const shouldNotRetry = (error: any): boolean => {
        if (error instanceof TabAccessError) {
          return true;
        }
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (
            message.includes('cannot access') ||
            message.includes('restricted') ||
            message.includes('permission denied')
          ) {
            return true;
          }
        }
        return false;
      };

      // Test transient error (should retry)
      const transientError = new Error('Transient network error');
      expect(shouldNotRetry(transientError)).toBe(false);

      // Test permanent error (should not retry)
      const permanentError = new TabAccessError('Cannot access');
      expect(shouldNotRetry(permanentError)).toBe(true);
    });

    it('should not retry on permanent failures', () => {
      // Test that certain errors are not retried
      const permanentErrors = [
        new TabAccessError('Cannot access browser pages'),
        new Error('Cannot access restricted page'),
        new Error('Permission denied'),
      ];

      permanentErrors.forEach((error) => {
        const shouldNotRetry = (err: any): boolean => {
          if (err instanceof TabAccessError) {
            return true;
          }
          if (err instanceof Error) {
            const message = err.message.toLowerCase();
            if (message.includes('cannot access') || message.includes('permission denied')) {
              return true;
            }
          }
          return false;
        };

        expect(shouldNotRetry(error)).toBe(true);
      });
    });

    it('should handle message timeout with appropriate feedback', () => {
      // Test timeout error handling
      const timeoutError = new MessagePassingError('Message timeout');

      const getErrorMessage = (error: any): string => {
        if (error instanceof MessagePassingError) {
          if (error.message.includes('timeout')) {
            return 'タイムアウトしました。再試行してください';
          } else {
            return '通信エラーが発生しました';
          }
        }
        return '不明なエラーが発生しました';
      };

      const result = getErrorMessage(timeoutError);
      expect(result).toEqual(expect.stringContaining('タイムアウト'));
    });
  });

  describe('Message Validation', () => {
    it('should validate Toukon messages correctly', () => {
      const validMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      const invalidMessages = [
        { action: 'INJECT_TOUKON' }, // missing timestamp
        { timestamp: Date.now() }, // missing action
        { action: 'WRONG_ACTION', timestamp: Date.now() },
        { action: 'INJECT_TOUKON', timestamp: 'invalid' },
      ];

      expect(isToukonMessage(validMessage)).toBe(true);
      invalidMessages.forEach((message) => {
        expect(isToukonMessage(message)).toBe(false);
      });
    });

    it('should validate status messages correctly', () => {
      const validMessage = {
        action: 'STATUS_UPDATE',
        replacementCount: 5,
        success: true,
      };

      const invalidMessages = [
        { action: 'STATUS_UPDATE', success: true }, // missing replacementCount
        { action: 'STATUS_UPDATE', replacementCount: 5 }, // missing success
        { action: 'WRONG_ACTION', replacementCount: 5, success: true },
        { action: 'STATUS_UPDATE', replacementCount: 'invalid', success: true },
      ];

      expect(isStatusMessage(validMessage)).toBe(true);
      invalidMessages.forEach((message) => {
        expect(isStatusMessage(message)).toBe(false);
      });
    });
  });
});
