// Testes da física da bola. Rodar com: node testes/fisica.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { criarBola, chutar, passo, noChao, coneDeErro, COBRADOR_NEUTRO } from '../js/physics.js';

// Simula uma cobrança e devolve onde a bola cruza a barreira (9,15 m) e a linha do gol.
// caminho: alturas (y) e desvios (x) a cada ponto, com a distância já percorrida.
function cobrar({
  distancia = 22, forca = 0.65, contato = { x: 0, y: 0 }, aleatorio = () => 0.5,
  cfg = CONFIG, cobrador, pressao, alvo = { x: 0, z: 0 }, dt = 1 / 240,
} = {}) {
  const bola = criarBola({ x: 0, y: cfg.raioBola, z: distancia });
  const info = chutar(bola, { alvo, forca, contato, cobrador, pressao }, cfg, aleatorio);
  let barreira = null;
  const caminho = [];
  for (let t = 0; t < 5 && bola.pos.z > 0; t += dt) {
    passo(bola, dt, cfg);
    if (!barreira && bola.pos.z <= distancia - 9.15) barreira = { ...bola.pos };
    caminho.push({ andou: distancia - bola.pos.z, x: bola.pos.x, y: bola.pos.y });
  }
  return { barreira, gol: bola.pos.z <= 0 ? { ...bola.pos } : null, info, caminho, bola };
}

const teste = (nome, fn) => {
  fn();
  console.log('ok -', nome);
};

// Sorteio previsível (mesma semente = mesma sequência)
function semente(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const desvioPadrao = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

// Cobrador com todas as notas iguais (para isolar um atributo ou uma especialidade)
const cobrador = (pe, notas = {}, especiais = []) => ({
  pe,
  atributos: { FOR: 85, CUR: 85, QUE: 85, PRE: 85, FRI: 85, ...notas },
  especiais,
});

// ---------- Testes que já existiam ----------

teste('chute reto no centro com força média entra no gol, por cima da barreira', () => {
  const { barreira, gol } = cobrar({ forca: 0.58 });
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
  // O erro de mira agora também usa o sorteio: aqui ele fica zerado para olhar só a dança
  const cfg = { ...CONFIG, erroMiraBase: 0 };
  const lados = (contato) => [0.1, 0.4, 0.7, 0.95].map((r) => cobrar({ cfg, distancia: 25, forca: 0.95, contato, aleatorio: () => r }).gol.x);
  const semRotacao = lados({ x: 0, y: 0 });
  assert.ok(Math.max(...semRotacao) - Math.min(...semRotacao) > 0.3, `variação ${semRotacao}`);
  const comEfeito = lados({ x: 0.6, y: 0 });
  assert.ok(Math.max(...comEfeito) - Math.min(...comEfeito) < 0.01, `variação ${comEfeito}`);
});

// Acompanha a bola por alguns segundos depois do chute (passando do gol)
function acompanhar({ distancia = 22, forca, contato = { x: 0, y: 0 }, alvo = { x: 0, z: 0 }, segundos = 3 }) {
  const bola = criarBola({ x: 0, y: CONFIG.raioBola, z: distancia });
  chutar(bola, { alvo, forca, contato }, CONFIG, () => 0.5);
  const eventos = [];
  let maisFundo = 0;
  for (let t = 0; t < segundos; t += 1 / 240) {
    passo(bola, 1 / 240, CONFIG);
    eventos.push(...bola.eventos.map((e) => e.tipo));
    bola.eventos.length = 0;
    maisFundo = Math.min(maisFundo, bola.pos.z);
  }
  return { bola, eventos, maisFundo };
}

teste('gol: a bola estufa a rede, fica dentro do gol e para', () => {
  const { bola, eventos, maisFundo } = acompanhar({ forca: 0.58 });
  assert.ok(bola.gol, 'deveria ser gol');
  assert.ok(eventos.includes('fundo'), 'deveria bater no fundo da rede');
  const P = CONFIG.golProfundidade;
  assert.ok(maisFundo < -P && maisFundo > -P - 0.8, `afundou até z=${maisFundo.toFixed(2)}`);
  assert.ok(bola.pos.z < 0 && bola.pos.z > -P - 0.2, `parou em z=${bola.pos.z.toFixed(2)}`);
  assert.ok(Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z) < 1, 'deveria estar quase parada');
});

