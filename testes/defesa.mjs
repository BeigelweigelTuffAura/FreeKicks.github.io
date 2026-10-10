// Testes da barreira e do goleiro. Rodar com: node testes/defesa.mjs
// (com --completo, o "jogador bom" bate mais faltas: demora mais e dá números mais firmes)
// Tudo é determinista: cada cobrança usa um sorteio com semente fixa (mesma semente, mesmo resultado).
// Os números de "quantos % de gols" medem a sensação: o goleiro defende o fácil e sofre no ângulo.
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { criarBola, passo, chutar } from '../js/physics.js';
import { ELENCO } from '../js/elenco.js';
import {
  montarBarreira, atualizarBarreira, colidirBolaBarreira, quantidadeNaBarreira, PADRAO_BARREIRA,
} from '../js/barreira.js';
import {
  criarGoleiro, atualizarGoleiro, colidirBolaGoleiro, partesDoGoleiro, PADRAO_GOLEIRO, PADRAO_PENALTI,
} from '../js/goleiro.js';

const COMPLETO = process.argv.includes('--completo');
const H = 1 / 240; // passo da física, como no jogo
const MEIA = CONFIG.golLargura / 2;
const GRAUS = Math.PI / 180;

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
//   chute: { velocidade, direcao, ... } montado à mão; ou preparar(bola, aleatorio): chute de verdade (chutar())
//   barreira: 'sorteio' (pula com a chance do padrão) | 'parada' | 'pula' | 'nenhuma'
//   colisaoBarreira: false = a barreira só posiciona o goleiro e tapa a visão (para medir só o goleiro)
//   danca: intensidade da bola sem rotação (0 = bola normal)
//   modo: 'fisica' (goleiro atualizado a cada passo) | 'quadro' (uma vez por quadro de 1/60 s)
//   registrar: guarda, a cada passo, a bola, o centro do corpo e se ele está segurando
function cobrar({
  origem = { x: 0, z: 22 }, chute, preparar, danca = 0, semente = 1, barreira = 'sorteio', colisaoBarreira = true,
  modo = 'fisica', goleiro = {}, registrar = false,
}) {
  const aleatorio = sorteio(semente);
  const cfg = { ...CONFIG, goleiro: { ...goleiro }, barreira: {} };
  if (barreira === 'parada') cfg.barreira.chancePulo = 0;
  if (barreira === 'pula') cfg.barreira.chancePulo = 1;
  const b = barreira === 'nenhuma' ? null : montarBarreira(origem, cfg, aleatorio);
  const g = criarGoleiro(origem, b, cfg);
  const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });

  // Antes do chute: o goleiro dá o passo para o lado e espera (o tempo de mirar e carregar varia)
  const espera = 1.0 + aleatorio() * 0.6;
  for (let t = 0; t < espera; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
  assert.equal(g.pose.estado, 'pronto');

  if (preparar) preparar(bola, aleatorio);
  else montarChute(bola, chute);
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
  const trilha = [];
  let t = 0;
  const opcoes = () => ({ chutou: true, tempoDesdeChute: t, aleatorio });
  for (let q = 0; q < 3 * 60; q++) {
    if (modo === 'quadro') atualizarGoleiro(g, bola, 1 / 60, cfg, opcoes());
    for (let i = 0; i < 4; i++) {
      t += H;
      if (b) atualizarBarreira(b, t);
      if (modo === 'fisica') atualizarGoleiro(g, bola, H, cfg, opcoes());
      const antes = { ...bola.pos };
      passo(bola, H, CONFIG);
      if (b && colisaoBarreira) colidirBolaBarreira(bola, b, cfg);
      colidirBolaGoleiro(bola, g, cfg);
      for (const ev of bola.eventos) eventos.push({ ...ev, t });
      bola.eventos.length = 0;
      estados.add(g.pose.estado);
      if (registrar) {
        trilha.push({
          t, bola: { ...bola.pos }, centro: { x: g.cx, y: g.cy }, segurando: g.segurando,
          salto: Math.hypot(bola.pos.x - antes.x, bola.pos.y - antes.y, bola.pos.z - antes.z),
        });
      }

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
  return { resultado, modo: defesa?.modo, eventos, estados, bola, g, b, cruzouGoleiro, trilha };
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

teste('barreira: com os ajustes do pulo no zero, ninguém pula antes do chute nem afunda no chão', () => {
  const zerado = { chancePulo: 1, alturaPulo: 0, atrasoPulo: 0, duracaoPulo: 0 };
  for (let s = 1; s <= 10; s++) {
    const b = montarBarreira({ x: 0, z: 22 }, { ...CONFIG, barreira: zerado }, sorteio(s));
    for (const j of b.jogadores) {
      assert.ok(j.pulo.atraso >= 0 && j.pulo.altura >= 0 && j.pulo.duracao > 0, JSON.stringify(j.pulo));
    }
    for (let t = -0.5; t < 1; t += 0.01) {
      atualizarBarreira(b, t);
      assert.ok(b.jogadores.every((j) => Number.isFinite(j.yPes) && j.yPes >= 0), `t=${t}`);
    }
  }
  // Sem config nenhuma, vale o padrão
  const b = montarBarreira({ x: 0, z: 22 });
  assert.equal(b.jogadores.length, 4);
  assert.ok(b.jogadores.every((j) => Number.isFinite(j.x + j.z + j.altura)));
});

// Barreira parada segura o rasteiro; pulando, o rasteiro passa por baixo
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

// ---------- Goleiro: antes do chute ----------

teste('goleiro: começa no meio do ângulo e, antes do chute, dá o passo para o lado que a barreira não cobre', () => {
  // (de 22 m a barreira tem 4: ele sai o deslocamento inteiro)
  const origem = { x: 0, z: 22 };
  const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });
  for (let s = 1; s <= 6; s++) {
    const b = montarBarreira(origem, CONFIG, sorteio(s));
    const g = criarGoleiro(origem, b, CONFIG);
    assert.ok(Math.abs(g.pose.z - PADRAO_GOLEIRO.posicaoZ) < 1e-9);
    assert.ok(Math.abs(g.base.x + b.lado * PADRAO_GOLEIRO.deslocamento) < 1e-9, `x=${g.base.x}`);
    assert.ok(Math.abs(g.cx) < 1e-9, 'começa na bissetriz (de frente: no meio)');
    assert.ok(Math.abs(g.pose.rotacaoY) < 0.1);
    assert.equal(g.pose.estado, 'pronto');
    // Anda de lado, sem pressa e sem passar do ponto
    let maisLonge = 0;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      atualizarGoleiro(g, bola, 1 / 60, CONFIG, { chutou: false });
      maisLonge = Math.max(maisLonge, -b.lado * g.cx);
      assert.ok(Math.abs(g.vx) <= 1.5 + 1e-9, `passo rápido demais: ${g.vx}`);
    }
    assert.ok(Math.abs(g.cx - g.base.x) < 0.06, `chegou no lugar: ${g.cx} (base ${g.base.x})`);
    assert.ok(maisLonge < PADRAO_GOLEIRO.deslocamento + 0.06, 'não passa do ponto');
    assert.ok(Math.abs(g.pose.rotacaoY) < 0.1, 'de frente para a bola');
  }
  // Falta pela direita: fica perto da bissetriz, puxado para a esquerda (a barreira cobre a direita)
  const lateral = { x: 9, z: 18 };
  const b = montarBarreira(lateral, CONFIG, sorteio(1));
  const g = criarGoleiro(lateral, b, CONFIG);
  const semBarreira = criarGoleiro(lateral, null, CONFIG);
  assert.equal(b.lado, 1);
  assert.ok(semBarreira.base.x > 0.3 && semBarreira.base.x < 1.5, `bissetriz ${semBarreira.base.x}`);
  // (barreira de 3: ele sai um pouco menos do meio)
  assert.equal(b.jogadores.length, 3);
  assert.ok(Math.abs(g.base.x - (semBarreira.base.x - PADRAO_GOLEIRO.deslocamento * 0.75)) < 1e-9);
  // De longe, com 2 na barreira, sai só metade
  const longe = { x: 0, z: 31 };
  const b2 = montarBarreira(longe, CONFIG, sorteio(1));
  assert.equal(b2.jogadores.length, 2);
  assert.ok(Math.abs(criarGoleiro(longe, b2, CONFIG).base.x + b2.lado * PADRAO_GOLEIRO.deslocamento * 0.5) < 1e-9);
  assert.ok(g.pose.rotacaoY > 0.3, 'virado para a bola, à direita');
  // Sem barreira: no meio, numa falta central
  assert.ok(Math.abs(criarGoleiro(origem, null, CONFIG).base.x) < 1e-9);
});

