// Testes da barreira e do goleiro. Rodar com: node testes/defesa.mjs
// Tudo é determinista: cada cobrança usa um sorteio com semente fixa (mesma semente, mesmo resultado).
// Os números de "quantos % de gols" medem a sensação: o goleiro defende o fácil e sofre no ângulo.
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { criarBola, passo } from '../js/physics.js';
import {
  montarBarreira, atualizarBarreira, colidirBolaBarreira, quantidadeNaBarreira, PADRAO_BARREIRA,
} from '../js/barreira.js';
import {
  criarGoleiro, atualizarGoleiro, colidirBolaGoleiro, partesDoGoleiro, PADRAO_GOLEIRO,
} from '../js/goleiro.js';

const H = 1 / 240; // passo da física, como no jogo
const MEIA = CONFIG.golLargura / 2;

// Sorteio com semente (mulberry32): a mesma semente dá sempre a mesma sequência
function sorteio(semente) {
  let a = semente * 7919 + 13;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Velocidade e giro direto na bola (sem chutar(), cujas opções mudam com o tempo).
// direcao: ângulo no chão (rad, 0 = reto para o gol, + = para a direita); elevacao: rad.
// lateral: giro em pé (+ curva para a esquerda); topo: giro para a frente (+ cai).
function montarChute(bola, { velocidade, direcao, elevacao, lateral = 0, topo = 0 }) {
  const frente = { x: Math.sin(direcao), z: -Math.cos(direcao) };
  const direita = { x: -frente.z, z: frente.x };
  const h = velocidade * Math.cos(elevacao);
  bola.vel = { x: frente.x * h, y: velocidade * Math.sin(elevacao), z: frente.z * h };
  bola.giro = { x: -topo * direita.x, y: lateral, z: -topo * direita.z };
}

// Onde a bola cruza a linha do gol voando sozinha (sem barreira nem goleiro)
function voarLivre(origem, chute) {
  const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });
  montarChute(bola, chute);
  let quicou = false;
  for (let t = 0; t < 4; t += H) {
    const { x, y, z } = bola.pos;
    passo(bola, H, CONFIG);
    if (t > 0.05 && bola.pos.y <= CONFIG.raioBola + 1e-6) quicou = true;
    if (bola.pos.z <= 0) {
      const f = z / (z - bola.pos.z);
      return { x: x + (bola.pos.x - x) * f, y: y + (bola.pos.y - y) * f, quicou };
    }
    if (bola.vel.z > 0) return null;
  }
  return null;
}

// Acha a direção e a elevação para a bola cruzar a linha do gol no ponto alvo {x, y}
const miras = new Map();
function mirar(origem, alvo, { velocidade, lateral = 0, topo = 0 }) {
  const chave = JSON.stringify([origem, alvo, velocidade, lateral, topo]);
  if (miras.has(chave)) return miras.get(chave);
  const chute = (direcao, elevacao) => ({ velocidade, direcao, elevacao, lateral, topo });
  let direcao = Math.atan2(alvo.x - origem.x, origem.z);
  let elevacao = 0.18;
  let melhor = Infinity;
  for (let e = -0.01; e < 0.7; e += 0.01) {
    const c = voarLivre(origem, chute(direcao, e));
    if (c && !c.quicou && Math.abs(c.y - alvo.y) < melhor) {
      melhor = Math.abs(c.y - alvo.y);
      elevacao = e;
    }
  }
  for (let i = 0; i < 30; i++) {
    const c0 = voarLivre(origem, chute(direcao, elevacao));
    if (!c0) {
      elevacao += 0.02;
      continue;
    }
    const ex = c0.x - alvo.x;
    const ey = c0.y - alvo.y;
    if (Math.hypot(ex, ey) < 0.005) break;
    const d = 1e-4;
    const cd = voarLivre(origem, chute(direcao + d, elevacao));
    const ce = voarLivre(origem, chute(direcao, elevacao + d));
    if (!cd || !ce) {
      elevacao += 0.01;
      continue;
    }
    const a = (cd.x - c0.x) / d;
    const b = (ce.x - c0.x) / d;
    const c = (cd.y - c0.y) / d;
    const e = (ce.y - c0.y) / d;
    const det = a * e - b * c;
    if (Math.abs(det) < 1e-9) {
      elevacao += 0.01;
      continue;
    }
    direcao -= (0.8 * (e * ex - b * ey)) / det;
    elevacao -= (0.8 * (-c * ex + a * ey)) / det;
  }
  const final = voarLivre(origem, chute(direcao, elevacao));
  assert.ok(final && Math.hypot(final.x - alvo.x, final.y - alvo.y) < 0.03, `mira não achou ${JSON.stringify(alvo)}`);
  const m = chute(direcao, elevacao);
  miras.set(chave, m);
  return m;
}

