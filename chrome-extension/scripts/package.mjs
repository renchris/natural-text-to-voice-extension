#!/usr/bin/env node
/**
 * Package the extension for the Chrome Web Store.
 *
 * Usage (from chrome-extension/):
 *   bun run package              build dist, check it, zip it, re-read the zip
 *   bun run package --no-build   package the existing dist as it is
 *
 * Output: release/natural-tts-<version>.zip (gitignored), with manifest.json at
 * the ZIP ROOT, which is what the store's upload expects. Prints the size and
 * sha256, and a final line "OK <path> <bytes> <sha256>".
 *
 * Fails closed (exit 1) unless every check passes:
 *   - dist/manifest.json version == package.json version
 *   - the manifest has no "key" (the store assigns the ID; a key is dev-only)
 *   - name <= 75 and description <= 132 characters (the store's limits)
 *   - every file the manifest names exists in dist
 *   - no source maps, sourceMappingURL comments, tests, e2e artifacts, logs,
 *     .DS_Store or other dotfiles in dist
 *   - after writing: the zip's entries are exactly dist's files, manifest.json
 *     is at the root, and every entry inflates to its recorded CRC-32 and size
 *
 * The zip is deterministic: entries are sorted, every timestamp is fixed
 * (SOURCE_DATE_EPOCH if set, else 1980-01-01), and no extra fields are
 * written. The same dist therefore always gives the same sha256, so a release
 * zip can be rebuilt and compared byte for byte.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const RELEASE_DIR = join(ROOT, 'release');

const NAME_MAX = 75;
const DESCRIPTION_MAX = 132;

/** Paths (relative to dist, '/'-separated) that must never ship. */
const FORBIDDEN = [
  { re: /\.map$/i, why: 'source map' },
  { re: /(^|\/)\.[^/]+$/, why: 'dotfile (.DS_Store, .gitkeep, ...)' },
  { re: /(^|\/)(tests?|__tests__|e2e|integration|coverage|node_modules)(\/|$)/i, why: 'test or dependency directory' },
  { re: /\.(test|spec)\.[cm]?[jt]sx?$/i, why: 'test file' },
  { re: /\.(ts|tsx|mts|cts)$/i, why: 'TypeScript source' },
  { re: /\.(log|zip|tmp|temp|swp)$/i, why: 'log, archive or temporary file' },
  { re: /(^|\/)Thumbs\.db$/i, why: 'OS file' },
];

const failures = [];
const fail = (message) => failures.push(message);
const bail = () => {
  if (failures.length === 0) return;
  for (const f of failures) console.error(`package: FAIL: ${f}`);
  process.exit(1);
};

// ------------------------------------------------------------------ build
const noBuild = process.argv.includes('--no-build');
const unknown = process.argv.slice(2).filter(a => a !== '--no-build');
if (unknown.length > 0) {
  console.error(`package: unknown argument(s): ${unknown.join(' ')}\nusage: bun run package [--no-build]`);
  process.exit(64);
}
if (!noBuild) {
  console.log('==> bun run build');
  execFileSync('bun', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
}
if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error(`package: FAIL: ${relative(ROOT, DIST)}/manifest.json is missing (run without --no-build)`);
  process.exit(1);
}

// ------------------------------------------------------------------ manifest checks
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const version = manifest.version;

if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version)) fail(`manifest version is not 1-4 dotted integers: ${JSON.stringify(version)}`);
if (version !== pkg.version) fail(`manifest version ${version} != package.json version ${pkg.version}`);
if ('key' in manifest) fail('manifest.json has a "key" (dev-only; the store assigns the item ID). Remove it before packaging');
if (typeof manifest.name !== 'string' || manifest.name.length > NAME_MAX) fail(`name is ${manifest.name?.length} characters (max ${NAME_MAX})`);
if (typeof manifest.description !== 'string' || manifest.description.length > DESCRIPTION_MAX) {
  fail(`description is ${manifest.description?.length} characters (max ${DESCRIPTION_MAX})`);
}
if (manifest.manifest_version !== 3) fail(`manifest_version is ${manifest.manifest_version}, want 3`);

