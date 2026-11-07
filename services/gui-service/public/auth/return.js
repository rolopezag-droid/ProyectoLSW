'use strict';
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error') || ['recovery','signup'].includes(params.get('type'))) {
    const destination = '/auth/restablecer.html' + location.hash;
    history.replaceState(null, '', location.pathname);
    location.replace(destination);
  }
})();