// Uma cobrança completa: barreira, goleiro e bola, como no jogo.
//   barreira: 'sorteio' (pula com a chance do padrão) | 'parada' | 'pula' | 'nenhuma'
//   colisaoBarreira: false = a barreira só posiciona o goleiro e tapa a visão (para medir só o goleiro)
//   danca: intensidade da bola sem rotação (0 = bola normal)
//   modo: 'fisica' (goleiro atualizado a cada passo) | 'quadro' (uma vez por quadro de 1/60 s)
function cobrar({
  origem = { x: 0, z: 22 }, chute, danca = 0, semente = 1, barreira = 'sorteio', colisaoBarreira = true,
  modo = 'fisica', goleiro = {},
}) {
  const aleatorio = sorteio(semente);
  const cfg = { ...CONFIG, goleiro: { ...goleiro }, barreira: {} };
  if (barreira === 'parada') cfg.barreira.chancePulo = 0;
  if (barreira === 'pula') cfg.barreira.chancePulo = 1;
  const b = barreira === 'nenhuma' ? null : montarBarreira(origem, cfg, aleatorio);
  const g = criarGoleiro(origem, b, cfg);
  const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });

  // Antes do chute o goleiro fica balançando um tempo que varia
  const espera = 0.3 + aleatorio() * 0.6;
  for (let t = 0; t < espera; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
  assert.equal(g.pose.estado, 'pronto');

  montarChute(bola, chute);
  if (danca > 0) {
    bola.danca = {
      intensidade: danca, t: 0,
      freq1: 9 + aleatorio() * 6, freq2: 7 + aleatorio() * 6,
      fase1: aleatorio() * Math.PI * 2, fase2: aleatorio() * Math.PI * 2,
    };
  }
  // Uma cópia "fantasma" voa sem ninguém no caminho: diz onde a bola passaria pelo goleiro
  const fantasma = JSON.parse(JSON.stringify(bola));
  let cruzouGoleiro = null;

  const eventos = [];
  const estados = new Set();
  let t = 0;
  const opcoes = () => ({ chutou: true, tempoDesdeChute: t, aleatorio });
  for (let q = 0; q < 3 * 60; q++) {
    if (modo === 'quadro') atualizarGoleiro(g, bola, 1 / 60, cfg, opcoes());
    for (let i = 0; i < 4; i++) {
      t += H;
      if (b) atualizarBarreira(b, t);
      if (modo === 'fisica') atualizarGoleiro(g, bola, H, cfg, opcoes());
      passo(bola, H, CONFIG);
      if (b && colisaoBarreira) colidirBolaBarreira(bola, b, cfg);
      colidirBolaGoleiro(bola, g, cfg);
      for (const ev of bola.eventos) eventos.push({ ...ev, t });
      bola.eventos.length = 0;
      estados.add(g.pose.estado);

      if (!cruzouGoleiro) {
        const z = fantasma.pos.z;
        const { x, y } = fantasma.pos;
        passo(fantasma, H, CONFIG);
        if (z > g.z && fantasma.pos.z <= g.z) {
          const f = (z - g.z) / (z - fantasma.pos.z);
          cruzouGoleiro = { x: x + (fantasma.pos.x - x) * f, y: y + (fantasma.pos.y - y) * f };
        }
      }
    }
  }
  const tipos = new Set(eventos.map((e) => e.tipo));
  let resultado = 'fora';
  if (bola.gol) resultado = 'gol';
  else if (tipos.has('defesa')) resultado = 'defesa';
  else if (tipos.has('barreira')) resultado = 'barreira';
  const defesa = eventos.find((e) => e.tipo === 'defesa');
  return { resultado, modo: defesa?.modo, eventos, estados, bola, g, b, cruzouGoleiro };
}

