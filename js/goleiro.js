// Goleiro: posição, leitura da bola, passos laterais, mergulho e colisão com a bola.
// Aqui só a lógica; o desenho do boneco é de outro arquivo e lê g.pose.
// Não depende do Three.js: dá para rodar no Node (veja testes/defesa.mjs).
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra (gol em z = 0).
//
// Como ele pensa: depois do chute, demora o tempo de reação (mais um pouco se a barreira tapou a visão).
// Aí "lê" a bola: simula uma cópia dela até o plano onde ele está e erra um pouco. Da curva que a bola
// ainda vai fazer ele só percebe uma parte (o resto ele lê como se a bola fosse reta); a curva que vai
// longe dele e a bola sem rotação ele lê pior. Vai dando passos para o lado e relendo; com a leitura
// incerta, vai com cautela e espera mais uma olhada antes de se jogar. Quando o tempo aperta, mergulha
// e não muda mais de ideia.
// Defende o fácil e sofre no ângulo.

import { passo } from './physics.js?v=4';

export const PADRAO_GOLEIRO = {
  reflexo: 0.3,             // s entre o chute e a primeira reação
  atrasoBarreira: 0.12,     // s a mais quando a bola passa por cima da barreira (visão tapada)
  erroLeitura: 0.5,         // m: erro típico (desvio padrão) ao prever onde a bola vai chegar
  distanciaLeitura: 15,     // m: com a bola a essa distância o erro é o erroLeitura cheio; mais perto, lê melhor
  percepcaoCurva: 0.6,      // quanto da curva que a bola ainda vai fazer ele enxerga (1 = tudo; 0 = acha que vai reta)
  variacaoPercepcao: 0.2,   // para mais ou para menos, sorteado em cada cobrança
  pesoCurva: 0.8,           // erro a mais por metro de curva que falta, quando a bola vai longe dele (perto, quase nada)
  pesoSemRotacao: 1,        // erro a mais na bola sem rotação (vezes a intensidade da dança)
  confianca: 0.5,           // m: com a leitura mais incerta que isso, espera mais uma olhada antes de mergulhar (se der tempo)
  intervaloLeitura: 0.12,   // s entre uma releitura e outra, enquanto ainda não mergulhou
  velocidadeLateral: 2.5,   // m/s nos passos para o lado
  aceleracaoLateral: 12,    // m/s²: quão rápido ele arranca e freia nos passos
  velocidadeMergulho: 4.8,  // m/s: velocidade máxima do corpo no mergulho
  preparoMergulho: 0.2,     // s para o mergulho chegar na velocidade máxima (impulso das pernas)
  preparoRasteiro: 0.06,    // s a mais de preparo no mergulho rasteiro (precisa baixar o corpo)
  margemMergulho: 0.07,     // s: mergulha com essa folga antes de a bola chegar
  alcance: 0.85,            // m: as mãos alcançam isso além do centro do corpo
  alturaMaxima: 2.45,       // m: altura máxima das mãos, com o pulo
  velocidadeSegura: 16,     // m/s: abaixo disso, bola no peito ou nas mãos é encaixada
  restituicao: 0.45,        // quanto a bola volta ao bater no goleiro (0 = morre, 1 = volta tudo)
  empurrao: 3,              // m/s que a mão dá na bola ao espalmar (para o lado ou por cima)
  deslocamento: 0.6,        // m que ele se afasta do meio, para o lado que a barreira NÃO cobre
  posicaoZ: 0.4,            // m à frente da linha do gol
};

