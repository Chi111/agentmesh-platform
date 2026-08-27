export type WorkflowConditionOperator = 'exists' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

export type WorkflowCondition =
  | { op: WorkflowConditionOperator; path: string; value?: unknown }
  | { op: 'and' | 'or'; conditions: WorkflowCondition[] }
  | { op: 'not'; condition: WorkflowCondition };

export interface WorkflowFieldMapping {
  from: string;
  to: string;
  required: boolean;
}

export interface WorkflowMappingResult {
  mappedInput: Record<string, unknown>;
  missingRequired: string[];
}

const DANGEROUS_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_CONDITION_DEPTH = 6;
const MAX_CONDITION_NODES = 40;
const MAX_CONDITION_BYTES = 16_000;
const MAX_POINTER_DEPTH = 12;
const MAX_POINTER_LENGTH = 500;
const MAX_MAPPINGS = 20;
const MAX_MAPPED_BYTES = 16_000;

export class WorkflowDslError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decodePointerSegment(segment: string): string {
  if (/~(?![01])/u.test(segment)) throw new WorkflowDslError('INVALID_JSON_POINTER', 'JSON Pointer contains an invalid escape');
  const decoded = segment.replaceAll('~1', '/').replaceAll('~0', '~');
  if (!decoded || DANGEROUS_POINTER_SEGMENTS.has(decoded)) {
    throw new WorkflowDslError('UNSAFE_JSON_POINTER', 'JSON Pointer contains an empty or unsafe segment');
  }
  return decoded;
}

export function jsonPointerSegments(pointer: string, allowRoot = false): string[] {
  if (typeof pointer !== 'string' || pointer.length > MAX_POINTER_LENGTH || (!allowRoot && pointer === '')) {
    throw new WorkflowDslError('INVALID_JSON_POINTER', 'JSON Pointer is missing or too long');
  }
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new WorkflowDslError('INVALID_JSON_POINTER', 'JSON Pointer must start with /');
  const segments = pointer.slice(1).split('/').map(decodePointerSegment);
  if (segments.length > MAX_POINTER_DEPTH) throw new WorkflowDslError('JSON_POINTER_TOO_DEEP', 'JSON Pointer exceeds the depth limit');
  return segments;
}

export function readJsonPointer(root: unknown, pointer: string): { found: boolean; value?: unknown } {
  const segments = jsonPointerSegments(pointer, true);
  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    const record = objectValue(current);
    if (!record || !Object.hasOwn(record, segment)) return { found: false };
    current = record[segment];
  }
  return { found: true, value: current };
}

function scalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function normalizedComparable(value: unknown): string | number | boolean | null | undefined {
  return scalar(value) ? value : undefined;
}

export function validateWorkflowCondition(value: unknown): WorkflowCondition {
  let serialized: string;
  try {
    const candidate = JSON.stringify(value);
    if (candidate === undefined) throw new Error('not serializable');
    serialized = candidate;
  } catch {
    throw new WorkflowDslError('INVALID_CONDITION', 'Condition must be JSON serializable');
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_CONDITION_BYTES) {
    throw new WorkflowDslError('CONDITION_TOO_LARGE', 'Condition exceeds the serialized size limit');
  }
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): WorkflowCondition => {
    nodes += 1;
    if (nodes > MAX_CONDITION_NODES) throw new WorkflowDslError('CONDITION_TOO_LARGE', 'Condition exceeds the node limit');
    if (depth > MAX_CONDITION_DEPTH) throw new WorkflowDslError('CONDITION_TOO_DEEP', 'Condition exceeds the depth limit');
    const record = objectValue(candidate);
    if (!record || typeof record.op !== 'string') throw new WorkflowDslError('INVALID_CONDITION', 'Condition must be an operator object');
    if (record.op === 'and' || record.op === 'or') {
      if (!Array.isArray(record.conditions) || record.conditions.length < 1 || record.conditions.length > 20) {
        throw new WorkflowDslError('INVALID_CONDITION', `${record.op} requires 1-20 conditions`);
      }
      return { op: record.op, conditions: record.conditions.map((item) => visit(item, depth + 1)) };
    }
    if (record.op === 'not') return { op: 'not', condition: visit(record.condition, depth + 1) };
    if (!['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'].includes(record.op)) {
      throw new WorkflowDslError('INVALID_CONDITION_OPERATOR', 'Condition operator is not allowed');
    }
    if (typeof record.path !== 'string') throw new WorkflowDslError('INVALID_CONDITION', 'Leaf condition requires a JSON Pointer path');
    jsonPointerSegments(record.path, true);
    if (record.op === 'exists') return { op: 'exists', path: record.path };
    if (record.op === 'in') {
      if (!Array.isArray(record.value) || record.value.length < 1 || record.value.length > 20 || !record.value.every(scalar)) {
        throw new WorkflowDslError('INVALID_CONDITION_VALUE', 'in requires 1-20 scalar values');
      }
      return { op: 'in', path: record.path, value: structuredClone(record.value) };
    }
    if (!scalar(record.value)) throw new WorkflowDslError('INVALID_CONDITION_VALUE', `${record.op} requires a scalar value`);
    return { op: record.op as WorkflowConditionOperator, path: record.path, value: record.value };
  };
  return visit(value, 1);
}

