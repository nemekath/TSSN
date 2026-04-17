import { parse } from '../src/parser.js';
import { tables, type Column } from '../src/ast.js';

export function firstColumn(src: string): Column {
  return tables(parse(src))[0]!.columns[0]!;
}
