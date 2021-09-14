// Make sure native script functions get registered
import './nativeFunctions';

export { NullId, ArticyObjectCreator } from './object';
export { Database, RegisterDatabaseTypeClass, ArticyType } from './database';

export { ArticyObject, Entity, Asset, TemplateExtension } from './types';
export {
  BaseFlowNode,
  InputPin,
  OutputPin,
  Dialogue,
  DialogueFragment,
  FlowFragment,
  Jump,
  Hub,
  Instruction,
  Condition,
  BasePinnedObject,
} from './flowTypes';
export { Location, Zone, LocationImage, LocationLink } from './locationTypes';

export { Variable, VariableNamespace, VariableStore } from './variables';
export {
  FlowBranch,
  ResolvedBranch,
  SimpleFlowState,
  GameFlowState,
  GameIterationConfig,
  VisitCounts,
  VisitIndicies,
  VisitSet,
  basicNextFlowState,
  startupGameFlowState,
  advanceGameFlowState,
  collectBranches,
  refreshBranches,
  resolveBranch,
  resolveBranches,
  branchEndsWith,
  getBranchesOfType,
  mergeGameFlowState,
  completeFlow,
  NullGameFlowState,
  CustomStopType,
} from './iterator';

export {
  initializeGlobals,
  startupGameFlowStateWithGlobals,
  advanceGameFlowStateWithGlobals,
  mergeGameFlowStateWithGlobals,
  refreshBranchesWithGlobals,
  completeFlowWithGlobals,
  Globals,
  SlimGameFlowState,
} from './iteratorWithGlobals';

export {
  runScript,
  RegisterScriptFunction,
  RegisterFeatureExecutionHandler,
  RegisterTemplateExecutionHandler,
  ClearRegisteredFeatureHandlers,
  ClearRegisteredTemplateHandlers,
  VerifyRegisteredScriptMethod,
  createScriptDispatchMiddleware,
  ExtensionTypes,
} from './script';

export { processInlineScripts } from './inline';

export * from './json';
