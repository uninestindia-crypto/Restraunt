// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/utils/helpers';
import { hashPin } from '../src/utils/crypto';

test('escapeHtml handles advanced nested XSS vectors and quotes', () => {
  // Test nested HTML characters
  assert.equal(
    escapeHtml('<div><script>alert("hello")</script></div>'),
    '&lt;div&gt;&lt;script&gt;alert(&quot;hello&quot;)&lt;/script&gt;&lt;/div&gt;'
  );

  // Test special quotes and double quotes inside attributes
  assert.equal(
    escapeHtml('class="test" style=\'color:red\''),
    'class=&quot;test&quot; style=&#39;color:red&#39;'
  );

  // Test ampersands
  assert.equal(
    escapeHtml('momo & chai'),
    'momo &amp; chai'
  );
});

test('hashPin generates correct SHA-256 hash for secure owner PINs', async () => {
  // Hash for pin '0000'
  const hash0000 = await hashPin('0000');
  assert.equal(hash0000.length, 64, 'SHA-256 hash should be exactly 64 characters long');
  assert.match(hash0000, /^[0-9a-f]{64}$/, 'SHA-256 hash should be a lowercase hexadecimal string');
  
  // Known SHA-256 hash for '0000' is '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
  assert.equal(hash0000, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0');

  // Known SHA-256 hash for '9999' is '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05'
  const hash9999 = await hashPin('9999');
  assert.equal(hash9999, '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05');
});

test('hashPin returns empty string for empty inputs', async () => {
  assert.equal(await hashPin(''), '');
  assert.equal(await hashPin(null), '');
  assert.equal(await hashPin(undefined), '');
});
