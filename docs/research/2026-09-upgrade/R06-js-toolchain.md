# R06: JS/TS toolchain for the Chrome extension

Date: 2026-09-23. Scope: `chrome-extension/` (`package.json`, `build.ts`, `vite.config.ts`, `bunfig.toml`, `tsconfig.json`, `tests/`, `bun.lock`).

Method: each version and date comes from a primary source fetched in this run: the npm registry JSON, `gh api` releases, the official blog/docs, or GitHub Security Advisories. Each behavioural claim is labelled **[M#]**. That means it was measured in a scratch copy under `/tmp/ntts-r06/` with Bun 1.3.0 (installed) and Bun 1.4.2 (downloaded into scratch). No tracked file was edited, and nothing was installed into the repo.

---

## Verdict

**The toolchain needs a subtraction more than an upgrade.** The shipping build is `tsc && bun run build.ts` (Bun.build). Vite has never been the build path.

- `vite build` exits 1 **[M2]**.
- Its config names `terser` and `lightningcss`, and neither is installed **[M2]**.
- The vite chain pulls in **14 of the 16 packages** behind the lockfile's **45 advisories (2 critical, 32 high, 11 moderate)** **[M3]**.

Delete vite, then bump the rest. The candidate below keeps build output **byte-identical** and passes **128/128 tests**. `bun audit` reports **0 vulnerabilities**, lockfile entries fall from 274 to 36, and `node_modules` shrinks from 130 MB to 55 MB **[M4] [M5]**. Two edits are required: remove `baseUrl`, and add a generic to 2 `storage.get` call sites.

### Ranked recommendations

| # | Item | Action | Current → Target | Conviction | Effort |
|---|---|---|---|---|---|
| 1 | Delete `vite`, `vite-plugin-web-extension`, `vite.config.ts` and the `dev`/`preview` scripts | **reject** (the vite path) | vite 5.4.21 / vpwe 4.5.0 → removed | **97%** | S |
| 2 | `tsconfig.json`: delete `baseUrl` + the unused `paths` alias, and drop `vite.config.ts` from `include` | **upgrade-now** (prerequisite for #4) | — | **97%** | S |
| 3 | `happy-dom` (security) | **upgrade-now** | 15.11.7 → **20.14.5** | **93%** | S |
| 4 | `@types/chrome` plus a generic on 2 `storage.local.get` call sites | **upgrade-now** | 0.0.268 → **0.3.0** | **90%** | S |
| 5 | TypeScript | **upgrade-now** | 5.9.3 → **7.0.2** (fallback 6.0.3) | **80%** | S |
| 6 | Bun runtime + `@types/bun` in lockstep, pinned via `packageManager` | **upgrade-now** | 1.3.0 / 1.3.2 → **1.4.2 / 1.4.2** | **80%** | S |
| 7 | `build.ts` fixes: the dead `\|\| true`, plus `drop` to deliver the console-stripping that commit 9423315 intended | **adopt-new** | — | **80%** | S |
| 8 | `@testing-library/dom` | **hold** (remove the no-op import now; re-add 10.4.2 with the first DOM query) | 10.4.1 → removed (10.4.2 verified) | **70%** | S |
| 9 | Supply-chain hygiene: exact pins, `install.minimumReleaseAge`, `packageManager` | **adopt-new** | caret ranges → exact | **75%** | S |
| 10 | Bun.build **HTML entrypoints** for popup/options/offscreen (replaces 7 of 9 copy steps, inlines `variables.css`) | **evaluate** | hand-rolled copies → bundler | **70%** | M |
| 11 | DOM tests for popup/content-script + `coverageThreshold` (only 533 of 2,371 src lines are ever loaded by a test) | **evaluate** | — | **85%** worth doing | M |
| 12 | Switch to **WXT** 0.21.4 | **reject** for now | — | **78%** | L |
| 13 | Switch to **CRXJS** 2.7.1 | **reject** | — | **88%** | L |
| 14 | `rolldown-vite` | **reject** (merged into Vite 8; moot once vite is gone) | — | **95%** | — |

### Target `chrome-extension/package.json` (verified in scratch, [M4])

```jsonc
{
  "name": "natural-tts-chrome-extension",
  "version": "1.4.0",
  "type": "module",
  "packageManager": "bun@1.4.2",
  "scripts": {
    "build": "tsc && bun run build.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "1.4.2",
    "@types/chrome": "0.3.0",
    "happy-dom": "20.14.5",
    "typescript": "7.0.2"
  }
}
```

### Verification (the gate for every step below)

```bash
cd chrome-extension
bun --version                  # 1.4.2
bun install --frozen-lockfile  # after the lockfile is committed
bun run type-check             # exit 0
bun test                       # 128 pass, 0 fail (the integration test needs the helper on 127.0.0.1:8249)
bun run build                  # exit 0
bun audit                      # "No vulnerabilities found"
shasum -a 256 dist/*/*.js      # compare with a pre-change build; identical for steps 1-6 [M5]
```

---

## 1. Which build path is real

| Script | What it runs | State |
|---|---|---|
| `build` | `tsc && bun run build.ts` → 5 × `Bun.build({target:'browser', minify:true})` + `cp` of HTML/CSS/manifest/icons | **Works.** ~1.2 s, 35,691 bytes of JS **[M1]** |
| `dev` | `vite` | **Broken** (same config as below) |
| `preview` | `vite preview` | **Broken / meaningless**. It previews a vite build that cannot complete |
| — | `vite build` | **exit 1**: `Rollup failed to resolve import "offscreen.js" from src/offscreen/offscreen.html`. The config also sets `minify: 'terser'` and `cssMinify: 'lightningcss'`, but neither package is installed **[M2]** |

History: `vite.config.ts` was created in `50c0396` (2025-11-10). Commit `9423315`, "perf(extension): optimize bundle size from 108KB to 61KB", then added `terser` `drop_console`/`pure_funcs` to it. Because the build never runs vite, **those settings never shipped.** Today's bundles contain 66 `console.*` calls (26 `log`, 34 `error`, 6 `warn`) **[M9]**. C1 (`C1-extension-map.md` §1, D19) found the same.

**Is vite needed at all? No.** The extension has zero runtime dependencies (`"dependencies": {}`), no framework and no npm imports in `src/`, plus five entrypoints. Bun.build already bundles and minifies them in about a second **[M1]**. The one thing vite could add is a dev server with HMR, and the config never got that working.

---

## 2. Per-item detail

### 2.1 vite 5.4.21 and vite-plugin-web-extension 4.5.0: remove (reject the vite path, 97%)

**Latest.** vite **8.3.0** (2026-09-10) and 7.3.6 on the `previous` tag ([npm vite](https://registry.npmjs.org/vite)). vite-plugin-web-extension **4.5.1** (published 2026-04-06; peer `vite ^8 || ^7 || ^6 || ^5 || ^4.1.4`) ([npm vpwe](https://registry.npmjs.org/vite-plugin-web-extension)).

**What changed upstream, 5 → 8** (for the record; it does not matter once vite is removed):
- **Vite 6** (2024-11-26): Environment API, Node 18/20/22+, new `resolve.conditions` default, Sass modern API by default ([announcing-vite6](https://vite.dev/blog/announcing-vite6)).
- **Vite 7** (2025-06-24): Node **20.19+ / 22.12+**, ESM-only distribution, default `build.target` moves to `'baseline-widely-available'` (Chrome 87 → 107), Sass legacy API and `splitVendorChunkPlugin` removed ([announcing-vite7](https://vite.dev/blog/announcing-vite7)).
- **Vite 8** (2026-03-12): "ships with Rolldown as its single, unified, Rust-based bundler". `rolldown-vite` "was released as a technical preview" and is now folded in. `lightningcss` becomes a normal dependency ([announcing-vite8](https://vite.dev/blog/announcing-vite8)). In the migration guide, `build.rollupOptions` is renamed to `build.rolldownOptions`, "Oxc is now used for JavaScript transformation instead of esbuild… esbuild is now deprecated", the default minifier is Oxc, and "Lightning CSS is now used for CSS minification by default" ([vite migration](https://vite.dev/guide/migration)).

**Upstream status of the plugin.** The README says: "`vite-plugin-web-extension` will soon be deprecated in favor of WXT, it's successor… If you're starting a new project, I'd recommend you use WXT instead" ([repo README](https://github.com/aklinker1/vite-plugin-web-extension)). The last code commit was "fix: Add support vite 8" on 2026-03-20; 31 issues are open (`gh api repos/aklinker1/vite-plugin-web-extension`).

**Why it matters here: security, not function.**
- Baseline `bun audit`: **45 vulnerabilities (2 critical, 32 high, 11 moderate) across 16 packages**. Of those 16, 10 arrive only through `vite-plugin-web-extension` (`web-ext-run` → `adm-zip`, `shell-quote`, `tmp`, `node-forge`, `minimatch`, `brace-expansion`, `uuid`, `ajv`, `yaml`, `fast-uri`) and 4 through `vite` (`rollup`, `esbuild`, `nanoid`, `postcss`). The other 2 are the direct `vite` and `happy-dom` entries **[M3]**.
- Upgrading instead of deleting does not fix it. A fresh `vite@8.3.0 + vite-plugin-web-extension@4.5.1` install still audits at **7 vulnerabilities (1 critical, 4 high, 2 moderate)**, all through `vpwe → web-ext-run → fx-runner/firefox-profile/tmp/node-notifier` (critical: `shell-quote` [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p)) **[M6]**.

**Migration.** `bun remove vite vite-plugin-web-extension`, `git rm chrome-extension/vite.config.ts`, delete the `dev` and `preview` scripts, and remove `"vite.config.ts"` from `tsconfig.json` `include`. The build output does not change, because vite never produced it **[M5]**.

### 2.2 tsconfig.json: delete `baseUrl` and the unused alias (97%)

Current lines 22–24: `"baseUrl": "."` and `"paths": { "@/*": ["src/*"] }`.

- **TS 6.0.3** gives `TS5101 Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0` **[M7]**.
- **TS 7.0.2** gives `TS5102 Option 'baseUrl' has been removed` plus `TS5090 Non-relative paths are not allowed` **[M7]**.
- TS 6.0 blog: "`baseUrl` is deprecated and will no longer be considered a look-up root for module resolution" ([TS 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)). TS 7.0 lists `baseUrl` as "no longer supported" ([TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
- **The `@/*` alias has zero uses** in `src/` or `tests/` (`grep "'@/"` finds 0). The vite `resolve.alias` is dead too. So **delete both keys** rather than rewriting them to `"./src/*"`, which R10 #9 suggested. If an alias is wanted later, `"paths": {"@/*": ["./src/*"]}` without `baseUrl` is the TS 6/7 form.

Other TS 6/7 default changes, checked against this tsconfig:
- `types` now defaults to `[]`. **Already explicit** (`["chrome", "bun"]`), so no change.
- `esModuleInterop`/`allowSyntheticDefaultImports` can no longer be `false`. Both are `true`, so no change.
- `moduleResolution: "bundler"` is still supported.
- `noUncheckedSideEffectImports` now defaults to `true`. `import '@testing-library/dom'` resolves, so it passes.
- `lib: ["DOM","DOM.Iterable"]` is fine. In 6.0, `dom` already includes `dom.iterable` ([TS 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)).

### 2.3 happy-dom 15.11.7 → 20.14.5 (upgrade-now, 93%)

**Latest.** **20.14.5** (2026-09-12), engines `node >=20` ([npm happy-dom](https://registry.npmjs.org/happy-dom), [releases](https://github.com/capricorn86/happy-dom/releases)).

**Advisories affecting 15.11.7** (GitHub Advisory DB, `gh api /advisories?ecosystem=npm&affects=happy-dom`):

| GHSA | CVE | Severity | Range | Fixed |
|---|---|---|---|---|
| [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f) | CVE-2025-61927 | **critical**: VM context escape can lead to RCE | `< 20.0.0` | 20.0.0 |
| [GHSA-6q6h-j7hj-3r64](https://github.com/advisories/GHSA-6q6h-j7hj-3r64) | CVE-2026-33943 | high: ECMAScriptModuleCompiler interpolates export names as code | `>= 15.10.0, <= 20.8.7` | 20.8.8 |
| [GHSA-w4gp-fjgq-3q4g](https://github.com/advisories/GHSA-w4gp-fjgq-3q4g) | CVE-2026-34226 | high: fetch `credentials: include` sends page-origin cookies | `< 20.8.9` | 20.8.9 |
| [GHSA-96g7-g7g9-jxw8](https://github.com/advisories/GHSA-96g7-g7g9-jxw8) | CVE-2024-51757 | critical | `< 15.10.2` | already fixed in 15.11.7 |

Real exposure is low. happy-dom is a dev-only dependency, and tests evaluate no untrusted JS. But the fix costs nothing and clears the audit.

**Breaking changes 15 → 20** (release notes, [v16](https://github.com/capricorn86/happy-dom/releases/tag/v16.0.0) … [v20](https://github.com/capricorn86/happy-dom/releases/tag/v20.0.0)):
- v16: HTML/XML parser and serialiser rewritten; "serialized output may differ".
- v17: ESM support.
- v18: stricter types.
- v19: **CommonJS removed**.
- v20: "JavaScript evaluation is now disabled by default" (`enableJavaScriptEvaluation`).

None of these touch this suite. The setup only constructs `new Window()` and assigns five globals.

**Measured:** on happy-dom 20.14.5 with the **existing** `tests/setup/happydom.ts` unchanged, the suite is **128 pass / 0 fail** **[M4]**. R10 measured the same.

**Trap: do not switch to Bun's documented `GlobalRegistrator` preload.** Bun's DOM guide recommends `@happy-dom/global-registrator` + `GlobalRegistrator.register()` in a preload ([bun docs: DOM testing](https://bun.com/docs/test/dom)). With that global preload, `tests/integration/api-client-live.test.ts` fails with "Native TTS Helper not found on ports: 8249…", **1 fail / 123**, even though the helper was answering `/health` at the same moment **[M8]**. The cause is that `register()` swaps Bun's native `fetch` for happy-dom's browser-emulating one. **Keep the narrow `new Window()` setup**, or register DOM globals only inside DOM test files. Bun 1.4's new `bun test --isolate` "runs each file in a fresh global scope" ([Bun 1.4](https://bun.com/1.4)), which would contain per-file registration; this was not measured here.

**Honest caveat: today happy-dom is idle.** With `bunfig.toml` preloads removed entirely, the suite still passes **128/128** **[M8]**. No test touches `document`/`window`. The recommendation is still to upgrade rather than remove, because #11 (DOM tests for `popup.ts`, 719 lines, never loaded by a test) is the natural next step and happy-dom is the test environment for it. If #11 is declined, removing happy-dom is equally valid (**[M8]** proves nothing breaks).

### 2.4 @types/chrome 0.0.268 → 0.3.0 (upgrade-now, 90%)

**Versioning change.** DefinitelyTyped ended the `0.0.x` line at 0.0.332 (64 releases after our pin) and moved to minor bumps:
- **0.1.0** (2025-07-11): PR [#73192](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/73192), "drop obsolete APIs": Platform-Apps `serial`/`socket`/`browser` moved to `@types/chrome-apps`.
- **0.2.0** (2026-06-20): PR [#74965](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/74965), which removed deprecated types (`ManifestPermissions`, …) and replaced `NoInferX` with native `NoInfer`, "Required TypeScript 5.4 or later".
- **0.3.0** (2026-09-15): PR [#75475](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75475), a global `browser` alias, because "As of Chrome 148, the `browser` namespace is a native, drop-in replacement" ([Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace)).

Dates are from `time` in [npm @types/chrome](https://registry.npmjs.org/@types/chrome). 0.3.0 declares `"typeScriptVersion": "5.6"`.

**Why the pin never moved.** Under semver, `^0.0.268` means `>=0.0.268 <0.0.269`. A caret on a `0.0.x` version locks the patch, so this dependency could never update itself, not even to 0.0.332.

**The only break that hits this code.** `StorageArea.get`'s default result type changed from `{ [key: string]: any }` to `{ [key: string]: unknown }` in **0.1.29** (2025-11-14, PR [#74072](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/74072) "[chrome] update storage namespace"). Bisected: 0.1.28 still uses `any`, 0.1.29 uses `unknown` (unpkg `index.d.ts` per version) **[M10]**. Result: 3 errors on **every** TS version (5.9.3, 6.0.3, 7.0.2): `popup.ts(677,7)`, `popup.ts(681,7)`, `config.ts(39,26)` **[M7]**. R05 #8 and R10 found the same errors.

**Fix (verified: tsc exit 0 on 6.0.3 and 7.0.2 [M7]).** Two call sites; type-only changes, no runtime effect:

```ts
// src/popup/popup.ts:674
const result = await chrome.storage.local.get<{ selectedVoice?: string; selectedSpeed?: number }>([
  'selectedVoice',
  'selectedSpeed',
]);
// src/shared/config.ts:36
const result = await chrome.storage.local.get<Record<string, Partial<HelperConfig> | undefined>>(STORAGE_KEY);
```

Alternative: Google's own generated [`chrome-types`](https://registry.npmjs.org/chrome-types) (0.1.449, 2026-09-21). It is not recommended here: `@types/chrome` is what the code, R05's API-typing work and `tsconfig.types` already assume.

### 2.5 TypeScript 5.9.3 → 7.0.2 (upgrade-now, 80%; fallback 6.0.3)

**Latest.** `typescript@latest` = **7.0.2** (2026-07-08). 6.0.3 was released 2026-04-16 and `next` = 7.1.0-dev ([npm typescript](https://registry.npmjs.org/typescript)). **TS 7 is the Go-native compiler, published as the ordinary `typescript` package.** Its only bin is `tsc`, backed by the platform package `@typescript/typescript-darwin-arm64`, and there is **no `tsserver`** in the package **[M11]**. The `@typescript/native-preview` / `tsgo` package stopped at 7.0.0-dev.20260707.2.

TS 7.0 post ([announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)):
- Hard-removed options: `target es5`, `downlevelIteration`, `moduleResolution node/node10/classic`, `module amd/umd/system/none`, `baseUrl`, `esModuleInterop`/`allowSyntheticDefaultImports: false`.
- 7.0 "does not ship with a programmatic API". Tools that need one should keep TS 6 via `@typescript/typescript6` (bin `tsc6`, [npm](https://registry.npmjs.org/@typescript/typescript6)).
- `--checkers` defaults to 4 workers.

**Why TS 7 is safe here:**
- Nothing in this project consumes the TS JS API: no typescript-eslint, no ts-node, and Bun transpiles TS itself. Once vite is gone, `tsc --noEmit` is the only consumer.
- After #2 and #4, **TS 7.0.2 passes with 0 errors**, exactly as 6.0.3 does **[M7]**.
- Typecheck of this project, mean of 3 warm runs **[M12]**: TS 5.9.3 **0.92 s**, TS 6.0.3 **0.91 s**, TS 7.0.2 **0.13 s**, about 7x faster. The absolute saving is small, but it is also the direction the ecosystem is moving.

**Why only 80%: the editor.** The TS 7 language server ships as the VS Code extension `TypeScriptTeam.native-preview` ("TypeScript 7", updated 2026-07-08, VS Marketplace query). It is **not on Open VSX** ("Extension not found: TypeScriptTeam.native-preview") **[M11]**, which is Cursor's registry. In Cursor, the editor keeps using its bundled TS service. That is fine because typecheck results are identical, but "Use Workspace Version" will not work, since `typescript@7` has no `tsserver`. If that friction matters, pin **`typescript@6.0.3`** instead: the same tsconfig edits, the same 0 errors, 95% conviction it just works.

**Migration.** Apply #2 and #4, then `bun add -d typescript@7.0.2`, then `bun run type-check`.

### 2.6 Bun 1.3.0 → 1.4.2, @types/bun 1.3.2 → 1.4.2 (upgrade-now, 80%)

**Latest.** **Bun 1.4.2** (2026-09-05). 1.4.0 came out 2026-08-20; 1.3.14 (2026-05-13) is the last 1.3.x ([gh releases](https://github.com/oven-sh/bun/releases)). `@types/bun`/`bun-types` 1.4.2 (2026-09-08) track the runtime ([npm @types/bun](https://registry.npmjs.org/@types/bun)).

**What changed that matters here:**
- **Bun 1.4 "rewrites Bun from Zig to Rust"** and "fixes over 2,900 issues" ([Bun 1.4 blog](https://bun.com/1.4); markdown at `https://bun.sh/blog/bun-v1.4.md`). This is the reason conviction is 80 and not 95: 1.4.x is a five-week-old runtime rewrite. 1.4.2 is a regression-fix patch ([v1.4.2 notes](https://bun.sh/blog/bun-v1.4.2)).
- **`bun.lock` is now `lockfileVersion: 2`** since 1.4.0. The blog says "Lockfiles written as v0/v1 keep loading… Run `bun install` to migrate." **Measured:** with 1.4.2, neither `bun install` nor `bun install --lockfile-only` nor `bun add` migrates an existing v1 lockfile; it stays `lockfileVersion 1, configVersion 0`. Only a freshly generated lockfile is `lockfileVersion 2, configVersion 1`, and **Bun 1.3.0 then prints `warn: Ignoring lockfile` and fails `--frozen-lockfile`** **[M13]**. `configVersion` itself arrived in 1.3.2 ([Bun v1.3.2](https://bun.com/blog/bun-v1.3.2)).
- New in 1.4 and useful here: `bun test --parallel`, `--isolate` and `--changed`; `bun audit fix`; `bun build --metafile-md` ([Bun 1.4](https://bun.com/1.4)).
- Also from 1.4: "happy-dom: no longer breaks `console.log`"; `bun build --minify` "no longer generates a bare `$` identifier" ([blog md, compat and bundler sections](https://bun.sh/blog/bun-v1.4.md)).
- In 1.3.x: HTML-entrypoint fixes, including `<link rel="manifest">` assets now copied (1.3.10), and `--compile --target=browser` single-file HTML (1.3.10) ([Bun v1.3.10](https://bun.com/blog/bun-v1.3.10)).

**Measured parity [M5]:** Bun 1.4.2 builds **byte-identical** bundles to Bun 1.3.0. The SHA-256 matches for all five (`service-worker.js`, `content-script.js`, `offscreen.js`, `options.js`, `popup.js`). `bun test` is 128/128 and `bun audit` works.

**Migration:**
1. `bun upgrade` (the operator's global Bun), or pin with `"packageManager": "bun@1.4.2"`. That field is what `oven-sh/setup-bun@v2` reads first when CI arrives ([setup-bun](https://github.com/oven-sh/setup-bun)).
2. Because steps 1–5 remove 238 of 274 lock entries anyway, regenerate the lockfile once (`rm bun.lock && bun install`). That gets v2's stricter integrity and path-traversal checks. Do this **only once every machine is on ≥ 1.4**, because 1.3.x cannot read v2 **[M13]**.
3. Bump `@types/bun` to the same version as the runtime.

**Fallback:** Bun **1.3.14** (the last Zig release) with `@types/bun` 1.3.14. The lockfile stays v1. Not measured here beyond lockfile behaviour **[M13]**.

### 2.7 build.ts correctness fixes (adopt-new, 80%)

1. **`|| true` is dead code.** `build.ts:30,45,69` do `await $\`cp …\` || true`. A `ShellPromise` is truthy, so `|| true` never evaluates, and Bun Shell throws on a non-zero exit: "By default, a non-zero exit code throws an error… `.nothrow()` disables throwing" ([bun docs: shell](https://bun.com/docs/runtime/shell)). Measured on both 1.3.0 and 1.4.2: the `|| true` form **throws** with exitCode 1 **[M14]**. Either delete `|| true` (these copies are required, since the manifest and HTML reference the files) or use `.nothrow()`. Deleting is the honest choice.
2. **Deliver the stripping that 9423315 intended.** Bun.build supports `drop` ([bun docs: bundler `drop`](https://bun.com/docs/bundler)).
   - `drop: ['console.log', 'console.info', 'console.debug', 'debugger']` removes all 26 `console.log` calls, keeps 34 `console.error` + 6 `console.warn` for diagnosability, and cuts JS from 35,691 to **33,922 bytes (−5%)** **[M9]**.
   - `drop: ['console', 'debugger']` removes all 66 calls and gives 31,676 bytes (−11%). That also removes the error logs users could report, so the selective form is recommended.
   - Works identically on Bun 1.3.0 and 1.4.2 **[M9]**.
3. Once vite is deleted, the `resolve.alias` / `@` alias disappears with it (see #2).

### 2.8 @testing-library/dom 10.4.1 → 10.4.2 (hold: remove the no-op now, 70%)

**Latest.** **10.4.2** (2026-09-13). Its only change: "pin @types/node to a TypeScript 4-compatible version" ([release](https://github.com/testing-library/dom-testing-library/releases/tag/v10.4.2), [npm](https://registry.npmjs.org/@testing-library/dom)). No advisories.

**Usage here.** The only reference is `tests/setup/testing-library.ts`: `import '@testing-library/dom'`, a side-effect import of a library that has no side effects. No test calls `screen`/`getBy*`/`fireEvent`/`waitFor` (grep finds 0). Both variants were verified:
- Without it: 128/128, 0 vulnerabilities (36 packages).
- With 10.4.2: 128/128, 0 vulnerabilities (51 packages) **[M4]**.

Recommendation: delete the setup file and the dependency now. Add `@testing-library/dom@10.4.2` back in the same commit as the first DOM test that queries by role (#11).

### 2.9 Supply-chain hygiene (adopt-new, 75%)

- **Exact pins** in `devDependencies`. The caret ranges bought nothing: on 0.0.x they froze (#4), and elsewhere they let a lockfile-less install drift. Bun's `install.exact = true` makes `bun add` write exact versions ([bunfig docs](https://bun.com/docs/runtime/bunfig)).
- **`install.minimumReleaseAge = 259200`** (3 days, in seconds): "Bun filters out package versions published more recently than this threshold. Default `null` (disabled)." `minimumReleaseAgeExcludes` exists for urgent security bumps ([bunfig docs](https://bun.com/docs/runtime/bunfig)).
- **`bun audit` in the verification gate.** 1.4 adds `bun audit fix` ([Bun 1.4](https://bun.com/1.4)).
- The dependency surface after #1/#3/#8 is **4 direct devDependencies, 36 lock entries, 0 advisories**, against 274 entries and 45 advisories today **[M4] [M3]**.

### 2.10 Bun.build HTML entrypoints (evaluate, 70%)

Bun.build accepts `.html` entrypoints. "Scripts (`<script src>`) are run through Bun's JavaScript/TypeScript/JSX bundler" and "Stylesheets (`<link rel="stylesheet">`) are run through Bun's CSS parser & bundler", with `@import` bundled ([bun docs: HTML](https://bun.com/docs/bundler/html-static)).

**Measured [M15].** Change each page's `<script type="module" src="popup.js">` to `src="./popup.ts"` (3 one-attribute edits). Then build the three pages in one `Bun.build` call with `root: './src'` and `naming: { entry: '[dir]/[name].[ext]', chunk: '[dir]/[name]-[hash].[ext]', asset: '[dir]/[name]-[hash].[ext]' }`. The service worker and content script stay separate calls, as today. Results:
- Every page works, with rewritten `src`/`href` pointing at hashed siblings such as `./popup-88sypje3.js`.
- **`@import '../shared/variables.css'` is inlined into each page's CSS.** This deletes the manual `dist/shared/` copy, which is the bug class fixed in `4cc5707`, and removes a runtime `@import` request.
- CSS is minified.
- Total `dist/` drops from 74,240 to **70,044 bytes**.
- The service worker and content script come out the same size; only mangled identifier names differ.
- One copy step remains, `content-script.css`, because the manifest references it and no TS imports it.

Why only "evaluate":
- Hashed chunk names add diff noise between releases.
- R05 proposes deleting the content script entirely (switching to `scripting`), which would change `build.ts` anyway. Do this refactor after R05's decision.

### 2.11 Test coverage gap (evaluate, 85% that it is worth doing)

`bun test --coverage` shows only `src/shared/api-client.ts`, `config.ts` and `types.ts` loaded: 533 of 2,371 `src/` lines. `popup.ts` (719), `options.ts` (291), `service-worker.ts` (283), `offscreen.ts` (183), `content-script.ts` (158), `text-cleanup.ts` and `settings-defaults.ts` are **never imported by any test**. The "content-script" and "service-worker" tests import only `../src/shared/types` **[M16]**.

So "128 pass" proves the API client and the types, not the extension. For this axis, that bounds what a green `bun test` can certify after a toolchain bump. The byte-identical build **[M5]** is the stronger parity proof. C1's happy-dom harness (`C1-extension-map.md`, [probe] method) shows popup can be driven with a mocked `chrome`. Turning that into committed tests, plus `[test] coverageThreshold` in `bunfig.toml` ([bunfig docs](https://bun.com/docs/runtime/bunfig)), is where happy-dom 20 and testing-library earn their place.

### 2.12 WXT 0.21.4 (reject for now, 78%)

**State.**
- WXT **0.21.4** (2026-08-11), still pre-1.0. 0.21.0 (2026-07-26) changed zip-template variables, made `web-ext` a peer dependency and removed the `url:` import feature ([wxt-v0.21.0 notes](https://github.com/wxt-dev/wxt/releases/tag/wxt-v0.21.0)).
- Peers: `vite ^6.3.4 || ^7 || ^8`, `web-ext >=9.2.0`, `typescript >=5.4`. Engines: `node >=22`, `bun >=1.2.0` ([npm wxt](https://registry.npmjs.org/wxt)).
- Healthy: 10.5k stars, pushed 2026-09-18, 217 open issues.
- A fresh install resolves Vite 8.3.0: 178 lock entries, 83 MB, **0 advisories** **[M6]**.
- Its comparison page calls Plasmo "in maintenance mode" and CRXJS's maintenance "uncertain" ([wxt compare](https://wxt.dev/guide/resources/compare)).

**What it would buy here:**
- A working dev loop with browser auto-reload.
- `wxt zip` / `wxt submit`.

**What it costs:**
- Moving five entrypoints into `entrypoints/` and wrapping each in `defineBackground`/`defineContentScript`, so every entry file changes.
- The manifest becomes generated from config. That matters for the permission-exact listing R07 needs.
- A 0.x framework with minor-version breaks.
- Reintroducing vite, about 5x the lock entries of the Bun-only toolchain **[M6]**.

**Deciding fact.** Publishing (goal c) does not need WXT. Its submitter `publish-browser-extension` 6.1.1 is a standalone CLI (bin `publish-extension`, Node ≥22), and `chrome-webstore-upload-cli` 4.0.1 speaks the CWS v2 API ([npm](https://registry.npmjs.org/publish-browser-extension), [npm](https://registry.npmjs.org/chrome-webstore-upload-cli); R07 compares them). The dev-loop gain alone does not pay for an L-effort restructure of a 5-entry, zero-dependency extension.

**Revisit trigger:** WXT 1.0, or the extension gaining a UI framework or a second browser target.

### 2.13 CRXJS 2.7.1 (reject, 88%)

`@crxjs/vite-plugin` **2.7.1** (2026-07-01). Peer vite `^3 … ^8` ([npm](https://registry.npmjs.org/@crxjs/vite-plugin)). The repo was pushed 2026-09-13 and has 24 open issues ([repo](https://github.com/crxjs/chrome-extension-tools)); the README carries no archive notice. It is still a vite plugin: adopting it re-adds everything #1 removes, and it has no zip or publish step (per the [wxt compare](https://wxt.dev/guide/resources/compare) table). There is no benefit over Bun.build for this project.

### 2.14 rolldown-vite 7.3.1 (reject, 95%)

It was the technical preview of Rolldown-in-Vite ([npm](https://registry.npmjs.org/rolldown-vite), last published 2026-05-07). Vite 8 ships Rolldown natively ([announcing-vite8](https://vite.dev/blog/announcing-vite8)). It is moot once vite is removed.

---

## 3. Ordered migration (each step is verified by the gate in the Verdict)

1. `bun remove vite vite-plugin-web-extension`; `git rm vite.config.ts`; delete the `dev`/`preview` scripts; delete `"vite.config.ts"` from tsconfig `include`. Gate: build output unchanged.
2. tsconfig: delete `baseUrl` and `paths`.
3. `bun add -d happy-dom@20.14.5`. Keep `tests/setup/happydom.ts` unchanged; do **not** switch to `GlobalRegistrator` **[M8]**.
4. `bun add -d @types/chrome@0.3.0` plus the two `storage.local.get<…>` generics (§2.4).
5. `bun add -d typescript@7.0.2` (or 6.0.3, see §2.5).
6. Delete `tests/setup/testing-library.ts` and its preload entry; `bun remove @testing-library/dom`.
7. `build.ts`: remove `|| true`; add `drop: ['console.log','console.info','console.debug','debugger']` to each `Bun.build` call. Gate: expect a **deliberate** byte change (console.log gone). Diff it, then smoke-load the unpacked extension.
8. Upgrade Bun to 1.4.2; `bun add -d @types/bun@1.4.2`; add `"packageManager": "bun@1.4.2"`; exact pins; `[install] minimumReleaseAge = 259200` + `exact = true` in `bunfig.toml`; regenerate `bun.lock` (v2).
9. Later, and separately: §2.10 (HTML entrypoints, after R05's content-script decision) and §2.11 (DOM tests).

Commit steps 1–6 as separate atomic commits, because each one is independently green **[M4] [M7]**.

---

## 4. Measurements (reproducible, all under `/tmp/ntts-r06/`)

The scratch copies were made with `rsync -a --exclude /dist chrome-extension/ <dir>/`. A first attempt with `--exclude dist` also stripped `node_modules/*/dist` and produced false failures; that result was discarded. Bun 1.4.2 is `/tmp/ntts-r06/bun142/bun-darwin-aarch64/bun`, from `https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-darwin-aarch64.zip`, which prints `1.4.2+744846f84`.

| ID | What | Command (abridged) | Result |
|---|---|---|---|
| M1 | Baseline gates | `bun test; tsc --noEmit; bun run build` (Bun 1.3.0, TS 5.9.3) | 128 pass / 0 fail / 322 expects; tsc exit 0; build ok, ~1.2 s, 35,691 B JS |
| M2 | vite path | `vite build; ls node_modules/{terser,lightningcss}` | exit 1, `Rollup failed to resolve import "offscreen.js"`; both packages absent |
| M3 | Baseline audit | `bun audit` | 45 vulnerabilities (2 critical, 32 high, 11 moderate), 16 packages: 10 via vpwe, 4 via vite, plus direct vite and happy-dom |
| M4 | Candidate gates | Bun 1.4.2, TS 7.0.2, @types/chrome 0.3.0, @types/bun 1.4.2, happy-dom 20.14.5 (± @testing-library/dom 10.4.2) | tsc exit 0 (after §2.4 fix); 128/0; build ok; audit "No vulnerabilities found" (36 / 51 pkgs) |
| M5 | Build parity | `shasum -a 256 dist/*/*.js` Bun 1.3.0 vs 1.4.2 | all 5 identical; full `dist/` byte sizes identical (74,240 B) |
| M6 | Alternative footprints | fresh `bun add` in empty dirs + `bun audit` | vite 8.3.0 + vpwe 4.5.1: 238 lock entries, 72 MB, **7 vulns (1 critical)**. WXT 0.21.4 + TS: 178 entries, 83 MB, 0 vulns. Bun-only candidate: 36 entries, 55 MB (26 MB is the TS 7 native binary) |
| M7 | TS × types matrix | `tsc --noEmit` | 5.9.3 / 6.0.3 / 7.0.2 × @types/chrome 0.3.0: the same 3 errors. 7.0.2 × 0.0.268 without baseUrl: exit 0. 7.0.2 with baseUrl: TS5102 + TS5090. 6.0.3 with baseUrl: TS5101. After §2.4 fix: 6.0.3 and 7.0.2 exit 0 |
| M8 | DOM env | preloads removed / GlobalRegistrator preload | no preload: 128/0. `GlobalRegistrator.register()`: live test fails (1/123) while `curl /health` returns ok |
| M9 | console stripping | count `console.*` in `dist/*/*.js`; `drop` variants | 66 today (26 log / 34 error / 6 warn). Selective drop: 0 log, 33,922 B. Full drop: 0, 31,676 B. Same on 1.3.0 |
| M10 | @types/chrome bisect | `curl unpkg.com/@types/chrome@<v>/index.d.ts \| grep 'get<T'` | `any` through 0.1.28; `unknown` from 0.1.29 |
| M11 | TS 7 packaging / editor | `ls node_modules/typescript/bin`; Open VSX + VS Marketplace API | bin = `tsc` only; `@typescript/typescript-darwin-arm64`; Open VSX: not found; Marketplace: "TypeScript 7" 0.20260708.2 |
| M12 | tsc speed | 3 warm runs each | 0.92 s / 0.91 s / 0.13 s (5.9.3 / 6.0.3 / 7.0.2) |
| M13 | Lockfile compat | Bun 1.4.2 fresh vs in-place; Bun 1.3.0 `--frozen-lockfile` | fresh → v2/config 1, and 1.3.0 "Ignoring lockfile", frozen fails. In-place install / add / lockfile-only → stays v1/config 0, and 1.3.0 installs fine |
| M14 | Bun Shell `\|\| true` | `await $\`cp /nonexistent …\` \|\| true` | throws exitCode 1 on 1.3.0 and 1.4.2 |
| M15 | HTML entrypoints | `build-html2.ts` (§2.10) | pages bundled, `@import` inlined, `dist/` 70,044 B |
| M16 | Coverage | `bun test --coverage` | only api-client.ts, config.ts, types.ts appear |

---

## 5. Sources

Registries: [typescript](https://registry.npmjs.org/typescript) · [vite](https://registry.npmjs.org/vite) · [vite-plugin-web-extension](https://registry.npmjs.org/vite-plugin-web-extension) · [@types/chrome](https://registry.npmjs.org/@types/chrome) · [happy-dom](https://registry.npmjs.org/happy-dom) · [@happy-dom/global-registrator](https://registry.npmjs.org/@happy-dom/global-registrator) · [@testing-library/dom](https://registry.npmjs.org/@testing-library/dom) · [@types/bun](https://registry.npmjs.org/@types/bun) · [bun-types](https://registry.npmjs.org/bun-types) · [wxt](https://registry.npmjs.org/wxt) · [@crxjs/vite-plugin](https://registry.npmjs.org/@crxjs/vite-plugin) · [rolldown-vite](https://registry.npmjs.org/rolldown-vite) · [@typescript/native-preview](https://registry.npmjs.org/@typescript/native-preview) · [@typescript/typescript6](https://registry.npmjs.org/@typescript/typescript6) · [chrome-types](https://registry.npmjs.org/chrome-types) · [publish-browser-extension](https://registry.npmjs.org/publish-browser-extension) · [chrome-webstore-upload-cli](https://registry.npmjs.org/chrome-webstore-upload-cli)

Bun: [releases](https://github.com/oven-sh/bun/releases) · [Bun 1.4](https://bun.com/1.4) (md: https://bun.sh/blog/bun-v1.4.md) · [v1.4.2](https://bun.sh/blog/bun-v1.4.2) · [v1.3.2](https://bun.com/blog/bun-v1.3.2) · [v1.3.10](https://bun.com/blog/bun-v1.3.10) · [DOM testing](https://bun.com/docs/test/dom) · [HTML bundling](https://bun.com/docs/bundler/html-static) · [bundler (`drop`)](https://bun.com/docs/bundler) · [shell](https://bun.com/docs/runtime/shell) · [bunfig](https://bun.com/docs/runtime/bunfig) · [setup-bun](https://github.com/oven-sh/setup-bun)

TypeScript: [TS 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) · [TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

Vite: [Vite 6](https://vite.dev/blog/announcing-vite6) · [Vite 7](https://vite.dev/blog/announcing-vite7) · [Vite 8](https://vite.dev/blog/announcing-vite8) · [migration](https://vite.dev/guide/migration) · [vite-plugin-web-extension README](https://github.com/aklinker1/vite-plugin-web-extension)

Frameworks: [WXT compare](https://wxt.dev/guide/resources/compare) · [wxt-v0.21.0](https://github.com/wxt-dev/wxt/releases/tag/wxt-v0.21.0) · [CRXJS](https://github.com/crxjs/chrome-extension-tools)

Types: DefinitelyTyped PRs [#73192](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/73192) · [#74072](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/74072) · [#74965](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/74965) · [#75475](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75475) · [Chrome `browser` namespace](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace)

Security: [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f) · [GHSA-6q6h-j7hj-3r64](https://github.com/advisories/GHSA-6q6h-j7hj-3r64) · [GHSA-w4gp-fjgq-3q4g](https://github.com/advisories/GHSA-w4gp-fjgq-3q4g) · [GHSA-96g7-g7g9-jxw8](https://github.com/advisories/GHSA-96g7-g7g9-jxw8) · [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p) · [happy-dom releases](https://github.com/capricorn86/happy-dom/releases) · [@testing-library/dom v10.4.2](https://github.com/testing-library/dom-testing-library/releases/tag/v10.4.2)

Sibling reports that agree: `R05-chrome-extension-platform.md` #8 / M7 (@types/chrome errors), `R10-red-team-upgrade-risks.md` #9 (TS baseUrl, delete vite), `C1-extension-map.md` §1 / D19 (vite broken).

---

## Adversarial verification (2026-09-23)

Verifier: an independent pass that re-fetched every primary source and re-ran each load-bearing measurement in its own scratch tree, `/tmp/ntts-r06v/`. It did not reuse the author's `/tmp/ntts-r06/` artifacts. Bun 1.4.2 was downloaded fresh from the GitHub release, and its SHA-256 (`90987a3a…d12f`) matched the release's `SHASUMS256.txt`. No tracked file was edited.

**Result: 10 of 12 claims confirmed, 1 refuted, 1 confirmed with a correction.** The refuted claim is the one the Bun upgrade rests on: **Bun 1.4.2 does not produce byte-identical bundles.** The author's measurement compared Bun 1.3.0 with itself. Everything else reproduced to the byte or the count.

### Verdicts

| # | Claim | Verdict | Primary source / reproduction |
|---|---|---|---|
| 1 | Shipping build is `tsc && bun run build.ts`; `vite build` exits 1; terser/lightningcss not installed | **Confirmed** | `package.json` scripts; `vite build` → exit 1, `Rollup failed to resolve import "options.js"`. The failing HTML entry varies by run; the author saw `offscreen.js`. `node_modules/{terser,lightningcss}` are absent. |
| 2 | Baseline audit 45 (2 critical / 32 high / 11 moderate), 16 packages, 14 via vite/vpwe; candidate audits 0 | **Confirmed** | `bun audit` and `bun audit --json`: 16 packages. Dependency paths: 10 via `vite-plugin-web-extension`, 4 via `vite`, plus direct `vite` and direct `happy-dom`. Candidate on 1.4.2: "No vulnerabilities found (checked 36 packages)". |
| 3 | vite 8.3.0 + vpwe 4.5.1 still has 7 vulns incl. critical shell-quote | **Confirmed** | Fresh install: "7 vulnerabilities (1 critical, 4 high, 2 moderate)", 238 lock entries. The path is `vpwe › web-ext-run › fx-runner › shell-quote`. [GHSA-w7jw-789q-3m8p](https://api.github.com/advisories/GHSA-w7jw-789q-3m8p): critical, CVE-2026-9277, `>=1.1.0 <=1.8.3`, fixed in 1.8.4. *Nit:* vpwe 4.5.1 lists `vite` as a regular **dependency**, not a peer (`peerDependencies: null`). |
| 4 | happy-dom 15.11.7 hit by critical GHSA-37j7 and high GHSA-6q6h / GHSA-w4gp; latest 20.14.5 | **Confirmed** | `gh api /advisories?ecosystem=npm&affects=happy-dom`. Ranges and fixes match exactly. The author was right to exclude GHSA-qpm2-6cq5-7pq5 (`>=19.0.0 <20.0.2`). Latest is 20.14.5 (2026-09-12). |
| 5 | TS latest 7.0.2 (2026-07-08), Go-native `typescript`; TS5102 on `baseUrl`; no tsserver | **Confirmed with nuance** | Registry: `latest` 7.0.2, published 2026-07-08T15:55Z. On the original tsconfig, TS 7 reproduces TS5102 + TS5090 and TS 6.0.3 reproduces TS5101. The package has no `tsserver`, **but `tsc --lsp` is a built-in language server**. It also exports `./unstable/sync` and `./unstable/async` API entry points. The blog wording is "does not ship with an API" / "does not yet expose a stable programmatic API". |
| 6 | @types/chrome 0.1.0 / 0.2.0 / 0.3.0 dates; `any`→`unknown` in 0.1.29 (PR #74072); 3 errors fixed by 2 generics | **Confirmed** | Registry `time`: 0.1.0 2025-07-11, 0.2.0 2026-06-20, 0.3.0 2026-09-15. PR merge dates via `gh api`: #73192 2025-07-11, #74072 2025-11-14, #74965 2026-06-20, #75475 2026-09-15. unpkg bisect: `get<T = {[key:string]: any}>` at 0.1.28, `unknown` at 0.1.29. The three errors reproduce at the same positions; after the two generics, TS 5.9.3, 6.0.3 and 7.0.2 all exit 0. 64 releases after the pin, last 0.0.332: confirmed. |
| 7 | **Bun 1.4.2 bundles byte-identical to 1.3.0**; candidate passes 128/128 | **Refuted** (byte identity). 128/128 confirmed. | Invoking the 1.4.2 binary directly on `build.ts`, **all 5 SHA-256s differ**: `dist/` is 74,242 B against 74,240 B, and `popup.js` is +2 B. **Cause of the false positive:** `<bun-1.4.2> run build` runs the script `tsc && bun run build.ts`, and the nested bare `bun` resolves on `PATH` to `~/.bun/bin/bun` 1.3.0. Measured: a probe script prints `1.3.0`, and the hashes equal the 1.3.0 baseline exactly. The differences are **only minifier identifier names**: after normalising 1–2-character identifiers, including those inside template literals, 0 residual diffs remain in 4 files and in `popup.js` too. The report itself cites the reason identity was impossible: 1.4 "no longer generates a bare `$` identifier", and 1.3.0's `popup.js` contains `${$[z]…}`. |
| 8 | Bun 1.4 (2026-08-20) is the Zig→Rust rewrite; new lockfiles v2; 1.3.0 ignores v2 and fails `--frozen-lockfile`; in-place 1.4.2 keeps v1 | **Confirmed** | [bun-v1.4.md](https://bun.sh/blog/bun-v1.4.md): "rewrites Bun from Zig to Rust", "fixes over 2,900 issues", ``### `bun.lock` is now `lockfileVersion: 2` {% since "1.4.0" %}``. GitHub release `bun-v1.4.0` is dated 2026-08-20T14:07Z. Reproduced: 1.3.0 on a v2 lock prints `UnknownLockfileVersion` then `warn: Ignoring lockfile` then `error: lockfile had changes, but lockfile is frozen`. An in-place 1.4.2 install keeps `lockfileVersion: 1` and adds `configVersion: 0`. |
| 9 | No test touches the DOM (128/128 with preloads removed); `GlobalRegistrator` breaks the live-helper test by replacing fetch | **Confirmed** | Empty `bunfig.toml` gives 128 pass / 0 fail. With the `GlobalRegistrator` preload: 122 pass, 1 fail, "Native TTS Helper not found on ports…", while `/health` returned `ok`. A mechanism probe showed `fetch` fails with happy-dom's own `Cross-Origin Request Blocked` from origin `about:blank`. So the fetch is happy-dom's CORS-enforcing one, bound so it still stringifies as native. |
| 10 | Only api-client.ts, config.ts and types.ts are loaded (533 of 2,371 src lines) | **Confirmed** | `bun test --coverage` lists exactly those 3 files. `wc -l`: 234 + 154 + 145 = 533, and the `src/**/*.ts` total is 2,371. |
| 11 | vpwe README "will soon be deprecated in favor of WXT"; WXT 0.21.4 node >=22, peers vite ^6.3.4‖^7‖^8; publish-browser-extension 6.1.1 standalone | **Confirmed** | README (via `gh api …/readme`) matches verbatim. WXT 0.21.4 `engines {node:">=22", bun:">=1.2.0"}`, peers `vite ^6.3.4 ‖ ^7.0.0 ‖ ^8.0.0-0`. publish-browser-extension 6.1.1 (2026-08-10), bin `publish-extension`, node >=22. Fresh WXT install reproduces 178 entries, 83 MB, 0 vulns, vite 8.3.0. |
| 12 | `\|\| true` does not suppress failure; `drop` removes the 26 `console.log` calls, 35,691 → 33,922 B | **Confirmed with a correction** | `await $\`cp /nonexistent …\` \|\| true` throws exitCode 1 on both 1.3.0 and 1.4.2. The [shell docs](https://bun.com/docs/runtime/shell.md) say "By default, a non-zero exit code throws". Counts reproduce: 26 log, 34 error, 6 warn. **Correction:** 33,922 B and 31,676 B are the **Bun 1.4.2** figures. Bun 1.3.0 gives **33,920 B and 31,674 B**, so "same on 1.3.0" is off by the same 2 bytes as #7. |

**Smaller factual errors found along the way (none change a recommendation):**
- **rolldown-vite 7.3.1 was last published 2026-01-09.** 2026-05-07 is the registry `time.modified`, i.e. when the deprecation notice ("Use this package to migrate from Vite 7 to Vite 8") was added. The report says last published 2026-05-07.
- **WXT 0.21.0 on npm is dated 2026-02-22.** The GitHub release `wxt-v0.21.0` is 2026-07-26, which matches npm **0.21.1**'s publish time.
- **The WXT compare page never uses the word "uncertain" for CRXJS.** It marks CRXJS "Maintained 🟡" with a footnote to discussion #974. The "maintenance mode" footnote is Plasmo's.
- **`bun test --parallel`, `--isolate` and `--changed` are tagged `since "1.3.13"`**, improved in 1.4.0, so they are not "new in 1.4". The 1.3.14 fallback therefore has them too.

### Challenges to recommendations with conviction ≥ 80

| Rec (author's conviction) | What would make it wrong for this project | Verifier's conviction |
|---|---|---|
| **#6 Bun 1.4.2 upgrade-now (80)** | **Its parity proof is void (#7 above).** §2.11 argued that the byte-identical build is "the stronger parity proof" because tests load only `src/shared`. With identity gone, no evidence remains that the five shipped bundles behave the same under a runtime rewrite that is five weeks old. Structural equivalence modulo renaming (measured here) is reassuring, but it is not a behavioural test. **Gate the bump on a real smoke test:** load the unpacked extension, use context-menu "Read aloud" and popup speak, and change the voice. The v2 lockfile is also one-way for any machine on 1.3.x. The `packageManager` field enforces nothing locally, because every script calls bare `bun` and inherits whatever is first on `PATH`. That is the trap that produced #7. | **70** until the smoke test passes, then 85 |
| **#5 TypeScript 7.0.2 (80)** | **typescript-eslint 8.70.1 (2026-09-21) declares peer `typescript >=4.8.4 <6.1.0`.** If the publishing-quality program adds type-aware linting, TS 7 forces a side-by-side `@typescript/typescript6` alias or a switch to oxlint 1.85.0 + `oxlint-tsgolint`. DefinitelyTyped's dist-tags stop at `ts6.0` for both `@types/chrome` and `@types/bun`, so DT does not advertise TS 7 as tested. It passes here, but untested upstream. The gain is about 0.8 s on a sub-second check. TS 6.0.3 gives the same 0 errors with none of these edges. | **65** for 7.0.2; **90** for 6.0.3 as the default |
| **#4 @types/chrome 0.3.0 (90)** | (a) **0.3.0 declares a global `browser: typeof chrome` unconditionally.** `public/manifest.json` has **no `minimum_chrome_version`**, and `browser` exists natively only from Chrome 148 ([Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace)). A future `browser.*` call would type-check and then throw `ReferenceError` on Chrome ≤147. Either set `minimum_chrome_version` deliberately or pin **0.2.9** (2026-09-05), the last release without the alias. (b) `get<T>()` is an **unchecked assertion**: it swaps 0.1.29's deliberate `unknown` for a cast. A small runtime guard on the stored config is the sound form. | **85** |
| **#3 happy-dom upgrade-now (93)** | The advisory fix is certain; the choice between *upgrade* and *remove* is not. Today happy-dom is dead weight (#9 above), and removing it clears the same advisories with one fewer dependency. "Upgrade" is right only if #11 is accepted. Migration order was also verified: happy-dom 20.14.5 is green on **Bun 1.3.0** too (128/128), so step 3 is safe before step 8. | **97** clear the advisory; **60** upgrade rather than remove |
| **#1 delete vite (97)** | The deletion is right, but the migration leaves docs lying. `chrome-extension/README.md:265` tells users to run `bun run dev`, which becomes a missing-script error. Lines :282 ("Bundler: Vite 5.3.0"), :370 ("Optimized with Vite + Terser", never true) and :442 are also stale. `chrome-extension/PRIVACY.md:161` says "Frontend: TypeScript, Vite, Bun", and a privacy page may be linked from the CWS listing. Nothing replaces the dev loop. Fold the doc edits into the same commit. | **97** (with doc edits) |
| **#2 tsconfig `baseUrl` (97)** | Nothing found. Zero `@/` imports in `src/` or `tests/`; TS5101, TS5102 and TS5090 reproduce. | **97** |
| **#7 build.ts fixes (80)** | Bun's bundler docs: `drop` "removes the arguments to dropped calls, even if they have side effects". All 26 current `console.log` argument lists are side-effect-free (checked), but that is a standing hazard. `service-worker.ts:241` is a `console.log` inside a `catch` and is the only trace of an offscreen `createDocument` failure; make it `console.warn` before dropping. Keep this commit separate from the Bun bump so there is only one cause of byte change per commit (the author's order already does this). | **85** |
| **#11 DOM tests + `coverageThreshold` (85)** | **A threshold cannot see never-loaded files.** Bun reports coverage only for files a test imports, and the [bunfig](https://bun.com/docs/runtime/bunfig.md) and [coverage](https://bun.com/docs/test/code-coverage.md) docs offer no include-all option. Measured: `coverageThreshold = 0.8` **passes today** while 77.5% of `src/` lines are never loaded, and `0.9` fails only because of `config.ts`. The threshold is meaningful only alongside a test that imports every entry module. | **85** for DOM tests; the threshold alone adds nothing |
| **#13 reject CRXJS (88)** | Holds. The repo is active (pushed 2026-09-13, 24 open issues, not archived), but it is still a vite plugin, and the WXT compare table shows it has no ZIP or publishing step. | **88** |
| **#14 reject rolldown-vite (95)** | Holds. It is deprecated on npm pointing at Vite 8 (date correction above). | **97** |

### Items the report missed

1. **Measurement-method defect.** Any cross-version Bun measurement run through a `package.json` script silently uses the `PATH` Bun for nested `bun …` calls. Re-measure M4, M5 and M9 by invoking the candidate binary directly, or prepend its directory to `PATH`.
2. **Doc fallout of deleting vite:** `chrome-extension/README.md` (:265, :282, :370, :442) and `PRIVACY.md:161`. These overlap goals (b) and (c).
3. **No `minimum_chrome_version` in the manifest.** This interacts with the `@types/chrome` 0.3.0 `browser` global and belongs with R05/R07.
4. **No linter or formatter at all.** The choice is constrained by TS 7: typescript-eslint excludes it (peer `<6.1.0`), so the TS-7-compatible options are **Biome 2.5.14** (2026-09-16, no TS API dependency) or **oxlint 1.85.0** (2026-09-21) + `oxlint-tsgolint` (peer `>=7.0.2001`).
5. **No CWS packaging step in the toolchain.** `build.ts` produces `dist/` but no zip, and nothing asserts that `package.json` `version` equals `manifest.json` `version` (both are 1.4.0 today, by hand). A `bun run package` that zips `dist/` and fails on a version mismatch is toolchain work that R07's submitter depends on.
6. **No CI.** `.github/` does not exist, so the report's verification gate has no enforcement point, and `setup-bun` reading `packageManager` stays hypothetical.
7. **No behavioural smoke test for the five bundles.** This is the only real parity check for a Bun bump or a `drop` change. C1's happy-dom harness plus an agent-browser `--extension` load would provide it.

Reproduction commands and logs: `/tmp/ntts-r06v/` (`base/`, `b13/` vs `b14/` for the hash comparison, `b14s/` for the nested-`bun` probe, `cand/`, `cand13/` for steps 1–6 on Bun 1.3.0, `m9/`, `m13v1/`, `m13v2/`, `greg/`, `nodom/`, `fp-vite8/`, `fp-wxt/`).
