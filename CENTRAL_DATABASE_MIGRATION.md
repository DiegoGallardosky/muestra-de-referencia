# Migración a una única base central

La copia maestra es la base local de la computadora principal (estado confirmado: 40 piezas, 56 campos, 55 dibujos).

## Arquitectura objetivo
- Supabase PostgreSQL: piezas, campos, dibujos y metadatos.
- Supabase Storage: fotografías y dibujos/SVG.
- Supabase Auth + RLS: lectura pública opcional; edición solo autenticada.
- GitHub Pages: interfaz web única para PC, celular y otras computadoras.

## Regla de seguridad
No borrar ni reemplazar la base local hasta verificar que la importación central contiene exactamente los mismos registros y archivos.

## Secuencia de migración
1. Descargar desde la PC **Respaldo completo**.
2. Conservar una copia fechada fuera del navegador.
3. Crear el proyecto Supabase y aplicar `supabase-schema.sql`.
4. Importar piezas → campos → dibujos conservando los UID estables.
5. Subir fotografías y dibujos a Storage y guardar sus rutas.
6. Verificar conteos y relaciones.
7. Cambiar la app para leer/escribir Supabase.
8. Probar PC + celular.
9. Activar autenticación para edición.
10. Mantener exportación de respaldo completo como copia de seguridad.

No se deben usar los IDs visibles MR-P/MR-C/MR-D como claves primarias: pueden renumerarse. Los UID PUID/CUID/DUID son las identidades persistentes.
