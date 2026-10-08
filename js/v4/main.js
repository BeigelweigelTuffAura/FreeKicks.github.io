import * as THREE from 'three';
import { CONFIG, VERSAO } from './config.js?v=4';
import { criarBola, chutar, passo, noChao, coneDeErro, preverTecnica } from './physics.js?v=4';
import { ELENCO, sugerirCobradores } from './elenco.js?v=4';
import { criarCenario } from './estadio.js?v=4';
import { montarBarreira, atualizarBarreira, colidirBolaBarreira, PADRAO_BARREIRA } from './barreira.js?v=4';
import { criarGoleiro, atualizarGoleiro, colidirBolaGoleiro, PADRAO_GOLEIRO } from './goleiro.js?v=4';
import {
  criarPersonagem, criarSombraBlob, criarCobranca, posicionarBarreira, posicionarGoleiro, PADRAO_COBRANCA,
  visualAdversario, VISUAL_GOLEIRO_ADVERSARIO, UNIFORMES, poseChute, poseComemoracao, poseLamento, misturarPoses,
} from './jogadores.js?v=4';
import { criarAudio, PADRAO_AUDIO } from './audio.js?v=4';
import { criarInterface } from './interface.js?v=6';
import { criarPainel } from './painel.js?v=4';

// Os padrões de goleiro, barreira, cobrador, som e cenário moram nos próprios módulos;
// entram no CONFIG aqui (o que estiver escrito no config.js tem prioridade)
CONFIG.goleiro = { ...PADRAO_GOLEIRO, ...(CONFIG.goleiro || {}) };
CONFIG.barreira = { ...PADRAO_BARREIRA, ...(CONFIG.barreira || {}) };
CONFIG.cobrador = { ...PADRAO_COBRANCA, ...(CONFIG.cobrador || {}) };
CONFIG.audio = { ...PADRAO_AUDIO, ...(CONFIG.audio || {}) };
CONFIG.cenario = { festaSegura: 1.6, festaDuracao: 3, redeMola: 70, redeAmortecimento: 8, ...(CONFIG.cenario || {}) };

const GRAUS = Math.PI / 180;
const PASSO_FISICA = 1 / 240; // a física roda em passos pequenos e fixos, independente do celular
const GIRO_VISUAL = 0.35;     // a bola gira mais devagar na tela do que na física, para o olho acompanhar
const GIRO_VISUAL_MAX = 40;   // rad/s: acima disso a bola parece girar para trás na tela
const CONTATO_MAXIMO = 0.95;  // até onde o ponto de contato pode ir na borda da bola

// Com ?teste no endereço, cada quadro vale exatamente 1/60 s e o sorteio é sempre o mesmo:
// os testes automáticos ficam previsíveis
const MODO_TESTE = new URLSearchParams(location.search).has('teste');
window.tempoDeJogo = 0;
const aleatorio = MODO_TESTE
  ? (() => {
    let s = 12345;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })()
  : Math.random;

// ---------- Renderizador, cena e cenário ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('jogo').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
const cenario = criarCenario(scene, renderer, CONFIG);

function texturaDeCanvas(canvas) {
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

// ---------- Bola, sombra e rastro ----------

// Desenha uma bola clássica: branca com 12 manchas pretas (nos vértices de um icosaedro)
function texturaBola() {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const imagem = ctx.createImageData(W, H);
  const vertices = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const manchas = [];
  for (let i = 0; i < vertices.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(vertices, i).normalize();
    if (!manchas.some((m) => m.distanceTo(v) < 0.01)) manchas.push(v);
  }
  const dir = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    const theta = (y / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const phi = (x / W) * Math.PI * 2;
      dir.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      const preto = manchas.some((m) => m.dot(dir) > 0.93);
      const i = (y * W + x) * 4;
      const cor = preto ? 30 : 245;
      imagem.data[i] = imagem.data[i + 1] = imagem.data[i + 2] = cor;
      imagem.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);
  return texturaDeCanvas(canvas);
}

const bolaMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.raioBola, 32, 16),
  new THREE.MeshLambertMaterial({ map: texturaBola() })
);
scene.add(bolaMesh);
const sombraBola = criarSombraBlob(0.3);
scene.add(sombraBola);

// Rastro: pontinhos que ficam para trás da bola durante o voo, para enxergar a curva
const RASTRO_MAX = 70;
const rastro = (() => {
  const posicoes = new Float32Array(RASTRO_MAX * 3);
  const cores = new Float32Array(RASTRO_MAX * 3);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometria.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geometria.setDrawRange(0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const pontos = new THREE.Points(geometria, new THREE.PointsMaterial({
    size: 0.26, map: texturaDeCanvas(canvas), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  pontos.frustumCulled = false;
  scene.add(pontos);
  let total = 0;
  let acumulado = 0;
  return {
    limpar() {
      total = 0;
      geometria.setDrawRange(0, 0);
    },
    adicionar(pos, dt) {
      acumulado += dt;
      if (acumulado < 1 / 50) return;
      acumulado = 0;
      if (total === RASTRO_MAX) {
        posicoes.copyWithin(0, 3);
        total--;
      }
      posicoes.set([pos.x, pos.y, pos.z], total * 3);
      total++;
      // Os pontos mais antigos ficam mais apagados
      for (let i = 0; i < total; i++) {
        const k = (i + 1) / total;
        cores.set([k * 0.9, k * 0.85, k * 0.55], i * 3);
      }
      geometria.attributes.position.needsUpdate = true;
      geometria.attributes.color.needsUpdate = true;
      geometria.setDrawRange(0, total);
    },
    set visivel(sim) {
      pontos.visible = sim;
    },
  };
})();

// ---------- Mira: alvo no gol, faixa do erro e linha no chão ----------

const mira = { x: 0 };
const ALTURA_MIRA = 1.25;
const alvoMira = (() => {
  const grupo = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xf7d84a, transparent: true, opacity: 0.95, depthTest: false });
  grupo.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 40), material));
  for (const [w, h] of [[0.9, 0.05], [0.05, 0.9]]) grupo.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), material));
  grupo.children.forEach((c) => { c.renderOrder = 11; });
  scene.add(grupo);
  return grupo;
})();

