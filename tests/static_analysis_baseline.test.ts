// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Keep the static ring meaningful.
 *
 * `npx tsc --noEmit` exited 0 for a long time over a codebase where 66 of 86 source files began
 * with `@ts-nocheck`. The check was passing because it was not looking. Behind the suppression sat
 * 1,162 real errors, and among them were live defects: the dashboard's top-items chart reading a
 * field that does not exist, a `class` attribute in JSX that React silently drops, and two
 * duplicated type declarations that had drifted from the shared ones.
 *
 * These tests are the ratchet. They do not re-run the compiler — CI does that — they stop the
 * suppression coming back, because that is the failure mode that made the compiler's green
 * meaningless in the first place.
 */

const SRC = 'src';

function sourceFiles(dir = SRC, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) acc.push(path);
  }
  return acc;
}

test('no source file opts out of type checking', () => {
  const suppressed = sourceFiles().filter(f => readFileSync(f, 'utf8').includes('@ts-nocheck'));
  assert.deepEqual(
    suppressed,
    [],
    'a green typecheck over suppressed files measures nothing — fix the file instead'
  );
});

test('blanket error suppression is not used as a substitute', () => {
  // `@ts-expect-error` is legitimate for a genuine lib gap and fails loudly once the gap closes.
  // `@ts-ignore` is the silent version and has no such expiry.
  const offenders = sourceFiles().filter(f => readFileSync(f, 'utf8').includes('@ts-ignore'));
  assert.deepEqual(offenders, [], 'prefer @ts-expect-error, which fails when it stops being needed');
});

/**
 * Regression cover for "the top-selling items chart is wrong".
 *
 * `OrderItem` carries `quantity`; `qty` exists only as a legacy alias on rows written by older
 * builds. The dashboard read `item.qty || 1` alone, so every line counted as one — an order of ten
 * samosas moved the chart by a single unit, and the owner's "top items" was really a list of the
 * dishes that appeared on the most bills.
 */
test('the dashboard counts quantities, not line items', () => {
  const source = readFileSync('src/views/admin/Dashboard.tsx', 'utf8');

  assert.doesNotMatch(
    source,
    /\(item\.qty \|\| 1\)/,
    'reading the legacy alias alone silently counts every line as one'
  );
  assert.match(source, /item\.quantity \?\? item\.qty/, 'quantity is the field; qty is the fallback');
});

/**
 * React ignores a `class` attribute. It does not warn, it does not throw — the element simply
 * renders unstyled, which is how the storefront's dish description sat without its class for as
 * long as the file was suppressed.
 */
test('JSX uses className, and numeric attributes are expressions', () => {
  const jsx = sourceFiles().filter(f => f.endsWith('.tsx'));

  /**
   * Blank out every string, leaving offsets intact.
   *
   * Several views in this codebase compose their markup as strings, where `class=` is correct —
   * only attributes in real JSX are the bug. Counting quotes is not enough, because the templates
   * nest: `${items.map(i => `…`)}` puts a template inside an interpolation. This walks a small
   * state stack so nested templates, their interpolations, and ordinary quoted strings are all
   * removed from consideration.
   */
  const withoutTemplates = (source: string) => {
    const out = source.split('');
    // 'tpl'   — template text, blanked
    // 'expr'  — inside `${ … }`, which is ordinary code again
    // 'brace' — a `{` nested inside that expression
    const stack: string[] = [];

    for (let i = 0; i < source.length; i += 1) {
      const c = source[i];
      const escaped = source[i - 1] === '\\';
      const top = stack[stack.length - 1];

      if (top === 'tpl') {
        if (c === '`' && !escaped) { stack.pop(); continue; }
        if (c === '$' && source[i + 1] === '{' && !escaped) { stack.push('expr'); i += 1; continue; }
        if (c !== '\n') out[i] = ' ';    // keep newlines so line numbers still line up
        continue;
      }

      if (c === '`' && !escaped) { stack.push('tpl'); continue; }

      // An ordinary quoted string. Scanning forward to its close is what makes this reliable:
      // a lookbehind cannot tell an opening quote from a closing one, and getting that wrong
      // desynchronises everything after it.
      if ((c === "'" || c === '"') && !escaped) {
        let j = i + 1;
        while (j < source.length && !(source[j] === c && source[j - 1] !== '\\')) {
          if (source[j] === '\n') break;   // unterminated: not a string literal, leave it alone
          j += 1;
        }
        if (source[j] === c) {
          for (let k = i; k <= j; k += 1) out[k] = ' ';
          i = j;
          continue;
        }
      }

      if (top === 'expr' || top === 'brace') {
        if (c === '{') { stack.push('brace'); continue; }
        if (c === '}') { stack.pop(); continue; }
      }
    }
    return out.join('');
  };

  for (const file of jsx) {
    const raw = readFileSync(file, 'utf8');
    const code = withoutTemplates(raw);

    const bad = [...code.matchAll(/<[a-z][a-zA-Z0-9]*[^>]*?\sclass\s*=/g)];
    assert.equal(bad.length, 0, `${file} uses class= in JSX; React drops it — use className`);

    // Checked against the raw source: the stripper blanks the quoted value, which is exactly
    // the part this assertion is looking for.
    assert.doesNotMatch(
      raw,
      /\s(rows|cols|maxLength|minLength|colSpan|rowSpan|tabIndex)="\d/,
      `${file} passes a numeric JSX attribute as a string`
    );
  }
});

/**
 * The shared interfaces in db/database.ts are the model. A view that redeclares one locally drifts
 * the moment a field is added — which is exactly what hid `description` from the menu manager after
 * it was added for the storefront.
 */
test('views do not redeclare the shared data model', () => {
  const shared = ['MenuItem', 'MenuCategory', 'Order', 'OrderItem', 'Staff', 'Customer'];
  const views = sourceFiles('src/views');

  for (const file of views) {
    const source = readFileSync(file, 'utf8');
    for (const name of shared) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\ninterface ${name}\\s*\\{`),
        `${file} redeclares ${name}; import it from db/database instead`
      );
    }
  }
});
