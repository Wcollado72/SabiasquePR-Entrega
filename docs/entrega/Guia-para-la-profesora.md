# Guía para la profesora — Sabías que PR (COMP2053)

Estudiante: William R. Collado · Universidad Interamericana de Puerto Rico, Recinto de Fajardo · Desarrollo Web Full-Stack

---

# 1. Dónde está el proyecto

1. **Aplicación en línea:** https://sabiasquepr.com
2. **API:** https://sabiasquepr-backend-uufz.onrender.com (el plan gratuito puede tardar unos 50 segundos en despertar la primera vez).
3. **Repositorio:** [PENDIENTE 29 NOV: enlace del repositorio y cómo acceder].
4. **Video demostrativo (5 a 10 minutos):** [PENDIENTE 29 NOV: enlace del video].

# 2. Cuenta de evaluación

1. **Correo:** sabiasquepr.evaluacion@gmail.com
2. **Contraseña:** se entrega por separado, por correo.
3. Es una cuenta de **usuario regular**. **No pide verificación en dos pasos** ni app de códigos.
4. Para entrar: abra https://sabiasquepr.com, pulse **Iniciar sesión** (arriba a la derecha) y escriba el correo y la contraseña.

# 3. Cómo probar el CRUD completo (punto de vista del usuario)

Todo se hace en la sección **Educación**, al final de la página, en el bloque **Debate**.

1. **Crear.** Con la sesión iniciada, escriba un título y un texto (hasta 200 palabras) y pulse **Publicar**. Debe ver su publicación al inicio de la lista.
2. **Leer.** Abra la publicación: se ve el texto completo y sus comentarios. Cualquier persona, con o sin cuenta, puede leerla.
3. **Actualizar.** Dentro de su publicación pulse **Editar**, cambie el texto y guarde. Debe ver el cambio y la marca de editado.
4. **Comentar.** Escriba un comentario en la publicación. También puede **eliminar** su propio comentario.
5. **Eliminar.** Pulse **Eliminar** en su publicación y confirme. La publicación desaparece de la lista.
6. Otras operaciones de la cuenta: **Mi cuenta** (editar su nombre y ver sus pedidos) y **Tienda** (carrito; los pagos están en modo de prueba de Stripe: tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier código).

Con una persona sin sesión, las acciones de escribir piden iniciar sesión (la API responde 401). Con una cuenta que no es la autora, los botones Editar y Eliminar no aparecen (la API responde 403).

# 4. Dónde está cada punto de la rúbrica

1. **Código fuente:** carpetas `/frontend` y `/backend` y `README.md` en la raíz.
2. **Documento PDF final** (portada, introducción, objetivos, justificación, tecnologías, arquitectura, diseño de la base de datos, capturas, evidencias de pruebas, conclusiones y referencias): `docs/entrega/Documento-Final-SabiasquePR.pdf`.
3. **Manual de usuario:** `docs/entrega/Manual-de-usuario-SabiasquePR.pdf`.
4. **Documentación técnica** (estructura, rutas, endpoints, entorno, autenticación y dependencias): `docs/entrega/Documentacion-Tecnica-SabiasquePR.pdf`.
5. **Planificación y diseño de la base de datos** (diagramas, modelo entidad-relación, esquema relacional, diccionario de datos y script SQL): `docs/entrega/planificacion-y-diseno-bd.pdf`.
6. **Evidencia de pruebas:** `docs/entrega/Evidencia-de-pruebas-SabiasquePR.pdf`.
7. **Capturas de pantalla:** carpeta `docs/entrega/capturas/`.
8. **Índice completo:** `docs/entrega/INDICE-ENTREGA.md`.

# 5. Cómo correr las pruebas

1. `cd backend` y luego `npm install`.
2. `npm test` ejecuta 888 pruebas automáticas (Jest y Supertest) en 68 archivos. No necesitan la base de datos real: la simulan.
3. `npm run lint` revisa el estilo del código (ESLint).
4. `npm run test:coverage` muestra la cobertura.

# 6. Resumen técnico

Frontend en HTML5, CSS3 y JavaScript (sin framework) · API REST en Node.js y Express · base de datos PostgreSQL (Supabase) con 23 tablas · autenticación con JWT que emite Supabase Auth y que el servidor **verifica en cada ruta protegida** (JWKS) · rutas protegidas por rol · pagos de prueba con Stripe · sitio en español e inglés.
