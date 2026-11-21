# Sabías que PR

[![Pruebas y calidad del código](https://github.com/Wcollado72/SabiasquePR-Entrega/actions/workflows/ci.yml/badge.svg)](https://github.com/Wcollado72/SabiasquePR-Entrega/actions/workflows/ci.yml)

Aplicación web full-stack de noticias con contexto, educación y debate comunitario. Proyecto final de **COMP2053 — Desarrollo Web Full-Stack**, Universidad Interamericana de Puerto Rico, Recinto de Fajardo.

- **Sitio en línea:** https://sabiasquepr.com
- **API:** https://sabiasquepr-backend-uufz.onrender.com (el plan gratuito de Render puede tardar ~50 segundos en despertar la primera vez)

## Descripción
Frontend responsivo (HTML5, CSS3 y JavaScript sin framework) que consume una **API REST propia** (Node.js + Express) conectada a **PostgreSQL** (Supabase). Incluye:

- **CRUD completo** para cualquier persona con cuenta en las **publicaciones del debate** (crear, leer, editar y eliminar las propias) y en sus comentarios; y CRUD de administración en **contenidos y productos**. Operaciones parciales en reportes y órdenes.
- **Autenticación con JWT** emitido por Supabase Auth y **verificado en el servidor** en cada ruta protegida; roles (usuario, colaborador, moderador, administrador); verificación en dos pasos para el panel de administración.
- Tienda y apoyo voluntario con **Stripe** (modo de prueba) y webhook, boletín (Beehiiv), formulario de contacto (Formspree), anti-robots (Cloudflare Turnstile) y un sitio bilingüe (español/inglés).
- Panel de administración (contenidos y productos) con verificación en dos pasos, y **Verificador de Confianza** (análisis de fuentes con la API de Claude, con usos limitados según el apoyo).

## Requisitos
- Node.js 18.18 o superior (se prueba con Node 22) y npm
- Una base de datos PostgreSQL (se usa Supabase) y un proyecto de Supabase Auth
- Opcional para desarrollo: cuentas de prueba de Stripe y Beehiiv

## Instalación
```bash
git clone https://github.com/Wcollado72/SabiasquePR-Entrega.git
cd SabiasquePR-Entrega/backend
npm install
cp .env.example .env        # completa los valores (ver docs/entrega/documentacion-tecnica.md)
npm run db:schema           # crea las 23 tablas
cd ../frontend
node build.js               # genera las páginas del sitio
```

## Ejecución
```bash
# Backend (API en http://localhost:3000)
cd backend
npm run dev

# Frontend (sitio estático en http://localhost:5500)
cd frontend
npx http-server -p 5500 -c-1 .
```

## Pruebas y calidad
```bash
cd backend
npm test                    # 888 pruebas automáticas en 68 archivos (Jest + Supertest); cifra verificada el 2026-11-21, se revalida el 29 de noviembre
npm run test:coverage       # informe de cobertura (~89 % de sentencias, ~85 % de ramas y ~91 % de líneas)
npm run lint                # revisión de estilo (ESLint)
npm run db:probar-schema    # comprueba que sql/schema.sql reproduce la base de datos real
```
En cada cambio, GitHub Actions corre el lint, las pruebas y la auditoría de dependencias y secretos.

## Estructura del proyecto
```
/frontend   sitio estático: páginas HTML (generadas por build.js), scripts JS, CSS, imágenes, i18n y service worker
/backend    API REST: src/routes, src/middleware, src/validators, src/services, sql/ (schema.sql) y scripts/
/docs       documentación del proyecto
  /docs/entrega   LA ENTREGA: documento PDF final, manual de usuario, documentación técnica,
                  planificación y diseño de la BD, evidencia de pruebas y capturas
/tools      empaquetado local del cliente de Supabase (vendor)
/.github    flujos de CI (pruebas y auditoría de seguridad)
README.md
```

## Acceso para evaluación
Cuenta de evaluación: **sabiasquepr.evaluacion@gmail.com** (la contraseña se entrega a la profesora por correo, nunca en el repositorio). Es una cuenta de **usuario regular**: no necesita verificación en dos pasos. Con ella se prueba el CRUD completo desde el punto de vista del usuario (crear, leer, editar y eliminar una publicación en el debate de **Educación**, y comentar). Los pasos están en `docs/entrega/Guia-para-la-profesora.pdf`.

## Autenticación
Supabase Auth emite un JWT (ES256). El backend lo verifica en cada ruta protegida contra las llaves públicas del proyecto (JWKS) y consulta el rol en la tabla `perfiles`. Sin un token válido la API responde **401**; sin el rol necesario, **403**.

## Despliegue
- **Frontend:** Netlify (construye y publica solo `frontend/`).
- **Backend:** Render (`backend/`).
- **Base de datos:** Supabase (PostgreSQL con seguridad por fila activa en las 23 tablas).
- Las variables de entorno están descritas en `backend/.env.example`; los valores reales nunca se guardan en el repositorio.

## Documentación
La documentación técnica (estructura, rutas y endpoints, entorno, autenticación y dependencias) está en `docs/entrega/documentacion-tecnica.md`, generada desde el código con `node backend/scripts/generar-doc-tecnica.js`.

Todo lo que corresponde a la entrega de COMP2053 (documento PDF final, manual de usuario, documentación técnica, planificación y diseño de la base de datos, evidencia de pruebas y capturas) está en `docs/entrega/`; el punto de partida es **`docs/entrega/INDICE-ENTREGA.md`**, que dice qué pide la rúbrica y dónde está cada cosa.
