import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = 'dist/assets';
const javascript = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, content: readFileSync(join(assetsDir, name), 'utf8') }));

const forbiddenMarkers = [
  'BIOGRAPHY_EXPERIMENTAL_ADAPTER_MODULE',
  'BIOGRAPHY_EXPERIMENTAL_LOCAL_MODEL_UI',
  'get_server_status',
  'list_available_models',
  'list_downloaded_models',
  'start_server',
  'stop_server',
  'download_model',
  'cancel_download',
  'delete_model',
  'ensure_binary',
  'model_download_progress',
  'model_download_complete',
];
const forbiddenMatch = javascript.flatMap(({ name, content }) =>
  forbiddenMarkers
    .filter((marker) => content.includes(marker))
    .map((marker) => ({ name, marker }))
)[0];

if (forbiddenMatch) {
  throw new Error(
    `Stable bundle contains experimental marker ${forbiddenMatch.marker}: ${forbiddenMatch.name}`
  );
}

console.log('Stable frontend bundle excludes experimental provider and local-model modules');
