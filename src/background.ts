/**
 * 闘魂AI変換 Chrome Extension - Background Script
 * Manages extension lifecycle and message passing between popup and content script
 * Embodies the philosophy of Toukon - the unwavering will to overcome oneself
 */

import {
  ToukonMessage,
  StatusMessage,
  HealthCheckMessage,
  HealthCheckResponse,
  BackgroundScript,
  TabInfo,
  isToukonMessage,
  isHealthCheckMessage,
  isValidExtensionMessage,
  ToukonError,
  TabAccessError,
  ContentScriptError,
  MessagePassingError,
} from './types.js';

/**
 * Main BackgroundScript class implementing message handling and tab communication
 */
class ToukonBackgroundScript implements BackgroundScript {
  constructor() {
    this.initializeMessageHandlers();
  }

  /**
   * Initialize message handlers for extension communication
   */
  private initializeMessageHandlers(): void {
    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
      // Enhanced message routing with proper validation
      this.routeMessage(message, sender, sendResponse);
      return true; // Always return true for async response handling
    });
  }

  /**
   * Route messages to appropriate handlers with validation
   * @param message - The incoming message
   * @param sender - The message sender information
   * @param sendResponse - The response callback function
   */
  private routeMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
  ): void {
    try {
      // Validate message format first
      if (!this.validateMessage(message)) {
        const errorResponse: StatusMessage = {
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'Invalid message format',
          timestamp: Date.now(),
        };
        sendResponse(errorResponse);
        return;
      }

      // Route based on message type
      if (isToukonMessage(message)) {
        this.handleToukonMessage(message, sender)
          .then((response) => sendResponse(response))
          .catch((error) => {
            console.error('Error handling Toukon message:', error);
            const errorResponse: StatusMessage = {
              action: 'STATUS_UPDATE',
              replacementCount: 0,
              success: false,
              error: this.getErrorMessage(error),
              timestamp: Date.now(),
            };
            sendResponse(errorResponse);
          });
      } else if (isHealthCheckMessage(message)) {
        this.handleHealthCheck(message)
          .then((response) => sendResponse(response))
          .catch((error) => {
            console.error('Error handling health check:', error);
            const errorResponse: HealthCheckResponse = {
              action: 'HEALTH_CHECK_RESPONSE',
              status: 'error',
              timestamp: Date.now(),
              error: this.getErrorMessage(error),
            };
            sendResponse(errorResponse);
          });
      } else {
        // Unknown message type
        const errorResponse: StatusMessage = {
          action: 'STATUS_UPDATE',
          replacementCount: 0,
          success: false,
          error: 'Unknown message type',
          timestamp: Date.now(),
        };
        sendResponse(errorResponse);
      }
    } catch (error) {
      console.error('Error in message routing:', error);
      const errorResponse: StatusMessage = {
        action: 'STATUS_UPDATE',
        replacementCount: 0,
        success: false,
        error: 'Message routing failed',
        timestamp: Date.now(),
      };
      sendResponse(errorResponse);
    }
  }

  /**
   * Validate incoming message format with comprehensive checks
   * @param message - The message to validate
   * @returns True if message is valid
   */
  private validateMessage(message: any): boolean {
    if (!message || typeof message !== 'object') {
      return false;
    }

    // Check for required action field
    if (typeof message.action !== 'string') {
      return false;
    }

    // Use type guards for specific validation
    return isValidExtensionMessage(message);
  }

  /**
   * Extract user-friendly error message from error object
   * @param error - The error to process
   * @returns User-friendly error message
   */
  public getErrorMessage(error: any): string {
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
  }

  /**
   * Handle Toukon message from popup and coordinate with content script
   * @param message - The Toukon message from popup
   * @param sender - The message sender information
   * @returns Promise resolving to status message
   */
  public async handleToukonMessage(
    message: ToukonMessage,
    _sender: chrome.runtime.MessageSender,
  ): Promise<StatusMessage> {
    try {
      // Use specified tab ID or get current active tab
      let tabId: number;

      if (message.tabId) {
        tabId = message.tabId;
      } else {
        const tabInfo = await this.getCurrentTab();
        this.validateTabAccess(tabInfo);
        tabId = tabInfo.id;
      }

      // Execute content script on the target tab
      return await this.executeContentScript(tabId);
    } catch (error) {
      console.error('Error in handleToukonMessage:', error);
      throw error;
    }
  }

  /**
   * Handle health check message to verify extension status
   * @param message - The health check message
   * @returns Promise resolving to health check response
   */
  public async handleHealthCheck(_message: HealthCheckMessage): Promise<HealthCheckResponse> {
    try {
      return {
        action: 'HEALTH_CHECK_RESPONSE',
        status: 'ready',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        action: 'HEALTH_CHECK_RESPONSE',
        status: 'error',
        timestamp: Date.now(),
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   * @param message - The message from popup
   * @returns Promise resolving to status message
   */
  public async handlePopupMessage(message: ToukonMessage): Promise<StatusMessage> {
    return this.handleToukonMessage(message, {} as chrome.runtime.MessageSender);
  }

  /**
   * Get current active tab with proper error handling
   * @returns Promise resolving to tab information
   */
  private async getCurrentTab(): Promise<TabInfo> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab || !currentTab.id) {
        throw new TabAccessError('No active tab found');
      }

      const info: TabInfo = {
        id: currentTab.id as number,
      } as TabInfo;

      if (typeof currentTab.url === 'string') {
        (info as any).url = currentTab.url;
      }
      if (typeof currentTab.title === 'string') {
        (info as any).title = currentTab.title;
      }

      return info;
    } catch (error) {
      if (error instanceof TabAccessError) {
        throw error;
      }
      throw new TabAccessError('Failed to get current tab', { originalError: error });
    }
  }

  /**
   * Validate if we can access the given tab
   * @param tabInfo - The tab information to validate
   */
  private validateTabAccess(tabInfo: TabInfo): void {
    const restrictedProtocols = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'moz-extension://',
      'safari-extension://',
    ];

    if (!tabInfo.url) {
      throw new TabAccessError('Tab URL is not accessible');
    }

    for (const protocol of restrictedProtocols) {
      if (tabInfo.url.startsWith(protocol)) {
        throw new TabAccessError('Cannot access browser internal pages');
      }
    }
  }

  /**
   * Execute content script on specified tab and handle communication
   * @param tabId - The ID of the tab to execute script on
   * @returns Promise resolving to status message
   */
  public async executeContentScript(tabId: number): Promise<StatusMessage> {
    try {
      // Create message with validation
      const message: ToukonMessage = {
        action: 'INJECT_TOUKON',
        timestamp: Date.now(),
      };

      // Validate message before sending
      if (!isToukonMessage(message)) {
        throw new MessagePassingError('Invalid message format');
      }

      // Send message to content script with timeout handling
      const response = await this.sendMessageWithTimeout(tabId, message, 10000);

      if (!response) {
        throw new ContentScriptError('No response from content script');
      }

      // Validate response format
      if (!this.validateStatusResponse(response)) {
        throw new MessagePassingError('Invalid response format from content script');
      }

      return response;
    } catch (error) {
      console.error('Error executing content script:', error);
      // Handle MessagePassingError semantics (e.g., timeouts, invalid responses)
      if (error instanceof MessagePassingError) {
        if (error.message.includes('Could not establish connection')) {
          throw new ContentScriptError(
            'Content script not ready. Please refresh the page and try again.',
          );
        }
        // Re-throw other message passing errors so tests can assert them directly
        throw error;
      }

      // Preserve other known ToukonError types
      if (error instanceof ToukonError) {
        throw error;
      }

      // Handle Chrome API specific errors surfaced as generic Error
      if (error instanceof Error) {
        if (error.message.includes('Could not establish connection')) {
          throw new ContentScriptError(
            'Content script not ready. Please refresh the page and try again.',
          );
        } else if (error.message.includes('No tab with id')) {
          throw new TabAccessError('Tab is no longer available');
        } else if (error.message.includes('Cannot access')) {
          throw new TabAccessError('Cannot access this page');
        }
      }

      // Fallback
      throw new ContentScriptError('Failed to execute content script', { originalError: error });
    }
  }

  /**
   * Send message with timeout to prevent hanging
   * @param tabId - The tab ID to send message to
   * @param message - The message to send
   * @param timeout - Timeout in milliseconds
   * @returns Promise resolving to response
   */
  private async sendMessageWithTimeout(
    tabId: number,
    message: ToukonMessage,
    timeout: number,
  ): Promise<StatusMessage> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new MessagePassingError('Message timeout'));
      }, timeout);

      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          reject(
            new MessagePassingError(
              chrome.runtime.lastError.message || 'Unknown Chrome runtime error',
            ),
          );
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Validate status response format
   * @param response - The response to validate
   * @returns True if response is valid
   */
  private validateStatusResponse(response: any): response is StatusMessage {
    return (
      response &&
      typeof response === 'object' &&
      response.action === 'STATUS_UPDATE' &&
      typeof response.replacementCount === 'number' &&
      typeof response.success === 'boolean'
    );
  }
}

// Create global instance of the background script
export const toukonBackground = new ToukonBackgroundScript();

// Log that background script is loaded and ready
console.log('闘魂AI変換 Background Script loaded - Ready to coordinate Toukon injection!');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('闘魂AI変換 Extension installed - Toukon spirit is ready!');
  } else if (details.reason === 'update') {
    console.log('闘魂AI変換 Extension updated - Toukon spirit enhanced!');
  }
});

// Export for testing purposes
export { ToukonBackgroundScript };
