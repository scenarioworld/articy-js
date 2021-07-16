import { Database } from '../src/database';
import { ArticyData } from '../src/json';

// Raw database JSON
const UnitData: ArticyData = require('./unit.articy.json');

describe('A project with two languages: French and English', () => {
  // Load database
  const database = new Database(UnitData as ArticyData);

  beforeAll(async () => {
    // Load english language
    await database.localization.load('en', './test/loc_All objects_en.xlsx');

    // Load french language
    await database.localization.load('fr', './test/loc_All objects_fr.xlsx');
  });

  beforeEach(() => {
    // Make sure english is active
    database.localization.active = 'en';
  });

  test('Can localize an ID into active language', () => {
    expect(database.localization.get('FFr_10EB377E.DisplayName')).toBe(
      'Text Node'
    );
  });

  test('Can localize an ID into other languages', () => {
    expect(database.localization.get('FFr_10EB377E.DisplayName', 'fr')).toBe(
      'French Node'
    );
  });

  test('Can change active language', () => {
    database.localization.active = 'fr';
    expect(database.localization.get('FFr_10EB377E.DisplayName')).toBe(
      'French Node'
    );
  });
});
