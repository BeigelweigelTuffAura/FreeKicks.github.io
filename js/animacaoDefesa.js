// Animação da defesa: dá vida ao goleiro e à barreira por cima da lógica (js/goleiro.js e js/barreira.js).
// A lógica decide onde o corpo está e onde ficam as mãos que tocam na bola; aqui é só o desenho:
// pés plantados de verdade, passos para o lado, impulso e mergulho, queda, levantar, encaixe,
// espalmada, comemoração, e a barreira que se ajeita, pula e sente a bolada. Nada aqui muda a lógica.
//
// Uso (chamar a cada quadro, em todas as fases do jogo):
//   const goleiroAnim = criarAnimadorGoleiro(personagem);      // boneco de js/jogadores.js
//   goleiroAnim.atualizar(goleiro, t, dt, { fase, tempoDesdeChute, bola });
//   goleiroAnim.reiniciar();                                     // a cada cobrança nova
//   const barreiraAnim = criarAnimadorBarreira(personagens);    // um boneco por jogador da barreira
//   barreiraAnim.atualizar(barreira, t, dt, { fase, tempoDesdeChute, bola });
// fase: 'pronto' | 'carregando' | 'corrida' (cobrador correndo para a bola) | 'voo' | 'fim'
// t: relógio que só cresce (s), usado no balanço; dt: passo do quadro (s, já com a câmera lenta)
// tempoDesdeChute: s desde o pé na bola (na corrida, negativo: quanto falta; null se não souber)
// bola: { pos, vel } da física
//
// Eixos: x = direita de quem cobra, y = para cima, z = do gol para quem cobra. Os bonecos olham para +z
// local e a esquerda do boneco fica em +x local. Metros, segundos, radianos.

import * as THREE from 'three';

// ---------- Utilidades ----------

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const suave = (u) => {
  const x = limitar(u, 0, 1);
  return x * x * (3 - 2 * x);
};
const misturar = (a, b, k) => a + (b - a) * k;
// Aproxima do alvo como uma mola amortecida simples (rapidez em 1/s; independe do passo do quadro)
const aproximar = (atual, alvo, rapidez, dt) => atual + (alvo - atual) * (1 - Math.exp(-rapidez * dt));
// Sobe e desce: 0 → 1 → 0 com u de 0 a 1
const sino = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
// Entra rápido, segura e sai: 0 → 1 (em 'entra') … 1 (até 'segura') → 0 (em 1)
const envelope = (u, entra, segura) => {
  if (u <= 0 || u >= 1) return 0;
  if (u < entra) return suave(u / entra);
  if (u < segura) return 1;
  return 1 - suave((u - segura) / (1 - segura));
};
const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // de −π a π

// Sorteio com semente (mulberry32): a mesma semente dá sempre a mesma sequência
function criarSorteio(semente) {
  let a = (semente * 2654435761) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Poses (o mesmo formato de js/jogadores.js) ----------

const CAMPOS = [
  ['tronco', 'frente'], ['tronco', 'lado'], ['tronco', 'giro'],
  ['cabeca', 'frente'], ['cabeca', 'giro'],
  ['bracoE', 'frente'], ['bracoE', 'lado'], ['bracoE', 'cotovelo'],
  ['bracoD', 'frente'], ['bracoD', 'lado'], ['bracoD', 'cotovelo'],
  ['pernaE', 'frente'], ['pernaE', 'lado'], ['pernaE', 'joelho'], ['pernaE', 'tornozelo'],
  ['pernaD', 'frente'], ['pernaD', 'lado'], ['pernaD', 'joelho'], ['pernaD', 'tornozelo'],
  ['quadril', 'frente'], ['quadril', 'lado'], ['quadril', 'giro'],
];
const SOLTOS = ['agachar', 'apoio', 'pulo'];
const PADRAO_SOLTOS = { agachar: 0, apoio: 1, pulo: 0 };

function valor(p, grupo, chave) {
  const g = p && p[grupo];
  const v = g && g[chave];
  if (typeof v === 'number') return v;
  return (grupo === 'bracoE' || grupo === 'bracoD') && chave === 'lado' ? 0.1 : 0;
}
const valorSolto = (p, c) => (p && typeof p[c] === 'number' ? p[c] : PADRAO_SOLTOS[c]);

// Pose completa (todos os campos), para ser reaproveitada quadro a quadro
function novaPose() {
  const p = { agachar: 0, apoio: 1, pulo: 0, maoE: { x: 0, y: 0, z: 0, peso: 0 }, maoD: { x: 0, y: 0, z: 0, peso: 0 } };
  for (const [g, c] of CAMPOS) {
    if (!p[g]) p[g] = {};
    p[g][c] = valor(null, g, c);
  }
  return p;
}

// destino = a + (b − a)·k (sem criar objetos; destino pode ser o próprio a). Mãos não entram.
function misturarPoses(destino, a, b, k) {
  for (let i = 0; i < CAMPOS.length; i++) {
    const g = CAMPOS[i][0];
    const c = CAMPOS[i][1];
    destino[g][c] = misturar(valor(a, g, c), valor(b, g, c), k);
  }
  for (let i = 0; i < SOLTOS.length; i++) {
    const c = SOLTOS[i];
    destino[c] = misturar(valorSolto(a, c), valorSolto(b, c), k);
  }
  return destino;
}
const copiarPose = (destino, a) => misturarPoses(destino, a, a, 0);

// Uma perna (frente, lado, joelho, tornozelo): destino = a + (b − a)·k
function misturarPerna(destino, a, b, k) {
  destino.frente = misturar(a.frente || 0, b.frente || 0, k);
  destino.lado = misturar(a.lado || 0, b.lado || 0, k);
  destino.joelho = misturar(a.joelho || 0, b.joelho || 0, k);
  destino.tornozelo = misturar(a.tornozelo || 0, b.tornozelo || 0, k);
}

// ---------- Medidas do boneco (as mesmas de js/jogadores.js, no espaço de cada junta) ----------

const SOLA = [[0, -0.07, -0.055], [0, -0.07, 0.1], [0, -0.062, 0.19]]; // calcanhar, meio e bico
const BICO = SOLA[2];
const PALMA_LUVA = new THREE.Vector3(0, -0.075, 0.008); // meio da palma da luva, no espaço do punho
const MAO_CENTRO = 0.065;

// Pontos que não podem entrar no gramado: [junta, x, y, z, raio da parte em volta do ponto]
const SONDAS = [
  ['tornozeloE', 0, -0.07, -0.055, 0], ['tornozeloE', 0, -0.07, 0.1, 0], ['tornozeloE', 0, -0.062, 0.19, 0],
  ['tornozeloD', 0, -0.07, -0.055, 0], ['tornozeloD', 0, -0.07, 0.1, 0], ['tornozeloD', 0, -0.062, 0.19, 0],
  ['joelhoE', 0, 0, 0, 0.055], ['joelhoD', 0, 0, 0, 0.055],
  ['pernaE', 0, 0, 0, 0.085], ['pernaD', 0, 0, 0, 0.085],
  ['quadril', 0, 0, 0, 0.1],
  ['quadril', 0.16, -0.05, 0, 0.03], ['quadril', -0.16, -0.05, 0, 0.03],
  ['quadril', 0, -0.1, 0.1, 0.03], ['quadril', 0, -0.1, -0.11, 0.03],
  ['tronco', 0.17, 0.12, 0, 0.02], ['tronco', -0.17, 0.12, 0, 0.02],
  ['tronco', 0.18, 0.32, 0, 0.02], ['tronco', -0.18, 0.32, 0, 0.02],
  ['tronco', 0, 0.22, 0.12, 0.02], ['tronco', 0, 0.22, -0.12, 0.02],
  ['ombroE', 0, 0, 0, 0.06], ['ombroD', 0, 0, 0, 0.06],
  ['cabeca', 0, 0.19, 0, 0.115],
];
// As que contam na regra "nenhum pé, joelho ou quadril abaixo do chão" (o ponto em si, sem raio)
const PONTOS_REGRA = new Set(['tornozeloE', 'tornozeloD', 'joelhoE', 'joelhoD', 'pernaE', 'pernaD', 'quadril']);

function montarSondas(J) {
  return SONDAS.map(([nome, x, y, z, r]) => ({
    junta: J[nome], nome, local: new THREE.Vector3(x, y, z), r,
    perna: nome.endsWith('E') && nome !== 'quadril' ? 'E' : nome.endsWith('D') ? 'D' : null,
    regra: PONTOS_REGRA.has(nome),
  }));
}

// Vetores e quaternions de rascunho (o módulo não cria objetos a cada quadro)
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'XZY');
const _m = new THREE.Matrix4();
const _um = new THREE.Vector3(1, 1, 1);
const EIXO_X = new THREE.Vector3(1, 0, 0);
const EIXO_Y = new THREE.Vector3(0, 1, 0);
const LADOS = ['D', 'E'];
const SINAIS = [1, -1];
const PASSOS_BUSCA = [0.24, 0.12, 0.06, 0.03, 0.015];

// ======================================================================
// GOLEIRO
// ======================================================================

// Poses do goleiro. As pernas destas poses só valem com o pé solto (no ar); com o pé no chão,
// quem manda é o IK (o pé fica plantado onde pisou).
const G_ESPERA = {
  tronco: { frente: 0.2 }, cabeca: { frente: -0.12 }, quadril: { frente: 0.06 },
  bracoE: { frente: 0.3, lado: 0.28, cotovelo: 0.8 }, bracoD: { frente: 0.3, lado: 0.28, cotovelo: 0.8 },
  pernaE: { frente: 0.2, lado: 0.14, joelho: 0.4, tornozelo: 0.1 }, pernaD: { frente: 0.2, lado: 0.14, joelho: 0.4, tornozelo: 0.1 },
  apoio: 0,
};
const G_PRONTO = {
  tronco: { frente: 0.24 }, cabeca: { frente: -0.22 }, quadril: { frente: 0.12 },
  bracoE: { frente: 0.6, lado: 0.35, cotovelo: 1.0 }, bracoD: { frente: 0.6, lado: 0.35, cotovelo: 1.0 },
  pernaE: { frente: 0.4, lado: 0.14, joelho: 0.85, tornozelo: 0.4 }, pernaD: { frente: 0.25, lado: 0.14, joelho: 0.65, tornozelo: 0.4 },
  apoio: 0,
};
// Pernas no ar do pulo no meio (joelhos encolhidos) e do mergulho
const PERNA_PULO_E = { frente: 0.5, lado: 0.1, joelho: 1.0, tornozelo: 0.5 };
const PERNA_PULO_D = { frente: 0.25, lado: 0.12, joelho: 0.75, tornozelo: 0.5 };
const PERNA_VOO_CIMA = { frente: 0.42, lado: 0.26, joelho: 0.6, tornozelo: 0.55 };   // a de longe, por cima
const PERNA_VOO_BAIXO = { frente: 0.02, lado: 0.04, joelho: 0.25, tornozelo: 0.65 }; // a do impulso, esticada
const PERNA_CHAO_CIMA = { frente: 0.45, lado: 0.1, joelho: 0.6, tornozelo: 0.35 };
const PERNA_CHAO_BAIXO = { frente: 0.8, lado: -0.04, joelho: 1.2, tornozelo: 0.35 };
const PERNA_ABRACO_CIMA = { frente: 1.05, lado: 0.06, joelho: 1.35, tornozelo: 0.3 };
const PERNA_ABRACO_BAIXO = { frente: 1.15, lado: -0.03, joelho: 1.6, tornozelo: 0.3 };
// Levantar do chão: de joelhos, um joelho levantado e de pé
// Ainda de lado, joelhos encolhidos para levantar (as mãos empurram o chão)
const G_ENCOLHIDO = {
  tronco: { frente: 0.4 }, cabeca: { frente: -0.1 }, quadril: { frente: 0.2 },
  bracoE: { frente: 0.9, lado: 0.3, cotovelo: 0.9 }, bracoD: { frente: 0.9, lado: 0.3, cotovelo: 0.9 },
  pernaE: { frente: 1.1, lado: 0.08, joelho: 1.7, tornozelo: 0.6 }, pernaD: { frente: 1.0, lado: 0.12, joelho: 1.6, tornozelo: 0.6 },
  apoio: 0,
};
const G_AJOELHADO = {
  tronco: { frente: 0.32 }, cabeca: { frente: -0.12 }, quadril: { frente: 0.06 },
  bracoE: { frente: 0.55, lado: 0.22, cotovelo: 0.45 }, bracoD: { frente: 0.55, lado: 0.22, cotovelo: 0.45 },
  pernaE: { frente: 0.0, lado: 0.12, joelho: 1.85, tornozelo: 2.35 }, pernaD: { frente: 0.0, lado: 0.12, joelho: 1.85, tornozelo: 2.35 },
  apoio: 0,
};
const G_MEIO_JOELHO = {
  tronco: { frente: 0.3 }, cabeca: { frente: -0.12 }, quadril: { frente: 0.12 },
  bracoE: { frente: 0.4, lado: 0.25, cotovelo: 0.7 }, bracoD: { frente: 0.6, lado: 0.2, cotovelo: 0.9 },
  pernaE: { frente: -0.08, lado: 0.1, joelho: 1.75, tornozelo: 2.25 },
  pernaD: { frente: 1.4, lado: 0.12, joelho: 1.5, tornozelo: 0.05 },
  apoio: 0,
};
const G_DE_PE = {
  tronco: { frente: 0.1 }, cabeca: { frente: -0.05 }, quadril: { frente: 0.02 },
  bracoE: { frente: 0.12, lado: 0.22, cotovelo: 0.35 }, bracoD: { frente: 0.12, lado: 0.22, cotovelo: 0.35 },
  pernaE: { frente: 0.04, lado: 0.07, joelho: 0.08 }, pernaD: { frente: 0.04, lado: 0.07, joelho: 0.08 },
  apoio: 0,
};
const G_FRUSTRADO = {
  tronco: { frente: 0.5, lado: 0.05 }, cabeca: { frente: 0.5 }, quadril: { frente: 0.05 },
  bracoE: { frente: 1.3, lado: 0.9, cotovelo: 2.2 }, bracoD: { frente: 1.3, lado: 0.9, cotovelo: 2.2 },
  pernaE: { frente: 0.05, lado: 0.12, joelho: 1.9, tornozelo: 2.35 }, pernaD: { frente: 0.05, lado: 0.12, joelho: 1.9, tornozelo: 2.35 },
  apoio: 0,
};