const lerCfg = (cfg) => ({ ...PADRAO_GOLEIRO, ...((cfg && cfg.goleiro) || {}) });
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const suave = (t) => {
  const u = limitar(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const misturar = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

// ---------- Corpo ----------
// O corpo é uma linha do quadril até a cabeça (o "eixo"), que tomba de lado no mergulho.
// Distâncias medidas ao longo do eixo a partir do centro do quadril.
const QUADRIL_PRONTO = 0.92;    // m: altura do quadril na posição de espera (meio agachado)
const CENTRO = 0.3;             // m: centro do corpo (meio do tronco), de onde se mede o alcance
const CENTRO_PRONTO = QUADRIL_PRONTO + CENTRO;
const RAIO_MAO = 0.11;
const RAIO_BRACO = 0.07;
const OMBRO = 0.52;             // m do quadril até a altura dos ombros
// Partes do corpo ao longo do eixo (d) e de lado a lado (meia = metade da largura, sem contar o raio).
// Tronco, quadril e pernas são cápsulas atravessadas (de um ombro ao outro, de uma perna à outra):
// de frente o corpo é largo, de lado é fino.
const PARTES = [
  { parte: 'perna', d: -0.66, meia: 0.14, r: 0.1 },   // canelas (pernas abertas)
  { parte: 'perna', d: -0.3, meia: 0.1, r: 0.13 },    // coxas
  { parte: 'tronco', d: 0.12, meia: 0.1, r: 0.16 },   // barriga
  { parte: 'tronco', d: 0.4, meia: 0.17, r: 0.15 },   // peito e ombros
  { parte: 'cabeca', d: 0.7, meia: 0, r: 0.12 },
];
// Pés e tornozelos (a ponta das pernas do boneco). No mergulho a perna de baixo dobra e a de cima
// fica esticada e aberta, então os pés vão para o lado de cima do corpo.
const PES = { d: -0.86, r: 0.08, meia: 0.24, abertura: 0.42, dobrada: 0.06 };
const ROLAGEM_MAX = 1.4;        // rad: corpo quase deitado no mergulho completo
const GRAVIDADE = 9.81;
const BRACO_MAX = 0.72;         // m do ombro ao meio da palma: o braço do boneco desenhado, um pouco esticado
const FRENTE_BOLA = 0.06;       // m: a bola presa fica um pouco à frente das mãos
// Onde ele guarda a bola encaixada: na frente da barriga, abraçada (a partir do centro do corpo)
const ABRACO_ALTURA = -0.04;    // m ao longo do eixo do corpo
const ABRACO_FRENTE = 0.38;     // m para a frente
const ABRACO = 0.25;            // s para trazer a bola encaixada até o peito
const ULTIMA_OLHADA = 0.25;     // s: se depois da próxima olhada sobrar menos que isso até a bola chegar, ele não espera mais
const SEM_SEGURAR = 0.15;
const LONGE_CURVA = 2.5;        // m: com a bola chegando a essa distância dele (ou mais), a curva atrapalha por inteiro
const MARGEM_GOL = 0.35;        // m: lendo a bola até isso fora do gol, ele ainda vai nela       // s depois de espalmar sem poder encaixar a mesma bola (a mão ainda está vindo)

// Centro do corpo mais baixo possível para uma rolagem: de pé (ajoelhado) ~0,82 m; deitado de lado
// ~0,33 m. Tombado, quem segura é a coxa (as canelas dobram).
const centroMinimo = (rolagem) => Math.max(
  0.27 + 0.55 * Math.cos(rolagem) ** 2,
  0.13 + 0.1 * Math.abs(Math.sin(rolagem)) + 0.6 * Math.cos(rolagem),
);

// Sorteio com distribuição normal (média 0, desvio 1), pelo método de Box-Muller
function sortearNormal(aleatorio) {
  const u1 = Math.max(1e-9, 1 - aleatorio());
  const u2 = aleatorio();
  const raio = Math.sqrt(-2 * Math.log(u1));
  return { a: raio * Math.cos(2 * Math.PI * u2), b: raio * Math.sin(2 * Math.PI * u2) };
}

// ---------- Criação ----------

// posBola: {x, z} da falta. barreira: o que montarBarreira devolveu (ou null, sem barreira).
// Ele fica na bissetriz do ângulo das traves (vista da bola), um pouco à frente da linha,
// deslocado para o lado que a barreira não cobre.
export function criarGoleiro(posBola, barreira, cfg = {}) {
  const c = lerCfg(cfg);
  const meia = (cfg.golLargura ?? 7.32) / 2;
  const bx = posBola.x;
  const bz = posBola.z;

  // Bissetriz: soma das direções da bola para cada trave
  const d1 = Math.hypot(-meia - bx, -bz) || 1;
  const d2 = Math.hypot(meia - bx, -bz) || 1;
  const sx = (-meia - bx) / d1 + (meia - bx) / d2;
  const sz = -bz / d1 - bz / d2;
  let x = Math.abs(sz) > 1e-6 ? bx + ((c.posicaoZ - bz) * sx) / sz : 0;
  if (barreira && barreira.jogadores && barreira.jogadores.length) x -= barreira.lado * c.deslocamento;
  x = limitar(x, -(meia - 0.8), meia - 0.8);

  const g = {
    base: { x, z: c.posicaoZ },
    z: c.posicaoZ,
    meiaLargura: meia,        // metade da largura do gol
    cx: x,                    // centro do corpo no plano do goleiro (x lateral, cy altura)
    cy: CENTRO_PRONTO,
    vx: 0,                    // velocidade dos passos laterais
    rolagem: 0,
    rotacaoY: Math.atan2(bx - x, bz - c.posicaoZ),
    bracos: 0.25,
    lado: 0,
    alto: 0,
    progresso: 0,
    estado: 'pronto',
    barreira: barreira || null,
    relogio: 0,               // relógio interno (balanço antes do chute)
    tempo: 0,                 // segundos desde o chute
    analisado: false,         // já viu se a bola passa pela barreira
    tapada: false,            // a barreira tapou a visão
    reacao: Infinity,         // instante (s depois do chute) em que reage
    reagiu: false,
    erro: { x: 0, y: 0 },     // erro de leitura sorteado na reação (em desvios padrão)
    percepcao: c.percepcaoCurva, // quanto da curva ele enxerga nesta cobrança (sorteado na reação)
    leitura: null,            // { x, y, t, real: {x, y}, sigma, curva, incerteza }: onde ele acha que a bola vai chegar
    proximaLeitura: 0,
    emDuvida: false,          // já era hora de ir, mas a leitura estava incerta: espera a próxima olhada
    batidasVistas: 0,
    esperandoReleitura: false,
    mergulho: null,
    segurando: false,
    encaixe: null,            // { t0, dur, rel0 }: a bola presa indo até o peito
    bolaPresa: null,          // onde fica a bola presa nas mãos {x, y, z}
    velCorpo: { x: 0, y: 0 },  // velocidade do centro do corpo (a mão que vem no mergulho empurra a bola)
    maos: null,               // [mão direita, mão esquerda] do goleiro
    ultimoContato: -Infinity, // instante do último toque na bola
    ultimoEspalmo: -Infinity, // instante da última espalmada
    _anterior: null,
    _bola: null,
  };
  g.maos = calcularMaos(g, c);
  g.pose = montarPose(g, c);
  return g;
}

// ---------- Leitura da bola ----------

// Cópia funda da bola (sem os eventos), para simular sem mexer na de verdade
function copiar(valor) {
  if (Array.isArray(valor)) return valor.map(copiar);
  if (valor && typeof valor === 'object') {
    const novo = {};
    for (const k in valor) novo[k] = copiar(valor[k]);
    return novo;
  }
  return valor;
}
function copiarBola(bola) {
  const { eventos, ...resto } = bola;
  const copia = copiar(resto);
  copia.eventos = [];
  return copia;
}

const PASSO_PREVISAO = 1 / 120;

// Onde a bola cruza o plano z = zPlano. O goleiro não adivinha a dança da bola sem rotação.
// semGiro: simula como se a bola não tivesse efeito (a "reta" que o olho espera).
// Devolve { x, y, t } (t = segundos a partir de agora) ou null se ela não chega.
function preverCruzamento(bola, zPlano, fis, semGiro = false) {
  if (bola.pos.z <= zPlano || bola.vel.z > -0.3) return null;
  const b = copiarBola(bola);
  b.danca = null;
  if (semGiro) {
    b.giro = { x: 0, y: 0, z: 0 };
    if ('curvaTardia' in b) b.curvaTardia = null;
  }
  for (let s = 0; s < 2.5; s += PASSO_PREVISAO) {
    const ax = b.pos.x;
    const ay = b.pos.y;
    const az = b.pos.z;
    passo(b, PASSO_PREVISAO, fis);
    if (b.pos.z <= zPlano) {
      const f = (az - zPlano) / Math.max(1e-9, az - b.pos.z);
      return { x: ax + (b.pos.x - ax) * f, y: ay + (b.pos.y - ay) * f, t: s + f * PASSO_PREVISAO };
    }
    if (b.vel.z > 0.3) return null;
  }
  return null;
}

// A bola vai passar por cima (ou através) da barreira? Se sim, o goleiro demora mais para ver.
function passaPelaBarreira(bola, b, fis) {
  if (!b || !b.jogadores || !b.jogadores.length) return false;
  const copia = copiarBola(bola);
  copia.danca = null;
  for (let s = 0; s < 1.5; s += PASSO_PREVISAO) {
    passo(copia, PASSO_PREVISAO, fis);
    if (Math.hypot(copia.pos.x - b.bola.x, copia.pos.z - b.bola.z) >= b.distancia) {
      return b.jogadores.some((j) => Math.hypot(copia.pos.x - j.x, copia.pos.z - j.z) < j.raio + 0.35);
    }
    if (copia.vel.z > 0) return false;
  }
  return false;
}

// Lê a bola: previsão com o efeito, mas da curva que a bola ainda vai fazer (diferença entre a
// previsão com efeito e a "reta") ele só enxerga a parte g.percepcao: o resto ele lê como se a bola
// fosse reta. Por isso a curva que leva a bola para longe dele engana, e a que traz a bola para ele
// quase não atrapalha; e o engano some quando a bola chega perto (já não falta curva para fazer).
// Em cima disso vem um erro gaussiano (o mesmo sorteio em todas as releituras), proporcional à
// distância que a bola ainda vai andar (perto é mais fácil de ler; e a bola rápida chega de mais
// longe no mesmo tempo, então é mais difícil). Ele é maior na bola sem rotação e na bola com curva
// que vai longe dele (no canto é difícil julgar onde a curva termina; vindo nele, é só ajeitar as mãos).
function lerBola(g, bola, c, fis) {
  const real = preverCruzamento(bola, g.z, fis);
  if (!real) {
    g.leitura = null;
    return;
  }
  const reta = preverCruzamento(bola, g.z, fis, true) || real;
  // Curva que a bola ainda vai fazer, de lado e na altura (a folha seca "cai" fora da reta)
  const curvaX = limitar(reta.x - real.x, -3, 3);
  const curvaY = limitar(reta.y - real.y, -3, 3);
  const engano = 1 - g.percepcao;
  const danca = bola.danca ? bola.danca.intensidade || 0 : 0;
  const falta = Math.hypot(real.x - bola.pos.x, real.y - bola.pos.y, g.z - bola.pos.z);
  const perto = limitar(falta / Math.max(0.5, c.distanciaLeitura), 0.2, 1.6);
  const curva = Math.hypot(curvaX, curvaY);
  const longe = limitar(Math.abs(real.x - g.cx) / LONGE_CURVA, 0, 1);
  const sigma = c.erroLeitura * perto * (1 + c.pesoCurva * Math.min(curva, 1.5) * longe + c.pesoSemRotacao * danca);
  g.leitura = {
    x: real.x + engano * curvaX + g.erro.x * sigma,
    y: Math.max(0.12, real.y + engano * curvaY + g.erro.y * sigma),
    t: g.tempo + real.t,
    real: { x: real.x, y: real.y },
    sigma,
    curva,
    // O quanto ele sabe que pode estar errado: o erro típico mais a curva que ele sabe que não enxerga
    incerteza: sigma + (1 - c.percepcaoCurva) * curva,
  };
}

// ---------- Plano do mergulho ----------

// Tempo para o corpo andar `dist` metros: acelera durante o preparo (partindo de v0, o embalo dos
// passos) e depois vai na velocidade máxima
function tempoDeMergulho(dist, c, v0 = 0, preparo = c.preparoMergulho) {
  const v = Math.max(0.1, c.velocidadeMergulho);
  const a = v / Math.max(1e-3, preparo);
  const ini = limitar(v0, 0, v);
  const t1 = (v - ini) / a;
  const d1 = ini * t1 + (a * t1 * t1) / 2;
  const t = dist <= d1 ? (-ini + Math.sqrt(ini * ini + 2 * a * dist)) / a : t1 + (dist - d1) / v;
  return Math.max(t, 0.1); // levantar as mãos leva pelo menos isso
}

// Rolagem do corpo para as mãos irem na direção D (+ = tomba para a direita de quem cobra)
function rolagemPara(D, deslocamentoLateral) {
  if (Math.abs(D.x) < 1e-3) return 0;
  const inclinacao = Math.atan2(Math.abs(D.x), Math.abs(D.y)) * (D.y < 0 ? 1.15 : 1);
  const quanto = limitar(deslocamentoLateral / 0.6, 0.25, 1); // sem sair do lugar, tomba pouco
  return Math.sign(D.x) * Math.min(ROLAGEM_MAX, inclinacao * quanto);
}

// Para onde o centro do corpo precisa ir para as mãos chegarem no alvo.
// Bola perto do corpo: ele põe o corpo atrás dela (pula se for alta, agacha se for baixa).
// Bola longe: mergulha até as mãos alcançarem, com o corpo esticado na direção dela.
function planejar(g, alvo, c, meiaAltura) {
  const C0 = { x: g.cx, y: g.cy };
  // Não adianta ir além da trave: a bola que passa dali já está fora
  const T = {
    x: limitar(alvo.x, -(g.meiaLargura + 0.05), g.meiaLargura + 0.05),
    y: limitar(alvo.y, 0.12, Math.max(c.alturaMaxima, meiaAltura)),
  };
  const estica = c.alcance * 0.95; // a bola na palma da mão, não na ponta dos dedos
  const topo = c.alturaMaxima - c.alcance; // o pulo leva o centro do corpo até aqui
  const dx = T.x - C0.x;
  const dy = T.y - C0.y;
  const d0 = Math.hypot(dx, dy);
  let Cf;

  if (Math.abs(dx) < 0.7 && T.y > 0.3 && T.y < topo + estica) {
    // Defesa sem mergulho: corpo atrás da bola, mãos na frente
    Cf = { x: T.x, y: limitar(T.y - 0.25, Math.min(C0.y, centroMinimo(0) + 0.08), topo) };
    if (Cf.y < C0.y && T.y > 0.75) Cf.y = C0.y; // bola na altura do corpo: fica de pé
  } else {
    Cf = d0 <= estica ? { ...C0 } : { x: T.x - (dx / d0) * estica, y: T.y - (dy / d0) * estica };
    // Limites de altura: no alto, o pulo; embaixo, deitado no chão
    const D0 = d0 > 1e-6 ? { x: dx / d0, y: dy / d0 } : { x: 0, y: 1 };
    const piso = centroMinimo(rolagemPara(D0, Math.abs(Cf.x - C0.x)));
    if (Cf.y > topo) {
      // Bola alta: sobe o que dá e chega mais perto de lado para as mãos ainda alcançarem
      // (bola alta demais: os braços vão inclinados mesmo assim, o corpo tomba para o lado dela)
      Cf.y = topo;
      const falta = T.y - topo;
      const lateral = Math.max(falta < estica ? Math.sqrt(estica * estica - falta * falta) : 0, estica * 0.5);
      Cf.x = Math.abs(dx) > lateral ? T.x - Math.sign(dx) * lateral : C0.x;
    } else if (Cf.y < piso) {
      Cf.y = piso;
    }
  }

  const ex = T.x - Cf.x;
  const ey = T.y - Cf.y;
  const de = Math.hypot(ex, ey);
  const D = de > 1e-6 ? { x: ex / de, y: ey / de } : { x: 0, y: 1 };
  const lateral = Cf.x - C0.x;
  const lado = Math.abs(lateral) > 0.35 ? Math.sign(lateral) : 0;
  const baixo = lado ? limitar((0.8 - T.y) / 0.5, 0, 1) : 0; // mergulho rasteiro demora mais para sair
  return {
    T,
    C0,
    Cf,
    D,
    dist: Math.hypot(Cf.x - C0.x, Cf.y - C0.y),
    rolagem: rolagemPara(D, Math.abs(lateral)),
    lado,
    alto: limitar((T.y - 0.4) / 1.5, 0, 1),
    preparo: c.preparoMergulho + c.preparoRasteiro * baixo,
  };
}

// Mergulho de verdade (de lado, tombando bastante): termina deitado no chão
const deitaDeLado = (m) => m.lado !== 0 && Math.abs(m.rolagem) > 0.5;

function comecarMergulho(g, plano, t) {
  const dir = plano.dist > 1e-6
    ? { x: (plano.Cf.x - plano.C0.x) / plano.dist, y: (plano.Cf.y - plano.C0.y) / plano.dist }
    : { x: 0, y: 0 };
  g.mergulho = {
    ...plano,
    alvoLido: { ...plano.T }, // onde ele achou que a bola ia chegar quando decidiu ir
    dir,
    v: Math.max(0, g.vx * dir.x), // aproveita o embalo dos passos
    percorrido: 0,
    chegou: plano.dist < 1e-3,
    tChegada: t,
    caindo: false,
    queda: 0,                 // 0 a 1: braços voltando a acompanhar o corpo depois do lance
    vy: 0,
    deriva: 0,
    noChao: false,
  };
  g.vx = 0;
  g.estado = 'mergulhando';
  g.lado = plano.lado;
  g.alto = plano.alto;
}

// ---------- Atualização ----------

// Chamar a cada quadro (ou a cada passo da física). Devolve g.pose.
//   cfg: o CONFIG do jogo (obrigatório: a previsão da bola usa gravidade, arrasto etc.).
//   opcoes.chutou: a bola já foi chutada. opcoes.tempoDesdeChute: segundos desde o chute.
//   opcoes.cfgFisica: config da física para simular a bola (padrão: cfg).
//   opcoes.aleatorio: função de 0 a 1 para o erro de leitura (padrão: Math.random).
// Crie um goleiro novo (criarGoleiro) a cada cobrança.
export function atualizarGoleiro(g, bola, dt, cfg, opcoes = {}) {
  const c = lerCfg(cfg);
  const fis = opcoes.cfgFisica || cfg;
  if (!fis || !Number.isFinite(fis.gravidade)) {
    throw new Error('atualizarGoleiro: passe o CONFIG do jogo em cfg (ou em opcoes.cfgFisica): a previsão da bola precisa da física');
  }
  const aleatorio = opcoes.aleatorio || Math.random;
  const meia = (cfg.golLargura ?? 7.32) / 2;
  const alturaGol = cfg.golAltura ?? 2.44;
  const cxAntes = g.cx;
  const cyAntes = g.cy;
  g.relogio += dt;

  if (!opcoes.chutou) {
    // Antes do chute: parado na posição, balançando de leve o peso de uma perna para a outra
    g.tempo = 0;
    g.cx = g.base.x + 0.05 * Math.sin(g.relogio * 1.7);
    g.cy = CENTRO_PRONTO + 0.015 * Math.sin(g.relogio * 3.4);
    g.rotacaoY = Math.atan2(bola.pos.x - g.cx, Math.max(0.5, bola.pos.z - g.z));
    g.estado = 'pronto';
    g.bracos = 0.25;
    terminarQuadro(g, c, dt, cxAntes, cyAntes);
    return g.pose;
  }

  g.tempo = opcoes.tempoDesdeChute ?? g.tempo + dt;
  const t = g.tempo;

  // Logo depois do chute: a bola vai passar pela barreira? (tapa a visão e atrasa a reação)
  if (!g.analisado && bola.vel.z < -0.3) {
    g.analisado = true;
    g.tapada = passaPelaBarreira(bola, g.barreira, fis);
    g.reacao = c.reflexo + (g.tapada ? c.atrasoBarreira : 0);
  }

  // Bola desviou na barreira: precisa reler (e não mergulha na leitura velha)
  if (g.barreira && g.barreira.batidas !== g.batidasVistas) {
    g.batidasVistas = g.barreira.batidas;
    if (!g.mergulho && g.reagiu) {
      g.esperandoReleitura = true;
      g.proximaLeitura = Math.max(g.proximaLeitura, t + c.reflexo * 0.5);
    }
  }

  // Vira o corpo para a bola, sem giro brusco (no mergulho o corpo não gira mais)
  if (!g.mergulho) {
    const alvoGiro = Math.atan2(bola.pos.x - g.cx, Math.max(1, bola.pos.z - g.z));
    g.rotacaoY += limitar(alvoGiro - g.rotacaoY, -3 * dt, 3 * dt);
  }

  // Rebote fraco perto dele depois de uma defesa: ele cai em cima da bola e a puxa para o peito
  // (a bola desliza até as mãos em alguns quadros, sem pular)
  const r = cfg.raioBola ?? 0.11;
  if (!g.segurando && Number.isFinite(g.ultimoContato) && t - g.ultimoContato > 0.12) {
    const rapidez = Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z);
    const longe = Math.hypot(bola.pos.x - g.cx, bola.pos.y - g.cy, bola.pos.z - g.z);
    if (rapidez < 5 && longe < c.alcance + 0.3 && bola.pos.z > r + 0.05) {
      encaixar(g, bola.pos, ABRACO + 0.2 * longe);
      g.estado = 'segurou';
      bola.eventos.push({ tipo: 'defesa', modo: 'segurou', parte: 'rebote', impacto: rapidez, x: bola.pos.x, y: bola.pos.y, z: bola.pos.z });
    }
  }

  if (g.segurando || g.mergulho) {
    avancarMergulho(g, bola, dt, c, t);
  } else if (t >= g.reacao) {
    if (!g.reagiu) {
      // Reação: sorteia o erro de leitura desta cobrança (o mesmo nas releituras)
      // e quanto da curva ele vai enxergar
      g.reagiu = true;
      const n = sortearNormal(aleatorio);
      g.erro = { x: limitar(n.a, -2.5, 2.5), y: limitar(n.b, -2.5, 2.5) };
      g.percepcao = limitar(c.percepcaoCurva + c.variacaoPercepcao * (2 * aleatorio() - 1), 0, 1);
      g.proximaLeitura = t;
      g.estado = 'posicionando';
    }
    let leuAgora = false;
    if (t >= g.proximaLeitura) {
      lerBola(g, bola, c, fis);
      g.proximaLeitura = t + c.intervaloLeitura;
      g.esperandoReleitura = false;
      g.emDuvida = false;
      leuAgora = true;
    }
    posicionar(g, bola, dt, c, fis, t, meia, alturaGol, leuAgora);
  }

  terminarQuadro(g, c, dt, cxAntes, cyAntes);
  return g.pose;
}

// Antes de mergulhar: passos para o lado e decide a hora de mergulhar.
// Hora de ir = o tempo até a bola chegar mal dá para o mergulho até onde ele leu. Aí ele dá uma
// última olhada e se joga; mas se a leitura estiver incerta (curva forte, bola dançando, chute de
// longe) e ainda der tempo, espera a próxima olhada: assim nunca se joga longe da bola só porque
// a primeira impressão foi ruim (e, esperando, chega mais tarde no canto).
function posicionar(g, bola, dt, c, fis, t, meia, alturaGol, leuAgora) {
  const vaiNoGol = (L) => L && Math.abs(L.x) < meia + MARGEM_GOL && L.y < alturaGol + MARGEM_GOL;
  const horaDeIr = (L, plano) => {
    const embalo = plano.dist > 1e-6 ? (g.vx * (plano.Cf.x - plano.C0.x)) / plano.dist : 0;
    return L.t - t <= tempoDeMergulho(plano.dist, c, embalo, plano.preparo) + c.margemMergulho;
  };
  // Dá para esperar a próxima olhada e ainda sobrar tempo para um mergulho?
  const daParaEsperar = (L) => L.t - t - c.intervaloLeitura > ULTIMA_OLHADA;
  let L = g.leitura;
  if (vaiNoGol(L) && !g.esperandoReleitura) {
    let plano = planejar(g, L, c, alturaGol);
    if (horaDeIr(L, plano)) {
      const acabouEspera = g.emDuvida && !daParaEsperar(L);
      if (!leuAgora && (!g.emDuvida || acabouEspera)) {
        // Uma última olhada na bola antes de se jogar (conta como uma releitura)
        lerBola(g, bola, c, fis);
        g.proximaLeitura = t + c.intervaloLeitura;
        leuAgora = true;
        L = g.leitura;
        plano = vaiNoGol(L) ? planejar(g, L, c, alturaGol) : null;
      }
      if (plano && leuAgora) {
        if (L.incerteza <= c.confianca || acabouEspera || !daParaEsperar(L)) {
          comecarMergulho(g, plano, t);
          return;
        }
        g.emDuvida = true;
      }
    }
  }
  // Passos laterais: acelera até a velocidade lateral e freia para parar no lugar.
  // Na dúvida (leitura incerta) ele vai com cautela, mais devagar, esperando ver melhor a bola.
  const xAlvo = g.leitura ? limitar(g.leitura.x, -(meia - 0.4), meia - 0.4) : g.base.x;
  const dx = xAlvo - g.cx;
  const cautela = L ? limitar(c.confianca / Math.max(1e-3, L.incerteza), 0.35, 1) : 1;
  const desejada = Math.sign(dx) * Math.min(c.velocidadeLateral * cautela, Math.sqrt(2 * c.aceleracaoLateral * Math.abs(dx)));
  g.vx += limitar(desejada - g.vx, -c.aceleracaoLateral * dt, c.aceleracaoLateral * dt);
  g.cx += g.vx * dt;
  g.cy += (CENTRO_PRONTO - g.cy) * Math.min(1, dt * 10);
  g.bracos += (0.35 - g.bracos) * Math.min(1, dt * 6);
}

// Durante e depois do mergulho: o corpo vai até o ponto planejado, cai e fica no chão
function avancarMergulho(g, bola, dt, c, t) {
  const m = g.mergulho;
  if (!m) {
    // Segurou sem mergulhar (de pé): só puxa a bola para o peito
    g.bracos = Math.min(1, g.bracos + dt * 6);
    return;
  }
  const L = g.leitura;
  const tocou = Number.isFinite(g.ultimoContato);
  const bolaPassou = g.segurando || tocou || bola.pos.z < g.z - 0.25 || (L && t > L.t + 0.15);
  const deLado = deitaDeLado(m);

  if (!m.chegou) {
    // Arranca durante o preparo e depois voa na velocidade máxima, em linha reta até o ponto
    m.v = Math.min(c.velocidadeMergulho, m.v + (c.velocidadeMergulho / Math.max(1e-3, m.preparo)) * dt);
    m.percorrido = Math.min(m.dist, m.percorrido + m.v * dt);
    const f = m.dist > 0 ? m.percorrido / m.dist : 1;
    g.cx = m.C0.x + (m.Cf.x - m.C0.x) * f;
    g.cy = m.C0.y + (m.Cf.y - m.C0.y) * f;
    g.progresso = f;
    if (m.percorrido >= m.dist) {
      m.chegou = true;
      m.tChegada = t;
      m.deriva = m.v * m.dir.x * 0.6; // o embalo que sobra para escorregar depois
    }
  } else {
    // Esticado: fica no alto do voo um instante (até a bola passar, no máximo 0,2 s);
    // depois a gravidade puxa para baixo e o corpo ainda escorrega de lado
    g.progresso = 1;
    if (bolaPassou || t - m.tChegada >= 0.2) m.caindo = true;
    if (m.caindo && (bolaPassou || g.segurando)) m.queda = Math.min(1, m.queda + dt / 0.3);
    if (m.caindo) {
      const piso = deLado ? centroMinimo(g.rolagem) : Math.min(CENTRO_PRONTO, m.Cf.y);
      if (g.cy > piso + 1e-3) {
        m.vy -= GRAVIDADE * dt;
        g.cy = Math.max(piso, g.cy + m.vy * dt);
      } else {
        g.cy = piso;
        m.vy = 0;
        m.noChao = true;
      }
    }
    if (bolaPassou) {
      g.cx += m.deriva * dt;
      m.deriva *= Math.exp(-5 * dt);
    }
    if (m.noChao && bolaPassou && !g.segurando) g.estado = 'caido';
  }

  // Rolagem acompanha o mergulho; caindo de lado, termina quase deitado
  const rolagemFinal = m.caindo && deLado ? Math.sign(m.rolagem) * ROLAGEM_MAX : m.rolagem;
  const alvoRolagem = rolagemFinal * suave(Math.min(1, g.progresso * 1.3));
  g.rolagem += (alvoRolagem - g.rolagem) * Math.min(1, dt * 14);
  // Braços esticados no lance; defendendo de pé, depois do lance eles voltam para a frente do corpo
  if (m.queda > 0.5 && !deLado && !g.segurando) g.bracos = Math.max(0.3, g.bracos - dt * 3);
  else g.bracos = Math.min(1, g.bracos + dt * 8);
}

// ---------- Pose e partes do corpo ----------

function eixos(g) {
  const s = Math.sin(g.rotacaoY);
  const co = Math.cos(g.rotacaoY);
  const F = { x: s, y: 0, z: co };   // frente (para a bola)
  const L = { x: co, y: 0, z: -s };  // lado: direita de quem cobra
  const U = {                         // eixo do corpo, do quadril para a cabeça
    x: Math.sin(g.rolagem) * L.x,
    y: Math.cos(g.rolagem),
    z: Math.sin(g.rolagem) * L.z,
  };
  // Eixo dos ombros (de um lado do corpo ao outro), tombado junto com a rolagem
  const O = { x: Math.cos(g.rolagem) * L.x, y: -Math.sin(g.rolagem), z: Math.cos(g.rolagem) * L.z };
  return { F, L, U, O };
}

// Ponto do corpo: d ao longo do eixo a partir do quadril, lado ao longo dos ombros, frente para a bola
function noCorpo(g, { F, U, O }, d, lado = 0, frente = 0) {
  return {
    x: g.cx + U.x * (d - CENTRO) + O.x * lado + F.x * frente,
    y: g.cy + U.y * (d - CENTRO) + O.y * lado,
    z: g.z + U.z * (d - CENTRO) + O.z * lado + F.z * frente,
  };
}

// Ombro de cada lado: s = −1 é o ombro direito do goleiro (lado −L), +1 o esquerdo
const ombroDoGoleiro = (g, eixo, s) => noCorpo(g, eixo, OMBRO, 0.2 * s);

// A mão não vai além do comprimento do braço
function noBraco(mao, ombro) {
  const dx = mao.x - ombro.x;
  const dy = mao.y - ombro.y;
  const dz = mao.z - ombro.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= BRACO_MAX) return mao;
  const k = BRACO_MAX / d;
  return { x: ombro.x + dx * k, y: ombro.y + dy * k, z: ombro.z + dz * k };
}

