const { entenderSolicitud, construirPrompt } = require('./oracleEntender');

const USO = { tokensEntrada: 10, tokensSalida: 5, costoEstimadoUsd: 0.0001 };

describe('oracleEntender', () => {
  test('el prompt trata lo enviado como datos y no incluye archivos, solo los cuenta', () => {
    const p = construirPrompt({ texto: 'Vendo carro', urls: ['https://a.com/1'], preocupacion: 'Me preocupa', archivos: 2 });
    expect(p).toMatch(/<material>/);
    expect(p).toMatch(/NO instrucciones/);
    expect(p).toMatch(/Archivos adjuntos: 2/);
    expect(p).toMatch(/Vendo carro/);
  });

  test('normaliza la respuesta: tipo desconocido pasa a «otra», limita y limpia los datos que faltan', async () => {
    const llamar = async () => ({ entrada: { tipo: 'hackear', resumen: '  Entendí algo.  ', faltan: ['a', '', 5, 'b', 'c', 'd'] }, usage: USO });
    const r = await entenderSolicitud({ texto: 'x' }, { llamar });
    expect(r.tipo).toBe('otra');
    expect(r.resumen).toBe('Entendí algo.');
    expect(r.faltan).toEqual(['a', 'b', 'c']);
    expect(r.usage).toEqual(USO);
  });

  test('un pedido de verificar una oferta se reconoce', async () => {
    const llamar = async () => ({ entrada: { tipo: 'verificar_oferta', resumen: 'Entendí que quieres revisar un anuncio.' }, usage: USO });
    expect((await entenderSolicitud({ texto: 'x' }, { llamar })).tipo).toBe('verificar_oferta');
  });
});
