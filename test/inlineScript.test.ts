import { Database } from '../src/database';
import { ExecuteContext } from '../src/flowTypes';
import { processInlineScripts } from '../src/inline';
import { Variable, VariableStore } from '../src/variables';

const mockDatabase = ({
  isOfType: () => {
    return false;
  },
  getModel: () => {
    return {};
  },
} as unknown) as Database;

const caller = '0x0';
const emptyExecutionContext: ExecuteContext = {
  variables: {},
  visits: { counts: {}, indicies: {} },
};
function executionContext(
  visits: number,
  ns?: string,
  v?: string,
  value?: Variable
): ExecuteContext {
  const variables: VariableStore = {};
  if (ns && v && value !== undefined) {
    variables[ns] = { [v]: value };
  }

  return { variables, visits: { counts: { [caller]: visits }, indicies: {} } };
}

describe('A stopping list', () => {
  const elements = ['AAA', 'BBB', 'CCC', '', 'DDD', 'EEE', ''];
  const prelude = 'Output from list: ';
  const afterlude = '.';

  const text = `${prelude}{${elements.join('|')}}${afterlude}`;

  test('Processing preserves both prelude and afterlude', () => {
    expect(
      processInlineScripts(text, emptyExecutionContext, caller, mockDatabase)
    ).toBe(prelude + elements[0] + afterlude);
  });

  test('Element chosen is equal to number of visits', () => {
    for (let i = 0; i < elements.length; i++) {
      expect(
        processInlineScripts(text, executionContext(i), caller, mockDatabase)
      ).toBe(prelude + elements[i] + afterlude);
    }
  });

  test('When visits exceeds number of elements, stick to last element', () => {
    expect(
      processInlineScripts(
        text,
        executionContext(elements.length),
        caller,
        mockDatabase
      )
    ).toBe(prelude + elements[elements.length - 1] + afterlude);
  });
});

describe('A once-only list', () => {
  const elements = ['AAA', 'BBB', 'CCC', '', 'DDD', 'EEE'];
  const prelude = 'Output from list: ';
  const afterlude = '.';

  const text = `${prelude}{!${elements.join('|')}}${afterlude}`;

  test('Processing preserves both prelude and afterlude', () => {
    expect(
      processInlineScripts(text, emptyExecutionContext, caller, mockDatabase)
    ).toBe(prelude + elements[0] + afterlude);
  });

  test('Element chosen is equal to number of visits', () => {
    for (let i = 0; i < elements.length; i++) {
      expect(
        processInlineScripts(text, executionContext(i), caller, mockDatabase)
      ).toBe(prelude + elements[i] + afterlude);
    }
  });

  test("When visits exceeds number of elements, don't add any element", () => {
    expect(
      processInlineScripts(
        text,
        executionContext(elements.length),
        caller,
        mockDatabase
      )
    ).toBe(prelude + afterlude);
  });
});

describe('A cycling list', () => {
  const elements = ['AAA', 'BBB', 'CCC', '', 'DDD', 'EEE'];
  const prelude = 'Output from list: ';
  const afterlude = '.';

  const text = `${prelude}{&${elements.join('|')}}${afterlude}`;

  test('Processing preserves both prelude and afterlude', () => {
    expect(
      processInlineScripts(text, emptyExecutionContext, caller, mockDatabase)
    ).toBe(prelude + elements[0] + afterlude);
  });

  test('Element chosen is equal to number of visits', () => {
    for (let i = 0; i < elements.length; i++) {
      expect(
        processInlineScripts(text, executionContext(i), caller, mockDatabase)
      ).toBe(prelude + elements[i] + afterlude);
    }
  });

  test('When visits exceeds number of elements, wrap', () => {
    for (let i = elements.length; i < elements.length * 2; i++) {
      expect(
        processInlineScripts(text, executionContext(i), caller, mockDatabase)
      ).toBe(prelude + elements[i % elements.length] + afterlude);
    }
  });
});

describe('A shuffling list', () => {
  const elements = ['AAA', 'BBB', 'CCC', '', 'DDD', 'EEE'];
  const prelude = 'Output from list: ';
  const afterlude = '.';

  const text = `${prelude}{~${elements.join('|')}}${afterlude}`;

  test('Processing preserves both prelude and afterlude', () => {
    const output = processInlineScripts(
      text,
      emptyExecutionContext,
      caller,
      mockDatabase
    );
    expect(output.endsWith(afterlude)).toBe(true);
    expect(output.startsWith(prelude)).toBe(true);

    const listElement = output.substr(
      prelude.length,
      output.length - prelude.length - afterlude.length
    );
    expect(elements).toContain(listElement);
  });

  test('Element should usually be different', () => {
    const outputs = [];
    for (let i = 0; i < elements.length; i++) {
      outputs.push(
        processInlineScripts(text, executionContext(0), caller, mockDatabase)
      );
    }

    const output = outputs.pop();
    expect(outputs.some(o => o !== output)).toBe(true);
  });

  // TODO: Test we get each one once before wrapping again
});

describe('A recursive list', () => {
  // Create sub-list
  const elementsA = ['AAA', 'BBB', 'CCC', '', 'DDD', 'EEE'];
  const preludeA = 'Output from list --';
  const afterludeA = '--';
  const textA = `${preludeA}{${elementsA.join('|')}}${afterludeA}`;

  // Create main list
  const elementsB = ['aaa', 'bbb', textA, 'ccc'];
  const preludeB = 'Main Output: ';
  const afterludeB = '.';
  const textB = `${preludeB}{${elementsB.join('|')}}${afterludeB}`;

  test('Recusive processing', () => {
    expect(
      processInlineScripts(textB, executionContext(2), caller, mockDatabase)
    ).toBe(`${preludeB}${preludeA}${elementsA[2]}${afterludeA}${afterludeB}`);
  });
});

