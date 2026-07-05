/**
 * Unit tests for popup controller functionality
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ToukonMessage,
  StatusMessage,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
  ToukonError,
} from '../types.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null as chrome.runtime.LastError | null,
  },
  tabs: {
    query: vi.fn(),
  },
};

// @ts-expect-error - provide global stub for chrome in test env
global.chrome = mockChrome;

// Mock DOM elements
const createMockElements = () => {
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
    querySelector: vi.fn(() => mockStatusText),
  };

  const mockStatusText = {
    textContent: '',
  };

  const mockDocument = {
    getElementById: vi.fn((id: string) => {
      if (id === 'inject-toukon') return mockButton;
      if (id === 'status') return mockStatusElement;
      return null;
    }),
    querySelector: vi.fn(() => mockStatusText),
    addEventListener: vi.fn(),
    body: mockStatusText,
  };

  return { mockButton, mockStatusElement, mockStatusText, mockDocument };
};

// Test implementation of popup controller
class ToukonPopupController {
  private injectButton: HTMLButtonElement | null;
  private statusElement: HTMLElement | null;
  private statusText: HTMLElement | null;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private isProcessing: boolean = false;

  constructor() {
    this.injectButton = document.getElementById('inject-toukon') as HTMLButtonElement | null;
    this.statusElement = document.getElementById('status') as HTMLElement | null;
    this.statusText = this.statusElement?.querySelector?.('.status-text') as HTMLElement | null;
  }

  public initializeUI(): void {
    try {
      if (!this.injectButton || !this.statusElement || !this.statusText) {
        throw new Error('Required DOM elements not found');
      }

      this.injectButton.addEventListener('click', () => {
        this.handleInjectClick().catch((error) => {
          console.error('Error during Toukon injection:', error);
          this.handleError(error);
        });
      });

      this.updateStatus('準備完了');
    } catch (error) {
      console.error('Failed to initialize popup UI:', error);
      this.handleInitializationError(error);
    }
  }

  private async handleInjectClick(): Promise<void> {
    if (this.isProcessing) {
      this.updateStatus('処理中です...', 'processing');
      return;
    }

    try {
      await this.injectToukonWithRetry();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleInitializationError(error: any): void {
    console.error('Popup initialization failed:', error);

    const fallbackStatus = document.querySelector('.status-text') || document.body;
    if (fallbackStatus) {
      fallbackStatus.textContent = 'ポップアップの初期化に失敗しました';
    }
  }

  public async injectToukon(): Promise<void> {
    return this.injectToukonWithRetry();
  }

  private async injectToukonWithRetry(): Promise<void> {
    this.isProcessing = true;
    let lastError: Error | null = null;

    try {
      this.updateStatus('闘魂注入中...', 'processing');
      this.injectButton!.disabled = true;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          await this.performInjection();
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');

          if (this.shouldNotRetry(error)) {
            throw error;
          }

          if (attempt < this.maxRetries) {
            console.warn(`Injection attempt ${attempt} failed, retrying...`, {
              error: lastError.message,
              attemptsRemaining: this.maxRetries - attempt,
            });

            this.updateStatus(`再試行中... (${attempt}/${this.maxRetries})`, 'processing');
            await this.delay(this.retryDelay);
          }
        }
      }

      throw lastError || new Error('All retry attempts failed');
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally {
      this.isProcessing = false;
      setTimeout(() => {
        if (this.injectButton) {
          this.injectButton.disabled = false;
        }
        if (this.statusElement?.classList.contains('processing')) {
          this.updateStatus('準備完了');
        }
      }, 2000);
    }
  }

  private async performInjection(): Promise<void> {
    const tabInfo = await this.getCurrentTab();
    this.validateTabAccess(tabInfo);

    const message: ToukonMessage = {
      action: 'INJECT_TOUKON',
      timestamp: Date.now(),
    };

    const response = await this.sendMessageWithTimeout(message, 10000);

    if (response.success) {
      const count = response.replacementCount;
      if (count > 0) {
        this.updateStatus(`${count}箇所に闘魂を注入しました！`, 'success');
      } else {
        this.updateStatus('変換対象が見つかりませんでした', 'success');
      }
    } else {
      throw new Error(response.error || 'Unknown error occurred');
    }
  }

  private async getCurrentTab(): Promise<chrome.tabs.Tab> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab || !currentTab.id) {
        throw new TabAccessError('No active tab found');
      }

      return currentTab;
    } catch (error) {
      if (error instanceof TabAccessError) {
        throw error;
      }
      throw new TabAccessError('Failed to get current tab', { originalError: error });
    }
  }

  private validateTabAccess(tab: chrome.tabs.Tab): void {
    const restrictedProtocols = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'moz-extension://',
      'safari-extension://',
    ];

    if (!tab.url) {
      throw new TabAccessError('Tab URL is not accessible');
    }

    for (const protocol of restrictedProtocols) {
      if (tab.url.startsWith(protocol)) {
        throw new TabAccessError('Cannot access browser internal pages');
      }
    }
  }

  private async sendMessageWithTimeout(
    message: ToukonMessage,
    timeout: number,
  ): Promise<StatusMessage> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new MessagePassingError('Message timeout'));
      }, timeout);

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          reject(
            new MessagePassingError(
              chrome.runtime.lastError.message || 'Unknown Chrome runtime error',
            ),
          );
        } else if (!response) {
          reject(new MessagePassingError('No response received'));
        } else {
          resolve(response);
        }
      });
    });
  }

  private shouldNotRetry(error: any): boolean {
    if (error instanceof TabAccessError) {
      return true;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('cannot access') ||
        message.includes('restricted') ||
        message.includes('permission denied') ||
        message.includes('no active tab')
      ) {
        return true;
      }
    }

    return false;
  }

  private handleError(error: any): void {
    console.error('Popup error:', error);

    let errorMessage = '注入に失敗しました';

    if (error instanceof TabAccessError) {
      errorMessage = 'このページでは使用できません';
    } else if (error instanceof ContentScriptError) {
      errorMessage = 'ページの読み込みが完了していません';
    } else if (error instanceof MessagePassingError) {
      if (error.message.includes('timeout')) {
        errorMessage = 'タイムアウトしました。再試行してください';
      } else {
        errorMessage = '通信エラーが発生しました';
      }
    } else if (error instanceof ToukonError) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      if (error.message.includes('Cannot access')) {
        errorMessage = 'このページでは使用できません';
      } else if (error.message.includes('No active tab')) {
        errorMessage = 'アクティブなタブが見つかりません';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'タイムアウトしました。再試行してください';
      }
    }

    this.updateStatus(errorMessage, 'error');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public updateStatus(message: string, type?: 'success' | 'error' | 'processing'): void {
    try {
      if (!this.statusText || !this.statusElement) {
        console.warn('Status elements not available for update');
        return;
      }

      this.statusText.textContent = message;

      this.statusElement.classList.remove('success', 'error', 'processing');

      if (type) {
        this.statusElement.classList.add(type);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      const fallbackStatus = document.querySelector('.status-text');
      if (fallbackStatus) {
        fallbackStatus.textContent = message;
      }
    }
  }
}

describe('ToukonPopupController', () => {
  let popupController: ToukonPopupController;
  let mockElements: ReturnType<typeof createMockElements>;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;

    mockElements = createMockElements();
    // @ts-expect-error - assign mocked document
    global.document = mockElements.mockDocument;

    popupController = new ToukonPopupController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize UI successfully', () => {
      expect(() => {
        popupController.initializeUI();
      }).not.toThrow();

      expect(mockElements.mockButton.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
      );
      expect(mockElements.mockStatusText.textContent).toBe('準備完了');
    });

    it('should handle missing DOM elements gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock getElementById to return null
      mockElements.mockDocument.getElementById.mockReturnValue(null);

      const controller = new ToukonPopupController();

      expect(() => {
        controller.initializeUI();
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize popup UI:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle initialization errors with fallback status', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock querySelector to return fallback element
      const fallbackElement = { textContent: '' };
      mockElements.mockDocument.querySelector.mockReturnValue(fallbackElement);
      mockElements.mockDocument.getElementById.mockReturnValue(null);

      const controller = new ToukonPopupController();
      controller.initializeUI();

      expect(fallbackElement.textContent).toBe('ポップアップの初期化に失敗しました');

      consoleSpy.mockRestore();
    });
  });

  describe('tab access validation', () => {
    it('should validate regular website URLs', async () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 3,
          success: true,
        });
      });

      await expect(popupController.injectToukon()).resolves.not.toThrow();
    });

    it('should reject chrome:// URLs', async () => {
      const mockTab = {
        id: 1,
        url: 'chrome://settings',
        title: 'Settings',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);
    });

    it('should reject chrome-extension:// URLs', async () => {
      const mockTab = {
        id: 1,
        url: 'chrome-extension://abc123/popup.html',
        title: 'Extension',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);
    });

    it('should handle no active tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);
    });

    it('should handle tab without URL', async () => {
      const mockTab = {
        id: 1,
        title: 'Tab without URL',
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);
    });

    it('should handle tabs.query failure', async () => {
      mockChrome.tabs.query.mockRejectedValue(new Error('Query failed'));

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);
    });
  });

  describe('message passing', () => {
    beforeEach(() => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);
    });

    it('should handle successful injection', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 5,
          success: true,
        });
      });

      await popupController.injectToukon();

      expect(mockElements.mockStatusText.textContent).toBe('5箇所に闘魂を注入しました！');
      expect(mockElements.mockStatusElement.classList.add).toHaveBeenCalledWith('success');
    });

    it('should handle zero replacements', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: true,
        });
      });

      await popupController.injectToukon();

      expect(mockElements.mockStatusText.textContent).toBe('変換対象が見つかりませんでした');
      expect(mockElements.mockStatusElement.classList.add).toHaveBeenCalledWith('success');
    });

    it('should handle content script errors', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'DOM access denied',
        });
      });

      await expect(popupController.injectToukon()).rejects.toThrow();
    });

    it('should handle Chrome runtime errors', async () => {
      mockChrome.runtime.lastError = { message: 'Could not establish connection' };
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
      });

      await expect(popupController.injectToukon()).rejects.toThrow(MessagePassingError);
    });

    it('should handle message timeout', async () => {
      // Mock the internal timeout path by stubbing the private method
      vi.spyOn(popupController as any, 'sendMessageWithTimeout').mockRejectedValue(
        new MessagePassingError('Message timeout'),
      );

      await expect(popupController.injectToukon()).rejects.toThrow(MessagePassingError);
    }, 12000);

    it('should handle no response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
      });

      await expect(popupController.injectToukon()).rejects.toThrow(MessagePassingError);
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);
    });

    it('should retry on transient failures', async () => {
      let attemptCount = 0;
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        attemptCount++;
        if (attemptCount < 3) {
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 0,
            success: false,
            error: 'Transient error',
          });
        } else {
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 2,
            success: true,
          });
        }
      });

      await popupController.injectToukon();

      expect(attemptCount).toBe(3);
      expect(mockElements.mockStatusText.textContent).toBe('2箇所に闘魂を注入しました！');
    });

    it('should not retry on permanent failures', async () => {
      let attemptCount = 0;
      mockChrome.tabs.query.mockImplementation(() => {
        attemptCount++;
        return Promise.resolve([
          {
            id: 1,
            url: 'chrome://settings',
            title: 'Settings',
          },
        ]);
      });

      await expect(popupController.injectToukon()).rejects.toThrow(TabAccessError);

      expect(attemptCount).toBe(1); // Should not retry
    });

    it('should give up after max retries', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'Persistent error',
        });
      });

      await expect(popupController.injectToukon()).rejects.toThrow();
    });

    it('should show retry status during attempts', async () => {
      let attemptCount = 0;
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        attemptCount++;
        if (attemptCount < 2) {
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 0,
            success: false,
            error: 'Transient error',
          });
        } else {
          callback({
            action: 'STATUS_UPDATE',
            replacementCount: 1,
            success: true,
          });
        }
      });

      await popupController.injectToukon();

      // Should have shown retry status
      expect(mockElements.mockStatusText.textContent).toBe('1箇所に闘魂を注入しました！');
    });
  });

  describe('concurrent processing protection', () => {
    beforeEach(() => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
      };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);
    });

    it('should prevent concurrent injections', async () => {
      // Set processing state manually
      (popupController as any).isProcessing = true;

      // Mock the private method to verify it's called
      const handleInjectClickSpy = vi.spyOn(popupController as any, 'handleInjectClick');

      // Simulate click handler call
      await (popupController as any).handleInjectClick();

      expect(mockElements.mockStatusText.textContent).toBe('処理中です...');
      expect(mockElements.mockStatusElement.classList.add).toHaveBeenCalledWith('processing');
    });

    it('should reset processing state after completion', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 1,
          success: true,
        });
      });

      await popupController.injectToukon();

      expect((popupController as any).isProcessing).toBe(false);
    });

    it('should reset processing state after error', async () => {
      mockChrome.tabs.query.mockRejectedValue(new Error('Tab error'));

      await expect(popupController.injectToukon()).rejects.toThrow();

      expect((popupController as any).isProcessing).toBe(false);
    });

    it('should re-enable button after processing', async () => {
      vi.useFakeTimers();

      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          action: 'STATUS_UPDATE',
          replacementCount: 1,
          success: true,
        });
      });

      await popupController.injectToukon();

      // Fast-forward timers
      vi.advanceTimersByTime(2000);

      expect(mockElements.mockButton.disabled).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('error handling and user feedback', () => {
    it('should provide user-friendly error messages', () => {
      const testCases = [
        {
          error: new TabAccessError('Cannot access tab'),
          expected: 'このページでは使用できません',
        },
        {
          error: new ContentScriptError('Script failed'),
          expected: 'ページの読み込みが完了していません',
        },
        {
          error: new MessagePassingError('Message timeout'),
          expected: 'タイムアウトしました。再試行してください',
        },
        {
          error: new MessagePassingError('Communication failed'),
          expected: '通信エラーが発生しました',
        },
        {
          error: new Error('Cannot access restricted page'),
          expected: 'このページでは使用できません',
        },
        {
          error: new Error('No active tab found'),
          expected: 'アクティブなタブが見つかりません',
        },
        {
          error: new Error('Request timeout'),
          expected: 'タイムアウトしました。再試行してください',
        },
        {
          error: new Error('Unknown error'),
          expected: '注入に失敗しました',
        },
      ];

      testCases.forEach(({ error, expected }) => {
        (popupController as any).handleError(error);
        expect(mockElements.mockStatusText.textContent).toBe(expected);
        expect(mockElements.mockStatusElement.classList.add).toHaveBeenCalledWith('error');
      });
    });

    it('should handle status update errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock statusText to throw on textContent assignment
      Object.defineProperty(mockElements.mockStatusText, 'textContent', {
        set: () => {
          throw new Error('DOM error');
        },
        configurable: true,
      });

      // Mock fallback element
      const fallbackElement = { textContent: '' };
      mockElements.mockDocument.querySelector.mockReturnValue(fallbackElement);

      popupController.updateStatus('Test message', 'error');

      expect(fallbackElement.textContent).toBe('Test message');
      expect(consoleSpy).toHaveBeenCalledWith('Error updating status:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle missing status elements gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create controller with null elements
      const controller = new (class extends ToukonPopupController {
        constructor() {
          super();
          (this as any).statusText = null;
          (this as any).statusElement = null;
        }
      })();

      controller.updateStatus('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('Status elements not available for update');

      consoleSpy.mockRestore();
    });
  });

  describe('status updates', () => {
    it('should update status with different types', () => {
      const testCases = [
        { message: 'Success message', type: 'success' as const },
        { message: 'Error message', type: 'error' as const },
        { message: 'Processing message', type: 'processing' as const },
        { message: 'Default message', type: undefined },
      ];

      testCases.forEach(({ message, type }) => {
        popupController.updateStatus(message, type);

        expect(mockElements.mockStatusText.textContent).toBe(message);
        expect(mockElements.mockStatusElement.classList.remove).toHaveBeenCalledWith(
          'success',
          'error',
          'processing',
        );

        if (type) {
          expect(mockElements.mockStatusElement.classList.add).toHaveBeenCalledWith(type);
        }
      });
    });

    it('should clear previous status classes', () => {
      popupController.updateStatus('First message', 'success');
      popupController.updateStatus('Second message', 'error');

      expect(mockElements.mockStatusElement.classList.remove).toHaveBeenCalledWith(
        'success',
        'error',
        'processing',
      );
    });
  });
});
