// scripts/build-bundle.ts
// Usage: bun scripts/build-bundle.ts [--watch] [--minify] [--no-sourcemap]
//
// Production build: bun scripts/build-bundle.ts --minify
// Dev build:        bun scripts/build-bundle.ts
// Watch mode:       bun scripts/build-bundle.ts --watch

import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { chmodSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

// Bun: import.meta.dir — Node 21+: import.meta.dirname — fallback
const __dir: string =
  (import.meta as any).dir ??
  (import.meta as any).dirname ??
  dirname(fileURLToPath(import.meta.url))

const ROOT = resolve(__dir, '..')
const watch = process.argv.includes('--watch')
const minify = process.argv.includes('--minify')
const noSourcemap = process.argv.includes('--no-sourcemap')

// Read version from package.json for MACRO injection
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '0.0.0-dev'

// ── Plugin: resolve bare 'src/' imports (tsconfig baseUrl: ".") ──
// The codebase uses `import ... from 'src/foo/bar.js'` which relies on
// TypeScript's baseUrl resolution. This plugin maps those to real TS files.
const srcResolverPlugin: esbuild.Plugin = {
  name: 'src-resolver',
  setup(build) {
    build.onResolve({ filter: /^src\// }, (args) => {
      const basePath = resolve(ROOT, args.path)

      // Already exists as-is
      if (existsSync(basePath)) {
        return { path: basePath }
      }

      // Strip .js/.jsx and try TypeScript extensions
      const withoutExt = basePath.replace(/\.(js|jsx)$/, '')
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const candidate = withoutExt + ext
        if (existsSync(candidate)) {
          return { path: candidate }
        }
      }

      // Try as directory with index file
      const dirPath = basePath.replace(/\.(js|jsx)$/, '')
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const candidate = resolve(dirPath, 'index' + ext)
        if (existsSync(candidate)) {
          return { path: candidate }
        }
      }

      // Let esbuild handle it (will error if truly missing)
      return undefined
    })
  },
}

// ── Plugin: resolve missing feature-gated modules to empty stubs ──
// The codebase uses `feature('X') ? require('./missing-module.js') : null`
// Bun's bundler evaluates feature() at compile time for DCE, but esbuild
// cannot. This plugin catches unresolvable relative .js imports and returns
// an empty module so the build succeeds. At runtime, the feature gate
// ensures these paths are never actually reached.
const STUB_NS = 'stub-missing'
const missingModuleStubPlugin: esbuild.Plugin = {
  name: 'missing-module-stub',
  setup(build) {
    // Track failed resolutions from relative paths inside src/
    build.onResolve({ filter: /\.js$/ }, (args) => {
      // Only handle relative imports (feature-gated requires)
      if (!args.path.startsWith('.') && !args.path.startsWith('src/')) return undefined
      // Skip if the importer is outside src/
      if (!args.importer || !args.importer.includes('/src/')) return undefined

      const dir = dirname(args.importer)
      const basePath = resolve(dir, args.path)
      const withoutExt = basePath.replace(/\.(js|jsx)$/, '')

      // Check if file exists with any extension
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        if (existsSync(withoutExt + ext)) return undefined
      }
      // Check index files in directory
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        if (existsSync(resolve(withoutExt, 'index' + ext))) return undefined
      }

      // File truly missing — return empty stub
      return { path: args.path, namespace: STUB_NS }
    })

    // Also stub missing .md and .txt files (skill docs, prompts)
    build.onResolve({ filter: /\.(md|txt)$/ }, (args) => {
      if (!args.path.startsWith('.')) return undefined
      if (!args.importer || !args.importer.includes('/src/')) return undefined

      const dir = dirname(args.importer)
      const fullPath = resolve(dir, args.path)
      if (existsSync(fullPath)) return undefined

      return { path: args.path, namespace: STUB_NS }
    })

    // Load stub content — Proxy-based default that handles any named import
    build.onLoad({ filter: /.*/, namespace: STUB_NS }, () => ({
      contents: `
        const handler = { get: (_, prop) => prop === '__esModule' ? true : () => {} };
        const stub = new Proxy({}, handler);
        export default stub;
        // Named exports for common patterns
        export const plot = () => '';
        export const ColorDiff = null;
        export const ColorFile = null;
        export const getSyntaxTheme = () => ({});
        export const isConnectorTextBlock = () => false;
        export const WORKFLOW_TOOL_NAME = 'WorkflowTool';
        export const DEFAULT_UPLOAD_CONCURRENCY = 5;
        export const FILE_COUNT_LIMIT = 100;
        export const OUTPUTS_SUBDIR = 'outputs';
      `,
      loader: 'js',
    }))
  },
}

