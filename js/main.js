import * as THREE from 'three';
// Versão publicada congelada enquanto o glow up é montado (os arquivos novos estão em obras)
import { CONFIG, VERSAO } from './legado/config.js?v=3';
import { criarBola, chutar, passo, noChao } from './legado/physics.js?v=3';
import { criarPainel } from './legado/painel.js?v=3';

const GRAUS = Math.PI / 180;
const PASSO_FISICA = 1 / 240; // a física roda em passos pequenos e fixos, independente do celular
const GIRO_VISUAL = 0.35;     // a bola gira mais devagar na tela do que na física, para o olho acompanhar

// ---------- Renderizador e cena ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('jogo').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const CEU = 0x9fd3f0;
scene.background = new THREE.Color(CEU);
scene.fog = new THREE.Fog(CEU, 70, 160);

scene.add(new THREE.HemisphereLight(0xdff2ff, 0x3d6b2a, 1.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(-20, 40, 25);
scene.add(sol);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

function texturaDeCanvas(canvas, anisotropia = true) {
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  if (anisotropia) textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return textura;
}

// ---------- Gramado com faixas e linhas ----------

function criarGramado() {
  const LARGURA = 100;   // m em x
  const COMPRIMENTO = 100; // m em z
  const INICIO_Z = -35;  // o gramado vai de z = -35 (atrás do gol) até z = 65
  const PX = 2048;
  const escala = PX / LARGURA; // pixels por metro

  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = PX;
  const ctx = canvas.getContext('2d');
  const paraCanvas = (x, z) => [(x + LARGURA / 2) * escala, (z - INICIO_Z) * escala];

  // Faixas de corte da grama, paralelas à linha do gol
  for (let z = INICIO_Z, i = 0; z < INICIO_Z + COMPRIMENTO; z += 5.5, i++) {
    ctx.fillStyle = i % 2 ? '#3f8f3a' : '#4a9c43';
    const [, y] = paraCanvas(0, z);
    ctx.fillRect(0, y, PX, 5.5 * escala + 1);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 0.12 * escala;
  const linha = (pontos) => {
    ctx.beginPath();
    pontos.forEach(([x, z], i) => {
      const [cx, cy] = paraCanvas(x, z);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
  };
  linha([[-34, 0], [34, 0]]);                                     // linha de fundo
  linha([[-34, 0], [-34, 65]]);                                   // laterais
  linha([[34, 0], [34, 65]]);
  linha([[-34, 52.5], [34, 52.5]]);                               // meio de campo
  linha([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]); // grande área
  linha([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]);       // pequena área

  // Marca do pênalti e meia-lua
  const [px, pz] = paraCanvas(0, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(px, pz, 0.15 * escala, 0, Math.PI * 2);
  ctx.fill();
  const abertura = Math.acos(5.5 / 9.15);
  ctx.beginPath();
  ctx.arc(px, pz, 9.15 * escala, Math.PI / 2 - abertura, Math.PI / 2 + abertura);
  ctx.stroke();

  const gramado = new THREE.Mesh(
    new THREE.PlaneGeometry(LARGURA, COMPRIMENTO),
    new THREE.MeshLambertMaterial({ map: texturaDeCanvas(canvas) })
  );
  gramado.rotation.x = -Math.PI / 2;
  gramado.position.set(0, 0, INICIO_Z + COMPRIMENTO / 2);
  scene.add(gramado);
}

// ---------- Estádio: placas, arquibancadas com torcida e refletores ----------

// Torcida desenhada num canvas: degraus de concreto com torcedores coloridos
function texturaTorcida() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23262d';
  ctx.fillRect(0, 0, W, H);
  const camisas = ['#a83232', '#a83232', '#1a1a1a', '#c9c9c9', '#c9ad45', '#3b5aa8', '#b8664f', '#3f8a80', '#dedede', '#262626'];
  const peles = ['#c9a27a', '#b8895c', '#9a6a40', '#6e4628', '#d9b896'];
  const degraus = 16;
  const altura = H / degraus;
  for (let d = 0; d < degraus; d++) {
    const chao = (d + 1) * altura - 3;
    ctx.fillStyle = '#353a42';
    ctx.fillRect(0, chao, W, 3);
    for (let x = 0; x < W; x += 6) {
      if (Math.random() < 0.1) continue; // cadeira vazia
      const h = altura - 6 - Math.random() * 3;
      ctx.fillStyle = camisas[(Math.random() * camisas.length) | 0];
      ctx.fillRect(x + 1, chao - h * 0.7, 4, h * 0.7);
      ctx.fillStyle = peles[(Math.random() * peles.length) | 0];
      ctx.fillRect(x + 1.5, chao - h, 3, h * 0.32);
    }
  }
  const textura = texturaDeCanvas(canvas);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

// Placa de publicidade com um texto fictício
function texturaPlaca(texto, fundo, cor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = cor;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 256, 34);
  return texturaDeCanvas(canvas);
}

function criarEstadio() {
  const torcida = texturaTorcida();
  const muro = new THREE.MeshLambertMaterial({ color: 0x46524a });
  const concreto = new THREE.MeshLambertMaterial({ color: 0x8b929b });
  const telhado = new THREE.MeshLambertMaterial({ color: 0x2a2e35 });

  // Uma arquibancada reta: começa num muro na frente e sobe inclinada para trás.
  // Montada "de frente para +z" e depois girada para o lugar certo.
  const arquibancada = ({ largura, recuo, profundidade, alturaFrente, alturaFundo, giro, x = 0, z = 0, cobertura = 0 }) => {
    const grupo = new THREE.Group();
    const subida = alturaFundo - alturaFrente;
    const comprimento = Math.hypot(profundidade, subida);
    const textura = torcida.clone();
    textura.repeat.set(largura / 40, comprimento / 11); // um torcedor a cada ~0,5 m
    textura.needsUpdate = true;
    const degraus = new THREE.Mesh(
      new THREE.PlaneGeometry(largura, comprimento),
      new THREE.MeshLambertMaterial({ map: textura, color: 0xd8d8d8 })
    );
    degraus.rotation.x = -Math.atan2(profundidade, subida);
    degraus.position.set(0, alturaFrente + subida / 2, -(recuo + profundidade / 2));
    grupo.add(degraus);

    const frente = new THREE.Mesh(new THREE.BoxGeometry(largura, alturaFrente, 0.5), muro);
    frente.position.set(0, alturaFrente / 2, -recuo);
    grupo.add(frente);

    // Faixa de concreto no alto, para a arquibancada não terminar "no ar"
    const topo = new THREE.Mesh(new THREE.BoxGeometry(largura, 3, 1), concreto);
    topo.position.set(0, alturaFundo + 1.5, -(recuo + profundidade));
    grupo.add(topo);

    // Cobertura: uma laje escura saindo do alto em direção ao campo
    if (cobertura > 0) {
      const laje = new THREE.Mesh(new THREE.BoxGeometry(largura, 0.8, cobertura), telhado);
      laje.position.set(0, alturaFundo + 3.4, -(recuo + profundidade - cobertura / 2));
      laje.rotation.x = -0.08;
      grupo.add(laje);
    }

    grupo.rotation.y = giro;
    grupo.position.set(x, 0, z);
    scene.add(grupo);
  };

  // Atrás do gol e nas duas laterais do campo
  arquibancada({ largura: 150, recuo: 13, profundidade: 22, alturaFrente: 1.6, alturaFundo: 14, giro: 0, cobertura: 16 });
  arquibancada({ largura: 90, recuo: 41, profundidade: 24, alturaFrente: 1.6, alturaFundo: 16, giro: Math.PI / 2, z: 30, cobertura: 14 });
  arquibancada({ largura: 90, recuo: 41, profundidade: 24, alturaFrente: 1.6, alturaFundo: 16, giro: -Math.PI / 2, z: 30, cobertura: 14 });

  // Placas de publicidade (nomes fictícios) em volta do campo
  const anuncios = [
    texturaPlaca('FOLHA SECA', '#1d3557', '#f7d84a'),
    texturaPlaca('GOLAÇO TV', '#e63946', '#ffffff'),
    texturaPlaca('TRIVELA', '#f7d84a', '#1b2a12'),
    texturaPlaca('NO ÂNGULO', '#111111', '#ffffff'),
  ];
  const placa = (i, x, z, giro) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.9, 0.12),
      new THREE.MeshLambertMaterial({ map: anuncios[i % anuncios.length] })
    );
    mesh.position.set(x, 0.45, z);
    mesh.rotation.y = giro;
    scene.add(mesh);
  };
  for (let i = 0; i < 14; i++) placa(i, -39 + i * 6, -7, 0);
  for (let i = 0; i < 11; i++) {
    placa(i + 1, -37.5, -4 + i * 6, Math.PI / 2);
    placa(i + 2, 37.5, -4 + i * 6, -Math.PI / 2);
  }

  // Refletores nos cantos
  const poste = new THREE.MeshLambertMaterial({ color: 0x5b616b });
  const lampada = new THREE.MeshLambertMaterial({ color: 0xfff6d0, emissive: 0xfff2b0, emissiveIntensity: 0.9 });
  for (const [x, z] of [[-52, -30], [52, -30], [-58, 75], [58, 75]]) {
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 40, 8), poste);
    torre.position.set(x, 20, z);
    scene.add(torre);
    const painel = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 1), lampada);
    painel.position.set(x, 41, z);
    painel.lookAt(0, 0, 25);
    scene.add(painel);
  }
}