teste('goleiro: na corrida do cobrador se firma e dá o passinho de prontidão, caindo na base na hora do chute', () => {
  const origem = { x: 0, z: 22 };
  const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });
  const g = criarGoleiro(origem, montarBarreira(origem, CONFIG, sorteio(1)), CONFIG);
  for (let t = 0; t < 1.5; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60, CONFIG, { chutou: false });
  const quadril = g.pose.y;
  assert.ok(g.pose.prontidao < 0.01, 'relaxado antes da corrida');
  // Corrida de 0,8 s
  let pico = 0;
  const xs = [];
  for (let falta = 0.8; falta > 1e-9; falta -= 1 / 120) {
    atualizarGoleiro(g, bola, 1 / 120, CONFIG, { chutou: false, tempoAteChute: falta });
    pico = Math.max(pico, g.pose.y - 0.92);
    if (falta < 0.13) xs.push(g.pose.x);
  }
  atualizarGoleiro(g, bola, 1 / 120, CONFIG, { chutou: false, tempoAteChute: 0 });
  assert.ok(g.pose.prontidao > 0.99, `firme na base: ${g.pose.prontidao}`);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.005, 'parou de balançar');
  assert.ok(pico > 0.025 && pico < 0.05, `passinho de ${pico} m`);
  assert.ok(Math.abs(g.pose.y - 0.92) < 0.003, `caiu na base na hora do chute (quadril ${g.pose.y}, antes ${quadril})`);
  // Sem saber da corrida: o passinho vem logo depois do chute (no tempo de reação)
  const g2 = criarGoleiro(origem, null, CONFIG);
  for (let t = 0; t < 1.5; t += 1 / 60) atualizarGoleiro(g2, bola, 1 / 60, CONFIG, { chutou: false });
  bola.vel = { x: 0, y: 3, z: -25 };
  let pico2 = 0;
  for (let t = H; t < 0.25; t += H) {
    atualizarGoleiro(g2, bola, H, CONFIG, { chutou: true, tempoDesdeChute: t, aleatorio: sorteio(1) });
    if (t < 0.2) pico2 = Math.max(pico2, g2.pose.y - g2.cy + 0.3);
  }
  assert.ok(pico2 > 0.025, `passinho depois do chute: ${pico2}`);
  assert.ok(Math.abs(g2.pose.y - (g2.cy - 0.3)) < 1e-9, 'e já caiu na base');
});

// ---------- Goleiro: defende o fácil ----------

// (1) Chute central na altura do peito a 25 m/s: defendido sempre
teste('(1) chute central na altura do peito a 25 m/s é defendido sempre', () => {
  const casos = [-0.3, 0, 0.3].map((x) => ({ origem: { x: 0, z: 22 }, alvo: { x, y: 1.3 }, velocidade: 25 }));
  const sem = taxaDeGols(casos, 30, { barreira: 'nenhuma' });
  const com = taxaDeGols(casos, 30);
  console.log(`    gols: sem barreira ${pct(sem.total)}, com barreira ${pct(com.total)} (${com.n} chutes)`);
  assert.equal(sem.total, 0);
  assert.equal(com.total, 0);
});

// (2) Curva no chute que vai no meio do gol quase não ajuda: ela engana quando a bola termina longe dele
teste('(2) chute no meio com curva, de 22 m: no máximo ~1,5x os gols do chute reto', () => {
  const casos = (giro) => {
    const lista = [];
    for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) {
      for (const y of [0.6, 1.2, 1.8]) {
        for (const s of giro ? [-1, 1] : [1]) lista.push({ origem: { x: 0, z: 22 }, alvo: { x, y }, velocidade: 28, lateral: s * giro });
      }
    }
    return lista;
  };
  const reto = taxaDeGols(casos(0), 24);
  const comCurva = [30, 45, 60].map((giro) => ({ giro, ...taxaDeGols(casos(giro), 12) }));
  console.log(`    gols: reto ${pct(reto.total)}; ${comCurva.map((c) => `giro ${c.giro} ${pct(c.total)}`).join(', ')} (${reto.n} chutes cada)`);
  for (const c of comCurva) assert.ok(c.total <= 1.5 * reto.total + 0.03, `giro ${c.giro}: ${pct(c.total)} contra ${pct(reto.total)}`);
  const media = comCurva.reduce((s, c) => s + c.total, 0) / comCurva.length;
  assert.ok(media <= 1.5 * reto.total + 0.015, `média com curva ${pct(media)}`);

  // E ele não se joga longe da bola só porque a primeira impressão da curva enganou
  let longe = 0;
  let n = 0;
  for (const { origem, alvo, velocidade, lateral } of casos(45)) {
    const chute = mirar(origem, alvo, { velocidade, lateral });
    for (let s = 1; s <= 6; s++) {
      const r = cobrar({ origem, chute, semente: s, colisaoBarreira: false });
      n++;
      if (r.g.mergulho && r.cruzouGoleiro && Math.abs(r.g.mergulho.alvoLido.x - r.cruzouGoleiro.x) > 1) longe++;
    }
  }
  console.log(`    curva para o meio: mergulhou a mais de 1 m da bola em ${pct(longe / n)} (${n} chutes)`);
  assert.ok(longe / n <= 0.03);
});