// ── Plugin: stub missing npm packages (feature-gated dynamic imports) ──
// Packages like @anthropic-ai/bedrock-sdk, @aws-sdk/*, google-auth-library
// are dynamically imported behind provider checks. They are not installed
// in the dev build but should not block bundling.
const missingNpmStubPlugin: esbuild.Plugin = {
  name: 'missing-npm-stub',
  setup(build) {
    // Known optional packages that are dynamically imported
    const optionalPackages = new Set([
      '@anthropic-ai/bedrock-sdk',
      '@anthropic-ai/vertex-sdk',
      '@anthropic-ai/foundry-sdk',
      '@anthropic-ai/mcpb',
      '@aws-sdk/client-bedrock',
      '@aws-sdk/client-bedrock-runtime',
      '@aws-sdk/client-sts',
      '@aws-sdk/credential-provider-node',
      '@azure/identity',
      '@smithy/core',
      '@smithy/node-http-handler',
      'google-auth-library',
      // Optional native addons (platform-specific, may not be available)
      'audio-capture-napi',
      'color-diff-napi',
      'modifiers-napi',
      // Optional runtime deps (feature-gated or unused in external builds)
      'asciichart',
      'turndown',
      'xss',
      'fflate',
      // OpenTelemetry exporters (optional, for production telemetry)
      '@opentelemetry/exporter-logs-otlp-grpc',
      '@opentelemetry/exporter-logs-otlp-http',
      '@opentelemetry/exporter-logs-otlp-proto',
      '@opentelemetry/exporter-metrics-otlp-grpc',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-proto',
      '@opentelemetry/exporter-prometheus',
      '@opentelemetry/exporter-trace-otlp-grpc',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-trace-otlp-proto',
    ])

    build.onResolve({ filter: /.*/ }, (args) => {
      // Check exact match or package scope match
      if (optionalPackages.has(args.path)) {
        return { path: args.path, namespace: STUB_NS }
      }
      // Check if parent package is optional (e.g. react-reconciler/constants.js)
      const pkgName = args.path.startsWith('@')
        ? args.path.split('/').slice(0, 2).join('/')
        : args.path.split('/')[0]
      if (optionalPackages.has(pkgName) && !args.path.startsWith('.')) {
        return { path: args.path, namespace: STUB_NS }
      }
      return undefined
    })
  },
}

