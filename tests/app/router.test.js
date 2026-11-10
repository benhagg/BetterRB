import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../src/app/router.js';

describe('router', () => {
  it('maps direct roster player URLs to the player screen', () => {
    expect(parseRoute('/roster/20-wr-3')).toEqual({ screen: 'player', playerId: '20-wr-3' });
  });

  it('maps supported root screens and falls back to home', () => {
    expect(parseRoute('/roster')).toEqual({ screen: 'roster', playerId: null });
    expect(parseRoute('/schedule/')).toEqual({ screen: 'schedule', playerId: null });
    expect(parseRoute('/missing')).toEqual({ screen: 'home', playerId: null });
  });
});