// Medidas do jeito de ficar de pé (fração do quadril de pé e metros)
const ALTURA_ESPERA = 0.88;  // quadril a 88% da altura de pé: meio agachado, esperando
const ALTURA_PRONTO = 0.87;  // posição de defesa: mais baixo
const ALTURA_DE_PE = 0.97;
const LARGURA_ESPERA = 0.23; // m do meio até o bico de cada pé
const LARGURA_PRONTO = 0.27;
const LARGURA_DE_PE = 0.15;
const LARGURA_MINIMA = 0.2;  // pés nunca mais perto que isso (de lado): passo cruzado, não
const FRENTE_BICO = 0.2;     // m que o bico do pé fica à frente do quadril
const PASSO_MAXIMO = 0.65;   // m que um pé anda num passo

export function criarAnimadorGoleiro(personagem, opcoes = {}) {
  const J = personagem.juntas;
  const grupo = personagem.grupo;
  const ESC = J.quadril.parent.scale; // escala do corpo: (√e, e, √e)
  const COXA = -J.joelhoE.position.y;
  const CANELA = -J.tornozeloE.position.y;
  const BRACO_TOTAL = -J.cotoveloE.position.y - J.punhoE.position.y + MAO_CENTRO;
  // Até onde a mão chega a partir do ombro (o braço estica até 15%), com folga
  const ALCANCE_BRACO = BRACO_TOTAL * 1.15 * 0.995 * Math.min(ESC.x, ESC.y) * 0.98;
  const diagnostico = opcoes.diagnostico !== false;
  const sondas = montarSondas(J);

  const pose = novaPose();
  const poseLev = novaPose(); // pose de quando começou a levantar

  function novoPe(lado) {
    return {
      lado, s: lado === 'E' ? 1 : -1,
      perna: J[`perna${lado}`], joelho: J[`joelho${lado}`], tornozelo: J[`tornozelo${lado}`],
      fk: pose[`perna${lado}`],
      estado: 'solto',            // 'plantado' | 'passo' | 'solto'
      bico: new THREE.Vector3(),  // bico do pé (mundo)
      yaw: 0, yawDe: 0, yawPara: 0,
      de: new THREE.Vector3(), para: new THREE.Vector3(),
      u: 0, dur: 0.2, altura: 0.05,
      tau: 0,                     // calcanhar levantado (rad)
      tauBase: 0,
      peso: 0,                    // 1 = perna pelo IK (pé no chão ou no passo); 0 = pela pose
      qIK: new THREE.Quaternion(),
      joIK: 0,
      casa: new THREE.Vector3(),
      erro: 0,
    };
  }
  const pes = { E: novoPe('E'), D: novoPe('D') };
  const PES = [pes.E, pes.D];

  // Estado
  const raiz = { p: new THREE.Vector3(), yaw: 0, rol: 0 };
  const pAnterior = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const desloc = new THREE.Vector3(); // empurrão do corpo para as mãos alcançarem (só se o braço não chega)
  const alvoMao = { D: new THREE.Vector3(), E: new THREE.Vector3() };
  const pesoMao = { D: 0, E: 0 };
  const localMao = { D: new THREE.Vector3(), E: new THREE.Vector3() }; // alvo no espaço do tronco (gestos)
  const pesoLocal = { D: 0, E: 0 };
  const olhar = new THREE.Vector3();
  const velBolaAnt = new THREE.Vector3();
  const cab = { f: 0, g: 0, iniciada: false };
  let s = null; // estado da cobrança (zerado em reiniciar)
  let cobrancas = 0;

  function reiniciar() {
    s = {
      inicio: true,
      tAgora: 0,
      tEspera: 0,
      tCorrida: 0,
      tVoo: 0,
      refY: null,              // altura do quadril da lógica com ele de pé (para medir pulo e agachada)
      offY: null,              // diferença entre o quadril desenhado e o da lógica, de pé
      split: { feito: false, t0: 0, ativo: false, pousou: -1 },
      mergulho: null,          // { t0, s, perto, longe }
      chao: { tocou: false, t: -1, forca: 0 },
      contato: { t: -1, mao: 'D', dir: new THREE.Vector3(), forca: 0 },
      tocou: false,
      gol: false,
      segurouEm: -1,
      transicao: null,         // levantar / ajoelhar: { t0, dur, chaves, depois }
      reacao: null,            // { tipo: 'vibrar'|'frustrado'|'neutro'|'soco'|'segurando', t0 }
      posLance: false,
      fimDesde: -1,
      temVelBola: false,
      sorteio: criarSorteio(Math.floor((opcoes.semente ?? Math.random()) * 1e9) + (cobrancas += 1)),
      proximoAjuste: 2.6,
      ultimoPasso: -1,
      modo: 'espera',
      // Pênalti: a dica (ele insinua/aponta um lado antes da cobrança). lado/sl: braço que aponta
      // ('E' = esquerda dele); k: peso do gesto agora; x, z: a trave apontada; toque: balanço da mão
      dica: { lado: 'E', sl: 1, k: 0, x: 0, z: 0, toque: 0, toqueZ: 0 },
    };
    for (const pe of PES) {
      pe.estado = 'solto';
      pe.peso = 0;
      pe.tau = 0;
    }
    desloc.set(0, 0, 0);
    vel.set(0, 0, 0);
    cab.iniciada = false;
  }
  reiniciar();

  // Saída (reaproveitada): sombra e números para os testes
  const saida = {
    modo: 'espera',
    sombra: { x: 0, z: 0, escala: 1 },
    erroLuvas: 0,         // m: maior distância entre a luva desenhada e a mão da colisão (com as mãos presas)
    maosPresas: false,    // as luvas seguem as mãos da colisão neste quadro
    menorY: 0,            // m: ponto mais baixo de pé, joelho e quadril
    menorSola: 0,         // m: ponto mais baixo das solas
    deslocamento: 0,      // m: quanto o corpo desenhado saiu do lugar da lógica para a mão alcançar
    pesPlantados: { E: false, D: false },
    estadosPes: { E: 'solto', D: 'solto' },
    parteMaisBaixa: '',
    bicos: { E: new THREE.Vector3(), D: new THREE.Vector3() },
    dica: 0,              // 0..1: quanto o gesto da dica do pênalti aparece neste quadro
  };

  // ---------- Pés: passos, IK e calcanhar ----------

  // Onde o bico do pé fica "em casa": dos lados do quadril, um pouco à frente
  function casa(pe, px, pz, yaw, largura, destino) {
    const lx = pe.s * largura;
    const lz = FRENTE_BICO;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    return destino.set(px + lx * c + lz * sn, 0, pz - lx * sn + lz * c);
  }
  // Coordenada lateral (+ = esquerda do goleiro) de um ponto do mundo em relação ao quadril
  const lateral = (p, px, pz, yaw) => (p.x - px) * Math.cos(yaw) - (p.z - pz) * Math.sin(yaw);
  const frontal = (p, px, pz, yaw) => (p.x - px) * Math.sin(yaw) + (p.z - pz) * Math.cos(yaw);

  function comecarPasso(pe, para, dur, altura, yawPara) {
    pe.de.copy(pe.bico);
    pe.para.set(para.x, 0, para.z);
    pe.yawDe = pe.yaw;
    pe.yawPara = yawPara;
    pe.u = 0;
    pe.dur = dur;
    pe.altura = altura;
    pe.estado = 'passo';
    pe.peso = 1;
    s.ultimoPasso = s.tAgora;
  }
  function plantar(pe, x, z, yaw) {
    pe.bico.set(x, 0, z);
    pe.yaw = yaw;
    pe.estado = 'plantado';
    pe.peso = 1;
  }
  const algumSolto = () => (pes.E.estado === 'solto' && pes.E.peso < 0.99) || (pes.D.estado === 'solto' && pes.D.peso < 0.99);
  const todosSoltos = () => pes.E.estado === 'solto' && pes.D.estado === 'solto';
  function soltar(pe) {
    if (pe.estado !== 'solto') pe.estado = 'solto';
  }

  function andarPassos(dt) {
    for (const pe of PES) {
      if (pe.estado === 'passo') {
        pe.u = Math.min(1, pe.u + dt / pe.dur);
        // Sai do chão rápido e pousa macio
        const k = 1 - (1 - suave(pe.u)) ** 1.4;
        pe.bico.x = misturar(pe.de.x, pe.para.x, k);
        pe.bico.z = misturar(pe.de.z, pe.para.z, k);
        pe.bico.y = misturar(pe.de.y, 0, suave(pe.u)) + 4 * pe.altura * pe.u * (1 - pe.u);
        pe.yaw = pe.yawDe + angulo(pe.yawPara - pe.yawDe) * k;
        if (pe.u >= 1) plantar(pe, pe.para.x, pe.para.z, pe.yawPara);
      } else if (pe.estado === 'solto') {
        pe.peso = Math.max(0, pe.peso - dt / 0.12);
      }
    }
  }

  // Decide os passos com ele de pé: o pé que ficou longe de "casa" dá um passo (um de cada vez;
  // na pressa o segundo sai quando o primeiro já está pousando). Os pés nunca se cruzam.
  function decidirPassos(P, yaw, largura, limiar, alturaPasso) {
    const rapidez = Math.hypot(vel.x, vel.z);
    const dur = limitar(0.24 - 0.04 * rapidez, 0.12, 0.24);
    const antecipa = dur * (rapidez > 0.4 ? 1.25 : 0.6);
    const ax = P.x + vel.x * antecipa;
    const az = P.z + vel.z * antecipa;
    const vLat = vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw);
    let candidato = null;
    let maior = limiar;
    for (const pe of PES) {
      casa(pe, ax, az, yaw, largura, pe.casa);
      pe.erro = 0;
      if (pe.estado !== 'plantado') continue;
      let e = Math.hypot(pe.bico.x - pe.casa.x, pe.bico.z - pe.casa.z) + 0.25 * Math.abs(angulo(yaw - pe.yaw));
      if (pe.s * vLat > 0.2) e *= 1.2; // o pé do lado para onde ele vai sai primeiro (abre; depois o outro fecha)
      pe.erro = e;
      if (e > maior) {
        maior = e;
        candidato = pe;
      }
    }
    if (!candidato) return;
    const outro = candidato === pes.E ? pes.D : pes.E;
    const livre = outro.estado === 'plantado' || (outro.estado === 'passo' && outro.u > 0.55 && maior > limiar * 2.2);
    if (!livre || s.tAgora - s.ultimoPasso < dur * 0.45) return;
    // Alvo: a casa (antecipada), sem cruzar com o outro pé e sem passo grande demais
    const alvo = _v3.copy(candidato.casa);
    const ref = outro.estado === 'passo' ? outro.para : outro.bico;
    const lxA = lateral(alvo, P.x, P.z, yaw);
    const lzA = frontal(alvo, P.x, P.z, yaw);
    const lxO = lateral(ref, P.x, P.z, yaw);
    if (candidato.s * (lxA - lxO) < LARGURA_MINIMA) {
      const lx = lxO + candidato.s * LARGURA_MINIMA;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      alvo.set(P.x + lx * c + lzA * sn, 0, P.z - lx * sn + lzA * c);
    }
    const dx = alvo.x - candidato.bico.x;
    const dz = alvo.z - candidato.bico.z;
    const d = Math.hypot(dx, dz);
    if (d > PASSO_MAXIMO) alvo.set(candidato.bico.x + (dx * PASSO_MAXIMO) / d, 0, candidato.bico.z + (dz * PASSO_MAXIMO) / d);
    comecarPasso(candidato, alvo, dur, alturaPasso + 0.02 * rapidez, yaw);
  }

  // Onde fica o tornozelo para o bico do pé ficar em 'bico' (mundo), com o calcanhar levantado tau
  // e nenhum ponto da sola abaixo de bico.y
  function tornozeloDoBico(bico, yaw, tau, destino) {
    const c = Math.cos(tau);
    const sn = Math.sin(tau);
    let menor = Infinity;
    for (let i = 0; i < SOLA.length; i++) menor = Math.min(menor, SOLA[i][1] * c - SOLA[i][2] * sn);
    const zb = BICO[1] * sn + BICO[2] * c; // o bico fica isso à frente do tornozelo
    return destino.set(
      bico.x - Math.sin(yaw) * zb * ESC.z,
      bico.y - menor * ESC.y,
      bico.z - Math.cos(yaw) * zb * ESC.z,
    );
  }

  // IK de dois ossos com polo (como o braço em js/jogadores.js): a coxa e o joelho para o tornozelo
  // chegar em 'alvo' (mundo), com o joelho apontando para a frente do pé (a coxa gira se precisar).
  // Guarda em pe.qIK (rotação da coxa no espaço do quadril) e pe.joIK. Devolve quanto falta (m) se não alcança.
  const _alvoL = new THREE.Vector3();
  const _polo = new THREE.Vector3();
  const _dK = new THREE.Vector3();
  const _canela = new THREE.Vector3();
  const _eX = new THREE.Vector3();
  const _eY = new THREE.Vector3();
  const _eZ = new THREE.Vector3();
  const _base = new THREE.Matrix4();
  const _qQuadril = new THREE.Quaternion();
  function ikPerna(pe, alvo) {
    _alvoL.copy(alvo);
    J.quadril.worldToLocal(_alvoL);
    _alvoL.sub(pe.perna.position);
    const dist = _alvoL.length() || 1e-6;
    const max = (COXA + CANELA) * 0.9995;
    const d = limitar(dist, Math.abs(COXA - CANELA) + 0.02, max);
    _alvoL.multiplyScalar(1 / dist); // direção do quadril até o alvo
    // Polo: frente do pé (no espaço do quadril), um pouco para fora e para cima
    J.quadril.getWorldQuaternion(_qQuadril).invert();
    _polo.set(Math.sin(pe.yaw), 0, Math.cos(pe.yaw)).applyQuaternion(_qQuadril);
    _polo.x += pe.s * 0.15;
    _polo.y += 0.1;
    _polo.addScaledVector(_alvoL, -_polo.dot(_alvoL));
    if (_polo.lengthSq() < 1e-6) _polo.set(0, 0, 1).addScaledVector(_alvoL, -_alvoL.z);
    _polo.normalize();
    const cosA = limitar((COXA * COXA + d * d - CANELA * CANELA) / (2 * COXA * d), -1, 1);
    _dK.copy(_alvoL).multiplyScalar(cosA).addScaledVector(_polo, Math.sqrt(1 - cosA * cosA));
    _canela.copy(_alvoL).multiplyScalar(d).addScaledVector(_dK, -COXA).normalize();
    // Base da coxa: −y local vai do quadril ao joelho; +z local é a frente do joelho (contrário da canela)
    _eZ.copy(_canela).addScaledVector(_dK, -_canela.dot(_dK)).negate();
    if (_eZ.lengthSq() < 1e-8) _eZ.copy(_polo);
    _eZ.normalize();
    _eY.copy(_dK).negate();
    _eX.crossVectors(_eY, _eZ);
    _base.makeBasis(_eX, _eY, _eZ);
    pe.qIK.setFromRotationMatrix(_base);
    pe.joIK = Math.acos(limitar((d * d - COXA * COXA - CANELA * CANELA) / (2 * COXA * CANELA), -1, 1));
    return Math.max(0, dist - max);
  }

  // Pernas: IK nas plantadas (e nos passos), misturado com a pose nas que estão saindo do chão
  function aplicarPernas() {
    for (const pe of PES) {
      if (pe.peso <= 0.001) continue;
      const fk = pe.fk;
      if (pe.estado !== 'solto') {
        let tau = pe.tau;
        tornozeloDoBico(pe.bico, pe.yaw, tau, _v2);
        let falta = ikPerna(pe, _v2);
        // Perna esticada demais: sobe o calcanhar (impulso na ponta do pé); se nem assim, o pé sai do chão
        if (falta > 0 && pe.estado === 'plantado') {
          for (let k = 1; k <= 4 && falta > 0; k++) {
            tau = Math.min(1.1, pe.tau + 0.28 * k);
            tornozeloDoBico(pe.bico, pe.yaw, tau, _v2);
            falta = ikPerna(pe, _v2);
          }
          pe.tau = tau;
          if (falta > 0.004) soltar(pe);
        }
      }
      const w = pe.peso;
      // Coxa: da pose (ângulos) até o IK (rotação), joelho idem
      _e.set(-fk.frente, 0, pe.s * fk.lado, 'XZY');
      pe.perna.quaternion.setFromEuler(_e).slerp(pe.qIK, w);
      const j = misturar(fk.joelho, pe.joIK, w);
      pe.joelho.rotation.set(j, 0, 0);
      // Pé: no chão, a sola fica rente ao gramado (virada para pe.yaw, com o calcanhar levantado tau)
      _q2.setFromAxisAngle(EIXO_Y, pe.yaw);
      _q.setFromAxisAngle(EIXO_X, pe.tau);
      _q2.multiply(_q); // alvo no mundo
      _q.copy(grupo.quaternion).multiply(J.quadril.quaternion).multiply(pe.perna.quaternion).multiply(pe.joelho.quaternion).invert();
      _q.multiply(_q2); // rotação do tornozelo para o pé ficar como o alvo
      _e.set(fk.frente - fk.joelho - pose.quadril.frente + fk.tornozelo, 0, 0, 'XZY');
      pe.tornozelo.quaternion.setFromEuler(_e).slerp(_q, w);
    }
  }

  // ---------- Chão ----------

  // Ponto mais baixo do corpo (descontado o raio de cada parte). pular: perna plantada (o IK já cuida)
  function maisBaixo(pularPlantadas) {
    let menor = Infinity;
    for (let i = 0; i < sondas.length; i++) {
      const sd = sondas[i];
      if (pularPlantadas && sd.perna && pes[sd.perna].estado !== 'solto' && pes[sd.perna].peso > 0.99) continue;
      _v.copy(sd.local).applyMatrix4(sd.junta.matrixWorld);
      menor = Math.min(menor, _v.y - sd.r);
    }
    return menor;
  }

  // ---------- Braços: o tronco ajuda a mão a chegar ----------

  const ombros = { D: J.ombroD, E: J.ombroE };
  const punhos = { D: J.punhoD, E: J.punhoE };
  const tornozelos = { D: J.tornozeloD, E: J.tornozeloE };
  const bracosPose = { D: pose.bracoD, E: pose.bracoE };
  const _ombro = new THREE.Vector3();
  function ombroNoMundo(fr, gi, la, ombro, destino) {
    _e.set(fr, gi, la, 'XZY');
    _q.setFromEuler(_e);
    _m.compose(J.tronco.position, _q, _um).premultiply(J.quadril.matrixWorld);
    return destino.copy(ombro.position).applyMatrix4(_m);
  }
  function excessoBracos(fr, gi, la) {
    let c = 0;
    for (const lado of LADOS) {
      if (pesoMao[lado] < 0.5) continue;
      ombroNoMundo(fr, gi, la, ombros[lado], _ombro);
      const e = _ombro.distanceTo(alvoMao[lado]) - ALCANCE_BRACO;
      if (e > 0) c += e * e;
    }
    return c;
  }
  // Inclina e gira o tronco (um pouco) para os ombros chegarem perto das mãos da colisão.
  // Devolve no 'destino' o quanto o corpo ainda precisa andar para a mão mais longe alcançar.
  const base = { fr: 0, gi: 0, la: 0 };
  const custoTronco = (a, b, c) => excessoBracos(a, b, c)
    + 0.002 * ((a - base.fr) ** 2 + (b - base.gi) ** 2 + (c - base.la) ** 2);
  function ajudarBracos(destino) {
    destino.set(0, 0, 0);
    const r = J.tronco.rotation;
    base.fr = r.x;
    base.gi = r.y;
    base.la = r.z;
    let fr = r.x;
    let gi = r.y;
    let la = r.z;
    if (excessoBracos(fr, gi, la) <= 0) return;
    let atual = custoTronco(fr, gi, la);
    for (const passo of PASSOS_BUSCA) {
      for (let rep = 0; rep < 3; rep++) {
        let melhorou = false;
        for (let eixo = 0; eixo < 3; eixo++) {
          for (const sinal of SINAIS) {
            const a = eixo === 0 ? limitar(fr + sinal * passo, base.fr - 0.5, base.fr + 0.8) : fr;
            const b = eixo === 1 ? limitar(gi + sinal * passo, base.gi - 0.9, base.gi + 0.9) : gi;
            const c = eixo === 2 ? limitar(la + sinal * passo, base.la - 0.75, base.la + 0.75) : la;
            const novo = custoTronco(a, b, c);
            if (novo < atual - 1e-7) {
              atual = novo;
              fr = a;
              gi = b;
              la = c;
              melhorou = true;
            }
          }
        }
        if (!melhorou) break;
      }
    }
    J.tronco.rotation.set(fr, gi, la);
    // O que sobrar: o corpo vai até a mão (pela mão mais longe)
    let pior = 0;
    for (const lado of LADOS) {
      if (pesoMao[lado] < 0.5) continue;
      ombroNoMundo(fr, gi, la, ombros[lado], _ombro);
      const d = _ombro.distanceTo(alvoMao[lado]);
      const e = d - ALCANCE_BRACO * 0.995;
      if (e > pior) {
        pior = e;
        destino.copy(alvoMao[lado]).sub(_ombro).multiplyScalar(e / d);
      }
    }
  }

  // ---------- Cabeça ----------

  function olharCabeca(alvo, dt, rapidez) {
    _v.copy(alvo);
    J.tronco.worldToLocal(_v);
    _v.sub(J.cabeca.position);
    _v.y -= 0.17;
    const giro = limitar(Math.atan2(_v.x, _v.z), -1.25, 1.25);
    const frente = limitar(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.85, 0.85);
    if (!cab.iniciada) {
      cab.f = frente;
      cab.g = giro;
      cab.iniciada = true;
    }
    cab.f = aproximar(cab.f, frente, rapidez, dt);
    cab.g = aproximar(cab.g, giro, rapidez, dt);
  }

  // ---------- Transições (levantar, ajoelhar): poses-chave com o corpo encostado no chão ----------

  const maosInicio = { D: new THREE.Vector3(), E: new THREE.Vector3() };
  const pInicio = new THREE.Vector3();
  function comecarTransicao(chaves, dur, depois) {
    copiarPose(poseLev, pose);
    // Braços: as luvas começam onde estão (IK); a base deles não pode ser a dos braços esticados do mergulho
    for (const lado of LADOS) {
      const b = lado === 'E' ? poseLev.bracoE : poseLev.bracoD;
      const ref = chaves[0].pose[lado === 'E' ? 'bracoE' : 'bracoD'] || G_PRONTO.bracoE;
      b.frente = ref.frente || 0;
      b.lado = ref.lado ?? 0.1;
      b.cotovelo = ref.cotovelo || 0;
    }
    // As luvas saem de onde estão (e não da pose de base dos braços)
    const deitado = Math.abs(raiz.rol) > 0.6;
    for (const lado of LADOS) {
      _v.copy(PALMA_LUVA);
      punhos[lado].localToWorld(maosInicio[lado].copy(_v));
    }
    pInicio.copy(raiz.p);
    s.transicao = { t0: s.tAgora, dur, chaves, depois, rol0: raiz.rol, p: pInicio, yaw: raiz.yaw, empurra: deitado };
    for (const pe of PES) soltar(pe);
  }
  // Mãos na transição: deitado, saem de onde estavam e apoiam no chão na frente do peito para
  // empurrar o corpo; depois soltam (a pose manda)
  function maosDaTransicao(tr) {
    const u = limitar((s.tAgora - tr.t0) / tr.dur, 0, 1);
    const w = tr.empurra ? 1 - suave((u - 0.42) / 0.16) : 1 - suave(u / 0.15);
    pesoMao.D = pesoMao.E = w;
    if (w <= 0) return;
    const k = suave(u / 0.14);
    const c = Math.cos(raiz.yaw);
    const sn = Math.sin(raiz.yaw);
    // Peito projetado no chão, um pouco à frente; uma mão de cada lado
    _v.set(0, 0.42, 0).applyMatrix4(J.tronco.matrixWorld);
    for (const lado of LADOS) {
      const l = (lado === 'E' ? 1 : -1) * 0.17;
      _v2.set(_v.x + l * c + 0.3 * sn, 0.07, _v.z - l * sn + 0.3 * c);
      if (!tr.empurra) _v2.copy(maosInicio[lado]);
      alvoMao[lado].copy(maosInicio[lado]).lerp(_v2, k);
    }
  }
  const resultadoTransicao = { u: 0, rol: 0 };
  function poseDaTransicao(tr, destino) {
    const u = limitar((s.tAgora - tr.t0) / tr.dur, 0, 1);
    let uA = 0;
    let poseA = poseLev;
    let rolA = tr.rol0;
    resultadoTransicao.u = u;
    for (const ch of tr.chaves) {
      const rolB = ch.fracao ? ch.rol * tr.rol0 : ch.rol;
      if (u <= ch.u) {
        const k = suave((u - uA) / Math.max(1e-6, ch.u - uA));
        misturarPoses(destino, poseA, ch.pose, k);
        resultadoTransicao.rol = misturar(rolA, rolB, k);
        return resultadoTransicao;
      }
      uA = ch.u;
      poseA = ch.pose;
      rolA = rolB;
    }
    copiarPose(destino, poseA);
    resultadoTransicao.rol = rolA;
    return resultadoTransicao;
  }

  // ---------- Quadro ----------

  function atualizar(g, t, dt, info = {}) {
    const gp = (g && g.pose) || g;
    if (!gp || !Number.isFinite(gp.x)) return saida;
    dt = limitar(dt || 0, 0, 0.1);
    s.tAgora += dt;
    const fase = info.fase || 'voo';
    const bola = info.bola || null;
    const antes = fase === 'pronto' || fase === 'carregando' || fase === 'corrida';
    let tc = info.tempoDesdeChute;
    if (fase === 'corrida') {
      s.tCorrida += dt;
      if (tc == null || !Number.isFinite(tc)) tc = s.tCorrida - 0.8;
    } else if (antes) {
      s.tCorrida = 0;
      tc = -10;
    } else {
      s.tVoo += dt;
      if (tc == null || !Number.isFinite(tc)) tc = s.tVoo;
    }
    if (antes && fase !== 'corrida') s.tEspera += dt;
    const estado = gp.estado || 'pronto';
    const rolLogica = gp.rolagem || 0;
    if (s.refY === null || (antes && fase !== 'corrida')) s.refY = s.refY === null ? gp.y : aproximar(s.refY, gp.y, 1.5, dt);

    // Bola: toques no goleiro (mudança brusca de velocidade perto das mãos ou do corpo) e gol
    if (bola && bola.pos) {
      if (s.temVelBola && !antes && tc > 0.05) {
        const dv = Math.hypot(bola.vel.x - velBolaAnt.x, bola.vel.y - velBolaAnt.y, bola.vel.z - velBolaAnt.z);
        const md = gp.maos && gp.maos.direita;
        const me = gp.maos && gp.maos.esquerda;
        const dD = md ? Math.hypot(bola.pos.x - md.x, bola.pos.y - md.y, bola.pos.z - md.z) : 9;
        const dE = me ? Math.hypot(bola.pos.x - me.x, bola.pos.y - me.y, bola.pos.z - me.z) : 9;
        const c = gp.centro || gp;
        const dC = Math.hypot(bola.pos.x - c.x, bola.pos.y - (c.y || 1), bola.pos.z - c.z);
        if (dv > 3.5 && (Math.min(dD, dE) < 0.55 || dC < 0.9) && s.tAgora - s.contato.t > 0.25) {
          s.contato.t = s.tAgora;
          s.contato.mao = dD < dE ? 'D' : 'E';
          s.contato.forca = dv;
          const vv = Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z);
          if (vv > 0.5) s.contato.dir.set(bola.vel.x / vv, bola.vel.y / vv, bola.vel.z / vv);
          else s.contato.dir.set(0, 0, 0);
          s.contato.maos = Math.min(dD, dE) < 0.55;
          s.tocou = true;
        }
      }
      velBolaAnt.set(bola.vel.x, bola.vel.y, bola.vel.z);
      s.temVelBola = true;
      if (!antes && (bola.gol || (bola.pos.z < -0.25 && Math.abs(bola.pos.x) < 3.66 && bola.pos.y < 2.44 && bola.entrouNoGol !== false))) {
        s.gol = true;
      }
    }
    if (estado === 'segurou' && s.segurouEm < 0) s.segurouEm = s.tAgora;
    if (fase === 'fim' && s.fimDesde < 0) s.fimDesde = s.tAgora;

    // Começo do mergulho de lado
    const ladoLogica = gp.lado ? Math.sign(gp.lado) : 0;
    if (!antes && !s.mergulho && estado === 'mergulhando' && ladoLogica !== 0) {
      const sl = ladoLogica; // +1 = para a esquerda do goleiro (+x local)
      s.mergulho = { t0: s.tAgora, s: sl, perto: sl > 0 ? pes.E : pes.D, longe: sl > 0 ? pes.D : pes.E, soltouLonge: false };
    }

    // ---------- Qual o modo ----------
    let modo;
    if (s.transicao) modo = 'transicao';
    else if (s.posLance) modo = 'posLance';
    else if (antes) modo = fase === 'corrida' ? 'corrida' : 'espera';
    else if (s.mergulho) modo = 'mergulho';
    else modo = 'dePe';
    s.modo = modo;
    saida.modo = modo;

    // Primeiro quadro da cobrança: pés em casa, sem vir deslizando da cobrança anterior
    if (s.inicio) {
      s.inicio = false;
      raiz.p.set(gp.x, gp.y, gp.z);
      raiz.yaw = gp.rotacaoY || 0;
      pAnterior.copy(raiz.p);
      for (const pe of PES) {
        casa(pe, gp.x, gp.z, raiz.yaw, LARGURA_ESPERA, pe.casa);
        plantar(pe, pe.casa.x, pe.casa.z, raiz.yaw);
        pe.tau = 0.05;
      }
      s.offY = personagem.alturaQuadril * ALTURA_ESPERA - gp.y;
    }

    // ---------- Pose, raiz e pés de cada modo ----------
    let trQuadro = null;
    const yaw = gp.rotacaoY || 0;
    let modoChao = 'pes';    // 'pes' (pés no chão pelo IK) | 'livre' (só não deixa entrar) | 'encosta' (encosta no chão)
    let pesoLogica = 0;      // mãos presas às mãos da colisão
    let alturaDesejada = ALTURA_ESPERA;
    let largura = LARGURA_ESPERA;
    let limiarPasso = 0.07;
    let olharPeso = 1;
    let rapidezCabeca = 10;
    olhar.set(bola ? bola.pos.x : 0, bola ? bola.pos.y : 0.2, bola ? bola.pos.z : 20);
    pesoLocal.D = pesoLocal.E = 0;
    let bob = 0;
    const respira = Math.sin(t * 1.9);
    // Dica do pênalti: o peso vem da lógica só na espera; fora dela o gesto some depressa
    // (sem pulo na pose, mesmo se a lógica cortar de uma vez na largada do cobrador)
    if (modo === 'espera') lerDica(gp);
    else s.dica.k = s.dica.k < 0.002 ? 0 : aproximar(s.dica.k, 0, 10, dt);
    saida.dica = s.dica.k;

    if (modo === 'espera' || modo === 'corrida') {
      // ----- Antes do chute -----
      const corrida = modo === 'corrida';
      const kc = corrida ? suave(s.tCorrida / 0.35) : 0;
      misturarPoses(pose, G_ESPERA, G_PRONTO, kc * 0.85);
      pose.tronco.frente += 0.012 * respira;
      alturaDesejada = misturar(ALTURA_ESPERA, ALTURA_PRONTO + 0.01, kc);
      largura = misturar(LARGURA_ESPERA, LARGURA_PRONTO - 0.02, kc);
      // Mãos prontas na frente da barriga (espaço do tronco)
      const abre = 0.24 + 0.02 * respira;
      localMao.E.set(abre, 0.12 + 0.08 * kc, 0.28 + 0.05 * kc);
      localMao.D.set(-abre, 0.12 + 0.08 * kc, 0.28 + 0.05 * kc);
      pesoLocal.D = pesoLocal.E = 1;
      for (const pe of PES) pe.tauBase = 0.06;
      if (!corrida) {
        gestosEspera(g, gp);
        // Ajustes de passo de vez em quando (pequenos)
        if (s.tEspera > s.proximoAjuste && pes.E.estado === 'plantado' && pes.D.estado === 'plantado') {
          const pe = s.sorteio() < 0.5 ? pes.E : pes.D;
          casa(pe, gp.x, gp.z, yaw, LARGURA_ESPERA + (s.sorteio() - 0.5) * 0.06, _v3);
          _v3.x += (s.sorteio() - 0.5) * 0.06;
          _v3.z += (s.sorteio() - 0.5) * 0.08;
          comecarPasso(pe, _v3, 0.26, 0.035, yaw + (s.sorteio() - 0.5) * 0.1);
          s.proximoAjuste = s.tEspera + 1.6 + s.sorteio() * 2.2;
        }
      } else {
        // Quicando na ponta dos pés enquanto o cobrador corre
        const ritmo = Math.sin(s.tCorrida * Math.PI * 2 * 3.2);
        bob = 0.016 * ritmo * kc;
        for (const pe of PES) pe.tauBase = 0.2 + 0.14 * (0.5 + 0.5 * ritmo) * kc;
        // Split step: pulinho de prontidão logo antes do pé na bola
        if (!s.split.feito && tc >= -0.2) comecarSplit(gp, yaw);
      }
      if (s.dica.k > 0) aplicarDica(gp, bola);
      limiarPasso = 0.07;
    } else if (modo === 'dePe') {
      // ----- Depois do chute, de pé: posição de defesa, passos, pulo/agachada no meio, encaixe -----
      if (!s.split.feito && tc < 0.12) comecarSplit(gp, yaw);
      copiarPose(pose, G_PRONTO);
      alturaDesejada = ALTURA_PRONTO;
      largura = LARGURA_PRONTO;
      limiarPasso = 0.09;
      // Mãos: do pulinho de prontidão em diante, as luvas ficam nas mãos da colisão
      pesoLogica = suave((tc + 0.2) / 0.25);
      localMao.E.set(0.25, 0.16, 0.36);
      localMao.D.set(-0.25, 0.16, 0.36);
      pesoLocal.D = pesoLocal.E = 1;
      for (const pe of PES) pe.tauBase = 0.12;
      // Inclina para o lado do passo
      const vLat = vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw);
      pose.tronco.lado = limitar(-0.07 * vLat, -0.2, 0.2);
      pose.quadril.lado = limitar(0.03 * vLat, -0.08, 0.08);
      // Pulo no meio: pernas encolhem no ar
      const subiu = gp.y - (s.refY || gp.y);
      if (subiu > 0.08) {
        const k = suave((subiu - 0.08) / 0.2);
        misturarPerna(pose.pernaE, pose.pernaE, PERNA_PULO_E, k);
        misturarPerna(pose.pernaD, pose.pernaD, PERNA_PULO_D, k);
        pose.tronco.frente -= 0.2 * k;
      }
      // Encaixe: traz a bola para o peito e se curva sobre ela
      if (estado === 'segurou') {
        const u = (s.tAgora - s.segurouEm) / 0.35;
        const k = suave(u);
        pose.tronco.frente += 0.22 * k;
        bob -= 0.045 * sino(u);
        rapidezCabeca = 16;
      }
      espalmadaNoCorpo();
    } else if (modo === 'mergulho') {
      montarMergulho(gp, dt, estado);
      modoChao = s.mergulho.modoChao;
      pesoLogica = 1;
      rapidezCabeca = 18;
      espalmadaNoCorpo();
    } else if (modo === 'transicao') {
      const tr = s.transicao;
      trQuadro = tr;
      const r = poseDaTransicao(tr, pose);
      raiz.rol = r.rol;
      modoChao = 'encosta';
      olharPeso = 1;
      if (r.u >= 1) terminarTransicao(tr);
    } else if (modo === 'posLance') {
      montarPosLance(t);
      alturaDesejada = s.reacao && s.reacao.tipo === 'vibrar' ? ALTURA_DE_PE - 0.04 : ALTURA_DE_PE;
      largura = LARGURA_DE_PE + 0.04;
      limiarPasso = 0.12;
      if (s.reacao && s.reacao.tipo === 'segurando') pesoLogica = 1;
    }
    pose.agachar = 0;
    pose.apoio = 0;
    pose.pulo = 0;
    pose.maoE.peso = 0;
    pose.maoD.peso = 0;

    // Reação depois do lance (quando o jogo já decidiu, ou ele ficou um tempo parado)
    decidirReacao(gp, fase, estado, modo);

    // ---------- Raiz (onde fica o quadril) ----------
    const emPe = modo === 'espera' || modo === 'corrida' || modo === 'dePe' || modo === 'posLance';
    if (emPe) {
      if (modo === 'posLance') {
        raiz.p.y = aproximar(raiz.p.y, personagem.alturaQuadril * alturaDesejada, 6, dt);
      } else {
        const alvoOff = personagem.alturaQuadril * alturaDesejada - (s.refY ?? gp.y);
        s.offY = aproximar(s.offY ?? alvoOff, alvoOff, 8, dt);
        raiz.p.set(gp.x, gp.y + s.offY, gp.z);
        raiz.yaw = yaw;
      }
      raiz.rol = 0;
    } else if (modo === 'mergulho') {
      // O quadril segue o da lógica; a diferença de altura de quem está de pé some no impulso
      const m = s.mergulho;
      const k = suave((s.tAgora - m.t0) / 0.18);
      const kp = m.kEmPe || 0; // pousou de pé: volta a altura de quem está de pé
      raiz.p.set(gp.x, gp.y + (s.offY || 0) * Math.max(1 - k, kp), gp.z);
      raiz.yaw = yaw;
      raiz.rol = rolLogica * (1 - kp);
    } else if (modo === 'transicao') {
      const tr = trQuadro;
      raiz.p.x = tr.p.x;
      raiz.p.z = tr.p.z;
      raiz.yaw = tr.yaw;
    }
    // Split step e quiques
    bob += alturaSplit();
    // Velocidade do quadril (para antecipar os passos)
    if (dt > 0) {
      _v.copy(raiz.p).sub(pAnterior).divideScalar(dt);
      vel.x = aproximar(vel.x, _v.x, 14, dt);
      vel.z = aproximar(vel.z, _v.z, 14, dt);
      vel.y = aproximar(vel.y, _v.y, 14, dt);
    }
    pAnterior.copy(raiz.p);

    // ---------- Pés ----------
    andarPassos(dt);
    if (emPe && !s.split.ativo) {
      // Pé solto (ex.: depois do pulo no meio) volta para o chão quando dá
      const alcanceY = (COXA + CANELA) * ESC.y * 0.95 + 0.07 * ESC.y;
      for (const pe of PES) {
        if (pe.estado === 'solto' && raiz.p.y + bob < alcanceY && vel.y < 0.6) {
          casa(pe, raiz.p.x, raiz.p.z, raiz.yaw, largura, _v3);
          comecarPasso(pe, _v3, 0.14, 0.03, raiz.yaw);
        }
      }
      if (modo !== 'espera' || s.tEspera > 0.2) decidirPassos(raiz.p, raiz.yaw, largura, limiarPasso, 0.035);
    }
    for (const pe of PES) {
      if (pe.estado === 'passo') pe.tau = misturar(pe.tauBase, 0.25, sino(pe.u));
      else if (pe.estado === 'plantado') pe.tau = aproximar(pe.tau, pe.tauBase, 12, dt);
    }

    // ---------- Monta o boneco ----------
    personagem.aplicarPose(pose);
    // Mãos: as da colisão (mundo) misturadas com as dos gestos (espaço do tronco)
    prepararMaos(gp, pesoLogica, bola, estado);
    if (modo === 'transicao' && trQuadro) {
      grupo.updateMatrixWorld(true);
      maosDaTransicao(trQuadro);
    }
    for (let passe = 0; passe < 3; passe++) {
      colocarGrupo(bob);
      grupo.updateMatrixWorld(true);
      aplicarPernas();
      grupo.updateMatrixWorld(true);
      // Nada entra no gramado (no ar só sobe; deitado, encosta)
      if (modoChao !== 'pes' || algumSolto()) {
        const menor = maisBaixo(true);
        let ajuste = 0;
        if (modoChao === 'encosta') ajuste = limitar(-menor, -0.12, 2);
        else if (menor < 0) ajuste = -menor;
        if (Math.abs(ajuste) > 1e-5) {
          grupo.position.y += ajuste;
          grupo.updateMatrixWorld(true);
          if (!todosSoltos()) {
            aplicarPernas();
            grupo.updateMatrixWorld(true);
          }
        }
        if (modo === 'mergulho') registrarChao(menor + ajuste);
      }
      // As mãos presas na colisão: o tronco ajuda; se nem assim, o corpo vai um pouco até elas
      if (pesoLogica > 0.5 && passe < 2) {
        ajudarBracos(_v3);
        if (_v3.lengthSq() > 1e-6) {
          desloc.add(_v3);
          if (desloc.length() > 0.45) desloc.setLength(0.45);
          continue;
        }
      }
      break;
    }
    saida.deslocamento = desloc.length();
    desloc.multiplyScalar(Math.exp(-5 * dt));
    grupo.updateMatrixWorld(true);

    // Cabeça: segue a bola (ou o gesto)
    olharCabeca(olhar, dt, rapidezCabeca);
    J.cabeca.rotation.set(misturar(pose.cabeca.frente, cab.f, olharPeso), misturar(pose.cabeca.giro, cab.g, olharPeso), 0);

    // Punho: estala na espalmada
    for (const lado of LADOS) punhos[lado].rotation.set(0, 0, 0);
    const uC = (s.tAgora - s.contato.t) / 0.32;
    if (s.contato.t >= 0 && uC < 1 && estado !== 'segurou' && s.contato.maos) {
      const flick = 0.9 * (uC < 0.15 ? uC / 0.15 : Math.exp(-(uC - 0.15) * 5));
      punhos[s.contato.mao].rotation.x = flick;
    }

    // Mãos: o IK leva o meio da mão ao alvo; uma segunda passada corrige a diferença até o meio
    // da palma da luva (e o estalo do punho), para a luva ficar em cima da mão da colisão
    for (const lado of LADOS) {
      const peso = Math.min(1, Math.max(pesoMao[lado], pesoLocal[lado]));
      if (peso <= 0.001) continue;
      personagem.alcancar(lado, alvoMao[lado], peso);
      if (peso < 0.999) continue;
      ombros[lado].updateMatrixWorld(true);
      _v.copy(PALMA_LUVA);
      punhos[lado].localToWorld(_v);
      _v2.copy(alvoMao[lado]).multiplyScalar(2).sub(_v);
      personagem.alcancar(lado, _v2, 1);
    }

    // Sombra: embaixo do meio do corpo
    _v.set(0, 0.25, 0).applyMatrix4(J.tronco.matrixWorld);
    saida.sombra.x = _v.x;
    saida.sombra.z = _v.z;
    // (menor quando ele sobe; o quadril de pé fica a ~0,9 m)
    _v2.setFromMatrixPosition(J.quadril.matrixWorld);
    saida.sombra.escala = limitar(1.1 - 0.7 * Math.max(0, _v2.y - personagem.alturaQuadril * ALTURA_ESPERA), 0.55, 1.1);
    saida.maosPresas = pesoLogica > 0.999 && pesoMao.D > 0.999;
    if (diagnostico) medir(gp);
    return saida;
  }

  // Coloca o grupo: o pivô do quadril vai para raiz.p (com o empurrão das mãos e o quique)
  function colocarGrupo(bob) {
    grupo.rotation.set(0, raiz.yaw, -raiz.rol);
    _v.set(0, J.quadril.position.y * ESC.y, 0).applyEuler(grupo.rotation);
    grupo.position.set(raiz.p.x + desloc.x - _v.x, raiz.p.y + bob + desloc.y - _v.y, raiz.p.z + desloc.z - _v.z);
  }

  // ---------- Antes do chute: gestos ----------

  function gestosEspera(g, gp) {
    const te = s.tEspera;
    // Organiza a barreira: aponta para ela e olha
    const b = g && g.barreira;
    if (b && b.jogadores && b.jogadores.length && te < 1.8) {
      const u = (te - 0.3) / 1.4;
      const k = envelope(u, 0.2, 0.75);
      if (k > 0) {
        let mx = 0;
        let mz = 0;
        for (const j of b.jogadores) {
          mx += j.x / b.jogadores.length;
          mz += j.z / b.jogadores.length;
        }
        // Braço do lado da barreira, apontando (com dois toques de "vai, fecha aí")
        const ladoB = lateral(_v3.set(mx, 0, mz), gp.x, gp.z, gp.rotacaoY || 0) > 0 ? 'E' : 'D';
        const sl = ladoB === 'E' ? 1 : -1;
        const toque = 0.06 * Math.sin(u * Math.PI * 6);
        // (a mão vai na direção da barreira: montada em prepararMaos)
        localMao[ladoB].set(sl * 0.2, 0.42, 0.1);
        const ap = s.apontar || (s.apontar = { lado: 'E', k: 0, x: 0, z: 0, toque: 0 });
        ap.lado = ladoB;
        ap.k = k;
        ap.x = mx;
        ap.z = mz;
        ap.toque = toque;
        olhar.set(misturar(olhar.x, mx, k), misturar(olhar.y, 1.6, k), misturar(olhar.z, mz, k));
        return;
      }
    }
    if (s.apontar) s.apontar.k = 0;
    // Bate as luvas: duas palmas na frente do peito
    const up = (te - 1.9) / 0.6;
    if (up > 0 && up < 1) {
      const k = envelope(up, 0.2, 0.8);
      const abre = 0.05 + 0.13 * (0.5 + 0.5 * Math.cos(up * Math.PI * 4));
      localMao.E.set(misturar(localMao.E.x, abre, k), misturar(localMao.E.y, 0.3, k), misturar(localMao.E.z, 0.36, k));
      localMao.D.set(misturar(localMao.D.x, -abre, k), misturar(localMao.D.y, 0.3, k), misturar(localMao.D.z, 0.36, k));
      return;
    }
    // De vez em quando ajeita a luva (a mão direita puxa o punho da esquerda)
    const ciclo = ((te - 2.6) % 6 + 6) % 6;
    if (te > 2.6 && ciclo < 1.1) {
      const k = envelope(ciclo / 1.1, 0.25, 0.75);
      const puxa = 0.02 * Math.sin(ciclo * 18);
      localMao.E.set(misturar(localMao.E.x, 0.1, k), misturar(localMao.E.y, 0.22, k), misturar(localMao.E.z, 0.3, k));
      localMao.D.set(misturar(localMao.D.x, 0.0 + puxa, k), misturar(localMao.D.y, 0.21, k), misturar(localMao.D.z, 0.3, k));
      olhar.set(misturar(olhar.x, gp.x, k * 0.8), misturar(olhar.y, 0.6, k * 0.8), misturar(olhar.z, gp.z + 1.2, k * 0.8));
    }
  }

  // ---------- Pênalti: a dica (insinua/aponta um lado antes da cobrança) ----------

  // Lê a dica da lógica: pose.dica (−1 | 0 | +1 no eixo x do jogo; +1 = direita de quem cobra)
  // e pose.dicaForca (0..1, quanto o gesto aparece agora). Ausentes valem 0: nada muda nas faltas.
  function lerDica(gp) {
    const d = s.dica;
    const dica = Number.isFinite(gp.dica) ? Math.sign(gp.dica) : 0;
    const forca = Number.isFinite(gp.dicaForca) ? limitar(gp.dicaForca, 0, 1) : 0;
    if (dica === 0 || forca <= 0) {
      d.k = 0;
      return;
    }
    // Alvo: a trave daquele lado, na linha do goleiro
    d.x = dica * 3.4;
    d.z = gp.z;
    // Ele está de frente para o cobrador: +x do jogo é a ESQUERDA dele. O braço vem de 'lateral'
    // (que já leva em conta para onde o corpo está virado), nunca do sinal da dica direto.
    d.lado = lateral(_v3.set(d.x, 0, d.z), gp.x, gp.z, gp.rotacaoY || 0) >= 0 ? 'E' : 'D';
    d.sl = d.lado === 'E' ? 1 : -1;
    d.k = forca;
    // Balanço pequeno da mão apontada ("é ali, ó")
    d.toque = 0.05 * Math.sin(s.tEspera * Math.PI * 2 * 1.1);
    d.toqueZ = 0.04 * Math.sin(s.tEspera * Math.PI * 2 * 0.7 + 1);
  }

  // A dica na pose, na mão e no olhar, com peso s.dica.k (o braço esticado até a trave é montado
  // em prepararMaos, por cima dos gestos da espera; se coexistir com o gesto da barreira, a dica vence)
  function aplicarDica(gp, bola) {
    const d = s.dica;
    const k = d.k;
    const sl = d.sl;
    // O tronco abre um pouco para o lado apontado
    pose.tronco.giro += 0.14 * sl * k;
    pose.tronco.lado -= 0.04 * sl * k;
    // A mão que aponta sobe à frente do peito (daqui ela vai até a trave)
    const m = localMao[d.lado];
    m.set(misturar(m.x, sl * 0.22, k), misturar(m.y, 0.4, k), misturar(m.z, 0.12, k));
    // A outra fica quieta na frente da barriga (não bate palma nem ajeita a luva sozinha)
    const o = localMao[d.lado === 'E' ? 'D' : 'E'];
    o.set(misturar(o.x, -sl * 0.24, k), misturar(o.y, 0.12, k), misturar(o.z, 0.28, k));
    // Provocação: olha para o cobrador (a cara dele, atrás da bola), não para a trave
    const bx = bola && bola.pos ? bola.pos.x : gp.x;
    const bz = bola && bola.pos ? bola.pos.z : gp.z + 11;
    olhar.set(misturar(olhar.x, bx, k), misturar(olhar.y, 1.65, k), misturar(olhar.z, bz + 1.8, k));
  }

  // ---------- Split step ----------

  function comecarSplit(gp, yaw) {
    s.split.feito = true;
    s.split.ativo = true;
    s.split.t0 = s.tAgora;
    for (const pe of PES) {
      casa(pe, gp.x, gp.z, yaw, LARGURA_PRONTO, _v3);
      if (pe.estado === 'solto') pe.bico.copy(saida.bicos[pe.lado]);
      comecarPasso(pe, _v3, 0.2, 0.045, yaw);
    }
  }
  // Pulinho do split step e a agachada da aterrissagem
  function alturaSplit() {
    if (!s.split.feito) return 0;
    const u = (s.tAgora - s.split.t0) / 0.2;
    if (u < 1) return 0.05 * sino(u);
    s.split.ativo = false;
    const u2 = (u - 1) / 1.1; // aterrissa e afunda um pouco (0,22 s)
    return -0.035 * sino(Math.min(1, u2 * 1.0)) * (u2 < 1 ? 1 : 0);
  }

  // ---------- Espalmada no corpo (sem as mãos): o corpo sente a pancada ----------

  function espalmadaNoCorpo() {
    const u = (s.tAgora - s.contato.t) / 0.4;
    if (s.contato.t < 0 || u >= 1 || s.contato.maos) return;
    const k = envelope(u, 0.12, 0.3);
    pose.tronco.frente += 0.3 * k;
    pose.cabeca.frente += 0.2 * k;
  }

  // ---------- Mergulho ----------

  function montarMergulho(gp, dt, estado) {
    const m = s.mergulho;
    const sl = m.s;
    const tm = s.tAgora - m.t0;
    const y = gp.y;
    // Quanto já está deitado (pelo quadril baixo e o corpo tombado)
    const kChao = suave((0.62 - y) / 0.3) * suave((Math.abs(gp.rolagem || 0) - 0.4) / 0.6);
    m.kChao = kChao;
    const abracado = estado === 'segurou' && kChao > 0.4;
    // Corpo esticado no ar, curvado no chão
    pose.tronco.frente = misturar(0.06, 0.18, kChao);
    pose.tronco.lado = misturar(-0.2 * sl, -0.04 * sl, kChao);
    pose.tronco.giro = misturar(0.12 * sl, 0.02 * sl, kChao);
    pose.cabeca.frente = misturar(-0.05, 0.05, kChao);
    pose.cabeca.giro = 0;
    pose.quadril.frente = misturar(0.04, 0.12, kChao);
    pose.quadril.lado = -0.06 * sl * (1 - kChao);
    pose.quadril.giro = 0;
    for (const lado of LADOS) {
      const b = bracosPose[lado];
      b.frente = 0.4;
      b.lado = 2.6;
      b.cotovelo = 0.2;
    }
    // Pernas: a de longe sai do chão já no começo e sobe; a do impulso empurra até esticar
    const cima = m.longe.fk;
    const baixo = m.perto.fk;
    misturarPerna(cima, PERNA_VOO_CIMA, PERNA_CHAO_CIMA, kChao);
    misturarPerna(baixo, PERNA_VOO_BAIXO, PERNA_CHAO_BAIXO, kChao);
    if (abracado) {
      const k = suave((s.tAgora - s.segurouEm) / 0.4);
      misturarPerna(cima, cima, PERNA_ABRACO_CIMA, k);
      misturarPerna(baixo, baixo, PERNA_ABRACO_BAIXO, k);
      pose.tronco.frente += 0.25 * k;
      pose.cabeca.frente += 0.25 * k;
    }
    if (!m.soltouLonge) {
      m.soltouLonge = true;
      soltar(m.longe);
    }
    // Impulso: o pé de perto fica plantado e o calcanhar sobe enquanto a perna estica.
    // Sai do chão quando a perna não alcança mais, quando passa da hora ou quando o corpo já desceu.
    const perto = m.perto;
    if (perto.estado !== 'solto') {
      perto.tauBase = 0.15 + 0.5 * suave(tm / 0.16);
      const hora = tm > 0.24 || y < 0.5 || Math.abs(gp.rolagem || 0) > 0.9;
      const lat = lateral(perto.bico, gp.x, gp.z, gp.rotacaoY || 0);
      if (hora || sl * lat < -0.05) soltar(perto);
    }
    // Pousou de pé (mergulho curto, sem deitar): o corpo endireita e os pés voltam ao chão
    m.modoChao = kChao > 0.55 ? 'encosta' : 'livre';
    if (!m.pousouDePe && kChao < 0.2 && Math.abs(gp.rolagem || 0) < 0.85 && y > 0.68 && tm > 0.3
      && (estado === 'caido' || estado === 'segurou')) {
      m.pousouDePe = true;
    }
    m.kEmPe = aproximar(m.kEmPe || 0, m.pousouDePe ? 1 : 0, 7, dt);
    if (m.kEmPe > 0.01) {
      const k = m.kEmPe;
      misturarPerna(cima, cima, G_PRONTO.pernaE, k);
      misturarPerna(baixo, baixo, G_PRONTO.pernaD, k);
      pose.tronco.frente = misturar(pose.tronco.frente, 0.3, k);
      pose.tronco.lado *= 1 - k;
      pose.tronco.giro *= 1 - k;
      pose.quadril.lado *= 1 - k;
      pose.quadril.frente = misturar(pose.quadril.frente, 0.1, k);
    }
    const emPeDeNovo = m.pousouDePe;
    if (emPeDeNovo) {
      const alcanceY = (COXA + CANELA) * ESC.y * 0.95 + 0.07 * ESC.y;
      for (const pe of PES) {
        if (pe.estado === 'solto' && saida.bicos[pe.lado].y < 0.12 && y + (s.offY || 0) < alcanceY) {
          pe.bico.copy(saida.bicos[pe.lado]);
          casa(pe, gp.x, gp.z, gp.rotacaoY || 0, LARGURA_PRONTO, _v3);
          comecarPasso(pe, _v3, 0.12, 0.02, gp.rotacaoY || 0);
        }
      }
      if (pes.E.estado !== 'solto' && pes.D.estado !== 'solto') {
        m.modoChao = 'pes';
        decidirPassos(raiz.p, raiz.yaw, LARGURA_PRONTO, 0.12, 0.03);
      }
    }
    // Acomoda no chão: o corpo quica de leve e assenta
    if (s.chao.tocou) {
      const u = (s.tAgora - s.chao.t) / 0.45;
      if (u < 1) {
        const a = s.chao.forca * Math.exp(-u * 4) * Math.sin(u * Math.PI * 3);
        pose.tronco.frente += 0.12 * a;
        pose.cabeca.frente += 0.18 * a;
        pose.tronco.lado += 0.06 * a * sl;
      }
    }
  }

  function registrarChao(menor) {
    if (!s.chao.tocou && menor < 0.012 && s.mergulho && s.mergulho.kChao > 0.3) {
      s.chao.tocou = true;
      s.chao.t = s.tAgora;
      s.chao.forca = limitar(-vel.y / 3, 0.3, 1);
    }
  }

  // ---------- Mãos ----------

  // Braço esticado do ombro na direção do ponto (x, y, z) do mundo: leva o alvo da mão (_v, mundo)
  // até lá com peso k
  function esticarBraco(lado, x, y, z, k) {
    const ombro = ombros[lado];
    ombro.updateWorldMatrix(true, false);
    _v2.setFromMatrixPosition(ombro.matrixWorld);
    _v3.set(x, y, z).sub(_v2).normalize();
    _v3.multiplyScalar(ALCANCE_BRACO * 0.92).add(_v2);
    _v.lerp(_v3, k);
  }

  function prepararMaos(gp, pesoLogica, bola, estado) {
    const maos = gp.maos;
    for (const lado of LADOS) {
      const m = maos ? (lado === 'D' ? maos.direita : maos.esquerda) : null;
      let w = m ? pesoLogica : 0;
      if (m) alvoMao[lado].set(m.x, m.y, m.z);
      // Encaixou: as luvas ficam na bola (a física prende a bola entre as mãos)
      if (m && estado === 'segurou' && bola && bola.pos) {
        _v.set(m.x - bola.pos.x, m.y - bola.pos.y, m.z - bola.pos.z);
        const d = _v.length();
        if (d > 0.17) alvoMao[lado].set(bola.pos.x, bola.pos.y, bola.pos.z).addScaledVector(_v, 0.15 / d);
      }
      // Espalmada: o braço segue o movimento da bola por um instante
      const uC = (s.tAgora - s.contato.t) / 0.35;
      if (m && s.contato.t >= 0 && uC < 1 && estado !== 'segurou' && s.contato.maos && s.contato.mao === lado) {
        alvoMao[lado].addScaledVector(s.contato.dir, 0.03 * envelope(uC, 0.25, 0.4));
      }
      // Soco no gramado depois do gol (mão de cima)
      if (s.reacao && s.reacao.tipo === 'soco' && s.mergulho) {
        const cima = s.mergulho.s > 0 ? 'D' : 'E';
        if (lado === cima) {
          const u = (s.tAgora - s.reacao.t0) / 0.95;
          const k = envelope(u, 0.15, 0.85);
          // Bate duas vezes: sobe devagar e desce com força
          const ciclo = (u * 2.1) % 1;
          const alto = ciclo < 0.65 ? suave(ciclo / 0.65) : 1 - ((ciclo - 0.65) / 0.35) ** 2;
          _v.set(0, 0.32, 0.38).applyMatrix4(J.quadril.matrixWorld);
          _v.y = 0.06 + 0.32 * alto;
          alvoMao[lado].lerp(_v, k);
          w = Math.max(w, k);
        }
      }
      pesoMao[lado] = w;
      // Mão dos gestos (espaço do tronco), por baixo das mãos da colisão
      if (pesoLocal[lado] > 0 && w < 1) {
        _v.copy(localMao[lado]);
        J.tronco.updateWorldMatrix(true, false);
        J.tronco.localToWorld(_v);
        const d = s.dica;
        if (d.k > 0 && d.lado === lado) {
          // Dica do pênalti: braço esticado apontando a trave daquele lado
          esticarBraco(lado, d.x, 1.5 + d.toque, d.z + d.toqueZ, d.k);
        } else if (s.apontar && s.apontar.k > 0 && s.apontar.lado === lado && s.modo === 'espera') {
          // Apontando para a barreira: braço esticado na direção dela
          esticarBraco(lado, s.apontar.x, 1.5 + s.apontar.toque, s.apontar.z, s.apontar.k);
        }
        if (w > 0) _v.lerp(alvoMao[lado], w);
        alvoMao[lado].copy(_v);
        pesoMao[lado] = 1;
      } else if (w <= 0.001 && pesoLocal[lado] <= 0) {
        pesoMao[lado] = 0;
      }
    }
  }

  // ---------- Depois do lance ----------

  function decidirReacao(gp, fase, estado, modo) {
    if (s.reacao && s.reacao.tipo === 'soco' && !s.transicao && s.tAgora - s.reacao.t0 > 0.95) {
      s.reacao = { tipo: 'frustrado', t0: s.tAgora };
      comecarTransicao(chavesAjoelharDoChao(), 0.95, 'frustrado');
      return;
    }
    if (s.reacao || s.transicao) return;
    if (modo === 'espera' || modo === 'corrida') return;
    const acabou = fase === 'fim';
    const tFim = acabou ? s.tAgora - s.fimDesde : 0;
    if (modo === 'mergulho') {
      const m = s.mergulho;
      if (estado === 'segurou') return; // fica no chão abraçado com a bola
      if (!s.chao.tocou || m.kChao < 0.6) {
        // Mergulho curto que voltou de pé
        if (m.modoChao === 'pes' && acabou && tFim > 0.25) virarPosLance(gp);
        return;
      }
      const noChao = s.tAgora - s.chao.t;
      if (!(acabou && noChao > (s.gol ? 0.2 : 0.35)) && !(estado === 'caido' && noChao > 1.4)) return;
      if (s.gol) {
        // Gol: bate a mão no gramado, ou fica um instante no chão e ajoelha frustrado
        if (s.sorteio() < 0.55) s.reacao = { tipo: 'soco', t0: s.tAgora };
        else {
          s.reacao = { tipo: 'frustrado', t0: s.tAgora };
          comecarTransicao(chavesAjoelharDoChao(), 1.1, 'frustrado');
        }
      } else if (s.tocou) {
        comecarTransicao(chavesLevantar(), 0.95, 'vibrar');
      } else {
        comecarTransicao(chavesLevantar(), 1.15, 'neutro');
      }
      return;
    }
    if (modo === 'dePe' && acabou && tFim > 0.2) virarPosLance(gp);
  }

  function virarPosLance(gp) {
    s.posLance = true;
    const segurando = gp.estado === 'segurou';
    if (segurando) s.reacao = { tipo: 'segurando', t0: s.tAgora };
    else if (s.gol) {
      s.reacao = { tipo: 'frustrado', t0: s.tAgora };
      s.posLance = false;
      comecarTransicao(chavesAjoelhar(), 0.55, 'frustrado');
    } else if (s.tocou) s.reacao = { tipo: 'vibrar', t0: s.tAgora };
    else s.reacao = { tipo: 'neutro', t0: s.tAgora };
  }

  // Levantar do chão: encolhe as pernas ainda de lado, apoia as mãos e fica de joelhos, põe um pé
  // na frente e fica de pé. rol das chaves: fração da rolagem de quando começou.
  function chavesLevantar() {
    return [
      { u: 0.28, pose: G_ENCOLHIDO, rol: 0.8, fracao: true },
      { u: 0.5, pose: G_AJOELHADO, rol: 0 },
      { u: 0.74, pose: G_MEIO_JOELHO, rol: 0 },
      { u: 1, pose: G_DE_PE, rol: 0 },
    ];
  }
  function chavesAjoelharDoChao() {
    return [
      { u: 0.35, pose: G_ENCOLHIDO, rol: 0.8, fracao: true },
      { u: 0.7, pose: G_AJOELHADO, rol: 0 },
      { u: 1, pose: G_FRUSTRADO, rol: 0 },
    ];
  }
  function chavesAjoelhar() {
    return [{ u: 1, pose: G_FRUSTRADO, rol: 0 }];
  }

  function terminarTransicao(tr) {
    s.transicao = null;
    if (tr.depois === 'frustrado') {
      // Fica de joelhos: congela a última pose (continua encostado no chão)
      s.transicao = { ...tr, t0: s.tAgora - tr.dur, dur: tr.dur, chaves: [{ u: 1, pose: G_FRUSTRADO, rol: 0 }], depois: 'parado' };
      copiarPose(poseLev, G_FRUSTRADO);
      return;
    }
    if (tr.depois === 'parado') {
      s.transicao = { ...tr, t0: s.tAgora - tr.dur };
      return;
    }
    // De pé: planta os pés onde estão e passa para a reação
    s.posLance = true;
    s.reacao = { tipo: tr.depois || 'neutro', t0: s.tAgora };
    _v.set(0, 0, 0).applyMatrix4(J.quadril.matrixWorld);
    raiz.p.set(_v.x, _v.y, _v.z);
    for (const pe of PES) {
      const b = saida.bicos[pe.lado];
      plantar(pe, b.x, b.z, raiz.yaw);
      pe.tau = 0;
    }
  }

  function montarPosLance(t) {
    const r = s.reacao || { tipo: 'neutro', t0: s.tAgora };
    const u = s.tAgora - r.t0;
    copiarPose(pose, G_DE_PE);
    pose.tronco.frente += 0.01 * Math.sin(t * 1.9);
    for (const pe of PES) pe.tauBase = 0;
    if (r.tipo === 'vibrar') {
      // Vibra com o punho: soca o ar algumas vezes, peito para fora, olhando para cima
      const k = envelope(u / 1.6, 0.12, 0.8);
      pose.tronco.frente -= 0.16 * k;
      pose.cabeca.frente -= 0.35 * k;
      const soco = Math.max(0, Math.sin(u * Math.PI * 2 * 2.2));
      localMao.D.set(-0.24, misturar(0.1, 0.62 + 0.12 * soco, k), misturar(0.25, 0.14, k));
      localMao.E.set(0.26, 0.05, 0.18 + 0.1 * k);
      pesoLocal.D = pesoLocal.E = 1;
      olhar.set(raiz.p.x, 3.2, raiz.p.z + 6);
    } else if (r.tipo === 'segurando') {
      // Com a bola no peito: o corpo vai se endireitando
      const k = suave(u / 0.6);
      pose.tronco.frente += 0.18 * (1 - k);
    } else {
      // Neutro: braços soltos, acompanha a bola
      pose.tronco.frente += 0.05;
    }
  }

  // ---------- Medidas (para os testes) ----------

  function medir(gp) {
    grupo.updateMatrixWorld(true);
    let menor = Infinity;
    let menorSola = Infinity;
    for (let i = 0; i < sondas.length; i++) {
      const sd = sondas[i];
      if (!sd.regra) continue;
      _v.copy(sd.local).applyMatrix4(sd.junta.matrixWorld);
      if (_v.y < menor) saida.parteMaisBaixa = sd.nome;
      menor = Math.min(menor, _v.y);
      if (sd.nome.startsWith('tornozelo')) menorSola = Math.min(menorSola, _v.y);
    }
    saida.menorY = menor;
    saida.menorSola = menorSola;
    for (const pe of PES) {
      tornozelos[pe.lado].localToWorld(saida.bicos[pe.lado].set(BICO[0], BICO[1], BICO[2]));
      saida.pesPlantados[pe.lado] = pe.estado === 'plantado';
      saida.estadosPes[pe.lado] = pe.estado;
    }
    let erro = 0;
    if (gp.maos) {
      for (const lado of LADOS) {
        const m = lado === 'D' ? gp.maos.direita : gp.maos.esquerda;
        _v.copy(PALMA_LUVA);
        punhos[lado].localToWorld(_v);
        erro = Math.max(erro, Math.hypot(_v.x - m.x, _v.y - m.y, _v.z - m.z));
      }
    }
    saida.erroLuvas = erro;
  }

  return { atualizar, reiniciar, saida };
}