// (5) Meia altura, 1,5 m para dentro da trave, a 20 m/s: defendido na maioria
teste('(5) meia altura, 1,5 m para dentro da trave, a 20 m/s: defendido na maioria', () => {
  const x = MEIA - 1.5;
  const casos = [-x, x].map((xx) => ({ origem: { x: 0, z: 22 }, alvo: { x: xx, y: 1.0 }, velocidade: 20 }));
  const r = taxaDeGols(casos, 60);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, lado da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total <= 0.2, `${pct(r.total)} de gols`);
  assert.ok(r.barreira <= 0.35, `do lado da barreira ${pct(r.barreira)} de gols`);
});

// ---------- Goleiro: sofre no ângulo ----------

// (3) Chute no ângulo a 28 m/s vindo de 22 m: gol na grande maioria
teste('(3) chute no ângulo (x ±3,3, y 2,1) a 28 m/s, de 22 m: gol em pelo menos 65%', () => {
  const casos = [];
  for (const origem of [{ x: 0, z: 22 }, { x: 5, z: 21.4 }, { x: -5, z: 21.4 }]) {
    for (const x of [-3.3, 3.3]) for (const lateral of [-40, 0, 40]) casos.push({ origem, alvo: { x, y: 2.1 }, velocidade: 28, lateral });
  }
  const r = taxaDeGols(casos, 20);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, por cima da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total >= 0.65, `só ${pct(r.total)}`);
  assert.ok(r.goleiro >= 0.4, `no canto do goleiro só ${pct(r.goleiro)}`);
  // No canto dele, a curva atrapalha: ele espera para ler melhor e chega atrasado
  const noCanto = (lateral) => {
    let gols = 0;
    let n = 0;
    let tempoMergulho = 0;
    let comMergulho = 0;
    for (const x of [-3.3, 3.3]) {
      for (const lat of lateral ? [lateral, -lateral] : [0]) {
        const chute = mirar({ x: 0, z: 22 }, { x, y: 2.1 }, { velocidade: 28, lateral: lat });
        for (let s = 1; s <= 30; s++) {
          const r2 = cobrar({ chute, semente: s, colisaoBarreira: false });
          if (ladoDoAlvo(r2, x) !== 'goleiro') continue;
          n++;
          if (r2.resultado === 'gol') gols++;
          if (r2.g.mergulho) {
            tempoMergulho += r2.g.mergulho.t0;
            comMergulho++;
          }
        }
      }
    }
    return { gols: gols / n, t0: tempoMergulho / comMergulho };
  };
  const reto = noCanto(0);
  const curva = noCanto(40);
  console.log(`    no canto do goleiro: sem curva ${pct(reto.gols)} de gols (mergulha em ${reto.t0.toFixed(2)} s), com curva ${pct(curva.gols)} (em ${curva.t0.toFixed(2)} s)`);
  assert.ok(curva.gols >= reto.gols + 0.15, 'a curva no canto deveria enganar o goleiro');
  assert.ok(curva.t0 > reto.t0, 'com curva ele demora mais para se decidir');
});

// (4) Rasteiro no canto a 30 m/s: gol na maioria
teste('(4) rasteiro no canto (x ±3,2, y 0,3) a 30 m/s: gol em pelo menos 55%', () => {
  const casos = [-3.2, 3.2].map((x) => ({ origem: { x: 0, z: 22 }, alvo: { x, y: 0.3 }, velocidade: 30 }));
  const r = taxaDeGols(casos, 60);
  console.log(`    gols: ${pct(r.total)} (lado do goleiro ${pct(r.goleiro)}, lado da barreira ${pct(r.barreira)}; ${r.n} chutes)`);
  assert.ok(r.total >= 0.55, `só ${pct(r.total)}`);
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

// (6) Bola sem rotação: mais difícil de ler que a mesma bola sem a oscilação
teste('(6) bola sem rotação é mais difícil de ler que a equivalente sem oscilação', () => {
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

// (8) Mesma semente, mesmo resultado
teste('(8) mesma semente = mesmo resultado (e quase o mesmo atualizando a cada quadro)', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 3.3, y: 2.1 }, { velocidade: 28, lateral: 40 });
  for (let s = 1; s <= 8; s++) {
    const a = cobrar({ chute, semente: s, danca: 0.8 });
    const b = cobrar({ chute, semente: s, danca: 0.8 });
    assert.equal(a.resultado, b.resultado);
    assert.deepEqual(a.bola.pos, b.bola.pos);
    assert.deepEqual(a.g.pose, b.g.pose);
    assert.equal(a.eventos.length, b.eventos.length);
  }
  const casos = [
    { origem: { x: 0, z: 22 }, alvo: { x: 3.3, y: 2.1 }, velocidade: 28, lateral: 40 },
    { origem: { x: 0, z: 22 }, alvo: { x: -2.4, y: 1.2 }, velocidade: 26 },
    { origem: { x: 0, z: 22 }, alvo: { x: 2.8, y: 0.4 }, velocidade: 28 },
  ];
  const fisica = taxaDeGols(casos, 30);
  const quadro = taxaDeGols(casos, 30, { modo: 'quadro' });
  console.log(`    gols atualizando a cada passo ${pct(fisica.total)}, a cada quadro ${pct(quadro.total)}`);
  assert.ok(Math.abs(fisica.total - quadro.total) <= 0.1);
});

// ---------- Goleiro: o corpo ----------

teste('goleiro: o mergulho é físico (as pernas aceleram o corpo, depois ele voa em parábola)', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: -2.9, y: 1.5 }, { velocidade: 24 });
  let voos = 0;
  for (let s = 1; s <= 8; s++) {
    const r = cobrar({ chute, semente: s, barreira: 'nenhuma', registrar: true });
    const m = r.g.mergulho;
    assert.ok(m && m.modo === 'voo' && m.lado !== 0, 'mergulha de lado');
    const pts = r.trilha.filter((p) => p.t >= m.t0 - 1e-9);
    const vel = (i) => (pts[i + 1].centro.x - pts[i].centro.x) / H;
    // Impulso: a velocidade de lado muda aos poucos, com as pernas no chão (nada de sair voando de uma
    // vez): parte do embalo dos passos e chega na velocidade de saída no fim do impulso
    const nImpulso = Math.floor(m.preparo / H) - 1;
    const aceleracaoMax = (PADRAO_GOLEIRO.velocidadeMergulho + PADRAO_GOLEIRO.velocidadeCorrida) / m.preparo;
    for (let i = 1; i < nImpulso; i++) assert.ok(Math.abs(vel(i) - vel(i - 1)) <= aceleracaoMax * H + 1e-3, 'sem trancos no impulso');
    assert.ok(Math.abs(vel(0) - m.v0.x) < 0.3, `começa no embalo dos passos: ${vel(0)} (passos a ${m.v0.x})`);
    assert.ok(Math.abs(vel(nImpulso) - m.vL.x) < 0.3, `sai do chão na velocidade planejada: ${vel(nImpulso)} (${m.vL.x})`);
    // Nunca mais rápido que as pernas conseguem
    for (let i = 0; i < pts.length - 1; i++) assert.ok(Math.abs(vel(i)) <= PADRAO_GOLEIRO.velocidadeMergulho + 0.05, `rápido demais: ${vel(i)}`);
    // No ar (depois do impulso e antes de tocar o chão): cai com a gravidade
    const fimDoVoo = m.pouso ? m.pouso.tau : Infinity;
    let medidos = 0;
    for (let i = nImpulso + 3; i < pts.length - 1; i++) {
      const tau = pts[i].t - m.t0;
      if (tau > fimDoVoo - 3 * H || pts[i].centro.y < 0.9) break;
      const ay = (pts[i + 1].centro.y - 2 * pts[i].centro.y + pts[i - 1].centro.y) / (H * H);
      assert.ok(Math.abs(ay + 9.81) < 0.2, `aceleração no ar ${ay}`);
      medidos++;
    }
    if (medidos >= 20) voos++;
    // Termina deitado no chão, perto da trave (na frente da linha do gol, então não entra na rede)
    assert.ok(r.g.pose.y > 0.05 && r.g.pose.y < 0.6, `deitado: quadril em ${r.g.pose.y}`);
    assert.ok(r.g.cx < -1.5 && r.g.cx > -MEIA - 1.4, `termina em x=${r.g.cx}`);
    assert.ok(Math.abs(r.g.pose.z - PADRAO_GOLEIRO.posicaoZ) < 0.35, 'na frente da linha');
  }
  assert.ok(voos >= 4, `voos medidos: ${voos}`);
});

