'use strict';
const { Router } = require('express');

function applicationUrl() {
  const url = new URL(process.env.APP_PUBLIC_URL || `http://localhost:${Number(process.env.GUI_PORT || 3005)}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('APP_PUBLIC_URL inválida.');
  return url.origin;
}

function recoveryRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const database = req => (req.app.locals.databaseFactory || require('../../spread-service/src/db').createDatabase)();
  const sessionError = res => res.status(401).json({ message: 'El enlace es inválido o venció. Solicita un nuevo correo de recuperación.' });
  const providerError = (res, error) => {
    if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code)) return res.status(429).json({ message: 'Se alcanzó el límite de solicitudes o correos. Espera unos minutos antes de volver a intentarlo.' });
    return res.status(503).json({ message: 'No se pudo completar la solicitud con Supabase. Inténtalo más tarde.' });
  };
  router.post('/password-reset', async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({ message: 'Escribe un correo válido.' });
    try {
      const db = database(req);
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: applicationUrl() + '/auth/restablecer.html' });
      if (error) return providerError(res, error);
      return res.status(202).json({ message: 'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña. Revisa también spam y utiliza el correo más reciente.' });
    } catch { return providerError(res); }
  });
  router.post('/password-reset/confirm', async (req, res) => {
    const { password, confirmPassword, accessToken, refreshToken, tokenHash } = req.body || {};
    if (typeof password !== 'string' || password.length < 8 || password.length > 256 || password !== confirmPassword) return res.status(400).json({ message: 'Escribe dos contraseñas iguales de 8 a 256 caracteres.' });
    const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 8192;
    if (!(validToken(tokenHash) || (validToken(accessToken) && validToken(refreshToken)))) return sessionError(res);
    try {
      const db = database(req);
      const verified = validToken(tokenHash)
        ? await db.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        : await db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (verified.error) return verified.error.status >= 500 ? providerError(res, verified.error) : sessionError(res);
      if (!verified.data?.session || !verified.data?.user?.id) return sessionError(res);
      const { data, error } = await db.auth.updateUser({ password });
      if (error) {
        if (error.status === 401 || ['session_not_found', 'refresh_token_not_found', 'otp_expired'].includes(error.code)) return sessionError(res);
        if (error.code === 'same_password') return res.status(400).json({ message: 'Elige una contraseña distinta de la anterior.' });
        if (error.code === 'weak_password') return res.status(400).json({ message: 'La contraseña no cumple los requisitos de seguridad del proyecto. Elige una más segura.' });
        return providerError(res, error);
      }
      if (!data?.user?.id) return res.status(502).json({ message: 'No se pudo confirmar el cambio de contraseña. Intenta iniciar sesión antes de repetirlo.' });
      // Invalidar la sesión usada para recuperar, sin cerrar sesiones de otros dispositivos.
      let signedOut = false;
      try { signedOut = !(await db.auth.signOut({ scope: 'local' })).error; } catch {}
      return res.json({ message: 'Contraseña actualizada. Vuelve al dashboard e inicia sesión con tu nueva contraseña.', signedOut });
    } catch { return providerError(res); }
  });
  return router;
}
module.exports = { recoveryRouter, applicationUrl };
