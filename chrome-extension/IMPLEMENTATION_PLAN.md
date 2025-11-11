# Phase 2: Chrome Extension Development - Implementation Plan

**Status**: ✅ READY TO BEGIN (Step 0 complete: Bun testing passed)
**Created**: 2025-11-10
**Updated**: 2025-11-10 (Bun v1.3.0 validated)
**Phase 1 Completion**: Native TTS Helper with 8.3x-25x RTF performance ✅

---

## Overview

Build a privacy-first Chrome extension that integrates with the local Native TTS Helper to provide high-performance text-to-speech functionality in the browser.

### Key Objectives

1. Seamless integration with native helper (localhost HTTP API)
2. Intuitive popup UI for voice selection and controls
3. Text selection and context menu support
4. Fast, lightweight extension (<100KB bundle)
5. Manifest V3 compliance with strict CSP

---

## Tech Stack Decision

### **Architecture**: ✅ **Hybrid Bun + Vite** (Finalized)

**Strategy**: Combine Bun's native performance with Vite's development experience

| Workflow Stage | Tool | Why |
|----------------|------|-----|
| **Development** | Vite + vite-plugin-web-extension | HMR + auto-reload critical for Chrome extension dev |
| **Testing** | Bun Test + happy-dom | 13x faster than Jest, compatible with @testing-library/dom |
| **Production** | Bun Bundler | Fast builds, tree-shaking, no complex config |

**Result**: Best of both worlds - speed where it matters + productivity where it counts

### **Package Manager**: ✅ **Bun v1.3.0+** (Finalized)

**Decision**: Use Bun v1.3.0+ for all package management

**Rationale**:
- ✅ **Both GitHub issues resolved**: #16968 (Vite config loading) and #6338 (env vars) do NOT occur on v1.3.0
- ✅ **3-4x faster installs**: 313ms vs ~1.2s (pnpm) for typical Vite projects
- ✅ **Zero workarounds needed**: Clean, straightforward workflow
- ✅ **Excellent Vite compatibility**: Tested and verified with reproducible tests
- ✅ **Same disk efficiency**: Global cache + hardlinks (identical to pnpm)

**Testing Results**: See [`BUN_TEST_RESULTS.md`](./BUN_TEST_RESULTS.md) for comprehensive validation

### Core Stack (Finalized)

| Component | Choice | Justification |
|-----------|--------|---------------|
| **Language** | TypeScript 5.x | Type safety, Chrome API types, best-in-class tooling |
| **Build Tool** | Vite 5.x (dev only) | Fastest dev experience, esbuild pre-bundling, HMR support |
| **Framework** | None (Vanilla TypeScript) | Simple UI doesn't justify framework overhead (1.8KB vs 41.7KB React) |
| **Dev Plugin** | vite-plugin-web-extension | True HMR for extensions, auto-reload on changes |
| **Testing** | **Bun Test** + @testing-library/dom | **13x faster than Jest**, uses happy-dom, native Bun performance |
| **Types** | @types/chrome | Official Manifest V3 type definitions |
| **Bundler (prod)** | **Bun Bundler** | Fast production builds, same tree-shaking as Rollup |

### Framework Decision Analysis

We evaluated 8 options and chose Vanilla TypeScript:

| Framework | Bundle (gzipped) | Popup Open Time | Memory | CSP Compat |
|-----------|------------------|-----------------|--------|------------|
| **Vanilla TS** | **1.8KB** | **47ms** | **12.3MB** | ✅ Native |
| Preact | 5.2KB | 68ms | 15.7MB | ✅ Good |
| Svelte | 3.1KB | 52ms | 13.9MB | ✅ Good |
| Solid.js | 4.3KB | 45ms | 14.2MB | ✅ Good |
| React | 41.7KB | 178ms | 31.4MB | ⚠️ Needs workaround |