teste('goleiro: bola fraca no peito é encaixada; a bola vai com as mãos até o peito, sem pular', () => {
  for (const [alvo, v] of [[{ x: 0, y: 1.2 }, 19], [{ x: 0.5, y: 1.0 }, 18], [{ x: -0.8, y: 1.4 }, 18]]) {
    const chute = mirar({ x: 0, z: 22 }, alvo, { velocidade: v });
    for (let s = 1; s <= 8; s++) {
      const r = cobrar({ chute, semente: s, barreira: 'nenhuma', registrar: true });
      assert.equal(r.resultado, 'defesa');
      assert.equal(r.modo, 'segurou');
      assert.equal(r.g.pose.estado, 'segurou');
      assert.equal(r.bola.cruzamento, null);
      assert.equal(r.bola.gol, false);
      // A bola presa anda junto com o corpo: nada de "teletransporte" para as mãos
      const i = r.trilha.findIndex((p) => p.segurando);
      const saltos = r.trilha.slice(i + 1).map((p) => p.salto);
      assert.ok(Math.max(...saltos) < 0.03, `a bola pulou ${Math.max(...saltos).toFixed(3)} m num passo`);
      const { maos } = r.g.pose;
      const meio = { x: (maos.direita.x + maos.esquerda.x) / 2, y: (maos.direita.y + maos.esquerda.y) / 2, z: (maos.direita.z + maos.esquerda.z) / 2 };
      assert.ok(Math.hypot(r.bola.pos.x - meio.x, r.bola.pos.y - meio.y, r.bola.pos.z - meio.z) < 0.2, 'bola nas mãos');
      assert.ok(Math.hypot(r.bola.pos.x - r.g.cx, r.bola.pos.y - r.g.cy) < 0.15, 'no fim, junto ao peito');
      assert.ok(Math.hypot(r.bola.vel.x, r.bola.vel.y, r.bola.vel.z) < 0.01, 'parada');
    }
  }
});

teste('goleiro: bola forte no corpo é espalmada e volta para o campo com um rebote crível', () => {
  const chute = mirar({ x: 0, z: 22 }, { x: 0, y: 1.2 }, { velocidade: 30 });
  for (let s = 1; s <= 10; s++) {
    const r = cobrar({ chute, semente: s, barreira: 'nenhuma', registrar: true });
    assert.equal(r.resultado, 'defesa');
    const primeira = r.eventos.find((e) => e.tipo === 'defesa');
    assert.equal(primeira.modo, 'espalmou');
    assert.ok(primeira.impacto > 10);
    assert.ok(!r.bola.cruzamento, 'não passou da linha');
    // Logo depois da batida: volta para o campo (às vezes espalmada para o chão) com uns 25% a 60% da velocidade
    const i = r.trilha.findIndex((p) => Math.abs(p.t - primeira.t) < 1e-9);
    const a = r.trilha[i + 1].bola;
    const b = r.trilha[i + 5].bola;
    const v = { x: (b.x - a.x) / (4 * H), y: (b.y - a.y) / (4 * H), z: (b.z - a.z) / (4 * H) };
    const rapidez = Math.hypot(v.x, v.y, v.z);
    assert.ok(v.z > 0.5, `volta para o campo: vz=${v.z}`);
    assert.ok(rapidez > 0.25 * 30 && rapidez < 0.6 * 30, `rebote de ${rapidez.toFixed(1)} m/s`);
  }
});

teste('goleiro: espalmou, a mesma bola não é encaixada logo em seguida (é a outra mão que ainda vem)', () => {
  const montar = (espalmouHaPouco) => {
    const g = criarGoleiro({ x: 0, z: 22 }, null, CONFIG);
    const parada = criarBola({ x: 0, y: CONFIG.raioBola, z: 22 });
    for (let t = 0; t < 1.5; t += 1 / 60) atualizarGoleiro(g, parada, 1 / 60, CONFIG, { chutou: false });
    g.tempo = 1;
    if (espalmouHaPouco) g.ultimoEspalmo = 0.95;
    // Bola devagar chegando de frente na mão esquerda do goleiro
    const mao = g.maos[1];
    const bola = criarBola({ x: mao.x, y: mao.y, z: mao.z + 0.21 });
    bola.vel = { x: 0, y: 0, z: -9 };
    colidirBolaGoleiro(bola, g, CONFIG);
    return { g, bola };
  };
  const normal = montar(false);
  assert.ok(normal.g.segurando, 'sem espalmar antes, essa bola é encaixada');
  assert.equal(normal.bola.eventos[0].modo, 'segurou');
  const logoDepois = montar(true);
  assert.ok(!logoDepois.g.segurando, 'logo depois de espalmar, não encaixa');
  assert.equal(logoDepois.bola.eventos.length, 0, 'e o segundo toque não conta como outra defesa');
  assert.ok(logoDepois.bola.vel.z > 0, 'a bola rebate');
});

