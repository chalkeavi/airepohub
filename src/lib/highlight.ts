// Tiny shell tokenizer for install guides (decision #10). Server-side only output:
// a list of tokens the CodeBlock renders with semantic classes.

export type TokenKind = "comment" | "command" | "flag" | "string" | "url" | "var" | "text";
export interface Token {
  kind: TokenKind;
  value: string;
}

const RULES: [TokenKind, RegExp][] = [
  ["string", /^("(?:[^"\\]|\\.)*"|'[^']*')/],
  ["url", /^https?:\/\/[^\s"']+/],
  ["var", /^\$[A-Za-z_][A-Za-z0-9_]*/],
  ["flag", /^--?[A-Za-z][\w-]*/],
  ["text", /^\s+/],
  ["text", /^[^\s"']+/],
];

export function tokenizeLine(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ kind: "comment", value: line }];
  const tokens: Token[] = [];
  let rest = line;
  let expectCommand = true;
  while (rest.length > 0) {
    let matched = false;
    for (const [kind, re] of RULES) {
      const m = rest.match(re);
      if (!m) continue;
      const value = m[0];
      let k: TokenKind = kind;
      if (kind === "text" && value.trim()) {
        if (expectCommand) k = "command";
        expectCommand = value === "&&" || value === "|";
      }
      tokens.push({ kind: k, value });
      rest = rest.slice(value.length);
      matched = true;
      break;
    }
    if (!matched) {
      tokens.push({ kind: "text", value: rest[0] });
      rest = rest.slice(1);
    }
  }
  return tokens;
}

export function tokenize(code: string): Token[][] {
  return code.split("\n").map(tokenizeLine);
}
