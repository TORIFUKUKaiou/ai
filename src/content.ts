/**
 * 闘魂AI変換 Chrome Extension - Content Script
 * Transforms "AI" text to "AI（アントニオ猪木）" on web pages
 * Embodies the philosophy of Toukon - the unwavering will to overcome oneself
 */

// Local minimal runtime definitions to avoid ESM imports in content scripts
// Content scripts are classic scripts in MV3 and cannot use `import`.
type ToukonMessage = { action: 'INJECT_TOUKON'; timestamp: number; tabId?: number };
type StatusMessage = {
  action: 'STATUS_UPDATE';
  replacementCount: number;
  success: boolean;
  error?: string;
  timestamp?: number;
};
type HealthCheckMessage = { action: 'HEALTH_CHECK'; timestamp: number };
type HealthCheckResponse = {
  action: 'HEALTH_CHECK_RESPONSE';
  status: 'ready' | 'error';
  timestamp: number;
  error?: string;
};

function isToukonMessage(message: any): message is ToukonMessage {
  return (
    !!message &&
    typeof message === 'object' &&
    message.action === 'INJECT_TOUKON' &&
    typeof message.timestamp === 'number' &&
    (message.tabId === undefined || typeof message.tabId === 'number')
  );
}

function isHealthCheckMessage(message: any): message is HealthCheckMessage {
  return (
    !!message &&
    typeof message === 'object' &&
    message.action === 'HEALTH_CHECK' &&
    typeof message.timestamp === 'number'
  );
}

/**
 * Sanitize incoming message to prevent code injection
 * @param message - The message to sanitize
 * @returns Sanitized message or null if invalid
 */
function sanitizeMessage(raw: unknown): ToukonMessage | HealthCheckMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const unsafeAction = obj['action'];
  const action = typeof unsafeAction === 'string' ? unsafeAction.replace(/[^A-Z_]/g, '') : '';

  if (action === 'INJECT_TOUKON') {
    const tsRaw = obj['timestamp'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw);
    const tabRaw = obj['tabId'];
    const tabId = typeof tabRaw === 'number' && Number.isFinite(tabRaw) ? tabRaw : undefined;
    return tabId !== undefined
      ? { action: 'INJECT_TOUKON', timestamp: Number.isFinite(ts) ? ts : Date.now(), tabId }
      : { action: 'INJECT_TOUKON', timestamp: Number.isFinite(ts) ? ts : Date.now() };
  }

  if (action === 'HEALTH_CHECK') {
    const tsRaw = obj['timestamp'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw);
    return { action: 'HEALTH_CHECK', timestamp: Number.isFinite(ts) ? ts : Date.now() };
  }

  return null;
}

class ToukonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any,
  ) {
    super(message);
    this.name = 'ToukonError';
  }
}

class ContentScriptError extends ToukonError {
  constructor(message: string, context?: any) {
    super(message, 'CONTENT_SCRIPT_ERROR', context);
    this.name = 'ContentScriptError';
  }
}

/**
 * Main ContentScript class implementing text replacement functionality
 */
class ToukonContentScript {
  private replacementCount: number = 0;
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private retryDelay: number = 100;
  private stylesInstalled: boolean = false;
  private observer?: MutationObserver;
  private observing: boolean = false;

