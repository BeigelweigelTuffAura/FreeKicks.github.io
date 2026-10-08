// Testes da física da bola. Rodar com: node testes/fisica.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { criarBola, chutar, passo } from '../js/physics.js';

// Simula uma cobrança e devolve onde a bola cruza a barreira (9,15 m) e a linha do gol
function cobrar({ distancia = 22, forca = 0.65, contato = { x: 0, y: 0 }, aleatorio = () => 0.5 } = {}) {
  const bola = criarBola({ x: 0, y: CONFIG.raioBola, z: distancia });
  chutar(bola, { alvo: { x: 0, z: 0 }, forca, contato }, CONFIG, aleatorio);
  let barreira = null;
  for (let t = 0; t < 5 && bola.pos.z > 0; t += 1 / 240) {
    passo(bola, 1 / 240, CONFIG);
    if (!barreira && bola.pos.z <= distancia - 9.15) barreira = { ...bola.pos };
  }
  return { barreira, gol: bola.pos.z <= 0 ? { ...bola.pos } : null };
}

const teste = (nome, fn) => {
  fn();
  console.log('ok -', nome);
};

teste('chute reto no centro com força média entra no gol, por cima da barreira', () => {
  const { barreira, gol } = cobrar({ forca: 0.62 });
  assert.ok(barreira.y > 1.9, `altura na barreira ${barreira.y}`);
  assert.ok(gol && gol.y < CONFIG.golAltura && Math.abs(gol.x) < 0.2, JSON.stringify(gol));
});

teste('pé no lado direito da bola curva para a esquerda', () => {
  const { gol } = cobrar({ forca: 0.85, contato: { x: 1, y: 0 } });
  assert.ok(gol.x < -1.5, `x no gol ${gol.x}`);
});

teste('pé no lado esquerdo da bola curva para a direita', () => {
  const { gol } = cobrar({ forca: 0.85, contato: { x: -1, y: 0 } });
  assert.ok(gol.x > 1.5, `x no gol ${gol.x}`);
});

teste('pé embaixo sobe mais; pé em cima cai mais (folha seca)', () => {
  const centro = cobrar({ forca: 0.75 }).gol.y;
  const embaixo = cobrar({ forca: 0.75, contato: { x: 0, y: -0.6 } }).gol.y;
  const emCima = cobrar({ forca: 0.75, contato: { x: 0, y: 0.6 } }).gol.y;
  assert.ok(embaixo > centro + 0.5, `embaixo ${embaixo} x centro ${centro}`);
  assert.ok(emCima < centro - 0.3, `em cima ${emCima} x centro ${centro}`);
});

teste('bola sem rotação muda de trajetória a cada chute; com efeito, não', () => {
  const lados = (contato) => [0.1, 0.4, 0.7, 0.95].map((r) => cobrar({ distancia: 25, forca: 0.95, contato, aleatorio: () => r }).gol.x);
  const semRotacao = lados({ x: 0, y: 0 });
  assert.ok(Math.max(...semRotacao) - Math.min(...semRotacao) > 0.3, `variação ${semRotacao}`);
  const comEfeito = lados({ x: 0.6, y: 0 });
  assert.ok(Math.max(...comEfeito) - Math.min(...comEfeito) < 0.01, `variação ${comEfeito}`);
});
