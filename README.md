# Noticiahz

Lector RSS personal creado por Krahz. La web está en `site/` y se publica sola en Cloudflare Pages
al subir cambios a la rama `main` (ver `.github/workflows/deploy.yml`).

- Versión visible en la app: Ajustes → Avanzado.
- En cada cambio: subir `VER` en `site/index.html` y `V` en `site/sw.js`.
- Formato de `VER` (desde el 20-10-2026): `AAAA-MM-DD-N` para cada cambio (N = 0, 1, 2… dentro del día)
  y `AAAA-MM-DD-N.M` para cambios menores sobre esa versión (p. ej. `2026-10-21-0`, luego `2026-10-21-0.1`).