// Faixa do erro: a bola costuma sair dentro dela (cresce quando a força passa do ponto ideal)
const faixaErro = (() => {
  const malha = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xf7d84a, transparent: true, opacity: 0.32, depthTest: false })
  );
  malha.renderOrder = 10;
  scene.add(malha);
  return malha;
})();

const guiaMira = (() => {
  const geometria = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const linha = new THREE.Line(geometria, new THREE.LineDashedMaterial({
    color: 0xf7d84a, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.55,
  }));
  scene.add(linha);
  return linha;
})();

function mostrarMira(visivel) {
  alvoMira.visible = visivel;
  guiaMira.visible = visivel;
  faixaErro.visible = visivel;
}

function atualizarMira() {
  alvoMira.position.set(mira.x, ALTURA_MIRA, 0.05);
  alvoMira.lookAt(camera.position.x, ALTURA_MIRA, camera.position.z);

  // Largura da faixa: ±1,5 desvio padrão do erro na distância do gol
  const forca = estado.fase === 'carregando' ? Math.max(estado.carga, 0.3) : CONFIG.forcaIdeal;
  const sigma = coneDeErro({ forca, contato, cobrador, pressao: 0 }, CONFIG);
  const distancia = Math.hypot(mira.x - bola.pos.x, bola.pos.z);
  const largura = Math.max(0.2, 2 * distancia * Math.tan(1.5 * sigma * GRAUS));
  faixaErro.scale.x = largura;
  faixaErro.position.set(mira.x, ALTURA_MIRA, 0.04);
  faixaErro.lookAt(camera.position.x, ALTURA_MIRA, camera.position.z);
  faixaErro.material.color.set(forca > CONFIG.forcaIdeal + 0.02 ? 0xff6b3d : 0xf7d84a);

  const pontos = guiaMira.geometry.attributes.position;
  pontos.setXYZ(0, bola.pos.x, 0.03, bola.pos.z);
  pontos.setXYZ(1, mira.x, 0.03, 0);
  pontos.needsUpdate = true;
  guiaMira.computeLineDistances();
}

// ---------- Uniformes ----------

// Camisa da lenda (js/elenco.js) no formato dos bonecos
function uniformeDaLenda(jogador) {
  const u = jogador.uniforme;
  if (!u) return jogador.visual.goleiro ? UNIFORMES.goleiroLendas : UNIFORMES.lendas;
  return {
    ...u,
    listras: u.padrao === 'listras' ? u.cores[0] : null,
    luvas: jogador.visual.goleiro ? (u.cores[0] || '#ff7a1a') : undefined,
  };
}

// Adversário genérico: escolhe a camisa que mais contrasta com a do cobrador
const CAMISAS_ADVERSARIAS = [
  { camisa: '#1d2a4d', calcao: '#ffffff', meiao: '#1d2a4d', numero: '#ffffff', gola: '#ffffff' },
  { camisa: '#f3f3ef', calcao: '#1d2a4d', meiao: '#f3f3ef', numero: '#1d2a4d', gola: '#1d2a4d' },
  { camisa: '#2f7d4a', calcao: '#ffffff', meiao: '#2f7d4a', numero: '#ffffff', gola: '#ffffff' },
  { camisa: '#f08c00', calcao: '#1b1b1b', meiao: '#f08c00', numero: '#1b1b1b', gola: '#1b1b1b' },
  { camisa: '#6b2d8f', calcao: '#ffffff', meiao: '#6b2d8f', numero: '#ffffff', gola: '#ffffff' },
];

function corRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function distanciaDeCor(a, b) {
  const [r1, g1, b1] = corRGB(a);
  const [r2, g2, b2] = corRGB(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function uniformeAdversario(jogador) {
  const u = uniformeDaLenda(jogador);
  const cores = [u.camisa, ...(u.cores || [])];
  let melhor = CAMISAS_ADVERSARIAS[0];
  let maior = -1;
  for (const c of CAMISAS_ADVERSARIAS) {
    const d = Math.min(...cores.map((cor) => distanciaDeCor(cor, c.camisa)));
    if (d > maior) {
      maior = d;
      melhor = c;
    }
  }
  return { ...UNIFORMES.adversario, ...melhor, listras: null };
}

// ---------- Jogadores ----------

let cobradorBoneco = null;
let animacao = null;   // corrida e chute do cobrador (js/jogadores.js)
const sombraCobrador = criarSombraBlob(0.4);
scene.add(sombraCobrador);
let bonecosBarreira = [];
let goleiroBoneco = null;
const sombraGoleiro = criarSombraBlob(0.45);
scene.add(sombraGoleiro);

function vestirCobrador(jogador) {
  if (cobradorBoneco) {
    scene.remove(cobradorBoneco.grupo);
    cobradorBoneco.dispose();
  }
  cobradorBoneco = criarPersonagem({
    visual: jogador.visual,
    uniforme: uniformeDaLenda(jogador),
    numero: jogador.numero,
    nome: jogador.nomeCamisa || jogador.apelido,
  });
  scene.add(cobradorBoneco.grupo);
  animacao = criarCobranca(cobradorBoneco, {
    bola: { x: bola.pos.x, z: bola.pos.z }, alvo: { x: 0, z: 0 }, pe: jogador.pe, cfg: CONFIG,
  });
}

// Barreira e goleiro do time adversário (genéricos), refeitos a cada falta com a camisa que contrasta
function montarAdversarios() {
  for (const b of bonecosBarreira) {
    scene.remove(b.personagem.grupo, b.sombra);
    b.personagem.dispose();
  }
  const uniforme = uniformeAdversario(cobrador);
  bonecosBarreira = barreira.jogadores.map((j, i) => {
    const personagem = criarPersonagem({
      visual: visualAdversario(i + Math.floor(aleatorio() * 8), j.altura),
      uniforme, numero: [4, 5, 6, 8, 3][i % 5], nome: '',
    });
    const sombra = criarSombraBlob(0.4);
    scene.add(personagem.grupo, sombra);
    return { personagem, sombra };
  });
  if (!goleiroBoneco) {
    goleiroBoneco = criarPersonagem({ visual: VISUAL_GOLEIRO_ADVERSARIO, uniforme: UNIFORMES.goleiroAdversario, numero: 1, nome: '' });
    scene.add(goleiroBoneco.grupo);
  }
  // O goleiro é o mesmo boneco: zera a memória dos passos para ele não "deslizar" da posição antiga
  delete goleiroBoneco._goleiro;
}

// ---------- Câmera ----------

let cameraBase = new THREE.Vector3();
let olharBase = new THREE.Vector3();
const olharAtual = new THREE.Vector3(); // para onde a câmera está olhando agora
let misturaAerea = 0;                   // 0 = câmera atrás do cobrador, 1 = câmera aérea

// Atrás do cobrador, estilo PES de PS2: a câmera fica atrás de um ponto entre a bola e o cobrador,
// para os dois aparecerem com o gol ao fundo
function posicionarCamera() {
  const c = CONFIG.camera;
  const ancora = {
    x: bola.pos.x + (animacao.inicio.x - bola.pos.x) * c.pesoCobrador,
    z: bola.pos.z + (animacao.inicio.z - bola.pos.z) * c.pesoCobrador,
  };
  const distancia = Math.hypot(ancora.x, ancora.z);
  const sx = ancora.x / distancia;
  const sz = ancora.z / distancia;
  cameraBase = new THREE.Vector3(ancora.x + sx * c.atras, c.altura, ancora.z + sz * c.atras);
  const distanciaGol = Math.hypot(cameraBase.x, cameraBase.z);
  olharBase = new THREE.Vector3(0, c.altura - distanciaGol * Math.tan(c.inclinacao * GRAUS), 0);
  camera.position.copy(cameraBase);
  olharAtual.copy(olharBase);
  camera.lookAt(olharAtual);
  misturaAerea = 0;
}

// Câmera aérea: alta e de lado (diagonal), olhando para um ponto entre a bola e o gol.
// No começo mostra a bola saindo; no fim, o gol inteiro.
function poseAerea(inicio) {
  const c = CONFIG.camera;
  const distancia = Math.hypot(inicio.x, inicio.z);
  const fx = -inicio.x / distancia; // direção da bola para o gol
  const fz = -inicio.z / distancia;
  const dx = -fz;                   // direita de quem cobra
  const dz = fx;
  // Fica do lado de fora: falta pela direita, câmera mais à direita (e vice-versa)
  const lado = (inicio.x < -0.5 ? -1 : 1) * c.aereaLado;
  const pos = new THREE.Vector3(
    inicio.x - fx * c.aereaAtras + dx * lado + (bola.pos.x - inicio.x) * c.aereaAproxima,
    c.aereaAltura,
    inicio.z - fz * c.aereaAtras + dz * lado + (bola.pos.z - inicio.z) * c.aereaAproxima
  );
  const centroGol = new THREE.Vector3(0, 1, 0);
  const olhar = new THREE.Vector3(bola.pos.x, bola.pos.y, bola.pos.z).lerp(centroGol, c.aereaAlvo);
  return { pos, olhar };
}

function atualizarCamera(dt) {
  const c = CONFIG.camera;
  const inicio = posicaoDaFalta(falta);
  const emJogo = estado.fase === 'voo' || estado.fase === 'fim';

  // Câmera atrás do cobrador; depois do chute acompanha a bola de leve
  const posAlvo = cameraBase.clone();
  const olharAlvo = olharBase.clone();
  if (emJogo) {
    posAlvo.x += (bola.pos.x - inicio.x) * c.seguir;
    posAlvo.y += (bola.pos.y - inicio.y) * c.seguir * 0.5;
    posAlvo.z += Math.max(-8, (bola.pos.z - inicio.z) * c.seguir);
    olharAlvo.x += (bola.pos.x - inicio.x) * c.seguir;
  }

  // Troca para a aérea com uma transição suave (ou corte seco, se o tempo for 0)
  const querAerea = emJogo && c.aerea ? 1 : 0;
  if (c.aereaTransicao <= 0) misturaAerea = querAerea;
  else if (misturaAerea < querAerea) misturaAerea = Math.min(querAerea, misturaAerea + dt / c.aereaTransicao);
  else misturaAerea = Math.max(querAerea, misturaAerea - dt / c.aereaTransicao);
  const t = misturaAerea * misturaAerea * (3 - 2 * misturaAerea);
  if (t > 0) {
    const aerea = poseAerea(inicio);
    posAlvo.lerp(aerea.pos, t);
    olharAlvo.lerp(aerea.olhar, t);
  }

  const suavidade = t > 0 ? 1 : 1 - Math.exp(-dt * 5);
  camera.position.lerp(posAlvo, suavidade);
  olharAtual.lerp(olharAlvo, suavidade);
  camera.lookAt(olharAtual);
}

function ajustarTela() {
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  renderer.setSize(largura, altura);
  camera.aspect = largura / altura;
  // No celular em pé a tela é estreita: abre o campo de visão para o gol caber inteiro
  const fovParaLargura = 2 * Math.atan(Math.tan((CONFIG.camera.larguraVisivel * GRAUS) / 2) / camera.aspect) / GRAUS;
  camera.fov = Math.max(CONFIG.camera.fovMin, fovParaLargura);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', ajustarTela);
ajustarTela();

// ---------- Estado do jogo ----------

// fase: 'pronto' -> 'carregando' (segurando CHUTAR) -> 'corrida' (cobrador corre e chuta) -> 'voo' -> 'fim'
const estado = {
  fase: 'pronto', carga: 0, forca: 0, tempo: 0, espera: 0, tCobranca: 0, tFim: 0,
  gols: 0, cobrancas: 0, sequencia: 0, fixa: false,
};
let falta = { distancia: CONFIG.falta.distancia, angulo: CONFIG.falta.angulo };
let bola;
let barreira;
let goleiro;
let cobrador = null;
let tiro = null; // o que chutar() devolveu
// O que aconteceu na cobrança atual
const jogada = {};
function zerarJogada() {
  Object.assign(jogada, {
    batida: null, redeFora: false, barreira: false, defesa: null, barreiraPulou: false, porBaixo: false,
    resultado: null, somRede: false, quiques: 0, lentaUsada: false, lentaAte: 0,
  });
}

const audio = criarAudio(CONFIG);
const ui = criarInterface({
  aoEscolherCobrador: (jogador) => escolherCobrador(jogador),
  aoAlternarMudo: () => {
    audio.iniciar();
    audio.mudo = !audio.mudo;
    ui.definirMudo(audio.mudo);
  },
  aoAlternarFixar: () => {
    estado.fixa = !estado.fixa;
    ui.definirFixar(estado.fixa);
  },
});
ui.definirMudo(audio.mudo);
ui.definirFixar(estado.fixa);
document.getElementById('versao').textContent = VERSAO;

const elementos = {
  barra: document.getElementById('barra-preenchida'),
  barraIdeal: document.getElementById('barra-ideal'),
  botao: document.getElementById('botao-chute'),
  dica: document.getElementById('dica'),
  contatoBola: document.getElementById('contato-bola'),
  contatoPonto: document.getElementById('contato-ponto'),
  contatoRotulo: document.getElementById('contato-rotulo'),
};
elementos.dica.textContent = 'Arraste na tela para mirar · toque na bola para escolher onde o pé pega · segure CHUTAR e solte';

// A barra mostra só a parte já carregada; as cores ficam fixas ao longo da barra inteira
function mostrarCarga(carga) {
  elementos.barra.style.clipPath = `inset(0 ${(1 - carga) * 100}% 0 0)`;
}

function posicaoDaFalta({ distancia, angulo }) {
  return {
    x: distancia * Math.sin(angulo * GRAUS),
    y: CONFIG.raioBola,
    z: distancia * Math.cos(angulo * GRAUS),
  };
}

// Falta sorteada: de várias distâncias e ângulos, sempre fora da grande área
function sortearFalta() {
  const s = CONFIG.sorteio;
  for (let i = 0; i < 50; i++) {
    const distancia = Math.round(s.distanciaMin + aleatorio() * (s.distanciaMax - s.distanciaMin));
    const angulo = Math.round((aleatorio() * 2 - 1) * s.anguloMax);
    const p = posicaoDaFalta({ distancia, angulo });
    const foraDaArea = p.z > 17 || Math.abs(p.x) > 20.5;
    if (foraDaArea && Math.abs(p.x) < 17) return { distancia, angulo };
  }
  return { distancia: 24, angulo: 0 };
}

function placar() {
  const seq = estado.sequencia >= 2 ? ` · sequência ${estado.sequencia}` : '';
  return estado.cobrancas ? `Gols: ${estado.gols} de ${estado.cobrancas}${seq}` : '';
}

// ---------- Cobrador ----------

function escolherCobrador(jogador) {
  if (estado.fase !== 'pronto') return;
  const lista = sugerirCobradores(ELENCO, falta);
  const item = lista.find((x) => x.jogador === jogador) || lista[0];
  cobrador = item.jogador;
  ui.mostrarCobrador(cobrador, item.nota, lista);
  vestirCobrador(cobrador);
  montarAdversarios();
  posicionarCamera();
  mostrarContato();
}

// ---------- Ponto de contato (onde o pé pega na bola) ----------

let contato = { x: 0, y: 0 };
try {
  const salvo = JSON.parse(localStorage.getItem('fkl-contato'));
  if (salvo && Number.isFinite(salvo.x) && Number.isFinite(salvo.y)) contato = salvo;
} catch {
  // Sem armazenamento: começa no centro
}

const NOMES_TECNICA = {
  rasteiro: 'Rasteiro',
  folhaSeca: 'Folha seca',
  semRotacao: 'Sem rotação',
  trivela: 'Trivela',
  curva: 'Curva',
  cavadinha: 'Cavadinha',
  pancada: 'Pancada',
  colocado: 'Colocada',
};

function descreverContato() {
  const partes = [];
  if (contato.x > 0.15) partes.push('←');
  else if (contato.x < -0.15) partes.push('→');
  const forca = estado.fase === 'carregando' ? estado.carga : CONFIG.forcaIdeal;
  const tecnica = cobrador ? preverTecnica({ forca, contato, cobrador }, CONFIG) : null;
  let nome = NOMES_TECNICA[tecnica] || 'Centro';
  if (contato.y > CONFIG.rasteiroInicio - 0.02 && contato.y < CONFIG.rasteiroFim) nome = 'Meia altura';
  partes.push(nome);
  return partes.join(' ');
}

function mostrarContato() {
  elementos.contatoPonto.style.left = `${50 + contato.x * 50}%`;
  elementos.contatoPonto.style.top = `${50 - contato.y * 50}%`;
  elementos.contatoRotulo.textContent = descreverContato();
}

function escolherContato(e) {
  const r = elementos.contatoBola.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const d = Math.hypot(x, y);
  if (d < 0.12) x = y = 0;          // perto do centro, gruda no centro
  else if (d > CONTATO_MAXIMO) {    // não deixa sair da bola
    x *= CONTATO_MAXIMO / d;
    y *= CONTATO_MAXIMO / d;
  }
  contato = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  mostrarContato();
}

elementos.contatoBola.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  elementos.contatoBola.setPointerCapture(e.pointerId);
  escolherContato(e);
});
elementos.contatoBola.addEventListener('pointermove', (e) => {
  if (elementos.contatoBola.hasPointerCapture(e.pointerId)) escolherContato(e);
});
elementos.contatoBola.addEventListener('pointerup', () => {
  try {
    localStorage.setItem('fkl-contato', JSON.stringify(contato));
  } catch {
    // Sem armazenamento: vale só até fechar a página
  }
});

// ---------- Nova cobrança ----------

function novaCobranca() {
  if (!estado.fixa) falta = sortearFalta();
  bola = criarBola(posicaoDaFalta(falta));
  bolaMesh.quaternion.identity();
  barreira = montarBarreira(bola.pos, CONFIG, aleatorio);
  goleiro = criarGoleiro(bola.pos, barreira, CONFIG);
  estado.fase = 'pronto';
  estado.carga = 0;
  estado.tempo = 0;
  estado.tCobranca = 0;
  tiro = null;
  zerarJogada();
  mostrarCarga(0);
  rastro.limpar();
  cenario.rede.reiniciar();
  cenario.torcida.festa(0);
  ui.esconderResultado();
  ui.emJogo(false);
  ui.mostrarFalta(falta);
  ui.mostrarMensagem('');
  elementos.dica.style.visibility = 'visible';

  // Mira começa no lado do gol que a barreira não cobre
  mira.x = -barreira.lado * 1.9;

  // Cobrador sorteado a cada falta (com a falta fixa, mantém a escolha); a lista mostra o sugerido
  const lista = sugerirCobradores(ELENCO, falta);
  if (!cobrador || !estado.fixa) cobrador = ELENCO[Math.floor(aleatorio() * ELENCO.length)];
  const nota = lista.find((x) => x.jogador === cobrador).nota;
  ui.mostrarCobrador(cobrador, nota, lista);
  vestirCobrador(cobrador);
  montarAdversarios();

  posicionarCamera();
  mostrarMira(true);
  atualizarMira();
  mostrarContato();
  audio.apito();
  audio.torcidaAmbiente(0.45);
}

function comecarCarga() {
  // Apertar CHUTAR com a bola ainda no ar já prepara a próxima cobrança
  if (estado.fase === 'voo' || estado.fase === 'fim') novaCobranca();
  if (estado.fase !== 'pronto' || ui.listaAberta()) return;
  estado.fase = 'carregando';
  estado.carga = 0;
  ui.mostrarMensagem('');
  elementos.dica.style.visibility = 'hidden';
  elementos.botao.classList.add('pressionado');
}

function soltarChute() {
  elementos.botao.classList.remove('pressionado');
  if (estado.fase !== 'carregando') return;
  estado.forca = estado.carga;
  estado.fase = 'corrida';
  estado.tCobranca = 0;
  audio.torcidaTensao(animacao.tempoContato);
}

// O pé encontra a bola: a física assume daqui
function executarChute() {
  tiro = chutar(bola, { alvo: { x: mira.x, z: 0 }, forca: estado.forca, contato, cobrador, pressao: 0 }, CONFIG, aleatorio);
  estado.fase = 'voo';
  estado.tempo = 0;
  mostrarMira(false);
  ui.emJogo(true);
  ui.mostrarMensagem(`Força ${Math.round(estado.forca * 100)}% · ${Math.round(tiro.velocidade * 3.6)} km/h`);
  audio.chute(estado.forca);
  jogada.barreiraPulou = barreira.pula;
}

function encerrarJogada(espera) {
  estado.fase = 'fim';
  estado.espera = espera;
  estado.tFim = 0;
}

// ---------- Controles ----------

const botao = elementos.botao;
botao.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  botao.setPointerCapture(e.pointerId); // continua valendo mesmo se o dedo escorregar para fora
  audio.iniciar();
  comecarCarga();
});
botao.addEventListener('pointerup', soltarChute);
botao.addEventListener('pointercancel', soltarChute);
botao.addEventListener('contextmenu', (e) => e.preventDefault());

