/**
 * 闘魂AI変換 Popup Controller
 * Embodies the spirit of Toukon - the unwavering will to overcome oneself
 */

import {
  ToukonMessage,
  StatusMessage,
  PopupController,
  StatusType,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
  ToukonError,
} from './types.js';

// Main popup controller implementation
class ToukonPopupController implements PopupController {
  private injectButton: HTMLButtonElement;
  private statusElement: HTMLElement;
  private statusText: HTMLElement;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private isProcessing: boolean = false;

  constructor() {
    this.injectButton = document.getElementById('inject-toukon') as HTMLButtonElement;
    this.statusElement = document.getElementById('status') as HTMLElement;
    this.statusText = this.statusElement.querySelector('.status-text') as HTMLElement;
  }

  /**
   * Initialize the popup UI and set up event listeners
   */
  public initializeUI(): void {
    try {
      if (!this.injectButton || !this.statusElement || !this.statusText) {
        throw new Error('Required DOM elements not found');
      }

      // Set up click handler for the inject button with error boundary
      this.injectButton.addEventListener('click', () => {
        this.handleInjectClick().catch((error) => {
          console.error('Error during Toukon injection:', error);
          this.handleError(error);
        });
      });

      // Initialize with ready status
      this.updateStatus('準備完了');
    } catch (error) {
      console.error('Failed to initialize popup UI:', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Handle inject button click with proper error handling
   */
  private async handleInjectClick(): Promise<void> {
    // Prevent concurrent operations
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

  /**
   * Handle initialization errors gracefully
   */
  private handleInitializationError(error: any): void {
    console.error('Popup initialization failed:', error);

    // Try to show error in any available status element
    const fallbackStatus = document.querySelector('.status-text') || document.body;
    if (fallbackStatus) {
      fallbackStatus.textContent = 'ポップアップの初期化に失敗しました';
    }
  }

  /**
   * Trigger the Toukon injection process with retry logic
   */
  public async injectToukon(): Promise<void> {
    return this.injectToukonWithRetry();
  }

  /**
   * Inject Toukon with retry logic for transient failures
   */
  private async injectToukonWithRetry(): Promise<void> {
    this.isProcessing = true;
    let lastError: Error | null = null;

    try {
      // Update UI to show processing state
      this.updateStatus('闘魂注入中...', 'processing');
      this.injectButton.disabled = true;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          await this.performInjection();
          return; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');

          // Don't retry for certain error types
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

      // All retries failed
      throw lastError || new Error('All retry attempts failed');
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally {
      this.isProcessing = false;
      // Re-enable the button after a short delay
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

  /**
   * Perform the actual injection operation
   */
  private async performInjection(): Promise<void> {
    // Get the current active tab with enhanced error handling
    const tabInfo = await this.getCurrentTab();
    this.validateTabAccess(tabInfo);

    // Send message to background script to execute content script
    const message: ToukonMessage = {
      action: 'INJECT_TOUKON',
      timestamp: Date.now(),
    };

    // Send message and wait for response with timeout
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

  /**
   * Get current active tab with comprehensive error handling
   */
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

  /**
   * Validate if we can access the given tab
   */
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

  /**
   * Send message with timeout to prevent hanging
   */
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

  /**
   * Determine if an error should not be retried
   */
  private shouldNotRetry(error: any): boolean {
    // Don't retry for these error types
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

  /**
   * Handle errors with appropriate user feedback
   */
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

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update the status display with message and type
   */
  public updateStatus(message: string, type?: StatusType): void {
    try {
      if (!this.statusText || !this.statusElement) {
        console.warn('Status elements not available for update');
        return;
      }

      // Update text content
      this.statusText.textContent = message;

      // Remove all status classes
      this.statusElement.classList.remove('success', 'error', 'processing');

      // Add appropriate class based on type
      if (type) {
        this.statusElement.classList.add(type);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      // Fallback: try to update any available status element
      const fallbackStatus = document.querySelector('.status-text');
      if (fallbackStatus) {
        fallbackStatus.textContent = message;
      }
    }
  }
}

// Initialize the popup when DOM is loaded with error handling
document.addEventListener('DOMContentLoaded', () => {
  try {
    const controller = new ToukonPopupController();
    controller.initializeUI();
  } catch (error) {
    console.error('Failed to initialize popup controller:', error);
    // Show error in DOM if possible
    const statusElement = document.querySelector('.status-text');
    if (statusElement) {
      statusElement.textContent = 'ポップアップの初期化に失敗しました';
    }
  }
});

// Handle any runtime errors gracefully
window.addEventListener('error', (event) => {
  console.error('Popup runtime error:', event.error);

  // Try to show error in status if available
  const statusElement = document.querySelector('.status-text');
  if (statusElement) {
    statusElement.textContent = 'エラーが発生しました';
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in popup:', event.reason);

  // Try to show error in status if available
  const statusElement = document.querySelector('.status-text');
  if (statusElement) {
    statusElement.textContent = 'エラーが発生しました';
  }
});

// Export for testing purposes
export { ToukonPopupController };