teste('goleiro: as pernas de colisão vão até os pés do boneco, de pé e deitado no mergulho', () => {
  const g = criarGoleiro({ x: 0, z: 22 }, null, CONFIG);
  const quadril = (gg) => ({ x: gg.pose.x, y: gg.pose.y, z: gg.pose.z });
  const pontaDasPernas = (gg) => {
    const h = quadril(gg);
    const pernas = partesDoGoleiro(gg).filter((q) => q.parte === 'perna');
    assert.equal(pernas.length, 4, 'coxa e canela de cada perna');
    return Math.max(...pernas.map((q) => Math.hypot(q.ate.x - h.x, q.ate.y - h.y, q.ate.z - h.z) + q.r));
  };
  // De pé: o pé encosta no chão
  const deP = partesDoGoleiro(g).filter((q) => q.parte === 'perna');
  assert.ok(Math.min(...deP.map((q) => Math.min(q.y, q.ate.y) - q.r)) < 0.02, 'pés no chão');
  // Deitado no mergulho (para a direita): a perna de baixo esticada até ~1 m do quadril
  for (const rolagem of [1.4, -1.4]) {
    g.rolagem = rolagem;
    g.cy = 0.33;
    g.cx = 2 * Math.sign(rolagem);
    // (quadril = centro do corpo − 0,3 m ao longo do eixo, que tomba para o lado)
    const lado = { x: Math.cos(g.rotacaoY), z: -Math.sin(g.rotacaoY) };
    g.pose = { ...g.pose, x: g.cx - Math.sin(rolagem) * lado.x * 0.3, y: g.cy - Math.cos(rolagem) * 0.3, z: g.z - Math.sin(rolagem) * lado.z * 0.3 };
    const alcance = pontaDasPernas(g);
    assert.ok(alcance > 1.0, `pernas de ${alcance.toFixed(2)} m`);
    const partes = partesDoGoleiro(g);
    assert.ok(partes.every((q) => q.y > 0 && (!q.ate || q.ate.y > 0)), 'nada abaixo do chão');
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
    const r = cobrar({ chute: alto, semente: s, barreira: 'nenhuma', registrar: true });
    const subiu = Math.max(...r.trilha.map((q) => q.centro.y));
    if (r.g.mergulho && r.g.mergulho.lado === 0 && subiu > 1.45) saltou++;
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

teste('goleiro: sem passar a config, usa os padrões do jogo (nada de NaN)', () => {
  const bola = criarBola({ x: 0, y: 0.11, z: 22 });
  const g = criarGoleiro({ x: 0, z: 22 }, null);
  for (let t = 0; t < 1; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60);
  bola.vel = { x: -6, y: 4, z: -26 };
  let t = 0;
  for (let i = 0; i < 300; i++) {
    t += H;
    atualizarGoleiro(g, bola, H, undefined, { chutou: true, tempoDesdeChute: t, aleatorio: sorteio(3) });
    passo(bola, H, CONFIG);
    colidirBolaGoleiro(bola, g);
  }
  const numeros = [g.cx, g.cy, g.rolagem, g.pose.x, g.pose.y, g.pose.maos.direita.x, g.pose.maos.esquerda.y, bola.pos.x, bola.pos.y, bola.pos.z];
  assert.ok(numeros.every(Number.isFinite), numeros.join(', '));
  assert.ok(g.reagiu && g.leitura !== undefined);
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

// ---------- Jogador bom ----------
// Um "jogador bom" de verdade: para cada falta e lado da barreira, procura (sem o erro de mira) os
// chutes que passam pela barreira parada e chegam num canto; aí bate um deles com chutar(), com o
// erro de mira do cobrador, contra a barreira (que pode pular) e o goleiro. Mede a taxa de gols.

const semErro = () => 0.5; // o sorteio de chutar() com 0,5 dá erro zero
const cacheBons = new Map();
function chutesBons(origem, b, cobrador) {
  const chave = JSON.stringify([origem, b.lado, cobrador.numero]);
  if (cacheBons.has(chave)) return cacheBons.get(chave);
  const lista = [];
  const cfgB = { ...CONFIG, barreira: {} };
  for (let mira = -7; mira <= 7.001; mira += 0.5) {
    for (const cx of [-0.6, -0.3, 0, 0.3, 0.6]) {
      for (const cy of [-0.25, 0.1, 0.4, 0.78]) {
        for (const forca of [0.65, 0.8]) {
          const contato = { x: cx, y: cy };
          const bola = criarBola({ x: origem.x, y: CONFIG.raioBola, z: origem.z });
          chutar(bola, { alvo: { x: mira, z: 0 }, forca, contato, cobrador }, CONFIG, semErro);
          // A barreira mais alta possível, parada
          const bb = { ...b, jogadores: b.jogadores.map((j) => ({ ...j, altura: 1.95, yPes: 0 })), _anterior: null, _bola: null, batidas: 0 };
          let chega = null;
          for (let t = 0; t < 3 && !chega; t += H) {
            passo(bola, H, CONFIG);
            colidirBolaBarreira(bola, bb, cfgB);
            if (bb.batidas || bola.vel.z > 0) break;
            if (bola.cruzamento) chega = bola.cruzamento;
          }
          bola.eventos.length = 0;
          if (!chega) continue;
          const ax = Math.abs(chega.x);
          if (ax >= 2.5 && ax <= 3.35 && ((chega.y >= 1.5 && chega.y <= 2.2) || (chega.y >= 0.12 && chega.y <= 0.6))) {
            lista.push({ mira, contato, forca });
          }
        }
      }
    }
  }
  cacheBons.set(chave, lista);
  return lista;
}

function jogadorBom({ distancias, angulos, cobradores, sementes }) {
  const res = {};
  for (const dist of distancias) {
    const conta = { gol: 0, n: 0 };
    for (const ang of angulos) {
      const origem = { x: dist * Math.sin(ang * GRAUS), z: dist * Math.cos(ang * GRAUS) };
      for (const numero of cobradores) {
        const cobrador = ELENCO.find((j) => j.numero === numero);
        for (let s = 1; s <= sementes; s++) {
          const semente = dist * 1000 + (ang + 50) * 37 + numero * 7 + s;
          // A mesma barreira que cobrar() vai montar com essa semente
          const b = montarBarreira(origem, { ...CONFIG, barreira: {} }, sorteio(semente));
          const bons = chutesBons(origem, b, cobrador);
          if (!bons.length) continue;
          const c = bons[Math.floor(sorteio(semente + 99991)() * bons.length)];
          const r = cobrar({
            origem, semente,
            preparar: (bola, aleatorio) => chutar(bola, { alvo: { x: c.mira, z: 0 }, forca: c.forca, contato: c.contato, cobrador }, CONFIG, aleatorio),
          });
          conta.n++;
          if (r.resultado === 'gol') conta.gol++;
        }
      }
    }
    res[dist] = conta.gol / conta.n;
    console.log(`    de ${dist} m: ${pct(res[dist])} de gols (${conta.n} faltas)`);
  }
  return res;
}

teste('jogador bom: 35% a 55% de gols de 18 a 24 m; 15% a 35% de 28 a 32 m', () => {
  const r = jogadorBom({
    distancias: [18, 22, 26, 30],
    angulos: COMPLETO ? [-20, -10, 0, 10, 20] : [-15, 0, 15],
    cobradores: COMPLETO ? [8, 23, 21, 80] : [8, 23], // Juninho, Beckham (e Pirlo, Ronaldinho)
    sementes: COMPLETO ? 10 : 6,
  });
  // (com poucas faltas o número balança: a margem aqui é um pouco maior que a meta)
  const folga = COMPLETO ? 0.03 : 0.07;
  for (const d of [18, 22]) assert.ok(r[d] >= 0.35 - folga && r[d] <= 0.55 + folga, `de ${d} m: ${pct(r[d])}`);
  assert.ok(r[30] >= 0.15 - folga && r[30] <= 0.35 + folga, `de 30 m: ${pct(r[30])}`);
  assert.ok(r[18] > r[30], 'de perto é mais fácil que de longe');
});

// ---------- Pênalti ----------
// Bola na marca (11 m), sem barreira. O goleiro decide antes do chute (vai num canto ou fica no meio)
// com o sorteio da criação; `forcar` fixa a decisão para medir cada caso. Antes do chute rodam ~2 s
// como no jogo: o gesto da dica e, nos últimos 0,6 s, a corrida do cobrador (tempoAteChute até 0).

const MARCA = { x: 0, z: 11 };
function cobrarPenalti({ alvo, velocidade, semente = 1, forcar, historico = [], penalti = {}, registrar = false }) {
  const aleatorio = sorteio(semente);
  const cfg = { ...CONFIG, goleiro: {}, penalti: { ...penalti } };
  const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico, aleatorio: sorteio(semente + 7000), forcar } });
  const bola = criarBola({ x: MARCA.x, y: CONFIG.raioBola, z: MARCA.z });
  for (let t = 0; t < 1.4; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
  for (let falta = 0.6; falta > 1e-9; falta -= 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false, tempoAteChute: falta });
  atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false, tempoAteChute: 0 });
  montarChute(bola, mirar(MARCA, alvo, { velocidade }));

  const eventos = [];
  const trilha = [];
  let t = 0;
  for (let q = 0; q < 3 * 60; q++) {
    for (let i = 0; i < 4; i++) {
      t += H;
      atualizarGoleiro(g, bola, H, cfg, { chutou: true, tempoDesdeChute: t, aleatorio });
      passo(bola, H, CONFIG);
      colidirBolaGoleiro(bola, g, cfg);
      for (const ev of bola.eventos) eventos.push({ ...ev, t });
      bola.eventos.length = 0;
      if (registrar) trilha.push({ t, centro: { x: g.cx, y: g.cy }, bola: { ...bola.pos } });
    }
  }
  const tipos = new Set(eventos.map((e) => e.tipo));
  const resultado = bola.gol ? 'gol' : tipos.has('defesa') ? 'defesa' : 'fora';
  return { resultado, eventos, g, bola, trilha };
}

