const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const coreRoot = path.resolve(workspaceRoot, "packages/core");

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo so changes in packages/core hot-reload
config.watchFolders = [workspaceRoot];

// 2. Resolve from app's node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Map @bhaav/core and all its sub-paths that the app uses.
//    Metro doesn't support the package.json "exports" field, so we map each
//    sub-path manually to the shim files in packages/core/.
const nodeStub = path.resolve(projectRoot, "src/db/stubs/node-stub.js");
config.resolver.extraNodeModules = {
  "@bhaav/core":           path.resolve(coreRoot, "index.js"),
  "@bhaav/core/ids":       path.resolve(coreRoot, "ids.js"),
  "@bhaav/core/constants": path.resolve(coreRoot, "src/constants.js"),
  "@bhaav/core/pricing":   path.resolve(coreRoot, "src/pricing.js"),
  "@bhaav/core/geo":       path.resolve(coreRoot, "src/geo.js"),
  "@bhaav/core/ranking":   path.resolve(coreRoot, "src/ranking.js"),
  "@bhaav/core/validate":  path.resolve(coreRoot, "src/validate.js"),
};

// 3b. Intercept Node built-ins BEFORE Metro raises its "cannot import Node
//     standard library" error. extraNodeModules is checked too late for
//     built-ins; resolveRequest runs first.
//     Prisma's generated client requires 'path' and 'fs' at module load time
//     but never calls them in the React Native context (db=null, API-only mode).
const NODE_BUILTINS = new Set([
  "path", "fs", "os", "crypto", "stream", "url", "util",
  "events", "assert", "buffer", "http", "https", "net", "tls",
  "zlib", "child_process", "cluster", "dgram", "dns", "domain",
  "module", "readline", "repl", "vm", "worker_threads",
]);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stub any "node:*" import unconditionally (covers node:os, node:tty, etc.
  // regardless of whether the bare name is in NODE_BUILTINS), then fall back
  // to the explicit set for bare names like "path" or "fs".
  const bare = moduleName.startsWith("node:") ? moduleName.slice(5) : moduleName;
  if (moduleName.startsWith("node:") || NODE_BUILTINS.has(bare)) {
    return { filePath: nodeStub, type: "sourceFile" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 4. Support .cjs and .mjs extensions
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs", "mjs"];

module.exports = config;

