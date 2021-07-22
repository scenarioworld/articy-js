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
import { Database, ArticyType } from './database';
import { ArticyCreatorArguments } from './object';
import { runScript } from './script';
import { ArticyObject, Entity } from './types';
import { VariableStore } from './variables';
import { VisitSet } from './iterator';

/**
 * Passed to methods like [[BaseFlowNode.next]], [[BaseFlowNode.numBranches]], and [[BaseFlowNode.execute]] to provide necessary context for execution calculations.
 */
export type ExecuteContext = {
  /** Current variable store */
  variables: VariableStore;

  /** Current node visit count/index information */
  visits: VisitSet;
};

/**
 * Base class for all flow nodes
 * @typeparam PropertiesType Property block interface
 * @typeparam TemplateType Template block interface
 * @category Flow Types
 */
export class BaseFlowNode<
  PropertiesType extends FlowObjectProps = FlowObjectProps,
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<PropertiesType, TemplateType> {
  /**
   * Returns the next node along the given branch index
   * @param branchIndex Branch index to follow (-1 means default)
   * @param last Id of the previous node (or null if none)
   * @returns The next node along the branch (or undefined) and any Incoming/Outgoing Connection that was used to get there.
   */
  next(
    _context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    _shadowing: boolean
  ): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    return [undefined, undefined];
  }

  /**
   * Returns the number of valid branches at this node
   * @param last Id of the node we were at least (or null if none)
   * @returns Number of valid branches (so, not branches with failing conditions)
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

  /**
   * If this returns something other than undefined, then all node Ids returned will be counted as visited at the same time as this node
   * @param _context Execution context
   * @returns Id(s) to visit
   */
  visits(_context: ExecuteContext): Id | Id[] | undefined {
    return undefined;
  }
}

function nextFromConnections(
  db: Database,
  branchIndex: number,
  connections: ConnectionProps[]
): [BaseFlowNode | undefined, ConnectionProps | undefined] {
  // If we have no connections, that's the end
  if (connections.length === 0) {
    return [undefined, undefined];
  }

  // No simple movement
  if (branchIndex === -1 && connections.length > 1) {
    return [undefined, undefined];
  }

  // Make sure it's in bounds
  if (branchIndex < 0) {
    branchIndex = 0;
  }

  // Bounds check
  if (branchIndex >= connections.length) {
    return [undefined, undefined];
  }

  // Go to target pin
  return [
    db.getObject(connections[branchIndex].TargetPin, BaseFlowNode),
    connections[branchIndex],
  ];
}

/**
 * Base class for all Flow Pins (see [[InputPin]] and [[OutputPin]]).
 */
export class BasePin extends BaseFlowNode<PinProps> {
  private _connections: ConnectionProps[] | undefined;

  /**
   * Returns all Incoming or Outgoing connections to/from this pin.
   * @returns List of connections
   */
  public connections(): ConnectionProps[] {
    if (this._connections) {
      return this._connections;
    }

    // Create and sort connection list
    this._connections = [...(this.properties.Connections ?? [])];
    this._connections.sort((a, b) => {
      const lnode = this.db.getModel<FlowObjectProps>(a.Target)?.Properties;
      const rnode = this.db.getModel<FlowObjectProps>(b.Target)?.Properties;
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
  ): [BaseFlowNode | undefined, ConnectionProps | undefined] {
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
  next(): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    return [this.db.getObject(this.properties.Owner, BaseFlowNode), undefined];
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
 * @typeparam PropertiesType Property block interface
 * @typeparam TemplateType Template block interface
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
 * Base class for all Hubs
 * @typeparam TemplateType Template block interface
 */
@ArticyType('Hub')
export class Hub<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<PinnedObjectProps, TemplateType> {
  next(): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    if (this.OutputPins.length === 0) {
      return [undefined, undefined];
    }

    return [this.OutputPins[0], undefined];
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
 * @typeparam TemplateType Template block interface
 */
@ArticyType('Condition')
export class Condition<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<ScriptNodeProps, TemplateType> {
  next(
    context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    shadowing: boolean
  ): [BaseFlowNode | undefined, ConnectionProps | undefined] {
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
    return [this.OutputPins[result ? 0 : 1], undefined];
  }

  // Always one branch. True or False.
  numBranches(): number {
    return 1;
  }
}

/**
 * Instruction that runs a script before moving onto the next node
 * @typeparam TemplateType Template block interface
 */
@ArticyType('Instruction')
export class Instruction<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<ScriptNodeProps, TemplateType> {
  next(
    context: ExecuteContext,
    _branchIndex: number,
    _last: Id | null,
    shadowing: boolean
  ): [BaseFlowNode | undefined, ConnectionProps | undefined] {
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
    return [this.OutputPins[0], undefined];
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
 * @typeparam TemplateType Template block interface
 */
@ArticyType('Jump')
export class Jump<
  TemplateType extends TemplateProps = TemplateProps
> extends BasePinnedObject<JumpProps, TemplateType> {
  constructor(args: ArticyCreatorArguments<JumpProps, TemplateType>) {
    super(args);

    this.TargetPin = args.db.getObject(this.properties.TargetPin, InputPin);
  }

  next(): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    // Go to the target pin
    return [this.TargetPin, undefined];
  }

  // One branch as long as we have a target
  numBranches(): number {
    return this.TargetPin ? 1 : 0;
  }

  public TargetPin: InputPin | undefined;
}

/**
 * Fragment of dialogue spoken by an entity
 * @typeparam TemplateType Template block interface
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

  next(): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    if (this.OutputPins.length === 0) {
      return [undefined, undefined];
    }
    return [this.OutputPins[0], undefined];
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
 * @typeparam PropertiesType Property block interface
 * @typeparam TemplateType Template block interface
 */
export class BaseFragment<
  PropertiesType extends PinnedObjectProps,
  TemplateType extends TemplateProps
> extends BasePinnedObject<PropertiesType, TemplateType> {
  next(
    _context: ExecuteContext,
    branchIndex: number,
    last: Id
  ): [BaseFlowNode | undefined, ConnectionProps | undefined] {
    if (this.InputPins.length === 0) {
      return [undefined, undefined];
    }

    // Find the pin we came in from
    const inputPinToFollow =
      last === null
        ? this.InputPins[0]
        : this.InputPins.find(x => x.properties.Id === last);

    // If we can't... die?
    if (!inputPinToFollow) {
      return [undefined, undefined];
    }

    // SPECIAL: Input pin goes nowhere, go to output pin
    if (inputPinToFollow.connections().length === 0) {
      if (this.OutputPins.length === 0) {
        return [undefined, undefined];
      }
      return [this.OutputPins[0], undefined];
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
 * Flow fragment with attachments, text, and children.
 * @typeparam TemplateType Template block interface
 */
@ArticyType('FlowFragment')
export class FlowFragment<
  TemplateType extends TemplateProps = TemplateProps
> extends BaseFragment<FlowFragmentProps, TemplateType> {}

/**
 * Dialogue node with attachments, text, and children
 * @typeparam TemplateType Template block interface
 */
@ArticyType('Dialogue')
export class Dialogue<
  TemplateType extends TemplateProps = TemplateProps
> extends BaseFragment<DialogueProps, TemplateType> {}
