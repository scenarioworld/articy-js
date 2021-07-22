import { Database } from '../src/database';
import '../src/flowTypes';
import { EmptyVisitSet, VisitSet } from '../src/iterator';
import { ArticyObjectProps, Id, TemplateProps } from '../src/json';
import { NullId } from '../src/object';
import { runScript } from '../src/script';
import { ArticyObject } from '../src/types';
import '../src/nativeFunctions';

function visitSet(id: Id, count: number): VisitSet {
  return { counts: { [id]: count }, indicies: {} };
}

const mockDatabase = ({
  isOfType: () => {
    return false;
  },
  getModel: () => {
    return {};
  },
} as unknown) as Database;

describe('The built-in `once` function', () => {
  const nodeId = '0x1';

  // Mock database
  const db = mockDatabase;

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
  const db = mockDatabase;

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

describe('Testing native functions', () => {
  const MyProps: ArticyObjectProps & Record<string, string> = {
    TechnicalName: 'MyTechnicalName',
    Id: '0x1',
    Speaker: '0x2',
  };
  const MyTemplate: TemplateProps = {
    Brook: {
      Integer: 10,
    },
  };

  // Mock database
  const db = ({
    getModel: (id: Id) => {
      if (id === '0x1') {
        return { Properties: MyProps };
      }
      return undefined;
    },
    getObject: (id: Id) => {
      if (id === '0x1') {
        return new ArticyObject({
          props: MyProps,
          type: 'Entity',
          db: db,
          template: MyTemplate,
        });
      }
      return undefined;
    },

    getObjectByTechnicalName: (name: string) => {
      if (name === 'MyTechnicalName') {
        return new ArticyObject({
          props: MyProps,
          type: 'Entity',
          db: db,
          template: MyTemplate,
        });
      }
      return undefined;
    },
  } as unknown) as Database;

  test('random', () => {
    const result = runScript(
      'random(5, 10) <= 10 && random(5, 10) >= 5',
      {},
      EmptyVisitSet,
      NullId,
      db,
      true,
      false
    );
    expect(result).toBeTruthy();
  });

  test('getProp with property', () => {
    const result = runScript(
      "getProp(getObj('0x1'), 'TechnicalName') == 'MyTechnicalName'",
      {},
      EmptyVisitSet,
      NullId,
      db,
      true,
      false
    );
    expect(result).toBeTruthy();
  });

  test('getProp with template', () => {
    const result = runScript(
      "getProp(getObj('0x1'), 'Brook.Integer') == 10",
      {},
      EmptyVisitSet,
      NullId,
      db,
      true,
      false
    );
    expect(result).toBeTruthy();
  });

  test('getProp with self', () => {
    const result = runScript(
      "getProp(self, 'TechnicalName') == 'MyTechnicalName'",
      {},
      EmptyVisitSet,
      '0x1',
      db,
      true,
      false
    );
    expect(result).toBeTruthy();
  });

  test('speaker is set', () => {
    const result = runScript(
      "speaker == '0x2'",
      {},
      EmptyVisitSet,
      '0x1',
      db,
      true,
      false
    );
    expect(result).toBeTruthy();
  });
});
