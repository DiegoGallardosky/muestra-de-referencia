# Muestra de referencia

Aplicación web para registrar, visualizar y analizar una muestra de referencia de piezas cerámicas completas o semicompletas, campos decorativos y sus dibujos de referencia en el estudio de los lenguajes visuales de la Tradición San Francisco.

## Modelo de datos vigente

La versión actual usa tres niveles claramente separados:

- `MR-Pxxxx`: pieza completa o semicompleta.
- `MR-Cxxxx`: campo decorativo. Es la **unidad de análisis**.
- `MR-Dxxxx`: dibujo que representa un único campo decorativo.

Cada campo decorativo se ubica en un sector codificado según la forma de la pieza (`CD1–CD28`) y concentra las variables analíticas:

- técnica(s);
- esquema(s);
- clase de simetría;
- colores;
- observaciones;
- dibujo asociado.

Una pieza puede tener varios campos decorativos. Cada campo puede contener uno o más esquemas, pero un único dibujo de referencia y una única clase de simetría registrada.

## Compatibilidad y migraciones

La aplicación conserva los registros ya cargados y aplica migraciones no destructivas cuando cambia la estructura. También conserva copias recientes de los datos textuales en el navegador antes de cada guardado.

Los cambios visuales de interfaz no deben modificar los IDs ni reinicializar los datos.

## Catálogo de sectores por forma

Los sectores posibles se activan según la forma primaria:

- Escudilla: CD1–CD5.
- Cuenco-Puco: CD6–CD7.
- Vaso: CD8.
- Vaso anular: CD9–CD10.
- Botella: CD11–CD14.
- Cántaro ovoide: CD15–CD18.
- Urna: CD19–CD21.
- Olla: CD22–CD25.
- Pipa: CD26–CD28.

## Exportaciones

- piezas: una fila por pieza;
- campos: una fila por campo decorativo;
- dibujos: una fila por dibujo;
- matriz SPSS: una fila por campo decorativo, con variables de pieza y técnicas codificadas como 0/1;
- diccionario de variables;
- respaldo JSON de datos textuales.

## Auditoría de integridad

La aplicación incluye una auditoría que controla, entre otros puntos:

- IDs duplicados;
- relaciones rotas entre pieza, campo y dibujo;
- más de un dibujo por campo;
- sectores CD incompatibles con la forma;
- sectores repetidos en una misma pieza;
- campos sin técnica, esquema o simetría;
- dibujos con información pero sin campo vinculado.

## Persistencia actual

Los datos textuales se guardan en `localStorage` y las fotografías/dibujos en `IndexedDB` del navegador. Esto permite trabajar de forma local, pero **todavía no es una base centralizada**.

Por lo tanto:

- no borrar los datos del sitio del navegador mientras haya trabajo sin respaldo;
- exportar periódicamente el JSON;
- las imágenes no están incluidas dentro del JSON;
- la persistencia central/multiusuario sigue siendo una mejora futura prioritaria.

## Datos iniciales

La base parte de 30 piezas y 74 dibujos individualizados. Los registros pueden seguir creciendo durante la construcción de la muestra de referencia.
