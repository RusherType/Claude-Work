// Minimal parser for our own migrations, used by the RLS guard tests. Not a general SQL parser:
// it understands the statement shapes we write (create table, alter table ... row level security,
// create policy, and `do $$ ... foreach t in array array[...] loop ... format(...) ... end loop`).
// Anything it cannot reason about safely (renaming a table, altering workspace_id) is reported in
// `needsReview` so the guard fails and a human looks at it.

export type Policy = {
  name: string;
  table: string;
  command: string;
  using: string | null;
  check: string | null;
};
export type Schema = {
  tables: Map<string, string>; // name -> column/constraint body
  createTableStatements: number;
  rlsEnabled: Set<string>;
  policies: Policy[];
  needsReview: string[];
};

const IDENT = String.raw`(?:"[^"]+"|\w+)`;
const QUALIFIED = String.raw`(?:${IDENT}\s*\.\s*)?${IDENT}`;

export function normalizeIdent(raw: string): string {
  const parts = raw.split(".").map((p) => p.trim().replace(/^"|"$/g, ""));
  const name = parts[parts.length - 1];
  return raw.trim().endsWith('"') ? name : name.toLowerCase();
}

export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

// Inside each `do $$ ... end $$;` block, replace every foreach loop with one plain statement per
// table name. The rest of the block is kept, so statements outside a loop are still seen.
export function expandLoops(sql: string): string {
  const doBlock = /\bdo\s+\$\$[\s\S]*?end\s*\$\$\s*;/gi;
  const loop =
    /foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s+loop([\s\S]*?)end\s+loop\s*;?/gi;
  return sql.replace(doBlock, (block) =>
    block.replace(loop, (_whole, list: string, body: string) => {
      const names = [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]);
      const templates = [
        ...body.matchAll(
          /format\(\s*(?:'((?:[^']|'')*)'|\$(\w*)\$([\s\S]*?)\$\2\$)/gi,
        ),
      ].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[3]));
      return names
        .flatMap((n) =>
          templates.map((t) =>
            t
              .replace(/%I\s+on\s+%I/gi, `${n}_policy on ${n}`)
              .replace(/%I/g, n),
          ),
        )
        .map((s) => `\n${s};\n`)
        .join("");
    }),
  );
}

export function balancedBody(sql: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")" && --depth === 0)
      return sql.slice(openParen + 1, i);
  }
  throw new Error(`Unbalanced parentheses at ${openParen}`);
}

function policyExpression(rest: string, keyword: RegExp): string | null {
  const m = keyword.exec(rest);
  return m ? balancedBody(rest, m.index + m[0].length - 1).trim() : null;
}

// True if `expr` has an OR outside any parentheses or string literal.
export function hasTopLevelOr(expr: string): boolean {
  const s = expr.replace(/'(?:[^']|'')*'/g, "''");
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (
      depth === 0 &&
      /^or\b/i.test(s.slice(i)) &&
      (i === 0 || /\W/.test(s[i - 1]))
    )
      return true;
  }
  return false;
}

export function parseMigrations(files: string[]): Schema {
  const sql = files.map((f) => expandLoops(stripComments(f))).join("\n");

  const createTableStatements = [
    ...sql.matchAll(/\bcreate\s+(?:(?:unlogged|temp|temporary)\s+)?table\b/gi),
  ].length;

  const tables = new Map<string, string>();
  const tableRe = new RegExp(
    String.raw`\bcreate\s+(?:(?:unlogged|temp|temporary)\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QUALIFIED})\s*\(`,
    "gi",
  );
  for (const m of sql.matchAll(tableRe)) {
    tables.set(
      normalizeIdent(m[1]),
      balancedBody(sql, m.index + m[0].length - 1),
    );
  }

  // RLS enable/disable, applied in file order.
  const rlsEnabled = new Set<string>();
  const rlsRe = new RegExp(
    String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QUALIFIED})\s+(enable|disable)\s+row\s+level\s+security`,
    "gi",
  );
  for (const m of sql.matchAll(rlsRe)) {
    const t = normalizeIdent(m[1]);
    if (m[2].toLowerCase() === "enable") rlsEnabled.add(t);
    else rlsEnabled.delete(t);
  }

  // Statements this parser does not model; the guard fails on them so a human reviews the change.
  const needsReview = [...sql.matchAll(/\balter\s+table\b[^;]*;/gi)]
    .map((m) => m[0].replace(/\s+/g, " ").trim())
    .filter((s) => /\brename\b|\bworkspace_id\b|\bdrop\s+column\b/i.test(s));

  const policies: Policy[] = [];
  const policyRe = new RegExp(
    String.raw`\bcreate\s+policy\s+(${IDENT})\s+on\s+(${QUALIFIED})([^;]*);`,
    "gi",
  );
  for (const m of sql.matchAll(policyRe)) {
    const rest = m[3];
    const cmd =
      /^\s*(?:as\s+\w+\s+)?for\s+(all|select|insert|update|delete)\b/i.exec(
        rest,
      );
    policies.push({
      name: normalizeIdent(m[1]),
      table: normalizeIdent(m[2]),
      command: cmd ? cmd[1].toLowerCase() : "all",
      using: policyExpression(rest, /\busing\s*\(/i),
      check: policyExpression(rest, /\bwith\s+check\s*\(/i),
    });
  }

  return { tables, createTableStatements, rlsEnabled, policies, needsReview };
}
