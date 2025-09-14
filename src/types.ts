/**
 * 闘魂AI変換 Chrome Extension - Type Definitions
 * Shared TypeScript interfaces for message passing and extension functionality
 */

// Message types for communication between extension components
export interface ToukonMessage {
  action: 'INJECT_TOUKON';
  timestamp: number;
  tabId?: number; // Optional tab ID for targeted injection
}

export interface StatusMessage {
  action: 'STATUS_UPDATE';
  replacementCount: number;
  success: boolean;
  error?: string;
  timestamp?: number; // Optional timestamp for response tracking
}

// Additional message types for enhanced communication
export interface HealthCheckMessage {
  action: 'HEALTH_CHECK';
  timestamp: number;
}

export interface HealthCheckResponse {
  action: 'HEALTH_CHECK_RESPONSE';
  status: 'ready' | 'error';
  timestamp: number;
  error?: string;
}

// Union type for all possible messages
export type ExtensionMessage =
  | ToukonMessage
  | StatusMessage
  | HealthCheckMessage
  | HealthCheckResponse;

// Response type for message handlers
export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Tab information interface
export interface TabInfo {
  id: number;
  url?: string;
  title?: string;
}

// Extension configuration
export interface ExtensionConfig {
  readonly TARGET_TEXT: string;
  readonly REPLACEMENT_TEXT: string;
  readonly ANIMATION_DURATION: number;
}

// Content script interface
export interface ContentScript {
  findAndReplaceAI(): number;
  traverseTextNodes(element: Element): void;
  replaceTextInNode(node: Text): boolean;
}

// Background script interface
export interface BackgroundScript {
  handlePopupMessage(message: ToukonMessage): Promise<StatusMessage>;
  executeContentScript(tabId: number): Promise<StatusMessage>;
}

// Popup controller interface
export interface PopupController {
  injectToukon(): Promise<void>;
  updateStatus(message: string, type?: StatusType): void;
  initializeUI(): void;
}

// Status types for UI feedback
export type StatusType = 'success' | 'error' | 'processing';

// Message validation functions with enhanced type checking
export function isToukonMessage(message: any): message is ToukonMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.action === 'INJECT_TOUKON' &&
      typeof message.timestamp === 'number' &&
      (message.tabId === undefined || typeof message.tabId === 'number'),
  );
}

export function isStatusMessage(message: any): message is StatusMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.action === 'STATUS_UPDATE' &&
      typeof message.replacementCount === 'number' &&
      typeof message.success === 'boolean' &&
      (message.error === undefined || typeof message.error === 'string') &&
      (message.timestamp === undefined || typeof message.timestamp === 'number'),
  );
}

export function isHealthCheckMessage(message: any): message is HealthCheckMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.action === 'HEALTH_CHECK' &&
      typeof message.timestamp === 'number',
  );
}

export function isHealthCheckResponse(message: any): message is HealthCheckResponse {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.action === 'HEALTH_CHECK_RESPONSE' &&
      typeof message.timestamp === 'number' &&
      (message.status === 'ready' || message.status === 'error') &&
      (message.error === undefined || typeof message.error === 'string'),
  );
}

// Generic message validator
export function isValidExtensionMessage(message: any): message is ExtensionMessage {
  return (
    isToukonMessage(message) ||
    isStatusMessage(message) ||
    isHealthCheckMessage(message) ||
    isHealthCheckResponse(message)
  );
}

// Error types for better error handling
export class ToukonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any,
  ) {
    super(message);
    this.name = 'ToukonError';
  }
}

export class TabAccessError extends ToukonError {
  constructor(message: string, context?: any) {
    super(message, 'TAB_ACCESS_ERROR', context);
    this.name = 'TabAccessError';
  }
}

export class ContentScriptError extends ToukonError {
  constructor(message: string, context?: any) {
    super(message, 'CONTENT_SCRIPT_ERROR', context);
    this.name = 'ContentScriptError';
  }
}

export class MessagePassingError extends ToukonError {
  constructor(message: string, context?: any) {
    super(message, 'MESSAGE_PASSING_ERROR', context);
    this.name = 'MessagePassingError';
  }
}
