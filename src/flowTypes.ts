import {
  FlowObjectProps,
  TemplateProps,
  Id,
  ConnectionProps,
  PinProps,
  PinnedObjectProps,
  ScriptNodeProps,
  JumpProps,
  DialogueFragmentProps,
  FlowFragmentProps,
  DialogueProps,
} from './json';
import { Database, ArticyType, RegisterDatabaseTypeClass } from './database';
import { ArticyCreatorArguments } from './object';
import { RegisterScriptFunction, runScript } from './script';
import { ArticyObject, Entity } from './types';
import { VariableStore } from './variables';
import { VisitSet } from './iterator';

export type ExecuteContext = {
  variables: VariableStore;
  visits: VisitSet;
};

/**
 * Base class for all flow nodes
 */
export class BaseFlowNode<
  PropertiesType extends FlowObjectProps = FlowObjectProps,
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<PropertiesType, TemplateType> {
  /**
   * Returns the next node along the given branch index
   * @param branchIndex Branch index to follow (-1 means default)
   * @param last Id of the node we were at least (or null if none)
   */
  next(
    _context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    _shadowing: boolean
  ): BaseFlowNode | undefined {
    return undefined;
  }

  /**
   * Returns the number of valid branches at this node
   * @param last Id of the node we were at least (or null if none)
   */
  numBranches(
    _context: ExecuteContext,
    _last: Id | null,
    _shadowing: boolean
  ): number {
    return 0;
  }

  /**
   * Return true if this node might modify the variable state during a call to next()
   */
  needsShadow(): boolean {
    return false;
  }

  /**
   * Executes scripts on the node (should do the same as next without the iteration advancement)
   */
  execute(_context: ExecuteContext): void {
    // do nothing
  }
}

function nextFromConnections(
  db: Database,
  branchIndex: number,
  connections: ConnectionProps[]
): BaseFlowNode | undefined {
  // If we have no connections, that's the end
  if (connections.length === 0) {
    return undefined;
  }

  // No simple movement
  if (branchIndex === -1 && connections.length > 1) {
    return undefined;
  }

  // Make sure it's in bounds
  if (branchIndex < 0) {
    branchIndex = 0;
  }

  // Bounds check
  if (branchIndex >= connections.length) {
    return undefined;
  }

  // Go to target pin
  return db.getObject(connections[branchIndex].TargetPin, BaseFlowNode);
}

/**
 * Base class for all Flow Pins
 */
export class BasePin extends BaseFlowNode<PinProps> {
  private _connections: ConnectionProps[] | undefined;

  public connections(): ConnectionProps[] {
    if (this._connections) {
      return this._connections;
    }

    // Create and sort connection list
    this._connections = [...(this.properties.Connections ?? [])];
    this._connections.sort((a, b) => {
      const lnode = this.db.getProperties<FlowObjectProps>(a.Target);
      const rnode = this.db.getProperties<FlowObjectProps>(b.Target);
      return (lnode?.Position.y ?? 0) - (rnode?.Position.y ?? 0);
    });

    return this._connections;
  }
}

/**
 * An output pin with an optional script
 */
@ArticyType('OutputPin')
export class OutputPin extends BasePin {
  next(
    context: ExecuteContext,
    branchIndex: number,
    _last: Id | null,
    shadowing: boolean
  ): BaseFlowNode | undefined {
    // Evaluate instructions
    runScript(
      this.properties.Text,
      context.variables,
      context.visits,
      this.id,
      this.db,
      false,
      shadowing
    );

    // Return the appropriate connection
    return nextFromConnections(this.db, branchIndex, this.connections());
  }

  numBranches(): number {
    return this.connections().length;
  }

  needsShadow(): boolean {
    return this.properties.Text.length > 0;
  }

  execute(context: ExecuteContext): void {
    runScript(
      this.properties.Text,
      context.variables,
      context.visits,
      this.id,
      this.db,
      false,
      false
    );
  }
}

/**
 * An input pin with an optional condition
 */
@ArticyType('InputPin')
export class InputPin extends BasePin {
  next(): BaseFlowNode | undefined {
    return this.db.getObject(this.properties.Owner, BaseFlowNode);
  }

  numBranches(
    context: ExecuteContext,
    _last: Id | null,
    shadowing: boolean
  ): number {
    // No branches if the script fails. Dead end.
    if (
      !runScript(
        this.properties.Text,
        context.variables,
        context.visits,
        this.id,
        this.db,
        true,
        shadowing
      )
    ) {
      return 0;
    }

    // Otherwise always 1: returning to our owner
    return 1;
  }
}

/**
 * Base class for all flow nodes that have input and output pins
 */
export class BasePinnedObject<
  PropertiesType extends PinnedObjectProps = PinnedObjectProps,
  TemplateType extends TemplateProps = TemplateProps
> extends BaseFlowNode<PropertiesType, TemplateType> {
  /**
   * Output pins leading out of this node
   */
  public readonly OutputPins: OutputPin[];

  /**
   * Input pins leading into this node
   */
  public readonly InputPins: InputPin[];

  constructor(args: ArticyCreatorArguments<PropertiesType, TemplateType>) {
    super(args);

    this.InputPins =
      args.props.InputPins?.map(
        def => new InputPin({ props: def, type: 'InputPin', db: args.db })
      ) ?? [];
    this.OutputPins =
      args.props.OutputPins?.map(
        def => new OutputPin({ props: def, type: 'OutputPin', db: args.db })
      ) ?? [];
  }
}

/**
 * Base Hub class
 */
@ArticyType('Hub')
export class Hub extends BasePinnedObject {
  next(): BaseFlowNode | undefined {
    if (this.OutputPins.length === 0) {
      return undefined;
    }

    return this.OutputPins[0];
  }

