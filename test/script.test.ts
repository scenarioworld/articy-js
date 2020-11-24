import { AnyAction } from '@reduxjs/toolkit';
import { Database } from '../src/database';
import {
  ClearRegisteredFeatureHandlers,
  ClearRegisteredScriptFunctions,
  RegisterScriptFunction,
  runScript,
  scriptDispatchMiddleware,
  ScriptFunction,
} from '../src/script';

// Clear registrations
beforeEach(() => {
  ClearRegisteredFeatureHandlers();
  ClearRegisteredScriptFunctions();
});

describe('A simple function with no return value', () => {
  // Register simple script function
  const func = jest.fn<
    ReturnType<ScriptFunction>,
    Parameters<ScriptFunction>
  >();
  beforeEach(() => {
    RegisterScriptFunction('func', func);
  });

  // Mock database
  const db = ({} as unknown) as Database;

  test('Calling function in script calls the bound javascript function', () => {
    runScript('func()', {}, db, false, false);
    expect(func.mock.calls).toHaveLength(1);
  });

  test('Active database is passed to function', () => {
    runScript('func()', {}, db, false, false);
    expect(func.mock.calls[0][1]).toBe(db);
  });

  test('Arguments are forwarded from script to function', () => {
    runScript('func(4, "test")', {}, db, false, false);
    expect(func.mock.calls[0][2]).toBe(4);
    expect(func.mock.calls[0][3]).toBe('test');
  });
});

describe('A simple function that returns true', () => {
  // Register simple script function
  const func = jest.fn<ReturnType<ScriptFunction>, Parameters<ScriptFunction>>(
    () => true
  );
  beforeEach(() => {
    RegisterScriptFunction('func', func);
  });

  // Mock database
  const db = ({} as unknown) as Database;

  test('Script result should be true', () => {
    const result = runScript('func()', {}, db, true, false);
    expect(result).toBe(true);
  });

  test('Inverted script result should be true', () => {
    const result = runScript('!func()', {}, db, true, false);
    expect(result).toBe(false);
  });
});

describe('A script environment with a single variable MyNamespace.Variable', () => {
  // Mock database
  const db = ({} as unknown) as Database;

  // Mock variable store
  const vars = { MyNamespace: { Variable: 45 } };
  beforeEach(() => (vars.MyNamespace.Variable = 45));

  test('Script can change variable', () => {
    runScript('MyNamespace.Variable = 22', vars, db, false, false);
    expect(vars.MyNamespace.Variable).toBe(22);
  });

  test('Script can access variable', () => {
    const result = runScript(
      'MyNamespace.Variable < 44',
      vars,
      db,
      true,
      false
    );
    expect(result).toBe(false);
  });
});

describe('Script middleware', () => {
  // Mock database
  const db = ({} as unknown) as Database;

  const executeScript = <T extends AnyAction>(action: T) => {
    runScript('func()', {}, db, false, false);
    return action;
  };
  const dispatch = jest.fn(<T extends AnyAction>(action: T) => action);
  const getState = jest.fn();

  test('Actions are dispatched after function is executed', () => {
    RegisterScriptFunction('func', function*() {
      yield { type: 'myaction' };
      yield { type: 'otheraction' };
    });

    // dispatch action through the middleware
    scriptDispatchMiddleware({ dispatch, getState })(executeScript)('');

    // Check that both subactions were dispatched
    expect(dispatch.mock.calls).toHaveLength(2);
    expect(dispatch.mock.calls[0][0].type).toBe('myaction');
    expect(dispatch.mock.calls[1][0].type).toBe('otheraction');
  });
});