// No computador, a barra de espaço também chuta e as setas mexem a mira
const digitando = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
window.addEventListener('keydown', (e) => {
  if (digitando(e)) return;
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    audio.iniciar();
    comecarCarga();
  } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && estado.fase === 'pronto') {
    mira.x = limitarMira(mira.x + (e.code === 'ArrowLeft' ? -0.25 : 0.25));
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !digitando(e)) soltarChute();
});

const limitarMira = (x) => Math.max(-CONFIG.mira.limite, Math.min(CONFIG.mira.limite, x));

// Arrastar o dedo na tela mexe a mira na horizontal; tocar durante o voo pula para a próxima cobrança
const telaJogo = document.getElementById('jogo');
let arrasto = null;
telaJogo.addEventListener('pointerdown', (e) => {
  audio.iniciar();
  if (estado.fase === 'voo' || estado.fase === 'fim') {
    novaCobranca();
    return;
  }
  if (estado.fase !== 'pronto') return;
  telaJogo.setPointerCapture(e.pointerId);
  arrasto = { x: e.clientX, mira: mira.x };
});
telaJogo.addEventListener('pointermove', (e) => {
  if (!arrasto || estado.fase !== 'pronto') return;
  // Metros por pixel na distância do gol: o alvo acompanha o dedo
  const distancia = camera.position.distanceTo(new THREE.Vector3(mira.x, ALTURA_MIRA, 0));
  const larguraVisivel = 2 * distancia * Math.tan((camera.fov * GRAUS) / 2) * camera.aspect;
  const metrosPorPixel = (larguraVisivel / window.innerWidth) * CONFIG.mira.sensibilidade;
  mira.x = limitarMira(arrasto.mira + (e.clientX - arrasto.x) * metrosPorPixel);
});
const soltarArrasto = () => {
  arrasto = null;
};
telaJogo.addEventListener('pointerup', soltarArrasto);
telaJogo.addEventListener('pointercancel', soltarArrasto);

