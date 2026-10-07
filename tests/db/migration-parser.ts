// Minimal parser for our own migrations, used by the RLS guard tests. Not a general SQL parser:
// it understands the statement shapes we write (create table, alter table ... row level security,
// create policy, and `do $$ ... foreach t in array array[...] loop ... format(...) ... end loop` blocks).

export type Policy = {
  name: string;
  table: string;
  command: string;
  body: string;
};
export type Schema = {
  tables: Map<string, string>; // name -> column/constraint body
  createTableStatements: number;
  rlsEnabled: Set<string>;
  policies: Policy[];
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

// Expand `foreach t in array array['a','b'] loop execute format(...); end loop` into plain statements.
export function expandLoops(sql: string): string {
  const doBlock = /\bdo\s+\$\$([\s\S]*?)end\s*\$\$\s*;/gi;
  return sql.replace(doBlock, (whole, inner: string) => {
    const loop =
      /foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s+loop([\s\S]*?)end\s+loop/i.exec(
        inner,
      );
    if (!loop) return whole;
    const names = [...loop[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const templates = [
      ...loop[2].matchAll(
        /format\(\s*(?:'((?:[^']|'')*)'|\$(\w*)\$([\s\S]*?)\$\2\$)/gi,
      ),
    ].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[3]));
    return names
      .flatMap((n) =>
        templates.map((t) =>
          t.replace(/%I\s+on\s+%I/gi, `${n}_policy on ${n}`).replace(/%I/g, n),
        ),
      )
      .map((s) => `${s};`)
      .join("\n");
  });
}

function balancedBody(sql: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")" && --depth === 0)
      return sql.slice(openParen + 1, i);
  }
  throw new Error(`Unbalanced parentheses at ${openParen}`);
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

  const policies: Policy[] = [];
  const policyRe = new RegExp(
    String.raw`\bcreate\s+policy\s+(${IDENT})\s+on\s+(${QUALIFIED})([^;]*);`,
    "gi",
  );
  for (const m of sql.matchAll(policyRe)) {
    const body = m[3];
    const cmd = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(body);
    policies.push({
      name: normalizeIdent(m[1]),
      table: normalizeIdent(m[2]),
      command: cmd ? cmd[1].toLowerCase() : "all",
      body,
    });
  }

  return { tables, createTableStatements, rlsEnabled, policies };
}
