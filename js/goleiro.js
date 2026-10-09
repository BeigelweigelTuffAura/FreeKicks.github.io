// Goleiro: posição, leitura da bola, passos laterais, mergulho e colisão com a bola.
// Aqui só a lógica; o desenho do boneco é de outro arquivo e lê g.pose.
// Não depende do Three.js: dá para rodar no Node (veja testes/defesa.mjs).
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra (gol em z = 0).
//
// Como ele pensa:
// - Antes do chute: arruma a barreira olhando do meio do ângulo e dá uns passos para o lado que a
//   barreira não cobre (fecha o ângulo). Na corrida do cobrador ele se firma e dá o "passinho de
//   prontidão", caindo na base bem na hora do chute.
// - Depois do chute: demora o tempo de reação (mais um pouco se a barreira tapou a visão). Aí "lê" a
//   bola: simula uma cópia dela até o plano onde ele está. Da curva que a bola ainda vai fazer ele só
//   percebe uma parte (o resto ele lê como se a bola fosse reta); a curva que leva a bola para longe
//   dele e a bola sem rotação ele lê pior. O engano diminui sozinho à medida que a bola chega
//   (falta menos curva para fazer).
// - Vai dando passos para o lado e relendo. Só mergulha quando precisa (o tempo até a bola chegar mal
//   dá para o mergulho); com a leitura incerta, se ainda der, espera mais uma olhada.
// - O mergulho é físico: as pernas empurram o corpo durante o impulso e depois ele voa em parábola
//   (a gravidade puxa), cai e escorrega. No ar, só as mãos ainda se ajeitam um pouco.
// Defende o fácil e sofre no ângulo.

import { passo } from './physics.js?v=5';
import { CONFIG } from './config.js?v=5';

export const PADRAO_GOLEIRO = {
  reflexo: 0.3,             // s entre o chute e a primeira reação
  atrasoBarreira: 0.12,     // s a mais quando a bola passa por cima da barreira (visão tapada)
  erroLeitura: 0.7,         // m: erro típico (desvio padrão) ao prever onde a bola vai chegar
  distanciaLeitura: 15,     // m: com a bola a essa distância o erro é o erroLeitura cheio; mais perto, lê melhor
  percepcaoCurva: 0.6,      // quanto da curva que a bola ainda vai fazer ele enxerga (1 = tudo; 0 = acha que vai reta)
  variacaoPercepcao: 0.2,   // para mais ou para menos, sorteado em cada cobrança
  pesoCurva: 1.3,           // erro a mais por metro de curva que falta, quando a bola vai longe dele (perto, quase nada)
  pesoSemRotacao: 1,        // erro a mais na bola sem rotação (vezes a intensidade da dança)
  confianca: 0.45,          // m: com a leitura mais incerta que isso, espera mais uma olhada antes de mergulhar (se der tempo)
  intervaloLeitura: 0.12,   // s entre uma releitura e outra
  velocidadeLateral: 2.5,   // m/s nos passos para o lado
  velocidadeCorrida: 3.5,   // m/s correndo de lado (cruzando as pernas), quando a bola vai longe dele
  aceleracaoLateral: 12,    // m/s²: quão rápido ele arranca e freia nos passos
  velocidadeMergulho: 4.8,  // m/s: velocidade máxima com que as pernas lançam o corpo no mergulho
  impulsoVertical: 2.6,     // m/s: o máximo que as pernas jogam o corpo para cima (pulo)
  preparoMergulho: 0.2,     // s de impulso: as pernas empurram o corpo até ele sair do chão
  preparoRasteiro: 0.06,    // s a mais de impulso no mergulho rasteiro (precisa baixar o corpo)
  margemMergulho: 0.07,     // s: mergulha com essa folga antes de a bola chegar
  ajusteMaos: 1.2,          // m/s: quanto as mãos ainda corrigem no ar, vendo a bola chegar
  alcance: 0.85,            // m: as mãos alcançam isso além do centro do corpo
  alturaMaxima: 2.45,       // m: altura máxima das mãos, com o pulo
  velocidadeSegura: 16,     // m/s: abaixo disso, bola no peito ou nas mãos é encaixada
  restituicao: 0.45,        // quanto a bola volta ao bater no goleiro (0 = morre, 1 = volta tudo)
  empurrao: 3,              // m/s que a mão dá na bola ao espalmar (para o lado ou por cima)
  deslocamento: 0.6,        // m que ele se afasta do meio, para o lado que a barreira NÃO cobre
  posicaoZ: 0.4,            // m à frente da linha do gol
};

