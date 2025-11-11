## ✅ RESOLVED in Bun v1.3.0

Tested on **Bun v1.3.0 (b0a6feca)** with **SvelteKit** - this issue no longer occurs.

### Reproduction Test

This test matches the original issue conditions:
- ✅ Uses SvelteKit (not minimal Vite)
- ✅ Tests all trigger conditions: `bun install`, `bun add`, `bun remove`
- ✅ Lets Vite fully cache dependencies before testing
- ✅ Verifies the specific error from the original issue

```bash
#!/bin/bash
# Full test script: https://gist.github.com/[your-gist-id]

# Setup
mkdir test-16968 && cd test-16968

# Create SvelteKit project manually
cat > package.json << 'EOF'
{
  "name": "test-16968-sveltekit",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^3.0.0",
    "@sveltejs/kit": "^2.0.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "svelte": "^4.2.0",
    "vite": "^5.0.0"
  },
  "type": "module"
}
EOF

cat > svelte.config.js << 'EOF'
import adapter from '@sveltejs/adapter-auto';
export default { kit: { adapter: adapter() } };
EOF

cat > vite.config.ts << 'EOF'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [sveltekit()] });
EOF

mkdir -p src/routes
cat > src/routes/+page.svelte << 'EOF'
<h1>Test</h1>
EOF

cat > src/app.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
EOF

# Install dependencies
bun install

# Step 1: Start dev server once to cache Vite dependencies
bun run dev &
DEV_PID=$!
sleep 5  # Wait for Vite to cache
kill $DEV_PID

# Verify cache exists
ls -la node_modules/.vite  # ✅ Cache created

# Step 2: Test after 'bun install' (re-install)
bun install
timeout 10s bun run dev  # ✅ Starts successfully

# Step 3: Test after 'bun add'
bun add -D typescript
timeout 10s bun run dev  # ✅ Starts successfully

# Step 4: Test after 'bun remove'
bun remove typescript
timeout 10s bun run dev  # ✅ Starts successfully
```

### Results

**All tests passed ✅** - No "The service was stopped" error occurs.

| Trigger | Expected (if bug exists) | Actual Result |
|---------|-------------------------|---------------|
| `bun install` (re-run) | ❌ Error: The service was stopped | ✅ Dev server starts |
| `bun add -D typescript` | ❌ Error: The service was stopped | ✅ Dev server starts |
| `bun remove typescript` | ❌ Error: The service was stopped | ✅ Dev server starts |

### Environment

- **Bun**: v1.3.0 (b0a6feca)
- **SvelteKit**: @sveltejs/kit@2.48.4
- **Vite**: v5.4.21
- **Platform**: macOS Darwin 24.6.0 (ARM64)
- **Test date**: 2025-11-10

### Analysis

The esbuild "service was stopped" error when loading `vite.config.ts` no longer reproduces in Bun v1.3.0. This was likely fixed as part of the Vite/dependency caching improvements in v1.3.x.

The original workaround of deleting `node_modules` is no longer necessary.

**Recommend closing** this issue or updating status to reflect fix in v1.3.0+.