// Lado do gol em relação ao goleiro: 'goleiro' = lado que a barreira não cobre (onde ele está)
const ladoDoAlvo = (r, alvoX) => (r.b && Math.sign(alvoX) === -r.b.lado ? 'goleiro' : 'barreira');

// Roda várias sementes e devolve a fração de gols (total e por lado)
function taxaDeGols(casos, sementes, extra = {}) {
  const conta = { total: [0, 0], goleiro: [0, 0], barreira: [0, 0] };
  for (const { origem, alvo, velocidade, lateral = 0, topo = 0 } of casos) {
    const chute = mirar(origem, alvo, { velocidade, lateral, topo });
    for (let s = 1; s <= sementes; s++) {
      const r = cobrar({ origem, chute, semente: s, colisaoBarreira: false, ...extra });
      const gol = r.resultado === 'gol' ? 1 : 0;
      for (const k of ['total', ladoDoAlvo(r, alvo.x)]) {
        conta[k][0] += gol;
        conta[k][1]++;
      }
    }
  }
  const pct = ([g, n]) => (n ? g / n : NaN);
  return { total: pct(conta.total), goleiro: pct(conta.goleiro), barreira: pct(conta.barreira), n: conta.total[1] };
}
const pct = (v) => `${Math.round(v * 100)}%`;

const teste = (nome, fn) => {
  const inicio = Date.now();
  fn();
  console.log('ok -', nome, `(${Date.now() - inicio} ms)`);
};

// ---------- Barreira ----------

teste('barreira: quantidade de jogadores pela distância e pelo ângulo', () => {
  assert.equal(quantidadeNaBarreira(18, 0), 5);
  assert.equal(quantidadeNaBarreira(20, 5), 5);
  assert.equal(quantidadeNaBarreira(22, 0), 4);
  assert.equal(quantidadeNaBarreira(24, -10), 4);
  assert.equal(quantidadeNaBarreira(26, 0), 3);
  assert.equal(quantidadeNaBarreira(28, 0), 3);
  assert.equal(quantidadeNaBarreira(31, 0), 2);
  assert.equal(quantidadeNaBarreira(18, 30), 3);
  assert.equal(quantidadeNaBarreira(19, -40), 3);
  assert.equal(montarBarreira({ x: 0, z: 19 }, CONFIG, sorteio(1)).jogadores.length, 5);
  assert.equal(montarBarreira({ x: 10, z: 15 }, CONFIG, sorteio(1)).jogadores.length, 3);
});

teste('barreira: a 9,15 m da bola, lado a lado, alturas variadas, alinhada com a trave', () => {
  for (const [i, pos] of [{ x: 0, z: 18 }, { x: 0, z: 22 }, { x: 6, z: 20 }, { x: -9, z: 17 }, { x: 3, z: 27 }].entries()) {
    const b = montarBarreira(pos, CONFIG, sorteio(i + 1));
    const js = b.jogadores;
    for (const j of js) {
      assert.ok(Math.abs(Math.hypot(j.x - pos.x, j.z - pos.z) - 9.15) < 0.01, 'distância da bola');
      assert.ok(j.altura >= 1.78 && j.altura <= 1.92, `altura ${j.altura}`);
      assert.equal(j.raio, PADRAO_BARREIRA.raio);
      assert.equal(j.yPes, 0);
    }
    for (let k = 1; k < js.length; k++) {
      const d = Math.hypot(js[k].x - js[k - 1].x, js[k].z - js[k - 1].z);
      assert.ok(Math.abs(d - 0.55) < 0.01, `espaço entre jogadores ${d}`);
    }
    // Jogador de fora: passa ~0,3 m da linha bola -> trave do lado coberto, para fora do gol
    const trave = { x: b.lado * MEIA, z: 0 };
    const dx = trave.x - pos.x;
    const dz = trave.z - pos.z;
    const n = Math.hypot(dx, dz);
    const lateral = (j) => ((j.x - pos.x) * -dz + (j.z - pos.z) * dx) / n; // distância à linha (com sinal)
    const sinalFora = Math.sign(lateral({ x: trave.x + b.lado, z: 0 }));
    assert.ok(Math.abs(lateral(js[0]) * sinalFora - 0.3) < 0.02, `sobra ${lateral(js[0])}`);
    for (let k = 1; k < js.length; k++) assert.ok(lateral(js[k]) * sinalFora < lateral(js[k - 1]) * sinalFora, 'vai para dentro');
    // Lado coberto: o da trave mais perto (de frente, sorteado)
    if (Math.abs(pos.x) > 2) assert.equal(b.lado, Math.sign(pos.x));
  }
});

