import * as THREE from 'three';
import { CONFIG, VERSAO } from './config.js?v=9';
import { criarBola, chutar, passo, noChao, coneDeErro, preverTecnica } from './physics.js?v=9';
import { ELENCO, sugerirCobradores } from './elenco.js?v=9';
import { criarCenario, PADRAO_CENARIO } from './estadio.js?v=9';
import { montarBarreira, semBarreira, atualizarBarreira, colidirBolaBarreira, PADRAO_BARREIRA } from './barreira.js?v=9';
import { criarGoleiro, atualizarGoleiro, colidirBolaGoleiro, PADRAO_GOLEIRO, PADRAO_PENALTI } from './goleiro.js?v=9';
import {
  criarPersonagem, criarSombraBlob, criarCobranca, PADRAO_COBRANCA,
  visualAdversario, VISUAL_GOLEIRO_ADVERSARIO, UNIFORMES, poseChute, poseComemoracao, poseLamento, misturarPoses,
} from './jogadores.js?v=9';
import { criarAnimadorGoleiro, criarAnimadorBarreira } from './animacaoDefesa.js?v=9';
import { criarAudio, PADRAO_AUDIO } from './audio.js?v=9';
import { criarGravador, salvarVideo } from './replay.js?v=9';
import { criarInterface } from './interface.js?v=9';
import { criarPainel } from './painel.js?v=9';
import { criarRanking } from './ranking.js?v=9';

// Os padrões de goleiro, barreira, cobrador, som e cenário moram nos próprios módulos;
// entram no CONFIG aqui (o que estiver escrito no config.js tem prioridade)
CONFIG.goleiro = { ...PADRAO_GOLEIRO, ...(CONFIG.goleiro || {}) };
CONFIG.penalti = { ...PADRAO_PENALTI, ...(CONFIG.penalti || {}) };
CONFIG.barreira = { ...PADRAO_BARREIRA, ...(CONFIG.barreira || {}) };
CONFIG.cobrador = { ...PADRAO_COBRANCA, ...(CONFIG.cobrador || {}) };
CONFIG.audio = { ...PADRAO_AUDIO, ...(CONFIG.audio || {}) };
CONFIG.cenario = { ...PADRAO_CENARIO, ...(CONFIG.cenario || {}) };

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

// Sorteio com semente (mulberry32): a mesma semente dá sempre a mesma sequência. Cada cobrança sorteia
// uma semente para a montagem (barreira, goleiro, bonecos) e outra no chute (erro da mira, reação do
// goleiro). O replay reaproveita as duas, e a bola, o goleiro e a barreira fazem exatamente o mesmo.
function criarSorteio(semente) {
  let a = Math.floor(semente * 4294967296) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let sementeJogada = 0;
// Um sorteio independente para cada uso (n = 0, 1, 2...), para a ordem das chamadas não importar
const sorteioDaJogada = (n) => criarSorteio((sementeJogada + n * 0.6180339887) % 1);
let sorteioChute = aleatorio; // erro da mira e goleiro durante o voo (semente sorteada no chute)

// Semente a partir de um texto (hash FNV-1a): no Desafio do Dia, a data vira a semente, e todo mundo
// recebe as mesmas faltas na mesma ordem
function sementeDoTexto(texto) {
  let h = 2166136261;
  for (const ch of texto) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// Guardado no aparelho (recordes, desafio do dia, nome, modo): sem armazenamento, vale só até fechar a página
function lerSalvo(chave, padrao) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v ?? padrao;
  } catch {
    return padrao;
  }
}
function salvar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento (aba anônima, por exemplo)
  }
}

// ---------- Renderizador, cena e cenário ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x081421, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

const bolaMaterial = new THREE.MeshStandardMaterial({
  map: texturaBola(),
  roughness: 0.72,
  metalness: 0.08,
  envMapIntensity: 1.25,
});
const bolaMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.raioBola, 32, 16),
  bolaMaterial
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
  const sigma = coneDeErro({ forca, contato, cobrador, pressao: pressaoAtual() }, CONFIG);
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

