# Índice de la entrega — Sabías que PR (COMP2053)

Proyecto final de **COMP2053 — Desarrollo Web Full-Stack**, Universidad Interamericana de Puerto Rico, Recinto de Fajardo.
Este índice dice **qué pide la rúbrica y dónde está cada cosa** en este repositorio.

## Qué pide la rúbrica → dónde está

| Qué pide la rúbrica | Dónde está en el repositorio |
|---|---|
| Código fuente del frontend | Carpeta [`/frontend`](../../frontend) (páginas HTML generadas por `build.js`, scripts JS, CSS, imágenes, textos en español e inglés) |
| Código fuente del backend (API y base de datos) | Carpeta [`/backend`](../../backend) (`src/routes`, `src/middleware`, `src/validators`, `sql/schema.sql`, pruebas automáticas) |
| README | [`README.md`](../../README.md) en la raíz (descripción, instalación, ejecución, pruebas, estructura, despliegue) |
| Documento PDF final | [`Documento-Final-SabiasquePR.pdf`](Documento-Final-SabiasquePR.pdf) |
| Manual de usuario | [`Manual-de-usuario-SabiasquePR.pdf`](Manual-de-usuario-SabiasquePR.pdf) |
| Documentación técnica | [`Documentacion-Tecnica-SabiasquePR.pdf`](Documentacion-Tecnica-SabiasquePR.pdf) (versión en texto: [`documentacion-tecnica.md`](documentacion-tecnica.md), generada desde el código) |
| Planificación y diseño de la base de datos | [`planificacion-y-diseno-bd.pdf`](planificacion-y-diseno-bd.pdf) (diagramas, modelo entidad-relación, diccionario de datos y script SQL) |
| Evidencia de pruebas | [`Evidencia-de-pruebas-SabiasquePR.pdf`](Evidencia-de-pruebas-SabiasquePR.pdf) (datos de origen: `evidencia-pruebas.json`, `evidencia-navegadores.json`, `evidencia-webkit*.json` (motor de Safari), `evidencia-produccion.json`) |
| Capturas de pantalla | Carpeta [`capturas/`](capturas) (escritorio y móvil) |
| Video de demostración | El enlace está en la [Guía para la profesora](Guia-para-la-profesora.pdf) |
| Guía para la profesora (1 página: cuenta de evaluación y pasos del CRUD) | [`Guia-para-la-profesora.pdf`](Guia-para-la-profesora.pdf) |
| Aplicación desplegada en línea | **https://sabiasquepr.com** (frontend en Netlify; API en Render; base de datos en Supabase) |

## Cómo ejecutar el proyecto

Backend: `cd backend && npm install && npm run dev`. Frontend: `cd frontend && node build.js` y luego `npx http-server -p 5500 -c-1 .`.
Los pasos completos (variables de entorno, base de datos, pruebas) están en el [`README.md`](../../README.md).
