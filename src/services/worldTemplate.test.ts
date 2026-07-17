import { describe, expect, it } from 'vitest';
import { validateWorldDraft, WORLD_TEMPLATE } from './worldTemplate';

describe('world templates', () => {
  it('accepts the built-in authoring template', () => {
    expect(validateWorldDraft('新世界', WORLD_TEMPLATE).errors).toEqual([]);
  });

  it('reports unsafe names and missing Markdown structure', () => {
    const result = validateWorldDraft('../secret', 'too short');
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