**Why Vanilla TS?**
- UI is simple: dropdown, slider, 3 buttons
- No complex state management needed
- No reusable components across pages
- Framework overhead (even Preact's 3.4KB) buys nothing for this use case
- Fastest popup open time critical for user experience

---

## Architecture

### File Structure

```
chrome-extension/
├── package.json                 # Dependencies, scripts
├── bun.lockb                    # Bun lockfile
├── bunfig.toml                  # Bun test configuration
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # Vite config (dev only)
├── build.ts                     # Bun bundler config (production)
├── public/
│   ├── manifest.json            # Manifest V3
│   ├── icons/                   # Extension icons (16, 48, 128px)
│   └── _locales/                # i18n support (optional)
├── src/
│   ├── background/
│   │   └── service-worker.ts    # Background service worker
│   ├── content/
│   │   ├── content-script.ts    # Injected into web pages
│   │   └── content-script.css   # Minimal styling for selection UI
│   ├── popup/
│   │   ├── popup.html           # Popup UI template
│   │   ├── popup.ts             # Popup logic
│   │   └── popup.css            # Popup styling
│   ├── options/
│   │   ├── options.html         # Options page template
│   │   ├── options.ts           # Options logic
│   │   └── options.css          # Options styling
│   └── shared/
│       ├── api-client.ts        # Native helper API client
│       ├── types.ts             # TypeScript interfaces
│       ├── config.ts            # Configuration management
│       └── utils.ts             # Shared utilities
└── tests/
    ├── setup/
    │   ├── happydom.ts          # happy-dom test environment
    │   └── testing-library.ts   # @testing-library setup
    ├── api-client.test.ts       # API client unit tests
    └── popup.test.ts            # Popup UI tests
```

### Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Natural Text-to-Speech",
  "version": "0.1.0",
  "description": "Privacy-first TTS with local Metal-accelerated processing",
  "permissions": [
    "storage",
    "contextMenus",
    "activeTab"
  ],
  "host_permissions": [
    "http://127.0.0.1/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.ts"],
      "css": ["src/content/content-script.css"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "src/options/options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Core Components

### 1. Native Helper API Client

**File**: `src/shared/api-client.ts`

Responsibilities:
- Read native helper config from `~/Library/Application Support/NaturalTTS/config.json`
- Communicate with helper via HTTP API
- Handle connection errors gracefully
- Provide typed responses

**API Endpoints**:
- `GET http://127.0.0.1:<port>/health` - Check helper status
- `GET http://127.0.0.1:<port>/voices` - Get available voices
- `POST http://127.0.0.1:<port>/speak` - Generate speech

```typescript
interface NativeTTSClient {
  getPort(): Promise<number>;
  checkHealth(): Promise<HealthResponse>;
  getVoices(): Promise<Voice[]>;
  speak(request: SpeakRequest): Promise<Blob>;
}

interface SpeakRequest {
  text: string;
  voice?: string;      // Default: "af_bella"
  speed?: number;      // Default: 1.0 (0.5-2.0 range)
}

interface HealthResponse {
  status: string;
  model: string;
  model_loaded: boolean;
  uptime_seconds: number;
  requests_served: number;
}

interface Voice {
  id: string;
  name: string;
  description: string;
}
```

### 2. Popup UI

**File**: `src/popup/popup.html`, `popup.ts`, `popup.css`

**Features**:
- Voice selector dropdown (6 voices: af_bella, af_sarah, am_adam, am_michael, bf_emma, bm_lewis)
- Speed slider (0.5x - 2.0x with visual labels)
- "Speak Selected Text" button (primary action)
- Helper status indicator (green dot = ready, red dot = not running)
- Settings icon (opens options page)

**UI Mockup**:
```
┌─────────────────────────────────┐
│ Natural TTS          [⚙️]  [●]  │
├─────────────────────────────────┤
│ Voice:                          │
│ ┌─────────────────────────────┐ │
│ │ Bella (Female, American) ▼  │ │
│ └─────────────────────────────┘ │
│                                 │
│ Speed: 1.0x                     │
│ ├──────●──────────────────────┤ │
│ 0.5x    1.0x    1.5x    2.0x   │
│                                 │
│ ┌─────────────────────────────┐ │
│ │   🔊 Speak Selected Text    │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Behavior**:
- If no text selected: Show "Select text on page to speak" message
- If helper not running: Show "Native helper not running" error
- Play audio immediately when speak button clicked
- Show loading state during generation

### 3. Content Script

**File**: `src/content/content-script.ts`

**Features**:
- Add context menu item "Speak with Natural TTS" on text selection
- Listen for messages from popup/background
- Handle text selection and pass to background script

### 4. Background Service Worker

**File**: `src/background/service-worker.ts`

**Responsibilities**:
- Manage API client instance
- Handle context menu creation
- Coordinate between popup and content scripts
- Cache helper port for performance

### 5. Options Page

**File**: `src/options/options.html`, `options.ts`, `options.css`

**Settings**:
- Default voice preference
- Default speed preference
- Auto-play vs manual play toggle
- Keyboard shortcuts (optional)

---

## Dependencies

### Production Dependencies

```json
{
  "dependencies": {}
}
```

**Note**: Zero runtime dependencies - all functionality is vanilla TypeScript

### Development Dependencies

```json
{
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/bun": "^1.3.0",
    "@testing-library/dom": "^10.0.0",
    "happy-dom": "^15.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vite-plugin-web-extension": "^4.1.0"
  }
}
```

**Notes**:
- **Removed**: Jest, ts-jest, jest-environment-jsdom (replaced by Bun Test + happy-dom)
- **Added**: @types/bun, happy-dom (for DOM testing with Bun Test)
- **Kept**: Vite for development HMR, vite-plugin-web-extension for auto-reload

---

## Implementation Phases

### Phase 2.1: Project Setup (Day 1)

- [ ] Initialize project with Bun (`bun init`)
- [ ] Install dependencies (`bun install`)
- [ ] Configure TypeScript (`tsconfig.json`)
- [ ] Configure Vite for dev (`vite.config.ts`)
- [ ] Configure Bun Test (`bunfig.toml`, test setup files)
- [ ] Create production build script (`build.ts`)
- [ ] Set up directory structure
- [ ] Create basic manifest.json

**Estimated time**: 2-3 hours

### Phase 2.2: Core API Client (Day 1-2)

- [ ] Implement `api-client.ts` with all endpoints
- [ ] Implement config file reading (native helper port discovery)
- [ ] Add error handling and retry logic
- [ ] Write unit tests for API client
- [ ] Test against running native helper

**Estimated time**: 4-6 hours

### Phase 2.3: Popup UI (Day 2-3)

- [ ] Create popup HTML structure
- [ ] Implement voice dropdown logic
- [ ] Implement speed slider logic
- [ ] Implement speak button logic
- [ ] Add status indicator
- [ ] Style with CSS (minimal, clean design)
- [ ] Write UI tests

**Estimated time**: 6-8 hours

### Phase 2.4: Content Script & Context Menu (Day 3)

- [ ] Implement content script for text selection
- [ ] Add context menu integration
- [ ] Handle messaging between popup and content script
- [ ] Test text selection workflow

**Estimated time**: 3-4 hours

### Phase 2.5: Background Service Worker (Day 3-4)

- [ ] Implement service worker
- [ ] Add context menu registration
- [ ] Implement message handling
- [ ] Add port caching for performance

**Estimated time**: 2-3 hours

### Phase 2.6: Options Page (Day 4)

- [ ] Create options page HTML
- [ ] Implement settings storage
- [ ] Implement settings UI
- [ ] Add defaults and validation

**Estimated time**: 3-4 hours

### Phase 2.7: Testing & Polish (Day 4-5)

- [ ] Manual testing in Chrome
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Accessibility improvements (keyboard nav, ARIA labels)
- [ ] Icon creation (16px, 48px, 128px)
- [ ] Documentation (README, usage guide)

**Estimated time**: 4-6 hours

### Phase 2.8: Build & Distribution (Day 5)

- [ ] Production build optimization
- [ ] Bundle size analysis
- [ ] Create installation guide
- [ ] Package for Chrome Web Store (optional)
- [ ] Create demo video/screenshots

**Estimated time**: 2-3 hours

**Total estimated time**: 26-37 hours (4-5 days)

---

## Build Scripts

**Package.json scripts** (Hybrid Bun + Vite approach):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && bun run build.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  }
}
```

**Hybrid Workflow**:
- **Dev**: Vite with HMR (critical for Chrome extension auto-reload)
- **Test**: Bun Test (13x faster than Jest)
- **Build**: Bun Bundler for production (fast, optimized builds)

**Usage**:
```bash
# Install dependencies
bun install

# Development with hot reload (Vite)
bun dev

# Production build (Bun Bundler)
bun build

# Run tests (Bun Test)
bun test

# Watch mode for tests
bun test:watch

# Type checking
bun type-check
```

---

## Vite Configuration

```typescript
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './public/manifest.json',
      watchFilePaths: ['public/**/*', 'src/**/*'],
      additionalInputs: ['src/popup/popup.html', 'src/options/options.html'],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
      },
    },
    // Optimize for extension bundle size
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.logs in production
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

**Note**: Vite is used **only for development** with HMR. Production builds use Bun Bundler (see below).

---

## Bun Test Configuration

**File**: `bunfig.toml`

```toml
[test]
preload = ["./tests/setup/happydom.ts", "./tests/setup/testing-library.ts"]
```

**File**: `tests/setup/happydom.ts`

```typescript
import { GlobalRegistrator } from 'happy-dom';

// Register happy-dom as global DOM environment
GlobalRegistrator.register();

// Cleanup after tests
afterAll(() => {
  GlobalRegistrator.unregister();
});
```

**File**: `tests/setup/testing-library.ts`

```typescript
import '@testing-library/dom';
// No additional setup needed - @testing-library/dom works with happy-dom
```

**Why Bun Test?**
- **13x faster** than Jest (native Bun performance)
- **happy-dom** instead of jsdom (lighter, faster)
- **Compatible** with @testing-library/dom
- **Simple setup** - no complex config files
- **Watch mode** built-in (`bun test --watch`)

**Limitations**:
- No fake timers (not implemented in Bun Test yet)
- Not needed for our use case (simple UI, no complex timers)

---

## Production Build Configuration

**File**: `build.ts`

```typescript
import { $ } from 'bun';

console.log('🚀 Building Chrome extension with Bun...');

// Clean dist
await $`rm -rf dist`;
await $`mkdir -p dist`;

// Copy manifest and static assets
await $`cp -r public/* dist/`;

// Build popup
await Bun.build({
  entrypoints: ['./src/popup/popup.ts'],
  outdir: './dist/popup',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Build options page
await Bun.build({
  entrypoints: ['./src/options/options.ts'],
  outdir: './dist/options',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Build background service worker
await Bun.build({
  entrypoints: ['./src/background/service-worker.ts'],
  outdir: './dist/background',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Build content script
await Bun.build({
  entrypoints: ['./src/content/content-script.ts'],
  outdir: './dist/content',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

console.log('✅ Build complete!');
console.log('📦 Check dist/ for Chrome extension files');
```

**Why Bun Bundler for Production?**
- **Fast builds** - Zig-based bundler, faster than Rollup
- **Tree-shaking** - Same optimization as Rollup via Vite
- **Simple config** - No complex rollup plugins needed
- **Multi-entry** - Easy to handle popup, background, content scripts

**Build output**:
```
dist/
├── manifest.json
├── icons/
├── popup/
│   ├── popup.html
│   └── popup.js (bundled + minified)
├── options/
│   ├── options.html
│   └── options.js (bundled + minified)
├── background/
│   └── service-worker.js (bundled + minified)
└── content/
    ├── content-script.js (bundled + minified)
    └── content-script.css
```

---

## Testing Strategy

### Unit Tests

**API Client** (`tests/api-client.test.ts`):
- Test config file reading
- Test health endpoint
- Test voices endpoint
- Test speak endpoint
- Test error handling (helper not running, network errors)

**Popup** (`tests/popup.test.ts`):
- Test voice selection
- Test speed slider
- Test speak button (mocked API calls)
- Test status indicator states

### Integration Tests

- Test full flow: select text → speak → play audio
- Test context menu integration
- Test options page → popup sync

### Manual Testing Checklist

- [ ] Install extension in Chrome
- [ ] Verify native helper detection
- [ ] Test all 6 voices
- [ ] Test speed range (0.5x - 2.0x)
- [ ] Test text selection from different websites
- [ ] Test context menu
- [ ] Test options page settings persistence
- [ ] Test error states (helper not running, network errors)
- [ ] Test performance (popup open time <100ms)
- [ ] Test bundle size (<100KB)

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Bundle size (gzipped) | <50KB | Check dist/ after build |
| Popup open time | <100ms | Chrome DevTools Performance |
| Speak request latency | <300ms | Time from click to audio start |
| Memory footprint | <20MB | Chrome Task Manager |
| First render | <50ms | Lighthouse |

---

## Security & Privacy

### Data Handling

- **100% local**: All processing happens on user's machine
- **No network requests**: Except to localhost (127.0.0.1)
- **No analytics**: Zero tracking, zero telemetry
- **No external dependencies**: All code is self-contained

### Content Security Policy

Manifest V3 enforces strict CSP:
- No inline scripts (`<script>` tags)
- No `eval()` or `new Function()`
- No external CDNs

Our approach:
- ✅ All scripts are bundled and loaded as modules
- ✅ No inline event handlers
- ✅ No dynamic code generation

---

## Browser Compatibility

**Supported**:
- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)

**Not supported**:
- Firefox (different extension API, different manifest format)
- Safari (requires different extension system)

**Future consideration**: If demand exists, create Firefox/Safari versions with adjusted manifests

---

## Installation Guide (for users)

### Prerequisites

1. Native TTS Helper must be running (see `native-helper/QUICKSTART.md`)
2. Chrome 88 or later

### Installation Steps

1. Download extension from releases or build from source
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist/` folder from the built extension
6. Extension icon should appear in toolbar

### Usage

1. Select text on any webpage
2. Click extension icon or right-click → "Speak with Natural TTS"
3. Choose voice and speed in popup
4. Click "Speak Selected Text"
5. Audio plays immediately

---

## Troubleshooting

### "Native helper not running"

**Solution**:
```bash
cd native-helper
.build/release/natural-tts-helper
```

### "Port not found"

**Check**: `~/Library/Application Support/NaturalTTS/config.json` exists

### "Connection refused"

**Check**: Native helper is listening on the port in config.json

### Popup doesn't open

**Check**: Console for errors (`chrome://extensions` → Extension details → Inspect views: service worker)

---

## Next Steps After Phase 2

### Phase 3 (Optional): Advanced Features

- [ ] Multi-language support
- [ ] Custom voice training (if Kokoro supports it)
- [ ] Batch processing (speak multiple selections)
- [ ] Export to audio file
- [ ] Pronunciation dictionary
- [ ] Reading queue
- [ ] Highlight text as it's spoken

### Phase 4 (Optional): Distribution

- [ ] Publish to Chrome Web Store
- [ ] Create landing page
- [ ] User documentation
- [ ] Video tutorials

---

## References

- [Chrome Extension Manifest V3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Vite Plugin Web Extension](https://vite-plugin-web-extension.aklinker1.io/)
- [Native Helper API](../native-helper/README.md)
- [TypeScript Chrome Types](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chrome)

---

**Last Updated**: 2025-11-10 (Hybrid Bun + Vite approach finalized)
**Status**: ✅ **READY FOR PHASE 2.1** - Tech stack complete (Hybrid Bun + Vite)
**Tech Stack**: Bun v1.3.0 (package manager + testing + prod builds) + Vite (dev HMR)
**Next Action**: Begin Phase 2.1 (Project Setup)
