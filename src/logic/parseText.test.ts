import { describe, expect, it } from 'vitest';
import { NONMAGICAL } from '../models';
import { parseCreatureText, parseSpellText } from './parseText';

const GOBLIN_2014 = `Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (−1) 14 (+2) 10 (+0) 10 (+0) 8 (−1) 8 (−1)
Skills Stealth +6
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

const GOBLIN_2024 = `Goblin Warrior
Small Fey (Goblinoid), Chaotic Neutral
AC 15     Initiative +6 (16)
HP 10 (3d6)
Speed 30 ft.
MOD SAVE MOD SAVE MOD SAVE
Str 8 −1 −1 Dex 15 +2 +2 Con 10 +0 +0
Int 10 +0 +0 Wis 8 −1 −1 Cha 8 −1 −1
Skills Stealth +6
Gear Leather Armor, Scimitar, Shield, Shortbow
Senses Darkvision 60 ft.; Passive Perception 9
Languages Common, Goblin
CR 1/4 (XP 50; PB +2)
Actions
Scimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.
Bonus Actions
Nimble Escape. The goblin takes the Disengage or Hide action.`;

const DRAGON = `Young Red Dragon
Large dragon, chaotic evil
Armor Class 18 (natural armor)
Hit Points 178 (17d10 + 85)
Speed 40 ft., climb 40 ft., fly 80 ft.
STR
23 (+6)
DEX
10 (+0)
CON
21 (+5)
INT
14 (+2)
WIS
11 (+0)
CHA
19 (+4)
Saving Throws Dex +4, Con +9, Wis +4, Cha +8
Damage Immunities fire
Senses blindsight 30 ft., darkvision 120 ft., passive Perception 18
Languages Common, Draconic
Challenge 10 (5,900 XP)
Actions
Multiattack. The dragon makes three attacks: one with its bite and two with its claws.
Fire Breath (Recharge 5–6). The dragon exhales fire in a 30-foot cone. Each creature in that area
must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save.
Legendary Actions
The dragon can take 3 legendary actions, choosing from the options below.
Tail Attack. The dragon makes a tail attack.
Wing Attack (Costs 2 Actions). The dragon beats its wings.`;

describe('parseCreatureText', () => {
  it('reads a 2014 stat block', () => {
    const { value: t, warnings } = parseCreatureText(GOBLIN_2014);
    expect(warnings).toEqual([]);
    expect(t.name).toBe('Goblin');
    expect(t).toMatchObject({ size: 'Small', type: 'humanoid (goblinoid)', alignment: 'neutral evil' });
    expect(t).toMatchObject({ ac: 15, acNote: 'leather armor, shield', maxHP: 7, hitDice: { count: 2, dieType: 'd6', bonus: 0 } });
    expect(t.abilities).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
    expect(t).toMatchObject({ skills: 'Stealth +6', languages: 'Common, Goblin', cr: '1/4', xp: 50 });
    expect(t.senses).toBe('darkvision 60 ft., passive Perception 9');
    expect(t.traits.map((x) => x.name)).toEqual(['Nimble Escape']);
    expect(t.actions.map((a) => [a.name, a.kind])).toEqual([
      ['Scimitar', 'action'],
      ['Shortbow', 'action'],
    ]);
    expect(t.actions[0]!.description).toMatch(/^Melee Weapon Attack: \+4 to hit/);
  });

  it('reads a 2024 stat block, with saves from the ability table and gear in notes', () => {
    const { value: t, warnings } = parseCreatureText(GOBLIN_2024);
    expect(warnings).toEqual([]);
    expect(t).toMatchObject({ name: 'Goblin Warrior', size: 'Small', type: 'fey (goblinoid)', alignment: 'chaotic neutral' });
    expect(t).toMatchObject({ ac: 15, acNote: '', maxHP: 10, hitDice: { count: 3, dieType: 'd6', bonus: 0 } });
    expect(t.abilities).toEqual({ str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 });
    expect(t.saves).toBe('');
    expect(t).toMatchObject({ cr: '1/4', xp: 50 });
    expect(t.notes).toContain('Gear: Leather Armor, Scimitar, Shield, Shortbow');
    expect(t.actions.map((a) => [a.name, a.kind])).toEqual([
      ['Scimitar', 'action'],
      ['Nimble Escape', 'bonus'],
    ]);
  });

  it('picks proficient saves out of a 2024 table', () => {
    const { value: t } = parseCreatureText('Knight\nMedium humanoid, any alignment\nStr 16 +3 +3 Dex 11 +0 +0 Con 14 +2 +4 Int 11 +0 +0 Wis 11 +0 +2 Cha 15 +2 +2');
    expect(t.saves).toBe('Con +4, Wis +2');
  });

  it('reads one-per-line ability scores, recharge, wrapped lines and legendary actions', () => {
    const { value: t, warnings } = parseCreatureText(DRAGON);
    expect(warnings).toEqual([]);
    expect(t.abilities).toEqual({ str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 });
    expect(t).toMatchObject({ maxHP: 178, hitDice: { count: 17, dieType: 'd10', bonus: 85 }, cr: '10', xp: 5900 });
    expect(t.saves).toBe('Dex +4, Con +9, Wis +4, Cha +8');
    expect(t.damageImmunities).toEqual(['fire']);
    const breath = t.actions.find((a) => a.name === 'Fire Breath')!;
    expect(breath.recharge).toEqual({ mode: 'threshold', minRoll: 5 });
    expect(breath.description).toBe(
      'The dragon exhales fire in a 30-foot cone. Each creature in that area must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save.',
    );
    expect(t.actions.filter((a) => a.kind === 'legendary').map((a) => a.name)).toEqual(['Tail Attack', 'Wing Attack (Costs 2 Actions)']);
    expect(t.notes).toBe('Legendary actions: The dragon can take 3 legendary actions, choosing from the options below.');
  });

  it('reads defenses: nonmagical weapons, 2024 mixed immunities, and keeps what it cannot track', () => {
    const { value: t, warnings } = parseCreatureText(`Wight
