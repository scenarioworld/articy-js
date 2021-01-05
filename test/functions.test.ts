import { Database } from '../src/database';
import '../src/flowTypes';
import { EmptyVisitSet, VisitSet } from '../src/iterator';
import { Id } from '../src/json';
import { runScript } from '../src/script';

function visitSet(id: Id, count: number): VisitSet {
  return { counts: { [id]: count }, indicies: {} };
}

describe('The built-in `once` function', () => {
  const nodeId = '0x1';

  // Mock database
  const db = ({} as unknown) as Database;

  test("Returns true if node hasn't been visited", () => {
    expect(
      runScript('once()', {}, EmptyVisitSet, nodeId, db, true, false)
    ).toBe(true);
  });

  test('Returns false if node has been visited once', () => {
    expect(
      runScript('once()', {}, visitSet(nodeId, 1), nodeId, db, true, false)
    ).toBe(false);
  });

  test('Returns false if node has been visited many times', () => {
    expect(
      runScript('once()', {}, visitSet(nodeId, 5), nodeId, db, true, false)
    ).toBe(false);
  });

  test('Returns true if node has been visited 0 times', () => {
    expect(
      runScript('once()', {}, visitSet(nodeId, 0), nodeId, db, true, false)
    ).toBe(true);
  });
});

describe('The built-in `limit` function', () => {
  const nodeId = '0x1';

  // Mock database
  const db = ({} as unknown) as Database;

  test("Returns true if limit is greater than 0 and the node hasn't been visited", () => {
    expect(
      runScript('limit(1)', {}, EmptyVisitSet, nodeId, db, true, false)
    ).toBe(true);
  });

  test('Returns false if visit count matches limit', () => {
    expect(
      runScript('limit(5)', {}, visitSet(nodeId, 5), nodeId, db, true, false)
    ).toBe(false);
  });

  test("Returns false if node limit is 0 and node hasn't been visited", () => {
    expect(
      runScript('limit(0)', {}, EmptyVisitSet, nodeId, db, true, false)
    ).toBe(false);
  });

  test('Returns false if node limit is 0 and node visit count is zero', () => {
    expect(
      runScript('limit(0)', {}, visitSet(nodeId, 0), nodeId, db, true, false)
    ).toBe(false);
  });

  test('Returns true if node has been visited 0 times and limit is greater than 0', () => {
    expect(
      runScript('limit(1)', {}, visitSet(nodeId, 0), nodeId, db, true, false)
    ).toBe(true);
  });

  test('Returns true if visit count is less than limit', () => {
    expect(
      runScript('limit(5)', {}, visitSet(nodeId, 2), nodeId, db, true, false)
    ).toBe(true);
  });
});