const lerCfg = (cfg) => ({ ...PADRAO_GOLEIRO, ...((cfg && cfg.goleiro) || {}) });
// A física da bola precisa do CONFIG do jogo (gravidade, arrasto...): sem ele, usa o padrão
const lerFisica = (cfg, opcoes) => {
  if (opcoes && opcoes.cfgFisica) return opcoes.cfgFisica;
  return cfg && Number.isFinite(cfg.gravidade) ? cfg : CONFIG;
};
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const suave = (t) => {
  const u = limitar(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const sino = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
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
// Tronco e cabeça ao longo do eixo (d) e de lado a lado (meia = metade da largura, sem contar o raio).
// O tronco é uma cápsula atravessada (de um ombro ao outro): de frente o corpo é largo, de lado é fino.
const PARTES = [
  { parte: 'tronco', d: 0.12, meia: 0.1, r: 0.16 },   // barriga
  { parte: 'tronco', d: 0.4, meia: 0.17, r: 0.15 },   // peito e ombros
  { parte: 'cabeca', d: 0.7, meia: 0, r: 0.12 },
];
// Pernas: coxa (do quadril ao joelho) e canela com o pé (do joelho ao pé), como no boneco desenhado.
// De pé, abertas; deitado no mergulho, a de baixo (a do impulso) fica esticada ao longo do corpo e a de
// cima vai aberta e dobrada. Pontos: [d ao longo do eixo, para o lado de fora, para a frente].
const PERNAS = {
  quadril: [-0.04, 0.1, 0],
  dePe: { joelho: [-0.46, 0.15, 0.05], pe: [-0.88, 0.26, 0.04] },
  deBaixo: { joelho: [-0.48, 0.09, 0.02], pe: [-0.95, 0.1, 0] },
  deCima: { joelho: [-0.42, 0.24, 0.14], pe: [-0.84, 0.42, 0.1] },
  rCoxa: 0.12,
  rCanela: 0.09,
};
const ROLAGEM_MAX = 1.4;        // rad: corpo quase deitado no mergulho completo
const GRAVIDADE = 9.81;

// Antes do chute
const PASSO_INICIO = 0.15;      // s depois de a falta aparecer: começa o passo para o lado aberto
const PASSO_VELOCIDADE = 1.5;   // m/s desse passo (andando de lado, sem pressa)
const PRONTIDAO = 0.45;         // s antes do chute em que ele começa a se firmar na base (firme no passinho)
const PULINHO = 0.035;          // m que o centro sobe no passinho de prontidão
const PULINHO_DURACAO = 0.13;   // s no ar do passinho (cai na base bem na hora do chute)

// Leitura e decisão
const PLANO_MAOS = 0.2;         // m: as mãos pegam a bola um pouco à frente do corpo
const ALTURA_SEM_PULO = 1.75;   // m: bola perto do corpo até essa altura ele pega de pé; mais alta, estica e pula
const ENGANO_PERTO = 0.15;      // quanto da curva engana quando a bola vem nele (longe dele, engana por inteiro)
const LONGE_CURVA = 2.5;        // m: com a bola chegando a essa distância dele (ou mais), a curva engana por inteiro
const MARGEM_GOL = 0.35;        // m: lendo a bola até isso fora do gol, ele ainda vai nela
const MAOS_PRONTAS = 0.22;      // s: de pé, ele arma as mãos pelo menos esse tempo antes de a bola chegar
const ULTIMA_OLHADA = 0.25;     // s: se depois da próxima olhada sobrar menos que isso até a bola chegar, não espera mais

// Mãos e bola presa
const FRENTE_BOLA = 0.06;       // m: a bola presa fica um pouco à frente das mãos
const ABRACO_ALTURA = -0.04;    // m ao longo do eixo do corpo (a partir do centro): onde ele guarda a bola
const ABRACO_FRENTE = 0.36;     // m para a frente
const ABRACO = 0.3;             // s para trazer a bola encaixada até o peito
const MAOS_NA_BOLA = 0.08;      // s para as duas mãos envolverem a bola encaixada
const SEM_SEGURAR = 0.2;        // s depois de espalmar: a mesma bola não é encaixada (é a mão que ainda vem)
const VOO_MAX = 0.45;           // s: o voo mais longo de um mergulho (mais longe que isso, antes dá passos)
const ESCORREGA = 12;           // 1/s: quão rápido o corpo para de escorregar no gramado depois do mergulho

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
// A posição dele é a bissetriz do ângulo das traves (vista da bola), um pouco à frente da linha,
// deslocada para o lado que a barreira não cobre. Ele começa na bissetriz (arrumando a barreira)
// e dá o passo para o lado logo depois.
export function criarGoleiro(posBola, barreira, cfg = CONFIG) {
  const c = lerCfg(cfg);
  const meia = ((cfg && cfg.golLargura) ?? 7.32) / 2;
  const bx = posBola.x;
  const bz = posBola.z;

  // Bissetriz: soma das direções da bola para cada trave
  const d1 = Math.hypot(-meia - bx, -bz) || 1;
  const d2 = Math.hypot(meia - bx, -bz) || 1;
  const sx = (-meia - bx) / d1 + (meia - bx) / d2;
  const sz = -bz / d1 - bz / d2;
  const bissetriz = Math.abs(sz) > 1e-6 ? bx + ((c.posicaoZ - bz) * sx) / sz : 0;
  let x = bissetriz;
  // (barreira pequena, de longe, tapa pouco: ele sai menos do meio)
  const n = barreira && barreira.jogadores ? barreira.jogadores.length : 0;
  if (n) x -= barreira.lado * c.deslocamento * Math.min(1, n / 4);
  const limite = meia - 0.8;
  x = limitar(x, -limite, limite);
  const inicio = limitar(bissetriz, -limite, limite);

  const g = {
    base: { x, z: c.posicaoZ },
    z: c.posicaoZ,
    meiaLargura: meia,        // metade da largura do gol
    ancora: inicio,           // onde os pés estão plantados antes do chute (anda até base.x)
    cx: inicio,               // centro do corpo no plano do goleiro (x lateral, cy altura)
    cy: CENTRO_PRONTO,
    vx: 0,                    // velocidade dos passos laterais
    rolagem: 0,
    rotacaoY: Math.atan2(bx - inicio, bz - c.posicaoZ),
    bracos: 0.25,
    lado: 0,
    alto: 0,
    progresso: 0,
    prontidao: 0,             // 0 = relaxado, 1 = firme na base, esperando o chute
    passinho: null,           // { depois, t0 }: o passinho de prontidão (antes do chute, na corrida, ou logo depois)
    pulinho: 0,               // m que o passinho levanta o corpo agora (só no desenho)
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
    leitura: null,            // { x, y, t, real, sigma, curva, incerteza }: onde ele acha que a bola vai chegar
    proximaLeitura: 0,
    batidasVistas: 0,
    esperandoReleitura: false,
    emDuvida: false,          // já era hora de ir, mas a leitura estava incerta: espera a próxima olhada
    mergulho: null,
    segurando: false,
    encaixe: null,            // { t0, dur, rel0 }: a bola presa indo até o peito
    bolaPresa: null,          // onde fica a bola presa {x, y, z}
    velCorpo: { x: 0, y: 0 }, // velocidade do centro do corpo (a mão que vem no mergulho empurra a bola)
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

// Lê a bola. Da curva que a bola ainda vai fazer (diferença entre a previsão com efeito e a "reta")
// ele só enxerga a parte g.percepcao: o resto ele lê como se a bola fosse reta. Esse engano é maior
// quando a bola vai terminar longe dele (no canto é difícil julgar onde a curva acaba; vindo nele, é
// só ajeitar as mãos) e some quando a bola chega perto (já não falta curva para fazer).
// Em cima disso vem um erro gaussiano (o mesmo sorteio em todas as releituras), proporcional à
// distância que a bola ainda vai andar (perto é mais fácil de ler; e a bola rápida chega de mais
// longe no mesmo tempo, então é mais difícil). Ele é a metade com a bola vindo nele, e cresce com a
// bola que vai longe dele, com a bola sem rotação e com a curva que leva a bola para longe dele.
function lerBola(g, bola, c, fis) {
  // (onde a bola passa na frente dele, onde as mãos vão pegar)
  const plano = g.z + PLANO_MAOS;
  const real = preverCruzamento(bola, plano, fis);
  if (!real) {
    g.leitura = null;
    return;
  }
  const reta = preverCruzamento(bola, plano, fis, true) || real;
  // Curva que a bola ainda vai fazer, de lado e na altura (a folha seca "cai" fora da reta)
  const curvaX = limitar(reta.x - real.x, -3, 3);
  const curvaY = limitar(reta.y - real.y, -3, 3);
  const curva = Math.hypot(curvaX, curvaY);
  const longe = limitar(Math.abs(real.x - g.cx) / LONGE_CURVA, 0, 1);
  const pesoLonge = ENGANO_PERTO + (1 - ENGANO_PERTO) * longe; // vindo nele, a curva quase não engana
  const engano = (1 - g.percepcao) * pesoLonge;
  const danca = bola.danca ? bola.danca.intensidade || 0 : 0;
  const falta = Math.hypot(real.x - bola.pos.x, real.y - bola.pos.y, plano - bola.pos.z);
  const perto = limitar(falta / Math.max(0.5, c.distanciaLeitura), 0.2, 1.6);
  // (bola vindo nele quase não anda de lado no olho dele: é fácil de ler; quanto mais longe dele ela
  // vai, mais difícil julgar o quanto ela ainda anda)
  const lado = 0.5 + 0.5 * longe;
  const sigma = c.erroLeitura * perto * (lado + c.pesoCurva * Math.min(curva, 1.5) * longe + c.pesoSemRotacao * danca);
  g.leitura = {
    x: real.x + engano * curvaX + g.erro.x * sigma,
    y: Math.max(0.12, real.y + engano * curvaY + g.erro.y * sigma),
    t: g.tempo + real.t,
    real: { x: real.x, y: real.y },
    sigma,
    curva,
    // O quanto ele sabe que pode estar errado: o erro típico mais a curva que ele sabe que não enxerga
    incerteza: sigma + (1 - c.percepcaoCurva) * curva * pesoLonge,
  };
}

// ---------- Plano do mergulho ----------

// Velocidade com que as pernas precisam lançar o corpo para o centro passar por Cf daqui a T s.
// Impulso: durante `tp` s a velocidade vai de v0 (o embalo dos passos) até vL, com os pés no chão;
// depois o corpo voa em parábola. Devolve { x, y, possivel }.
function lancamento(C0, Cf, T, v0, tp, c) {
  const s = Math.max(0, T - tp);
  const k = tp / 2 + s;
  const x = (Cf.x - C0.x - (v0.x * tp) / 2) / k;
  const y = (Cf.y - C0.y - (v0.y * tp) / 2 + 0.5 * GRAVIDADE * s * s) / k;
  const minimoY = v0.y - GRAVIDADE * tp; // não dá para descer mais rápido que caindo
  const l = { x, y, minimoY };
  l.possivel = excesso(l, c) <= 1 + 1e-9;
  return l;
}

// O lançamento que dá, quando o ideal passa do limite das pernas: mesma direção, mais fraco
function lancamentoPossivel(l, c) {
  let { x, y } = l;
  y = limitar(y, l.minimoY, c.impulsoVertical);
  const v = Math.hypot(x, y);
  if (v > c.velocidadeMergulho) {
    x *= c.velocidadeMergulho / v;
    y *= c.velocidadeMergulho / v;
  }
  return { x, y };
}

// Quanto o lançamento passa do que as pernas dão (1 = no limite; mais que 1 = não dá)
function excesso(l, c) {
  const descida = l.y < l.minimoY ? 1 + (l.minimoY - l.y) / c.velocidadeMergulho : 0;
  return Math.max(Math.hypot(l.x, l.y) / c.velocidadeMergulho, l.y / c.impulsoVertical, descida);
}

// De pé, com os pés no chão, o corpo vai de lado no ritmo dos passos; para baixo, dobrando as pernas
const limitesDePe = (c) => ({ vx: c.velocidadeLateral, ax: c.aceleracaoLateral * 1.5, vy: 3, ay: 15 });

// Tempo (s) para o corpo ir de C0 a Cf, saindo com velocidade v0. Se nenhum mergulho chega lá
// (longe e alto demais para um voo só), devolve o tempo do mergulho que chega mais perto: até lá ele
// ainda tem tempo de dar uns passos para o lado antes de se jogar.
function tempoNecessario(plano, c, v0) {
  if (plano.modo === 'apoio') {
    // De pé (um passo para o lado, agacha ou estica o corpo): acelera e freia em cada direção
    const t = (d, v, a) => (d <= (v * v) / a ? 2 * Math.sqrt(d / a) : d / v + v / a);
    const { vx, ax, vy, ay } = limitesDePe(c);
    return Math.max(MAOS_PRONTAS, t(Math.abs(plano.Cf.x - plano.C0.x), vx, ax), t(Math.abs(plano.Cf.y - plano.C0.y), vy, ay));
  }
  // (um mergulho voa no máximo VOO_MAX: para ir mais longe, antes ele dá passos para o lado)
  let melhor = { T: plano.preparo + VOO_MAX, e: Infinity };
  for (let T = plano.preparo * 0.6; T <= plano.preparo + VOO_MAX + 1e-9; T += 0.01) {
    const e = excesso(lancamento(plano.C0, plano.Cf, T, v0, plano.preparo, c), c);
    if (e <= 1 + 1e-9) return Math.max(0.1, T);
    if (e < melhor.e) melhor = { T, e };
  }
  return Math.max(0.1, melhor.T);
}

// Rolagem do corpo para as mãos irem na direção D (+ = tomba para a direita de quem cobra)
function rolagemPara(D, deslocamentoLateral) {
  if (Math.abs(D.x) < 1e-3) return 0;
  const inclinacao = Math.atan2(Math.abs(D.x), Math.abs(D.y)) * (D.y < 0 ? 1.15 : 1);
  const quanto = limitar(deslocamentoLateral / 0.6, 0.25, 1); // sem sair do lugar, tomba pouco
  return Math.sign(D.x) * Math.min(ROLAGEM_MAX, inclinacao * quanto);
}

// Para onde o centro do corpo precisa ir para as mãos chegarem no alvo.
// Bola perto do corpo, até a altura da cabeça: ele põe o corpo atrás dela, de pé (agacha se for baixa).
// Bola longe (ou alta): estica o corpo na direção dela até as mãos alcançarem; de lado é o mergulho,
// para cima é o pulo. Devolve também o modo: 'voo' (sai do chão) ou 'apoio' (com os pés no chão).
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

  if (Math.abs(dx) < 0.7 && T.y > 0.3 && T.y < ALTURA_SEM_PULO) {
    // Defesa sem mergulho: corpo atrás da bola, mãos na frente
    Cf = { x: T.x, y: limitar(T.y - 0.25, Math.min(C0.y, centroMinimo(0) + 0.08), topo) };
    if (Cf.y < C0.y && T.y > 0.75) Cf.y = C0.y; // bola na altura do corpo: fica de pé
  } else {
    // Bola longe ou alta: estica o corpo (e pula) na direção dela, só o que precisa para as mãos chegarem
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
  // Voa (mergulho de lado ou pulo) ou fica apoiado nos pés (agacha, dá um passo e põe as mãos)
  const modo = lado !== 0 || Cf.y > C0.y + 0.1 ? 'voo' : 'apoio';
  return {
    T,
    C0,
    Cf,
    D,
    modo,
    dist: Math.hypot(Cf.x - C0.x, Cf.y - C0.y),
    rolagem: rolagemPara(D, Math.abs(lateral)),
    lado,
    alto: limitar((T.y - 0.4) / 1.5, 0, 1),
    preparo: c.preparoMergulho + c.preparoRasteiro * baixo,
  };
}

// Decide ir: calcula o lançamento para o corpo chegar no ponto quando a bola chegar (tChegada).
// Sem tempo para isso (decidiu tarde), as pernas lançam o máximo que dão e ele chega atrasado.
function comecarMergulho(g, plano, t, c, tChegada) {
  const v0 = { x: g.vx, y: 0 };
  const tp = plano.preparo;
  // Não dá para chegar antes de terminar o impulso, nem voar mais que VOO_MAX
  let duracao = limitar(tChegada - t, tp + 0.02, tp + VOO_MAX);
  let ideal = lancamento(plano.C0, plano.Cf, duracao, v0, tp, c);
  if (!ideal.possivel && plano.modo === 'voo') {
    // Decidiu tarde: faz o mergulho mais rápido que as pernas dão até o ponto (chega atrasado)
    duracao = Math.max(duracao, tempoNecessario(plano, c, v0));
    ideal = lancamento(plano.C0, plano.Cf, duracao, v0, tp, c);
  }
  const vL = ideal.possivel ? { x: ideal.x, y: ideal.y } : lancamentoPossivel(ideal, c);
  g.mergulho = {
    ...plano,                 // T = onde as mãos vão (ajustado no ar), Cf = onde o corpo vai
    T: { ...plano.T },
    alvoLido: { ...plano.T }, // onde ele achou que a bola ia chegar quando decidiu ir
    t0: t,                    // instante em que decidiu
    duracao,                  // s até a bola chegar, quando decidiu
    v0,
    vL,                       // velocidade de saída do chão
    CL: {                     // onde o corpo sai do chão
      x: plano.C0.x + ((v0.x + vL.x) / 2) * tp,
      y: plano.C0.y + ((v0.y + vL.y) / 2) * tp,
    },
    atrasado: duracao > tChegada - t + 1e-6 || !ideal.possivel, // chega depois da bola
    v: { x: v0.x, y: v0.y },  // velocidade do corpo agora
    caindo: false,
    queda: 0,                 // 0 a 1: braços voltando a acompanhar o corpo depois do lance
    pouso: null,              // { tau, x, vx }: quando e onde tocou o chão
    noChao: false,
  };
  g.vx = 0;
  g.emDuvida = false;
  g.estado = 'mergulhando';
  g.lado = plano.lado;
  g.alto = plano.alto;
}

// ---------- Atualização ----------

// Chamar a cada quadro (ou a cada passo da física). Devolve g.pose.
//   opcoes.chutou: a bola já foi chutada. opcoes.tempoDesdeChute: segundos desde o chute.
//   opcoes.tempoAteChute: na corrida do cobrador, segundos até o pé pegar na bola (se souber):
//     ele se firma e dá o passinho de prontidão, caindo na base bem na hora do chute.
//   opcoes.cfgFisica: config da física para simular a bola (padrão: cfg, ou o CONFIG do jogo).
//   opcoes.aleatorio: função de 0 a 1 para o erro de leitura (padrão: Math.random).
// Crie um goleiro novo (criarGoleiro) a cada cobrança.
export function atualizarGoleiro(g, bola, dt, cfg = CONFIG, opcoes = {}) {
  const c = lerCfg(cfg);
  const fis = lerFisica(cfg, opcoes);
  const aleatorio = opcoes.aleatorio || Math.random;
  const meia = ((cfg && cfg.golLargura) ?? 7.32) / 2;
  const alturaGol = (cfg && cfg.golAltura) ?? 2.44;
  const r = (cfg && cfg.raioBola) ?? 0.11;
  const cxAntes = g.cx;
  const cyAntes = g.cy;
  g.relogio += dt;

  if (!opcoes.chutou) {
    antesDoChute(g, bola, dt, c, opcoes.tempoAteChute);
    terminarQuadro(g, c, dt, cxAntes, cyAntes);
    return g.pose;
  }

  g.tempo = opcoes.tempoDesdeChute ?? g.tempo + dt;
  const t = g.tempo;
  g.prontidao = 1;

  // Logo depois do chute: a bola vai passar pela barreira? (tapa a visão e atrasa a reação)
  if (!g.analisado && bola.vel.z < -0.3) {
    g.analisado = true;
    g.tapada = passaPelaBarreira(bola, g.barreira, fis);
    g.reacao = c.reflexo + (g.tapada ? c.atrasoBarreira : 0);
  }
  // Não viu a corrida: o passinho de prontidão vem agora, logo depois do chute
  if (!g.passinho) g.passinho = { depois: true, t0: Math.max(0, t - dt) };
  g.pulinho = g.passinho.depois && !g.mergulho ? PULINHO * sino((t - g.passinho.t0) / PULINHO_DURACAO) : 0;

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

  // Rebote fraco perto dele depois de uma defesa: já no chão (ou de pé), ele cai em cima da bola e a
  // puxa para o peito (a bola vai até as mãos aos poucos, sem pular)
  const noChao = !g.mergulho || g.mergulho.noChao || g.mergulho.modo === 'apoio';
  if (!g.segurando && noChao && Number.isFinite(g.ultimoContato) && t - g.ultimoContato > 0.25) {
    const rapidez = Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z);
    const longe = Math.hypot(bola.pos.x - g.cx, bola.pos.y - g.cy, bola.pos.z - g.z);
    if (rapidez < 5 && longe < c.alcance + 0.3 && bola.pos.z > r + 0.05) {
      encaixar(g, bola.pos, ABRACO + 0.25 * longe);
      g.estado = 'segurou';
      bola.eventos.push({ tipo: 'defesa', modo: 'segurou', parte: 'rebote', impacto: rapidez, x: bola.pos.x, y: bola.pos.y, z: bola.pos.z });
    }
  }

  if (g.mergulho) {
    // Continua olhando a bola: no ar, as mãos ainda se ajeitam um pouco
    if (!g.segurando && t >= g.proximaLeitura && bola.pos.z > g.z) {
      lerBola(g, bola, c, fis);
      g.proximaLeitura = t + c.intervaloLeitura;
    }
    avancarMergulho(g, bola, dt, c, t);
  } else if (g.segurando) {
    // Segurou de pé: firma o corpo e puxa a bola para o peito
    frear(g, dt, c);
    g.bracos = Math.min(1, g.bracos + dt * 6);
  } else if (t >= g.reacao) {
    if (!g.reagiu) {
      // Reação: sorteia o erro de leitura desta cobrança (o mesmo nas releituras)
      // e quanto da curva ele vai enxergar
      g.reagiu = true;
      const n = sortearNormal(aleatorio);
      g.erro = { x: limitar(n.a, -2.2, 2.2), y: limitar(n.b, -2.2, 2.2) };
      g.percepcao = limitar(c.percepcaoCurva + c.variacaoPercepcao * (2 * aleatorio() - 1), 0, 1);
      g.proximaLeitura = t;
      g.estado = 'posicionando';
    }
    let leuAgora = false;
    if (t >= g.proximaLeitura) {
      lerBola(g, bola, c, fis);
      g.proximaLeitura = t + c.intervaloLeitura;
      g.esperandoReleitura = false;
      leuAgora = true;
    }
    posicionar(g, bola, dt, c, fis, t, meia, alturaGol, leuAgora);
  } else {
    // Tempo de reação: ainda não sabe para onde a bola vai. Firma na base (freia o passo que vinha)
    frear(g, dt, c);
  }

  if (g.segurando && g.encaixe) g.bolaPresa = posicaoDaBolaPresa(g, eixos(g), r);
  terminarQuadro(g, c, dt, cxAntes, cyAntes);
  return g.pose;
}

// Antes do chute: dá o passo para o lado aberto, balança de leve o peso de uma perna para a outra e,
// na corrida do cobrador, se firma (para de balançar) e dá o passinho de prontidão
function antesDoChute(g, bola, dt, c, tempoAteChute) {
  g.tempo = 0;
  const sabe = Number.isFinite(tempoAteChute);
  const firma = sabe ? 1 - suave((tempoAteChute - PULINHO_DURACAO) / (PRONTIDAO - PULINHO_DURACAO)) : 0;
  g.prontidao = firma;
  // Passo para o lado que a barreira não cobre (na corrida, termina depressa o que faltar)
  if (g.relogio >= PASSO_INICIO || sabe) {
    const v = firma > 0 ? c.velocidadeLateral : PASSO_VELOCIDADE;
    const a = c.aceleracaoLateral * 0.6;
    const dx = g.base.x - g.ancora;
    const desejada = Math.sign(dx) * Math.min(v, Math.sqrt(2 * a * Math.abs(dx)));
    g.vx += limitar(desejada - g.vx, -a * dt, a * dt);
    g.ancora += g.vx * dt;
    if (Math.abs(g.base.x - g.ancora) < 2e-3 && Math.abs(g.vx) < 0.1) {
      g.ancora = g.base.x;
      g.vx = 0;
    }
  }
  g.cx = g.ancora + 0.05 * Math.sin(g.relogio * 1.7) * (1 - firma);
  g.cy = CENTRO_PRONTO + 0.015 * Math.sin(g.relogio * 3.4) * (1 - firma);
  // Passinho: sobe um pouco e cai na base no instante do chute
  if (sabe && tempoAteChute <= PULINHO_DURACAO && !g.passinho) g.passinho = { depois: false, t0: -tempoAteChute };
  g.pulinho = g.passinho && sabe ? PULINHO * sino(1 - tempoAteChute / PULINHO_DURACAO) : 0;
  g.rotacaoY = Math.atan2(bola.pos.x - g.cx, Math.max(0.5, bola.pos.z - g.z));
  g.estado = 'pronto';
  g.bracos = 0.25 + 0.1 * firma;
}

// Freia os passos e volta para a altura de espera
function frear(g, dt, c) {
  g.vx -= limitar(g.vx, -c.aceleracaoLateral * dt, c.aceleracaoLateral * dt);
  g.cx += g.vx * dt;
  g.cy += (CENTRO_PRONTO - g.cy) * Math.min(1, dt * 10);
}

// Antes de mergulhar: passos para o lado e decide a hora de mergulhar.
// Hora de ir = o tempo até a bola chegar mal dá para o mergulho até onde ele leu. Aí ele dá uma
// última olhada e se joga; mas se a leitura estiver incerta (curva forte, bola dançando, chute de
// longe) e ainda der tempo, espera a próxima olhada: assim não se joga longe da bola só porque a
// primeira impressão foi ruim (e, esperando, chega mais tarde no canto).
function posicionar(g, bola, dt, c, fis, t, meia, alturaGol, leuAgora) {
  const vaiNoGol = (L) => L && Math.abs(L.x) < meia + MARGEM_GOL && L.y < alturaGol + MARGEM_GOL;
  const horaDeIr = (L, plano) => L.t - t <= tempoNecessario(plano, c, { x: g.vx, y: 0 }) + c.margemMergulho;
  // Dá para esperar a próxima olhada e ainda sobrar tempo para um mergulho?
  const daParaEsperar = (L) => L.t - t - c.intervaloLeitura > ULTIMA_OLHADA;
  let L = g.leitura;
  if (vaiNoGol(L) && !g.esperandoReleitura) {
    let plano = planejar(g, L, c, alturaGol);
    if (horaDeIr(L, plano)) {
      if (!leuAgora && (!g.emDuvida || !daParaEsperar(L))) {
        // Uma última olhada na bola antes de se jogar (conta como uma releitura)
        lerBola(g, bola, c, fis);
        g.proximaLeitura = t + c.intervaloLeitura;
        leuAgora = true;
        L = g.leitura;
        plano = vaiNoGol(L) ? planejar(g, L, c, alturaGol) : null;
      }
      if (plano && leuAgora) {
        if (L.incerteza <= c.confianca || !daParaEsperar(L)) {
          comecarMergulho(g, plano, t, c, L.t);
          return;
        }
        g.emDuvida = true;
      }
    }
  }
  // Passos laterais: acelera até a velocidade lateral e freia para parar no lugar.
  // Na dúvida (leitura incerta) ele vai com cautela, mais devagar, esperando ver melhor a bola.
  L = g.leitura;
  const xAlvo = L ? limitar(L.x, -(meia - 0.4), meia - 0.4) : g.cx;
  const dx = xAlvo - g.cx;
  const cautela = L ? limitar(c.confianca / Math.max(1e-3, L.incerteza), 0.35, 1) : 1;
  // Longe da bola, troca os passos de lado pela corrida cruzando as pernas (mais rápida)
  const corrida = limitar((Math.abs(dx) - 1) / 1, 0, 1);
  const maxima = c.velocidadeLateral + (c.velocidadeCorrida - c.velocidadeLateral) * corrida;
  const desejada = Math.sign(dx) * Math.min(maxima * cautela, Math.sqrt(2 * c.aceleracaoLateral * Math.abs(dx)));
  g.vx += limitar(desejada - g.vx, -c.aceleracaoLateral * dt, c.aceleracaoLateral * dt);
  g.cx += g.vx * dt;
  g.cy += (CENTRO_PRONTO - g.cy) * Math.min(1, dt * 10);
  g.bracos += (0.35 - g.bracos) * Math.min(1, dt * 6);
}

// Mergulho de verdade (de lado, tombando bastante): termina deitado no chão
const deitaDeLado = (m) => m.lado !== 0 && Math.abs(m.rolagem) > 0.5;

// Durante e depois do mergulho: impulso, voo em parábola, queda e escorregão no chão
function avancarMergulho(g, bola, dt, c, t) {
  const m = g.mergulho;
  const tocou = Number.isFinite(g.ultimoContato);
  const tau = t - m.t0;
  const bolaPassou = g.segurando || tocou || bola.pos.z < g.z - 0.25 || tau > m.duracao + 0.15;
  const deLado = deitaDeLado(m);
  if (tau >= m.duracao || bolaPassou) m.caindo = true;

  if (m.modo === 'voo') {
    const tp = m.preparo;
    // Chão: deitado de lado, o corpo encosta no gramado; no pulo (ou no mergulho curto), cai de pé
    const piso = deLado ? centroMinimo(g.rolagem) : Math.min(CENTRO_PRONTO, m.Cf.y);
    if (tau < tp) {
      // Impulso: as pernas empurram (aceleração constante de v0 até vL)
      const ax = (m.vL.x - m.v0.x) / tp;
      const ay = (m.vL.y - m.v0.y) / tp;
      g.cx = m.C0.x + m.v0.x * tau + 0.5 * ax * tau * tau;
      g.cy = Math.max(piso, m.C0.y + m.v0.y * tau + 0.5 * ay * tau * tau);
      m.v = { x: m.v0.x + ax * tau, y: m.v0.y + ay * tau };
    } else if (!m.pouso) {
      // No ar: parábola
      const s = tau - tp;
      const y = m.CL.y + m.vL.y * s - 0.5 * GRAVIDADE * s * s;
      g.cx = m.CL.x + m.vL.x * s;
      g.cy = Math.max(piso, y);
      m.v = { x: m.vL.x, y: m.vL.y - GRAVIDADE * s };
      // Tocou o chão descendo (de lado, só depois do lance: antes disso ainda está se esticando)
      if (y <= piso && m.v.y < 0 && (m.caindo || !deLado)) {
        m.pouso = { tau, x: g.cx, vx: m.v.x };
        m.v = { x: m.v.x, y: 0 };
      }
    } else {
      // No chão: escorrega de lado até parar
      const s = tau - m.pouso.tau;
      const freio = Math.exp(-ESCORREGA * s);
      g.cx = m.pouso.x + (m.pouso.vx * (1 - freio)) / ESCORREGA;
      g.cy = piso;
      m.v = { x: m.pouso.vx * freio, y: 0 };
      m.noChao = true;
    }
    g.progresso = Math.min(1, tau / Math.max(1e-3, m.duracao));
  } else {
    // Apoiado nos pés: o corpo vai até o ponto acelerando e freando (agacha, dá um passo).
    // Com os pés no chão ele ainda acompanha a bola: o ponto anda junto com o que ele vê.
    if (!bolaPassou) {
      m.Cf = {
        x: m.T.x,
        y: limitar(m.T.y - 0.25, Math.min(m.C0.y, centroMinimo(0) + 0.08), c.alturaMaxima - c.alcance),
      };
      if (m.Cf.y < m.C0.y && m.T.y > 0.75) m.Cf.y = m.C0.y;
    }
    const { vx, ax, vy, ay } = limitesDePe(c);
    const dX = m.Cf.x - g.cx;
    const dY = m.Cf.y - g.cy;
    const vxDesejada = Math.sign(dX) * Math.min(vx, Math.sqrt(2 * ax * Math.abs(dX)));
    const vyDesejada = Math.sign(dY) * Math.min(vy, Math.sqrt(2 * ay * Math.abs(dY)));
    m.v.x += limitar(vxDesejada - m.v.x, -ax * dt, ax * dt);
    m.v.y += limitar(vyDesejada - m.v.y, -ay * dt, ay * dt);
    g.cx += m.v.x * dt;
    g.cy = Math.max(centroMinimo(0), g.cy + m.v.y * dt);
    const falta = Math.hypot(m.Cf.x - g.cx, m.Cf.y - g.cy);
    g.progresso = m.dist > 1e-3 ? limitar(1 - falta / m.dist, 0, 1) : 1;
    if (falta < 0.03) m.noChao = true;
  }
  if (m.caindo && (bolaPassou || g.segurando)) m.queda = Math.min(1, m.queda + dt / 0.3);
  if (m.noChao && bolaPassou && !g.segurando) g.estado = 'caido';

  // As mãos ainda se ajeitam no ar, vendo a bola chegar (devagar: é só o braço)
  const L = g.leitura;
  if (L && !bolaPassou) {
    const ax = limitar(L.x, -(g.meiaLargura + 0.05), g.meiaLargura + 0.05) - m.T.x;
    const ay = limitar(L.y, 0.12, c.alturaMaxima + 0.2) - m.T.y;
    const d = Math.hypot(ax, ay);
    const rapidez = c.ajusteMaos * (m.modo === 'apoio' ? 2 : 1); // de pé, com o corpo firme, as mãos são mais rápidas
    const k = d > 1e-6 ? Math.min(1, (rapidez * dt) / d) : 0;
    m.T = { x: m.T.x + ax * k, y: m.T.y + ay * k };
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

// Começa a segurar a bola que está em p: ela vai, junto com as mãos, até o peito em `dur` segundos
// (sem pular de uma vez para as mãos)
function encaixar(g, p, dur) {
  g.segurando = true;
  g.encaixe = { t0: g.tempo, dur, rel0: { x: p.x - g.cx, y: p.y - g.cy, z: p.z - g.z } };
  g.bolaPresa = { x: p.x, y: p.y, z: p.z };
}

// Onde está a bola presa: sai de onde ele pegou (acompanhando o corpo) e vai até a frente do peito
function posicaoDaBolaPresa(g, { F, U }, r) {
  const e = g.encaixe;
  const k = suave((g.tempo - e.t0) / Math.max(1e-3, e.dur));
  const peito = {
    x: U.x * ABRACO_ALTURA + F.x * ABRACO_FRENTE,
    y: U.y * ABRACO_ALTURA,
    z: U.z * ABRACO_ALTURA + F.z * ABRACO_FRENTE,
  };
  const rel = misturar(e.rel0, peito, k);
  return { x: g.cx + rel.x, y: Math.max(r, g.cy + rel.y), z: Math.max(r + 0.05, g.z + rel.z) };
}

// Mãos segurando a bola no ponto P: uma de cada lado, um pouco atrás dela
function maosNaBola(P, { F, U, O }) {
  return [-1, 1].map((s) => ({
    x: P.x - F.x * FRENTE_BOLA + O.x * 0.15 * s - U.x * 0.03,
    y: P.y + O.y * 0.15 * s - U.y * 0.03,
    z: P.z - F.z * FRENTE_BOLA + O.z * 0.15 * s - U.z * 0.03,
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
    // ângulo dos braços aos poucos, pelo caminho mais curto
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
  if (g.segurando && g.bolaPresa && g.encaixe) {
    // Encaixou: as mãos vão logo para a bola e a levam junto até o peito
    const k = suave((g.tempo - g.encaixe.t0) / MAOS_NA_BOLA);
    const naBola = maosNaBola(g.bolaPresa, eixo);
    const lado = (p) => (p.x - C.x) * L.x + (p.z - C.z) * L.z;
    if (lado(naBola[0]) > lado(naBola[1])) naBola.reverse();
    maos = maos.map((p, i) => misturar(p, naBola[i], k));
  }
  // Nenhuma mão entra no gramado
  return maos.map((p) => ({ x: p.x, y: Math.max(0.06, p.y), z: p.z }));
}

function montarPose(g, c) {
  const { U } = eixos(g);
  const maos = g.maos || calcularMaos(g, c);
  const pulo = g.pulinho || 0; // passinho de prontidão (só no desenho: 3 a 4 cm)
  return {
    x: g.cx - U.x * CENTRO,          // centro do quadril
    y: g.cy - U.y * CENTRO + pulo,
    z: g.z - U.z * CENTRO,
    rotacaoY: g.rotacaoY,             // rad, como no Three.js: 0 = olhando para +z (para quem cobra)
    rolagem: g.rolagem,               // rad, + = tombando para a direita de quem cobra
    progressoMergulho: g.progresso,   // 0 a 1
    lado: g.lado,                     // -1 esquerda, 0 no meio (pulo/agachado), +1 direita de quem cobra
    alto: g.alto,                     // 0 = bola baixa (rasteiro), 1 = alta
    bracos: g.bracos,                 // 0 = soltos, ~0,3 = prontos na frente do peito, 1 = esticados
    estado: g.estado,                 // 'pronto' | 'posicionando' | 'mergulhando' | 'segurou' | 'caido'
    prontidao: g.prontidao,           // 0 = relaxado, 1 = firme na base (corrida do cobrador e chute)
    maos: {                           // mãos do goleiro (a direita dele fica à esquerda de quem cobra)
      direita: { ...maos[0], y: maos[0].y + pulo },
      esquerda: { ...maos[1], y: maos[1].y + pulo },
    },
    centro: { x: g.cx, y: g.cy + pulo, z: g.z },
  };
}

function terminarQuadro(g, c, dt, cxAntes, cyAntes) {
  if (dt > 0) g.velCorpo = { x: (g.cx - cxAntes) / dt, y: (g.cy - cyAntes) / dt };
  g.maos = calcularMaos(g, c);
  g.pose = montarPose(g, c);
}

// Partes do corpo: esferas e cápsulas (braços, pernas e o tronco atravessado).
// [{ parte: 'mao' | 'braco' | 'tronco' | 'cabeca' | 'perna', x, y, z, r, ate?: {x, y, z} }]
// Com `ate`, a parte é uma cápsula de (x, y, z) até `ate`. Servem para a colisão e para desenhar
// o "esqueleto" ao depurar. Nada fica abaixo do chão: perto dele as pernas dobram.
export function partesDoGoleiro(g) {
  const eixo = eixos(g);
  const noChao = (p, r) => ({ x: p.x, y: Math.max(r, p.y), z: p.z });
  const lista = PARTES.map(({ parte, d, meia, r }) => {
    if (!meia) return { parte, ...noChao(noCorpo(g, eixo, d), r), r };
    return { parte, ...noChao(noCorpo(g, eixo, d, -meia), r), ate: noChao(noCorpo(g, eixo, d, meia), r), r };
  });
  // Pernas (de pé, abertas; deitado, a de baixo esticada e a de cima aberta e dobrada)
  const deitado = limitar(Math.abs(g.rolagem), 0, 1);
  const embaixo = Math.sign(g.rolagem) || 1; // o lado para onde ele tomba fica embaixo
  const ponto = (a, b, lado) => {
    const [d, fora, frente] = a.map((v, k) => v + (b[k] - v) * deitado);
    return noCorpo(g, eixo, d, lado * fora, frente);
  };
  for (const lado of [-1, 1]) {
    const deitada = lado === embaixo ? PERNAS.deBaixo : PERNAS.deCima;
    const [dq, fq, frq] = PERNAS.quadril;
    const quadril = noCorpo(g, eixo, dq, lado * fq, frq);
    const joelho = ponto(PERNAS.dePe.joelho, deitada.joelho, lado);
    const pe = ponto(PERNAS.dePe.pe, deitada.pe, lado);
    lista.push({ parte: 'perna', ...noChao(quadril, PERNAS.rCoxa), ate: noChao(joelho, PERNAS.rCoxa), r: PERNAS.rCoxa });
    lista.push({ parte: 'perna', ...noChao(joelho, PERNAS.rCanela), ate: noChao(pe, PERNAS.rCanela), r: PERNAS.rCanela });
  }
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

// Quanto cada parte devolve da batida: a luva firme devolve a restituição cheia; o corpo amortece
const DEVOLVE = { mao: 1, braco: 0.85, tronco: 0.75, cabeca: 0.9, perna: 0.9 };

// Colisão da bola com o goleiro. Chamar depois de cada passo(bola, ...).
// Bola devagar (< velocidadeSegura) nas mãos ou no peito, perto do centro do corpo: ele SEGURA
// (a bola fica onde ele pegou e vai, junto com as mãos, até o peito; e cai junto com ele). Senão
// ESPALMA: a bola rebate (restituicao) e a mão empurra para o lado ou por cima. Registra
// bola.eventos.push({ tipo: 'defesa', modo, parte, impacto, x, y, z }), com modo 'segurou' | 'espalmou'
// e parte 'mao' | 'braco' | 'tronco' | 'cabeca' | 'perna' (no rebote que ele agarra depois: 'rebote').
// Os toques seguidos de uma mesma espalmada (a outra mão, que ainda vem) contam como um só evento.
export function colidirBolaGoleiro(bola, g, cfg = CONFIG) {
  const c = lerCfg(cfg);
  const r = (cfg && cfg.raioBola) ?? 0.11;
  const { pos, vel, giro } = bola;

  if (g.segurando) {
    // Bola presa nas mãos (a posição anda junto com o goleiro, em atualizarGoleiro)
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
      const kk = (melhor.parte === 'mao' ? 1 : 0.5) * (1 - 0.7 * esticado);
      nx += F.x * kk;
      nz += F.z * kk;
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
    // (logo depois de espalmar não dá: é a outra mão, que ainda vem no mergulho, batendo de novo)
    const dCentro = Math.hypot(p.x - g.cx, p.y - g.cy); // no plano do corpo: o quanto ele precisou esticar
    const qualidade = limitar(1.6 - dCentro / c.alcance, 0.35, 1);
    const deFrente = impacto > 0.5 * rapidez;
    const espalmouAgora = g.tempo - g.ultimoEspalmo < SEM_SEGURAR;
    // (perto do peito, os antebraços fazem a "cesta" junto com as mãos)
    const cesta = melhor.parte === 'braco' && dCentro < 0.45;
    const podeSegurar = (melhor.parte === 'mao' || melhor.parte === 'tronco' || cesta) && deFrente && !espalmouAgora;
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

    // Espalma ou rebate: parte normal volta (restituição; o corpo amortece mais que a luva), a de
    // raspão perde força (atrito); a mão ainda empurra a bola para longe
    const atrito = comMao ? 0.6 : 0.35;
    const tx = rx - vn * nx;
    const ty = ry - vn * ny;
    const tz = rz - vn * nz;
    const volta = impacto * c.restituicao * (DEVOLVE[melhor.parte] ?? 1) + (comMao ? c.empurrao * (1 - 0.6 * esticado) : 0);
    vel.x = vp.x + tx * atrito + volta * nx;
    vel.y = vp.y + ty * atrito + volta * ny;
    vel.z = vp.z + tz * atrito + volta * nz;
    // O raspão na luva ou no corpo faz a bola girar um pouco; o efeito de antes quase some
    giro.x *= 0.3;
    giro.y *= 0.3;
    giro.z *= 0.3;
    bola.danca = null;
    if ('curvaTardia' in bola) bola.curvaTardia = null;
    if (impacto > 0.5) {
      if (!espalmouAgora) {
        bola.eventos.push({ tipo: 'defesa', modo: 'espalmou', parte: melhor.parte, impacto, x: pos.x, y: pos.y, z: pos.z });
      }
      g.ultimoContato = g.tempo;
      g.ultimoEspalmo = g.tempo;
    }
  }

  g._anterior = { x: pos.x, y: pos.y, z: pos.z };
  g._bola = bola;
  return tocou;
}