Medium undead, neutral evil
Damage Resistances necrotic; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered
Damage Vulnerabilities radiant
Immunities Poison; Exhaustion, Poisoned
Condition Immunities charmed`);
    expect(t.damageResistances).toEqual(['necrotic', NONMAGICAL]);
    expect(t.damageVulnerabilities).toEqual(['radiant']);
    expect(t.damageImmunities).toEqual(['poison']);
    expect(t.conditionImmunities.sort()).toEqual(['charmed', 'exhaustion', 'poisoned']);
    expect(t.notes).toBe('');
    expect(warnings).toContain('No Armor Class found.');

    const odd = parseCreatureText('Golem\nLarge construct, unaligned\nDamage Resistances damage from spells');
    expect(odd.value.notes).toContain('Damage resistances: damage from spells');
    expect(odd.warnings.join(' ')).toMatch(/full text is in Notes/);
  });

  it('labels on their own line, values on the next', () => {
    const { value: t } = parseCreatureText('Bandit\nMedium humanoid (any race), any non-lawful alignment\nArmor Class\n12 (leather armor)\nHit Points\n11 (2d8 + 2)\nChallenge\n1/8 (25 XP)');
    expect(t).toMatchObject({ ac: 12, acNote: 'leather armor', maxHP: 11, hitDice: { count: 2, dieType: 'd8', bonus: 2 }, cr: '1/8', xp: 25 });
  });

  it('keeps spellcasting lists inside the trait', () => {
    const { value: t } = parseCreatureText(`Mage
