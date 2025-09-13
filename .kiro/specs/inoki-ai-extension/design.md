# Design Document

## Overview

The 闘魂AI変換 Chrome Extension is a Manifest V3 extension built with TypeScript that transforms "AI" text to "AI（アントニオ猪木）" on web pages. The extension embodies the philosophy of Toukon - the unwavering will to overcome oneself - through its design and functionality.

## Architecture

### Extension Structure
- **Manifest V3**: Modern Chrome extension architecture
- **TypeScript**: Type-safe development with compilation to JavaScript
- **Content Script**: Handles DOM manipulation and text replacement
- **Popup**: User interface for triggering the transformation
- **Background Script**: Manages extension lifecycle and communication

### Component Communication Flow
```
Popup UI → Background Script → Content Script → DOM Manipulation
```

## Components and Interfaces

### 1. Manifest Configuration (`manifest.json`)
```json
{
  "manifest_version": 3,
  "name": "闘魂AI変換",
  "version": "1.0.0",
  "description": "Inject Toukon spirit by transforming AI to AI（アントニオ猪木）",
  "permissions": ["activeTab"],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

### 2. Popup Interface (`popup.html` + `popup.ts`)
**Design Philosophy**: 
- Black background representing the depth of self-reflection
- Red accents symbolizing burning determination to overcome inner weakness
- Minimalist design focusing on the core action

**Components**:
- Header with extension title
- Main "闘魂注入" button with hover effects
- Status indicator for feedback
- Subtle visual elements evoking strength and determination

**TypeScript Interface**:
```typescript
interface PopupController {
  injectToukon(): Promise<void>;
  updateStatus(message: string): void;
  initializeUI(): void;
}
```

### 3. Content Script (`content.ts`)
**Responsibilities**:
- Text node traversal and replacement
- Preserving original page layout and styling
- Handling dynamic content updates

**TypeScript Interface**:
```typescript
interface ContentScript {
  findAndReplaceAI(): number;
  traverseTextNodes(element: Element): void;
  replaceTextInNode(node: Text): boolean;
}
```

### 4. Background Script (`background.ts`)
**Responsibilities**:
- Message passing between popup and content script
- Extension lifecycle management

**TypeScript Interface**:
```typescript
interface BackgroundScript {
  handlePopupMessage(message: Message): Promise<void>;
  executeContentScript(tabId: number): Promise<void>;
}
```

## Data Models

### Message Types
```typescript
interface ToukonMessage {
  action: 'INJECT_TOUKON';
  timestamp: number;
}

interface StatusMessage {
  action: 'STATUS_UPDATE';
  replacementCount: number;
  success: boolean;
}
```

### Configuration
```typescript
interface ExtensionConfig {
  readonly TARGET_TEXT: 'AI';
  readonly REPLACEMENT_TEXT: 'AI（アントニオ猪木）';
  readonly ANIMATION_DURATION: 300;
}
```

## Error Handling

### Content Script Error Handling
- **DOM Access Errors**: Graceful handling when DOM is not accessible
- **Text Replacement Errors**: Skip problematic nodes and continue processing
- **Permission Errors**: Inform user if page cannot be modified

### Popup Error Handling
- **Tab Access Errors**: Display appropriate message if current tab cannot be accessed
- **Communication Errors**: Handle failed message passing with retry logic
- **UI State Errors**: Maintain consistent button states and feedback

### Background Script Error Handling
- **Script Injection Errors**: Handle cases where content script cannot be injected
- **Message Routing Errors**: Ensure reliable communication between components

## Testing Strategy

### Unit Testing
- **Text Replacement Logic**: Test various text patterns and edge cases
- **DOM Traversal**: Test with different HTML structures
- **Message Passing**: Mock Chrome APIs for testing communication

### Integration Testing
- **End-to-End Flow**: Test complete user journey from button click to text replacement
- **Cross-Browser Compatibility**: Ensure consistent behavior across Chrome versions
- **Performance Testing**: Verify efficient handling of large pages

### Manual Testing Scenarios
- Test on various websites (news sites, social media, documentation)
- Test with different text encodings and languages
- Test with dynamically loaded content
- Test popup UI responsiveness and visual design

## Build and Development Setup

### TypeScript Configuration
- Strict type checking enabled
- Target ES2020 for modern browser support
- Source maps for debugging
- Separate compilation for each component

### Build Process
1. TypeScript compilation (`tsc`)
2. Asset copying (HTML, CSS, images)
3. Manifest validation
4. Extension packaging for distribution

### Development Tools
- Hot reload for development
- Chrome DevTools integration
- TypeScript language server support
- Linting with ESLint and Prettier

## Visual Design Specifications

### Color Palette
- **Primary Black**: `#000000` (depth of self-reflection)
- **Accent Red**: `#DC143C` (burning determination)
- **Text White**: `#FFFFFF` (clarity of purpose)
- **Subtle Gray**: `#333333` (inner strength)

### Typography
- **Primary Font**: System font stack for reliability
- **Button Text**: Bold weight to convey strength
- **Status Text**: Regular weight for readability

### Layout Principles
- Centered alignment for focus
- Generous padding for breathing room
- Subtle shadows for depth
- Smooth transitions for polish