teste('chute na trave volta e não é gol', () => {
  const trave = CONFIG.golLargura / 2 + CONFIG.raioTrave;
  const { bola, eventos } = acompanhar({ forca: 0.56, alvo: { x: trave, z: 0 } });
  assert.ok(eventos.includes('trave'), `eventos: ${[...new Set(eventos)]}`);
  assert.ok(!bola.gol, 'não deveria ser gol');
});

teste('chute por cima do travessão não é gol', () => {
  const { bola } = acompanhar({ forca: 1 });
  assert.ok(!bola.gol && bola.cruzamento && bola.cruzamento.y > CONFIG.golAltura, JSON.stringify(bola.cruzamento));
});

teste('bola que vem de fora bate na rede lateral e não entra', () => {
  const bola = criarBola({ x: 5, y: 1, z: -1 });
  bola.vel = { x: -12, y: 0, z: 0 };
  for (let t = 0; t < 1; t += 1 / 240) passo(bola, 1 / 240, CONFIG);
  assert.ok(bola.pos.x >= CONFIG.golLargura / 2, `x=${bola.pos.x.toFixed(2)}`);
  assert.ok(!bola.gol);
});

// ---------- Altura do contato ----------

teste('rasteiro: pé no topo da bola, ela vai pelo chão até a linha do gol', () => {
  const { gol, caminho, info } = cobrar({ forca: 0.8, contato: { x: 0, y: 0.9 } });
  const maisAlto = Math.max(...caminho.filter((p) => p.andou > 5).map((p) => p.y));
  assert.ok(maisAlto < 0.6, `subiu até ${maisAlto.toFixed(2)} m depois dos 5 m`);
  assert.ok(gol, 'deveria chegar à linha do gol');
  assert.ok(info.elevacao <= 3, `saiu com ${info.elevacao.toFixed(1)} graus`);
  assert.equal(info.tecnica, 'rasteiro');
});

teste('folha seca (pé em cima, y 0,5): passa a barreira, sobe e despenca para entrar sob o travessão', () => {
  const alturaMinima = 1.9 + CONFIG.raioBola; // a bola inteira acima de 1,9 m
  const boas = [];
  for (let f = 0.6; f <= 1.0001; f += 0.01) {
    const c = cobrar({ forca: f, contato: { x: 0, y: 0.5 } });
    if (c.barreira.y > alturaMinima && c.gol && c.gol.y < CONFIG.golAltura - CONFIG.raioBola) boas.push({ f, c });
  }
  assert.ok(boas.length >= 4, `só ${boas.length} forças funcionam`);
  // "Sobe e despenca": do ponto mais alto até o gol a bola cai bem mais do que um chute sem giro na mesma força
  const { f, c } = boas[Math.floor(boas.length / 2)];
  const queda = (k) => Math.max(...k.caminho.map((p) => p.y)) - k.gol.y;
  const centro = cobrar({ forca: f });
  assert.ok(queda(c) > 0.3 && queda(c) > queda(centro) + 0.25, `queda ${queda(c).toFixed(2)} x ${queda(centro).toFixed(2)} (força ${f.toFixed(2)})`);
  assert.equal(c.info.tecnica, 'folhaSeca');
});

teste('cavadinha: pé bem embaixo e pouca força passa a barreira e cai dentro do gol', () => {
  const { barreira, gol, info } = cobrar({ forca: 0.12, contato: { x: 0, y: -0.9 } });
  assert.ok(barreira.y > 2.2, `altura na barreira ${barreira.y.toFixed(2)}`);
  assert.ok(gol && gol.y < CONFIG.golAltura, JSON.stringify(gol));
  assert.equal(info.tecnica, 'cavadinha');
  // ... e com força vai por cima
  const forte = cobrar({ forca: 0.7, contato: { x: 0, y: -0.9 } });
  assert.ok(!forte.gol || forte.gol.y > CONFIG.golAltura, 'com força deveria ir por cima');
});

// ---------- Gramado ----------

