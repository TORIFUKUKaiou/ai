# 闘魂AI変換 Chrome Extension

A Chrome extension that transforms "AI" text to "AI（アントニオ猪木）" on web pages, embodying the philosophy of Toukon - the unwavering will to overcome oneself.

## Development Setup

### Prerequisites

- Node.js (v24 or higher)
- npm

### Installation

```bash
npm install
```

### TypeScript compiler and linting API

This project uses the [official TypeScript 6/7 side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0):

- `@typescript/native` aliases TypeScript 7 and provides `tsc` for builds and type checking.
- `typescript` aliases `@typescript/typescript6` and provides the TypeScript 6 API required by `typescript-eslint`, plus the `tsc6` executable.

Keep these aliases until the linting tools support the native compiler API. Replacing the `typescript` alias with TypeScript 7 breaks their peer dependency requirements. Installation uses the existing `.npmrc` settings, including `ignore-scripts=true` and `min-release-age=7`.

### Development Scripts

- `npm run build` - Build the extension for production
- `npm run build:prod` - Build with linting and type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode

### Building for Chrome

1. Run `npm run build:prod`
2. Load the `dist` folder as an unpacked extension in Chrome
3. The extension will be available in your browser

### Development Workflow

1. Make changes to source files
2. Run `npm run build:prod`
3. Click the reload button for the extension in `chrome://extensions`
4. Reload the target web page

### Project Structure

```
src/
├── background.ts    # Background script
├── content.ts       # Content script for text replacement
├── popup.ts         # Popup UI controller
├── types.ts         # TypeScript type definitions
└── test/           # Test files

public/
├── popup.html      # Popup HTML
└── popup.css       # Popup styles

dist/               # Built extension (generated)
```

### Code Quality

This project uses:

- **TypeScript** for type safety
- **ESLint** for code linting
- **Prettier** for code formatting
- **Vitest** for testing

All code is automatically formatted and linted before commits.
