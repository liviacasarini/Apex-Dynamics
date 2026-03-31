const fs = require('fs');
const path = require('path');

const txt = fs.readFileSync(path.join(__dirname, '..', 'public', 'license.txt'), 'utf8');
const lines = txt.split('\n');

function escRtf(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

let body = '';
for (const line of lines) {
  const t = line.trimEnd();
  if (t === '') { body += '\\par\n'; continue; }
  if (t.startsWith('---')) { body += '\\par\n'; continue; }
  const isHeader = /^(CLAUSULA|CONTRATO|LEIA|TERMOS)/.test(t);
  if (isHeader) {
    body += '\\b ' + escRtf(t) + '\\b0\\par\n';
  } else {
    body += escRtf(t) + '\\par\n';
  }
}

const rtf = '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
  '{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\n' +
  '\\viewkind4\\uc1\\pard\\sa100\\sl240\\slmult1\\f0\\fs18 \n' +
  body +
  '}';

fs.writeFileSync(path.join(__dirname, '..', 'public', 'license.rtf'), rtf);
console.log('license.rtf criado, bytes:', rtf.length);