// Bola caindo no chão com giro (rad/s em x; negativo = para a frente quando ela vai para o gol)
function quicar(giroX) {
  const bola = criarBola({ x: 0, y: 1.5, z: 10 });
  bola.vel = { x: 0, y: -6, z: -8 };
  bola.giro = { x: giroX, y: 0, z: 0 };
  let antes = null;
  let depois = null;
  for (let t = 0; t < 1; t += 1 / 240) {
    const v = Math.hypot(bola.vel.x, bola.vel.z);
    passo(bola, 1 / 240, CONFIG);
    if (!antes && bola.eventos.some((e) => e.tipo === 'quique')) {
      antes = v;
      depois = Math.hypot(bola.vel.x, bola.vel.z);
    }
    bola.eventos.length = 0;
  }
  return { antes, depois };
}

teste('quique: giro para a frente mantém a velocidade; giro para trás segura a bola', () => {
  const frente = quicar(-40);
  const nada = quicar(0);
  const tras = quicar(40);
  assert.ok(frente.depois > nada.depois + 1, `frente ${frente.depois.toFixed(2)} x sem giro ${nada.depois.toFixed(2)}`);
  assert.ok(tras.depois < nada.depois - 1, `trás ${tras.depois.toFixed(2)} x sem giro ${nada.depois.toFixed(2)}`);
  // Giro para a frente maior que o da rolagem: a grama "puxa" e a bola ganha velocidade
  const muito = quicar(-200);
  assert.ok(muito.depois > muito.antes, `ganhou? ${muito.antes.toFixed(2)} -> ${muito.depois.toFixed(2)}`);
});

teste('quique: batida forte volta proporcionalmente menos que batida fraca', () => {
  const volta = (vy) => {
    const bola = criarBola({ x: 0, y: CONFIG.raioBola + 0.001, z: 5 });
    bola.vel = { x: 0, y: vy, z: 0 };
    passo(bola, 1 / 240, CONFIG);
    return bola.vel.y / -vy;
  };
  const fraca = volta(-3);
  const forte = volta(-15);
  assert.ok(fraca > forte + 0.1, `fraca ${fraca.toFixed(2)} x forte ${forte.toFixed(2)}`);
});

teste('rolando: o giro acompanha a velocidade e a bola para', () => {
  const bola = criarBola({ x: 0, y: CONFIG.raioBola, z: 10 });
  bola.vel = { x: 0, y: 0, z: -6 };
  let rolou = false;
  for (let t = 0; t < 4; t += 1 / 240) {
    passo(bola, 1 / 240, CONFIG);
    const v = Math.hypot(bola.vel.x, bola.vel.z);
    // rolando sem escorregar: velocidade = giro × raio
    if (v > 1 && Math.abs(-bola.giro.x * CONFIG.raioBola - v) < 0.01) rolou = true;
    assert.ok(Math.abs(bola.pos.y - CONFIG.raioBola) < 1e-9, 'não pode afundar nem pular');
  }
  assert.ok(rolou, 'deveria passar a rolar sem escorregar');
  assert.ok(noChao(bola, CONFIG) && Math.hypot(bola.vel.x, bola.vel.z) < 0.01, 'deveria parar');
});

teste('o resultado quase não depende do tamanho do passo (1/120 x 1/240 s)', () => {
  for (const [contato, forca] of [[{ x: 0, y: 0 }, 0.58], [{ x: 0, y: 0.5 }, 0.78], [{ x: 0.6, y: -0.2 }, 0.62], [{ x: 0, y: 0.9 }, 0.8]]) {
    const a = cobrar({ forca, contato, dt: 1 / 120 }).gol;
    const b = cobrar({ forca, contato, dt: 1 / 240 }).gol;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.05, `${JSON.stringify(contato)}: ${a.x.toFixed(3)},${a.y.toFixed(3)} x ${b.x.toFixed(3)},${b.y.toFixed(3)}`);
  }
});

// ---------- Cobradores, pé bom e trivela ----------

// Quanto a bola curvou: distância do ponto onde ela cruza a linha do gol até a reta da mira
const curvou = (c) => Math.abs(c.gol.x);