teste('barreira: em falta central cobre uma das metades do gol (vista da bola)', () => {
  const lados = new Set();
  for (let s = 1; s <= 10; s++) {
    const pos = { x: 0, z: 20 };
    const b = montarBarreira(pos, CONFIG, sorteio(s));
    lados.add(b.lado);
    const projecao = b.jogadores.map((j) => pos.x + (j.x - pos.x) * (pos.z / (pos.z - j.z)));
    const fora = Math.max(...projecao.map((x) => x * b.lado));
    const dentro = Math.min(...projecao.map((x) => x * b.lado));
    assert.ok(fora > MEIA, `cobre a trave: ${fora}`);
    assert.ok(dentro < 0.5 && dentro > -1.5, `vai até perto do meio: ${dentro}`);
  }
  assert.equal(lados.size, 2, 'o lado é sorteado');
});

teste('barreira: o pulo sobe e desce numa parábola, depois do chute', () => {
  const b = montarBarreira({ x: 0, z: 22 }, { ...CONFIG, barreira: { chancePulo: 1 } }, sorteio(3));
  assert.ok(b.pula);
  atualizarBarreira(b, -1);
  assert.ok(b.jogadores.every((j) => j.yPes === 0 && j.progressoPulo === 0));
  atualizarBarreira(b, 0.05);
  assert.ok(b.jogadores.every((j) => j.yPes === 0), 'ainda não pulou');
  let maior = 0;
  for (let t = 0; t < 1; t += 0.01) {
    atualizarBarreira(b, t);
    maior = Math.max(maior, ...b.jogadores.map((j) => j.yPes));
  }
  assert.ok(maior > 0.33 && maior < 0.46, `altura do pulo ${maior}`);
  for (const j of b.jogadores) {
    assert.ok(j.pulo.atraso >= 0.1 && j.pulo.atraso <= 0.18, `atraso ${j.pulo.atraso}`);
    atualizarBarreira(b, j.pulo.atraso + j.pulo.duracao / 2);
    assert.ok(Math.abs(j.yPes - j.pulo.altura) < 1e-9, 'pico no meio do pulo');
  }
  atualizarBarreira(b, 2);
  assert.ok(b.jogadores.every((j) => j.yPes === 0 && j.progressoPulo === 1));
  const parada = montarBarreira({ x: 0, z: 22 }, { ...CONFIG, barreira: { chancePulo: 0 } }, sorteio(3));
  atualizarBarreira(parada, 0.4);
  assert.ok(parada.jogadores.every((j) => j.yPes === 0));
});

// (6) Barreira parada segura o rasteiro; pulando, o rasteiro passa por baixo
teste('barreira: chute baixo bate na barreira parada; com ela pulando, o rasteiro passa por baixo', () => {
  for (let s = 1; s <= 6; s++) {
    for (const v of [20, 25]) {
      const rodar = (pula) => {
        const origem = { x: 0, z: 20 };
        const cfg = { ...CONFIG, barreira: { chancePulo: pula ? 1 : 0 } };
        const b = montarBarreira(origem, cfg, sorteio(s));
        const alvo = b.jogadores[Math.floor(b.jogadores.length / 2)];
        const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });
        const d = Math.hypot(alvo.x - origem.x, alvo.z - origem.z);
        bola.vel = { x: ((alvo.x - origem.x) / d) * v, y: 0, z: ((alvo.z - origem.z) / d) * v };
        const batidas = [];
        for (let t = H; t < 2; t += H) {
          atualizarBarreira(b, t);
          passo(bola, H, CONFIG);
          colidirBolaBarreira(bola, b, cfg);
          batidas.push(...bola.eventos.filter((e) => e.tipo === 'barreira'));
          bola.eventos.length = 0;
        }
        return { batidas, bola, b };
      };
      const parada = rodar(false);
      assert.ok(parada.batidas.length >= 1, 'deveria bater na barreira parada');
      assert.ok(parada.bola.pos.z > 5 && !parada.bola.gol, `a bola não passa: z=${parada.bola.pos.z}`);
      assert.ok(parada.b.batidas >= 1 && parada.b.ultimaBatida.parte === 'corpo');
      const pulando = rodar(true);
      assert.equal(pulando.batidas.length, 0, 'deveria passar por baixo');
      assert.ok(pulando.bola.cruzamento, 'a bola chega no gol');
    }
  }
});