// ---------- Gol com rede ----------

// Rede do fundo: a malha é deformada quando a bola bate, para ela "estufar"
const rede = { malha: null, base: null, amp: 0, alvo: 0, x: 0, y: 0 };

function texturaRede() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 32, 32);
  const textura = texturaDeCanvas(canvas);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

function criarGol() {
  const { golLargura: L, golAltura: A, golProfundidade: P, raioTrave: R } = CONFIG;
  const gol = new THREE.Group();
  const branco = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const trave = new THREE.CylinderGeometry(R, R, A + R, 16);
  for (const lado of [-1, 1]) {
    const poste = new THREE.Mesh(trave, branco);
    poste.position.set(lado * (L / 2 + R), (A + R) / 2, 0);
    gol.add(poste);
  }
  const travessao = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L + 4 * R, 16), branco);
  travessao.rotation.z = Math.PI / 2;
  travessao.position.set(0, A + R, 0);
  gol.add(travessao);

  // Rede: planos transparentes com uma grade desenhada
  const malha = 0.15; // m entre os fios
  const planoRede = (largura, altura, divisoesX = 1, divisoesY = 1) => {
    const textura = texturaRede();
    textura.repeat.set(largura / malha, altura / malha);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(largura, altura, divisoesX, divisoesY),
      new THREE.MeshBasicMaterial({
        map: textura, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true,
      })
    );
  };
  const fundo = planoRede(L, A, 36, 12);
  fundo.position.set(0, A / 2, -P);
  gol.add(fundo);
  rede.malha = fundo;
  rede.base = fundo.geometry.attributes.position.array.slice();
  const teto = planoRede(L, P);
  teto.rotation.x = Math.PI / 2;
  teto.position.set(0, A, -P / 2);
  gol.add(teto);
  for (const lado of [-1, 1]) {
    const lateral = planoRede(P, A);
    lateral.rotation.y = Math.PI / 2;
    lateral.position.set(lado * L / 2, A / 2, -P / 2);
    gol.add(lateral);
  }
  scene.add(gol);
}

