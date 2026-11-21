const express = require('express');
const { pool } = require('../db');
const { enviarError500 } = require('../util/errores');
const { stripe } = require('../lib/stripe');
const { USOS_POR_MES, USOS_APOYO_UNICO } = require('../services/verificadorCreditos');

const router = express.Router();

// POST /api/stripe/webhook -- llamado por Stripe (sin sesion de usuario).
// Debe montarse ANTES de express.json() en app.js: Stripe firma el body
// crudo, no el JSON ya parseado.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ ok: false, error: `Firma de webhook invalida: ${err.message}` });
  }

  try {
    switch (event.type) {
      // checkout.session.completed cubre pagos sincronos (tarjeta); algunos
      // metodos de pago son asincronos y solo confirman el pago mas tarde via
      // checkout.session.async_payment_succeeded -- ambos se manejan igual,
      // condicionados a que el pago ya este confirmado (payment_status).
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.client_reference_id && session.payment_status === 'paid') {
          await pool.query(
            `UPDATE perfiles
             SET stripe_customer_id = $1, stripe_subscription_id = $2,
                 rol = CASE WHEN rol = 'admin' THEN rol ELSE 'premium' END
             WHERE id = $3`,
            [session.customer, session.subscription, session.client_reference_id]
          );
        }
        // Apoyo ÚNICO (enlace de pago de Stripe, sin cuenta): da 1 uso del Verificador a la cuenta con ese mismo correo.
        // Solo se activa si STRIPE_APOYO_UNICO_LINK_ID está configurado; así las compras de la tienda nunca cuentan.
        if (session.mode === 'payment' && !session.client_reference_id && session.payment_status === 'paid'
            && process.env.STRIPE_APOYO_UNICO_LINK_ID && session.payment_link === process.env.STRIPE_APOYO_UNICO_LINK_ID) {
          const correo = (session.customer_details?.email || '').trim().toLowerCase();
          if (correo) {
            await pool.query(
              `INSERT INTO verificador_concesiones (usuario_id, tipo, cantidad, stripe_ref)
               SELECT id, 'unico', $2, $3 FROM perfiles WHERE lower(email) = $1
               ON CONFLICT (stripe_ref) DO NOTHING`,
              [correo, USOS_APOYO_UNICO, session.id]
            );
          }
        }
        if (session.mode === 'payment' && session.client_reference_id && session.payment_status === 'paid') {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
          const items = lineItems.data.map((li) => ({
            nombre: li.description,
            cantidad: li.quantity,
            total: li.amount_total / 100,
          }));
          const envio = session.collected_information?.shipping_details;
          const facturacion = session.customer_details?.address;
          await pool.query(
            `INSERT INTO ordenes (usuario_id, items, total, stripe_session_id, estado, envio_nombre, envio_direccion, facturacion_direccion)
             VALUES ($1, $2, $3, $4, 'pagada', $5, $6, $7)
             ON CONFLICT (stripe_session_id) WHERE stripe_session_id IS NOT NULL DO NOTHING`,
            [
              session.client_reference_id, JSON.stringify(items), session.amount_total / 100, session.id,
              envio?.name || null,
              envio?.address ? JSON.stringify(envio.address) : null,
              facturacion ? JSON.stringify(facturacion) : null,
            ]
          );
        }
        break;
      }
      // Cada mes de apoyo pagado da 3 usos del Verificador. stripe_ref evita darlos dos veces si Stripe repite el aviso.
      case 'invoice.paid': {
        const inv = event.data.object;
        if (['subscription_create', 'subscription_cycle'].includes(inv.billing_reason) && inv.amount_paid > 0 && inv.customer) {
          const r = await pool.query(
            `INSERT INTO verificador_concesiones (usuario_id, tipo, cantidad, stripe_ref)
             SELECT id, 'mensual', $2, $3 FROM perfiles WHERE stripe_customer_id = $1
             ON CONFLICT (stripe_ref) DO NOTHING`,
            [inv.customer, USOS_POR_MES, inv.id]
          );
          // Si el aviso llegó antes de que el perfil tuviera su cliente de Stripe, falla a propósito para que Stripe lo reintente.
          if (r && r.rowCount === 0) {
            const { rows } = await pool.query('SELECT 1 FROM verificador_concesiones WHERE stripe_ref = $1', [inv.id]);
            if (!rows || !rows.length) throw new Error('Perfil aun sin cliente de Stripe; se reintentara.');
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const active = sub.status === 'active' || sub.status === 'trialing';
        await pool.query(
          `UPDATE perfiles
           SET stripe_subscription_id = $2,
               rol = CASE WHEN rol = 'admin' THEN rol WHEN $3 THEN 'premium' ELSE 'usuario' END
           WHERE stripe_customer_id = $1`,
          [sub.customer, sub.id, active]
        );
        // Mientras apoya no hay fecha de fin; al dejar de apoyar empieza la gracia de 15 días (ver verificadorCreditos).
        await pool.query(
          `UPDATE perfiles SET apoyo_mensual_termino_en = CASE WHEN $2 THEN NULL ELSE COALESCE(apoyo_mensual_termino_en, now()) END
           WHERE stripe_customer_id = $1`,
          [sub.customer, active]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await pool.query(
          `UPDATE perfiles SET rol = CASE WHEN rol = 'admin' THEN rol ELSE 'usuario' END
           WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        await pool.query(
          'UPDATE perfiles SET apoyo_mensual_termino_en = COALESCE(apoyo_mensual_termino_en, now()) WHERE stripe_customer_id = $1',
          [sub.customer]
        );
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    enviarError500(res, err);
  }
});

module.exports = router;
