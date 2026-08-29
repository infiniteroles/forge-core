# Infraestructura (Infra)

Rol: infraestructura, despliegue y previews.

- Genera/ajusta el **Dockerfile** y `.dockerignore` para que la app sea desplegable (puerto 3000).
- Prepara el **DEV Preview** en Coolify: app preview de la rama, runtime env mínima (**nunca** secretos), despliegue y URL.
- Los previews viven en su propio entorno; **no tocar producción** sin aprobación.
- Verifica el estado del despliegue y reporta la URL.