Medium humanoid, any alignment
Spellcasting. The mage is a 9th-level spellcaster. It has the following wizard spells prepared:
Cantrips (at will): fire bolt, light, mage hand
1st level (4 slots): detect magic, magic missile
At Will: Detect Magic`);
    expect(t.traits).toHaveLength(1);
    expect(t.traits[0]!.description).toBe(
      'The mage is a 9th-level spellcaster. It has the following wizard spells prepared:\nCantrips (at will): fire bolt, light, mage hand\n1st level (4 slots): detect magic, magic missile\nAt Will: Detect Magic',
    );
  });

  it('warns about what is missing and never throws on junk', () => {
    expect(parseCreatureText('').warnings).toEqual(['Nothing to read: the text is empty.']);
    const { value, warnings } = parseCreatureText('just some words\nand more words');
    expect(value.name).toBe('just some words');
    expect(warnings).toContain('No ability scores found; they were left at 10.');
    expect(warnings.join(' ')).toMatch(/1 line wasn't recognised/);
    expect(value.notes).toBe('and more words');
  });

  it('guesses hit dice from HP and size when only HP is printed', () => {
    const { value: t } = parseCreatureText('Brute\nLarge giant, chaotic evil\nHit Points 59\nCON 16 (+3)');
    expect(t.maxHP).toBe(59);
    expect(t.hitDice.dieType).toBe('d10');
    expect(t.hitDice.count).toBe(7);
  });
});

describe('parseSpellText', () => {
  it('reads a 2014 spell', () => {
    const { value: s, warnings } = parseSpellText(`Fireball
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous
A bright streak flashes from your pointing finger to a point you choose within range.
Each creature in a 20-foot-radius sphere must make a Dexterity saving throw.
At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6.`);
    expect(warnings).toEqual([]);
    expect(s).toMatchObject({
      name: 'Fireball',
      level: 3,
      school: 'evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M (a tiny ball of bat guano and sulfur)',
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
    });
    expect(s.description).toBe(
      'A bright streak flashes from your pointing finger to a point you choose within range.\n\nEach creature in a 20-foot-radius sphere must make a Dexterity saving throw.',
    );
    expect(s.higherLevels).toBe('When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6.');
  });

  it('reads a 2024 spell: level line, ritual casting time, concentration, cantrip upgrade', () => {
    const detect = parseSpellText(`Detect Magic
Level 1 Divination (Bard, Cleric, Druid)
Casting Time: Action or Ritual
Range: Self
Components: V, S
Duration: Concentration, up to 10 minutes
For the duration, you sense the presence of magical effects within 30 feet of yourself.`).value;
    expect(detect).toMatchObject({ level: 1, school: 'divination', castingTime: 'Action', ritual: true, concentration: true });

    const bolt = parseSpellText(`Fire Bolt
Evocation Cantrip (Sorcerer, Wizard)
Casting Time: Action
Range: 120 feet
Components: V, S
Duration: Instantaneous
You hurl a mote of fire.
Cantrip Upgrade. The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).`).value;
    expect(bolt).toMatchObject({ level: 0, school: 'evocation', description: 'You hurl a mote of fire.' });
    expect(bolt.higherLevels).toMatch(/^The damage increases by 1d10/);
  });

  it('reads labels on their own lines and ritual subtitles', () => {
    const { value: s } = parseSpellText(`Alarm
1st-level abjuration (ritual)
Casting Time
1 minute
Range
30 feet
Components
V, S, M (a tiny bell)
Duration
8 hours
You set an alarm against unwanted intrusion.`);
    expect(s).toMatchObject({ level: 1, school: 'abjuration', ritual: true, castingTime: '1 minute', range: '30 feet', duration: '8 hours' });
    expect(s.description).toBe('You set an alarm against unwanted intrusion.');
  });

  it('warns about missing parts and fills defaults', () => {
    const { value, warnings } = parseSpellText('Mystery\nSomething happens.');
    expect(value).toMatchObject({ name: 'Mystery', level: 1, castingTime: '1 action', duration: 'Instantaneous', description: 'Something happens.' });
    expect(warnings).toContain('No level and school found; set to 1st-level evocation.');
    expect(warnings).toContain('No range found.');
  });
});
