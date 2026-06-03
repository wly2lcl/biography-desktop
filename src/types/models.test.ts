import { describe, it, expect } from 'vitest';
import type { EndReason, GameSession } from '@/types/models';

describe('EndReason type', () => {
  it('should accept all valid end reasons', () => {
    const reasons: EndReason[] = ['player_ended', 'story_ending', 'max_choices', 'max_history'];
    expect(reasons.length).toBe(4);
  });
});

describe('GameSession.endReason', () => {
  const createSession = (): GameSession => ({
    sessionId: 'test-1',
    world: 'test_world',
    gameMode: 'basic',
    player: {
      name: 'TestPlayer',
      currentScenario: '',
      history: [],
      attributes: {},
      inventory: [],
      summary: '',
      qaHistory: [],
      createdAt: new Date().toISOString(),
    },
    scenarios: [],
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  it('should allow endReason to be undefined', () => {
    const session = createSession();
    expect(session.endReason).toBeUndefined();
  });

  it('should accept player_ended', () => {
    const session = createSession();
    session.endReason = 'player_ended';
    expect(session.endReason).toBe('player_ended');
  });

  it('should accept story_ending', () => {
    const session = createSession();
    session.endReason = 'story_ending';
    expect(session.endReason).toBe('story_ending');
  });

  it('should accept max_choices', () => {
    const session = createSession();
    session.endReason = 'max_choices';
    expect(session.endReason).toBe('max_choices');
  });

  it('should accept max_history', () => {
    const session = createSession();
    session.endReason = 'max_history';
    expect(session.endReason).toBe('max_history');
  });
});

/** Helper: the isComplete logic used in generateBiography */
function isComplete(endReason?: EndReason): boolean {
  return endReason === 'story_ending'
    || endReason === 'max_choices'
    || endReason === 'max_history'
    || !endReason;
}

describe('isComplete logic (from generateBiography)', () => {
  it('player_ended should be incomplete', () => {
    expect(isComplete('player_ended')).toBe(false);
  });

  it('story_ending should be complete', () => {
    expect(isComplete('story_ending')).toBe(true);
  });

  it('max_choices should be complete', () => {
    expect(isComplete('max_choices')).toBe(true);
  });

  it('max_history should be complete', () => {
    expect(isComplete('max_history')).toBe(true);
  });

  it('no endReason (legacy session) should be complete for backward compat', () => {
    expect(isComplete(undefined)).toBe(true);
  });
});
