const { validateVerificar, coincideConTipo } = require('./verificador');
const { crearHuella, buscarSimilar } = require('../util/busquedaSimilar');

const PNG = Buffer.from('89504e470d0a1a0a0000000d', 'hex').toString('base64');
const PDF = Buffer.from('%PDF-1.4 hola').toString('base64');
const TXT = Buffer.from('hola mundo').toString('base64');

describe('validateVerificar', () => {
  test('acepta texto, enlaces y archivos seguros', () => {
    expect(validateVerificar({ texto: 'x', urls: ['https://a.com/1'], archivos: [{ media_type: 'image/png', data: PNG }, { media_type: 'application/pdf', data: PDF }, { media_type: 'text/plain', data: TXT }] })).toEqual([]);
  });
  test('rechaza un archivo que dice ser PNG pero no lo es (no se confía en el tipo declarado)', () => {
    expect(validateVerificar({ archivos: [{ media_type: 'image/png', data: TXT }] }).length).toBeGreaterThan(0);
    expect(coincideConTipo('application/pdf', PNG)).toBe(false);
  });
  test('rechaza tipos peligrosos o desconocidos', () => {
    for (const t of ['application/x-msdownload', 'text/html', 'image/svg+xml', 'application/zip']) {
      expect(validateVerificar({ archivos: [{ media_type: t, data: TXT }] }).length).toBeGreaterThan(0);
    }
  });
  test('la nota de preocupación admite hasta 200 palabras', () => {
    expect(validateVerificar({ texto: 'x', preocupacion: Array(200).fill('a').join(' ') })).toEqual([]);
    expect(validateVerificar({ texto: 'x', preocupacion: Array(201).fill('a').join(' ') })[0]).toMatch(/200 palabras/);
  });
  test('exige algo que revisar, limita enlaces y archivos', () => {
    expect(validateVerificar({})[0]).toMatch(/al menos/);
    expect(validateVerificar({ urls: ['javascript:alert(1)'] })[0]).toMatch(/enlaces/);
    expect(validateVerificar({ texto: 'x', archivos: Array(5).fill({ media_type: 'image/png', data: PNG }) }).join()).toMatch(/Máximo 4/);
  });
});

describe('búsqueda similar', () => {
  const previo = (o) => ({ id: 'r1', creado_en: '2026-11-01', entrada: { huella: crearHuella(o) } });
  const texto = 'Vendo Toyota Corolla 2018 en Fajardo por cuatro mil dolares pago por adelantado sin ver el carro';

  test('mismo enlace (aunque cambie www o la barra final) es similar', () => {
    const r = buscarSimilar(crearHuella({ urls: ['https://facebook.com/marketplace/item/123/'] }), [previo({ urls: ['https://www.facebook.com/marketplace/item/123'] })]);
    expect(r.id).toBe('r1');
  });
  test('texto casi igual es similar; texto distinto no', () => {
    expect(buscarSimilar(crearHuella({ texto: texto + ' urgente' }), [previo({ texto })])).not.toBeNull();
    expect(buscarSimilar(crearHuella({ texto: 'Alquiler de apartamento en Humacao con tres cuartos y dos baños cerca de la playa' }), [previo({ texto })])).toBeNull();
  });
  test('textos muy cortos no se comparan', () => {
    expect(buscarSimilar(crearHuella({ texto: 'hola carro' }), [previo({ texto: 'hola carro' })])).toBeNull();
  });
});
