import { describe, expect, it } from 'vitest';
import { typeDisplayLabel, typeDisplayLabels } from '../../src/presentation/type-label';

// The request types of the Jira project (.data/jira-probe): 7 current and one retired.
const REAL_TYPES = [
  'Edit or Change Content (Characteristics, Content)',
  'Email request',
  'Launch a New Language',
  'Launch New Content',
  'New Landing page Request',
  'Translate Marketing Materials',
  'UX Writing for Features',
  "Translate Marketing Materials - Moi - DON'T USE",
];

describe('typeDisplayLabel', () => {
  it('drops the parenthesised ending', () => {
    expect(typeDisplayLabel('Edit or Change Content (Characteristics, Content)')).toBe(
      'Edit or Change Content',
    );
  });
  it('leaves a name without parentheses alone', () => {
    expect(typeDisplayLabel('Email request')).toBe('Email request');
  });
  it('only drops the ending: parentheses in the middle stay', () => {
    expect(typeDisplayLabel('Launch (beta) Content')).toBe('Launch (beta) Content');
    expect(typeDisplayLabel('Launch (beta) Content (old)')).toBe('Launch (beta) Content');
  });
  it('copes with extra spaces', () => {
    expect(typeDisplayLabel('  Edit   (x)  ')).toBe('Edit');
    expect(typeDisplayLabel('Edit(x)')).toBe('Edit');
  });
  it('never returns an empty label', () => {
    expect(typeDisplayLabel('')).toBe('');
    expect(typeDisplayLabel('(only a gloss)')).toBe('(only a gloss)');
  });
});

describe('typeDisplayLabels', () => {
  it('gives every real type its own label', () => {
    const labels = [...typeDisplayLabels(REAL_TYPES).values()];
    expect(new Set(labels).size).toBe(REAL_TYPES.length);
    expect(typeDisplayLabels(REAL_TYPES).get(REAL_TYPES[0] ?? '')).toBe('Edit or Change Content');
  });
  it('keeps full names where two would look the same', () => {
    const labels = typeDisplayLabels(['Edit (A)', 'Edit (B)', 'Edit']);
    expect(labels.get('Edit (A)')).toBe('Edit (A)');
    expect(labels.get('Edit (B)')).toBe('Edit (B)');
    expect(labels.get('Edit')).toBe('Edit');
  });
});
