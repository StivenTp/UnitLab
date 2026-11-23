'use strict';
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const seedQuestions = require('./data/preguntas.json');
const { gradeAttempt } = require('./scoring');

const app = express();
const PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 180 },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });
const questionSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  seedOrder: { type: Number, required: true },
  subject: String,
  unit: Number,
  question: String,
  options: [String],
  correct: { type: Number, default: null },
  origin: String,
  status: String,
  source: String,
  sourceNumber: Number,
  simaScore: Number,
  simaSelected: Number,
  explanation: String,
  reviewNote: String,
  discrepancy: Boolean
}, { collection: 'questions' });
const attemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true },
  unit: { type: String, required: true },
  origin: { type: String, required: true },
  mode: { type: String, required: true },
  total: { type: Number, required: true },
  correct: { type: Number, required: true },
  wrongIds: { type: [String], default: [] }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Attempt = mongoose.model('Attempt', attemptSchema);

const publicUser = user => ({ id: String(user._id), name: user.name, email: user.email });
const publicAttempt = a => ({
  id: String(a._id), timestamp: a.createdAt, subject: a.subject, unit: a.unit,
  origin: a.origin, mode: a.mode, total: a.total, correct: a.correct, wrongIds: a.wrongIds
});

if (PRODUCTION) app.set('trust proxy', 1); // Render termina HTTPS antes de llegar a Node.
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: PRODUCTION ? [] : null
  }
} }));
app.use(express.json({ limit: '80kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Evita modificaciones de estado desde otro sitio web (CSRF).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      try {
        const incoming = new URL(origin);
        if (incoming.host !== req.get('host') || incoming.protocol !== req.protocol + ':') {
          return res.status(403).json({ error: 'Origen de solicitud no autorizado.' });
        }
      } catch { return res.status(403).json({ error: 'Origen de solicitud no autorizado.' }); }
    }
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Demasiados intentos. Vuelve a probar en unos minutos.' }
});

let sessionMiddleware;
function makeSession() {
  sessionMiddleware = session({
    name: 'unitlab.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions', ttl: SESSION_TTL / 1000 }),
    cookie: { httpOnly: true, secure: PRODUCTION, sameSite: 'lax', maxAge: SESSION_TTL }
  });
  app.use(sessionMiddleware);
}

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}
function startUserSession(req, res, user, code) {
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'No se pudo iniciar la sesión.' });
    req.session.userId = String(user._id);
    req.session.save(err2 => {
      if (err2) return res.status(500).json({ error: 'No se pudo guardar la sesión.' });
      res.status(code).json({ user: publicUser(user) });
    });
  });
}
function setupRoutes() {
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'database_disconnected' });
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180 ||
        typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Verifica el nombre, correo y contraseña (8 a 72 bytes).' });
    }
    const exists = await User.exists({ email });
    if (exists) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try { user = await User.create({ name, email, passwordHash }); }
    catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
      throw err;
    }
    startUserSession(req, res, user, 201);
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || password.length > 200) {
      return res.status(400).json({ error: 'Correo y contraseña obligatorios.' });
    }
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    startUserSession(req, res, user, 200);
  });

  app.post('/api/auth/logout', requireAuth, (req, res, next) => {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('unitlab.sid', { path: '/', sameSite: 'lax', secure: PRODUCTION, httpOnly: true });
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Sesión no válida.' });
    res.json({ user: publicUser(user) });
  });

  app.get('/api/questions', requireAuth, async (req, res) => {
    const questions = await Question.find({}, { _id: 0, __v: 0, seedOrder: 0 }).sort({ seedOrder: 1 }).lean();
    res.json({ questions });
  });

  app.get('/api/attempts', requireAuth, async (req, res) => {
    const attempts = await Attempt.find({ user: req.session.userId }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ attempts: attempts.map(publicAttempt) });
  });

  app.post('/api/attempts', requireAuth, async (req, res) => {
    const { answers, subject, unit, origin, mode } = req.body || {};
    if (!Array.isArray(answers) || answers.length < 1 || answers.length > 451 ||
        answers.some(a => !a || typeof a.id !== 'string' || !Object.hasOwn(a, 'option')) ||
        typeof subject !== 'string' || subject.length > 100 ||
        typeof unit !== 'string' || !['all','1','2','3','4'].includes(unit) ||
        !['all','exam','plus'].includes(origin) || !['practice','exam'].includes(mode)) {
      return res.status(400).json({ error: 'Los datos del cuestionario son inválidos.' });
    }
    const ids = answers.map(a => a.id);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Hay preguntas repetidas.' });
    const found = await Question.find({ id: { $in: ids } }).lean();
    if (found.length !== ids.length) return res.status(400).json({ error: 'Hay preguntas no reconocidas.' });
    const byId = new Map(found.map(q => [q.id, q]));
    let score;
    try { score = gradeAttempt(ids.map(id => byId.get(id)), answers); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const attempt = await Attempt.create({ user: req.session.userId, subject, unit, origin, mode, ...score });
    res.status(201).json({ attempt: publicAttempt(attempt) });
  });

  app.delete('/api/attempts', requireAuth, async (req, res) => {
    await Attempt.deleteMany({ user: req.session.userId });
    res.json({ ok: true });
  });

  // Sólo public/ es visible por HTTP. data/ y .env nunca son servidos.
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '3h' }));
  app.use((req, res) => { res.status(404).json({ error: 'Ruta no encontrada.' }); });
  app.use((err, req, res, next) => {
    console.error('Error en solicitud:', err.message);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
    res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
  });
}

async function seedBank() {
  const existing = new Set((await Question.find({}, { id: 1, _id: 0 }).lean()).map(q => q.id));
  const missing = seedQuestions.flatMap((q, index) => existing.has(q.id) ? [] : [{ ...q, seedOrder: index }]);
  if (missing.length) await Question.insertMany(missing, { ordered: false });
  const total = await Question.countDocuments();
  console.log(`Banco de preguntas: ${total} registros en MongoDB (${missing.length} importados en este arranque).`);
}

async function main() {
  if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('Configuración faltante: MONGODB_URI y SESSION_SECRET (mínimo 32 caracteres).');
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  await Promise.all([User.init(), Question.init(), Attempt.init()]);
  await seedBank();
  makeSession();
  setupRoutes();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`UnitLab activo en el puerto ${port}.`));
}
if (require.main === module) main().catch(err => {
  console.error('No fue posible iniciar UnitLab. Comprueba MONGODB_URI, credenciales de Atlas y Network Access:', err.message);
  process.exitCode = 1;
});
module.exports = { app, main };
