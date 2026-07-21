import * as childProcess from 'node:child_process';
import { exec, exec as nodeExec, execSync, spawn } from 'node:child_process';
const requiredChildProcess = require('node:child_process');
const { exec: requiredExec } = require('node:child_process');

const token = process.env.API_TOKEN;
const ordinaryValue = 'ok';

// ruleid: kicad.no-node-shell-exec
exec('git status');
// ruleid: kicad.no-node-shell-exec
execSync('git status');
// ruleid: kicad.no-node-shell-exec
nodeExec('git status');
// ruleid: kicad.no-node-shell-exec
childProcess.exec('git status');
// ruleid: kicad.no-node-shell-exec
requiredExec('git status');
// ruleid: kicad.no-node-shell-exec
requiredChildProcess.exec('git status');

// ok: kicad.no-node-shell-exec
spawn('git', ['status'], { shell: false });
// ok: kicad.no-node-shell-exec
/status/.exec('status');

// ruleid: kicad.no-dynamic-code-evaluation
eval('1 + 1');
// ruleid: kicad.no-dynamic-code-evaluation
new Function('return 1')();
// ruleid: kicad.no-dynamic-code-evaluation
Function('return 1')();

// ok: kicad.no-dynamic-code-evaluation
JSON.parse('{"safe":true}');

// ruleid: kicad.no-sensitive-console-logging
console.log(token);
// ok: kicad.no-sensitive-console-logging
console.log(ordinaryValue);
// ok: kicad.no-sensitive-console-logging
console.log('token label only');
