# Agentes de validación

Estos agentes son módulos de control reproducibles del flujo analítico.

## Agente 01 — Integridad y trazabilidad
Bloquea análisis si hay ID duplicados, vínculos MR-P/MR-C/MR-D inválidos, mezcla no controlada de piezas y referencias independientes, códigos ambiguos usados como seguros o casos CATALOGO_PENDIENTE incluidos en la inferencia.

## Agente 02 — Validez estadística
- Inferencia prioritaria a nivel pieza cuando hay campos anidados.
- Esquemas recurrentes N>=3; sensibilidad N>=5.
- Con tablas escasas: Monte Carlo/permutación, no p asintótico como prueba principal.
- Reportar efecto además de p.
- Para presencia/ausencia: distancia de Jaccard.
- PERMANOVA solo junto con control de dispersión (betadisper/permutest).
- Ajuste Benjamini-Hochberg en pruebas múltiples.
- Un patrón es robusto si se conserva en al menos dos especificaciones razonables.

## Agente 03 — Interpretación arqueológica
Pregunta si una asociación puede explicarse por forma, campo disponible, técnica, conservación, fragmentación, forma inferida o pseudorreplicación. El vocabulario recomendado es "repertorio estructurado", "regularidades", "gramática visual" o "evidencia compatible con un lenguaje visual", no una demostración automática de lenguaje.

## Agente 04 — Reproducibilidad
Fija semilla, fecha, hash, versión del catálogo, filtros y umbrales; conserva sessionInfo() y prohíbe editar manualmente resultados finales.