// Every file the manifest points at must be in dist.
const referenced = new Set();
const addRef = (p) => { if (typeof p === 'string' && p) referenced.add(p.replace(/^\//, '')); };
for (const p of Object.values(manifest.icons ?? {})) addRef(p);
for (const p of Object.values(manifest.action?.default_icon ?? {})) addRef(p);
addRef(manifest.action?.default_popup);
addRef(manifest.options_page);
addRef(manifest.options_ui?.page);
addRef(manifest.background?.service_worker);
for (const p of referenced) {
  if (!existsSync(join(DIST, p))) fail(`the manifest names ${p}, which is not in dist`);
}

// ------------------------------------------------------------------ file list checks
/** Every regular file under dir, as sorted '/'-separated paths relative to dist. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs));
    else if (entry.isFile()) out.push(relative(DIST, abs).split(sep).join('/'));
    else fail(`not a regular file or directory: ${relative(ROOT, abs)}`);
  }
  return out;
}
const files = listFiles(DIST).sort();
for (const f of files) {
  for (const { re, why } of FORBIDDEN) if (re.test(f)) fail(`${f} must not ship (${why})`);
  if (/\.(m?js|css|html)$/i.test(f) && /sourceMappingURL=/.test(readFileSync(join(DIST, f), 'utf8'))) {
    fail(`${f} carries a sourceMappingURL comment`);
  }
}
bail();

// ------------------------------------------------------------------ zip writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time for the fixed timestamp (local-time-free: fields from UTC). */
function dosDateTime() {
  const epoch = Number.parseInt(process.env.SOURCE_DATE_EPOCH ?? '', 10);
  const d = Number.isFinite(epoch) && epoch >= 315532800 ? new Date(epoch * 1000) : new Date(Date.UTC(1980, 0, 1));
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

function buildZip(names) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const data = readFileSync(join(DIST, name));
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const flags = 0x0800; // names are UTF-8

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // external attrs: -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  if (offset > 0xffffffff || names.length > 0xffff) throw new Error('zip64 would be needed; the extension is far smaller than that');
  return Buffer.concat([...locals, centralBuf, end]);
}

// ------------------------------------------------------------------ zip reader (the re-read check)
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central header at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`${name}: unsupported method ${method}`);
    entries.push({ name, crcOk: crc32(data) === crc, sizeOk: data.length === usize, data });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}

// ------------------------------------------------------------------ write + verify
mkdirSync(RELEASE_DIR, { recursive: true });
const zipPath = join(RELEASE_DIR, `natural-tts-${version}.zip`);
const zip = buildZip(files);
writeFileSync(zipPath, zip);

const onDisk = readFileSync(zipPath);
const entries = readZip(onDisk);
const names = entries.map(e => e.name);
if (JSON.stringify(names) !== JSON.stringify(files)) {
  fail(`zip entries differ from dist:\n  zip:  ${names.join(', ')}\n  dist: ${files.join(', ')}`);
}
if (!names.includes('manifest.json')) fail('manifest.json is not at the zip root');
for (const e of entries) {
  if (!e.crcOk) fail(`${e.name}: CRC-32 mismatch after re-read`);
  if (!e.sizeOk) fail(`${e.name}: size mismatch after re-read`);
  if (e.name.endsWith('/')) fail(`${e.name}: directory entry (only files are written)`);
  if (!e.data.equals(readFileSync(join(DIST, e.name)))) fail(`${e.name}: bytes differ from dist`);
  for (const { re, why } of FORBIDDEN) if (re.test(e.name)) fail(`${e.name} is in the zip (${why})`);
}
const zippedManifest = JSON.parse(entries.find(e => e.name === 'manifest.json')?.data.toString('utf8') ?? '{}');
if (zippedManifest.version !== pkg.version) fail(`zipped manifest version ${zippedManifest.version} != ${pkg.version}`);
if ('key' in zippedManifest) fail('zipped manifest has a "key"');
bail();

const sha256 = createHash('sha256').update(onDisk).digest('hex');
const unpacked = files.reduce((n, f) => n + statSync(join(DIST, f)).size, 0);
const rel = relative(ROOT, zipPath);
console.log(`\n${manifest.name} ${version}`);
console.log(`  entries   ${entries.length} files, manifest.json at the zip root`);
console.log(`  unpacked  ${unpacked.toLocaleString('en-US')} bytes`);
console.log(`  zip       ${rel}  ${onDisk.length.toLocaleString('en-US')} bytes (${(onDisk.length / 1024).toFixed(1)} KiB)`);
console.log(`  sha256    ${sha256}`);
console.log(`OK ${rel} ${onDisk.length} ${sha256}`);
