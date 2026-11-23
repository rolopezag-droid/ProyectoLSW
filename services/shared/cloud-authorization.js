'use strict';

// Only cloud entrypoints apply this middleware; local workflows remain unchanged.
async function requireSession(req, res, next) {
  const header = req.get('authorization') || '';
  if (!/^Bearer \S+$/.test(header)) return res.status(401).json({ message: 'Inicia sesión en la aplicación para realizar esta operación.' });
  try {
    const db = require('../spread-service/src/db').createDatabase(header.slice(7));
    const { data, error } = await db.auth.getUser(header.slice(7));
    if (error || !data?.user?.id) return res.status(401).json({ message: 'La sesión es inválida o venció.' });
    req.cloudUser = data.user;
    next();
  } catch { res.status(503).json({ message: 'No se pudo comprobar la sesión.' }); }
}

function brokerAccess(req, res, next) {
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!write && req.path !== '/api/v1/broker/account') return next();
  if (write && process.env.PAPER_TRADING_ENABLED !== 'true') {
    return res.status(403).json({ message: 'La ejecución Paper no está habilitada en este despliegue. Puedes consultar y evaluar estrategias.' });
  }
  requireSession(req, res, () => {
    const allowed = (process.env.BROKER_ALLOWED_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!allowed.includes(req.cloudUser.id)) return res.status(403).json({ message: 'Tu cuenta no tiene acceso al broker de este despliegue.' });
    next();
  });
}
module.exports = { requireSession, brokerAccess };