// Começa a segurar a bola que está em p: ela vai, junto com as mãos, até o peito em `dur` segundos
// (sem pular de uma vez para as mãos)
function encaixar(g, p, dur) {
  g.segurando = true;
  g.encaixe = { t0: g.tempo, dur, rel0: { x: p.x - g.cx, y: p.y - g.cy, z: p.z - g.z } };
  g.bolaPresa = { x: p.x, y: p.y, z: p.z };
}

// Onde está a bola presa: sai de onde ele pegou (acompanhando o corpo) e vai até a frente do peito
function posicaoDaBolaPresa(g, { F, U }) {
  const e = g.encaixe;
  const k = suave((g.tempo - e.t0) / Math.max(1e-3, e.dur));
  const peito = {
    x: U.x * ABRACO_ALTURA + F.x * ABRACO_FRENTE,
    y: U.y * ABRACO_ALTURA,
    z: U.z * ABRACO_ALTURA + F.z * ABRACO_FRENTE,
  };
  const rel = misturar(e.rel0, peito, k);
  return { x: g.cx + rel.x, y: g.cy + rel.y, z: g.z + rel.z };
}

// Mãos segurando a bola no ponto P: uma de cada lado, um pouco atrás e embaixo dela
function maosNaBola(P, { F, U, O }) {
  return [-1, 1].map((s) => ({
    x: P.x - F.x * FRENTE_BOLA + O.x * 0.15 * s - U.x * 0.05,
    y: P.y + O.y * 0.15 * s - U.y * 0.05,
    z: P.z - F.z * FRENTE_BOLA + O.z * 0.15 * s - U.z * 0.05,
  }));
}

