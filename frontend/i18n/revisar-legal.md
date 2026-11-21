**✅ Aprobado por el dueño del proyecto (William Collado) el 2026-09-28.**

# Revisión legal — versión en inglés (Fase C5)

No es un archivo que se publique al sitio. Lista lo que el usuario (dueño del
proyecto) debe aprobar antes de que la versión en inglés de estas páginas
quede disponible en producción. Todo el texto ya está traducido en
`i18n/en.json` con un prompt de fidelidad legal (`backend/scripts/traducir-legal.js`,
no el genérico de interfaz) y verificado visualmente en el navegador — falta
la aprobación de alguien con criterio legal, no técnico.

En las dos páginas (`terminos.html`, `privacidad.html`) aparece un aviso
visible en inglés: *"Courtesy translation — the Spanish version of this page
prevails in case of any discrepancy."* — el español sigue siendo la versión
que rige legalmente.

## Secciones a revisar con más cuidado

- **Términos §5 (Conducta del usuario)** — "difamatorio, ilegal o que
  infrinja derechos de terceros" → "defamatory, illegal content, or content
  that infringes the rights of third parties".
- **Términos §6 (Limitación de responsabilidad)** — la cláusula "tal cual" →
  "as is" y la exención de responsabilidad por decisiones tomadas con base
  en el contenido del sitio.
- **Términos §8 (Ley aplicable)** — "se rigen por las leyes de Puerto Rico"
  → "governed by the laws of Puerto Rico".
- **Privacidad §3 (Con quién compartimos datos)** — la lista de proveedores
  (Formspree, beehiiv, Supabase, Google Analytics, Stripe) y la frase "no
  vendemos tu información".
- **Privacidad §4 (Cookies)**.
- **Privacidad §5 (Tus derechos)** — acceso, corrección, eliminación de
  datos personales y cómo darse de baja del boletín.
- **Aviso de acceso a la sección 18+** (`debate.js`, se muestra en
  Corrupción Humana e Ilógica Humana antes de leer/escribir) — la mención a
  la **Sección 230 de la Communications Decency Act**, la frase "no
  significa que 'todo vale'", la casilla de consentimiento ("I confirm that
  I am over 18 years of age...") y el aviso de que no hay verificación de
  identidad.

## Pendiente técnico, no bloquea la aprobación

- **"Última actualización: [fecha]"** en Términos y Privacidad se genera en
  español en el momento de compilar el sitio (`node build.js`), no en el
  navegador — no se tradujo porque la fecha cambia en cada build y una
  traducción fija del texto de hoy quedaría desactualizada mañana. Un
  visitante en inglés ve esa fecha en español. Arreglarlo bien requiere que
  `i18n.js` la reescriba en el navegador según el idioma — queda como mejora pendiente.

## Cómo revisarlo

1. `node build.js` (o pedirle a Claude que levante el sitio local).
2. Entrar a `/terminos.html` y `/privacidad.html`, cambiar a inglés con el
   botón del header.
3. Para el aviso 18+: entrar a Revolución Humana → Corrupción Humana o
   Ilógica Humana, en inglés, antes de confirmar la edad.
4. Confirmar con Claude qué aprobar / qué corregir. Los textos viven en
   `i18n/en.json` — se pueden editar ahí directamente, clave por clave.
