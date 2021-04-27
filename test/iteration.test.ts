import { Database } from '../src/database';
import {
  mergeGameFlowState,
  GameIterationConfig,
  startupGameFlowState,
  completeFlow,
  advanceGameFlowState,
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

describe('A flow with terminal branches', () => {
  // Start ID
  const startId = '0x010000000000018B';

  // Basic config
  const config: GameIterationConfig = {
    stopAtTypes: ['DialogueFragment'],
  };

  test('Calling completeFlow when there are valid branches does nothing', () => {
    let [iter] = startupGameFlowState(TestDB, startId, config);

    // Call early complete. Should not cause the terminal branch to call
    const earlyComplete = completeFlow(TestDB, iter);
    expect(earlyComplete.variables['Test']['Integer']).toBe(0);
  });

  test('Calling completeFlow when there are no branches should execute remaining non-stop nodes', () => {
    // Start
    let [iter] = startupGameFlowState(TestDB, startId, config);

    // Advance to next node
    [iter] = advanceGameFlowState(TestDB, iter, config, 0);

    // Call complete
    const finalComplete = completeFlow(TestDB, iter);

    // Instruction should have been called
    expect(finalComplete.variables['Test']['Integer']).toBe(2);

    // We should not have a current id since we're 'complete'
    expect(finalComplete.id).toBe(null);
    expect(finalComplete.last).toBe(null);
  });
});