// Posição das mãos: na espera, na frente do peito; no mergulho, esticadas para o alvo;
// segurando, em volta da bola
function calcularMaos(g, c) {
  const eixo = eixos(g);
  const { F, L, U } = eixo;
  const C = { x: g.cx, y: g.cy, z: g.z };
  const H = { x: C.x - U.x * CENTRO, y: C.y - U.y * CENTRO, z: C.z - U.z * CENTRO };
  const pronto = [-1, 1].map((s) => ({
    x: H.x + U.x * 0.38 + L.x * 0.3 * s + F.x * 0.22,
    y: H.y + U.y * 0.38,
    z: H.z + U.z * 0.38 + L.z * 0.3 * s + F.z * 0.22,
  }));
  let maos = pronto;
  const m = g.mergulho;
  const w = suave((g.bracos - 0.35) / 0.65);
  if (m && w > 0) {
    // Direção e quanto esticar: até o alvo, no máximo o alcance
    const ex = m.T.x - C.x;
    const ey = m.T.y - C.y;
    const d = Math.hypot(ex, ey);
    let D = d > 1e-3 ? { x: ex / d, y: ey / d } : { x: 0, y: 1 };
    let estica = Math.min(c.alcance, d);
    // Deitado depois do lance, os braços acompanham o corpo (esticados além da cabeça). Gira o
    // ângulo dos braços aos poucos, pelo caminho mais curto (misturar as direções passaria pelo zero)
    const queda = !g.segurando && deitaDeLado(m) ? suave(m.queda || 0) : 0;
    if (queda > 0) {
      const ux = U.x * L.x + U.z * L.z; // eixo do corpo no plano do goleiro
      const a = Math.atan2(D.y, D.x);
      let da = Math.atan2(U.y, ux) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      D = { x: Math.cos(a + da * queda), y: Math.sin(a + da * queda) };
      estica += (c.alcance * 0.9 - estica) * queda;
    }
    const frente = 0.12 + 0.14 * (1 - estica / c.alcance);
    const P = { x: -D.y, y: D.x }; // perpendicular, para separar as duas mãos
    const mergulho = [-1, 1].map((s) => ({
      x: C.x + D.x * estica + P.x * 0.09 * s + F.x * frente,
      y: C.y + D.y * estica + P.y * 0.09 * s,
      z: C.z + F.z * frente,
    }));
    // Junta cada mão de espera com a mão de mergulho do mesmo lado do corpo
    const lado = (p) => (p.x - C.x) * L.x + (p.z - C.z) * L.z;
    if (lado(mergulho[0]) > lado(mergulho[1])) mergulho.reverse();
    maos = pronto.map((p, i) => misturar(p, mergulho[i], w));
  }
  if (g.segurando && g.bolaPresa) {
    // Encaixou: as mãos vão logo para a bola e a levam junto até o peito
    const k = suave((g.tempo - g.encaixe.t0) / Math.max(1e-3, g.encaixe.dur * 0.35));
    const naBola = maosNaBola(g.bolaPresa, eixo);
    maos = maos.map((p, i) => misturar(p, naBola[i], k));
  }
  // Nenhuma mão vai além do comprimento do braço, nem entra no gramado
  return maos.map((p, i) => {
    const mao = noBraco(p, ombroDoGoleiro(g, eixo, i === 0 ? -1 : 1));
    return { x: mao.x, y: Math.max(0.06, mao.y), z: mao.z };
  });
}

