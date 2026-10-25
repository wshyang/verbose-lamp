import type { LuckyDrawEntry } from '../model/entries';

const NOTABLES: readonly LuckyDrawEntry[] = [
  { id: 'gatsby', name: 'Jay Gatsby', subtitle: 'West Egg' },
  { id: 'daisy', name: 'Daisy Buchanan', subtitle: 'East Egg' },
  { id: 'nick', name: 'Nick Carraway', subtitle: 'The Cottage' },
  { id: 'jordan', name: 'Jordan Baker', subtitle: 'East Egg' },
  { id: 'tom', name: 'Tom Buchanan', subtitle: 'East Egg' },
  { id: 'myrtle', name: 'Myrtle Wilson', subtitle: 'The Garage' },
  { id: 'wolfsheim', name: 'Meyer Wolfsheim', subtitle: 'The 1919 Table' },
  { id: 'owl-eyes', name: 'Owl Eyes', subtitle: 'The Library' },
  { id: 'klipspringer', name: 'Ewing Klipspringer', subtitle: 'The Piano' },
] as const;

const FIRST = [
  'Adelaide', 'Basil', 'Cecil', 'Dorothy', 'Edgar', 'Florence', 'Gustav', 'Harriet',
  'Irving', 'Josephine', 'Kingsley', 'Lillian', 'Montague', 'Nora', 'Oswald', 'Pearl',
  'Quentin', 'Rosalind', 'Sidney', 'Theodora', 'Ulysses', 'Vivian', 'Winston', 'Xenia',
  'Yolanda', 'Zachary', 'Araminta', 'Benedict', 'Clara', 'Desmond', 'Estelle', 'Felix',
  'Gwendolyn', 'Horatio', 'Isadora', 'Julian', 'Katherine', 'Leopold', 'Millicent', 'Nathaniel',
] as const;

const LAST = [
  'Ashford', 'Blackwood', 'Chesterfield', 'Devereaux', 'Eastman', 'Fairbanks', 'Gilded',
  'Hawthorne', 'Ivory', 'Kensington', 'Larkspur', 'Marlowe', 'Nightingale', 'Oakhart',
  'Pemberton', 'Quillon', 'Ravenscroft', 'Sterling', 'Thornbury', 'Underhill', 'Vanderlyn',
  'Whitmore', 'Yardley', 'Zell', 'Astor', 'Beaumont', 'Calloway', 'Danforth', 'Ellsworth',
  'Featherstone', 'Gramercy', 'Hollis', 'Inglewood', 'Jardine', 'Kestrel', 'Lockwood',
  'Merriweather', 'Northrop', 'Ostrander', 'Prescott',
] as const;

/** 9 notables + 280 deterministic event guests — the demo and test fixture. */
function generateGuests(): readonly LuckyDrawEntry[] {
  return Array.from({ length: 280 }, (_, i) => {
    const first = FIRST[i % 40];
    const last = LAST[(i * 7 + Math.floor(i / 40)) % 40];
    return {
      id: `guest-${String(i + 1).padStart(3, '0')}`,
      name: `${first} ${last}`,
      subtitle: `Table ${(i % 28) + 1}`,
    };
  });
}

export const SAMPLE_GUESTS: readonly LuckyDrawEntry[] = [...NOTABLES, ...generateGuests()];