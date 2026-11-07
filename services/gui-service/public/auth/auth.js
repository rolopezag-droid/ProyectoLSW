'use strict';
(() => {
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle), visible = input.type === 'password';
    input.type = visible ? 'text' : 'password'; button.textContent = visible ? 'Ocultar' : 'Mostrar'; button.setAttribute('aria-pressed', String(visible));
  }));
  const message = document.getElementById('authMessage');
  const notify = (text, state = 'info') => { message.textContent = text; message.dataset.state = state; message.hidden = false; };
  const post = async (url, body) => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal });
      const data = await response.json().catch(() => { throw new Error('El servidor devolvió una respuesta inesperada. Reinicia la aplicación y vuelve a intentarlo.'); });
      if (!response.ok) { const error = new Error(data.message || 'No se pudo completar la solicitud.'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timeout); }
  };
  const readableError = error => error.name === 'AbortError' ? 'Se agotó el tiempo de espera. No se pudo confirmar la operación. Revisa tu correo o intenta iniciar sesión antes de repetirla.' : error.name === 'TypeError' ? 'No se pudo conectar con la aplicación. Comprueba que los servicios estén encendidos.' : error.message;
  if (document.body.dataset.authPage === 'request') {
    const form = document.getElementById('recoveryForm'), button = document.getElementById('submitRecovery');
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (button.disabled || !form.reportValidity()) return;
      button.disabled = true; button.textContent = 'Solicitando enlace…'; button.setAttribute('aria-busy','true'); notify('Enviando la solicitud de recuperación…','loading');
      try { const data = await post('/api/supabase/password-reset', {email:document.getElementById('recoveryEmail').value.trim()}); notify(data.message); }
      catch (error) { notify(readableError(error),'error'); }
      finally { button.disabled = false; button.textContent = 'Enviar enlace de recuperación'; button.removeAttribute('aria-busy'); }
    });
    return;
  }
  const params = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
  // Quitar credenciales de la barra y del historial antes de cualquier petición.
  history.replaceState(null, '', location.pathname);
  let credentials = null;
  if (!params.has('error') && !query.has('error')) {
    if (params.get('type') === 'recovery' && params.get('access_token') && params.get('refresh_token')) credentials = {accessToken:params.get('access_token'), refreshToken:params.get('refresh_token')};
    else if (query.get('type') === 'recovery' && query.get('token_hash')) credentials = {tokenHash:query.get('token_hash')};
  }
  const form = document.getElementById('resetForm'), button = document.getElementById('submitReset');
  if (!credentials) {
    document.getElementById('formTitle').textContent = params.get('type') === 'signup' && !params.has('error') ? 'Correo confirmado' : 'Revisa tu enlace de recuperación';
    document.getElementById('authIntro').textContent = 'Puedes volver al dashboard o solicitar un enlace nuevo.';
    notify(params.get('type') === 'signup' && !params.has('error') ? 'El correo se confirmó. Vuelve al dashboard e inicia sesión con tu contraseña.' : 'Este enlace no contiene una recuperación válida o ya venció. Solicita otro enlace y abre el correo más reciente.','info');
    return;
  }
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (button.disabled || !form.reportValidity()) return;
    const password = document.getElementById('newPassword'), confirm = document.getElementById('confirmPassword');
    if (password.value !== confirm.value) { notify('Las contraseñas no coinciden. Revisa ambos campos.','error'); confirm.focus(); return; }
    button.disabled = true; button.textContent = 'Actualizando contraseña…'; button.setAttribute('aria-busy','true'); notify('Verificando el enlace y actualizando tu contraseña…','loading');
    try {
      const data = await post('/api/supabase/password-reset/confirm', {...credentials,password:password.value,confirmPassword:confirm.value});
      credentials = null; password.value = ''; confirm.value = ''; form.hidden = true;
      document.getElementById('formTitle').textContent = 'Tu contraseña está actualizada'; document.getElementById('authIntro').textContent = 'Ya puedes volver a tus estrategias.';
      document.getElementById('requestAgain').hidden = true; notify(data.message);
    } catch (error) { notify(readableError(error),'error'); if (error.status === 401) {credentials = null; form.hidden = true; password.value = ''; confirm.value = '';} }
    finally { button.disabled = false; button.textContent = 'Guardar nueva contraseña'; button.removeAttribute('aria-busy'); }
  });
})();