function montarPose(g, c) {
  const { U } = eixos(g);
  const maos = g.maos || calcularMaos(g, c);
  return {
    x: g.cx - U.x * CENTRO,          // centro do quadril
    y: g.cy - U.y * CENTRO,
    z: g.z - U.z * CENTRO,
    rotacaoY: g.rotacaoY,             // rad, como no Three.js: 0 = olhando para +z (para quem cobra)
    rolagem: g.rolagem,               // rad, + = tombando para a direita de quem cobra
    progressoMergulho: g.progresso,   // 0 a 1
    lado: g.lado,                     // -1 esquerda, 0 no meio (pulo/agachado), +1 direita de quem cobra
    alto: g.alto,                     // 0 = bola baixa (rasteiro), 1 = alta
    bracos: g.bracos,                 // 0 = soltos, ~0,3 = prontos na frente do peito, 1 = esticados
    estado: g.estado,
    maos: { direita: maos[0], esquerda: maos[1] }, // mãos do goleiro (a direita dele fica à esquerda de quem cobra)
    centro: { x: g.cx, y: g.cy, z: g.z },
  };
}

function terminarQuadro(g, c, dt, cxAntes, cyAntes) {
  if (dt > 0) g.velCorpo = { x: (g.cx - cxAntes) / dt, y: (g.cy - cyAntes) / dt };
  if (g.segurando && g.encaixe) g.bolaPresa = posicaoDaBolaPresa(g, eixos(g));
  g.maos = calcularMaos(g, c);
  g.pose = montarPose(g, c);
}