// Barreira e goleiro com as cores de um rival do clube do cobrador (só cores e padrões, sem escudo)
const RIVAIS = {
  'Barcelona': { nome: 'Real Madrid', padrao: 'liso', camisa: '#f4f4f4', cores: [], calcao: '#f4f4f4', meiao: '#f4f4f4', numero: '#1b1b1b', gola: '#1b1b1b' },
  'Real Madrid': { nome: 'Barcelona', padrao: 'listras', camisa: '#a50044', cores: ['#004d98'], calcao: '#004d98', meiao: '#004d98', numero: '#f7d84a', gola: '#004d98' },
  'Milan': { nome: 'Inter', padrao: 'listras', camisa: '#0b2a8a', cores: ['#151515'], calcao: '#151515', meiao: '#151515', numero: '#ffffff', gola: '#151515' },
  'Manchester United': { nome: 'Manchester City', padrao: 'liso', camisa: '#6cabdd', cores: [], calcao: '#f4f4f4', meiao: '#1c2c5b', numero: '#1c2c5b', gola: '#1c2c5b' },
  'Flamengo': { nome: 'Vasco', padrao: 'diagonal', camisa: '#f4f4f4', cores: ['#151515'], calcao: '#151515', meiao: '#f4f4f4', numero: '#151515', gola: '#151515' },
  'Vasco': { nome: 'Flamengo', padrao: 'aros', camisa: '#c4142b', cores: ['#151515'], calcao: '#f4f4f4', meiao: '#c4142b', numero: '#ffffff', gola: '#151515' },
  'Botafogo': { nome: 'Flamengo', padrao: 'aros', camisa: '#c4142b', cores: ['#151515'], calcao: '#f4f4f4', meiao: '#c4142b', numero: '#ffffff', gola: '#151515' },
  'São Paulo (goleiro)': { nome: 'Corinthians', padrao: 'liso', camisa: '#f4f4f4', cores: [], calcao: '#151515', meiao: '#f4f4f4', numero: '#151515', gola: '#151515' },
  'Palmeiras': { nome: 'Corinthians', padrao: 'liso', camisa: '#f4f4f4', cores: [], calcao: '#151515', meiao: '#f4f4f4', numero: '#151515', gola: '#151515' },
  'Santos': { nome: 'Palmeiras', padrao: 'liso', camisa: '#0a7a3f', cores: [], calcao: '#f4f4f4', meiao: '#0a7a3f', numero: '#ffffff', gola: '#ffffff' },
  'Cruzeiro': { nome: 'Atlético-MG', padrao: 'listras', camisa: '#151515', cores: ['#f4f4f4'], calcao: '#151515', meiao: '#f4f4f4', numero: '#ffffff', gola: '#f4f4f4' },
  'Vélez (goleiro)': { nome: 'San Lorenzo', padrao: 'listras', camisa: '#1b3f8f', cores: ['#8a1538'], calcao: '#151515', meiao: '#1b3f8f', numero: '#ffffff', gola: '#8a1538' },
  'Lazio': { nome: 'Roma', padrao: 'liso', camisa: '#8e1b1b', cores: [], calcao: '#f4f4f4', meiao: '#8e1b1b', numero: '#f7c948', gola: '#f7c948' },
  'Juventus': { nome: 'Torino', padrao: 'liso', camisa: '#7a1a2b', cores: [], calcao: '#f4f4f4', meiao: '#7a1a2b', numero: '#ffffff', gola: '#ffffff' },
  'Liverpool': { nome: 'Everton', padrao: 'liso', camisa: '#1b3f8f', cores: [], calcao: '#f4f4f4', meiao: '#f4f4f4', numero: '#ffffff', gola: '#ffffff' },
  'Brasil': { nome: 'Argentina', padrao: 'listras', camisa: '#f4f4f4', cores: ['#6cabdd'], calcao: '#151515', meiao: '#f4f4f4', numero: '#151515', gola: '#151515' },
  'Argentina': { nome: 'Brasil', padrao: 'liso', camisa: '#f7d20a', cores: [], calcao: '#1b3f8f', meiao: '#f4f4f4', numero: '#0a7a3f', gola: '#0a7a3f' },
  'Alemanha': { nome: 'Holanda', padrao: 'liso', camisa: '#f08c00', cores: [], calcao: '#f4f4f4', meiao: '#f08c00', numero: '#151515', gola: '#151515' },
};