teste('trivela de quem não é especialista curva menos que a de especialista', () => {
  const comum = cobrar({ forca: 0.7, contato: { x: -0.7, y: 0 }, cobrador: cobrador('D') });
  const mestre = cobrar({ forca: 0.7, contato: { x: -0.7, y: 0 }, cobrador: cobrador('D', {}, ['trivela']) });
  assert.equal(comum.info.tecnica, 'trivela');
  assert.ok(comum.gol.x > 0 && mestre.gol.x > 0, 'trivela do destro curva para a direita');
  assert.ok(curvou(mestre) > curvou(comum) * 1.4, `especialista ${curvou(mestre).toFixed(2)} x comum ${curvou(comum).toFixed(2)}`);
  // e erra mais
  const cone = (cob) => coneDeErro({ forca: 0.7, contato: { x: -0.7, y: 0 }, cobrador: cob }, CONFIG);
  assert.ok(cone(cobrador('D')) > cone(cobrador('D', {}, ['trivela'])) * 1.2);
});

teste('trivela de especialista: sai mais reta e curva mais no fim que a curva com o pé natural', () => {
  const natural = cobrar({ distancia: 25, forca: 0.72, contato: { x: 0.7, y: 0 }, cobrador: cobrador('D', {}, ['trivela']) });
  const trivela = cobrar({ distancia: 25, forca: 0.72, contato: { x: -0.7, y: 0 }, cobrador: cobrador('D', {}, ['trivela']) });
  const meio = (c) => Math.abs(c.caminho.find((p) => p.andou >= 10).x) / curvou(c);
  assert.ok(meio(trivela) < meio(natural) - 0.02, `fração da curva aos 10 m: trivela ${meio(trivela).toFixed(3)} x natural ${meio(natural).toFixed(3)}`);
  const razao = curvou(trivela) / curvou(natural);
  assert.ok(razao > 0.85 && razao < 1.15, `curva total trivela/natural = ${razao.toFixed(2)}`);
});

teste('lado natural do pé não tem penalidade (destro e canhoto espelhados)', () => {
  const destro = cobrar({ forca: 0.7, contato: { x: 0.7, y: 0 }, cobrador: cobrador('D') });
  const canhoto = cobrar({ forca: 0.7, contato: { x: -0.7, y: 0 }, cobrador: cobrador('E') });
  assert.ok(Math.abs(destro.gol.x + canhoto.gol.x) < 1e-6, `${destro.gol.x} x ${canhoto.gol.x}`);
  assert.equal(destro.info.tecnica, 'curva');
  assert.equal(canhoto.info.tecnica, 'curva');
  const centro = coneDeErro({ forca: 0.7, cobrador: cobrador('D') }, CONFIG);
  assert.equal(destro.info.cone, centro);
  assert.equal(canhoto.info.cone, centro);
  // Sem cobrador = neutro destro
  const neutro = cobrar({ forca: 0.7, contato: { x: 0.7, y: 0 } });
  assert.equal(neutro.gol.x, cobrar({ forca: 0.7, contato: { x: 0.7, y: 0 }, cobrador: COBRADOR_NEUTRO }).gol.x);
});

teste('bola sem rotação: a do especialista dança mais', () => {
  const cfg = { ...CONFIG, erroMiraBase: 0 };
  const espalhar = (cob) => desvioPadrao(Array.from({ length: 60 }, (_, i) => cobrar({ cfg, distancia: 25, forca: 0.92, cobrador: cob, aleatorio: semente(i + 1) }).gol.x));
  const comum = espalhar(cobrador('D'));
  const mestre = espalhar(cobrador('D', {}, ['semRotacao']));
  assert.ok(comum > 0.05, `comum quase não dança: ${comum.toFixed(3)}`);
  assert.ok(mestre > comum * 1.8, `especialista ${mestre.toFixed(3)} x comum ${comum.toFixed(3)}`);
  // O especialista consegue a bola sem rotação com menos força e mais longe do centro
  const fraco = cobrar({ cfg, distancia: 25, forca: 0.8, contato: { x: 0.15, y: 0 }, cobrador: cobrador('D', {}, ['semRotacao']) });
  assert.equal(fraco.info.tecnica, 'semRotacao');
  assert.notEqual(cobrar({ cfg, distancia: 25, forca: 0.8, contato: { x: 0.15, y: 0 }, cobrador: cobrador('D') }).info.tecnica, 'semRotacao');
});

// ---------- Mira com imprecisão ----------