describe('A variable condition', () => {
  const ns = 'MyVariables';
  const v = 'Variable';
  const prelude = 'Output from condition: ';
  const afterlude = '.';
  const trueValue = 'yes';
  const falseValue = 'no';

  const textIf = `${prelude}{${ns}.${v}:${trueValue}}${afterlude}`;
  const textIfElse = `${prelude}{${ns}.${v}:${trueValue}|${falseValue}}${afterlude}`;
  const textNotIfElse = `${prelude}{!${ns}.${v}:${trueValue}|${falseValue}}${afterlude}`;

  test('If, no else', () => {
    expect(
      processInlineScripts(
        textIf,
        executionContext(0, ns, v, true),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${trueValue}${afterlude}`);

    expect(
      processInlineScripts(
        textIf,
        executionContext(0, ns, v, false),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${afterlude}`);
  });

  test('If/else', () => {
    expect(
      processInlineScripts(
        textIfElse,
        executionContext(0, ns, v, true),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${trueValue}${afterlude}`);

    expect(
      processInlineScripts(
        textIfElse,
        executionContext(0, ns, v, false),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${falseValue}${afterlude}`);
  });

  test('Not If/else', () => {
    expect(
      processInlineScripts(
        textNotIfElse,
        executionContext(0, ns, v, true),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${falseValue}${afterlude}`);

    expect(
      processInlineScripts(
        textNotIfElse,
        executionContext(0, ns, v, false),
        caller,
        mockDatabase
      )
    ).toBe(`${prelude}${trueValue}${afterlude}`);
  });
});

describe('Printing expressions', () => {
  test('Arithmatic', () => {
    expect(
      processInlineScripts(
        '{1 + 2}',
        emptyExecutionContext,
        caller,
        mockDatabase
      )
    ).toBe('3');
  });

  test('Basic string', () => {
    expect(
      processInlineScripts(
        "{'wtf'}",
        emptyExecutionContext,
        caller,
        mockDatabase
      )
    ).toBe('wtf');
  });

  test('Boolean expressions', () => {
    expect(
      processInlineScripts(
        '{1 == 2}',
        emptyExecutionContext,
        caller,
        mockDatabase
      )
    ).toBe('false');
  });

  test('Variable values', () => {
    expect(
      processInlineScripts(
        '{MyNS.MyVar}',
        executionContext(0, 'MyNS', 'MyVar', 'HELLO'),
        caller,
        mockDatabase
      )
    ).toBe('HELLO');
  });
});

test('Multiple lists in one string', () => {
  expect(
    processInlineScripts(
      '{A|B} is {C|D}',
      executionContext(0),
      caller,
      mockDatabase
    )
  ).toBe('A is C');
  expect(
    processInlineScripts(
      '{A|B} is {C|D}',
      executionContext(1),
      caller,
      mockDatabase
    )
  ).toBe('B is D');
});

test('List in a list', () => {
  expect(
    processInlineScripts('{A|{B|C}}', executionContext(0), caller, mockDatabase)
  ).toBe('A');
  expect(
    processInlineScripts('{A|{B|C}}', executionContext(1), caller, mockDatabase)
  ).toBe('C');
});

test('Multiline stopping list', () => {
  const list = '{stopping:\n- my value\n\n - my other value\n}';
  expect(
    processInlineScripts(list, executionContext(0), caller, mockDatabase)
  ).toBe('my value');
  expect(
    processInlineScripts(list, executionContext(1), caller, mockDatabase)
  ).toBe('my other value');
  expect(
    processInlineScripts(list, executionContext(2), caller, mockDatabase)
  ).toBe('my other value');
});

test('Multiline cycle list', () => {
  const list = '{cycle:\n- my value\n\n - my other value\n}';
  expect(
    processInlineScripts(list, executionContext(0), caller, mockDatabase)
  ).toBe('my value');
  expect(
    processInlineScripts(list, executionContext(1), caller, mockDatabase)
  ).toBe('my other value');
  expect(
    processInlineScripts(list, executionContext(2), caller, mockDatabase)
  ).toBe('my value');
});

test('Multiline switch statement', () => {
  const sw =
    '{\n- MyVar.i == 0: 0\n- MyVar.i == 1 : 1\n- MyVar.i == 2: 2\n- else: invalid\n}';
  for (let i = 0; i < 5; i++) {
    expect(
      processInlineScripts(
        sw,
        executionContext(0, 'MyVar', 'i', i),
        caller,
        mockDatabase
      )
    ).toBe(i <= 2 ? i.toString() : 'invalid');
  }
});

test('Multiline stopping list with colons', () => {
  const list = '{stopping:\n- my: value\n\n - my other: value\n}';
  expect(
    processInlineScripts(list, executionContext(0), caller, mockDatabase)
  ).toBe('my: value');
  expect(
    processInlineScripts(list, executionContext(1), caller, mockDatabase)
  ).toBe('my other: value');
  expect(
    processInlineScripts(list, executionContext(2), caller, mockDatabase)
  ).toBe('my other: value');
});