function nomeDoRival(jogador) {
  const rival = jogador.uniforme && RIVAIS[jogador.uniforme.clube];
  return rival ? rival.nome : '';
}

function uniformeAdversario(jogador) {
  const rival = jogador.uniforme && RIVAIS[jogador.uniforme.clube];
  if (!rival) return { ...UNIFORMES.adversario };
  return { ...UNIFORMES.adversario, ...rival, listras: rival.padrao === 'listras' ? rival.cores[0] : null, faixaMeiao: rival.calcao };
}

// ---------- Jogadores ----------

let cobradorBoneco = null;
let animacao = null;   // corrida e chute do cobrador (js/jogadores.js)
const sombraCobrador = criarSombraBlob(0.4);
scene.add(sombraCobrador);
let bonecosBarreira = [];
let goleiroBoneco = null;
let animGoleiro = null;   // animação do goleiro por cima da lógica (js/animacaoDefesa.js)
let animBarreira = null;  // idem para a barreira
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
    bola: { x: bola.pos.x, z: bola.pos.z }, alvo: { x: 0, z: 0 }, pe: jogador.pe, cfg: configDaCobranca(jogador),
  });
}

// Cada lenda corre e se posiciona do seu jeito (js/elenco.js, campo cobranca): distância da corrida,
// ângulo de aproximação, número de passos e ritmo viram os números que a animação entende
function configDaCobranca(jogador) {
  const c = jogador.cobranca;
  if (!c) return CONFIG;
  const cadencia = CONFIG.cobrador.cadencia * (c.ritmo || 1);
  const passos = c.passos || 3;
  return {
    ...CONFIG,
    cobrador: {
      ...CONFIG.cobrador,
      distancia: c.distancia ?? CONFIG.cobrador.distancia,
      angulo: c.angulo ?? CONFIG.cobrador.angulo,
      cadencia,
      corrida: Math.max(0.2, passos / (2 * cadencia) - 0.3),
      postura: c.postura || 'normal',
      braco: c.braco || 'normal',
    },
  };
}

// Barreira e goleiro do time adversário (genéricos), refeitos a cada falta com a camisa que contrasta
function montarAdversarios() {
  for (const b of bonecosBarreira) {
    scene.remove(b.personagem.grupo, b.sombra);
    b.personagem.dispose();
  }
  const uniforme = uniformeAdversario(cobrador);
  const sorteio = sorteioDaJogada(1);
  bonecosBarreira = barreira.jogadores.map((j, i) => {
    const personagem = criarPersonagem({
      visual: visualAdversario(i + Math.floor(sorteio() * 8), j.altura),
      uniforme, numero: [4, 5, 6, 8, 3][i % 5], nome: '',
    });
    const sombra = criarSombraBlob(0.4);
    scene.add(personagem.grupo, sombra);
    return { personagem, sombra };
  });
  animBarreira = criarAnimadorBarreira(bonecosBarreira.map((b) => b.personagem), { semente: sorteio(), diagnostico: false });
  if (!goleiroBoneco) {
    goleiroBoneco = criarPersonagem({ visual: VISUAL_GOLEIRO_ADVERSARIO, uniforme: UNIFORMES.goleiroAdversario, numero: 1, nome: '' });
    scene.add(goleiroBoneco.grupo);
  }
  // O goleiro é o mesmo boneco, mas a animação começa do zero a cada cobrança (com a semente da jogada)
  animGoleiro = criarAnimadorGoleiro(goleiroBoneco, { semente: sorteio(), diagnostico: false });
}

// ---------- Câmera ----------

let cameraBase = new THREE.Vector3();
let olharBase = new THREE.Vector3();
const olharAtual = new THREE.Vector3(); // para onde a câmera está olhando agora
let misturaAerea = 0;                   // 0 = câmera atrás do cobrador, 1 = câmera aérea