// Partes do corpo: esferas e, nos braços, cápsulas (do ombro até a mão).
// [{ parte: 'mao' | 'braco' | 'tronco' | 'cabeca' | 'perna', x, y, z, r, ate?: {x, y, z} }]
// Com `ate`, a parte é uma cápsula de (x, y, z) até `ate`. Servem para a colisão e para desenhar
// o "esqueleto" ao depurar.
export function partesDoGoleiro(g) {
  const eixo = eixos(g);
  // (nada fica abaixo do chão: perto dele as pernas dobram)
  const capsula = (parte, d, de, ate, r) => {
    const a = noCorpo(g, eixo, d, de);
    const b = noCorpo(g, eixo, d, ate);
    return { parte, x: a.x, y: Math.max(r, a.y), z: a.z, ate: { x: b.x, y: Math.max(r, b.y), z: b.z }, r };
  };
  const lista = PARTES.map(({ parte, d, meia, r }) => {
    if (!meia) {
      const m = noCorpo(g, eixo, d);
      return { parte, ...m, y: Math.max(r, m.y), r };
    }
    return capsula(parte, d, -meia, meia, r);
  });
  // Pés: de pé, um de cada lado; deitado, a perna de cima abre e a de baixo dobra perto do corpo
  const deitado = limitar(Math.abs(g.rolagem), 0, 1);
  const s = Math.sign(g.rolagem) || 1;
  lista.push(capsula(
    'perna', PES.d,
    -s * (PES.meia + (PES.abertura - PES.meia) * deitado),
    s * (PES.meia + (PES.dobrada - PES.meia) * deitado),
    PES.r,
  ));
  const maos = g.maos || [];
  maos.forEach((m, i) => {
    const ombro = ombroDoGoleiro(g, eixo, i === 0 ? -1 : 1); // mão direita do goleiro fica no lado −L
    lista.push({ parte: 'braco', ...ombro, ate: { x: m.x, y: m.y, z: m.z }, r: RAIO_BRACO });
    lista.push({ parte: 'mao', x: m.x, y: m.y, z: m.z, r: RAIO_MAO });
  });
  return lista;
}

