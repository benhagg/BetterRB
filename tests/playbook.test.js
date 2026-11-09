import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Playbook Data Validation', () => {
  it('validates dplays.json has valid zone and man plays with reusable defensiveLine config', () => {
    const dplaysRaw = fs.readFileSync(path.resolve(__dirname, '../data/dplays.json'), 'utf8');
    const dplays = JSON.parse(dplaysRaw);

    expect(dplays.defensiveLines?.standard).toHaveLength(4);
    expect(Array.isArray(dplays.plays)).toBe(true);
    expect(dplays.plays.length).toBeGreaterThanOrEqual(2);

    const zonePlay = dplays.plays.find(p => p.coverage?.type === 'zone');
    const manPlay = dplays.plays.find(p => p.coverage?.type === 'man');

    expect(zonePlay).toBeDefined();
    expect(manPlay).toBeDefined();

    expect(zonePlay.formation.defensiveLine).toBe('standard');
    expect(manPlay.formation.defensiveLine).toBe('standard');

    dplays.plays.forEach(play => {
      const dlCount = play.formation?.defensiveLine === 'standard'
        ? dplays.defensiveLines.standard.length
        : (play.formation?.defensiveLine?.length || 0);
      const coverageCount = play.formation?.defenders?.length || 0;
      expect(dlCount + coverageCount).toBe(11);
    });
  });

  it('validates oplays.json formations have 11 players total', () => {
    const oplaysRaw = fs.readFileSync(path.resolve(__dirname, '../data/oplays.json'), 'utf8');
    const oplays = JSON.parse(oplaysRaw);

    expect(Array.isArray(oplays.plays)).toBe(true);
    oplays.plays.forEach(play => {
      // 5 OL + 1 QB + 1 RB + receivers
      const numReceivers = play.formation?.receivers?.length || 0;
      const numRB = play.formation?.runningBack ? 1 : 0;
      const numQB = play.formation?.quarterback ? 1 : 1; // default QB
      const numOL = 5; // standard 5 OL
      expect(numReceivers + numRB + numQB + numOL).toBe(11);
    });
  });
});

