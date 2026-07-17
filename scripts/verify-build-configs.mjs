import { readFileSync } from 'node:fs';

const stable = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const experimental = JSON.parse(
  readFileSync('src-tauri/tauri.experimental.conf.json', 'utf8')
);
const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
const cargoManifest = readFileSync('src-tauri/Cargo.toml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const rustEntrypoint = readFileSync('src-tauri/src/main.rs', 'utf8');
const rustLlmTransport = readFileSync('src-tauri/src/commands/llm.rs', 'utf8');
const rustKeyScope = readFileSync('src-tauri/src/commands/key_scope.rs', 'utf8');
const runtimeLlmGateway = readFileSync('src/infrastructure/defaults.ts', 'utf8');
const desktopCapability = JSON.parse(
  readFileSync('src-tauri/capabilities/default.json', 'utf8')
);

const stableCsp = stable.app?.security?.csp ?? '';
const experimentalCsp = experimental.app?.security?.csp ?? '';
const experimentalEnv = readFileSync('.env.experimental', 'utf8');
const readme = readFileSync('README.md', 'utf8');

readFileSync('LICENSE', 'utf8');

const expectedTargets = ['deb', 'rpm', 'dmg', 'app', 'nsis'];
if (JSON.stringify(stable.bundle?.targets) !== JSON.stringify(expectedTargets)) {
  throw new Error(`Stable bundle targets must be ${expectedTargets.join(', ')}`);
}
if (!readme.includes('Windows NSIS、macOS app/dmg、Linux deb/rpm')) {
  throw new Error('README desktop artifact documentation is out of sync');
}

function cspSources(csp, directive) {
  const entry = csp.split(';')
    .map((part) => part.trim())
    .find((part) => part === directive || part.startsWith(`${directive} `));
  return entry ? entry.split(/\s+/).slice(1) : [];
}

const stableConnectSources = cspSources(stableCsp, 'connect-src');
if (JSON.stringify(stableConnectSources) !== JSON.stringify(["'self'"])) {
  throw new Error('Stable WebView CSP must route all remote LLM traffic through Rust');
}

const requiredExperimentalConnectSources = [
  "'self'",
  'https:',
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
];
const experimentalConnectSources = cspSources(experimentalCsp, 'connect-src');
if (experimentalConnectSources.includes('http:')) {
  throw new Error('Experimental CSP must not allow arbitrary HTTP endpoints');
}
if (!requiredExperimentalConnectSources.every(
  (source) => experimentalConnectSources.includes(source)
)) {
  throw new Error('Experimental CSP must allow HTTPS and explicit loopback HTTP endpoints');
}
if (experimental.build?.beforeBuildCommand !== 'npm run build:experimental'
  || !experimentalEnv.includes('VITE_ENABLE_EXPERIMENTAL_PROVIDERS=true')) {
  throw new Error('Experimental build must enable the frontend provider flag');
}

const cargoVersion = cargoManifest.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m
)?.[1];
if (!cargoVersion
  || packageManifest.version !== stable.version
  || packageManifest.version !== cargoVersion) {
  throw new Error('package.json, Tauri, and Cargo versions must match');
}
if (!releaseWorkflow.includes('WINDOWS_TIMESTAMP_URL')
  || !releaseWorkflow.includes("digestAlgorithm = 'sha256'")
  || !releaseWorkflow.includes('timestampUrl = $env:TIMESTAMP_URL')) {
  throw new Error('Stable Windows signing must require SHA-256 and a timestamp URL');
}
if (!releaseWorkflow.includes('skip_desktop_build: true')
  || !ciWorkflow.includes("if: ${{ inputs.skip_desktop_build != true }}")
  || ciWorkflow.includes("github.event_name != 'workflow_call'")) {
  throw new Error('Release quality reuse must skip the duplicate desktop build matrix');
}
if (!ciWorkflow.includes("VITE_ENABLE_EXPERIMENTAL_PROVIDERS: 'true'\n        run: npm run build:experimental")
  || !ciWorkflow.includes('cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features local-model -- -D warnings')
  || !ciWorkflow.includes('cargo test --manifest-path src-tauri/Cargo.toml --features local-model')) {
  throw new Error('CI must compile the experimental frontend and check/test the local-model feature');
}
if (!releaseWorkflow.includes('target_commitish: ${{ github.sha }}')) {
  throw new Error('Manual releases must create new tags at the selected workflow commit');
}
if (!releaseWorkflow.includes('fetch-depth: 0')
  || !releaseWorkflow.includes('GITHUB_SHA: ${{ github.sha }}')) {
  throw new Error('Release metadata must receive the selected commit and complete tag history');
}
const releaseMetadataScript = readFileSync('scripts/release-metadata.sh', 'utf8');
if (!releaseMetadataScript.includes('git show-ref --verify --quiet "refs/tags/${tag}"')
  || !releaseMetadataScript.includes('git rev-parse "${tag}^{commit}"')
  || !releaseMetadataScript.includes('resolved_tag_commit" != "$resolved_workflow_commit')) {
  throw new Error('Manual releases must reject an existing tag that targets another commit');
}
if (!rustEntrypoint.includes('.plugin(tauri_plugin_fs::init())')
  || !rustEntrypoint.includes('.plugin(tauri_plugin_dialog::init())')) {
  throw new Error('Desktop JSON import/export plugins must be registered');
}
if (!rustEntrypoint.includes('commands::llm::stream_llm')
  || !rustEntrypoint.includes('commands::llm::cancel_llm_request')) {
  throw new Error('Stable desktop must register the Rust LLM transport and cancellation commands');
}
if (!rustLlmTransport.includes('.redirect(Policy::none())')
  || !rustLlmTransport.includes('send_request(builder, &mut cancel_rx)')
  || !rustLlmTransport.includes('decode_utf8_chunk')) {
  throw new Error('Rust LLM transport must disable redirects and preserve cancellation/UTF-8 boundaries');
}
if (!rustKeyScope.includes('api-key:{provider}')
  || !rustKeyScope.includes('api-key:custom:{encoded}')
  || !rustKeyScope.includes('#[cfg(feature = "local-model")]')) {
  throw new Error('Desktop API keys must be provider/custom-endpoint scoped');
}
if (!runtimeLlmGateway.includes("config.provider === 'custom'")) {
  throw new Error('Experimental custom providers must use the Rust transport in Tauri');
}
const requiredDesktopPermissions = [
  'dialog:allow-open',
  'dialog:allow-save',
  'fs:allow-read-text-file',
  'fs:allow-write-text-file',
];
if (!requiredDesktopPermissions.every(
  (permission) => desktopCapability.permissions?.includes(permission)
)) {
  throw new Error('Desktop import/export capability is incomplete');
}

console.log('Stable and experimental build policies are valid');