  /**
   * Main function to find and replace all "AI" text on the page
   * @returns Number of replacements made
   */
  findAndReplaceAI(): number {
    // Prevent concurrent processing
    if (this.isProcessing) {
      throw new ContentScriptError('Text replacement already in progress', {
        operation: 'findAndReplaceAI',
        state: 'processing',
      });
    }

    this.isProcessing = true;
    this.replacementCount = 0;

    try {
      // Check if document is accessible and ready
      this.validateDocumentAccess();

      // Ensure styles for visual effect are installed
      this.ensureStylesInstalled();

      // Start observing dynamically inserted content (e.g., comment modules)
      this.startMutationObserver();

      // Start traversal from document body to cover all visible content
      if (document.body) {
        this.traverseTextNodes(document.body);
      } else {
        // Gracefully handle missing body as zero replacements (per spec/tests)
        return this.replacementCount;
      }

      return this.replacementCount;
    } catch (error) {
      // Enhanced error logging with context
      if (error instanceof ContentScriptError) {
        console.error('Content script error during text replacement:', {
          message: error.message,
          code: error.code,
          context: error.context,
        });
        throw error;
      } else {
        const wrappedError = new ContentScriptError(
          `Unexpected error during text replacement: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            operation: 'findAndReplaceAI',
            originalError: error,
          },
        );
        console.error('Unexpected error during text replacement:', wrappedError);
        throw wrappedError;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Recursively traverse DOM elements to find text nodes
   * Preserves page layout by only processing text nodes
   * @param element - The element to traverse
   */
  traverseTextNodes(element: Element): void {
    try {
      // Validate element accessibility
      if (!element || !element.childNodes) {
        console.warn('Element is not accessible for traversal:', element);
        return;
      }

      // Get all child nodes (including text nodes) with error recovery
      let childNodes: Node[];
      try {
        childNodes = Array.from(element.childNodes);
      } catch (error) {
        console.warn('Failed to access child nodes, skipping element:', {
          element: element.tagName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return;
      }

      for (const node of childNodes) {
        try {
          if (node.nodeType === Node.TEXT_NODE) {
            // Process text nodes for replacement with error recovery
            const textNode = node as Text;
            this.replaceTextInNodeWithRetry(textNode);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elementNode = node as Element;

            // Skip script, style, and other non-visible elements
            const tagName = elementNode.tagName?.toLowerCase();
            if (tagName && !this.shouldSkipElement(tagName)) {
              // Recursively traverse child elements with error boundary (no pre-filter)
              this.traverseTextNodes(elementNode);
            }
          }
        } catch (error) {
          // Log individual node errors but continue processing
          console.warn('Error processing individual node, continuing traversal:', {
            nodeType: node.nodeType,
            nodeName: node.nodeName,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          continue;
        }
      }
    } catch (error) {
      // Log traversal errors but don't throw to allow partial processing
      console.error('Error traversing text nodes, partial processing may have occurred:', {
        element: element.tagName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Replace "AI" text in a specific text node while preserving layout
   * @param node - The text node to process
   * @returns True if replacement was made, false otherwise
   */
  replaceTextInNode(node: Text): boolean {
    try {
      // Validate node accessibility
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        console.warn('Invalid text node provided for replacement');
        return false;
      }

      // Don't process text already wrapped by our span
      if (node.parentElement?.classList.contains('toukon-ai')) {
        return false;
      }

      const originalText = node.textContent ?? '';
      if (!originalText) return false;

      // Match both ASCII "AI" and full-width "ＡＩ", optionally separated by zero-width/format chars
      const invisible = '[\\u00A0\\u2000-\\u200D\\u2028-\\u202F\\u2060-\\u206F\\uFEFF]*';
      const targetRegex = new RegExp(`(?:A${invisible}I|Ａ${invisible}Ｉ)`, 'g');
      if (!targetRegex.test(originalText)) {
        return false;
      }

      // Build a fragment replacing matches with styled span
      const APPEND_TEXT = '（アントニオ猪木）';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      targetRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      let localCount = 0;
      while ((match = targetRegex.exec(originalText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > lastIndex) {
          fragment.appendChild(document.createTextNode(originalText.slice(lastIndex, start)));
        }
        const span = document.createElement('span');
        span.className = 'toukon-ai';
        span.setAttribute('data-toukon-ai', '1');
        // Preserve original matched form (half-width "AI" or full-width "ＡＩ" or with invisible separators)
        span.textContent = `${match[0]}${APPEND_TEXT}`;
        fragment.appendChild(span);
        localCount += 1;
        lastIndex = end;
      }
      if (lastIndex < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.slice(lastIndex)));
      }

      try {
        // Replace node with the fragment
        const parent = node.parentNode;
        if (!parent) return false;
        parent.replaceChild(fragment, node);
        this.replacementCount += localCount;
        return localCount > 0;
      } catch (error) {
        throw new ContentScriptError(
          'Failed to update text content - possible permission restriction',
          {
            operation: 'replaceTextInNode',
            originalError: error,
            nodeInfo: {
              parentElement: node.parentElement?.tagName,
              textLength: originalText.length,
            },
          },
        );
      }
    } catch (error) {
      if (error instanceof ContentScriptError) {
        console.warn('Content script error replacing text in node:', {
          message: error.message,
          context: error.context,
        });
        throw error;
      } else {
        const wrappedError = new ContentScriptError(
          `Unexpected error replacing text in node: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            operation: 'replaceTextInNode',
            originalError: error,
          },
        );
        console.warn('Unexpected error replacing text in node:', wrappedError);
        throw wrappedError;
      }
    }
  }

  /**
   * Replace text in node with retry logic for transient failures
   * @param node - The text node to process
   * @returns True if replacement was made, false otherwise
   */
  private replaceTextInNodeWithRetry(node: Text): boolean {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return this.replaceTextInNode(node);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.maxRetries) {
          console.warn(`Text replacement attempt ${attempt} failed, retrying...`, {
            error: lastError.message,
            attemptsRemaining: this.maxRetries - attempt,
          });

          // Brief delay before retry
          if (this.retryDelay > 0) {
            // Use setTimeout for non-blocking delay in browser environment
            const start = Date.now();
            while (Date.now() - start < this.retryDelay) {
              // Busy wait for short delay
            }
          }
        }
      }
    }

    // All retries failed
    console.error(`Text replacement failed after ${this.maxRetries} attempts:`, {
      finalError: lastError?.message,
      nodeInfo: {
        parentElement: node.parentElement?.tagName,
        textLength: node.textContent?.length || 0,
      },
    });

    return false;
  }

  /**
   * Validate that the document is accessible and ready for manipulation
   * @throws ContentScriptError if document is not accessible
   */
  validateDocumentAccess(): void {
    // Check if document exists
    if (typeof document === 'undefined') {
      throw new ContentScriptError('Document is not available in this context', {
        operation: 'validateDocumentAccess',
        context: 'document_undefined',
      });
    }

    // Check document ready state
    if (document.readyState === 'loading') {
      throw new ContentScriptError(
        'Document is still loading, text replacement may be incomplete',
        {
          operation: 'validateDocumentAccess',
          documentState: document.readyState,
        },
      );
    }

    // Check if we have permission to access the document
    try {
      // Test basic DOM access
      const testAccess = document.documentElement;
      if (!testAccess) {
        throw new ContentScriptError('Cannot access document root element', {
          operation: 'validateDocumentAccess',
          context: 'no_document_element',
        });
      }
    } catch (error) {
      throw new ContentScriptError('Permission denied: Cannot access document content', {
        operation: 'validateDocumentAccess',
        originalError: error,
        url: window.location?.href || 'unknown',
      });
    }

    // Check for restricted pages
    const url = window.location?.href || '';
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
        throw new ContentScriptError('Cannot modify content on restricted pages', {
          operation: 'validateDocumentAccess',
          url: url,
          restriction: 'browser_page',
        });
      }
    }
  }

  /**
   * Determine if an element should be skipped during traversal
   * @param tagName - The lowercase tag name
   * @returns True if element should be skipped
   */
  private shouldSkipElement(tagName: string): boolean {
    const skipTags = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'canvas',
      'svg',
      'input',
      'textarea',
    ];

    return skipTags.includes(tagName);
  }

  /**
   * Inject CSS styles for Toukon effect once per page
   */
  private ensureStylesInstalled(): void {
    if (this.stylesInstalled) return;
    try {
      const STYLE_ID = 'toukon-ai-style';
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
          .toukon-ai {
            color: #DC143C !important;
            display: inline-block;
            animation: toukon-shake 1.1s ease-in-out infinite;
            transform-origin: center;
          }
          @keyframes toukon-shake {
            0%,100% { transform: translate(0, 0) rotate(0deg); }
            10% { transform: translate(-0.5px, 0.6px) rotate(-0.5deg); }
            20% { transform: translate(0.6px, -0.4px) rotate(0.4deg); }
            30% { transform: translate(-0.6px, 0.4px) rotate(-0.4deg); }
            40% { transform: translate(0.5px, -0.6px) rotate(0.5deg); }
            50% { transform: translate(-0.4px, 0.5px) rotate(-0.3deg); }
            60% { transform: translate(0.6px, -0.5px) rotate(0.4deg); }
            70% { transform: translate(-0.5px, 0.6px) rotate(-0.4deg); }
            80% { transform: translate(0.4px, -0.6px) rotate(0.3deg); }
            90% { transform: translate(-0.6px, 0.4px) rotate(-0.5deg); }
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }
      this.stylesInstalled = true;
    } catch {
      // ignore style injection failures
    }
  }

  /**
   * Observe dynamic DOM changes to process newly inserted comment content
   */
  private startMutationObserver(): void {
    if (this.observing) return;
    try {
      const root = document.getElementById('articleCommentModule') || document.body;
      if (!root) return;
      this.observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            m.addedNodes.forEach((n) => this.processAddedNode(n));
          } else if (m.type === 'characterData') {
            const parent = (m.target as CharacterData).parentElement;
            if (parent && !this.shouldSkipElement(parent.tagName.toLowerCase())) {
              this.traverseTextNodes(parent);
            }
          }
        }
      });
      this.observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      this.observing = true;
    } catch {
      // ignore observer failure
    }
  }

  private processAddedNode(node: Node): void {
    try {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = (node as Text).parentElement;
        if (parent && !this.shouldSkipElement(parent.tagName.toLowerCase())) {
          this.traverseTextNodes(parent);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.closest('.toukon-ai')) return;
        const tag = el.tagName.toLowerCase();
        if (!this.shouldSkipElement(tag)) {
          this.traverseTextNodes(el);
        }
      }
    } catch {
      // ignore
    }
  }
}