// Painel de ajuste: mexer na posição da falta fixa a falta ali; barreira e cobrador valem na próxima falta
criarPainel({
  config: CONFIG,
  versao: VERSAO,
  aoMudar: (chave) => {
    if (chave.startsWith('falta.')) {
      estado.fixa = true;
      ui.definirFixar(true);
      falta = { distancia: CONFIG.falta.distancia, angulo: CONFIG.falta.angulo };
      if (estado.fase === 'pronto') novaCobranca();
    } else if ((chave.startsWith('barreira.') || chave.startsWith('cobrador.') || chave.startsWith('camera.')) && estado.fase === 'pronto') {
      const fixa = estado.fixa;
      estado.fixa = true;
      novaCobranca();
      estado.fixa = fixa;
    }
    if (chave === 'forcaIdeal') elementos.barraIdeal.style.left = `${CONFIG.forcaIdeal * 100}%`;
    if (chave.startsWith('camera.larguraVisivel') || chave.startsWith('camera.fovMin')) ajustarTela();
  },
});
elementos.barraIdeal.style.left = `${CONFIG.forcaIdeal * 100}%`;

// ---------- Eventos da física e resultado ----------

function processarEventos() {
  for (const ev of bola.eventos) {
    if (ev.tipo === 'fundo') {
      cenario.rede.estufar(ev.x, ev.y, ev.afundou);
      if (!jogada.somRede) {
        jogada.somRede = true;
        audio.rede(Math.min(1, 0.5 + Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z) / 30));
      }
    } else if (ev.tipo === 'trave' || ev.tipo === 'travessao') {
      jogada.batida = ev.tipo;
      audio.trave(Math.min(1, (ev.impacto || 20) / 25));
    } else if (ev.tipo === 'rede' && !bola.entrouNoGol) {
      if (!jogada.redeFora) audio.rede(0.4);
      jogada.redeFora = true;
    } else if (ev.tipo === 'barreira') {
      if (!jogada.barreira) audio.barreira(Math.min(1, (ev.impacto || 15) / 25));
      jogada.barreira = true;
    } else if (ev.tipo === 'defesa') {
      if (!jogada.defesa || ev.modo === 'segurou') audio.defesa(Math.min(1, (ev.impacto || 15) / 30));
      if (jogada.defesa !== 'segurou') jogada.defesa = ev.modo || 'espalmou';
    } else if (ev.tipo === 'quique' && ev.impacto > 3 && jogada.quiques < 3) {
      jogada.quiques++;
      audio.quique(Math.min(1, ev.impacto / 12));
    }
  }
  bola.eventos.length = 0;
}