export function evaluateWorkflowCondition(condition: WorkflowCondition, output: unknown): boolean {
  if (condition.op === 'and') return condition.conditions.every((item) => evaluateWorkflowCondition(item, output));
  if (condition.op === 'or') return condition.conditions.some((item) => evaluateWorkflowCondition(item, output));
  if (condition.op === 'not') return !evaluateWorkflowCondition(condition.condition, output);
  const resolved = readJsonPointer(output, condition.path);
  if (condition.op === 'exists') return resolved.found;
  if (!resolved.found) return false;
  if (!scalar(resolved.value)) {
    throw new WorkflowDslError('INVALID_CONDITION_OPERAND', 'Condition operand must be a scalar value');
  }
  if (condition.op === 'in') return (condition.value as unknown[]).some((item) => Object.is(item, resolved.value));
  const left = normalizedComparable(resolved.value);
  const right = normalizedComparable(condition.value);
  if (left === undefined || right === undefined) return false;
  if (condition.op === 'eq') return Object.is(left, right);
  if (condition.op === 'neq') return !Object.is(left, right);
  if ((typeof left !== 'number' && typeof left !== 'string') || typeof left !== typeof right) return false;
  if (condition.op === 'gt') return left > (right as never);
  if (condition.op === 'gte') return left >= (right as never);
  if (condition.op === 'lt') return left < (right as never);
  return left <= (right as never);
}

export function assertWorkflowMappedInputSize(mappedInput: Record<string, unknown>): void {
  if (new TextEncoder().encode(JSON.stringify(mappedInput)).byteLength > MAX_MAPPED_BYTES) {
    throw new WorkflowDslError('MAPPED_INPUT_TOO_LARGE', 'Mapped input exceeds the size limit');
  }
}

export function workflowMappingTargetsOverlap(left: string, right: string): boolean {
  const leftSegments = jsonPointerSegments(left);
  const rightSegments = jsonPointerSegments(right);
  const sharedLength = Math.min(leftSegments.length, rightSegments.length);
  return leftSegments.slice(0, sharedLength).every((segment, index) => segment === rightSegments[index]);
}

export function validateWorkflowMappings(value: unknown): WorkflowFieldMapping[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_MAPPINGS) {
    throw new WorkflowDslError('INVALID_FIELD_MAPPINGS', `Field mappings must contain at most ${MAX_MAPPINGS} entries`);
  }
  const targets: string[] = [];
  return value.map((candidate) => {
    const mapping = objectValue(candidate);
    if (!mapping || typeof mapping.from !== 'string' || typeof mapping.to !== 'string') {
      throw new WorkflowDslError('INVALID_FIELD_MAPPING', 'Each field mapping requires from and to pointers');
    }
    jsonPointerSegments(mapping.from, true);
    jsonPointerSegments(mapping.to);
    if (targets.some((target) => workflowMappingTargetsOverlap(target, mapping.to))) {
      throw new WorkflowDslError('DUPLICATE_MAPPING_TARGET', 'Mapping target pointers cannot overlap');
    }
    targets.push(mapping.to);
    if (mapping.required !== undefined && typeof mapping.required !== 'boolean') {
      throw new WorkflowDslError('INVALID_FIELD_MAPPING', 'Mapping required must be boolean');
    }
    return { from: mapping.from, to: mapping.to, required: mapping.required !== false };
  });
}

function writeJsonPointer(root: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = jsonPointerSegments(pointer);
  let current = root;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = structuredClone(value);
      return;
    }
    const existing = objectValue(current[segment]);
    if (existing) {
      current = existing;
      return;
    }
    const child = Object.create(null) as Record<string, unknown>;
    current[segment] = child;
    current = child;
  });
}

export function applyWorkflowMappings(mappings: WorkflowFieldMapping[], output: unknown): WorkflowMappingResult {
  const mappedInput = Object.create(null) as Record<string, unknown>;
  const missingRequired: string[] = [];
  for (const mapping of mappings) {
    const resolved = readJsonPointer(output, mapping.from);
    if (!resolved.found) {
      if (mapping.required) missingRequired.push(mapping.from);
      continue;
    }
    writeJsonPointer(mappedInput, mapping.to, resolved.value);
    assertWorkflowMappedInputSize(mappedInput);
  }
  return { mappedInput, missingRequired };
}