// ---------- Bola e sombra ----------

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
  return texturaDeCanvas(canvas, false);
}

const bolaMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.raioBola, 32, 16),
  new THREE.MeshLambertMaterial({ map: texturaBola() })
);
scene.add(bolaMesh);

// Sombra falsa (um círculo escuro no chão): leve no celular e ajuda a ver a altura da bola
function texturaSombra() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texturaDeCanvas(canvas, false);
}
const sombra = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false })
);
sombra.rotation.x = -Math.PI / 2;
scene.add(sombra);

criarGramado();
criarEstadio();
criarGol();

function atualizarRede(dt) {
  // Enquanto a bola empurra, a rede acompanha; depois, volta ao lugar
  if (rede.alvo > rede.amp) rede.amp += (rede.alvo - rede.amp) * Math.min(1, dt * 40);
  else rede.amp *= Math.exp(-dt * 4);
  rede.alvo = 0;
  if (rede.amp < 0.001 && !rede.deformada) return;
  rede.deformada = rede.amp >= 0.001;

  const meiaL = CONFIG.golLargura / 2;
  const meiaA = CONFIG.golAltura / 2;
  const pos = rede.malha.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = rede.base[i * 3];
    const y = rede.base[i * 3 + 1];
    const distancia2 = (x - rede.x) ** 2 + (y + meiaA - rede.y) ** 2;
    // Presa nas bordas (traves, travessão e chão), solta no meio
    const borda = Math.min(1, (meiaL - Math.abs(x)) / 0.6) * Math.min(1, (meiaA - Math.abs(y)) / 0.5);
    pos.setZ(i, -rede.amp * Math.exp(-distancia2 / 0.7) * Math.max(0, borda));
  }
  pos.needsUpdate = true;
}

