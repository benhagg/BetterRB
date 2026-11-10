import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Playbook Data Validation', () => {
  it('validates dplays.json has valid zone and man plays with reusable defensiveLine config', () => {
    const dplaysRaw = fs.readFileSync(path.resolve(__dirname, '../../public/shared/dplays.json'), 'utf8');
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

  it('keeps defensive formation offsets at least 3 yards for LBs/DBs and 0.5 yards for DLs/LBs', () => {
    const dplaysRaw = fs.readFileSync(path.resolve(__dirname, '../../public/shared/dplays.json'), 'utf8');
    const dplays = JSON.parse(dplaysRaw);
    const sharedLineSlots = Object.values(dplays.defensiveLines || {}).flat();
    const playSlots = (dplays.plays || []).flatMap(play => [
      ...(Array.isArray(play.formation?.defensiveLine) ? play.formation.defensiveLine : []),
      ...(play.formation?.defenders || [])
    ]);
    const slots = [...sharedLineSlots, ...playSlots];
    const checkedSlots = slots.filter(slot => ['DL', 'LB', 'DB'].includes(String(slot.position || '').toUpperCase()));

    expect(checkedSlots.length).toBeGreaterThan(0);
    checkedSlots.forEach(slot => {
      const position = String(slot.position).toUpperCase();
      // `across`, `offset`, and `coverageOffset` are all measured in yards.
      const downfieldOffset = Number.isFinite(slot.coverageOffset)
        ? slot.coverageOffset
        : (Number.isFinite(slot.offset) ? slot.offset : 0);
      const acrossYards = Number.isFinite(slot.across) ? slot.across : 0;
      const alignmentDistance = Math.hypot(downfieldOffset, acrossYards);
      const label = `${slot.position} (${slot.manTarget || slot.zone || slot.role || 'formation slot'})`;

      if (position === 'LB' || position === 'DB') {
        expect(alignmentDistance, label).toBeGreaterThanOrEqual(3);
      }
      if (position === 'DL' || position === 'LB') {
        expect(alignmentDistance, label).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  it('validates oplays.json formations have 11 players total', () => {
    const oplaysRaw = fs.readFileSync(path.resolve(__dirname, '../../public/shared/oplays.json'), 'utf8');
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

  it('validates dplays.json zone and man formation slots line up on the correct side of the field', () => {
    const dplaysRaw = fs.readFileSync(path.resolve(__dirname, '../../public/shared/dplays.json'), 'utf8');
    const dplays = JSON.parse(dplaysRaw);

    const cover2 = dplays.plays.find(p => p.id === 'base-cover-2');
    expect(cover2).toBeDefined();

    cover2.formation.defenders.forEach(slot => {
      if (!slot.zone) return;
      if (slot.zone.includes('top')) {
        expect(slot.across, `${slot.zone} must have positive across (top of field)`).toBeGreaterThan(0);
      } else if (slot.zone.includes('bottom')) {
        expect(slot.across, `${slot.zone} must have negative across (bottom of field)`).toBeLessThan(0);
      }
    });

    const cover1 = dplays.plays.find(p => p.id === 'base-cover-1-man');
    expect(cover1).toBeDefined();
    const wr1Slot = cover1.formation.defenders.find(s => s.manTarget === 'WR1');
    const wr3Slot = cover1.formation.defenders.find(s => s.manTarget === 'WR3');
    if (wr1Slot && Number.isFinite(wr1Slot.across)) {
      expect(wr1Slot.across, 'WR1 DB must be positioned on top side').toBeGreaterThan(0);
    }
    if (wr3Slot && Number.isFinite(wr3Slot.across)) {
      expect(wr3Slot.across, 'WR3 DB must be positioned on bottom side').toBeLessThan(0);
    }
  });
});