// Atrás do cobrador, estilo PES de PS2. A câmera fica no eixo bola → gol, atrás da bola, um pouco
// deslocada para o lado do cobrador, e recua até o gol inteiro, a bola e o cobrador (lá atrás, no
// começo da corrida) caberem na tela de uma vez. Gira de leve para o lado do cobrador quando precisa.
function posicionarCamera() {
  const c = CONFIG.camera;
  const dist = Math.hypot(bola.pos.x, bola.pos.z);
  const ax = bola.pos.x / dist;
  const az = bola.pos.z / dist;
  const lx = az;
  const lz = -ax;
  const kx = animacao.inicio.x - bola.pos.x;
  const kz = animacao.inicio.z - bola.pos.z;
  const lateral = kx * lx + kz * lz;
  const fundo = kx * ax + kz * az;
  const hfov = 2 * Math.atan(Math.tan((camera.fov * GRAUS) / 2) * camera.aspect);
  const vfov = camera.fov * GRAUS;
  const meia = CONFIG.golLargura / 2 + 1.0;
  let atras = Math.max(c.atras, fundo + c.atrasCobrador);
  let cx = 0;
  let cz = 0;
  let yaw = 0;
  let inclinacao = -c.inclinacao * GRAUS;
  for (let i = 0; i < 16; i++) {
    cx = bola.pos.x + ax * atras + lx * lateral * c.pesoCobrador;
    cz = bola.pos.z + az * atras + lz * lateral * c.pesoCobrador;
    const ang = (px, pz) => {
      const dx = px - cx;
      const dz = pz - cz;
      return Math.atan2(dx * lx + dz * lz, -(dx * ax + dz * az));
    };
    const dCobrador = Math.hypot(animacao.inicio.x - cx, animacao.inicio.z - cz);
    const aCobrador = ang(animacao.inicio.x, animacao.inicio.z);
    const folga = Math.atan2(0.7, dCobrador);
    const h = [ang(-meia, 0), ang(meia, 0), ang(bola.pos.x, bola.pos.z), aCobrador - folga, aCobrador + folga];
    const v = [Math.atan2(-c.altura, dCobrador), Math.atan2(CONFIG.golAltura + 0.4 - c.altura, Math.hypot(cx, cz))];
    const hMin = Math.min(...h);
    const hMax = Math.max(...h);
    yaw = (hMin + hMax) / 2;
    inclinacao = (v[0] + v[1]) / 2;
    if (hMax - hMin <= hfov * 0.86 && v[1] - v[0] <= vfov * 0.9) break;
    atras += 0.75;
  }
  cameraBase = new THREE.Vector3(cx, c.altura, cz);
  const distanciaGol = Math.hypot(cx, cz);
  const dirx = -ax * Math.cos(yaw) + lx * Math.sin(yaw);
  const dirz = -az * Math.cos(yaw) + lz * Math.sin(yaw);
  olharBase = new THREE.Vector3(cx + dirx * distanciaGol, c.altura + distanciaGol * Math.tan(inclinacao), cz + dirz * distanciaGol);
  camera.position.copy(cameraBase);
  olharAtual.copy(olharBase);
  camera.lookAt(olharAtual);
  misturaAerea = 0;
}

// Câmera do replay lateral: do lado direito de quem cobra, sempre o mesmo lado, com o gol à direita da
// tela (como no treino do PES de PS2). No celular em pé cobrador e gol não cabem juntos, então ela anda
// junto com a bola, um pouco adiantada, e olha para um ponto entre a bola e o gol, como a câmera lateral
// da TV. O zoom compensa a distância: falta pela esquerda fica mais longe da câmera e ganha mais zoom.
function poseReplayLateral(inicio) {
  const c = CONFIG.camera;
  const x = Math.max(0, inicio.x) + c.replayLateralDist;
  const zBola = Math.max(0, Math.min(inicio.z, bola.pos.z));
  const z = Math.max(-1, inicio.z + (zBola - inicio.z) * c.replayLateralSegue - c.replayLateralFrente);
  const pos = new THREE.Vector3(x, c.replayLateralAltura, z);
  const centroGol = new THREE.Vector3(0, 1.2, 0);
  const chegada = 1 - Math.max(0, Math.min(1, zBola / Math.max(1, inicio.z)));
  const olhar = new THREE.Vector3(
    Math.max(-6, Math.min(6, bola.pos.x)),
    Math.min(3.2, bola.pos.y + 0.2),
    Math.max(-1.5, bola.pos.z)
  ).lerp(centroGol, c.replayLateralAlvo * chegada);
  const d = Math.max(3, pos.distanceTo(olhar));
  const larguraVisivel = c.replayLateralLargura * (1.15 - 0.25 * chegada) * Math.min(1.5, Math.max(0.35, c.replayLateralDist / d));
  return { pos, olhar, larguraVisivel };
}

