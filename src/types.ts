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
  ToukonMessage | StatusMessage | HealthCheckMessage | HealthCheckResponse;

// Response type for message handlers
export interface MessageResponse<T = unknown> {
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

export type ErrorContext = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Message validation functions with enhanced type checking
export function isToukonMessage(message: unknown): message is ToukonMessage {
  return (
    isRecord(message) &&
    message['action'] === 'INJECT_TOUKON' &&
    typeof message['timestamp'] === 'number' &&
    (message['tabId'] === undefined || typeof message['tabId'] === 'number')
  );
}

export function isStatusMessage(message: unknown): message is StatusMessage {
  return (
    isRecord(message) &&
    message['action'] === 'STATUS_UPDATE' &&
    typeof message['replacementCount'] === 'number' &&
    typeof message['success'] === 'boolean' &&
    (message['error'] === undefined || typeof message['error'] === 'string') &&
    (message['timestamp'] === undefined || typeof message['timestamp'] === 'number')
  );
}

export function isHealthCheckMessage(message: unknown): message is HealthCheckMessage {
  return (
    isRecord(message) &&
    message['action'] === 'HEALTH_CHECK' &&
    typeof message['timestamp'] === 'number'
  );
}

export function isHealthCheckResponse(message: unknown): message is HealthCheckResponse {
  return (
    isRecord(message) &&
    message['action'] === 'HEALTH_CHECK_RESPONSE' &&
    typeof message['timestamp'] === 'number' &&
    (message['status'] === 'ready' || message['status'] === 'error') &&
    (message['error'] === undefined || typeof message['error'] === 'string')
  );
}

// Generic message validator
export function isValidExtensionMessage(message: unknown): message is ExtensionMessage {
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
    public readonly context?: ErrorContext,
  ) {
    super(message);
    this.name = 'ToukonError';
  }
}

export class TabAccessError extends ToukonError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TAB_ACCESS_ERROR', context);
    this.name = 'TabAccessError';
  }
}

export class ContentScriptError extends ToukonError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONTENT_SCRIPT_ERROR', context);
    this.name = 'ContentScriptError';
  }
}

export class MessagePassingError extends ToukonError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'MESSAGE_PASSING_ERROR', context);
    this.name = 'MessagePassingError';
  }
}
