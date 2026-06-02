// src/services/promptOverride.ts - File system prompt override

import { prompts } from './prompts';

type PromptName = 'introduction' | 'scenario' | 'biography' | 'qa' | 'systemGeneration' | 'summarization';

const OVERRIDE_DIR = '/prompts/'; // relative to app data dir in Tauri mode

export async function loadPromptOverride(name: PromptName): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = `${OVERRIDE_DIR}${name}.md`;
    const content = await invoke('read_file', { path }) as string;
    return content;
  } catch {
    // No override or not in Tauri mode
    return null;
  }
}

export async function savePromptOverride(name: PromptName, content: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = `${OVERRIDE_DIR}${name}.md`;
    await invoke('write_file', { path, content });
  } catch {
    console.warn('[PromptOverride] Failed to save override:', name);
  }
}

// Enhanced prompt manager that checks for overrides
export async function getPrompt(name: PromptName): Promise<string> {
  const override = await loadPromptOverride(name);
  if (override) return override;

  const methodMap: Record<PromptName, () => string> = {
    introduction: () => prompts.introductionPrompt(),
    scenario: () => prompts.scenarioPrompt(),
    biography: () => prompts.biographyPrompt(),
    qa: () => prompts.qaPrompt(),
    systemGeneration: () => prompts.systemGenerationPrompt(),
    summarization: () => prompts.summarizationPrompt(),
  };

  return methodMap[name]();
}