// Câmera do replay atrás do gol: baixa, do lado contrário ao canto em que a bola vai (como na TV).
// Começa olhando para o cobrador e vai acompanhando a bola.
function poseReplay() {
  const c = CONFIG.camera;
  const lado = (registro && registro.mira < 0 ? 1 : -1) * c.replayLado;
  const pos = new THREE.Vector3(lado, c.replayAltura, -c.replayAtras);
  const olhar = new THREE.Vector3(bola.pos.x, bola.pos.y + 0.3, bola.pos.z).lerp(new THREE.Vector3(0, 1.2, 0), 0.3);
  const d = pos.distanceTo(bola.pos);
  const k = Math.min(1, Math.max(0, (d - 9) / 18));
  const larguraVisivel = 34 - 20 * k;
  return { pos, olhar, larguraVisivel };
}

// Campo de visão a partir da largura visível (graus na horizontal), respeitando o mínimo vertical
// (o replay lateral pode fechar mais o zoom, para a falta do outro lado do campo não ficar minúscula)
function fovParaLargura(larguraVisivel, minimo = CONFIG.camera.fovMin) {
  const fov = 2 * Math.atan(Math.tan((larguraVisivel * GRAUS) / 2) / camera.aspect) / GRAUS;
  return Math.max(minimo, fov);
}

// Câmera aérea: alta e de lado (diagonal), olhando para um ponto entre a bola e o gol.
// No começo mostra a bola saindo; no fim, o gol inteiro.
function poseAerea(inicio) {
  const c = CONFIG.camera;
  const distancia = Math.hypot(inicio.x, inicio.z);
  const fx = -inicio.x / distancia;
  const fz = -inicio.z / distancia;
  const dx = -fz;
  const dz = fx;
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

  const posAlvo = cameraBase.clone();
  const olharAlvo = olharBase.clone();
  if (emJogo) {
    posAlvo.x += (bola.pos.x - inicio.x) * c.seguir;
    posAlvo.y += (bola.pos.y - inicio.y) * c.seguir * 0.5;
    posAlvo.z += Math.max(-8, (bola.pos.z - inicio.z) * c.seguir);
    olharAlvo.x += (bola.pos.x - inicio.x) * c.seguir;
  }

  if (replay) {
    const rp = c.replayLateral ? poseReplayLateral(inicio) : poseReplay();
    const corte = !replay.cameraPronta;
    replay.cameraPronta = true;
    camera.position.lerp(rp.pos, corte || !c.replayLateral ? 1 : 1 - Math.exp(-dt * 6));
    if (corte) olharAtual.copy(rp.olhar);
    else olharAtual.lerp(rp.olhar, 1 - Math.exp(-dt * 7));
    camera.lookAt(olharAtual);
    if (estado.fase !== 'fim') {
      const fovAlvo = fovParaLargura(rp.larguraVisivel, c.replayLateral ? 20 : c.fovMin);
      camera.fov += (fovAlvo - camera.fov) * (corte ? 1 : 1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }
    misturaAerea = 0;
    return;
  }

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
  camera.fov = fovParaLargura(CONFIG.camera.larguraVisivel);
  camera.updateProjectionMatrix();
  if (animacao && (estado.fase === 'pronto' || estado.fase === 'carregando')) posicionarCamera();
}
window.addEventListener('resize', ajustarTela);
ajustarTela();

// ---------- Estado do jogo ----------

// fase: 'pronto' -> 'carregando' (segurando CHUTAR) -> 'corrida' (cobrador corre e chuta) -> 'voo' -> 'fim'
const estado = {
  fase: 'pronto', carga: 0, forca: 0, tempo: 0, espera: 0, tCobranca: 0, tFim: 0,
  gols: 0, cobrancas: 0, sequencia: 0, fixa: false,
  modo: 'treino', // 'treino' (falta sorteada) | 'desafio' (Desafio do Dia) | 'penalti'
};
// Rest of file unchanged from original; only renderer/ball material edits above.
