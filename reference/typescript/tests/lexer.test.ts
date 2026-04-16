import { describe, expect, it } from 'vitest';
import { LexError, tokenize, type Token } from '../src/lexer.js';

function kinds(tokens: Token[]): string[] {
  return tokens.map((t) => t.kind);
}

function values(tokens: Token[]): string[] {
  return tokens.map((t) => t.value);
}

describe('lexer / basic tokens', () => {
  it('tokenizes punctuation', () => {
    const t = tokenize('{}()[]:;|=?,');
    expect(kinds(t)).toEqual([
      'lbrace',
      'rbrace',
      'lparen',
      'rparen',
      'lbracket',
      'rbracket',
      'colon',
      'semi',
      'pipe',
      'eq',
      'qmark',
      'comma',
      'eof',
    ]);
  });

  it('tokenizes identifiers', () => {
    const t = tokenize('interface Users id created_at');
    expect(kinds(t).slice(0, 4)).toEqual(['ident', 'ident', 'ident', 'ident']);
    expect(values(t).slice(0, 4)).toEqual(['interface', 'Users', 'id', 'created_at']);
  });

  it('tokenizes numbers including negatives', () => {
    const t = tokenize('1 23 -4 -100');
    expect(kinds(t).slice(0, 4)).toEqual(['number', 'number', 'number', 'number']);
    expect(values(t).slice(0, 4)).toEqual(['1', '23', '-4', '-100']);
  });

  it('rejects floating-point numbers', () => {
    expect(() => tokenize('1.5')).toThrow(LexError);
    expect(() => tokenize('1.5')).toThrow(/floating-point/i);
  });

  it('rejects a bare minus sign without digits', () => {
    expect(() => tokenize('- foo')).toThrow(LexError);
  });
});

describe('lexer / string literals', () => {
  it('tokenizes a simple string', () => {
    const t = tokenize("'pending'");
    expect(t[0]!.kind).toBe('string');
    expect(t[0]!.value).toBe('pending');
  });

  it('preserves content with // inside a string', () => {
    const t = tokenize("'http://example.com'");
    expect(t[0]!.kind).toBe('string');
    expect(t[0]!.value).toBe('http://example.com');
  });

  it('tokenizes a union of strings containing //', () => {
    const t = tokenize("'a//b' | 'c'");
    expect(kinds(t).slice(0, 4)).toEqual(['string', 'pipe', 'string', 'eof']);
    expect(t[0]!.value).toBe('a//b');
    expect(t[2]!.value).toBe('c');
  });

  it('rejects an unterminated string', () => {
    expect(() => tokenize("'oops")).toThrow(LexError);
    expect(() => tokenize("'oops")).toThrow(/unterminated/i);
  });

  it('rejects a newline inside a string literal', () => {
    expect(() => tokenize("'line1\nline2'")).toThrow(LexError);
  });
});

describe('lexer / quoted identifiers', () => {
  it('tokenizes a plain quoted identifier', () => {
    const t = tokenize('`Order Details`');
    expect(t[0]!.kind).toBe('quoted_ident');
    expect(t[0]!.value).toBe('Order Details');
  });

  it('handles escaped backticks via doubling', () => {
    const t = tokenize('`foo``bar`');
    expect(t[0]!.kind).toBe('quoted_ident');
    expect(t[0]!.value).toBe('foo`bar');
  });

  it('handles multiple escaped backticks', () => {
    const t = tokenize('`a``b``c`');
    expect(t[0]!.value).toBe('a`b`c');
  });

  it('rejects an unterminated quoted identifier', () => {
    expect(() => tokenize('`unterminated')).toThrow(LexError);
  });

  it('rejects an empty quoted identifier', () => {
    expect(() => tokenize('``')).toThrow(LexError);
  });

  it('rejects a newline inside a quoted identifier', () => {
    expect(() => tokenize('`line1\nline2`')).toThrow(LexError);
  });

  it('allows single quotes inside backticks', () => {
    const t = tokenize("`it's`");
    expect(t[0]!.value).toBe("it's");
  });
});