// Espalhamento do desvio de direção (graus) em muitos chutes
function espalhamento({ forca = 0.7, contato = { x: 0, y: 0 }, cob, pressao = 0, n = 400 }) {
  const aleatorio = semente(42);
  const desvios = [];
  for (let i = 0; i < n; i++) {
    const bola = criarBola({ x: 0, y: CONFIG.raioBola, z: 22 });
    desvios.push(chutar(bola, { alvo: { x: 0, z: 0 }, forca, contato, cobrador: cob, pressao }, CONFIG, aleatorio).desvio);
  }
  return desvioPadrao(desvios);
}

teste('cone de erro: cresce acima do ponto ideal de força (barra cheia ~3x)', () => {
  const ideal = espalhamento({ forca: CONFIG.forcaIdeal });
  const cheia = espalhamento({ forca: 1 });
  assert.ok(Math.abs(ideal - CONFIG.erroMiraBase) < 0.15, `no ideal: ${ideal.toFixed(2)}°`);
  assert.ok(cheia > ideal * 2.6 && cheia < ideal * 3.4, `barra cheia ${cheia.toFixed(2)}° x ideal ${ideal.toFixed(2)}°`);
  const cone = (forca) => coneDeErro({ forca }, CONFIG);
  assert.equal(cone(0.5), cone(CONFIG.forcaIdeal), 'abaixo do ideal não tem erro a mais');
  assert.ok(cone(0.85) > cone(0.8) && cone(0.95) > cone(0.85));
});

teste('PRE alta espalha menos; FRI alta segura o erro sob pressão', () => {
  const preciso = espalhamento({ cob: cobrador('D', { PRE: 99 }) });
  const torto = espalhamento({ cob: cobrador('D', { PRE: 60 }) });
  assert.ok(preciso < torto * 0.9, `PRE 99: ${preciso.toFixed(3)}° x PRE 60: ${torto.toFixed(3)}°`);
  assert.ok(torto / preciso < 1.25, 'atributo ajusta, não decide');
  const frio = cobrador('D', { FRI: 99 });
  const nervoso = cobrador('D', { FRI: 60 });
  const cone = (cob, pressao) => coneDeErro({ forca: 0.7, cobrador: cob, pressao }, CONFIG);
  assert.equal(cone(frio, 0), cone(nervoso, 0), 'no treino (sem pressão) a frieza não muda nada');
  assert.ok(cone(nervoso, 1) > cone(frio, 1) * 1.1, `pressão: nervoso ${cone(nervoso, 1)} x frio ${cone(frio, 1)}`);
  assert.ok(cone(frio, 1) > cone(frio, 0), 'até o mais frio erra um pouco mais sob pressão');
  // o erro vertical é menor que o horizontal
  const aleatorio = semente(7);
  const v = [];
  const h = [];
  for (let i = 0; i < 300; i++) {
    const r = chutar(criarBola({ x: 0, y: CONFIG.raioBola, z: 22 }), { alvo: { x: 0, z: 0 }, forca: 0.7 }, CONFIG, aleatorio);
    v.push(r.desvioVertical);
    h.push(r.desvio);
  }
  const razao = desvioPadrao(v) / desvioPadrao(h);
  assert.ok(razao > 0.25 && razao < 0.45, `vertical/horizontal = ${razao.toFixed(2)}`);
});

teste('FOR alta chuta mais rápido (dentro do limite de ~15%)', () => {
  const v = (FOR) => chutar(criarBola({ x: 0, y: CONFIG.raioBola, z: 22 }), { alvo: { x: 0, z: 0 }, forca: 1, cobrador: cobrador('D', { FOR }) }, CONFIG, () => 0.5).velocidade;
  assert.ok(v(99) > v(80) * 1.03, `FOR 99: ${v(99).toFixed(1)} x FOR 80: ${v(80).toFixed(1)}`);
  assert.ok(v(99) / v(60) < 1.2, 'atributo ajusta, não decide');
  assert.equal(v(40), v(60), 'abaixo de 60 não piora mais');
});

teste('determinismo: o mesmo sorteio dá exatamente o mesmo chute', () => {
  const rodar = () => {
    const c = cobrar({ distancia: 26, forca: 0.9, contato: { x: 0.05, y: 0.05 }, cobrador: cobrador('D', {}, ['semRotacao']), pressao: 0.5, aleatorio: semente(2024) });
    return JSON.stringify({ info: c.info, gol: c.gol, danca: c.bola.danca });
  };
  assert.equal(rodar(), rodar());
});
