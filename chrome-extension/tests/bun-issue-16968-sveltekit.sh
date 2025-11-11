#!/bin/bash
set -e

# Reproduction test for Bun issue #16968
# https://github.com/oven-sh/bun/issues/16968
#
# ORIGINAL ISSUE: "The service was stopped" error from esbuild when Vite
# attempts to load vite.config.ts in SvelteKit projects after package operations
#
# Test matches original issue conditions:
# 1. Uses SvelteKit (not minimal Vite)
# 2. Lets Vite fully cache dependencies
# 3. Tests all trigger conditions (install/add/remove)
# 4. Verifies specific error message

echo "=================================================="
echo "Bun Issue #16968 - SvelteKit Reproduction Test"
echo "=================================================="
echo ""
echo "Environment:"
echo "- Bun: $(bun --version)"
echo "- Platform: $(uname -s) $(uname -r) $(uname -m)"
echo "- Date: $(date +%Y-%m-%d)"
echo ""

# Cleanup any previous test
TEST_DIR="/tmp/test-16968-sveltekit"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "Step 1: Creating SvelteKit project..."
echo ""

# Create SvelteKit project manually (matching original issue versions)
# Using versions compatible with Bun's Node.js 18.18.0
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

const config = {
  kit: {
    adapter: adapter()
  }
};

export default config;
EOF

cat > vite.config.ts << 'EOF'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
EOF

# Create basic SvelteKit structure
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

echo "✓ SvelteKit project structure created"

echo ""
echo "Step 2: Installing dependencies..."
bun install

echo ""
echo "Step 3: Running dev server to cache Vite dependencies..."
echo "(Waiting for Vite to fully initialize and cache...)"

# Start dev server in background and capture output
DEV_OUTPUT=$(mktemp)
bun run dev > "$DEV_OUTPUT" 2>&1 &
DEV_PID=$!

# Wait for Vite to be ready (look for "Local:" in output)
TIMEOUT=30
ELAPSED=0
READY=false

while [ $ELAPSED -lt $TIMEOUT ]; do
    if grep -q "Local:" "$DEV_OUTPUT" 2>/dev/null; then
        READY=true
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

# Stop the dev server
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true

if [ "$READY" = false ]; then
    echo "ERROR: Dev server didn't start within ${TIMEOUT}s"
    cat "$DEV_OUTPUT"
    exit 1
fi

echo "✓ Dev server initialized successfully"
echo ""

# Verify Vite cache was created
if [ -d "node_modules/.vite" ]; then
    echo "✓ Vite cache created: node_modules/.vite"
    ls -lh node_modules/.vite/ | head -5
else
    echo "⚠ Warning: Vite cache not found"
fi

echo ""
echo "=================================================="
echo "Testing Trigger Conditions"
echo "=================================================="
echo ""

# Function to test dev server after package operation
test_dev_server() {
    local test_name="$1"
    echo "---"
    echo "Test: $test_name"
    echo "---"

    # Try to start dev server and capture output
    local output=$(mktemp)
    local error=false

    timeout 10s bun run dev > "$output" 2>&1 || error=true

    # Check for specific error from original issue
    if grep -q "The service was stopped" "$output"; then
        echo "❌ BUG REPRODUCED: 'The service was stopped' error"
        echo ""
        echo "Error output:"
        grep -A 5 -B 5 "service was stopped" "$output" || cat "$output"
        return 1
    elif grep -q "failed to load config" "$output"; then
        echo "❌ BUG REPRODUCED: 'failed to load config' error"
        echo ""
        echo "Error output:"
        grep -A 5 -B 5 "failed to load config" "$output" || cat "$output"
        return 1
    elif grep -q "Local:" "$output"; then
        echo "✅ PASS: Dev server started successfully"
        return 0
    else
        echo "⚠ UNCLEAR: Unexpected output (check manually)"
        echo ""
        cat "$output"
        return 2
    fi
}

# Test 1: Re-run bun install
echo "Test 1/3: After 'bun install' (re-install)"
echo ""
bun install --silent
test_dev_server "bun install"
RESULT_1=$?
echo ""

# Test 2: Add a dependency
echo "Test 2/3: After 'bun add' (add dependency)"
echo ""
bun add -D typescript --silent
test_dev_server "bun add -D typescript"
RESULT_2=$?
echo ""

# Test 3: Remove a dependency
echo "Test 3/3: After 'bun remove' (remove dependency)"
echo ""
bun remove typescript --silent
test_dev_server "bun remove typescript"
RESULT_3=$?
echo ""

# Summary
echo "=================================================="
echo "Test Results Summary"
echo "=================================================="
echo ""

if [ $RESULT_1 -eq 0 ] && [ $RESULT_2 -eq 0 ] && [ $RESULT_3 -eq 0 ]; then
    echo "✅ ALL TESTS PASSED - Issue appears to be RESOLVED"
    echo ""
    echo "The bug described in issue #16968 does not reproduce"
    echo "with the current Bun version and SvelteKit setup."
    exit 0
elif [ $RESULT_1 -eq 1 ] || [ $RESULT_2 -eq 1 ] || [ $RESULT_3 -eq 1 ]; then
    echo "❌ BUG REPRODUCED - Issue still EXISTS"
    echo ""
    echo "Test 1 (bun install): $([ $RESULT_1 -eq 1 ] && echo 'FAILED' || echo 'PASSED')"
    echo "Test 2 (bun add):     $([ $RESULT_2 -eq 1 ] && echo 'FAILED' || echo 'PASSED')"
    echo "Test 3 (bun remove):  $([ $RESULT_3 -eq 1 ] && echo 'FAILED' || echo 'PASSED')"
    echo ""
    echo "The 'service was stopped' error still occurs after package operations."
    exit 1
else
    echo "⚠ INCONCLUSIVE - Manual verification needed"
    echo ""
    echo "Test 1 (bun install): exit code $RESULT_1"
    echo "Test 2 (bun add):     exit code $RESULT_2"
    echo "Test 3 (bun remove):  exit code $RESULT_3"
    exit 2
fi