describe('lexer / comments', () => {
  it('captures a line comment until end of line', () => {
    const t = tokenize('// PRIMARY KEY\n');
    expect(t[0]!.kind).toBe('line_comment');
    expect(t[0]!.value).toBe(' PRIMARY KEY');
  });

  it('captures an empty comment', () => {
    const t = tokenize('//\n');
    expect(t[0]!.kind).toBe('line_comment');
    expect(t[0]!.value).toBe('');
  });

  it('captures a trailing comment without newline', () => {
    const t = tokenize('// trailing');
    expect(t[0]!.kind).toBe('line_comment');
    expect(t[0]!.value).toBe(' trailing');
  });

  it('stops the comment at a newline and continues scanning', () => {
    const t = tokenize('// comment one\nident_after');
    expect(kinds(t)).toEqual(['line_comment', 'ident', 'eof']);
  });
});

describe('lexer / whitespace and line endings', () => {
  it('strips a UTF-8 BOM at start of input', () => {
    const t = tokenize('\uFEFFinterface X {}');
    expect(kinds(t).slice(0, 4)).toEqual(['ident', 'ident', 'lbrace', 'rbrace']);
  });

  it('normalizes CRLF to LF for line tracking', () => {
    const t = tokenize('a\r\nb');
    expect(t[0]!.span.start.line).toBe(1);
    expect(t[1]!.span.start.line).toBe(2);
  });

  it('normalizes bare CR to LF for line tracking', () => {
    const t = tokenize('a\rb');
    expect(t[0]!.span.start.line).toBe(1);
    expect(t[1]!.span.start.line).toBe(2);
  });

  it('handles mixed line endings in one input', () => {
    const t = tokenize('a\nb\r\nc\rd');
    const lines = t.filter((x) => x.kind === 'ident').map((x) => x.span.start.line);
    expect(lines).toEqual([1, 2, 3, 4]);
  });

  it('skips tabs and spaces', () => {
    const t = tokenize('  \t  foo  \t  bar');
    expect(values(t).slice(0, 2)).toEqual(['foo', 'bar']);
  });
});

describe('lexer / span tracking', () => {
  it('reports 1-indexed line and column at token start', () => {
    const t = tokenize('  foo');
    expect(t[0]!.span.start).toMatchObject({ line: 1, column: 3 });
  });

  it('tracks columns across multiple lines', () => {
    const t = tokenize('a\n  b');
    expect(t[1]!.span.start).toMatchObject({ line: 2, column: 3 });
  });

  it('produces a zero-width EOF token at the end of input', () => {
    const t = tokenize('x');
    const eof = t[t.length - 1]!;
    expect(eof.kind).toBe('eof');
    expect(eof.span.start).toEqual(eof.span.end);
  });
});

describe('lexer / contextual keywords remain idents', () => {
  it('emits interface / view / type as ident tokens', () => {
    const t = tokenize('interface view type');
    expect(kinds(t).slice(0, 3)).toEqual(['ident', 'ident', 'ident']);
    expect(values(t).slice(0, 3)).toEqual(['interface', 'view', 'type']);
  });
});

describe('lexer / realistic input', () => {
  it('tokenizes a simple interface declaration', () => {
    const t = tokenize('interface Users { id: int; }');
    expect(kinds(t)).toEqual([
      'ident',
      'ident',
      'lbrace',
      'ident',
      'colon',
      'ident',
      'semi',
      'rbrace',
      'eof',
    ]);
  });

  it('tokenizes a literal union type', () => {
    const t = tokenize("status: 'a' | 'b' | 'c';");
    expect(kinds(t)).toEqual([
      'ident',
      'colon',
      'string',
      'pipe',
      'string',
      'pipe',
      'string',
      'semi',
      'eof',
    ]);
  });

  it('tokenizes an array type', () => {
    const t = tokenize('tags: string[];');
    expect(kinds(t)).toEqual(['ident', 'colon', 'ident', 'lbracket', 'rbracket', 'semi', 'eof']);
  });

  it('tokenizes a type alias declaration', () => {
    const t = tokenize("type Status = 'a' | 'b';");
    expect(kinds(t)).toEqual(['ident', 'ident', 'eq', 'string', 'pipe', 'string', 'semi', 'eof']);
  });
});
