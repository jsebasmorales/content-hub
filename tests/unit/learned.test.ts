import { describe, expect, it } from 'vitest';
import {
  LEARNED_FIELD_MAX,
  contentProblem,
  normalizeContent,
  sameContent,
} from '@domain/learned/learned';
import { learnedFlashFromQuery, learnedRedirect } from '@presentation/learned-messages';

const text = (conclusions = '', nextFocus = '', notes = '') => ({ conclusions, nextFocus, notes });

describe('normalizeContent', () => {
  it('trims each box and gives every device the same line breaks', () => {
    expect(normalizeContent(text('  Hola\r\nmundo  ', '\n\nFoco\r\n', ' '))).toEqual(
      text('Hola\nmundo', 'Foco', ''),
    );
  });

  it('keeps accents, line breaks inside the text and markup characters as they are', () => {
    const written = text('Línea 1\n\nLínea 3 <b>x</b> & "y"');
    expect(normalizeContent(written)).toEqual(written);
  });
});

describe('contentProblem', () => {
  it('accepts text in any one box', () => {
    expect(contentProblem(text('algo'))).toBeNull();
    expect(contentProblem(text('', '', 'solo notas'))).toBeNull();
  });

  it('refuses three empty boxes', () => {
    expect(contentProblem(text())).toBe('empty');
  });

  it('refuses a box longer than the limit, and accepts exactly the limit', () => {
    expect(contentProblem(text('x'.repeat(LEARNED_FIELD_MAX)))).toBeNull();
    expect(contentProblem(text('', 'x'.repeat(LEARNED_FIELD_MAX + 1)))).toBe('too-long');
  });
});

describe('sameContent', () => {
  it('tells a real change from a repeated save', () => {
    expect(sameContent(text('a', 'b', 'c'), text('a', 'b', 'c'))).toBe(true);
    expect(sameContent(text('a', 'b', 'c'), text('a', 'b', 'd'))).toBe(false);
    expect(sameContent(text('a'), text('', 'a'))).toBe(false);
  });
});

describe('the messages of /aprendido', () => {
  it('redirects to the quarter that was edited, with the outcome', () => {
    expect(learnedRedirect('2026-T3', 'saved')).toBe('/aprendido?trimestre=2026-T3&learned=saved');
    expect(learnedRedirect(null, 'invalid-request')).toBe('/aprendido?learned=invalid-request');
  });

  it('shows text only for known codes, never what the address says', () => {
    expect(learnedFlashFromQuery(new URLSearchParams('learned=saved'))?.kind).toBe('ok');
    expect(learnedFlashFromQuery(new URLSearchParams('learned=empty'))?.kind).toBe('error');
    expect(learnedFlashFromQuery(new URLSearchParams('learned=<b>x</b>'))).toBeNull();
    expect(learnedFlashFromQuery(new URLSearchParams('learned=toString'))).toBeNull();
    expect(learnedFlashFromQuery(new URLSearchParams(''))).toBeNull();
  });
});
