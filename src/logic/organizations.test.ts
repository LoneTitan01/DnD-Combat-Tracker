import { describe, expect, it } from 'vitest';
import { splitMentions } from './mentions';
import { blankOrganization, filterOrganizations, findOrganizationByName, membersOf, organizationsOf } from './organizations';

const harpers = { ...blankOrganization('c', 'The Harpers'), id: 'h', description: 'Spies for good' };
const zhents = { ...blankOrganization('c', 'Zhentarim'), id: 'z', description: 'The Black Network' };
const orgs = [zhents, harpers];
const npcs = [
  { id: 's', name: 'Sister Garaele', organizationIds: ['h'] },
  { id: 'a', name: 'Aubrey', organizationIds: ['h', 'z', 'gone'] },
  { id: 't', name: 'Toblen' },
];

describe('membership', () => {
  it('lists an organization’s members by name', () => {
    expect(membersOf(npcs, 'h').map((n) => n.id)).toEqual(['a', 's']);
    expect(membersOf(npcs, 'nobody')).toEqual([]);
  });
  it('lists an NPC’s organizations by name, skipping deleted ones', () => {
    expect(organizationsOf(orgs, npcs[1]!).map((o) => o.id)).toEqual(['h', 'z']);
    expect(organizationsOf(orgs, npcs[2]!)).toEqual([]);
  });
});

describe('findOrganizationByName / filterOrganizations', () => {
  it('matches names ignoring case and spaces', () => {
    expect(findOrganizationByName(orgs, ' zhentarim ')?.id).toBe('z');
    expect(findOrganizationByName(orgs, ' ')).toBeUndefined();
  });
  it('searches name, description and member names', () => {
    expect(filterOrganizations(orgs, 'black net', npcs).map((o) => o.id)).toEqual(['z']);
    expect(filterOrganizations(orgs, 'garaele', npcs).map((o) => o.id)).toEqual(['h']);
    expect(filterOrganizations(orgs, 'aubrey', npcs).map((o) => o.id)).toEqual(['z', 'h']);
    expect(filterOrganizations(orgs, '', npcs)).toHaveLength(2);
  });
});

describe('splitMentions', () => {
  it('marks whole-word mentions in any case, longest name first', () => {
    const items = [{ name: 'Harpers' }, { name: 'The Harpers' }];
    expect(splitMentions('An agent of the harpers, not the Harpersons.', items)).toEqual([
      'An agent of ',
      { text: 'the harpers', item: items[1] },
      ', not the Harpersons.',
    ]);
  });
  it('handles names with regex characters, and blank text or names', () => {
    const odd = [{ name: 'Order (of the Gauntlet)' }, { name: '  ' }];
    expect(splitMentions('Joined the order (of the gauntlet).', odd)[1]).toEqual({ text: 'order (of the gauntlet)', item: odd[0] });
    expect(splitMentions('', odd)).toEqual([]);
    expect(splitMentions('plain', [])).toEqual(['plain']);
  });
});