teste('barreira: bola na altura do peito rebate fraco; por cima, passa direto', () => {
  const origem = { x: 0, z: 20 };
  const b = montarBarreira(origem, CONFIG, sorteio(2));
  const alvo = b.jogadores[1];
  const rodar = (altura) => {
    const bola = criarBola({ x: origem.x, y: altura, z: origem.z });
    const d = Math.hypot(alvo.x - origem.x, alvo.z - origem.z);
    bola.vel = { x: ((alvo.x - origem.x) / d) * 24, y: 4.5, z: ((alvo.z - origem.z) / d) * 24 };
    for (const j of b.jogadores) j.batida = 0;
    b.batidas = 0;
    b._anterior = null;
    let ev = null;
    for (let t = H; t < 1; t += H) {
      atualizarBarreira(b, -1);
      passo(bola, H, CONFIG);
      colidirBolaBarreira(bola, b, CONFIG);
      ev = ev || bola.eventos.find((e) => e.tipo === 'barreira');
      bola.eventos.length = 0;
    }
    return { ev, bola };
  };
  const peito = rodar(0.11);
  assert.ok(peito.ev, 'deveria bater');
  assert.ok(peito.ev.impacto > 10, `impacto ${peito.ev.impacto}`);
  assert.ok(peito.bola.pos.z > 10, 'volta para o lado de quem cobrou');
  const alto = rodar(1.2);
  assert.ok(!alto.ev, 'bola alta passa por cima');
});

// ---------- Goleiro ----------

teste('goleiro: começa um pouco à frente da linha, do lado que a barreira não cobre, de frente para a bola', () => {
  const origem = { x: 0, z: 22 };
  for (let s = 1; s <= 6; s++) {
    const b = montarBarreira(origem, CONFIG, sorteio(s));
    const g = criarGoleiro(origem, b, CONFIG);
    assert.ok(Math.abs(g.pose.z - PADRAO_GOLEIRO.posicaoZ) < 1e-9);
    assert.ok(Math.abs(g.base.x + b.lado * PADRAO_GOLEIRO.deslocamento) < 1e-9, `x=${g.base.x}`);
    assert.ok(Math.abs(g.pose.rotacaoY) < 0.1);
    assert.equal(g.pose.estado, 'pronto');
  }
  // Falta pela direita: fica perto da bissetriz, puxado para a esquerda (a barreira cobre a direita)
  const lateral = { x: 9, z: 18 };
  const b = montarBarreira(lateral, CONFIG, sorteio(1));
  const g = criarGoleiro(lateral, b, CONFIG);
  const semBarreira = criarGoleiro(lateral, null, CONFIG);
  assert.equal(b.lado, 1);
  assert.ok(semBarreira.base.x > 0.3 && semBarreira.base.x < 1.5, `bissetriz ${semBarreira.base.x}`);
  assert.ok(Math.abs(g.base.x - (semBarreira.base.x - PADRAO_GOLEIRO.deslocamento)) < 1e-9);
  assert.ok(g.pose.rotacaoY > 0.3, 'virado para a bola, à direita');
  // Sem barreira: no meio, numa falta central
  assert.ok(Math.abs(criarGoleiro(origem, null, CONFIG).base.x) < 1e-9);
});

// (1) Chute central na altura do peito a 25 m/s: defendido
teste('(1) chute central na altura do peito a 25 m/s é defendido', () => {
  const casos = [-0.3, 0, 0.3].map((x) => ({ origem: { x: 0, z: 22 }, alvo: { x, y: 1.3 }, velocidade: 25 }));
  const sem = taxaDeGols(casos, 30, { barreira: 'nenhuma' });
  const com = taxaDeGols(casos, 30);
  console.log(`    gols: sem barreira ${pct(sem.total)}, com barreira ${pct(com.total)} (${com.n} chutes)`);
  assert.equal(sem.total, 0);
  assert.ok(com.total <= 0.03);
});

