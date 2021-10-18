import { RegisterFeatureExecutionHandler, RegisterTemplateExecutionHandler, RunFeatureHandlers, RunTemplateHandlers } from "../src/script"

test("Two identical feature handlers override", () => { 
    let firstRuns = 0;
    function firstHandler() { firstRuns++; };

    let secondRuns = 0;
    function secondHandler() { secondRuns++ };

    // Register first method
    RegisterFeatureExecutionHandler("MyFeature", "MyFeatureHandler", firstHandler);

    // Call
    // @ts-ignore
    RunFeatureHandlers("MyFeature", undefined, undefined, undefined, undefined);

    // Should only call first method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(0);

    // Register new handler and call
    RegisterFeatureExecutionHandler("MyFeature", "MyFeatureHandler", secondHandler);
    // @ts-ignore
    RunFeatureHandlers("MyFeature", undefined, undefined, undefined, undefined);

    // Should only call second method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(1);
});

test("Multiple unique feature handlers don't override", () => { 
    let firstRuns = 0;
    function firstHandler() { firstRuns++; };

    let secondRuns = 0;
    function secondHandler() { secondRuns++ };

    // Register first method
    RegisterFeatureExecutionHandler("MyFeature", "MyFeatureHandler", firstHandler);

    // Call
    // @ts-ignore
    RunFeatureHandlers("MyFeature", undefined, undefined, undefined, undefined);

    // Should only call first method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(0);

    // Register new handler and call
    RegisterFeatureExecutionHandler("MyFeature", "MyFeatureHandler2", secondHandler);
    // @ts-ignore
    RunFeatureHandlers("MyFeature", undefined, undefined, undefined, undefined);

    // Both should run
    expect(firstRuns).toBe(2);
    expect(secondRuns).toBe(1);
});

test("Two identical template handlers override", () => { 
    let firstRuns = 0;
    function firstHandler() { firstRuns++; };

    let secondRuns = 0;
    function secondHandler() { secondRuns++ };

    // Register first method
    RegisterTemplateExecutionHandler("MyTemplate", "MyTemplateHandler", firstHandler);

    // Call
    // @ts-ignore
    RunTemplateHandlers("MyTemplate", undefined, undefined, undefined, undefined);

    // Should only call first method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(0);

    // Register new handler and call
    RegisterTemplateExecutionHandler("MyTemplate", "MyTemplateHandler", secondHandler);
    // @ts-ignore
    RunTemplateHandlers("MyTemplate", undefined, undefined, undefined, undefined);

    // Should only call second method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(1);
});

test("Multiple unique template handlers don't override", () => { 
    let firstRuns = 0;
    function firstHandler() { firstRuns++; };

    let secondRuns = 0;
    function secondHandler() { secondRuns++ };

    // Register first method
    RegisterFeatureExecutionHandler("MyTemplate", "MyTemplateHandler", firstHandler);

    // Call
    // @ts-ignore
    RunFeatureHandlers("MyTemplate", undefined, undefined, undefined, undefined);

    // Should only call first method
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(0);

    // Register new handler and call
    RegisterFeatureExecutionHandler("MyTemplate", "MyTemplateHandler2", secondHandler);
    // @ts-ignore
    RunFeatureHandlers("MyTemplate", undefined, undefined, undefined, undefined);

    // Both should run
    expect(firstRuns).toBe(2);
    expect(secondRuns).toBe(1);
});