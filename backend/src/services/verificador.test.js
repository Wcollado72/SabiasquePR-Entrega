const C = require('./verificadorCreditos');
const { suavizar, suavizarObjeto, AVISO } = require('../util/vocabularioSeguro');
const { verificarOferta, normalizarReporte, calcularCosto, TOPE_COSTO_USD } = require('./verificador');

const f = (s) => new Date(s);

describe('verificadorCreditos', () => {
  const mensual = { id: 'a', tipo: 'mensual', cantidad: 3, usados: 1, otorgado_en: f('2026-01-15T00:00:00Z') };
  const unico = { id: 'b', tipo: 'unico', cantidad: 1, usados: 0, otorgado_en: f('2026-01-15T00:00:00Z') };

  test('apoyo mensual activo: los usos se acumulan hasta 12 meses y luego vencen', () => {
    const activo = { apoyoMensualActivo: true };
    expect(C.saldo([mensual], { ...activo, ahora: f('2026-12-31T00:00:00Z') })).toBe(2);
    expect(C.saldo([mensual], { ...activo, ahora: f('2027-01-15T00:00:00Z') })).toBe(0);
  });

  test('si deja de apoyar: 15 días de gracia y luego se pierden', () => {
    const base = { apoyoMensualActivo: false, apoyoMensualTerminoEn: f('2026-06-01T00:00:00Z') };
    expect(C.saldo([mensual], { ...base, ahora: f('2026-06-16T00:00:00Z') })).toBe(2);
    expect(C.saldo([mensual], { ...base, ahora: f('2026-06-17T00:00:00Z') })).toBe(0);
    expect(C.saldo([mensual], { apoyoMensualActivo: false, ahora: f('2026-06-02T00:00:00Z') })).toBe(0);
  });

  test('apoyo único: 1 uso que no depende del apoyo mensual', () => {
    expect(C.saldo([unico], { apoyoMensualActivo: false, ahora: f('2026-03-01T00:00:00Z') })).toBe(1);
    expect(C.USOS_APOYO_UNICO).toBe(1);
    expect(C.USOS_POR_MES).toBe(3);
  });

  test('se gasta primero lo que vence antes y no se elige una concesión agotada', () => {
    const vieja = { ...mensual, id: 'v', usados: 0, otorgado_en: f('2026-01-01T00:00:00Z') };
    const nueva = { ...mensual, id: 'n', usados: 0, otorgado_en: f('2026-05-01T00:00:00Z') };
    expect(C.elegirConcesion([nueva, vieja], { apoyoMensualActivo: true, ahora: f('2026-06-01T00:00:00Z') }).id).toBe('v');
    expect(C.elegirConcesion([{ ...vieja, usados: 3 }], { apoyoMensualActivo: true, ahora: f('2026-06-01T00:00:00Z') })).toBeNull();
  });

  test('sumarMeses respeta fines de mes', () => {
    expect(C.sumarMeses(f('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('vocabularioSeguro', () => {
  test.each([
    ['Es 100% seguro comprar aquí.', /100/],
    ['Te garantizo que es legítimo.', /garantizo/i],
    ['Esto es una estafa.', /es una estafa/i],
    ['Compra sin riesgo.', /sin riesgo/i],
    ['Está comprobado que funciona.', /comprobado que/i],
  ])('quita la afirmación absoluta: %s', (entrada, prohibido) => {
    const r = suavizar(entrada);
    expect(r.cambios).toBeGreaterThan(0);
    expect(r.texto).not.toMatch(prohibido);
  });

  test('un texto prudente no se toca', () => {
    expect(suavizar('El precio está por debajo del mercado; conviene verificar.')).toEqual({ texto: 'El precio está por debajo del mercado; conviene verificar.', cambios: 0 });
  });

  test('limpia objetos y listas completos', () => {
    const { valor, ajustes } = suavizarObjeto({ a: ['Es una estafa'], b: { c: 'Te aseguro todo' }, n: 5 });
    expect(ajustes).toBe(2);
    expect(JSON.stringify(valor)).not.toMatch(/estafa|aseguro/i);
    expect(valor.n).toBe(5);
  });
});

describe('verificarOferta (sin gastar dinero: Claude simulado)', () => {
  const usage = { tokensEntrada: 3000, tokensSalida: 900, busquedasRealizadas: 2, costoEstimadoUsd: 0.035 };

  test('descarta fuentes que la búsqueda no devolvió, suaviza el vocabulario y agrega el aviso', async () => {
    const llamar = async () => ({
      reporte: {
        nivel: 'senales_de_alerta',
        resumen: 'Es una estafa, te garantizo.',
        puntos_a_favor: [], puntos_en_contra: ['Precio muy bajo'], detalles_raros: ['Pide pago por adelantado'],
        que_evitar: ['Pagar sin ver el vehículo'], que_hacer: ['Pedir el título'],
        fuentes: [{ url: 'https://real.com/a', nota: 'x' }, { url: 'https://inventada.com/b', nota: 'y' }],
      },
      urlsPermitidas: ['https://real.com/a'],
      usage,
    });
    const r = await verificarOferta({ texto: 'oferta' }, { llamar });
    expect(r.reporte.fuentes).toEqual([{ url: 'https://real.com/a', nota: 'x' }]);
    expect(r.descartadas).toBe(1);
    expect(r.reporte.resumen).not.toMatch(/estafa|garantizo/i);
    expect(r.ajustesDeVocabulario).toBeGreaterThan(0);
    expect(r.reporte.aviso).toBe(AVISO);
    expect(r.excedioTope).toBe(false);
  });

  test('nivel desconocido pasa a información insuficiente y se avisa si pasó del tope de costo', async () => {
    const llamar = async () => ({ reporte: { nivel: 'perfecto', resumen: 'ok' }, urlsPermitidas: [], usage: { ...usage, costoEstimadoUsd: TOPE_COSTO_USD + 0.01 } });
    const r = await verificarOferta({ texto: 'x' }, { llamar });
    expect(r.reporte.nivel).toBe('informacion_insuficiente');
    expect(r.excedioTope).toBe(true);
  });

  test('normalizarReporte limita listas y tolera basura', () => {
    const r = normalizarReporte({ puntos_a_favor: Array(20).fill('a'), que_hacer: [1, null, 'b'], fuentes: 'no' }, []);
    expect(r.reporte.puntos_a_favor).toHaveLength(8);
    expect(r.reporte.que_hacer).toEqual(['b']);
    expect(r.reporte.fuentes).toEqual([]);
  });

  test('el costo de un reporte típico queda por debajo del tope de $0.25', () => {
    const { costo } = calcularCosto({ input_tokens: 15000, output_tokens: 2500, server_tool_use: { web_search_requests: 2 } });
    expect(costo).toBeLessThan(TOPE_COSTO_USD);
  });
});

describe('perfil profesional del Verificador', () => {
  const { INSTRUCCIONES } = require('./verificador');
  test('las instrucciones incluyen oficios, casos iniciales y límites legales', () => {
    expect(INSTRUCCIONES).toMatch(/ciberseguridad defensiva/);
    expect(INSTRUCCIONES).toMatch(/OSINT/);
    expect(INSTRUCCIONES).toMatch(/autos y vehículos/);
    expect(INSTRUCCIONES).toMatch(/no des asesoría legal/);
    expect(INSTRUCCIONES).toMatch(/no acuses, no nombres/);
    expect(INSTRUCCIONES).toMatch(/NUNCA garantices/);
  });
  test('el aviso del reporte aclara que no es asesoría legal', () => {
    expect(AVISO).toMatch(/no es asesoría legal/);
  });
});