// Create global instance of the content script
const toukonScript = new ToukonContentScript();

// Listen for messages from popup/background script
chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  try {
    // Sanitize and validate message before processing
    const sanitizedMessage = sanitizeMessage(raw);
    if (!sanitizedMessage) {
      const errorResponse: StatusMessage = {
        action: 'STATUS_UPDATE',
        replacementCount: 0,
        success: false,
        error: 'Invalid message format',
        timestamp: Date.now(),
      };
      sendResponse(errorResponse);
      return true;
    }

    // Route message to appropriate handler
    if (isToukonMessage(sanitizedMessage)) {
      handleToukonMessage(sanitizedMessage, sendResponse);
    } else if (isHealthCheckMessage(sanitizedMessage)) {
      handleHealthCheckMessage(sanitizedMessage, sendResponse);
    } else {
      // Invalid message format
      const errorResponse: StatusMessage = {
        action: 'STATUS_UPDATE',
        replacementCount: 0,
        success: false,
        error: 'Invalid message format',
        timestamp: Date.now(),
      };
      sendResponse(errorResponse);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    const errorResponse: StatusMessage = {
      action: 'STATUS_UPDATE',
      replacementCount: 0,
      success: false,
      error: 'Message handling failed',
      timestamp: Date.now(),
    };
    sendResponse(errorResponse);
  }

  return true; // Keep message channel open for async response
});