// ======================================================================
// BARREIRA
// ======================================================================

// Mãos protegendo (espaço do tronco: origem na cintura, y para cima, z para a frente; boneco de 1,80 m)
const PROTECAO = [
  { E: [0.03, -0.14, 0.16], D: [-0.03, -0.17, 0.15] },  // as duas na frente do calção
  { E: [0.03, -0.15, 0.16], D: [0.07, 0.31, 0.17] },    // uma embaixo e o braço direito cruzado no peito
  { E: [-0.02, -0.12, 0.17], D: [0.03, -0.16, 0.15] },  // as duas embaixo, a esquerda por cima
];
// No pulo: uns protegem o corpo, outros o rosto
const PROTECAO_PULO = [
  { E: [0.03, -0.12, 0.17], D: [-0.03, -0.15, 0.16] },
  { E: [0.07, 0.6, 0.17], D: [-0.07, 0.57, 0.19] },
  { E: [0.06, 0.58, 0.18], D: [-0.06, 0.62, 0.16] },
];
const GESTOS = ['olhar', 'olhar', 'empurrar', 'ajeitar', 'ajeitar', 'respirar', 'quicar'];
const DURACAO_GESTO = { olhar: 0.9, empurrar: 0.75, ajeitar: 0.7, respirar: 1.1, quicar: 0.8, empurrado: 0.55 };

