## ✅ RESOLVED in Bun v1.3.0

Tested on **Bun v1.3.0 (b0a6feca)** - environment variable loading now works correctly with Vite mode-specific files.

### Reproduction Test

```bash
# Create minimal Vite project
mkdir test-6338 && cd test-6338

# Setup
cat > package.json << 'EOF'
{
  "type": "module",
  "scripts": { "build": "vite build" },
  "devDependencies": { "vite": "^5.4.9" }
}
EOF

cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite';
export default defineConfig({});
EOF

echo 'VITE_PUBLIC_PATH=/dev' > .env
echo 'VITE_PUBLIC_PATH=/app' > .env.production

cat > index.html << 'EOF'
<!DOCTYPE html><html><body><script type="module" src="/src/main.js"></script></body></html>
EOF

mkdir src && cat > src/main.js << 'EOF'
console.log('VITE_PUBLIC_PATH:', import.meta.env.VITE_PUBLIC_PATH);
document.body.innerHTML = `<p>VITE_PUBLIC_PATH: ${import.meta.env.VITE_PUBLIC_PATH}</p>`;
EOF

# Test WITHOUT workaround
bun install
bun run build
cat dist/assets/*.js | grep -o 'VITE_PUBLIC_PATH:[^,}]*'
```

### Result

**Expected (if bug exists)**: `/dev` (from `.env`)
**Actual**: `/app` (from `.env.production`) ✅

Production builds now correctly use `.env.production` values **without** requiring `NODE_ENV=production` workaround.

### Environment

- Bun: v1.3.0 (b0a6feca)
- Vite: v5.4.21
- Platform: macOS Darwin 24.6.0
- Test date: 2025-11-10

### Observation

During `bun install`, console shows:
```
[0.52ms] ".env.production", ".env"
```

Bun now correctly loads env files in the right order, and Vite's mode-specific logic works as expected.

**Recommend closing** this issue or updating status to reflect fix in v1.3.0+.