const buildOptions: esbuild.BuildOptions = {
  entryPoints: [resolve(ROOT, 'src/entrypoints/cli.tsx')],
  bundle: true,
  platform: 'node',
  target: ['node20', 'es2022'],
  format: 'cjs',
  outdir: resolve(ROOT, 'dist'),
  outExtension: { '.js': '.cjs' },

  // Single-file output — no code splitting for CLI tools
  splitting: false,

  plugins: [srcResolverPlugin, missingModuleStubPlugin, missingNpmStubPlugin],

  // Use tsconfig for baseUrl / paths resolution (complements plugin above)
  tsconfig: resolve(ROOT, 'tsconfig.json'),

  // Alias bun:bundle to our runtime shim
  alias: {
    'bun:bundle': resolve(ROOT, 'src/shims/bun-bundle.ts'),
  },

  // Don't bundle node built-ins or problematic native packages
  external: [
    // Node built-ins (with and without node: prefix)
    'fs', 'path', 'os', 'crypto', 'child_process', 'http', 'https',
    'net', 'tls', 'url', 'util', 'stream', 'events', 'buffer',
    'querystring', 'readline', 'zlib', 'assert', 'tty', 'worker_threads',
    'perf_hooks', 'async_hooks', 'dns', 'dgram', 'cluster',
    'string_decoder', 'module', 'vm', 'constants', 'domain',
    'console', 'process', 'v8', 'inspector',
    'node:*',
    // Also handle bare names without node: prefix for CJS compat in ESM bundle
    'fs/promises', 'path/posix', 'path/win32', 'stream/promises',
    // Native addons that can't be bundled
    'fsevents',
    'sharp',
    'image-processor-napi',
    // Anthropic SDK (uses node-fetch CJS which breaks in ESM bundle)
    '@anthropic-ai/sdk',
    '@anthropic-ai/sdk/*',
    // Anthropic-internal packages (stub modules in node_modules/)
    '@anthropic-ai/sandbox-runtime',
    '@anthropic-ai/claude-agent-sdk',
    '@ant/computer-use-mcp',
    '@ant/computer-use-mcp/*',
    '@ant/computer-use-input',
    '@ant/claude-for-chrome-mcp',
    '@ant/computer-use-swift',
  ],

  jsx: 'automatic',

  // Source maps for production debugging (external .map files)
  sourcemap: noSourcemap ? false : 'external',

  // Minification for production
  minify,

  // Tree shaking (on by default, explicit for clarity)
  treeShaking: true,

  // Define replacements — inline constants at build time
  // MACRO.* — originally inlined by Bun's bundler at compile time
  // process.env.USER_TYPE — eliminates 'ant' (Anthropic-internal) code branches
  // import.meta.url — CJS compat (esbuild sets import.meta to {} in CJS)
  define: {
    'MACRO.VERSION': JSON.stringify(version),
    'MACRO.PACKAGE_URL': JSON.stringify('amecode'),
    'MACRO.ISSUES_EXPLAINER': JSON.stringify(
      'report issues at https://github.com/anthropics/claude-code/issues'
    ),
    'process.env.USER_TYPE': '"external"',
    'process.env.NODE_ENV': minify ? '"production"' : '"development"',
  },

  // Banner: shebang for direct CLI execution
  banner: {
    js: '#!/usr/bin/env node\n',
  },

  // Handle the .js → .ts resolution that the codebase uses
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],

  logLevel: 'info',

  // Metafile for bundle analysis
  metafile: true,
}

// ── Post-build: fix import.meta in CJS output ──
// esbuild CJS sets `var import_meta = {}` which breaks import.meta.url.
// We patch the output to provide correct values using __filename.
async function patchImportMeta(outPath: string) {
  const { readFileSync, writeFileSync } = await import('fs')
  let code = readFileSync(outPath, 'utf-8')

  // Replace the empty import_meta objects with proper CJS equivalents
  // esbuild CJS generates patterns like:
  //   import_meta = {};          (lazy init, no var)
  //   var import_meta = {};      (top-level)
  //   var import_meta2 = {};     (numbered variants)
  code = code.replace(
    /((?:var\s+)?import_meta\d*)\s*=\s*\{\}\s*;/g,
    (match, varExpr) => {
      return `${varExpr} = { url: require("url").pathToFileURL(__filename).href, dirname: __dirname, dir: __dirname, filename: __filename };`
    }
  )

  writeFileSync(outPath, code)
}

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions)
    await ctx.watch()
    console.log('Watching for changes...')
  } else {
    const startTime = Date.now()
    const result = await esbuild.build(buildOptions)

    if (result.errors.length > 0) {
      console.error('Build failed')
      process.exit(1)
    }

    // Make the output executable and patch import.meta for CJS
    const outPath = resolve(ROOT, 'dist/cli.cjs')
    await patchImportMeta(outPath)
    try {
      chmodSync(outPath, 0o755)
    } catch {
      // chmod may fail on some platforms, non-fatal
    }

    const elapsed = Date.now() - startTime

    // Print bundle size info
    if (result.metafile) {
      const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false })
      const outFiles = Object.entries(result.metafile.outputs)
      for (const [file, info] of outFiles) {
        if (file.endsWith('.cjs')) {
          const sizeMB = ((info as { bytes: number }).bytes / 1024 / 1024).toFixed(2)
          console.log(`\n  ${file}: ${sizeMB} MB`)
        }
      }
      console.log(`\nBuild complete in ${elapsed}ms → dist/`)

      // Write metafile for further analysis
      const { writeFileSync } = await import('fs')
      writeFileSync(
        resolve(ROOT, 'dist/meta.json'),
        JSON.stringify(result.metafile),
      )
      console.log('  Metafile written to dist/meta.json')
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