export function criarAnimadorBarreira(personagens, opcoes = {}) {
  const sorteio = criarSorteio(Math.floor((opcoes.semente ?? Math.random()) * 1e9));
  const diagnostico = opcoes.diagnostico !== false;
  const jogadores = personagens.map((per, i) => {
    const J = per.juntas;
    const tipo = (i + Math.floor(sorteio() * 3)) % 3;
    const esc = J.quadril.parent.scale;
    return {
      per, J, i, esc,
      pose: novaPose(),
      protecao: PROTECAO[tipo],
      protecaoPulo: PROTECAO_PULO[(tipo + (sorteio() < 0.5 ? 0 : 1)) % 3],
      fase0: sorteio() * Math.PI * 2,
      rapidezOlhar: 6 + sorteio() * 6,
      gesto: { tipo: null, t0: -9, dur: 1, vizinho: -1, lado: 0 },
      proximoGesto: 0.4 + sorteio() * 2.2,
      empurrado: { t0: -9, lado: 0, por: -1 },
      batida: { t0: -9, forca: 0, x: 0, y: 0, lado: 1, parte: 'corpo', mao: 'E' },
      pousoT: -9,
      noAr: false,
      giroExtra: 0,
      faseGiro: 0,
      sentido: 0,
      cab: { f: 0, g: 0, ok: false },
      alvo: new THREE.Vector3(),
      off: new THREE.Vector3(),
    };
  });
  let tAgora = 0;
  let tEspera = 0;
  let tCorrida = 0;
  let tVoo = 0;
  let tFim = 0;
  let batidasVistas = 0;
  let bolaPassou = false;
  let tensao = 0;
  let gol = false;
  const saida = { menorY: 0 };

  function reiniciar() {
    tAgora = tEspera = tCorrida = tVoo = tFim = 0;
    batidasVistas = 0;
    bolaPassou = false;
    tensao = 0;
    gol = false;
    for (const jog of jogadores) {
      jog.gesto.tipo = null;
      jog.proximoGesto = 0.4 + sorteio() * 2.2;
      jog.empurrado.t0 = -9;
      jog.batida.t0 = -9;
      jog.pousoT = -9;
      jog.noAr = false;
      jog.giroExtra = 0;
      jog.faseGiro = 0;
      jog.sentido = 0;
      jog.cab.ok = false;
    }
  }

  // Lado (+1 = esquerda do jogador, −1 = direita) em que fica o ponto (x, z) para o jogador j
  function ladoDe(j, x, z) {
    const yaw = j.rotacaoY || 0;
    return (x - j.x) * Math.cos(yaw) - (z - j.z) * Math.sin(yaw) >= 0 ? 1 : -1;
  }

  function comecarBatida(jog, ub, bola) {
    const b = jog.batida;
    b.t0 = tAgora;
    b.forca = limitar((ub.impacto || 12) / 16, 0.6, 1.3);
    b.parte = ub.parte || 'corpo';
    let x = 0;
    let y = 1.2;
    if (bola && bola.pos) {
      _v.set(bola.pos.x, bola.pos.y, bola.pos.z);
      jog.per.grupo.worldToLocal(_v);
      x = _v.x;
      y = _v.y;
    }
    b.lado = x >= 0 ? 1 : -1;
    b.mao = b.lado > 0 ? 'E' : 'D';
    // Ponto da batida no espaço do tronco (para levar a mão até ele)
    const e = jog.esc.y;
    b.x = limitar(x / jog.esc.x, -0.16, 0.16);
    b.y = limitar((y - jog.per.alturaQuadril - 0.07 * e) / e, -0.22, 0.42);
  }

  function escolherGesto(jog, barreira) {
    const n = barreira.jogadores.length;
    let tipo = GESTOS[Math.floor(sorteio() * GESTOS.length)];
    const vizinhos = [];
    if (jog.i > 0) vizinhos.push(jog.i - 1);
    if (jog.i < n - 1) vizinhos.push(jog.i + 1);
    const vizinho = vizinhos.length ? vizinhos[Math.floor(sorteio() * vizinhos.length)] : -1;
    if ((tipo === 'olhar' || tipo === 'empurrar') && vizinho < 0) tipo = 'respirar';
    const g = jog.gesto;
    g.tipo = tipo;
    g.t0 = tAgora;
    g.dur = DURACAO_GESTO[tipo];
    g.vizinho = vizinho;
    const jv = vizinho >= 0 ? barreira.jogadores[vizinho] : null;
    g.lado = jv ? ladoDe(barreira.jogadores[jog.i], jv.x, jv.z) : 1;
    if (tipo === 'empurrar' && jv) {
      // O vizinho sente o empurrão um pouco depois e olha para quem empurrou
      const outro = jogadores[vizinho];
      if (outro && !outro.gesto.tipo) {
        outro.empurrado.t0 = tAgora + 0.22;
        outro.empurrado.lado = -ladoDe(jv, barreira.jogadores[jog.i].x, barreira.jogadores[jog.i].z);
        outro.empurrado.por = jog.i;
      }
    }
    jog.proximoGesto = tEspera + g.dur + 1.2 + sorteio() * 2.8;
  }

  function maoEm(pose, lado, p, peso) {
    const m = lado === 'E' ? pose.maoE : pose.maoD;
    m.x = p[0];
    m.y = p[1];
    m.z = p[2];
    m.peso = peso;
  }
  function puxarMao(pose, lado, x, y, z, k) {
    const m = lado === 'E' ? pose.maoE : pose.maoD;
    m.x = misturar(m.x, x, k);
    m.y = misturar(m.y, y, k);
    m.z = misturar(m.z, z, k);
  }

  function atualizar(barreira, t, dt, info = {}) {
    if (!barreira || !barreira.jogadores) return saida;
    dt = limitar(dt || 0, 0, 0.1);
    tAgora += dt;
    const fase = info.fase || 'voo';
    const bola = info.bola || null;
    const antes = fase === 'pronto' || fase === 'carregando' || fase === 'corrida';
    let tc = info.tempoDesdeChute;
    if (fase === 'corrida') {
      tCorrida += dt;
      if (tc == null || !Number.isFinite(tc)) tc = tCorrida - 0.8;
    } else if (antes) {
      tCorrida = 0;
      tEspera += dt;
      tc = -10;
    } else {
      tVoo += dt;
      if (tc == null || !Number.isFinite(tc)) tc = tVoo;
    }
    if (fase === 'fim') tFim += dt;

    // Bolada nova
    if ((barreira.batidas || 0) > batidasVistas) {
      batidasVistas = barreira.batidas;
      const ub = barreira.ultimaBatida;
      if (ub && jogadores[ub.jogador]) comecarBatida(jogadores[ub.jogador], ub, bola);
    }
    // A bola já passou da barreira (indo para o gol)?
    let zMedio = 0;
    for (const j of barreira.jogadores) zMedio += j.z / barreira.jogadores.length;
    if (bola && bola.pos && !antes && !bolaPassou && bola.pos.z < zMedio - 0.3 && bola.vel.z < 0) bolaPassou = true;
    if (bola && bola.pos && !antes && (bola.gol || (bola.pos.z < -0.25 && Math.abs(bola.pos.x) < 3.66 && bola.pos.y < 2.44))) gol = true;
    // Tensão: aperta quando o cobrador corre, solta depois que a bola passa
    const alvoTensao = fase === 'corrida' ? 1 : antes ? 0 : bolaPassou || fase === 'fim' ? 0.3 : 1;
    tensao = aproximar(tensao, alvoTensao, alvoTensao > tensao ? 6 : 2, dt);

    let menor = Infinity;
    const n = Math.min(jogadores.length, barreira.jogadores.length);
    for (let i = 0; i < n; i++) {
      const jog = jogadores[i];
      const j = barreira.jogadores[i];
      animarJogador(jog, j, barreira, t, dt, fase, antes, tc, bola);
      if (diagnostico) menor = Math.min(menor, medirJogador(jog));
    }
    saida.menorY = menor;
    return saida;
  }

  function animarJogador(jog, j, barreira, t, dt, fase, antes, tc, bola) {
    const pose = jog.pose;
    const J = jog.J;
    const per = jog.per;
    const ph = jog.fase0;
    const respira = Math.sin(t * 1.9 + ph);
    const peso = Math.sin(t * 0.55 + ph);

    // ----- Base: de pé, ombro a ombro, mãos protegendo, respirando -----
    pose.tronco.frente = 0.05 + 0.014 * respira + 0.07 * tensao;
    pose.tronco.lado = 0.02 * peso;
    pose.tronco.giro = 0;
    pose.cabeca.frente = 0.06;
    pose.cabeca.giro = 0;
    pose.quadril.frente = 0.03 * tensao;
    pose.quadril.lado = -0.03 * peso;
    pose.quadril.giro = 0;
    pose.pernaE.frente = 0.02;
    pose.pernaE.lado = 0.05 + 0.02 * peso;
    pose.pernaE.joelho = 0.06 + 0.1 * tensao;
    pose.pernaE.tornozelo = 0;
    pose.pernaD.frente = -0.02;
    pose.pernaD.lado = 0.05 - 0.02 * peso;
    pose.pernaD.joelho = 0.06 + 0.1 * tensao;
    pose.pernaD.tornozelo = 0;
    pose.bracoE.frente = pose.bracoD.frente = 0.45;
    pose.bracoE.lado = pose.bracoD.lado = 0.12;
    pose.bracoE.cotovelo = pose.bracoD.cotovelo = 1.0;
    pose.agachar = 0.03 + 0.08 * tensao + 0.01 * respira;
    pose.apoio = 1;
    pose.pulo = 0;
    const aperta = 1 + 0.06 * tensao; // na hora do chute as mãos apertam mais o corpo
    maoEm(pose, 'E', jog.protecao.E, 1);
    maoEm(pose, 'D', jog.protecao.D, 1);
    pose.maoE.z /= aperta;
    pose.maoD.z /= aperta;
    let olharPeso = 1;
    let extraFrente = 0;
    let extraGiro = 0;
    jog.off.set(0, 0, 0);
    if (bola && bola.pos) jog.alvo.set(bola.pos.x, bola.pos.y, bola.pos.z);
    else jog.alvo.set(barreira.bola ? barreira.bola.x : j.x, 0.2, barreira.bola ? barreira.bola.z : j.z + 9);

    // ----- Antes do chute: se ajeitam, olham uns para os outros, um empurra de leve -----
    const g = jog.gesto;
    if (antes && fase !== 'corrida') {
      if (!g.tipo && tEspera > jog.proximoGesto && tAgora > jog.empurrado.t0 + 0.6) escolherGesto(jog, barreira);
    }
    if (g.tipo) {
      let u = (tAgora - g.t0) / g.dur;
      if (!antes || fase === 'corrida') u = Math.max(u, 0.85); // o cobrador correu: volta logo para a posição
      if (u >= 1) g.tipo = null;
      else {
        const k = envelope(u, 0.22, 0.72);
        const jv = g.vizinho >= 0 ? barreira.jogadores[g.vizinho] : null;
        if (g.tipo === 'olhar' && jv) {
          jog.alvo.lerp(_v.set(jv.x, (jv.yPes || 0) + 1.65, jv.z), k);
          pose.tronco.giro += 0.12 * g.lado * k;
        } else if (g.tipo === 'empurrar' && jv) {
          const lado = g.lado > 0 ? 'E' : 'D';
          puxarMao(pose, lado, g.lado * 0.44, 0.36, 0.06, k);
          pose.tronco.giro += 0.14 * g.lado * k;
          pose.tronco.lado += -0.07 * g.lado * k;
          jog.alvo.lerp(_v.set(jv.x, (jv.yPes || 0) + 1.6, jv.z), k * 0.7);
        } else if (g.tipo === 'ajeitar') {
          // Puxa o calção e pisa no lugar
          puxarMao(pose, 'E', 0.17, -0.03, 0.05, k);
          puxarMao(pose, 'D', -0.17, -0.03, 0.05, k);
          const pisa = sino((u - 0.2) / 0.5);
          const perna = jog.i % 2 ? pose.pernaE : pose.pernaD;
          perna.joelho += 0.45 * pisa;
          perna.frente += 0.12 * pisa;
          extraFrente += 0.15 * k;
        } else if (g.tipo === 'respirar') {
          pose.tronco.frente -= 0.07 * k;
          extraFrente -= 0.18 * k;
          pose.agachar -= 0.02 * k;
        } else if (g.tipo === 'quicar') {
          pose.agachar += 0.07 * Math.abs(Math.sin(u * Math.PI * 4)) * k;
        }
      }
    }
    // Empurrado: inclina para o lado, dá um passinho e olha para quem empurrou
    const ue = (tAgora - jog.empurrado.t0) / DURACAO_GESTO.empurrado;
    if (ue > 0 && ue < 1) {
      const k = envelope(ue, 0.18, 0.5);
      const ld = jog.empurrado.lado; // +1: empurrado para a esquerda dele
      pose.tronco.lado += -0.11 * ld * k;
      pose.quadril.lado += 0.04 * ld * k;
      const perna = ld > 0 ? pose.pernaE : pose.pernaD;
      perna.joelho += 0.3 * sino(ue / 0.6);
      perna.lado += 0.08 * sino(ue / 0.6);
      const quem = barreira.jogadores[jog.empurrado.por];
      if (quem) jog.alvo.lerp(_v.set(quem.x, 1.6, quem.z), k);
    }

    // ----- Pulo -----
    const pulo = j.pulo;
    const p = j.progressoPulo || 0;
    if (pulo && pulo.vai && !antes) {
      if (p <= 0) {
        // Prepara: dobra os joelhos logo antes de sair do chão
        const k = suave((tc - (pulo.atraso - 0.16)) / 0.16);
        pose.agachar += 0.3 * k;
        pose.tronco.frente += 0.1 * k;
      } else if (p < 1) {
        jog.noAr = true;
        // Sobe esticado (bico para baixo), encolhe os joelhos no alto e estica de novo para pousar
        const kT = sino(limitar((p - 0.08) / 0.78, 0, 1));
        const kPe = 1 - suave((p - 0.72) / 0.28);
        pose.pernaE.frente = 0.05 + 0.34 * kT;
        pose.pernaD.frente = 0.03 + 0.28 * kT;
        pose.pernaE.joelho = 0.08 + 0.85 * kT;
        pose.pernaD.joelho = 0.08 + 0.75 * kT;
        pose.pernaE.tornozelo = pose.pernaD.tornozelo = 0.1 + 0.5 * kPe;
        pose.pernaE.lado = pose.pernaD.lado = 0.06;
        pose.agachar = 0;
        pose.tronco.frente = 0.05 + 0.12 * kT;
        extraFrente += 0.12;
        const kp = suave(p / 0.2);
        maoEm(pose, 'E', jog.protecaoPulo.E, 1);
        maoEm(pose, 'D', jog.protecaoPulo.D, 1);
        puxarMao(pose, 'E', jog.protecao.E[0], jog.protecao.E[1], jog.protecao.E[2], 1 - kp);
        puxarMao(pose, 'D', jog.protecao.D[0], jog.protecao.D[1], jog.protecao.D[2], 1 - kp);
      }
    }
    if (jog.noAr && p >= 1) {
      jog.noAr = false;
      jog.pousoT = tAgora;
    }
    // Aterrissagem: os joelhos dobram e o corpo volta
    const uP = (tAgora - jog.pousoT) / 0.42;
    if (uP > 0 && uP < 1) {
      const a = uP < 0.12 ? suave(uP / 0.12) : 1 - suave((uP - 0.12) / 0.88);
      pose.agachar += 0.32 * a;
      pose.tronco.frente += 0.14 * a;
      pose.bracoE.lado += 0.2 * a;
      pose.bracoD.lado += 0.2 * a;
    }

    // ----- Quem fica firme: se encolhe quando a bola passa perto -----
    if (bola && bola.pos && !antes && !bolaPassou) {
      const cabY = (j.yPes || 0) + (j.altura || 1.85) - 0.12;
      const d = Math.hypot(bola.pos.x - j.x, bola.pos.y - cabY, bola.pos.z - j.z);
      const k = suave((1.5 - d) / 1.0);
      if (k > 0) {
        extraFrente += 0.22 * k;
        extraGiro -= 0.35 * k * ladoDe(j, bola.pos.x, bola.pos.z);
        pose.tronco.frente += 0.06 * k;
        pose.agachar += 0.05 * k;
      }
    }

    // ----- Bolada: se encolhe, vira o corpo e leva a mão ao lugar -----
    const b = jog.batida;
    const ub = (tAgora - b.t0) / 0.7;
    if (ub > 0 && ub < 1) {
      const env = envelope(ub, 0.08, 0.55);
      const k = env * b.forca;
      if (b.parte === 'cabeca') {
        extraFrente -= 0.32 * k;
        pose.tronco.frente -= 0.06 * k;
        puxarMao(pose, b.mao, b.lado * 0.05, 0.6, 0.16, Math.min(1, env * 1.4));
      } else {
        pose.tronco.frente += 0.36 * k;
        extraFrente += 0.3 * k;
        pose.agachar += 0.12 * k;
        pose.quadril.frente += 0.08 * k;
        puxarMao(pose, b.mao, b.x, b.y, 0.17, Math.min(1, env * 1.4));
      }
      pose.tronco.giro += b.lado * 0.42 * k;
      pose.quadril.giro += b.lado * 0.14 * k;
      jog.off.z -= 0.06 * k;
      olharPeso *= 1 - 0.8 * env;
    }

    // ----- Depois que a bola passa: viram para o gol -----
    if (bolaPassou && bola && bola.pos) {
      const yaw = j.rotacaoY || 0;
      let a = angulo(Math.atan2(bola.pos.x - j.x, bola.pos.z - j.z) - yaw);
      if (!jog.sentido) jog.sentido = a >= 0 ? 1 : -1;
      if (Math.sign(a) !== jog.sentido && Math.abs(a) > 2.2) a += jog.sentido * Math.PI * 2;
      const antesGiro = jog.giroExtra;
      jog.giroExtra = aproximar(jog.giroExtra, limitar(a * 0.72, -2.3, 2.3), 4.2, dt);
      const dg = Math.abs(jog.giroExtra - antesGiro);
      jog.faseGiro += dg * 2.6;
      const kPasso = limitar(dg / Math.max(dt, 1e-4) / 1.4, 0, 1);
      const sf = Math.sin(jog.faseGiro * Math.PI);
      pose.pernaE.joelho += 0.4 * kPasso * Math.max(0, sf);
      pose.pernaE.frente += 0.14 * kPasso * Math.max(0, sf);
      pose.pernaD.joelho += 0.4 * kPasso * Math.max(0, -sf);
      pose.pernaD.frente += 0.14 * kPasso * Math.max(0, -sf);
      pose.tronco.giro += limitar(a - jog.giroExtra, -0.5, 0.5) * 0.6;
    }

    // ----- Fim: gol sofrido (mãos na cabeça ou na cintura) ou alívio -----
    if (fase === 'fim') {
      const k = suave((tFim - 0.45) / 0.5);
      if (gol && k > 0) {
        if (jog.i % 2 === 0) {
          puxarMao(pose, 'E', 0.08, 0.78, 0.03, k);
          puxarMao(pose, 'D', -0.08, 0.78, 0.03, k);
        } else {
          puxarMao(pose, 'E', 0.21, -0.02, -0.01, k);
          puxarMao(pose, 'D', -0.21, -0.02, -0.01, k);
        }
        extraFrente += 0.3 * k;
        pose.tronco.frente += 0.08 * k;
      } else if (k > 0) {
        // Alívio: solta os braços
        pose.maoE.peso *= 1 - 0.85 * k;
        pose.maoD.peso *= 1 - 0.85 * k;
        pose.bracoE.frente = misturar(pose.bracoE.frente, 0.1, k);
        pose.bracoD.frente = misturar(pose.bracoD.frente, 0.1, k);
        pose.bracoE.cotovelo = misturar(pose.bracoE.cotovelo, 0.35, k);
        pose.bracoD.cotovelo = misturar(pose.bracoD.cotovelo, 0.35, k);
        pose.bracoE.lado = misturar(pose.bracoE.lado, 0.18, k);
        pose.bracoD.lado = misturar(pose.bracoD.lado, 0.18, k);
      }
    }

    // ----- Monta -----
    per.aplicarPose(pose);
    const yaw = (j.rotacaoY || 0) + jog.giroExtra;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    per.grupo.position.set(j.x + jog.off.x * c + jog.off.z * sn, j.yPes || 0, j.z - jog.off.x * sn + jog.off.z * c);
    per.grupo.rotation.set(0, yaw, 0);
    per.grupo.updateMatrixWorld(true);
    // Cabeça: segue a bola (ou o gesto)
    _v.copy(jog.alvo);
    J.tronco.worldToLocal(_v);
    _v.sub(J.cabeca.position);
    _v.y -= 0.17;
    const giro = limitar(Math.atan2(_v.x, _v.z), -1.3, 1.3);
    const frente = limitar(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.8, 0.8);
    if (!jog.cab.ok) {
      jog.cab.f = frente;
      jog.cab.g = giro;
      jog.cab.ok = true;
    }
    jog.cab.f = aproximar(jog.cab.f, frente, jog.rapidezOlhar, dt);
    jog.cab.g = aproximar(jog.cab.g, giro, jog.rapidezOlhar, dt);
    J.cabeca.rotation.set(
      misturar(pose.cabeca.frente, jog.cab.f, olharPeso) + extraFrente,
      misturar(pose.cabeca.giro, jog.cab.g, olharPeso) + extraGiro,
      0,
    );
  }

  // Ponto mais baixo das solas e dos joelhos (para os testes)
  function medirJogador(jog) {
    let menor = Infinity;
    jog.per.grupo.updateMatrixWorld(true);
    for (const lado of LADOS) {
      const to = lado === 'E' ? jog.J.tornozeloE : jog.J.tornozeloD;
      for (let i = 0; i < SOLA.length; i++) {
        _v.set(SOLA[i][0], SOLA[i][1], SOLA[i][2]).applyMatrix4(to.matrixWorld);
        menor = Math.min(menor, _v.y);
      }
      const jo = lado === 'E' ? jog.J.joelhoE : jog.J.joelhoD;
      _v.setFromMatrixPosition(jo.matrixWorld);
      menor = Math.min(menor, _v.y);
    }
    return menor;
  }

  return { atualizar, reiniciar, saida };
}
