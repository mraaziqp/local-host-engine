#!/usr/bin/env node

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runCli } from '../src/cli/index.ts';

runCli(process.argv.slice(2)).catch((err) => {
  console.error('\x1b[31m[LocalHost CLI Error]\x1b[0m', err.message);
  process.exit(1);
});