/**
 * Handle Toukon injection message with comprehensive error handling
 * @param message - The Toukon message
 * @param sendResponse - Response callback function
 */
function handleToukonMessage(
  _message: ToukonMessage,
  sendResponse: (response: StatusMessage) => void,
): void {
  try {
    const replacementCount = toukonScript.findAndReplaceAI();

    // Send status back to background script
    const statusMessage: StatusMessage = {
      action: 'STATUS_UPDATE',
      replacementCount,
      success: true,
      timestamp: Date.now(),
    };

    sendResponse(statusMessage);
  } catch (error) {
    console.error('Error injecting Toukon:', error);

    let errorMessage: string;
    let errorCode: string = 'UNKNOWN_ERROR';

    if (error instanceof ContentScriptError) {
      errorMessage = error.message;
      errorCode = error.code;

      // Provide user-friendly error messages based on error type
      if (error.context?.restriction === 'browser_page') {
        errorMessage = 'Cannot inject Toukon on browser pages. Please try on a regular website.';
      } else if (error.context?.context === 'document_undefined') {
        errorMessage = 'Page content is not accessible. Please refresh and try again.';
      } else if (error.context?.documentState === 'loading') {
        errorMessage = 'Page is still loading. Please wait and try again.';
      }
    } else if (error instanceof ToukonError) {
      errorMessage = error.message;
      errorCode = error.code;
    } else {
      errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    }

    const errorResponse: StatusMessage = {
      action: 'STATUS_UPDATE',
      replacementCount: 0,
      success: false,
      error: `${errorMessage} (${errorCode})`,
      timestamp: Date.now(),
    };

    sendResponse(errorResponse);
  }
}

/**
 * Handle health check message with enhanced validation
 * @param message - The health check message
 * @param sendResponse - Response callback function
 */
function handleHealthCheckMessage(
  _message: HealthCheckMessage,
  sendResponse: (response: HealthCheckResponse) => void,
): void {
  try {
    // Perform comprehensive readiness checks
    let isReady = true;
    const errorDetails: string[] = [];

    // Check document state
    if (document.readyState !== 'complete') {
      isReady = false;
      errorDetails.push(`Document state: ${document.readyState}`);
    }

    // Check document body
    if (!document.body) {
      isReady = false;
      errorDetails.push('Document body not available');
    }

    // Check DOM access permissions
    try {
      toukonScript.validateDocumentAccess();
    } catch (error) {
      isReady = false;
      if (error instanceof ContentScriptError) {
        errorDetails.push(`Access validation failed: ${error.message}`);
      } else {
        errorDetails.push('DOM access validation failed');
      }
    }

    if (isReady) {
      const response: HealthCheckResponse = {
        action: 'HEALTH_CHECK_RESPONSE',
        status: 'ready',
        timestamp: Date.now(),
      };
      sendResponse(response);
    } else {
      const response: HealthCheckResponse = {
        action: 'HEALTH_CHECK_RESPONSE',
        status: 'error',
        timestamp: Date.now(),
        error: errorDetails.join('; '),
      };
      sendResponse(response);
    }
  } catch (error) {
    console.error('Error in health check:', error);
    const errorResponse: HealthCheckResponse = {
      action: 'HEALTH_CHECK_RESPONSE',
      status: 'error',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Health check failed',
    };
    sendResponse(errorResponse);
  }
}

// Log that content script is loaded and ready
console.log('闘魂AI変換 Content Script loaded - Ready to inject Toukon spirit!');
