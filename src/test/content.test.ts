/**
 * Unit tests for content script text replacement functionality
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContentScriptError, ToukonError, ExtensionConfig } from '../types.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

// @ts-expect-error - provide global stub for chrome in test env
global.chrome = mockChrome;

// Configuration constants for testing
const EXTENSION_CONFIG: ExtensionConfig = {
  TARGET_TEXT: 'AI',
  REPLACEMENT_TEXT: 'AI（アントニオ猪木）',
  ANIMATION_DURATION: 300,
} as const;

// Test implementation of content script functionality
class ToukonContentScript {
  private replacementCount: number = 0;
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private retryDelay: number = 100;

  findAndReplaceAI(): number {
    if (this.isProcessing) {
      throw new ContentScriptError('Text replacement already in progress', {
        operation: 'findAndReplaceAI',
        state: 'processing',
      });
    }

    this.isProcessing = true;
    this.replacementCount = 0;

    try {
      this.validateDocumentAccess();

      if (document.body) {
        this.traverseTextNodes(document.body);
      }

      return this.replacementCount;
    } catch (error) {
      if (error instanceof ContentScriptError) {
        throw error;
      } else {
        const wrappedError = new ContentScriptError(
          `Unexpected error during text replacement: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            operation: 'findAndReplaceAI',
            originalError: error,
          },
        );
        throw wrappedError;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  traverseTextNodes(element: Element): void {
    try {
      if (!element || !element.childNodes) {
        console.warn('Element is not accessible for traversal:', element);
        return;
      }

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
            const textNode = node as Text;
            this.replaceTextInNodeWithRetry(textNode);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elementNode = node as Element;

            const tagName = elementNode.tagName?.toLowerCase();
            if (tagName && !this.shouldSkipElement(tagName)) {
              this.traverseTextNodes(elementNode);
            }
          }
        } catch (error) {
          console.warn('Error processing individual node, continuing traversal:', {
            nodeType: node.nodeType,
            nodeName: node.nodeName,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          continue;
        }
      }
    } catch (error) {
      console.error('Error traversing text nodes, partial processing may have occurred:', {
        element: element.tagName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  replaceTextInNode(node: Text): boolean {
    try {
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        console.warn('Invalid text node provided for replacement');
        return false;
      }

      const originalText = node.textContent;
      if (!originalText) return false;

      if (originalText.includes(EXTENSION_CONFIG.TARGET_TEXT)) {
        const newText = originalText.replace(
          new RegExp(EXTENSION_CONFIG.TARGET_TEXT, 'g'),
          EXTENSION_CONFIG.REPLACEMENT_TEXT,
        );

        if (newText !== originalText) {
          try {
            node.textContent = newText;

            if (node.textContent !== newText) {
              throw new ContentScriptError('Text replacement was rejected by the page', {
                operation: 'replaceTextInNode',
                originalText: originalText.substring(0, 100),
                expectedText: newText.substring(0, 100),
                actualText: node.textContent?.substring(0, 100),
              });
            }

            const matches = originalText.match(new RegExp(EXTENSION_CONFIG.TARGET_TEXT, 'g'));
            this.replacementCount += matches ? matches.length : 0;

            return true;
          } catch (error) {
            if (error instanceof ContentScriptError) {
              throw error;
            }
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
        }
      }

      return false;
    } catch (error) {
      if (error instanceof ContentScriptError) {
        throw error;
      } else {
        const wrappedError = new ContentScriptError(
          `Unexpected error replacing text in node: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            operation: 'replaceTextInNode',
            originalError: error,
          },
        );
        throw wrappedError;
      }
    }
  }

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

          if (this.retryDelay > 0) {
            const start = Date.now();
            while (Date.now() - start < this.retryDelay) {
              // Busy wait for short delay
            }
          }
        }
      }
    }

    console.error(`Text replacement failed after ${this.maxRetries} attempts:`, {
      finalError: lastError?.message,
      nodeInfo: {
        parentElement: node.parentElement?.tagName,
        textLength: node.textContent?.length || 0,
      },
    });

    return false;
  }

  validateDocumentAccess(): void {
    if (typeof document === 'undefined') {
      throw new ContentScriptError('Document is not available in this context', {
        operation: 'validateDocumentAccess',
        context: 'document_undefined',
      });
    }

    if (document.readyState === 'loading') {
      throw new ContentScriptError(
        'Document is still loading, text replacement may be incomplete',
        {
          operation: 'validateDocumentAccess',
          documentState: document.readyState,
        },
      );
    }

    try {
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

  private shouldSkipElement(tagName: string): boolean {
    const skipTags = ['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'canvas', 'svg'];
    return skipTags.includes(tagName);
  }
}

describe('ToukonContentScript', () => {
  let contentScript: ToukonContentScript;

  beforeEach(() => {
    vi.clearAllMocks();
    contentScript = new ToukonContentScript();

    // Setup DOM environment safely
    if (!document.body) {
      const body = document.createElement('body');
      if (document.documentElement) {
        document.documentElement.appendChild(body);
      }
    }
    if (document.body) {
      document.body.innerHTML = '';
    }

    // Mock document.readyState as complete
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'complete',
    });

    // Mock window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'https://example.com' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('replaceTextInNode', () => {
    it('should replace single AI occurrence in text node', () => {
      const textNode = document.createTextNode('This is AI technology');
      const result = contentScript.replaceTextInNode(textNode);

      expect(result).toBe(true);
      expect(textNode.textContent).toBe('This is AI（アントニオ猪木） technology');
    });

    it('should replace multiple AI occurrences in text node', () => {
      const textNode = document.createTextNode('AI and AI are both AI');
      const result = contentScript.replaceTextInNode(textNode);

      expect(result).toBe(true);
      expect(textNode.textContent).toBe(
        'AI（アントニオ猪木） and AI（アントニオ猪木） are both AI（アントニオ猪木）',
      );
    });

    it('should return false when no AI text is found', () => {
      const textNode = document.createTextNode('This has no target text');
      const result = contentScript.replaceTextInNode(textNode);

      expect(result).toBe(false);
      expect(textNode.textContent).toBe('This has no target text');
    });

    it('should handle empty text nodes', () => {
      const textNode = document.createTextNode('');
      const result = contentScript.replaceTextInNode(textNode);

      expect(result).toBe(false);
      expect(textNode.textContent).toBe('');
    });

    it('should handle null text content', () => {
      const textNode = document.createTextNode('test');
      // Simulate null textContent
      Object.defineProperty(textNode, 'textContent', {
        get: () => null,
        set: vi.fn(),
      });

      const result = contentScript.replaceTextInNode(textNode);
      expect(result).toBe(false);
    });

    it('should preserve case sensitivity', () => {
      const textNode = document.createTextNode('ai and AI and Ai');
      const result = contentScript.replaceTextInNode(textNode);

      expect(result).toBe(true);
      expect(textNode.textContent).toBe('ai and AI（アントニオ猪木） and Ai');
    });
  });

  describe('traverseTextNodes', () => {
    it('should traverse and replace text in simple HTML structure', () => {
      document.body.innerHTML = '<div>This is AI</div>';
      const div = document.body.querySelector('div')!;

      contentScript.traverseTextNodes(div);

      expect(div.textContent).toBe('This is AI（アントニオ猪木）');
    });

    it('should traverse nested HTML structures', () => {
      document.body.innerHTML = `
        <div>
          <p>AI is here</p>
          <span>More AI content</span>
        </div>
      `;

      contentScript.traverseTextNodes(document.body);

      expect(document.body.textContent).toContain('AI（アントニオ猪木） is here');
      expect(document.body.textContent).toContain('More AI（アントニオ猪木） content');
    });

    it('should skip script tags', () => {
      document.body.innerHTML = `
        <div>AI content</div>
        <script>var ai = "AI";</script>
      `;

      contentScript.traverseTextNodes(document.body);

      const div = document.body.querySelector('div')!;
      const script = document.body.querySelector('script')!;

      expect(div.textContent).toBe('AI（アントニオ猪木） content');
      expect(script.textContent).toBe('var ai = "AI";'); // Should remain unchanged
    });

    it('should skip style tags', () => {
      document.body.innerHTML = `
        <div>AI content</div>
        <style>.ai { color: red; }</style>
      `;

      contentScript.traverseTextNodes(document.body);

      const div = document.body.querySelector('div')!;
      const style = document.body.querySelector('style')!;

      expect(div.textContent).toBe('AI（アントニオ猪木） content');
      expect(style.textContent).toBe('.ai { color: red; }'); // Should remain unchanged
    });

    it('should handle mixed content types', () => {
      document.body.innerHTML = `
        <div>
          Text with AI
          <span>Nested AI</span>
          <!-- Comment with AI -->
          More AI text
        </div>
      `;

      contentScript.traverseTextNodes(document.body);

      expect(document.body.textContent).toContain('Text with AI（アントニオ猪木）');
      expect(document.body.textContent).toContain('Nested AI（アントニオ猪木）');
      expect(document.body.textContent).toContain('More AI（アントニオ猪木） text');
    });
  });

  describe('findAndReplaceAI', () => {
    it('should return correct replacement count for single replacement', () => {
      document.body.innerHTML = '<div>This is AI</div>';

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(1);
      expect(document.body.textContent).toContain('AI（アントニオ猪木）');
    });

    it('should return correct replacement count for multiple replacements', () => {
      document.body.innerHTML = `
        <div>AI is here</div>
        <p>More AI content with AI</p>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(3);
    });

    it('should return 0 when no replacements are made', () => {
      document.body.innerHTML = '<div>No target text here</div>';

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(0);
    });

    it('should handle empty document body', () => {
      document.body.innerHTML = '';

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(0);
    });

    it('should preserve HTML structure while replacing text', () => {
      document.body.innerHTML = `
        <div class="container">
          <h1>AI Title</h1>
          <p>Paragraph with <strong>AI</strong> emphasis</p>
        </div>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(2);
      expect(document.body.querySelector('h1')?.textContent).toBe('AI（アントニオ猪木） Title');
      expect(document.body.querySelector('strong')?.textContent).toBe('AI（アントニオ猪木）');
      expect(document.body.querySelector('.container')).toBeTruthy(); // Structure preserved
    });
  });

  describe('shouldSkipElement', () => {
    it('should identify elements to skip', () => {
      const skipElements = [
        'script',
        'style',
        'noscript',
        'iframe',
        'object',
        'embed',
        'canvas',
        'svg',
      ];

      skipElements.forEach((tagName) => {
        // Access private method through type assertion
        const shouldSkip = (contentScript as any).shouldSkipElement(tagName);
        expect(shouldSkip).toBe(true);
      });
    });

    it('should not skip regular elements', () => {
      const regularElements = ['div', 'p', 'span', 'h1', 'a', 'button'];

      regularElements.forEach((tagName) => {
        const shouldSkip = (contentScript as any).shouldSkipElement(tagName);
        expect(shouldSkip).toBe(false);
      });
    });
  });

  describe('document access validation', () => {
    it('should validate document access successfully', () => {
      expect(() => {
        (contentScript as any).validateDocumentAccess();
      }).not.toThrow();
    });

    it('should throw error for loading document state', () => {
      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'loading',
      });

      expect(() => {
        (contentScript as any).validateDocumentAccess();
      }).toThrow(ContentScriptError);
    });

    it('should throw error for restricted URLs', () => {
      const restrictedUrls = [
        'chrome://settings',
        'chrome-extension://abc123',
        'moz-extension://def456',
        'edge://settings',
        'about:blank',
        'file:///local/file.html',
      ];

      restrictedUrls.forEach((url) => {
        Object.defineProperty(window, 'location', {
          writable: true,
          value: { href: url },
        });

        expect(() => {
          (contentScript as any).validateDocumentAccess();
        }).toThrow(ContentScriptError);
      });
    });

    it('should throw error when document is undefined', () => {
      const originalDocument = global.document;
      delete global.document;

      expect(() => {
        (contentScript as any).validateDocumentAccess();
      }).toThrow(ContentScriptError);

      // Restore document
      global.document = originalDocument;
    });

    it('should throw error when documentElement is not accessible', () => {
      const originalDocument = global.document;
      // Provide a minimal mock document with missing documentElement
      global.document = {
        readyState: 'complete',
        documentElement: null,
      } as any;

      expect(() => {
        (contentScript as any).validateDocumentAccess();
      }).toThrow(ContentScriptError);

      // Restore original document to avoid side effects
      global.document = originalDocument;
    });
  });

  describe('concurrent processing protection', () => {
    it('should prevent concurrent processing', () => {
      // Set processing state manually
      (contentScript as any).isProcessing = true;

      expect(() => {
        contentScript.findAndReplaceAI();
      }).toThrow(ContentScriptError);
    });

    it('should reset processing state after completion', () => {
      document.body.innerHTML = '<div>Test AI content</div>';

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(1);
      expect((contentScript as any).isProcessing).toBe(false);
    });

    it('should reset processing state after error', () => {
      // Mock validateDocumentAccess to throw
      vi.spyOn(contentScript as any, 'validateDocumentAccess').mockImplementation(() => {
        throw new ContentScriptError('Test error');
      });

      expect(() => {
        contentScript.findAndReplaceAI();
      }).toThrow(ContentScriptError);

      expect((contentScript as any).isProcessing).toBe(false);
    });
  });

  describe('retry logic', () => {
    it('should retry text replacement on transient failures', () => {
      const textNode = document.createTextNode('Test AI content');
      let attemptCount = 0;

      // Mock replaceTextInNode to fail first two attempts
      const originalMethod = (contentScript as any).replaceTextInNode;
      vi.spyOn(contentScript as any, 'replaceTextInNode').mockImplementation((node: any) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return originalMethod.call(contentScript, node);
      });

      const result = (contentScript as any).replaceTextInNodeWithRetry(textNode);

      expect(result).toBe(true);
      expect(attemptCount).toBe(3);
      expect(textNode.textContent).toBe('Test AI（アントニオ猪木） content');
    });

    it('should give up after max retries', () => {
      const textNode = document.createTextNode('Test AI content');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock replaceTextInNode to always fail
      vi.spyOn(contentScript as any, 'replaceTextInNode').mockImplementation(() => {
        throw new Error('Persistent error');
      });

      const result = (contentScript as any).replaceTextInNodeWithRetry(textNode);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Text replacement failed after 3 attempts'),
        expect.any(Object),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null/undefined elements gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        contentScript.traverseTextNodes(null as any);
      }).not.toThrow();

      expect(() => {
        contentScript.traverseTextNodes(undefined as any);
      }).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle elements without childNodes', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockElement = {
        tagName: 'DIV',
        childNodes: null,
      } as any;

      expect(() => {
        contentScript.traverseTextNodes(mockElement);
      }).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle childNodes access errors', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockElement = {
        tagName: 'DIV',
        get childNodes() {
          throw new Error('Access denied');
        },
      } as any;

      expect(() => {
        contentScript.traverseTextNodes(mockElement);
      }).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle individual node processing errors', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      document.body.innerHTML = '<div>AI content</div><span>More AI</span>';

      // Mock replaceTextInNodeWithRetry to throw for first node only
      let callCount = 0;
      const originalMethod = (contentScript as any).replaceTextInNodeWithRetry;
      vi.spyOn(contentScript as any, 'replaceTextInNodeWithRetry').mockImplementation(
        (node: any) => {
          callCount++;
          if (callCount === 1) {
            throw new Error('First node error');
          }
          return originalMethod.call(contentScript, node);
        },
      );

      const count = contentScript.findAndReplaceAI();

      // Should still process the second node
      expect(count).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing individual node'),
        expect.any(Object),
      );

      consoleSpy.mockRestore();
    });

    it('should handle text replacement rejection', () => {
      const textNode = document.createTextNode('Test AI content');

      // Mock textContent setter to simulate rejection
      let setterCallCount = 0;
      Object.defineProperty(textNode, 'textContent', {
        get: () => (setterCallCount === 0 ? 'Test AI content' : 'Test AI content'), // Simulate rejection
        set: (value: string) => {
          setterCallCount++;
          // Don't actually set the value to simulate rejection
        },
        configurable: true,
      });

      expect(() => {
        contentScript.replaceTextInNode(textNode);
      }).toThrow(ContentScriptError);
    });

    it('should handle permission errors during text replacement', () => {
      const textNode = document.createTextNode('Test AI content');

      // Mock textContent setter to throw permission error
      Object.defineProperty(textNode, 'textContent', {
        get: () => 'Test AI content',
        set: () => {
          throw new Error('Permission denied');
        },
        configurable: true,
      });

      expect(() => {
        contentScript.replaceTextInNode(textNode);
      }).toThrow(ContentScriptError);
    });

    it('should handle invalid text nodes', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const invalidNodes = [
        null,
        undefined,
        { nodeType: Node.ELEMENT_NODE }, // Not a text node
        { nodeType: Node.TEXT_NODE, textContent: null },
      ];

      invalidNodes.forEach((node) => {
        const result = contentScript.replaceTextInNode(node as any);
        expect(result).toBe(false);
      });

      consoleSpy.mockRestore();
    });
  });

  describe('complex DOM structures', () => {
    it('should handle deeply nested structures', () => {
      document.body.innerHTML = `
        <div>
          <section>
            <article>
              <header>
                <h1>AI Title</h1>
              </header>
              <main>
                <p>Paragraph with <strong>AI</strong> and <em>more AI</em></p>
                <ul>
                  <li>List item with AI</li>
                  <li>Another AI item</li>
                </ul>
              </main>
            </article>
          </section>
        </div>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(5);
      expect(document.body.textContent).toContain('AI（アントニオ猪木） Title');
      expect(document.body.textContent).toContain('more AI（アントニオ猪木）');
    });

    it('should handle mixed content with comments and CDATA', () => {
      document.body.innerHTML = `
        <div>
          AI content
          <!-- Comment with AI -->
          <span>More AI</span>
        </div>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(2); // Should not process comments
      expect(document.body.textContent).toContain('AI（アントニオ猪木） content');
      expect(document.body.textContent).toContain('More AI（アントニオ猪木）');
    });

    it('should handle elements with special attributes', () => {
      document.body.innerHTML = `
        <div data-ai="test" class="ai-container">
          <span title="AI tooltip">AI content</span>
        </div>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(1); // Should only replace text content, not attributes
      expect(document.body.textContent).toContain('AI（アントニオ猪木） content');

      // Attributes should remain unchanged
      const span = document.body.querySelector('span');
      expect(span?.getAttribute('title')).toBe('AI tooltip');
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large amounts of text efficiently', () => {
      const largeText = 'AI '.repeat(1000) + 'content';
      document.body.innerHTML = `<div>${largeText}</div>`;

      const startTime = Date.now();
      const count = contentScript.findAndReplaceAI();
      const endTime = Date.now();

      expect(count).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle empty document body', () => {
      // Remove body entirely and restore after test
      Object.defineProperty(document, 'body', {
        get: () => null,
        configurable: true,
      });
      try {
        const count = contentScript.findAndReplaceAI();
        expect(count).toBe(0);
      } finally {
        // Remove the own getter so prototype accessor is restored
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (document as any).body;
      }
    });

    it('should handle text nodes with only whitespace', () => {
      document.body.innerHTML = `
        <div>   
          
          <span>AI content</span>
          
        </div>
      `;

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(1);
      expect(document.body.textContent).toContain('AI（アントニオ猪木） content');
    });

    it('should preserve exact spacing and formatting', () => {
      document.body.innerHTML = '<div>  AI  content  with  AI  </div>';

      const count = contentScript.findAndReplaceAI();

      expect(count).toBe(2);
      expect(document.body.textContent).toBe(
        '  AI（アントニオ猪木）  content  with  AI（アントニオ猪木）  ',
      );
    });
  });
});
