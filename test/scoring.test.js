'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeAttempt } = require('../scoring');
const [q1,q2] = [
  {id:'a',status:'correct',correct:1,options:['X','Y']},
  {id:'b',status:'correct',correct:0,options:['Z','W']}
];
test('cuenta correctas, incorrectas y omitidas', () => {
  assert.deepEqual(gradeAttempt([q1,q2],[{id:'a',option:1},{id:'b',option:null}]),{total:2,correct:1,wrongIds:['b']});
});
test('no acepta IDs duplicados', () => {
  assert.throws(()=>gradeAttempt([q1,q2],[{id:'a',option:1},{id:'a',option:0}]));
});
test('no acepta opciones fuera de rango', () => {
  assert.throws(()=>gradeAttempt([q1],[{id:'a',option:9}]));
});
test('no califica preguntas de revisión', () => {
  assert.throws(()=>gradeAttempt([{...q1,status:'review'}],[{id:'a',option:1}]));
});
