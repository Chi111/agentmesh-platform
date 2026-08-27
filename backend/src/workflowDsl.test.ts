import { describe, expect, it } from 'vitest';
import {
  applyWorkflowMappings,
  assertWorkflowMappedInputSize,
  evaluateWorkflowCondition,
  readJsonPointer,
  validateWorkflowCondition,
  validateWorkflowMappings,
  WorkflowDslError,
} from './workflowDsl';

describe('bounded workflow DSL', () => {
  it('evaluates only the supported typed AST operators', () => {
    const condition = validateWorkflowCondition({
      op: 'and',
      conditions: [
        { op: 'gte', path: '/score', value: 80 },
        { op: 'in', path: '/risk', value: ['medium', 'high'] },
        { op: 'not', condition: { op: 'exists', path: '/blocked' } },
      ],
    });
    expect(evaluateWorkflowCondition(condition, { score: 82, risk: 'high' })).toBe(true);
    expect(evaluateWorkflowCondition(condition, { score: '82', risk: 'high' })).toBe(false);
  });

  it('rejects arbitrary operators, oversized ASTs and unsafe pointers', () => {
    expect(() => validateWorkflowCondition({ op: 'eval', path: '/score', value: 'process.exit()' }))
      .toThrowError(WorkflowDslError);
    expect(() => validateWorkflowCondition({ op: 'eq', path: '/__proto__/polluted', value: true }))
      .toThrow('unsafe segment');
    expect(() => validateWorkflowCondition({
      op: 'and', conditions: Array.from({ length: 20 }, () => ({
        op: 'and', conditions: Array.from({ length: 3 }, () => ({ op: 'exists', path: '/value' })),
      })),
    })).toThrow('node limit');
    expect(() => validateWorkflowCondition({ op: 'eq', path: '/summary', value: '汉'.repeat(6_000) }))
      .toThrow('serialized size limit');
  });

  it('fails closed when a leaf condition resolves to an object or array', () => {
    const equality = validateWorkflowCondition({ op: 'eq', path: '/risk', value: 'high' });
    const membership = validateWorkflowCondition({ op: 'in', path: '/risk', value: ['high', 'critical'] });
    expect(() => evaluateWorkflowCondition(equality, { risk: { level: 'high' } }))
      .toThrow('Condition operand must be a scalar value');
    expect(() => evaluateWorkflowCondition(membership, { risk: ['high'] }))
      .toThrowError(WorkflowDslError);
  });

  it('reads escaped RFC 6901 pointers without walking prototypes', () => {
    expect(readJsonPointer({ 'a/b': { '~key': 7 } }, '/a~1b/~0key')).toEqual({ found: true, value: 7 });
    expect(() => readJsonPointer({}, '/constructor/prototype')).toThrow('unsafe segment');
  });

  it('maps bounded fields into an isolated object and reports required misses', () => {
    const mappings = validateWorkflowMappings([
      { from: '/result/id', to: '/request/sourceId' },
      { from: '/optional', to: '/request/optional', required: false },
      { from: '/evidence/hash', to: '/request/hash' },
    ]);
    const result = applyWorkflowMappings(mappings, { result: { id: 'A-1' }, evidence: {} });
    expect(result.mappedInput).toEqual({ request: { sourceId: 'A-1' } });
    expect(result.missingRequired).toEqual(['/evidence/hash']);
    expect(Object.getPrototypeOf(result.mappedInput)).toBeNull();
    expect(() => validateWorkflowMappings([{ from: '/value', to: '/__proto__/polluted' }])).toThrow('unsafe segment');
    expect(() => validateWorkflowMappings([
      { from: '/value', to: '/request' },
      { from: '/id', to: '/request/id' },
    ])).toThrow('cannot overlap');
    const oversized = validateWorkflowMappings([{ from: '/value', to: '/request/value' }]);
    expect(() => applyWorkflowMappings(oversized, { value: '汉'.repeat(6_000) })).toThrow('size limit');
    expect(() => assertWorkflowMappedInputSize({ left: 'a'.repeat(9_000), right: 'b'.repeat(9_000) }))
      .toThrow('size limit');
  });
});
