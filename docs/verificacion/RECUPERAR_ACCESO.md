# Recuperar acceso a la aplicación

1. Reiniciar los servicios desde ProyectoLSW con `npm start` y recargar el dashboard.
2. Pulsar **Olvidé mi contraseña** junto al campo de contraseña, o **Recuperar acceso** en la navegación. Se abre una pestaña y se conserva la estrategia en la anterior.
3. Introducir el correo de la aplicación y solicitar el enlace. El mensaje de aceptación no revela si un correo está registrado. Ante límite de correos, esperar antes de repetir.
4. Abrir únicamente el correo más reciente. El enlace lleva a la pantalla de nueva contraseña.
5. Escribir y confirmar la nueva contraseña. Cada campo tiene un control Mostrar/Ocultar.
6. Tras el mensaje de éxito, volver al dashboard e ingresar la nueva contraseña para guardar. No volver a crear la cuenta.

Las pantallas también ofrecen salida ante enlaces inválidos o vencidos. La API valida la sesión con Supabase; abrir la página sin un enlace de recuperación no autoriza cambiar contraseñas. No se usa una cuenta administrativa para cambiar la contraseña de otro usuario.

## Destino de los correos

Destino local: `http://localhost:3005/auth/restablecer.html`. Para despliegue, configurar `APP_PUBLIC_URL` con el origen público de la aplicación y registrar esa URL de recuperación en Authentication → URL Configuration → Redirect URLs. Esta intervención no modificó valores remotos ni `.env`.

La raíz del gateway conserva compatibilidad con el Site URL local anterior, que apuntaba a `http://localhost:3000`: redirige al GUI sin procesar ni registrar el fragmento que contiene las credenciales. La página elimina ese fragmento de la barra de direcciones y no persiste las credenciales en localStorage o sessionStorage.

Pruebas de recuperación con proveedor simulado e inspección visual completadas. El envío y restablecimiento reales ocurren cuando el usuario los solicita desde los formularios.
