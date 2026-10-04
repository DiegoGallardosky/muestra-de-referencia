# Muestra de referencia

Aplicación web para registrar, visualizar y analizar una muestra de referencia de piezas cerámicas completas o semicompletas y sus diseños asociados en el estudio de los lenguajes visuales de la Tradición San Francisco.

## Estructura de identificación

- `MR-Pxxxx`: ID único de pieza.
- `MR-Dxxxx`: ID único de diseño.
- Una pieza puede vincularse con uno o varios diseños.
- La sigla institucional se conserva como variable independiente y puede estar vacía.

## Primera versión

La versión 0.1 incluye:

- portada de presentación;
- catálogo visual de piezas y diseños;
- panel de edición;
- carga y reemplazo local de fotografías y gráficos;
- enlace/visualización embebida de fotogrametría cuando el proveedor lo permite;
- opciones controladas para forma, campo decorativo, técnica y simetría;
- campos abiertos para esquema y colores;
- exportación de piezas, diseños y una matriz preparada para SPSS;
- diccionario de variables;
- respaldo/importación JSON;
- ambiente sonoro de selva generado en el navegador.

### Persistencia

En esta versión los datos editados se guardan en el navegador (`localStorage`) y las imágenes/archivos en `IndexedDB`. El repositorio contiene la aplicación y el modelo maestro inicial. La sincronización multiusuario o escritura directa desde la web hacia GitHub se implementará en una etapa posterior.

## Datos iniciales

Se parte de 30 piezas y 74 diseños individualizados de la muestra de referencia. Los diseños 68 y 71 se consideran diseños enteros, según la decisión metodológica del proyecto.