// ---------- Câmera ----------

let cameraBase = new THREE.Vector3();
let olharBase = new THREE.Vector3();
const olharAtual = new THREE.Vector3(); // para onde a câmera está olhando agora
let misturaAerea = 0;                   // 0 = câmera atrás da bola, 1 = câmera aérea

function posicionarCamera(posBola) {
  const c = CONFIG.camera;
  // Fica na linha entre o centro do gol e a bola, atrás da bola
  const sentido = new THREE.Vector3(posBola.x, 0, posBola.z).normalize();
  cameraBase = new THREE.Vector3(
    posBola.x + sentido.x * c.atras,
    c.altura,
    posBola.z + sentido.z * c.atras
  );
  const distancia = Math.hypot(cameraBase.x, cameraBase.z);
  olharBase = new THREE.Vector3(0, c.altura - distancia * Math.tan(c.inclinacao * GRAUS), 0);
  camera.position.copy(cameraBase);
  olharAtual.copy(olharBase);
  camera.lookAt(olharAtual);
  misturaAerea = 0;
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

const elementos = {
  barra: document.getElementById('barra-preenchida'),
  botao: document.getElementById('botao-chute'),
  info: document.getElementById('info'),
  mensagem: document.getElementById('mensagem'),
  dica: document.getElementById('dica'),
  contatoBola: document.getElementById('contato-bola'),
  contatoPonto: document.getElementById('contato-ponto'),
  contatoRotulo: document.getElementById('contato-rotulo'),
  hud: document.getElementById('hud'),
  placar: document.getElementById('placar'),
  resultado: document.getElementById('resultado'),
  resultadoTitulo: document.getElementById('resultado-titulo'),
  resultadoSub: document.getElementById('resultado-sub'),
};
document.getElementById('versao').textContent = VERSAO;

// fase: 'pronto' -> 'carregando' -> 'voo' -> 'fim' -> 'pronto'
const estado = { fase: 'pronto', carga: 0, tempo: 0, espera: 0, gols: 0, cobrancas: 0, sequencia: 0 };
let bola;
// O que aconteceu na cobrança atual
const jogada = { batida: null, redeFora: false };

// ---------- Ponto de contato (onde o pé pega na bola) ----------

let contato = { x: 0, y: 0 };
try {
  const salvo = JSON.parse(localStorage.getItem('fkl-contato'));
  if (salvo && Number.isFinite(salvo.x) && Number.isFinite(salvo.y)) contato = salvo;
} catch {
  // Sem armazenamento: começa no centro
}

function descreverContato({ x, y }) {
  const partes = [];
  if (x > 0.15) partes.push('Curva ←');
  else if (x < -0.15) partes.push('Curva →');
  if (y > 0.15) partes.push('Cai');
  else if (y < -0.15) partes.push('Sobe');
  return partes.length ? partes.join(' · ') : 'Centro';
}

function mostrarContato() {
  elementos.contatoPonto.style.left = `${50 + contato.x * 50}%`;
  elementos.contatoPonto.style.top = `${50 - contato.y * 50}%`;
  elementos.contatoRotulo.textContent = descreverContato(contato);
}

function escolherContato(e) {
  const r = elementos.contatoBola.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const d = Math.hypot(x, y);
  if (d < 0.12) x = y = 0;          // perto do centro, gruda no centro
  else if (d > 0.9) {               // não deixa sair da bola
    x *= 0.9 / d;
    y *= 0.9 / d;
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
mostrarContato();

// A barra mostra só a parte já carregada; as cores ficam fixas ao longo da barra inteira
function mostrarCarga(carga) {
  elementos.barra.style.clipPath = `inset(0 ${(1 - carga) * 100}% 0 0)`;
}

function posicaoDaFalta() {
  const { distancia, angulo } = CONFIG.falta;
  return {
    x: distancia * Math.sin(angulo * GRAUS),
    y: CONFIG.raioBola,
    z: distancia * Math.cos(angulo * GRAUS),
  };
}

function novaCobranca() {
  bola = criarBola(posicaoDaFalta());
  bolaMesh.quaternion.identity();
  posicionarCamera(bola.pos);
  estado.fase = 'pronto';
  estado.carga = 0;
  mostrarCarga(0);
  jogada.batida = null;
  jogada.redeFora = false;
  rede.amp = 0;
  elementos.resultado.className = '';
  elementos.hud.classList.remove('em-jogo');
  const { distancia, angulo } = CONFIG.falta;
  const lado = angulo > 3 ? ' pela direita' : angulo < -3 ? ' pela esquerda' : '';
  elementos.info.innerHTML = `Falta a <b>${distancia} m</b>${lado}`;
  elementos.dica.style.visibility = 'visible';
}

function comecarCarga() {
  // Apertar CHUTAR com a bola ainda no ar já prepara a próxima cobrança
  if (estado.fase === 'voo' || estado.fase === 'fim') novaCobranca();
  if (estado.fase !== 'pronto') return;
  estado.fase = 'carregando';
  estado.carga = 0;
  elementos.mensagem.textContent = '';
  elementos.dica.style.visibility = 'hidden';
  elementos.botao.classList.add('pressionado');
}

function soltarChute() {
  elementos.botao.classList.remove('pressionado');
  if (estado.fase !== 'carregando') return;
  const forca = estado.carga;
  const { velocidade } = chutar(bola, { alvo: { x: 0, z: 0 }, forca, contato }, CONFIG);
  estado.fase = 'voo';
  estado.tempo = 0;
  elementos.hud.classList.add('em-jogo');
  elementos.mensagem.textContent = `Força ${Math.round(forca * 100)}% · ${Math.round(velocidade * 3.6)} km/h`;
}

function encerrarJogada(espera) {
  estado.fase = 'fim';
  estado.espera = espera;
}

// Lê o que a física registrou: rede estufando e batidas na trave
function processarEventos() {
  for (const ev of bola.eventos) {
    if (ev.tipo === 'fundo') {
      rede.x = ev.x;
      rede.y = ev.y;
      rede.alvo = Math.max(rede.alvo, ev.afundou + 0.03);
    } else if (ev.tipo === 'trave' || ev.tipo === 'travessao') {
      jogada.batida = ev.tipo;
    } else if (ev.tipo === 'rede' && !bola.entrouNoGol) {
      jogada.redeFora = true;
    }
  }
  bola.eventos.length = 0;
}

// Devolve o resultado assim que dá para saber; null enquanto a jogada está em aberto
function decidirResultado(acabou) {
  if (bola.gol) return 'gol';
  if (bola.cruzamento && !bola.entrouNoGol) {
    if (jogada.batida) return 'trave';
    return bola.cruzamento.y >= CONFIG.golAltura ? 'cima' : 'fora';
  }
  if (jogada.batida && bola.vel.z > 0.5) return 'trave'; // voltou da trave para o campo
  if (acabou) return jogada.batida ? 'trave' : 'curta';
  return null;
}

function mostrarResultado(resultado) {
  estado.cobrancas++;
  let titulo;
  const sub = [];
  if (resultado === 'gol') {
    estado.gols++;
    estado.sequencia++;
    titulo = 'GOL!';
    const { x, y } = bola.cruzamento;
    if (Math.abs(x) > CONFIG.golLargura / 2 - 0.9 && y > CONFIG.golAltura - 0.8) sub.push('No ângulo!');
    else if (jogada.batida) sub.push('Bateu na trave e entrou!');
    if (estado.sequencia >= 2) sub.push(`${estado.sequencia} seguidos`);
  } else {
    estado.sequencia = 0;
    if (resultado === 'trave') titulo = jogada.batida === 'travessao' ? 'NO TRAVESSÃO!' : 'NA TRAVE!';
    else if (resultado === 'cima') titulo = 'POR CIMA';
    else if (resultado === 'fora') titulo = 'PRA FORA';
    else titulo = 'NÃO CHEGOU';
    if (resultado === 'fora' && jogada.redeFora) sub.push('Na rede, pelo lado de fora');
  }
  elementos.resultadoTitulo.textContent = titulo;
  elementos.resultadoSub.textContent = sub.join(' · ');
  elementos.resultado.className = resultado === 'gol' ? 'gol' : 'erro';
  void elementos.resultado.offsetWidth; // reinicia a animação
  elementos.resultado.classList.add('mostrar');
  const seq = estado.sequencia >= 2 ? ` · sequência ${estado.sequencia}` : '';
  elementos.placar.textContent = `Gols: ${estado.gols} de ${estado.cobrancas}${seq}`;
}

// ---------- Controles ----------

const botao = elementos.botao;
botao.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  botao.setPointerCapture(e.pointerId); // continua valendo mesmo se o dedo escorregar para fora
  comecarCarga();
});
botao.addEventListener('pointerup', soltarChute);
botao.addEventListener('pointercancel', soltarChute);
botao.addEventListener('contextmenu', (e) => e.preventDefault());

// No computador, a barra de espaço também chuta
const digitando = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !digitando(e)) {
    e.preventDefault();
    comecarCarga();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !digitando(e)) soltarChute();
});

