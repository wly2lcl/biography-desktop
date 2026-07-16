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
const desktopCapability = JSON.parse(
  readFileSync('src-tauri/capabilities/default.json', 'utf8')
);

const stableCsp = stable.app?.security?.csp ?? '';
const experimentalCsp = experimental.app?.security?.csp ?? '';
const experimentalEnv = readFileSync('.env.experimental', 'utf8');

if (stableCsp.includes('localhost') || stableCsp.includes('127.0.0.1')) {
  throw new Error('Stable CSP must not expose local model endpoints');
}
if (!experimentalCsp.includes('http://localhost:*')
  || !experimentalCsp.includes('http://127.0.0.1:*')) {
  throw new Error('Experimental CSP must allow both local model endpoint forms');
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