// Um caso nos dois cantos (o lado forçado do goleiro acompanha o alvo): fração de gols e de defesas
function taxaPenalti({ alvo, velocidade, forcar, penalti = {}, sementes = 24 }) {
  const conta = { gol: 0, defesa: 0, acertou: 0, n: 0 };
  for (const s of [-1, 1]) {
    for (let k = 1; k <= sementes; k++) {
      const f = { ...forcar };
      if (f.lado) f.lado *= s;
      const r = cobrarPenalti({ alvo: { x: alvo.x * s, y: alvo.y }, velocidade, semente: k, forcar: f, penalti });
      conta.n++;
      if (r.resultado === 'gol') conta.gol++;
      if (r.resultado === 'defesa') conta.defesa++;
      if (r.g.penalti.acertou) conta.acertou++;
    }
  }
  return { gol: conta.gol / conta.n, defesa: conta.defesa / conta.n, acertou: conta.acertou / conta.n, n: conta.n };
}
const UM_METRO_DA_TRAVE = MEIA - 1.0;

teste('pênalti: decide antes do chute com a semente (vai, lado, dica); sem opcoes.penalti nada muda na falta', () => {
  const cfg = { ...CONFIG, goleiro: {}, penalti: {} };
  // forcar fixa a decisão
  const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [], aleatorio: sorteio(1), forcar: { vai: 'lado', lado: -1, dica: 1 } } });
  assert.deepEqual([g.penalti.vai, g.penalti.lado, g.penalti.dica, g.penalti.disparou, g.penalti.acertou], ['lado', -1, 1, false, null]);
  assert.deepEqual(g.pose.penalti, { vai: 'lado', lado: -1, dica: 1, disparou: false });
  assert.equal(g.pose.dica, 0, 'ainda não apontou');
  assert.equal(g.pose.dicaForca, 0);
  assert.ok(Math.abs(g.base.x) < 1e-9 && Math.abs(g.cx) < 1e-9, 'no meio do gol');
  const fica = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [], aleatorio: sorteio(1), forcar: { vai: 'fica' } } });
  assert.equal(fica.penalti.vai, 'fica');
  assert.equal(fica.penalti.lado, 0);
  assert.ok(fica.penalti.dica === 1 || fica.penalti.dica === -1, 'quem fica também insinua um canto');
  // Mesma semente e mesmo histórico: mesma decisão. Sorteado, respeita as chances
  let vai = 0;
  for (let s = 1; s <= 400; s++) {
    const a = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [1, -1], aleatorio: sorteio(s) } });
    const b = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [1, -1], aleatorio: sorteio(s) } });
    assert.deepEqual(a.pose.penalti, b.pose.penalti);
    assert.ok(a.penalti.vai === 'fica' ? a.penalti.lado === 0 : Math.abs(a.penalti.lado) === 1);
    assert.ok(Math.abs(a.penalti.dica) === 1);
    if (a.penalti.vai === 'lado') vai++;
  }
  assert.ok(Math.abs(vai / 400 - PADRAO_PENALTI.chanceAdivinhar) < 0.06, `vai num canto em ${pct(vai / 400)}`);
  // Na falta: nada de pênalti na pose
  const falta = criarGoleiro({ x: 0, z: 22 }, null, CONFIG);
  assert.equal(falta.penalti, null);
  assert.equal(falta.pose.penalti, null);
  assert.equal(falta.pose.dica, 0);
  assert.equal(falta.pose.dicaForca, 0);
  const bola = criarBola({ x: 0, y: CONFIG.raioBola, z: 22 });
  for (let t = 0; t < 1; t += 1 / 60) atualizarGoleiro(falta, bola, 1 / 60, CONFIG, { chutou: false });
  assert.equal(falta.pose.dica, 0);
  assert.equal(falta.pose.penalti, null);
});