// Painel de ajuste: mudar a posição da falta reposiciona a bola na hora
criarPainel({
  config: CONFIG,
  versao: VERSAO,
  aoMudar: (chave) => {
    if (chave.startsWith('falta.') && estado.fase === 'pronto') novaCobranca();
  },
});

// Tocar na tela durante o voo pula direto para a próxima cobrança
document.getElementById('jogo').addEventListener('pointerdown', () => {
  if (estado.fase === 'voo' || estado.fase === 'fim') novaCobranca();
});

// ---------- Loop principal ----------

const eixoGiro = new THREE.Vector3();
const giroVisual = new THREE.Quaternion();

function atualizarBolaNaTela(dt) {
  const { pos, vel, giro } = bola;
  bolaMesh.position.set(pos.x, pos.y, pos.z);

  // Gira a bola na tela: rolando no chão ou pelo efeito do chute
  if (noChao(bola, CONFIG)) eixoGiro.set(vel.z, 0, -vel.x).divideScalar(CONFIG.raioBola);
  else eixoGiro.set(giro.x, giro.y, giro.z).multiplyScalar(GIRO_VISUAL);
  const angulo = eixoGiro.length() * dt;
  if (angulo > 1e-5) {
    giroVisual.setFromAxisAngle(eixoGiro.normalize(), angulo);
    bolaMesh.quaternion.premultiply(giroVisual);
  }

  const altura = pos.y - CONFIG.raioBola;
  const tamanho = 0.5 + altura * 0.12;
  sombra.position.set(pos.x, 0.01, pos.z);
  sombra.scale.set(tamanho, tamanho, 1);
  sombra.material.opacity = Math.max(0.15, 1 - altura * 0.12);
}

