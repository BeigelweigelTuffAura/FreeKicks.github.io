import * as THREE from 'three';
import { CONFIG, VERSAO } from './config.js?v=1';
import { criarBola, chutar, passo, noChao } from './physics.js?v=1';

const GRAUS = Math.PI / 180;
const PASSO_FISICA = 1 / 240; // a física roda em passos pequenos e fixos, independente do celular

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

  // Placas de publicidade atrás do gol, só para dar fundo e noção de profundidade
  const placas = new THREE.Group();
  const cores = [0x1d3557, 0xe63946, 0x1d3557, 0xf1c40f];
  for (let i = 0; i < 16; i++) {
    const placa = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.9, 0.1),
      new THREE.MeshLambertMaterial({ color: cores[i % cores.length] })
    );
    placa.position.set(-46.5 + i * 6.2, 0.45, -7);
    placas.add(placa);
  }
  scene.add(placas);
}

// ---------- Gol com rede ----------

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
  const planoRede = (largura, altura) => {
    const textura = texturaRede();
    textura.repeat.set(largura / malha, altura / malha);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(largura, altura),
      new THREE.MeshBasicMaterial({
        map: textura, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true,
      })
    );
  };
  const fundo = planoRede(L, A);
  fundo.position.set(0, A / 2, -P);
  gol.add(fundo);
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
criarGol();

// ---------- Câmera ----------

let cameraBase = new THREE.Vector3();
let olharBase = new THREE.Vector3();

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
  camera.lookAt(olharBase);
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
};
document.getElementById('versao').textContent = VERSAO;

// fase: 'pronto' -> 'carregando' -> 'voo' -> 'fim' -> 'pronto'
const estado = { fase: 'pronto', carga: 0, tempo: 0, espera: 0 };
let bola;

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
  elementos.info.innerHTML = `Falta a <b>${CONFIG.falta.distancia} m</b>`;
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
  const velocidade = chutar(bola, { alvo: { x: 0, z: 0 }, forca }, CONFIG);
  estado.fase = 'voo';
  estado.tempo = 0;
  elementos.mensagem.textContent = `Força ${Math.round(forca * 100)}% · ${Math.round(velocidade * 3.6)} km/h`;
}

function encerrarJogada() {
  estado.fase = 'fim';
  estado.espera = CONFIG.esperaRecomeco;
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
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    comecarCarga();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') soltarChute();
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
  else eixoGiro.set(giro.x, giro.y, giro.z);
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

function atualizarCamera() {
  const seguir = CONFIG.camera.seguir;
  const inicio = posicaoDaFalta();
  const alvoCamera = cameraBase.clone();
  const alvoOlhar = olharBase.clone();
  if (estado.fase === 'voo' || estado.fase === 'fim') {
    alvoCamera.x += (bola.pos.x - inicio.x) * seguir;
    alvoCamera.y += (bola.pos.y - inicio.y) * seguir * 0.5;
    alvoCamera.z += Math.max(-8, (bola.pos.z - inicio.z) * seguir);
    alvoOlhar.x += (bola.pos.x - inicio.x) * seguir;
  }
  camera.position.lerp(alvoCamera, 0.08);
  camera.lookAt(alvoOlhar);
}

const relogio = new THREE.Clock();

function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);

  if (estado.fase === 'carregando') {
    estado.carga = Math.min(1, estado.carga + dt / CONFIG.tempoCarga);
    mostrarCarga(estado.carga);
  }

  if (estado.fase === 'voo' || estado.fase === 'fim') {
    const passos = Math.ceil(dt / PASSO_FISICA);
    for (let i = 0; i < passos; i++) passo(bola, dt / passos, CONFIG);
  }

  if (estado.fase === 'voo') {
    estado.tempo += dt;
    const parada = noChao(bola, CONFIG) && Math.hypot(bola.vel.x, bola.vel.z) < 0.3;
    const passouDoGol = bola.pos.z < -CONFIG.golProfundidade - 1;
    if (parada || passouDoGol || estado.tempo > CONFIG.tempoMaxVoo) encerrarJogada();
  } else if (estado.fase === 'fim') {
    estado.espera -= dt;
    if (estado.espera <= 0) novaCobranca();
  }

  atualizarBolaNaTela(dt);
  atualizarCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(quadro);
}

novaCobranca();
requestAnimationFrame(quadro);