teste('pênalti: a memória dos últimos chutes puxa o canto; a dica é verdade na chance combinada', () => {
  const cfg = { ...CONFIG, goleiro: {}, penalti: { memoria: 0.7 } };
  const medir = (historico) => {
    let vai = 0;
    let direita = 0;
    let dicaCerta = 0;
    for (let s = 1; s <= 400; s++) {
      const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico, aleatorio: sorteio(s) } });
      if (g.penalti.vai !== 'lado') continue;
      vai++;
      if (g.penalti.lado === 1) direita++;
      if (g.penalti.dica === g.penalti.lado) dicaCerta++;
    }
    return { direita: direita / vai, dicaCerta: dicaCerta / vai };
  };
  const tresDireita = medir([1, 1, 1]);
  const vazio = medir([]);
  const tresEsquerda = medir([-1, -1, -1]);
  console.log(`    vai para a direita: três chutes à direita ${pct(tresDireita.direita)}, sem histórico ${pct(vazio.direita)}, três à esquerda ${pct(tresEsquerda.direita)}`);
  assert.ok(Math.abs(tresDireita.direita - 0.85) <= 0.07, `três à direita: ${pct(tresDireita.direita)}`);
  assert.ok(Math.abs(vazio.direita - 0.5) <= 0.08, `sem histórico: ${pct(vazio.direita)}`);
  assert.ok(Math.abs(tresEsquerda.direita - 0.15) <= 0.07, `três à esquerda: ${pct(tresEsquerda.direita)}`);
  assert.ok(Math.abs(vazio.dicaCerta - PADRAO_PENALTI.chanceDica) <= 0.07, `dica verdadeira em ${pct(vazio.dicaCerta)}`);
  // Só os 4 últimos contam; a memória zerada ignora o histórico
  const soUltimos = medir([-1, -1, -1, -1, -1, -1, 1, 1, 1, 1]);
  assert.ok(Math.abs(soUltimos.direita - 0.85) <= 0.07, `só os 4 últimos: ${pct(soUltimos.direita)}`);
  const semMemoria = { ...CONFIG, goleiro: {}, penalti: { memoria: 0 } };
  let direita = 0;
  let n = 0;
  for (let s = 1; s <= 400; s++) {
    const g = criarGoleiro(MARCA, null, semMemoria, { penalti: { historico: [1, 1, 1], aleatorio: sorteio(s) } });
    if (g.penalti.vai !== 'lado') continue;
    n++;
    if (g.penalti.lado === 1) direita++;
  }
  assert.ok(Math.abs(direita / n - 0.5) <= 0.08, `sem memória: ${pct(direita / n)}`);
});

teste('pênalti: antes do chute insinua um canto (aponta e dá o passinho) e volta; na corrida se firma no meio', () => {
  const cfg = { ...CONFIG, goleiro: {}, penalti: {} };
  const bola = criarBola({ x: MARCA.x, y: CONFIG.raioBola, z: MARCA.z });
  for (const dica of [-1, 1]) {
    const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [], aleatorio: sorteio(3), forcar: { vai: 'lado', lado: -dica, dica } } });
    let maiorForca = 0;
    let maisLonge = 0;
    let apontou = 0;
    for (let t = 0; t < 2.2; t += 1 / 60) {
      atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
      const p = g.pose;
      assert.ok(p.dicaForca >= 0 && p.dicaForca <= 1, `dicaForca ${p.dicaForca}`);
      assert.equal(p.dica, p.dicaForca > 0 ? dica : 0, 'aponta o canto da dica, e só enquanto aponta');
      assert.equal(p.estado, 'pronto');
      assert.equal(g.tempo, 0);
      maiorForca = Math.max(maiorForca, p.dicaForca);
      maisLonge = Math.max(maisLonge, dica * g.cx);
      if (p.dicaForca > 0.5) apontou++;
      assert.ok(Math.abs(g.vx) <= 1.5 + 1e-9, 'passinho sem pressa');
    }
    assert.ok(maiorForca > 0.99, `apontou com força ${maiorForca}`);
    assert.ok(apontou / 60 > 0.6 && apontou / 60 < 1.3, `apontou por ${(apontou / 60).toFixed(2)} s`);
    assert.ok(maisLonge > 0.2 && maisLonge < 0.4, `passinho de ${maisLonge.toFixed(2)} m para o lado da dica`);
    assert.equal(g.pose.dicaForca, 0, 'o gesto já acabou');
    assert.ok(Math.abs(g.cx) < 0.08, `voltou para o meio: ${g.cx}`);
    // Corrida do cobrador: o gesto some e ele se firma no meio (nada de mergulhar antes do chute com atraso 0)
    for (let falta = 0.8; falta > 1e-9; falta -= 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false, tempoAteChute: falta });
    atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false, tempoAteChute: 0 });
    assert.equal(g.pose.dicaForca, 0);
    assert.equal(g.pose.dica, 0);
    assert.ok(g.pose.prontidao > 0.99, `firme: ${g.pose.prontidao}`);
    assert.ok(Math.abs(g.cx) < 0.03, `no meio: ${g.cx}`);
    assert.equal(g.penalti.disparou, false);
    assert.equal(g.pose.estado, 'pronto');
  }
  // Com o cobrador demorando, o gesto se repete
  const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [], aleatorio: sorteio(3), forcar: { vai: 'fica', dica: 1 } } });
  let gestos = 0;
  let apontando = false;
  for (let t = 0; t < 8; t += 1 / 60) {
    atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
    if (g.pose.dicaForca > 0.5 && !apontando) gestos++;
    apontando = g.pose.dicaForca > 0.5;
  }
  assert.ok(gestos >= 2, `gestos em 8 s: ${gestos}`);
});

teste('pênalti: acertou o canto: pega a bola média; a forte no ângulo entra; a rasteira fica no meio-termo', () => {
  const lado = { vai: 'lado', lado: 1 };
  const media = taxaPenalti({ alvo: { x: UM_METRO_DA_TRAVE, y: 1.0 }, velocidade: 20, forcar: lado });
  const forte = taxaPenalti({ alvo: { x: 3.2, y: 2.1 }, velocidade: 30, forcar: lado });
  const rasteira = taxaPenalti({ alvo: { x: 3.0, y: 0.3 }, velocidade: 22, forcar: lado });
  const rasteiraMedia = taxaPenalti({ alvo: { x: 3.0, y: 0.3 }, velocidade: 25, forcar: lado });
  console.log(`    acertou o canto: meia altura a 1 m da trave a 20 m/s ${pct(media.defesa)} de defesas; forte no ângulo a 30 m/s ${pct(forte.gol)} de gols`);
  console.log(`    rasteira no canto: a 22 m/s ${pct(rasteira.gol)} de gols, a 25 m/s ${pct(rasteiraMedia.gol)} (${rasteira.n} chutes cada)`);
  assert.ok(media.defesa >= 0.6, `bola média: só ${pct(media.defesa)} de defesas`);
  assert.ok(forte.gol >= 0.7, `bola forte no ângulo: só ${pct(forte.gol)} de gols`);
  assert.ok(rasteira.gol > 0 && rasteira.gol < 1, `rasteira: ${pct(rasteira.gol)} de gols`);
  assert.equal(media.acertou, 1, 'acertou o canto');
  assert.equal(forte.acertou, 1);
});