// A bola passou rasteira por baixo da barreira que pulou?
function verificarPorBaixo(anteriorZ) {
  if (!jogada.barreiraPulou || jogada.porBaixo || !barreira.jogadores.length) return;
  const zBarreira = barreira.jogadores[0].z;
  if (anteriorZ > zBarreira && bola.pos.z <= zBarreira && bola.pos.y < 0.45) {
    const noAr = barreira.jogadores.some((j) => j.yPes > bola.pos.y - CONFIG.raioBola && Math.abs(j.x - bola.pos.x) < 0.7);
    if (noAr) jogada.porBaixo = true;
  }
}

// Devolve o resultado assim que dá para saber; null enquanto a jogada está em aberto
function decidirResultado(acabou) {
  if (bola.gol) return 'gol';
  if (jogada.defesa === 'segurou') return 'defesa';
  if (bola.cruzamento && !bola.entrouNoGol) {
    if (jogada.defesa) return 'defesa';
    if (jogada.batida) return 'trave';
    return bola.cruzamento.y >= CONFIG.golAltura ? 'cima' : 'fora';
  }
  const voltando = bola.vel.z > 0.5;
  if (voltando && jogada.defesa) return 'defesa';
  if (voltando && jogada.batida) return 'trave';
  if (voltando && jogada.barreira) return 'barreira';
  if (acabou) {
    if (jogada.defesa) return 'defesa';
    if (jogada.batida) return 'trave';
    if (jogada.barreira) return 'barreira';
    return 'curta';
  }
  return null;
}

function quaseGol() {
  const c = bola.cruzamento;
  if (jogada.batida) return true;
  if (!c) return false;
  return Math.abs(c.x) - CONFIG.golLargura / 2 < 1.2 && c.y - CONFIG.golAltura < 0.8;
}

