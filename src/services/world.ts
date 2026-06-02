// src/services/world.ts - World data loading

import type { WorldMeta } from '../types/world';

export interface LoadedWorld {
  name: string;
  content: string;
  isBuiltIn: boolean;
  type: 'single' | 'directory';
}

const WORLD_CACHE = new Map<
  string,
  { content: string; timestamp: number }
>();

const DEFAULT_TTL = 300 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 20;

// Known built-in worlds (fallback for web mode where directory listing is unavailable)
const KNOWN_BUILTIN_WORLDS: WorldMeta[] = [
  {
    name: '武侠江湖 · 天武风云录',
    filename: 'wuxia_jianghu.md',
    type: 'single',
    description: '刀光剑影的武侠世界，六大势力割据争雄',
    isBuiltIn: true,
    fileSize: 0,
    fileCount: 1,
    lastModified: '',
  },
  {
    name: '奇幻世界',
    filename: 'world',
    type: 'directory',
    description: '魔法与冒险的奇幻大陆，多种族共存',
    isBuiltIn: true,
    fileSize: 0,
    fileCount: 0,
    lastModified: '',
  },
];

/**
 * Load a built-in world from the public directory
 */
export async function loadBuiltInWorld(
  filename: string,
  type: 'single' | 'directory'
): Promise<string> {
  const cacheKey = `builtin:${filename}`;
  const cached = WORLD_CACHE.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < DEFAULT_TTL) {
    return cached.content;
  }

  let content: string;

  if (type === 'single') {
    const response = await fetch(`/worlds/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load world: ${filename}`);
    }
    content = await response.text();
  } else {
    // Directory-style: load README.md as the main content
    const response = await fetch(`/worlds/${filename}/README.md`);
    if (!response.ok) {
      throw new Error(`Failed to load world README: ${filename}`);
    }
    content = await response.text();
  }

  // Enforce character limit
  const maxChars = 50000;
  if (content.length > maxChars) {
    content = content.slice(0, maxChars);
  }

  // Cache management
  if (WORLD_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = WORLD_CACHE.keys().next().value;
    if (oldestKey) WORLD_CACHE.delete(oldestKey);
  }

  WORLD_CACHE.set(cacheKey, { content, timestamp: Date.now() });

  return content;
}

/**
 * Load a user world via Tauri IPC
 */
export async function loadUserWorld(filename: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const content = (await invoke('load_world', { filename })) as string;
  return content;
}

/**
 * List all available worlds (built-in + user)
 */
export async function listWorlds(): Promise<WorldMeta[]> {
  const worlds: WorldMeta[] = [...KNOWN_BUILTIN_WORLDS];

  // Try to discover additional built-in worlds via directory listing (works in Tauri build)
  try {
    const builtinResponse = await fetch('/worlds/');
    if (builtinResponse.ok) {
      const text = await builtinResponse.text();
      // Only parse if it looks like a real directory listing (not SPA index.html)
      if (text.includes('Index of') || text.includes('Directory listing')) {
        const mdMatch = text.match(/href="([^"]+\.md)"/g);
        if (mdMatch) {
          for (const match of mdMatch) {
            const name = match.replace('href="', '').replace('"', '');
            if (!worlds.some((w) => w.filename === name)) {
              worlds.push({
                name: name.replace('.md', '').replace(/_/g, ' '),
                filename: name,
                type: 'single',
                description: '',
                isBuiltIn: true,
                fileSize: 0,
                fileCount: 1,
                lastModified: '',
              });
            }
          }
        }

        const dirMatch = text.match(/href="([^"]+)\/"/g);
        if (dirMatch) {
          for (const match of dirMatch) {
            const dirName = match.replace('href="', '').replace('"', '');
            if (!worlds.some((w) => w.filename === dirName)) {
              worlds.push({
                name: dirName.replace(/_/g, ' '),
                filename: dirName,
                type: 'directory',
                description: '',
                isBuiltIn: true,
                fileSize: 0,
                fileCount: 0,
                lastModified: '',
              });
            }
          }
        }
      }
    }
  } catch {
    // Use fallback list
  }

  // Load user worlds via Tauri or localStorage
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const userWorlds = (await invoke('list_worlds')) as WorldMeta[];
      worlds.push(...userWorlds);
    } else {
      // Web mode: load from localStorage
      const userWorldNames = JSON.parse(localStorage.getItem('bio_user_worlds') || '[]');
      for (const filename of userWorldNames) {
        const content = localStorage.getItem(`bio_world_${filename}`);
        if (content) {
          worlds.push({
            name: filename.replace('.md', '').replace(/_/g, ' '),
            filename,
            type: 'single',
            description: extractWorldDescription(content),
            isBuiltIn: false,
            fileSize: content.length,
            fileCount: 1,
            lastModified: '',
          });
        }
      }
    }
  } catch {
    // Skip user worlds on error
  }

  return worlds;
}

/**
 * Extract description from world content (first paragraph after title)
 */
export function extractWorldDescription(content: string): string {
  const lines = content.split('\n').slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.slice(0, 200);
    }
  }
  return '';
}

/**
 * Get world context for LLM prompts
 * Priority: README > WORLD_OVERVIEW > GEOGRAPHY > ...
 */
export async function getWorldContext(
  worldName: string,
  isBuiltIn: boolean,
  type: 'single' | 'directory'
): Promise<string> {
  if (isBuiltIn) {
    return await loadBuiltInWorld(worldName, type);
  } else if (isTauri()) {
    return await loadUserWorld(worldName);
  } else {
    // Web mode user world
    const content = localStorage.getItem(`bio_world_${worldName}`);
    if (content) return content;
    throw new Error(`World not found: ${worldName}`);
  }
}

/**
 * Check if running in Tauri mode
 */
export function isTauri(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}