teste('pênalti: errou o canto, ou se jogou com a bola no meio: gol', () => {
  const errou = taxaPenalti({ alvo: { x: UM_METRO_DA_TRAVE, y: 1.0 }, velocidade: 22, forcar: { vai: 'lado', lado: -1 } });
  const meio = taxaPenalti({ alvo: { x: 0, y: 1.0 }, velocidade: 20, forcar: { vai: 'lado', lado: 1 } });
  console.log(`    errou o canto a 22 m/s: ${pct(errou.gol)} de gols; se jogou com a bola no meio a 20 m/s: ${pct(meio.gol)}`);
  assert.ok(errou.gol >= 0.95, `errou o canto: só ${pct(errou.gol)} de gols`);
  assert.ok(meio.gol >= 0.9, `bola no meio: só ${pct(meio.gol)} de gols`);
  assert.equal(errou.acertou, 0);
  assert.equal(meio.acertou, 0, 'bola no meio com ele se jogando não conta como acerto');
});

teste('pênalti: ficou no meio: pega a bola no meio e sofre no canto', () => {
  const fica = { vai: 'fica' };
  const meio = taxaPenalti({ alvo: { x: 0, y: 1.0 }, velocidade: 16, forcar: fica });
  const canto = taxaPenalti({ alvo: { x: 2.8, y: 1.0 }, velocidade: 24, forcar: fica });
  console.log(`    ficou: bola no meio a 16 m/s ${pct(meio.defesa)} de defesas; no canto a 24 m/s ${pct(canto.gol)} de gols`);
  assert.ok(meio.defesa >= 0.7, `bola no meio: só ${pct(meio.defesa)} de defesas`);
  assert.ok(canto.gol >= 0.85, `bola no canto: só ${pct(canto.gol)} de gols`);
  assert.equal(meio.acertou, 1, 'ficou e a bola veio no meio: acertou');
  assert.equal(canto.acertou, 0);
  // Quem fica reage com o reflexo do pênalti, pelo caminho normal de leitura
  const r = cobrarPenalti({ alvo: { x: 0, y: 1.0 }, velocidade: 16, semente: 2, forcar: fica });
  assert.ok(Math.abs(r.g.reacao - PADRAO_PENALTI.reflexo) < 1e-9, `reage em ${r.g.reacao} s`);
  assert.ok(r.g.reagiu && r.g.leitura, 'leu a bola');
  assert.equal(r.g.penalti.disparou, false, 'não se jogou num canto');
});

teste('pênalti: atraso negativo: se joga às cegas antes do contato e o mergulho continua depois do chute', () => {
  const penalti = { atraso: -0.15, variacaoAtraso: 0 };
  let defesas = 0;
  for (let s = 1; s <= 8; s++) {
    const r = cobrarPenalti({ alvo: { x: UM_METRO_DA_TRAVE, y: 1.0 }, velocidade: 22, semente: s, forcar: { vai: 'lado', lado: 1 }, penalti, registrar: true });
    const m = r.g.mergulho;
    assert.ok(m && r.g.penalti.disparou, 'mergulhou');
    assert.ok(Math.abs(m.t0 + 0.15) < 1 / 60 + 1e-9, `se jogou em ${m.t0} s`);
    assert.deepEqual(m.alvoLido, { x: PADRAO_PENALTI.distanciaPalpite, y: PADRAO_PENALTI.alturaPalpite }, 'sem ver a bola, vai no ponto do palpite');
    // Já estava indo quando a bola saiu, e segue no mesmo mergulho (sem recomeçar nem pular)
    const cedo = r.trilha.find((p) => p.t > 0.05);
    assert.ok(cedo.centro.x > 0.25, `já em x=${cedo.centro.x.toFixed(2)} logo depois do chute`);
    for (let i = 1; i < r.trilha.length; i++) {
      const salto = Math.abs(r.trilha[i].centro.x - r.trilha[i - 1].centro.x);
      assert.ok(salto < PADRAO_PENALTI.velocidadeMergulho * H + 0.01, `tranco de ${salto.toFixed(3)} m num passo`);
    }
    assert.ok(r.trilha.every((p) => Number.isFinite(p.centro.x + p.centro.y)), 'nada de NaN');
    assert.ok(r.g.pose.estado === 'caido' || r.g.pose.estado === 'segurou', r.g.pose.estado);
    assert.equal(r.g.penalti.acertou, true);
    assert.equal(r.g.pose.penalti.disparou, true);
    if (r.resultado === 'defesa') defesas++;
  }
  console.log(`    às cegas (atraso −0,15 s), acertando o canto, bola a 1 m da trave a 22 m/s: ${defesas} defesas em 8`);
  assert.ok(defesas >= 4, `as mãos se ajeitam no ar: só ${defesas} defesas`);
  // Sem saber da corrida (tempoAteChute nunca chega), ele se joga no primeiro instante depois do chute
  const cfg = { ...CONFIG, goleiro: {}, penalti };
  const g = criarGoleiro(MARCA, null, cfg, { penalti: { historico: [], aleatorio: sorteio(1), forcar: { vai: 'lado', lado: 1 } } });
  const bola = criarBola({ x: MARCA.x, y: CONFIG.raioBola, z: MARCA.z });
  for (let t = 0; t < 1.5; t += 1 / 60) atualizarGoleiro(g, bola, 1 / 60, cfg, { chutou: false });
  assert.equal(g.penalti.disparou, false);
  montarChute(bola, mirar(MARCA, { x: 2.5, y: 1.0 }, { velocidade: 22 }));
  atualizarGoleiro(g, bola, H, cfg, { chutou: true, tempoDesdeChute: H, aleatorio: sorteio(1) });
  assert.equal(g.penalti.disparou, true);
  assert.equal(g.pose.estado, 'mergulhando');
});

teste('pênalti: mesma semente e mesmo histórico, mesmo lance (o replay repete o goleiro)', () => {
  for (const [s, alvo, historico] of [[1, { x: 2.66, y: 1.0 }, [1, 1]], [2, { x: -3.0, y: 0.4 }, []], [3, { x: 0.3, y: 1.8 }, [-1, 1, -1]]]) {
    const a = cobrarPenalti({ alvo, velocidade: 24, semente: s, historico, registrar: true });
    const b = cobrarPenalti({ alvo, velocidade: 24, semente: s, historico, registrar: true });
    assert.equal(a.resultado, b.resultado);
    assert.deepEqual(a.g.pose, b.g.pose);
    assert.deepEqual(a.bola.pos, b.bola.pos);
    assert.equal(a.trilha.length, b.trilha.length);
    for (let i = 0; i < a.trilha.length; i++) {
      assert.equal(a.trilha[i].centro.x, b.trilha[i].centro.x, `x do goleiro em t=${a.trilha[i].t}`);
      assert.equal(a.trilha[i].centro.y, b.trilha[i].centro.y);
    }
  }
});
