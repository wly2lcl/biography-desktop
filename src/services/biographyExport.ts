import type { GameSession } from '../types/models';
import type { AppSettings } from '../types/settings';

export interface BiographyExportMetadata {
  player: string;
  world: string;
  worldSource: GameSession['worldRef']['source'];
  worldType: GameSession['worldRef']['type'];
  provider: string;
  model: string;
  generatedAt: string | null;
  exportedAt: string;
}

export function biographyMetadata(
  session: GameSession,
  settings: AppSettings,
  exportedAt = new Date().toISOString()
): BiographyExportMetadata {
  return {
    player: session.player.name,
    world: session.worldRef.name,
    worldSource: session.worldRef.source,
    worldType: session.worldRef.type,
    provider: session.biographyGeneration?.provider ?? settings.llmProvider,
    model: session.biographyGeneration?.model ?? settings.model,
    generatedAt: session.biographyGeneration?.generatedAt ?? null,
    exportedAt,
  };
}

export function buildBiographyText(
  session: GameSession,
  content: string,
  settings: AppSettings,
  format: 'txt' | 'md',
  exportedAt?: string
): string {
  const metadata = biographyMetadata(session, settings, exportedAt);
  const title = `【${session.player.name}传奇】`;
  if (format === 'md') {
    return [
      '---',
      `player: ${JSON.stringify(metadata.player)}`,
      `world: ${JSON.stringify(metadata.world)}`,
      `worldSource: ${metadata.worldSource}`,
      `worldType: ${metadata.worldType}`,
      `provider: ${metadata.provider}`,
      `model: ${JSON.stringify(metadata.model)}`,
      `generatedAt: ${metadata.generatedAt ?? 'null'}`,
      `exportedAt: ${metadata.exportedAt}`,
      '---',
      '',
      `# ${title}`,
      '',
      content,
      '',
    ].join('\n');
  }
  return [
    title,
    `角色：${metadata.player}`,
    `世界：${metadata.world}（${metadata.worldSource}/${metadata.worldType}）`,
    `生成配置：${metadata.provider} / ${metadata.model}`,
    `生成时间：${metadata.generatedAt ?? '未知'}`,
    `导出时间：${metadata.exportedAt}`,
    '',
    content,
  ].join('\n');
}

export function downloadBiography(
  session: GameSession,
  content: string,
  settings: AppSettings,
  format: 'txt' | 'md'
): void {
  const document = buildBiographyText(session, content, settings, format);
  const blob = new Blob([document], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${session.player.name}传记.${format}`;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function printBiographyAsPdf(
  session: GameSession,
  content: string,
  settings: AppSettings
): boolean {
  const printable = window.open('', '_blank');
  if (!printable) return false;
  printable.opener = null;
  const metadata = biographyMetadata(session, settings);
  printable.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <title>${escapeHtml(session.player.name)}传记</title>
    <style>body{font-family:serif;max-width:760px;margin:48px auto;padding:0 24px;color:#111;line-height:1.9}
    h1{text-align:center}.meta{font:12px sans-serif;color:#666;border-bottom:1px solid #ddd;padding-bottom:16px;margin-bottom:24px}
    article{white-space:pre-wrap}@page{margin:18mm}</style></head><body>
    <h1>【${escapeHtml(session.player.name)}传奇】</h1>
    <div class="meta">世界：${escapeHtml(metadata.world)} · ${escapeHtml(metadata.provider)} / ${escapeHtml(metadata.model)} · 生成：${escapeHtml(metadata.generatedAt ?? '未知')} · 导出：${escapeHtml(metadata.exportedAt)}</div>
    <article>${escapeHtml(content)}</article></body></html>`);
  printable.document.close();
  printable.focus();
  printable.print();
  return true;
}
