import { describe, expect, it } from 'vitest';

import { getNestedProperty, parsePath, resolveCopyValue, setNestedProperty } from '../src/utils';

describe('getNestedProperty', () => {
  it('retrieves nested properties', () => {
    const obj = { hero: { title: 'Hello', details: { rank: 1 } } };
    expect(getNestedProperty(obj, 'hero.title')).toBe('Hello');
    expect(getNestedProperty(obj, 'hero.details.rank')).toBe(1);
    expect(getNestedProperty(obj, 'hero.nonexistent')).toBeUndefined();
  });

  it('does not read inherited properties', () => {
    expect(getNestedProperty({}, 'toString')).toBeUndefined();
    expect(getNestedProperty({ a: {} }, 'a.__proto__')).toBeUndefined();
  });
});

describe('setNestedProperty', () => {
  it('creates nested objects and assigns the value', () => {
    const obj: any = {};
    setNestedProperty(obj, 'hero.title', 'New Title');
    expect(obj.hero.title).toBe('New Title');

    setNestedProperty(obj, 'hero.cta.label', 'Start Now');
    expect(obj.hero.cta.label).toBe('Start Now');
  });

  it.each(['__proto__.polluted', 'a.constructor.prototype.polluted', 'prototype', 'a..b', '.a', 'a.', ''])(
    'rejects %j',
    (bad) => {
      expect(() => setNestedProperty({}, bad, 'x')).toThrow(/Invalid copy path/);
      expect(({} as any).polluted).toBeUndefined();
    },
  );

  it('refuses to replace a string with an object', () => {
    const obj = { hero: 'Plain' };
    expect(() => setNestedProperty(obj, 'hero.title', 'x')).toThrow(/is not an object/);
    expect(obj.hero).toBe('Plain');
  });
});

describe('parsePath', () => {
  it('splits valid paths', () => {
    expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
    expect(parsePath('claims.01.title')).toEqual(['claims', '01', 'title']);
  });
});

describe('resolveCopyValue', () => {
  const data = { title: 'Top', text: { hero: { title: 'Nested', n: 3 } } };

  it('resolves from the top of the file without a root', () => {
    expect(resolveCopyValue(data, 'title')).toBe('Top');
    expect(resolveCopyValue(data, 'text.hero.title')).toBe('Nested');
  });

  it('resolves under the root when one is given', () => {
    expect(resolveCopyValue(data, 'hero.title', 'text')).toBe('Nested');
    expect(resolveCopyValue(data, 'hero.n', 'text')).toBe('3');
    expect(resolveCopyValue(data, 'title', 'text')).toBeUndefined();
  });

  it('ignores non-scalar values', () => {
    expect(resolveCopyValue(data, 'hero', 'text')).toBeUndefined();
  });
});