// (2) Chute no ângulo com curva a 28 m/s vindo de 22 m: gol na grande maioria
teste('(2) chute no ângulo (x ±3,3, y 2,1) a 28 m/s com curva, de 22 m: gol em pelo menos 70%', () => {
  const casos = [];
  for (const origem of [{ x: 0, z: 22 }, { x: 5, z: 21.4 }, { x: -5, z: 21.4 }]) {
    for (const x of [-3.3, 3.3]) for (const lateral of [-40, 40]) casos.push({ origem, alvo: { x, y: 2.1 }, velocidade: 28, lateral });
  }
  const r = taxaDeGols(casos, 20);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, por cima da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total >= 0.7, `só ${pct(r.total)}`);
  assert.ok(r.goleiro >= 0.4, `no canto do goleiro só ${pct(r.goleiro)}`);
  // De frente para o gol, a curva atrapalha a leitura do goleiro: ele erra mais o ponto do mergulho
  const erroDeLeitura = (lateral) => {
    let soma = 0;
    let n = 0;
    let gols = 0;
    for (const x of [-3.3, 3.3]) {
      for (const lat of lateral ? [lateral, -lateral] : [0]) {
        const chute = mirar({ x: 0, z: 22 }, { x, y: 2.1 }, { velocidade: 28, lateral: lat });
        for (let s = 1; s <= 40; s++) {
          const r = cobrar({ chute, semente: s, colisaoBarreira: false });
          if (ladoDoAlvo(r, x) !== 'goleiro') continue;
          if (r.resultado === 'gol') gols++;
          if (r.g.mergulho && r.cruzouGoleiro) {
            soma += Math.abs(r.g.mergulho.alvoLido.x - r.cruzouGoleiro.x);
            n++;
          }
        }
      }
    }
    return { erro: soma / n, gols: gols / n };
  };
  const reto = erroDeLeitura(0);
  const curva = erroDeLeitura(40);
  console.log(`    de frente, no canto do goleiro: erro lateral da leitura ${reto.erro.toFixed(2)} m sem curva, ${curva.erro.toFixed(2)} m com curva`);
  console.log(`    (gols no canto do goleiro: sem curva ${pct(reto.gols)}, com curva ${pct(curva.gols)})`);
  assert.ok(curva.erro > reto.erro * 1.2, 'a curva deveria atrapalhar a leitura do goleiro');
});

// (3) Rasteiro no canto a 30 m/s: gol na maioria
teste('(3) rasteiro no canto (x ±3,2, y 0,3) a 30 m/s: gol em pelo menos 60%', () => {
  const casos = [-3.2, 3.2].map((x) => ({ origem: { x: 0, z: 22 }, alvo: { x, y: 0.3 }, velocidade: 30 }));
  const r = taxaDeGols(casos, 60);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, lado da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total >= 0.6, `só ${pct(r.total)}`);
  assert.ok(r.goleiro >= 0.35, `no canto do goleiro só ${pct(r.goleiro)}`);
});

// (4) Meia altura, 1,5 m para dentro da trave, a 20 m/s: defendido na maioria
teste('(4) meia altura, 1,5 m para dentro da trave, a 20 m/s: defendido na maioria', () => {
  const x = MEIA - 1.5;
  const casos = [-x, x].map((xx) => ({ origem: { x: 0, z: 22 }, alvo: { x: xx, y: 1.0 }, velocidade: 20 }));
  const r = taxaDeGols(casos, 60);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, lado da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total <= 0.2, `${pct(r.total)} de gols`);
  assert.ok(r.barreira <= 0.35, `do lado da barreira ${pct(r.barreira)} de gols`);
});

teste('goleiro: o chute mais forte é mais difícil; o colocado no meio do gol quase sempre é defendido', () => {
  const canto = (velocidade) => taxaDeGols([1, -1].map((s) => ({ origem: { x: 0, z: 22 }, alvo: { x: 3.3 * s, y: 2.1 }, velocidade })), 30);
  const fraco = canto(20);
  const forte = canto(32);
  console.log(`    no ângulo: 20 m/s ${pct(fraco.total)} de gols, 32 m/s ${pct(forte.total)}`);
  assert.ok(forte.total > fraco.total + 0.15);
  const meio = taxaDeGols([1, -1].map((s) => ({ origem: { x: 0, z: 22 }, alvo: { x: 1.2 * s, y: 1.2 }, velocidade: 28 })), 30);
  console.log(`    a 1,2 m do meio, a 28 m/s: ${pct(meio.total)} de gols`);
  assert.ok(meio.total <= 0.1);
});

