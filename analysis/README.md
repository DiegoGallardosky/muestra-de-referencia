# Análisis del lenguaje visual — muestra de referencia

Esta rama incorpora una capa analítica paralela. No modifica la base central Supabase ni la lógica del sitio.

## Pregunta general
Explorar si la decoración cerámica muestra una organización recurrente compatible con un repertorio visual estructurado: vocabulario de esquemas, reglas de asociación/coocurrencia, preferencias por campos y formas, relaciones con técnicas y simetrías, y agrupamientos latentes.

## Niveles analíticos
1. **Campo decorativo (MR-C):** unidad principal para describir composición, sector, técnica, simetría y coocurrencia.
2. **Pieza (MR-P):** unidad primaria para inferencia cuando varios campos pertenecen a una misma vasija, evitando pseudorreplicación.
3. **Referencia independiente:** se conserva separada para caracterizar el repertorio; no se mezcla automáticamente con piezas observadas en pruebas inferenciales.

## Regla de catálogo
- `ESQUEMA_FUENTE`: código tal como está en la base central.
- `ESQUEMA_ANALITICO`: código de la capa analítica cuando una recodificación es inequívoca.
- `CATALOGO_PENDIENTE=1`: se excluye del análisis inferencial primario hasta resolver numeración.
- Nunca se sobreescribe la fuente.

## Análisis previstos
- Frecuencias y riqueza de esquemas.
- Correspondencia: forma × esquema, sector × esquema, simetría × esquema, técnica × esquema.
- Coocurrencia y redes de esquemas.
- Jaccard entre perfiles de esquema.
- PCoA / ordenación.
- PERMANOVA a nivel pieza, con control de dispersión.
- Sensibilidad N>=3 / N>=5 y con/sin referencias independientes.
- Tamaños de efecto y corrección por comparaciones múltiples.

## Criterio interpretativo
Los resultados no demuestran por sí solos la existencia de un lenguaje. Se considerará evidencia compatible con una gramática visual cuando converjan recurrencia, asociaciones no aleatorias, coocurrencias estructuradas, preferencias por campo/forma, regularidades de simetría y estabilidad de los patrones en análisis de sensibilidad.
