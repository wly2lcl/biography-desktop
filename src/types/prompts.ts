export type PromptName =
  | 'introduction'
  | 'scenario'
  | 'biography'
  | 'qa'
  | 'system_generation'
  | 'summarization';

export interface PromptContext {
  world_context?: string;
  system_context?: string;
  player_name?: string;
  summary?: string;
  latest_scene?: string;
  previous_choice?: string;
  player_history?: string;
  inventory?: string;
  attributes?: string;
  qa_history_context?: string;
  question?: string;
  existing_summary?: string;
  new_events?: string;
}

export interface PromptTemplate {
  name: PromptName;
  template: string;
  format(context: PromptContext): string;
}