function mostrarResultado(resultado) {
  estado.cobrancas++;
  jogada.resultado = resultado;
  let titulo;
  let tipo = 'erro';
  const sub = [];
  if (resultado === 'gol') {
    estado.gols++;
    estado.sequencia++;
    tipo = 'gol';
    titulo = 'GOL!';
    const { x, y } = bola.cruzamento;
    const noAngulo = Math.abs(x) > CONFIG.golLargura / 2 - 0.9 && y > CONFIG.golAltura - 0.8;
    sub.push(`Golaço do ${cobrador.nome}!`);
    if (jogada.porBaixo) sub.push('Por baixo da barreira');
    else if (tiro && NOMES_TECNICA[tiro.tecnica]) sub.push(NOMES_TECNICA[tiro.tecnica]);
    if (noAngulo) sub.push('No ângulo');
    else if (jogada.batida) sub.push('Na trave e pra dentro');
    else if (jogada.defesa) sub.push('O goleiro ainda tocou');
    if (estado.sequencia >= 2) sub.push(`${estado.sequencia} seguidos`);
    audio.torcidaGol();
    cenario.torcida.festa(1);
  } else {
    estado.sequencia = 0;
    if (resultado === 'defesa') {
      tipo = 'defesa';
      titulo = jogada.defesa === 'segurou' ? 'DEFENDEU!' : 'QUE DEFESA!';
      if (jogada.defesa !== 'segurou') sub.push('O goleiro espalmou');
    } else if (resultado === 'barreira') {
      tipo = 'defesa';
      titulo = 'NA BARREIRA!';
    } else if (resultado === 'trave') {
      titulo = jogada.batida === 'travessao' ? 'NO TRAVESSÃO!' : 'NA TRAVE!';
    } else if (resultado === 'cima') {
      titulo = 'POR CIMA';
    } else if (resultado === 'fora') {
      titulo = 'PRA FORA';
      if (jogada.redeFora) sub.push('Na rede, pelo lado de fora');
    } else {
      titulo = 'NÃO CHEGOU';
    }
    if (quaseGol() || resultado === 'defesa') {
      audio.torcidaUhh();
      cenario.torcida.festa(0.35);
    }
  }
  ui.mostrarResultado({ tipo, titulo, sub: sub.join(' · ') });
  ui.mostrarPlacar(placar());
}

// ---------- Animação dos bonecos ----------

function animarCobrador(t) {
  if (!cobradorBoneco) return;
  if (estado.fase === 'pronto' || estado.fase === 'carregando') {
    animacao.parado(t);
  } else {
    const r = animacao.atualizar(estado.tCobranca);
    if (r.contato && estado.fase === 'corrida') executarChute();
    // Depois do chute: comemora o gol ou lamenta o erro
    if (estado.fase === 'fim' && estado.tFim > 0.3 && r.etapa === 'fim') {
      const k = Math.min(1, (estado.tFim - 0.3) * 4);
      const reacao = jogada.resultado === 'gol' ? poseComemoracao(estado.tFim) : poseLamento(estado.tFim);
      cobradorBoneco.aplicarPose(misturarPoses(poseChute(1, cobrador.pe), reacao, k));
    }
  }
  const g = cobradorBoneco.grupo.position;
  sombraCobrador.position.set(g.x, 0.012, g.z);
}

function animarAdversarios(t) {
  bonecosBarreira.forEach((b, i) => {
    const j = barreira.jogadores[i];
    posicionarBarreira(b.personagem, j, t, i);
    b.sombra.position.set(j.x, 0.012, j.z);
    const escala = Math.max(0.45, 1 - (j.yPes || 0) * 1.2);
    b.sombra.scale.set(escala, escala, escala);
  });
  const p = goleiro.pose;
  posicionarGoleiro(goleiroBoneco, p, t);
  const centro = p.centro || p;
  sombraGoleiro.position.set(centro.x, 0.012, p.z);
}

// ---------- Loop principal ----------

const eixoGiro = new THREE.Vector3();
const giroVisual = new THREE.Quaternion();

function atualizarBolaNaTela(dt) {
  const { pos, giro } = bola;
  bolaMesh.position.set(pos.x, pos.y, pos.z);
  // Longe da câmera (na aérea) a bola fica um pouco maior na tela, para o olho não perder
  const longe = camera.position.distanceTo(bolaMesh.position) / CONFIG.camera.bolaVisivelAte;
  bolaMesh.scale.setScalar(Math.min(CONFIG.camera.bolaAumentoMax, Math.max(1, longe)));

  // Gira a bola na tela com o giro da física (mais devagar, para o olho acompanhar)
  eixoGiro.set(giro.x, giro.y, giro.z).multiplyScalar(GIRO_VISUAL);
  if (eixoGiro.length() > GIRO_VISUAL_MAX) eixoGiro.setLength(GIRO_VISUAL_MAX);
  const angulo = eixoGiro.length() * dt;
  if (angulo > 1e-5) {
    giroVisual.setFromAxisAngle(eixoGiro.normalize(), angulo);
    bolaMesh.quaternion.premultiply(giroVisual);
  }

  const altura = pos.y - CONFIG.raioBola;
  const tamanho = 1 + altura * 0.15;
  sombraBola.position.set(pos.x, 0.012, pos.z);
  sombraBola.scale.set(tamanho, tamanho, tamanho);
  sombraBola.material.opacity = Math.max(0.15, 0.9 - altura * 0.12);
}

const relogio = new THREE.Clock();
let tempoTotal = 0;
let escalaTempo = 1; // 1 = normal; menos = câmera lenta

