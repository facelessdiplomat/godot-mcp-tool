import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import noComments from '../../eslint-rules/no-comments.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: 'module' } });

ruleTester.run('no-comments', noComments, {
  valid: [
    { code: 'const playerSpeed = 5;' },
    { code: '#!/usr/bin/env node\nconst ready = true;' },
    { code: '// @ts-expect-error\nconst value = missing;' },
    { code: 'const url = "http://example.com/#anchor";' },
  ],
  invalid: [
    { code: '// explains the code\nconst speed = 5;', errors: [{ messageId: 'noComments' }] },
    { code: 'const speed = 5; /* tuned */', errors: [{ messageId: 'noComments' }] },
    { code: '/** Docs */\nfunction run() {}', errors: [{ messageId: 'noComments' }] },
  ],
});
