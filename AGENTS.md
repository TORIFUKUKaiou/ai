# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Chrome extension (Manifest V3) called "闘魂AI変換" that replaces occurrences of "AI" with "AI（アントニオ猪木）" on web pages. The extension consists of a popup UI, a background service worker, and a content script.

## Build Commands

- `npm run build:prod` — Full production build (lint, type-check, type-check:test, build). This is the command to run before loading the extension in Chrome.
- `npm run build` — TypeScript compilation + asset copy + manifest transform + build verification. Outputs to `dist/`.
- `npm run test` — Run all tests with Vitest (jsdom environment).
- `npm run test:watch` — Run tests in watch mode.
- `npm run lint` — Run ESLint on `src/**/*.{ts,js}`.
- `npm run lint:fix` — Fix ESLint issues automatically.
- `npm run type-check` — Run TypeScript type checking for source files (`tsc --noEmit`).
- `npm run type-check:test` — Run TypeScript type checking including tests (`tsc -p tsconfig.test.json --noEmit`).
- `npm run format` — Format with Prettier.
- `npm run format:check` — Check formatting without writing.

## Running a Single Test

Use Vitest's file filter: `npx vitest run src/test/content.test.ts`

## High-Level Architecture

### Chrome Extension Components

- **`src/background.ts`** — Background service worker. Handles messages from the popup, resolves the active tab, validates tab access (blocks `chrome://`, `edge://`, `about:`, etc.), and forwards injection requests to the content script via `chrome.tabs.sendMessage`.
- **`src/content.ts`** — Content script injected into pages. Traverses the DOM, finds text nodes matching "AI" or "ＡＩ", and replaces them with styled `<span class="toukon-ai">` elements. Also installs CSS animations and starts a `MutationObserver` to handle dynamically inserted content.
- **`src/popup.ts`** — Popup UI controller. Binds to popup.html elements, triggers injection via `chrome.runtime.sendMessage`, and displays success/error status.
- **`src/types.ts`** — Shared types, custom error hierarchy (`ToukonError`, `TabAccessError`, `ContentScriptError`, `MessagePassingError`), and runtime type guards (`isToukonMessage`, `isStatusMessage`, etc.).

### Critical Build Constraint: Content Script Must Be a Classic Script

Manifest V3 content scripts declared in `manifest.json` are loaded as **classic scripts**, not ES modules. Because `package.json` sets `"type": "module"`, the build pipeline has a safeward:

- **`src/content.ts` does not use ES module imports or exports.** It defines its own inline types and classes locally. Do not add `import`/`export` to this file.
- **`scripts/verify-build.cjs`** runs after every build and throws if `dist/content.js` contains `import` or `export` syntax.
- Background (`background.ts`) and popup (`popup.ts`) use normal ES module imports because their `manifest.json` entries support modules (`background.type: "module"` and popup is loaded as a script from HTML).

### Error Handling Pattern

All components use the custom error hierarchy from `types.ts`:
- `TabAccessError` — restricted pages or missing tabs.
- `ContentScriptError` — DOM not ready, permission issues, injection failures.
- `MessagePassingError` — timeouts, invalid responses, Chrome runtime errors.

Background and popup map these to user-facing Japanese messages (e.g., "このページでは使用できません").

### Testing

- Framework: **Vitest** with **jsdom** environment.
- Global mocks for Chrome APIs are set up in `src/test/setup.ts` (attaches `mockChrome` to `globalThis`).
- TypeScript test config (`tsconfig.test.json`) disables `noUnusedLocals` and `noUnusedParameters` to avoid strictness issues in test files.
- ESLint rules for `src/test/**/*.ts` disable `@typescript-eslint/no-explicit-any` and `@typescript-eslint/explicit-function-return-type`.

### Build Pipeline Steps

1. `tsc` compiles `src/*.ts` → `dist/*.js` (with source maps).
2. `npm run copy-assets` copies `public/*` and `manifest.json` into `dist/`.
3. `scripts/build-manifest.cjs` transforms `manifest.json` so script references use `.js` instead of `.ts`.
4. `scripts/verify-build.cjs` ensures `dist/content.js` has no ES module syntax.

### File References in manifest.json

The manifest points to `.ts` files which get rewritten to `.js` during the build. Do not change manifest references to `.js` directly.
