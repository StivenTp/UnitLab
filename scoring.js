'use strict';

/** Califica en el servidor; el navegador no puede fijar la nota de un intento. */
function gradeAttempt(questions, answers) {
  if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length || !questions.length) {
    throw new Error('El intento no contiene respuestas válidas.');
  }
  const questionMap = new Map(questions.map(q => [q.id, q]));
  const answeredMap = new Map();
  for (const record of answers) {
    if (!record || typeof record.id !== 'string' || answeredMap.has(record.id) || !questionMap.has(record.id)) {
      throw new Error('Preguntas duplicadas o desconocidas.');
    }
    const q = questionMap.get(record.id);
    if (q.status !== 'correct' || !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) {
      throw new Error('El intento contiene preguntas en revisión.');
    }
    if (record.option !== null && (!Number.isInteger(record.option) || record.option < 0 || record.option >= q.options.length)) {
      throw new Error('Opción de respuesta inválida.');
    }
    answeredMap.set(record.id, record.option);
  }
  const wrongIds = questions.filter(q => answeredMap.get(q.id) !== q.correct).map(q => q.id);
  return { total: questions.length, correct: questions.length - wrongIds.length, wrongIds };
}
module.exports = { gradeAttempt };