// Câmera lenta: quando a bola está chegando no gol, o tempo desacelera por um instante
function querCameraLenta() {
  if (!CONFIG.camera.cameraLenta || estado.fase !== 'voo' || jogada.lentaUsada) return false;
  const { pos, vel } = bola;
  const chegando = vel.z < -8 && pos.z > 0 && pos.z < CONFIG.camera.cameraLentaDistancia;
  const naDirecao = Math.abs(pos.x) < CONFIG.golLargura / 2 + 0.6 && pos.y < CONFIG.golAltura + 0.6;
  return chegando && naDirecao;
}

// Qualidade automática: se o celular não aguenta 60 quadros por segundo, desenha com menos pixels
const qualidade = { amostras: 0, soma: 0, pixel: Math.min(window.devicePixelRatio, 2) };
function ajustarQualidade(dtReal) {
  if (MODO_TESTE) return;
  qualidade.soma += dtReal;
  qualidade.amostras++;
  if (qualidade.amostras < 90) return;
  const media = qualidade.soma / qualidade.amostras;
  qualidade.amostras = 0;
  qualidade.soma = 0;
  if (media > 1 / 45 && qualidade.pixel > 1) {
    qualidade.pixel = Math.max(1, qualidade.pixel - 0.25);
    renderer.setPixelRatio(qualidade.pixel);
    ajustarTela();
  }
}

// Física, barreira e goleiro em passos pequenos (a ordem importa)
function simular(dt) {
  const passos = Math.ceil(dt / PASSO_FISICA);
  const h = dt / passos;
  for (let i = 0; i < passos; i++) {
    estado.tempo += h;
    const anteriorZ = bola.pos.z;
    atualizarBarreira(barreira, estado.tempo);
    atualizarGoleiro(goleiro, bola, h, CONFIG, { chutou: true, tempoDesdeChute: estado.tempo, cfgFisica: CONFIG, aleatorio });
    passo(bola, h, CONFIG);
    colidirBolaBarreira(bola, barreira, CONFIG);
    colidirBolaGoleiro(bola, goleiro, CONFIG);
    verificarPorBaixo(anteriorZ);
  }
  processarEventos();
}

function quadro() {
  const dtReal = MODO_TESTE ? 1 / 60 : Math.min(relogio.getDelta(), 0.05);
  window.tempoDeJogo += dtReal;
  ajustarQualidade(dtReal);

  // Câmera lenta: entra rápido, segura um instante e volta suave
  if (querCameraLenta()) {
    jogada.lentaUsada = true;
    jogada.lentaAte = tempoTotal + CONFIG.camera.cameraLentaDuracao;
  }
  const alvoEscala = jogada.lentaAte && tempoTotal < jogada.lentaAte ? CONFIG.camera.cameraLentaFator : 1;
  escalaTempo += (alvoEscala - escalaTempo) * Math.min(1, dtReal * (alvoEscala < escalaTempo ? 14 : 4));
  const dt = dtReal * escalaTempo;
  tempoTotal += dt;

  if (estado.fase === 'carregando') {
    estado.carga = Math.min(1, estado.carga + dt / CONFIG.tempoCarga);
    mostrarCarga(estado.carga);
    mostrarContato();
  }

  if (estado.fase === 'corrida' || estado.fase === 'voo' || estado.fase === 'fim') estado.tCobranca += dt;
  if (estado.fase === 'voo' || estado.fase === 'fim') {
    simular(dt);
    rastro.adicionar(bola.pos, dt);
  } else {
    atualizarBarreira(barreira, -1);
    atualizarGoleiro(goleiro, bola, dt, CONFIG, { chutou: false, tempoDesdeChute: -1, cfgFisica: CONFIG, aleatorio });
  }

  if (estado.fase === 'voo') {
    const parada = Math.hypot(bola.vel.x, bola.vel.y, bola.vel.z) < 0.3;
    const resultado = decidirResultado(parada || estado.tempo > CONFIG.tempoMaxVoo);
    if (resultado) {
      mostrarResultado(resultado);
      encerrarJogada(resultado === 'gol' ? CONFIG.esperaGol : CONFIG.esperaRecomeco);
    }
  } else if (estado.fase === 'fim') {
    estado.tFim += dt;
    estado.espera -= dt;
    if (estado.espera <= 0) novaCobranca();
  }

  if (estado.fase === 'pronto' || estado.fase === 'carregando') atualizarMira();
  animarCobrador(tempoTotal);
  animarAdversarios(tempoTotal);
  atualizarBolaNaTela(dt);
  atualizarCamera(dt);
  cenario.atualizar(dt);
  audio.atualizar(dt);
  rastro.visivel = CONFIG.rastro;
  renderer.render(scene, camera);
  requestAnimationFrame(quadro);
}

// No modo teste, atalhos para os testes automáticos controlarem a cobrança com precisão
if (MODO_TESTE) {
  window.jogoTeste = {
    contato(x, y) {
      contato = { x, y };
      mostrarContato();
    },
    mirar(x) {
      mira.x = limitarMira(x);
    },
    falta(distancia, angulo) {
      estado.fixa = true;
      falta = { distancia, angulo };
      novaCobranca();
    },
    cobrador(numero) {
      escolherCobrador(ELENCO.find((j) => j.numero === numero));
    },
    chutar(forca) {
      if (estado.fase !== 'pronto') return;
      estado.fase = 'carregando';
      estado.carga = forca;
      soltarChute();
    },
    estado: () => ({ fase: estado.fase, falta, mira: mira.x, resultado: jogada.resultado, tecnica: tiro && tiro.tecnica }),
  };
}

novaCobranca();
requestAnimationFrame(quadro);