// Câmera aérea: alta e atrás da bola. Olha para um ponto entre a bola e o gol:
// no começo mostra a bola saindo, no fim mostra o gol inteiro.
function poseAerea(inicio) {
  const c = CONFIG.camera;
  const distancia = Math.hypot(inicio.x, inicio.z);
  const fx = -inicio.x / distancia; // direção da bola para o gol
  const fz = -inicio.z / distancia;
  const dx = -fz;                   // direita de quem cobra
  const dz = fx;
  const pos = new THREE.Vector3(
    inicio.x - fx * c.aereaAtras + dx * c.aereaLado + (bola.pos.x - inicio.x) * c.aereaAproxima,
    c.aereaAltura,
    inicio.z - fz * c.aereaAtras + dz * c.aereaLado + (bola.pos.z - inicio.z) * c.aereaAproxima
  );
  const centroGol = new THREE.Vector3(0, 1, 0);
  const olhar = new THREE.Vector3(bola.pos.x, bola.pos.y, bola.pos.z).lerp(centroGol, c.aereaAlvo);
  return { pos, olhar };
}

function atualizarCamera(dt) {
  const c = CONFIG.camera;
  const inicio = posicaoDaFalta();
  const emJogo = estado.fase === 'voo' || estado.fase === 'fim';

  // Câmera atrás da bola, acompanhando de leve depois do chute
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

const relogio = new THREE.Clock();
// Com ?teste no endereço, cada quadro vale exatamente 1/60 s: os testes automáticos ficam previsíveis
const MODO_TESTE = new URLSearchParams(location.search).has('teste');
window.tempoDeJogo = 0;

function quadro() {
  const dt = MODO_TESTE ? 1 / 60 : Math.min(relogio.getDelta(), 0.05);
  window.tempoDeJogo += dt;

  if (estado.fase === 'carregando') {
    estado.carga = Math.min(1, estado.carga + dt / CONFIG.tempoCarga);
    mostrarCarga(estado.carga);
  }

  if (estado.fase === 'voo' || estado.fase === 'fim') {
    const passos = Math.ceil(dt / PASSO_FISICA);
    for (let i = 0; i < passos; i++) passo(bola, dt / passos, CONFIG);
    processarEventos();
  }
  atualizarRede(dt);

  if (estado.fase === 'voo') {
    estado.tempo += dt;
    const parada = noChao(bola, CONFIG) && Math.hypot(bola.vel.x, bola.vel.z) < 0.3;
    const resultado = decidirResultado(parada || estado.tempo > CONFIG.tempoMaxVoo);
    if (resultado) {
      mostrarResultado(resultado);
      encerrarJogada(resultado === 'gol' ? CONFIG.esperaGol : CONFIG.esperaRecomeco);
    }
  } else if (estado.fase === 'fim') {
    estado.espera -= dt;
    if (estado.espera <= 0) novaCobranca();
  }

  atualizarBolaNaTela(dt);
  atualizarCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(quadro);
}

novaCobranca();
requestAnimationFrame(quadro);
