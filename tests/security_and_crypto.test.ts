// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/utils/helpers';

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