// (5) Bola sem rotação: mais difícil de ler que a mesma bola sem a oscilação
teste('(5) bola sem rotação é mais difícil de ler que a equivalente sem oscilação', () => {
  const origem = { x: 0, z: 25 };
  const conta = (danca) => {
    let gols = 0;
    let erro = 0;
    let n = 0;
    for (const alvo of [{ x: 1.8, y: 1.5 }, { x: -1.8, y: 1.5 }, { x: 0.8, y: 1.0 }]) {
      const chute = mirar(origem, alvo, { velocidade: 30 });
      for (let s = 1; s <= 40; s++) {
        const r = cobrar({ origem, chute, danca, semente: s, colisaoBarreira: false });
        if (r.resultado === 'gol') gols++;
        const m = r.g.mergulho;
        if (m && r.cruzouGoleiro) {
          erro += Math.hypot(m.alvoLido.x - r.cruzouGoleiro.x, m.alvoLido.y - r.cruzouGoleiro.y);
          n++;
        }
      }
    }
    return { gols: gols / 120, erro: erro / n };
  };
  const normal = conta(0);
  const semRotacao = conta(1);
  console.log(`    erro médio da leitura: normal ${normal.erro.toFixed(2)} m, sem rotação ${semRotacao.erro.toFixed(2)} m`);
  console.log(`    gols: normal ${pct(normal.gols)}, sem rotação ${pct(semRotacao.gols)}`);
  assert.ok(semRotacao.erro > normal.erro * 1.25);
  assert.ok(semRotacao.gols > normal.gols + 0.1);
});

// (7) Mesma semente, mesmo resultado
teste('(7) mesma semente = mesmo resultado (e quase o mesmo atualizando a cada quadro)', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 3.3, y: 2.1 }, { velocidade: 28, lateral: 40 });
  for (let s = 1; s <= 8; s++) {
    const a = cobrar({ chute, semente: s, danca: 0.8 });
    const b = cobrar({ chute, semente: s, danca: 0.8 });
    assert.equal(a.resultado, b.resultado);
    assert.deepEqual(a.bola.pos, b.bola.pos);
    assert.deepEqual(a.g.pose, b.g.pose);
    assert.equal(a.eventos.length, b.eventos.length);
  }
  const casos = [{ origem: { x: 0, z: 22 }, alvo: { x: 3.3, y: 2.1 }, velocidade: 28, lateral: 40 }];
  const fisica = taxaDeGols(casos, 40);
  const quadro = taxaDeGols(casos, 40, { modo: 'quadro' });
  console.log(`    gols atualizando a cada passo ${pct(fisica.total)}, a cada quadro ${pct(quadro.total)}`);
  assert.ok(Math.abs(fisica.total - quadro.total) <= 0.15);
});

teste('goleiro: bola fraca no peito é encaixada e fica com ele (sem mexer no gol/cruzamento)', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 0, y: 1.2 }, { velocidade: 19 });
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute, semente: s, barreira: 'nenhuma' });
    assert.equal(r.resultado, 'defesa');
    assert.equal(r.modo, 'segurou');
    assert.equal(r.g.pose.estado, 'segurou');
    assert.equal(r.bola.cruzamento, null);
    assert.equal(r.bola.gol, false);
    const { maos } = r.g.pose;
    const meio = { x: (maos.direita.x + maos.esquerda.x) / 2, z: (maos.direita.z + maos.esquerda.z) / 2 };
    assert.ok(Math.hypot(r.bola.pos.x - meio.x, r.bola.pos.z - meio.z) < 0.2, 'bola nas mãos');
    assert.ok(Math.hypot(r.bola.vel.x, r.bola.vel.y, r.bola.vel.z) < 0.01, 'parada');
  }
});

teste('goleiro: bola forte no corpo é espalmada e volta para o campo', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 0, y: 1.2 }, { velocidade: 30 });
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute, semente: s, barreira: 'nenhuma' });
    assert.equal(r.resultado, 'defesa');
    const primeira = r.eventos.find((e) => e.tipo === 'defesa');
    assert.equal(primeira.modo, 'espalmou');
    assert.ok(primeira.impacto > 10);
    assert.ok(!r.bola.cruzamento, 'não passou da linha');
  }
});

