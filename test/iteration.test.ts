import { Database } from '../src/database';
import {
  mergeGameFlowState,
  GameIterationConfig,
  startupGameFlowState,
} from '../src/iterator';
import { ArticyData } from '../src/json';
const TestData: ArticyData = require('./data.articy.json');

// Create test database
const TestDB = new Database(TestData);

describe('Basic iteration configuration', () => {
  // Start ID
  const startId = '0x01000000000001AC';

  // Basic config
  const config: GameIterationConfig = {
    stopAtTypes: ['DialogueFragment'],
  };

  test('Startup advances to next stop-at node and collects initial branches', () => {
    // Startup
    const [iter] = startupGameFlowState(TestDB, startId, config);

    // This should take us to the next node
    expect(iter.id).toBe('0x0100000000000147');

    // Which will be the only page
    expect(iter.pages.length).toBe(1);
    expect(iter.pages).toContain('0x0100000000000147');

    // And there should be three branches
    expect(iter.branches.length).toBe(3);
  });

  test('Merging states merges branches and pages', () => {
    // Startup
    const [iter] = startupGameFlowState(TestDB, startId, config);

    // Merge another node in
    const mergedId = '0x0100000000000183';
    const mergedIter = mergeGameFlowState(TestDB, iter, config, mergedId);

    // We should now have both pages
    expect(mergedIter.pages).toHaveLength(2);
    expect(mergedIter.pages).toContain('0x0100000000000147');
    expect(mergedIter.pages).toContain(mergedId);

    // And both branches
    expect(mergedIter.branches).toHaveLength(5);

    // All branch indexes should be unique
    expect(mergedIter.branches.map(b => b.index).sort()).toEqual(
      [0, 1, 2, 3, 4].sort()
    );
  });
});