// Ponto da parte mais perto de p (o centro da esfera, ou o ponto mais perto no eixo da cápsula)
function pontoMaisPerto(q, p) {
  if (!q.ate) return q;
  const ax = q.ate.x - q.x;
  const ay = q.ate.y - q.y;
  const az = q.ate.z - q.z;
  const l2 = ax * ax + ay * ay + az * az;
  const f = l2 > 1e-9 ? limitar(((p.x - q.x) * ax + (p.y - q.y) * ay + (p.z - q.z) * az) / l2, 0, 1) : 0;
  return { x: q.x + ax * f, y: q.y + ay * f, z: q.z + az * f };
}

// ---------- Colisão ----------

// Colisão da bola com o goleiro. Chamar depois de cada passo(bola, ...).
// Bola devagar (< velocidadeSegura) nas mãos ou no peito, perto do centro do corpo: ele SEGURA
// (a bola fica nas mãos, vai junto com elas até o peito e cai junto com ele). Senão ESPALMA: a bola
// rebate (restituicao) e a mão empurra para o lado ou por cima. Registra
// bola.eventos.push({ tipo: 'defesa', modo, parte, impacto, x, y, z }), com modo 'segurou' | 'espalmou'
// e parte 'mao' | 'braco' | 'tronco' | 'cabeca' | 'perna' (no rebote que ele agarra depois: 'rebote').
// Os toques seguidos de uma mesma espalmada (a mão ainda vindo) contam como um só evento.
export function colidirBolaGoleiro(bola, g, cfg = {}) {
  const c = lerCfg(cfg);
  const r = cfg.raioBola ?? 0.11;
  const { pos, vel, giro } = bola;

  if (g.segurando) {
    // Bola presa nas mãos (atualizada junto com o goleiro, em atualizarGoleiro)
    const p = g.bolaPresa || pos;
    pos.x = p.x;
    pos.y = Math.max(r, p.y);
    pos.z = Math.max(r + 0.05, p.z);
    vel.x = vel.y = vel.z = 0;
    giro.x = giro.y = giro.z = 0;
    bola.danca = null;
    if ('curvaTardia' in bola) bola.curvaTardia = null;
    g._anterior = { ...pos };
    g._bola = bola;
    return true;
  }

  const partes = partesDoGoleiro(g);
  const { F } = eixos(g);
  const a = g._bola === bola && g._anterior ? g._anterior : pos;
  const dx = pos.x - a.x;
  const dy = pos.y - a.y;
  const dz = pos.z - a.z;
  const andou = Math.hypot(dx, dy, dz);
  const amostras = andou > 2 ? 1 : Math.min(40, Math.max(1, Math.ceil(andou / 0.03)));
  let tocou = false;

  for (let k = 1; k <= amostras && !tocou; k++) {
    const f = andou > 2 ? 1 : k / amostras;
    const p = { x: a.x + dx * f, y: a.y + dy * f, z: a.z + dz * f };
    if (Math.abs(p.z - g.z) > 1.6) continue; // longe do goleiro
    // A parte mais "enterrada" na bola
    let melhor = null;
    for (const q of partes) {
      const perto = pontoMaisPerto(q, p);
      const folga = Math.hypot(p.x - perto.x, p.y - perto.y, p.z - perto.z) - q.r - r;
      if (folga < 0 && (!melhor || folga < melhor.folga)) melhor = { parte: q.parte, r: q.r, ...perto, folga };
    }
    if (!melhor) continue;
    tocou = true;

    let nx = p.x - melhor.x;
    let ny = p.y - melhor.y;
    let nz = p.z - melhor.z;
    let d = Math.hypot(nx, ny, nz);
    if (d < 1e-6) {
      const v = Math.hypot(vel.x, vel.y, vel.z) || 1;
      nx = -vel.x / v;
      ny = -vel.y / v;
      nz = -vel.z / v;
      d = 1;
    }
    nx /= d;
    ny /= d;
    nz /= d;
    const encosta = melhor.r + r + 1e-3;
    pos.x = melhor.x + nx * encosta;
    pos.y = Math.max(r, melhor.y + ny * encosta);
    pos.z = melhor.z + nz * encosta;

    // A palma da luva fica virada para a bola: batida na mão (e no braço) rebate mais para a frente.
    // Com o braço todo esticado é só a ponta dos dedos: desvia pouco e empurra menos.
    const comMao = melhor.parte === 'mao' || melhor.parte === 'braco';
    const esticado = limitar(Math.hypot(p.x - g.cx, p.y - g.cy) / c.alcance, 0, 1) ** 2;
    if (comMao) {
      const k = (melhor.parte === 'mao' ? 1 : 0.5) * (1 - 0.7 * esticado);
      nx += F.x * k;
      nz += F.z * k;
      const dn = Math.hypot(nx, ny, nz);
      nx /= dn;
      ny /= dn;
      nz /= dn;
    }

    // Velocidade da bola em relação à parte do corpo (a mão que vem no mergulho empurra a bola)
    const vp = { x: g.velCorpo.x, y: g.velCorpo.y, z: 0 };
    const rx = vel.x - vp.x;
    const ry = vel.y - vp.y;
    const rz = vel.z - vp.z;
    const vn = rx * nx + ry * ny + rz * nz;
    if (vn >= 0) continue; // já está se afastando
    const rapidez = Math.hypot(rx, ry, rz);
    const impacto = -vn;

    // Encaixa? Bola devagar, de frente, nas mãos ou no peito e perto do centro do corpo
    const dCentro = Math.hypot(p.x - g.cx, p.y - g.cy); // no plano do corpo: o quanto ele precisou esticar
    const qualidade = limitar(1.6 - dCentro / c.alcance, 0.35, 1);
    const deFrente = impacto > 0.5 * rapidez;
    // (logo depois de espalmar não dá: é a mão que ainda vem no mergulho batendo de novo na bola)
    const espalmouAgora = g.tempo - g.ultimoEspalmo < SEM_SEGURAR;
    const podeSegurar = (melhor.parte === 'mao' || melhor.parte === 'tronco') && deFrente && !espalmouAgora;
    if (podeSegurar && rapidez < c.velocidadeSegura * qualidade) {
      encaixar(g, pos, ABRACO);
      g.estado = 'segurou';
      g.ultimoContato = g.tempo;
      vel.x = vel.y = vel.z = 0;
      giro.x = giro.y = giro.z = 0;
      bola.danca = null;
      if ('curvaTardia' in bola) bola.curvaTardia = null;
      bola.eventos.push({ tipo: 'defesa', modo: 'segurou', parte: melhor.parte, impacto, x: pos.x, y: pos.y, z: pos.z });
      break;
    }

    // Espalma ou rebate: parte normal volta (restituição), a de raspão perde força (atrito)
    const atrito = comMao ? 0.6 : 0.3; // o corpo amortece mais
    const tx = rx - vn * nx;
    const ty = ry - vn * ny;
    const tz = rz - vn * nz;
    const volta = impacto * c.restituicao + (comMao ? c.empurrao * (1 - 0.6 * esticado) : 0);
    vel.x = vp.x + tx * atrito + volta * nx;
    vel.y = vp.y + ty * atrito + volta * ny;
    vel.z = vp.z + tz * atrito + volta * nz;
    giro.x *= 0.3;
    giro.y *= 0.3;
    giro.z *= 0.3;
    bola.danca = null;
    if ('curvaTardia' in bola) bola.curvaTardia = null;
    if (impacto > 0.5) {
      g.ultimoContato = g.tempo;
      g.ultimoEspalmo = g.tempo;
      if (!espalmouAgora) {
        bola.eventos.push({ tipo: 'defesa', modo: 'espalmou', parte: melhor.parte, impacto, x: pos.x, y: pos.y, z: pos.z });
      }
    }
  }

  g._anterior = { x: pos.x, y: pos.y, z: pos.z };
  g._bola = bola;
  return tocou;
}