teste('goleiro: pose coerente do começo ao fim (estados, rolagem, mergulho)', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 3.2, y: 0.4 }, { velocidade: 26 });
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute, semente: s, colisaoBarreira: false });
    const p = r.g.pose;
    assert.ok(r.estados.has('mergulhando'), [...r.estados].join(','));
    assert.ok(p.estado === 'caido' || p.estado === 'segurou', p.estado);
    assert.ok(Math.abs(p.rolagem) <= 1.41 && Math.abs(p.rolagem) > 1, `rolagem ${p.rolagem}`);
    assert.ok(p.progressoMergulho === 1 && p.bracos > 0.9);
    assert.ok(p.y > 0.05 && p.y < 0.6, `deitado no chão: quadril em ${p.y}`);
    const parte = partesDoGoleiro(r.g);
    assert.ok(parte.every((q) => q.y > 0 && (!q.ate || q.ate.y > -0.05)), 'nada abaixo do chão');
    // Sempre mergulha para o lado da bola
    const ladoBola = Math.sign(3.2 - r.g.base.x);
    assert.equal(p.lado, ladoBola);
    assert.equal(Math.sign(p.rolagem), ladoBola);
  }
  // Bola alta no meio: salta, sem tombar
  const alto = mirar({ x: 0, z: 22 }, { x: 0.2, y: 2.25 }, { velocidade: 24 });
  let saltou = 0;
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute: alto, semente: s, barreira: 'nenhuma' });
    if (r.g.mergulho && r.g.mergulho.Cf.y > 1.4 && r.g.mergulho.lado === 0) saltou++;
    assert.ok(Math.abs(r.g.mergulho?.rolagem ?? 0) < 0.6);
  }
  assert.ok(saltou >= 8, `saltou ${saltou} de 10`);
});

teste('goleiro: chute que vai para fora não faz ele mergulhar', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 5.6, y: 1.0 }, { velocidade: 26 });
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute, semente: s, barreira: 'nenhuma' });
    assert.equal(r.resultado, 'fora');
    assert.ok(!r.estados.has('mergulhando'));
  }
});

teste('goleiro: bola que passa por cima da barreira atrasa a reação', () => {
  const origem = { x: 0, z: 22 };
  for (let s = 1; s <= 6; s++) {
    const b = montarBarreira(origem, CONFIG, sorteio(s));
    const ladoBarreira = { x: b.lado * 2.8, y: 2.0 };
    const ladoGoleiro = { x: -b.lado * 2.8, y: 1.0 };
    for (const [alvo, tapada] of [[ladoBarreira, true], [ladoGoleiro, false]]) {
      const r = cobrar({ origem, chute: mirar(origem, alvo, { velocidade: 26 }), semente: s, colisaoBarreira: false });
      assert.equal(r.b.lado, b.lado);
      assert.equal(r.g.tapada, tapada);
      const esperado = PADRAO_GOLEIRO.reflexo + (tapada ? PADRAO_GOLEIRO.atrasoBarreira : 0);
      assert.ok(Math.abs(r.g.reacao - esperado) < 1e-9);
    }
  }
});

teste('goleiro e barreira juntos: a jogada completa termina em gol, defesa, barreira ou fora', () => {
  const resultados = {};
  for (let s = 1; s <= 40; s++) {
    const a = sorteio(1000 + s);
    const alvo = { x: (a() * 2 - 1) * 3.3, y: 0.3 + a() * 1.9 };
    const velocidade = 20 + a() * 12;
    const lateral = (a() * 2 - 1) * 45;
    const r = cobrar({ chute: mirar({ x: 0, z: 22 }, alvo, { velocidade, lateral }), semente: s });
    resultados[r.resultado] = (resultados[r.resultado] || 0) + 1;
    assert.ok(Number.isFinite(r.bola.pos.x + r.bola.pos.y + r.bola.pos.z));
  }
  console.log('    40 chutes ao acaso no gol:', JSON.stringify(resultados));
  assert.ok(resultados.defesa > 0 && resultados.barreira > 0 && resultados.gol > 0);
});