  numBranches(): number {
    if (this.OutputPins.length === 0) {
      return 0;
    }

    // Just going to our output pin
    return 1;
  }
}

/**
 * Conditions that choose either their first or second output pin depending on the result of a condition script
 */
@ArticyType('Condition')
export class Condition extends BasePinnedObject<ScriptNodeProps> {
  next(
    context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    shadowing: boolean
  ): BaseFlowNode | undefined {
    // Return 0 or 1 based on a script
    const result = runScript(
      this.properties.Expression,
      context.variables,
      context.visits,
      this.id,
      this.db,
      true,
      shadowing
    );
    return this.OutputPins[result ? 0 : 1];
  }

  // Always one branch. True or False.
  numBranches(): number {
    return 1;
  }
}

/**
 * Instruction that runs a script before moving onto the next node
 */
@ArticyType('Instruction')
export class Instruction extends BasePinnedObject<ScriptNodeProps> {
  next(
    context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    shadowing: boolean
  ): BaseFlowNode | undefined {
    // Run script
    runScript(
      this.properties.Expression,
      context.variables,
      context.visits,
      this.id,
      this.db,
      false,
      shadowing
    );

    // Go to first pin
    return this.OutputPins[0];
  }

  // Always one branch.
  numBranches(): number {
    return 1;
  }

  needsShadow(): boolean {
    return this.properties.Expression.length > 0;
  }

  execute(context: ExecuteContext): void {
    runScript(
      this.properties.Expression,
      context.variables,
      context.visits,
      this.id,
      this.db,
      false,
      false
    );
  }
}

/**
 * Jumps to a destination node by reference
 */
export class Jump<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<JumpProps, TemplateType> {
  constructor(args: ArticyCreatorArguments<JumpProps, TemplateType>) {
    super(args);

    this.TargetPin = args.db.getObject(this.properties.TargetPin, InputPin);
  }

  next(): BaseFlowNode | undefined {
    // Go to the target pin
    return this.TargetPin;
  }

  // One branch as long as we have a target
  numBranches(): number {
    return this.TargetPin ? 1 : 0;
  }

  public TargetPin: InputPin | undefined;
}
RegisterDatabaseTypeClass('Jump', Jump);

/**
 * Fragment of dialogue spoken by an entity
 */
@ArticyType('DialogueFragment')
export class DialogueFragment<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<DialogueFragmentProps, TemplateType> {
  constructor(
    args: ArticyCreatorArguments<DialogueFragmentProps, TemplateType>
  ) {
    super(args);

    this.Speaker = args.db.getObject(this.properties.Speaker, Entity);
  }

  next(): BaseFlowNode | undefined {
    if (this.OutputPins.length === 0) {
      return undefined;
    }
    return this.OutputPins[0];
  }

  numBranches(): number {
    if (this.OutputPins.length === 0) {
      return 0;
    }
    return 1;
  }

  public readonly Speaker: Entity | undefined;
}

/**
 * Base class for all fragments with children
 */
export class BaseFragment<
  PropertiesType extends PinnedObjectProps,
  TemplateType extends TemplateProps
> extends BasePinnedObject<PropertiesType, TemplateType> {
  next(
    _context: ExecuteContext,
    branchIndex: number,
    last: Id
  ): BaseFlowNode | undefined {
    if (this.InputPins.length === 0) {
      return undefined;
    }

    // Find the pin we came in from
    const inputPinToFollow =
      last === null
        ? this.InputPins[0]
        : this.InputPins.find(x => x.properties.Id === last);

    // If we can't... die?
    if (!inputPinToFollow) {
      return undefined;
    }

    // SPECIAL: Input pin goes nowhere, go to output pin
    if (inputPinToFollow.connections().length === 0) {
      if (this.OutputPins.length === 0) {
        return undefined;
      }
      return this.OutputPins[0];
    }

    // Next connection from pin
    return nextFromConnections(
      this.db,
      branchIndex,
      inputPinToFollow.connections()
    );
  }

  numBranches(_context: ExecuteContext, last: Id | null): number {
    if (this.InputPins.length === 0) {
      return 0;
    }

    // Find the pin we came in from
    const inputPinToFollow =
      last === null
        ? this.InputPins[0]
        : this.InputPins.find(x => x.properties.Id === last);

    // If we can't... die?
    if (!inputPinToFollow) {
      return 0;
    }

    // SPECIAL: Input pin goes nowhere, go to output pin
    if (inputPinToFollow.connections().length === 0) {
      if (this.OutputPins.length === 0) {
        return 0;
      }
      return 1;
    }

    // Number of connections from our input pin
    return inputPinToFollow.connections().length;
  }
}

/**
 * Flow fragment with attachments, text, and children
 */
@ArticyType('FlowFragment')
export class FlowFragment<
  TemplateType extends TemplateProps = TemplateProps
> extends BaseFragment<FlowFragmentProps, TemplateType> {}

/**
 * Dialogue node with attachments, text, and children
 */
@ArticyType('Dialogue')
export class Dialogue<
  TemplateType extends TemplateProps = TemplateProps
> extends BaseFragment<DialogueProps, TemplateType> {}

// once() method -> returns true only if the calling node has not been visted before
RegisterScriptFunction('once', context => {
  return (
    !(context.caller in context.visits.counts) ||
    context.visits.counts[context.caller] === 0
  );
});

// limit(number) method -> returns true only if the current node has been visited less than `number` times
RegisterScriptFunction('limit', (context, max) => {
  // Make sure it's actually a number
  if (typeof max !== 'number') {
    return false;
  }

  // Check visit count
  const count = context.visits.counts[context.caller];
  if (count === undefined && max === 0) {
    return false;
  }
  if (count === undefined || count < max) {
    return true;
  }
  return false;
});
