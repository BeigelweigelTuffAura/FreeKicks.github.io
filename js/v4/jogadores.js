// Bonecos 3D dos jogadores: feitos por código (sem arquivos de modelo), low poly e leves para o celular.
// Cada lenda é reconhecida pelo cabelo, barba, tom de pele, altura, porte, cor da chuteira e número.
// O corpo tem juntas (tronco, cabeça, ombros, cotovelos, quadris, joelhos e tornozelos) movidas por poses.
//
// Eixos do boneco: pés em y = 0, de frente para +z local. A direita do jogador fica em −x local.
// Medidas em metros; ângulos em radianos.
//
// Formato da pose (todo campo é opcional; o que faltar vale 0, menos apoio, que vale 1):
//   tronco: { frente, lado, giro }  frente > 0 inclina para a frente; lado > 0 inclina para a direita
//                                   do jogador; giro > 0 vira o peito para a esquerda do jogador
//   cabeca: { frente, giro }        frente > 0 olha para baixo; giro > 0 vira para a esquerda do jogador
//   bracoE / bracoD: { frente, lado, cotovelo }
//                                   frente > 0 levanta o braço para a frente; lado > 0 abre para fora
//                                   (π = braço esticado para cima); cotovelo > 0 dobra (a mão vem para a frente)
//   pernaE / pernaD: { frente, lado, joelho, tornozelo }
//                                   frente > 0 leva a perna para a frente; lado > 0 abre para fora;
//                                   joelho > 0 dobra (o pé vai para trás); tornozelo > 0 aponta o bico
//                                   para baixo (com 0, a sola fica paralela ao chão)
//   agachar: 0 a 1                  dobra as duas pernas e abaixa o corpo (1 = agachado fundo)
//   Extras:
//   quadril: { frente, lado, giro } gira a bacia inteira (o corpo todo acompanha)
//   apoio: 0 a 1 (padrão 1)         1 = o pé mais baixo encosta no chão (y = 0 do grupo);
//                                   0 = quadril na altura de quem está de pé (para pulos e mergulhos)
//   pulo: m (padrão 0)              sobe o corpo inteiro (os pés saem do chão)
//   maoE / maoD: { x, y, z, peso }  leva a mão até o ponto (no espaço do tronco: origem na cintura,
//                                   y para cima, z para a frente; boneco de 1,80 m); peso 0 a 1

import * as THREE from 'three';

const GRAUS = Math.PI / 180;
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const suave = (t) => {
  const u = limitar(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const misturar = (a, b, k) => a + (b - a) * k;

// ---------- Uniformes ----------
// camisa, listras (cor das listras verticais ou null), calcao, meiao, numero (cor do número),
// gola (gola, punhos e detalhes). Extras: faixaMeiao (listra do meião), luvas (goleiros).

export const UNIFORMES = {
  // Rubro-negro listrado: camisa vermelha com listras pretas, calção e meião pretos
  lendas: {
    camisa: '#c4142b', listras: '#151515', calcao: '#151515', meiao: '#151515',
    numero: '#ffffff', gola: '#151515', faixaMeiao: '#c4142b',
  },
  // Todo branco com calção azul-marinho
  adversario: {
    camisa: '#f3f3ef', listras: null, calcao: '#1d2a4d', meiao: '#f3f3ef',
    numero: '#1d2a4d', gola: '#1d2a4d', faixaMeiao: '#1d2a4d',
  },
  // Goleiro adversário: verde-limão neon
  goleiroAdversario: {
    camisa: '#c3f02a', listras: null, calcao: '#1b1b1b', meiao: '#c3f02a',
    numero: '#1b1b1b', gola: '#1b1b1b', faixaMeiao: '#1b1b1b', luvas: '#f4f4f4',
  },
  // Goleiro das lendas (Mito e Chila quando batem a falta): cinza com detalhes laranja
  goleiroLendas: {
    camisa: '#7b828b', listras: null, calcao: '#363b43', meiao: '#7b828b',
    numero: '#ff7a1a', gola: '#ff7a1a', faixaMeiao: '#ff7a1a', luvas: '#ff7a1a',
  },
};

// ---------- Medidas do boneco de referência (1,80 m; o resto é escala) ----------

const ALTURA_REF = 1.795;   // m do chão ao alto da cabeça (sem o cabelo)
const QUADRIL_Y = 0.95;     // m: pivô da bacia, de pé
const QUADRIL_X = 0.095;    // m do meio até a junta de cada quadril
const QUADRIL_JUNTA_Y = -0.02;
const COXA = 0.44;          // m do quadril ao joelho
const CANELA = 0.42;        // m do joelho ao tornozelo
const CINTURA = 0.07;       // m: pivô do tronco acima da bacia
const OMBRO_X = 0.175;
const OMBRO_Y = 0.40;       // m acima da cintura
const BRACO = 0.29;         // m do ombro ao cotovelo
const ANTEBRACO = 0.25;     // m do cotovelo ao punho
const MAO_CENTRO = 0.065;   // m do punho ao meio da palma
const PESCOCO = 0.47;       // m: pivô da cabeça (base do pescoço) acima da cintura
const CRANIO = { y: 0.19, z: 0.008, rx: 0.081, ry: 0.112, rz: 0.097 }; // centro e raios, a partir do pescoço
const QUEDA_AGACHAR = 0.26; // m que o quadril desce com agachar = 1
// Pontos da sola (no espaço do tornozelo): calcanhar, meio e bico. O mais baixo encosta no chão.
const SOLA = [[0, -0.07, -0.055], [0, -0.07, 0.1], [0, -0.062, 0.19]];
const PEITO_DO_PE = [0, -0.005, 0.085]; // onde o pé pega na bola (em cima do pé, no espaço do tornozelo)

// ---------- Cache (geometrias e materiais compartilhados entre todos os bonecos) ----------

const cacheGeo = new Map();
const cacheMat = new Map();
function geo(chave, criar) {
  let g = cacheGeo.get(chave);
  if (!g) {
    g = criar();
    cacheGeo.set(chave, g);
  }
  return g;
}

// Material de cor lisa (Lambert: barato e com luz suave). duplo: pinta os dois lados (cabelo fino).
function matCor(cor, duplo = false) {
  const c = new THREE.Color(cor);
  const chave = `cor:${c.getHexString()}:${duplo ? 2 : 1}`;
  let m = cacheMat.get(chave);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c, side: duplo ? THREE.DoubleSide : THREE.FrontSide });
    cacheMat.set(chave, m);
  }
  return m;
}

function corMisturada(a, b, k) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}

// Junta várias geometrias numa só malha (mesma cor = uma malha só: menos trabalho para o celular).
// partes: [geometria] ou [[geometria, matriz]]
function fundir(partes) {
  const prontas = partes.map((p) => {
    const [g, m] = Array.isArray(p) ? p : [p, null];
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (m) n.applyMatrix4(m);
    g.dispose();
    return n;
  });
  let total = 0;
  for (const n of prontas) total += n.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const n of prontas) {
    pos.set(n.attributes.position.array, o * 3);
    nor.set(n.attributes.normal.array, o * 3);
    if (n.attributes.uv) uv.set(n.attributes.uv.array, o * 2);
    o += n.attributes.position.count;
    n.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

const matriz = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

// Peça torneada (como no torno): perfil [[raio, y], ...] de baixo para cima, girado em volta do eixo y
function torneado(perfil, segmentos = 7, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), segmentos);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  return g;
}

// Peça feita de anéis elípticos [y, meiaLargura, meiaProfundidade] de baixo para cima.
// A textura dá a volta: u = 0,25 na frente (+z), 0,75 nas costas; v cresce com o comprimento da superfície.
function anelado(aneis, segmentos) {
  const n = aneis.length;
  const comp = [0];
  for (let j = 1; j < n; j++) {
    const [y0, w0, d0] = aneis[j - 1];
    const [y1, w1, d1] = aneis[j];
    comp.push(comp[j - 1] + Math.hypot(y1 - y0, (w1 + d1 - w0 - d0) / 2));
  }
  const total = comp[n - 1];
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j < n; j++) {
    const [y, w, d] = aneis[j];
    for (let i = 0; i <= segmentos; i++) {
      const phi = -Math.PI / 2 + (i / segmentos) * Math.PI * 2;
      pos.push(w * Math.sin(phi), y, d * Math.cos(phi));
      uv.push(i / segmentos, comp[j] / total);
    }
  }
  const linha = segmentos + 1;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < segmentos; i++) {
      const a = j * linha + i;
      const b = a + 1;
      const d = a + linha;
      const c = d + 1;
      idx.push(a, b, d, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Costura (primeira e última coluna) e polos (anéis de raio zero): média das normais, sem vinco
  const nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let j = 0; j < n; j++) {
    const a = j * linha;
    const b = a + segmentos;
    if (aneis[j][1] === 0) {
      v.set(0, 0, 0);
      for (let i = a; i <= b; i++) v.add(new THREE.Vector3().fromBufferAttribute(nor, i));
      v.normalize();
      for (let i = a; i <= b; i++) nor.setXYZ(i, v.x, v.y, v.z);
    } else {
      v.fromBufferAttribute(nor, a).add(new THREE.Vector3().fromBufferAttribute(nor, b)).normalize();
      nor.setXYZ(a, v.x, v.y, v.z);
      nor.setXYZ(b, v.x, v.y, v.z);
    }
  }
  return { geometria: g, v: (y) => interpolarV(aneis, comp, total, y) };
}

function interpolarV(aneis, comp, total, y) {
  for (let j = 1; j < aneis.length; j++) {
    if (y <= aneis[j][0] || j === aneis.length - 1) {
      const y0 = aneis[j - 1][0];
      const f = limitar((y - y0) / ((aneis[j][0] - y0) || 1), 0, 1);
      return (comp[j - 1] + (comp[j] - comp[j - 1]) * f) / total;
    }
  }
  return 1;
}

// ---------- Tronco (camisa) e bacia (calção) ----------
// Anéis da camisa: [y acima da cintura, meia largura, meia profundidade]. Barra solta por cima do calção.
const ANEIS_CAMISA = [
  [-0.06, 0.172, 0.122],
  [0.04, 0.166, 0.118],
  [0.16, 0.17, 0.122],
  [0.27, 0.18, 0.126],
  [0.35, 0.185, 0.122],
  [0.41, 0.178, 0.11],
  [0.448, 0.15, 0.092],
  [0.472, 0.1, 0.07],
  [0.482, 0.058, 0.052],
  [0.486, 0, 0],
];
const camisaBase = anelado(ANEIS_CAMISA, 12);

const ANEIS_CALCAO = [
  [-0.145, 0, 0],
  [-0.14, 0.09, 0.07],
  [-0.115, 0.16, 0.11],
  [-0.05, 0.176, 0.12],
  [0.05, 0.172, 0.118],
  [0.13, 0.162, 0.112],
  [0.135, 0, 0],
];

// ---------- Cabeça ----------

// Ponto da superfície da cabeça na direção (x, y, z) da esfera unitária, afastado 'folga' m da pele.
// Mandíbula mais estreita que o crânio e queixo um pouco para a frente.
function pontoCabeca(x, y, z, folga = 0, escala = 1) {
  const baixo = Math.max(0, -y);
  const kx = 1 - 0.3 * baixo * baixo;
  const kz = 1 - 0.12 * baixo * baixo;
  const queixo = z > 0 ? 0.014 * baixo * z : 0;
  return new THREE.Vector3(
    x * (CRANIO.rx * escala * kx + folga),
    CRANIO.y + y * (CRANIO.ry * escala + folga),
    CRANIO.z + z * (CRANIO.rz * escala * kz + folga) + queixo,
  );
}
const direcao = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Pedaço de esfera com os vértices levados para a superfície da cabeça (com folga)
function cascaCabeca(seg, aneis, phiIni, phiComp, thetaIni, thetaComp, folga, escala = 1) {
  const g = new THREE.SphereGeometry(1, seg, aneis, phiIni, phiComp, thetaIni, thetaComp);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const q = pontoCabeca(p.getX(i), p.getY(i), p.getZ(i), folga, escala);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

function geoCabeca() {
  const cabeca = cascaCabeca(12, 9, 0, Math.PI * 2, 0, Math.PI, 0);
  const pescoco = new THREE.CylinderGeometry(0.05, 0.055, 0.16, 8, 1, true);
  const nariz = new THREE.BoxGeometry(0.024, 0.038, 0.028);
  const pNariz = pontoCabeca(0, -0.12, 0.99);
  const orelha = new THREE.SphereGeometry(1, 5, 4);
  const orelhaD = orelha.clone();
  return fundir([
    cabeca,
    [pescoco, matriz(0, 0.06, -0.008)],
    [nariz, matriz(0, pNariz.y, pNariz.z + 0.006, -0.35)],
    [orelha, matriz(CRANIO.rx + 0.002, 0.182, -0.005, 0, 0, 0, 0.013, 0.028, 0.02)],
    [orelhaD, matriz(-CRANIO.rx - 0.002, 0.182, -0.005, 0, 0, 0, 0.013, 0.028, 0.02)],
  ]);
}

// Olhos e boca (escuros) e sobrancelhas, presos na superfície do rosto
function geoOlhos() {
  const partes = [];
  for (const s of [-1, 1]) {
    const d = direcao(0.36 * s, 0.09, 0.93);
    const p = pontoCabeca(d.x, d.y, d.z, 0.001);
    partes.push([new THREE.BoxGeometry(0.017, 0.011, 0.008), matriz(p.x, p.y, p.z, 0, 0.38 * s)]);
  }
  const b = pontoCabeca(0, -0.52, 0.85, 0.001);
  partes.push([new THREE.BoxGeometry(0.03, 0.006, 0.006), matriz(b.x, b.y, b.z, 0.5)]);
  return fundir(partes);
}

function geoSobrancelhas() {
  const partes = [];
  for (const s of [-1, 1]) {
    const d = direcao(0.37 * s, 0.27, 0.89);
    const p = pontoCabeca(d.x, d.y, d.z, 0.002);
    partes.push([new THREE.BoxGeometry(0.031, 0.008, 0.008), matriz(p.x, p.y, p.z, -0.2, 0.38 * s, -0.12 * s)]);
  }
  return fundir(partes);
}

// ---------- Cabelos ----------
// A calota segue a linha do cabelo: 'frente' (testa), 'lado' (acima das orelhas) e 'tras' (nuca),
// em graus a partir do alto da cabeça. 'topo' dá volume a mais em cima.

function limiteCabelo(linha, x, z) {
  const c = Math.cos(Math.atan2(x, z)); // 1 = frente, -1 = nuca
  const f = Math.max(0, c);
  const t = Math.max(0, -c);
  return (linha.lado + (linha.frente - linha.lado) * f * f + (linha.tras - linha.lado) * Math.sqrt(t) * t) * GRAUS;
}

// Cachos e ondas: relevo irregular (0 a ~1) conforme a direção na cabeça
function relevo(x, y, z, freq) {
  const a = Math.sin(freq * x + 1.7) * Math.sin(freq * 1.13 * y + 0.3) * Math.sin(freq * 0.91 * z + 2.2);
  const b = Math.sin(freq * 2.1 * (x + y) + 0.9) * Math.sin(freq * 1.9 * (z - y) + 1.1);
  return Math.max(0, 0.6 + a + 0.5 * b) / 2.1;
}

// opcoes: escala (tamanho), topo (volume a mais em cima), borda (graus em que a calota encosta na pele
// perto da linha do cabelo), ondas { amplitude (m), frequencia }, seg e aneis (resolução)
function calota(linha, folga, { escala = 1, topo = 0, borda = 16, ondas = null, seg = 12, aneis = 8 } = {}) {
  const g = new THREE.SphereGeometry(1, seg, aneis);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    // Direção em volta do eixo (pelo u da textura, que vale também nos polos)
    const phi = uv.getX(i) * Math.PI * 2;
    const ax = -Math.cos(phi);
    const az = Math.sin(phi);
    const theta = Math.acos(limitar(p.getY(i), -1, 1));
    const lim = limiteCabelo(linha, ax, az);
    const novo = (theta / Math.PI) * lim; // aperta a esfera inteira dentro da linha do cabelo
    const x = ax * Math.sin(novo);
    const z = az * Math.sin(novo);
    const y = Math.cos(novo);
    // Perto da linha do cabelo a calota encosta na pele (sem "borda de capacete")
    const b = suave((lim - novo) / (borda * GRAUS));
    let f = 0.0025 + (folga - 0.0025) * b + topo * Math.max(0, y) ** 2;
    if (ondas) f += ondas.amplitude * relevo(x, y, z, ondas.frequencia) * (0.35 + 0.65 * b);
    const q = pontoCabeca(x, y, z, f, misturar(1, escala, b));
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

// Bolinha de cachos: icosaedro com normais de esfera (parece redondo com só 20 triângulos)
function bolinha(raio) {
  const g = new THREE.IcosahedronGeometry(raio, 0);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Crista do moicano: faixa estreita no meio da cabeça, da testa até a nuca, mais alta na frente
function crista(folga, largura = 0.3, alturaMax = 0.04) {
  const g = new THREE.SphereGeometry(1, 16, 4, -110 * GRAUS, 158 * GRAUS, Math.PI / 2 - largura, 2 * largura);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    // Esfera deitada: o "equador" vira o meio da cabeça (plano x = 0)
    const x = p.getY(i);
    const y = -p.getX(i);
    const z = p.getZ(i);
    const phi = (-110 + uv.getX(i) * 158) * GRAUS;  // 0 = alto da cabeça, + = para a testa
    const meio = 1 - (x / Math.sin(largura)) ** 2;   // 1 no meio da crista, 0 nas beiradas
    const h = (0.012 + alturaMax * Math.exp(-((((phi / GRAUS) - 22) / 48) ** 2))) * Math.max(0, meio);
    const q = pontoCabeca(x, y, z, folga + h);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

// Pontos espalhados por igual na esfera (espiral de Fibonacci)
function pontosEsfera(n) {
  const r = [];
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const raio = Math.sqrt(1 - y * y);
    r.push(new THREE.Vector3(Math.cos(ouro * i) * raio, y, Math.sin(ouro * i) * raio));
  }
  return r;
}

// Cachos: bolinhas sobre a calota (e descendo pela nuca, se 'nuca' > 0 graus)
function cachos(linha, folga, raio, n, { nuca = 0, evitarFaixa = false, escala = 1 } = {}) {
  const partes = [];
  for (const d of pontosEsfera(n)) {
    const theta = Math.acos(d.y);
    const lim = limiteCabelo(linha, d.x, d.z);
    const atras = Math.max(0, -d.z / Math.hypot(d.x, d.z || 1e-6));
    if (theta > lim - 6 * GRAUS + nuca * GRAUS * atras * atras) continue;
    if (evitarFaixa && Math.abs(theta - anguloFaixa(d.x, d.z)) < 9 * GRAUS) continue;
    const p = pontoCabeca(d.x, d.y, d.z, folga, escala);
    const r = raio * (0.85 + 0.3 * Math.abs(Math.sin(d.x * 37 + d.z * 11)));
    partes.push([bolinha(r), matriz(p.x, p.y, p.z, d.x * 3, d.y * 5, d.z * 2)]);
  }
  return partes;
}

// Faixa de cabelo: passa na testa, logo acima da linha do cabelo, e desce atrás da cabeça
function anguloFaixa(x, z) {
  const c = Math.cos(Math.atan2(x, z));
  return (76 - 26 * c) * GRAUS;
}
function geoFaixa(folga) {
  const seg = 20;
  const aneis = [[-6, 0], [0, 0.006], [6, 0]]; // [graus em volta do meio da faixa, folga a mais]
  const pos = [];
  const idx = [];
  for (const [dg, f] of aneis) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.sin(a);
      const z = Math.cos(a);
      const theta = anguloFaixa(x, z) + dg * GRAUS;
      const q = pontoCabeca(x * Math.sin(theta), Math.cos(theta), z * Math.sin(theta), folga + f);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Folga (distância da pele) da superfície de cada estilo, para a faixa ficar por cima
const FOLGA_CABELO = {
  careca: 0, raspado: 0.004, curto: 0.012, topete: 0.01, moicano: 0.004,
  medio: 0.02, longo: 0.015, cacheado: 0.014, volumoso: 0.032,
};

// Partes do cabelo de cada estilo: [{ geometria, tom: 'cabelo' | 'raspado' }]
function geoCabelo(estilo, comFaixa) {
  return geo(`cabelo:${estilo}:${comFaixa ? 1 : 0}`, () => {
    const f = FOLGA_CABELO[estilo] ?? 0.012;
    switch (estilo) {
      case 'careca':
        return [];
      case 'raspado':
        return [{ geometria: calota({ frente: 47, lado: 88, tras: 122 }, f), tom: 'raspado' }];
      case 'curto':
        return [{ geometria: calota({ frente: 45, lado: 90, tras: 124 }, f, { topo: 0.008 }), tom: 'cabelo' }];
      case 'topete': {
        // Lados curtos e volume em cima, penteado para cima na frente
        const base = calota({ frente: 44, lado: 86, tras: 120 }, f, { topo: 0.016 });
        const d = direcao(0, 0.74, 0.67);
        const p = pontoCabeca(d.x, d.y, d.z, 0.014);
        return [{
          geometria: fundir([
            base,
            [new THREE.SphereGeometry(1, 9, 6), matriz(p.x, p.y + 0.008, p.z - 0.006, -0.85, 0, 0, 0.058, 0.03, 0.05)],
          ]),
          tom: 'cabelo',
        }];
      }
      case 'moicano':
        // Lados raspados e uma crista no meio, da testa até a nuca (mais alta na frente)
        return [
          { geometria: calota({ frente: 47, lado: 84, tras: 118 }, f), tom: 'raspado' },
          { geometria: crista(f), tom: 'cabelo' },
        ];
      case 'medio':
        // Anos 70/80: cobre as orelhas, franja na testa, desce na nuca (pontas soltas)
        return [{
          geometria: calota({ frente: 55, lado: 110, tras: 138 }, f, {
            escala: 1.02, topo: 0.012, borda: 7, ondas: { amplitude: 0.006, frequencia: 9 }, seg: 14, aneis: 9,
          }),
          tom: 'cabelo',
        }];
      case 'longo': {
        // Comprido até os ombros, atrás das orelhas
        const base = calota({ frente: 47, lado: 98, tras: 124 }, f, { topo: 0.008 });
        const cortina = new THREE.CylinderGeometry(0.094, 0.112, 0.2, 12, 2, true, Math.PI - 1.75, 3.5);
        const mechas = [];
        for (const s of [-1, 1]) {
          const d = direcao(0.93 * s, -0.05, 0.3);
          const p = pontoCabeca(d.x, d.y, d.z, f);
          mechas.push([new THREE.BoxGeometry(0.022, 0.13, 0.05), matriz(p.x, p.y - 0.045, p.z - 0.01, 0, 0, 0.1 * s)]);
        }
        return [{
          geometria: fundir([base, [cortina, matriz(0, CRANIO.y - 0.1, CRANIO.z - 0.012, 0.12, 0, 0, 1, 1, 1.12)], ...mechas]),
          tom: 'cabelo',
        }];
      }
      case 'cacheado': {
        // Cachos: calota com relevo e algumas bolinhas, descendo pela nuca
        const linha = { frente: 44, lado: 98, tras: 132 };
        return [{
          geometria: fundir([
            calota(linha, f, { borda: 8, ondas: { amplitude: 0.022, frequencia: 13 }, seg: 18, aneis: 11 }),
            ...cachos(linha, f + 0.002, 0.024, 26, { nuca: 10, evitarFaixa: comFaixa }),
          ]),
          tom: 'cabelo',
        }];
      }
      case 'volumoso':
        // Volume grande e redondo (anos 70/80), com ondas
        return [{
          geometria: calota({ frente: 47, lado: 108, tras: 134 }, f, {
            escala: 1.08, topo: 0.035, borda: 9, ondas: { amplitude: 0.03, frequencia: 9 }, seg: 18, aneis: 11,
          }),
          tom: 'cabelo',
        }];
      default:
        return geoCabelo('curto', comFaixa);
    }
  });
}

// ---------- Barbas ----------
function geoBarba(estilo) {
  return geo(`barba:${estilo}`, () => {
    const bigode = (largura, grosso) => {
      const p = pontoCabeca(0, -0.37, 0.93, 0.004);
      const partes = [[new THREE.BoxGeometry(largura, grosso, 0.016), matriz(p.x, p.y, p.z, 0.35)]];
      for (const s of [-1, 1]) {
        const d = direcao(0.3 * s, -0.5, 0.82);
        const q = pontoCabeca(d.x, d.y, d.z, 0.004);
        partes.push([new THREE.BoxGeometry(0.012, grosso * 1.8, 0.014), matriz(q.x, q.y, q.z, 0.4, 0.3 * s)]);
      }
      return partes;
    };
    switch (estilo) {
      case 'cheia':
        return fundir([
          cascaCabeca(12, 5, 0.04 * Math.PI, 0.92 * Math.PI, 96 * GRAUS, 74 * GRAUS, 0.008),
          ...bigode(0.058, 0.014),
        ]);
      case 'rala':
        return cascaCabeca(12, 5, 0.06 * Math.PI, 0.88 * Math.PI, 100 * GRAUS, 70 * GRAUS, 0.003);
      case 'bigode':
        return fundir(bigode(0.066, 0.018));
      case 'cavanhaque': {
        const q = pontoCabeca(0, -0.84, 0.54, 0.006);
        return fundir([
          ...bigode(0.05, 0.012),
          [new THREE.SphereGeometry(1, 7, 5), matriz(q.x, q.y, q.z, 0.5, 0, 0, 0.022, 0.026, 0.016)],
        ]);
      }
      default:
        return null;
    }
  });
}

// ---------- Braços, pernas e pés ----------
const PERFIS = {
  // (partes de pele escondidas dentro da manga, do calção ou do meião não são desenhadas)
  manga: [[0, -0.155], [0.054, -0.152], [0.057, -0.12], [0.06, -0.04], [0.054, 0.04], [0.032, 0.07], [0, 0.078]],
  mangaLonga: [[0, -0.3], [0.046, -0.296], [0.05, -0.2], [0.058, -0.08], [0.054, 0.04], [0.032, 0.07], [0, 0.078]],
  braco: [[0, -0.305], [0.034, -0.3], [0.038, -0.27], [0.044, -0.19], [0.046, -0.11]],
  antebraco: [[0, -0.255], [0.026, -0.252], [0.029, -0.21], [0.039, -0.09], [0.04, -0.03], [0.034, 0.025]],
  antebracoManga: [[0, -0.25], [0.04, -0.246], [0.04, -0.2], [0.047, -0.09], [0.048, -0.03], [0.042, 0.025]],
  coxa: [[0, -0.46], [0.045, -0.452], [0.051, -0.4], [0.063, -0.3], [0.072, -0.18], [0.075, -0.13]],
  pernaCalcao: [[0, -0.205], [0.086, -0.2], [0.09, -0.1], [0.088, 0], [0.072, 0.06]],
  canela: [[0.047, -0.11], [0.049, -0.06], [0.048, 0], [0.04, 0.03], [0, 0.045]],
  meiao: [[0, -0.432], [0.036, -0.426], [0.039, -0.36], [0.053, -0.24], [0.058, -0.15], [0.054, -0.075]],
};

function geoBota() {
  const g = new THREE.SphereGeometry(1, 8, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 0.05;
    let y = p.getY(i) * 0.045;
    const z = p.getZ(i) * 0.135;
    if (z > 0) {
      const k = z / 0.135;
      x *= 1 - 0.28 * k * k; // bico mais fino
      y -= 0.012 * k * (y > 0 ? 1 : 0); // e mais baixo
    }
    y = Math.max(y, -0.04); // sola reta
    p.setXYZ(i, x, y - 0.03, z + 0.065);
  }
  g.computeVertexNormals();
  return g;
}

function geoMao() {
  const palma = new THREE.SphereGeometry(1, 6, 5);
  const dedao = new THREE.SphereGeometry(1, 4, 3);
  return fundir([
    [palma, matriz(0, -MAO_CENTRO, 0.005, 0, 0, 0, 0.02, 0.062, 0.042)],
    [dedao, matriz(0.012, -0.045, 0.035, 0.6, 0, 0, 0.012, 0.03, 0.013)],
  ]);
}

function geoLuva() {
  const palma = new THREE.SphereGeometry(1, 7, 5);
  const punho = new THREE.CylinderGeometry(0.042, 0.04, 0.05, 7, 1, true);
  const dedao = new THREE.SphereGeometry(1, 5, 3);
  return fundir([
    [palma, matriz(0, -0.075, 0.008, 0, 0, 0, 0.03, 0.08, 0.058)],
    [punho, matriz(0, -0.01, 0)],
    [dedao, matriz(0.018, -0.05, 0.05, 0.6, 0, 0, 0.018, 0.038, 0.018)],
  ]);
}

// ---------- Texturas (desenhadas num canvas) ----------
const temDocumento = typeof document !== 'undefined';

function novaTextura(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function claro(cor) {
  const c = new THREE.Color(cor);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.35;
}

// Texto com tamanho físico na camisa (altura em m), centrado em (u, y); comprime na largura se precisar
function escreverNaCamisa(ctx, texto, { u, y, altura, cor, contorno, larguraMax, fonte }) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const v = camisaBase.v;
  const topo = (1 - v(y + altura / 2)) * H;
  const baixo = (1 - v(y - altura / 2)) * H;
  const alturaPx = baixo - topo;
  // Largura da camisa nesta altura (para a letra não sair esticada na volta do tronco)
  const w = ANEIS_CAMISA.reduce((m, a) => (Math.abs(a[0] - y) < Math.abs(m[0] - y) ? a : m))[1];
  const pxPorMetroX = W / (2 * Math.PI * w);
  const pxPorMetroY = alturaPx / altura;
  ctx.save();
  ctx.font = `${fonte} ${Math.round(alturaPx / 0.72)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let sx = pxPorMetroX / pxPorMetroY;
  const larguraTexto = ctx.measureText(texto).width * sx;
  const maxPx = larguraMax * pxPorMetroX;
  if (larguraTexto > maxPx) sx *= maxPx / larguraTexto;
  ctx.translate(u * W, baixo);
  ctx.scale(sx, 1);
  if (contorno) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, alturaPx * 0.12);
    ctx.strokeStyle = contorno;
    ctx.strokeText(texto, 0, 0);
  }
  ctx.fillStyle = cor;
  ctx.fillText(texto, 0, 0);
  ctx.restore();
}

function texturaCamisa(uni, numero, nome) {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const v = camisaBase.v;
  ctx.fillStyle = uni.camisa;
  ctx.fillRect(0, 0, W, H);
  if (uni.listras) {
    // 16 listras na volta: uma listra escura bem no meio das costas e no meio da frente
    ctx.fillStyle = uni.listras;
    for (let k = 0; k < 8; k++) {
      const x = (384 - 16 + 64 * k) % W;
      ctx.fillRect(x, 0, 32, H);
      if (x + 32 > W) ctx.fillRect(x - W, 0, 32, H);
    }
  }
  // Barra e gola
  const yGola = (1 - v(0.462)) * H;
  ctx.fillStyle = uni.gola;
  ctx.fillRect(0, 0, W, yGola);
  // Gola em V na frente
  ctx.strokeStyle = uni.gola;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(128 - 22, yGola - 2);
  ctx.lineTo(128, (1 - v(0.395)) * H);
  ctx.lineTo(128 + 22, yGola - 2);
  ctx.stroke();
  // Punho da barra (faixa fina embaixo)
  ctx.fillStyle = uni.gola;
  ctx.fillRect(0, (1 - v(-0.045)) * H, W, 3);

  // Número claro ganha contorno escuro (lê bem em cima das listras)
  const contorno = claro(uni.numero) ? 'rgba(10,10,10,0.9)' : null;
  // Escudo genérico no peito esquerdo (lado +x = u > 0,25)
  const yEscudo = (1 - v(0.33)) * H;
  const xEscudo = 128 + 40;
  ctx.fillStyle = uni.gola === uni.camisa ? '#ffffff' : uni.gola;
  ctx.beginPath();
  ctx.moveTo(xEscudo - 9, yEscudo - 11);
  ctx.lineTo(xEscudo + 9, yEscudo - 11);
  ctx.lineTo(xEscudo + 9, yEscudo + 2);
  ctx.lineTo(xEscudo, yEscudo + 12);
  ctx.lineTo(xEscudo - 9, yEscudo + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = claro(ctx.fillStyle) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (numero !== undefined && numero !== null && numero !== '') {
    const n = String(numero);
    // Costas: número grande; frente: pequeno no peito direito
    escreverNaCamisa(ctx, n, {
      u: 0.75, y: 0.2, altura: 0.24, cor: uni.numero, contorno, larguraMax: 0.3, fonte: '900',
    });
    escreverNaCamisa(ctx, n, {
      u: 0.25 - 40 / W, y: 0.33, altura: 0.075, cor: uni.numero, contorno, larguraMax: 0.1, fonte: '900',
    });
  }
  if (nome) {
    escreverNaCamisa(ctx, String(nome).toUpperCase(), {
      u: 0.75, y: 0.37, altura: 0.042, cor: uni.numero, contorno, larguraMax: 0.3, fonte: 'bold',
    });
  }
  return novaTextura(canvas);
}

// Manga: listras (se houver) e punho na ponta
function texturaManga(uni, punho) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = uni.camisa;
  ctx.fillRect(0, 0, 64, 64);
  if (uni.listras) {
    ctx.fillStyle = uni.listras;
    for (let k = 0; k < 2; k++) ctx.fillRect(8 + 32 * k, 0, 16, 64);
  }
  if (punho) {
    ctx.fillStyle = uni.gola;
    ctx.fillRect(0, 50, 64, 14);
  }
  return novaTextura(canvas);
}

function texturaMeiao(uni) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = uni.meiao;
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = uni.faixaMeiao || uni.gola;
  ctx.fillRect(0, 10, 32, 7);
  ctx.fillRect(0, 21, 32, 3);
  return novaTextura(canvas);
}

function matTextura(chave, criar) {
  let m = cacheMat.get(chave);
  if (!m) {
    m = new THREE.MeshLambertMaterial(temDocumento ? { map: criar() } : { color: 0xcccccc });
    cacheMat.set(chave, m);
  }
  return m;
}

// Camisa de cada jogador (número e nome): fica em cache enquanto algum boneco usa
const camisas = new Map();
function pegarCamisa(uni, numero, nome) {
  const chave = JSON.stringify([uni, numero ?? null, nome ?? null]);
  let item = camisas.get(chave);
  if (!item) {
    const material = new THREE.MeshLambertMaterial(
      temDocumento ? { map: texturaCamisa(uni, numero, nome) } : { color: uni.camisa },
    );
    item = { chave, material, usos: 0 };
    camisas.set(chave, item);
  }
  item.usos++;
  return item;
}
function soltarCamisa(item) {
  item.usos--;
  if (item.usos <= 0 && camisas.get(item.chave) === item) {
    if (item.material.map) item.material.map.dispose();
    item.material.dispose();
    camisas.delete(item.chave);
  }
}

// ---------- Personagem ----------

const VISUAL_PADRAO = {
  pele: '#d9a57a', cabelo: { estilo: 'curto', cor: '#2a1d14' }, barba: 'nenhuma', corBarba: null,
  faixa: null, altura: 1.8, porte: 'normal', coxas: 'normais', chuteira: '#111111', goleiro: false,
};
const LARGURA_PORTE = { magro: 0.92, normal: 1, forte: 1.1 };

function pivo(pai, x, y, z, ordem = 'XZY') {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.order = ordem;
  pai.add(o);
  return o;
}

function malha(pai, geometria, material, nome) {
  const m = new THREE.Mesh(geometria, material);
  m.name = nome;
  pai.add(m);
  return m;
}

// Cria um boneco. visual: a aparência (veja js/elenco.js). uniforme: um dos UNIFORMES.
// Devolve { grupo, aplicarPose(pose), altura, alturaQuadril, juntas, pontoNoGrupo, alcancar, dispose() }.
export function criarPersonagem({ visual = {}, uniforme, numero, nome } = {}) {
  const v = { ...VISUAL_PADRAO, ...visual, cabelo: { ...VISUAL_PADRAO.cabelo, ...(visual.cabelo || {}) } };
  const goleiro = !!v.goleiro;
  const uni = uniforme || (goleiro ? UNIFORMES.goleiroLendas : UNIFORMES.lendas);
  const altura = v.altura || 1.8;
  const escala = altura / ALTURA_REF;
  const largura = LARGURA_PORTE[v.porte] ?? 1;
  const coxasGrossas = v.coxas === 'grossas';

  const grupo = new THREE.Group();
  grupo.name = nome ? `jogador ${nome}` : 'jogador';
  // Quem é baixo não fica proporcionalmente fino: a largura acompanha só a raiz da altura
  const corpo = new THREE.Group();
  corpo.scale.set(Math.sqrt(escala), escala, Math.sqrt(escala));
  grupo.add(corpo);

  const pele = matCor(v.pele);
  const camisa = pegarCamisa(uni, numero, nome);
  const chaveUni = JSON.stringify(uni);
  const matManga = matTextura(`manga:${chaveUni}`, () => texturaManga(uni, true));
  const matMangaLisa = matTextura(`mangaLisa:${chaveUni}`, () => texturaManga(uni, false));
  const matMeiao = matTextura(`meiao:${chaveUni}`, () => texturaMeiao(uni));
  const matCalcao = matCor(uni.calcao);
  const matChuteira = matCor(v.chuteira);
  const matLuva = matCor(uni.luvas || '#f2f2f2');

  // --- Esqueleto ---
  const quadril = pivo(corpo, 0, QUADRIL_Y, 0);
  const tronco = pivo(quadril, 0, CINTURA, 0);
  const cabeca = pivo(tronco, 0, PESCOCO, 0, 'YXZ');
  const ombroX = OMBRO_X * (0.5 + 0.5 * largura);
  const juntas = { quadril, tronco, cabeca };

  // --- Tronco e bacia ---
  const mCamisa = malha(tronco, camisaBase.geometria, camisa.material, 'camisa');
  mCamisa.scale.set(largura, 1, 0.5 + 0.5 * largura);
  const mCalcao = malha(quadril, geo('calcao', () => anelado(ANEIS_CALCAO, 12).geometria), matCalcao, 'calcao');
  mCalcao.scale.set(0.6 + 0.4 * largura, 1, 0.6 + 0.4 * largura);

  // --- Braços ---
  const grossuraBraco = 0.55 + 0.45 * largura;
  for (const lado of ['E', 'D']) {
    const s = lado === 'E' ? 1 : -1; // a esquerda do jogador fica em +x
    const ombro = pivo(tronco, s * ombroX, OMBRO_Y, 0);
    const cotovelo = pivo(ombro, 0, -BRACO, 0);
    const manga = malha(ombro, geo(goleiro ? 'mangaLonga' : 'manga', () => torneado(PERFIS[goleiro ? 'mangaLonga' : 'manga'])),
      goleiro ? matMangaLisa : matManga, 'manga');
    manga.scale.set(grossuraBraco, 1, grossuraBraco);
    if (!goleiro) {
      const braco = malha(ombro, geo('braco', () => torneado(PERFIS.braco)), pele, 'braco');
      braco.scale.set(grossuraBraco, 1, grossuraBraco);
    }
    const antebraco = malha(cotovelo,
      geo(goleiro ? 'antebracoManga' : 'antebraco', () => torneado(PERFIS[goleiro ? 'antebracoManga' : 'antebraco'])),
      goleiro ? matManga : pele, 'antebraco');
    antebraco.scale.set(grossuraBraco, 1, grossuraBraco);
    const punho = pivo(cotovelo, 0, -ANTEBRACO, 0);
    malha(punho, goleiro ? geo('luva', geoLuva) : geo('mao', geoMao), goleiro ? matLuva : pele, 'mao');
    if (s < 0) punho.scale.x = -1; // mão direita espelhada (dedão para dentro)
    juntas[`ombro${lado}`] = ombro;
    juntas[`cotovelo${lado}`] = cotovelo;
    juntas[`punho${lado}`] = punho;
  }

  // --- Pernas ---
  for (const lado of ['E', 'D']) {
    const s = lado === 'E' ? 1 : -1;
    const perna = pivo(quadril, s * QUADRIL_X, QUADRIL_JUNTA_Y, 0);
    const joelho = pivo(perna, 0, -COXA, 0);
    const tornozelo = pivo(joelho, 0, -CANELA, 0);
    const kc = coxasGrossas ? 1.24 : 1;
    const calcaoPerna = malha(perna, geo('pernaCalcao', () => torneado(PERFIS.pernaCalcao)), matCalcao, 'pernaCalcao');
    calcaoPerna.scale.set(0.9 + 0.1 * largura + (kc - 1) * 0.55, 1, 0.9 + 0.1 * largura + (kc - 1) * 0.5);
    const coxa = malha(perna, geo('coxa', () => torneado(PERFIS.coxa)), pele, 'coxa');
    coxa.scale.set(kc * (0.9 + 0.1 * largura), 1, kc * 0.95 * (0.9 + 0.1 * largura));
    malha(joelho, geo('canela', () => torneado(PERFIS.canela)), pele, 'canela');
    const meiao = malha(joelho, geo('meiao', () => torneado(PERFIS.meiao)), matMeiao, 'meiao');
    const kp = coxasGrossas ? 1.12 : 1;
    meiao.scale.set(kp, 1, kp);
    malha(tornozelo, geo('bota', geoBota), matChuteira, 'chuteira');
    juntas[`perna${lado}`] = perna;
    juntas[`joelho${lado}`] = joelho;
    juntas[`tornozelo${lado}`] = tornozelo;
  }

  // --- Cabeça, rosto e cabelo ---
  malha(cabeca, geo('cabeca', geoCabeca), pele, 'cabeca');
  malha(cabeca, geo('olhos', geoOlhos), matCor('#1d1511'), 'olhos');
  const corCabelo = v.cabelo.cor || '#2a1d14';
  const corBarba = v.corBarba || corCabelo;
  const corSobrancelha = v.cabelo.estilo === 'careca' ? corMisturada(corBarba, '#1a1410', 0.3)
    : corMisturada(corCabelo, '#1a1410', 0.25);
  malha(cabeca, geo('sobrancelhas', geoSobrancelhas), matCor(corSobrancelha), 'sobrancelhas');
  const estilo = v.cabelo.estilo || 'curto';
  const comFaixa = !!v.faixa && estilo !== 'careca';
  for (const parte of geoCabelo(estilo, comFaixa)) {
    // Raspado: mistura do cabelo com a pele; no moicano a raiz é mais escura (contrasta com a crista)
    const raiz = estilo === 'moicano' ? corMisturada(corCabelo, '#2a1d14', 0.55) : corCabelo;
    const cor = parte.tom === 'raspado' ? corMisturada(raiz, v.pele, 0.42) : corCabelo;
    malha(cabeca, parte.geometria, matCor(cor, true), 'cabelo');
  }
  if (comFaixa) {
    const folga = (FOLGA_CABELO[estilo] ?? 0.012) + 0.004;
    malha(cabeca, geo(`faixa:${folga}`, () => geoFaixa(folga)), matCor(v.faixa, true), 'faixa');
  }
  if (v.barba && v.barba !== 'nenhuma') {
    const g = geoBarba(v.barba);
    const cor = v.barba === 'rala' ? corMisturada(v.pele, corBarba, 0.3) : corBarba;
    if (g) malha(cabeca, g, matCor(cor), 'barba');
  }

  // Altura do quadril de pé, no espaço do grupo
  const alturaQuadril = QUADRIL_Y * escala;

  // --- Pose ---
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const pernas = {
    E: [juntas.pernaE, juntas.joelhoE, juntas.tornozeloE],
    D: [juntas.pernaD, juntas.joelhoD, juntas.tornozeloD],
  };

  function aplicarPose(pose = {}) {
    const tr = pose.tronco || {};
    const ca = pose.cabeca || {};
    const qu = pose.quadril || {};
    quadril.rotation.set(qu.frente || 0, qu.giro || 0, qu.lado || 0);
    tronco.rotation.set(tr.frente || 0, tr.giro || 0, tr.lado || 0);
    cabeca.rotation.set(ca.frente || 0, ca.giro || 0, 0);

    for (const lado of ['E', 'D']) {
      const s = lado === 'E' ? 1 : -1;
      const b = pose[`braco${lado}`] || {};
      juntas[`ombro${lado}`].rotation.set(-(b.frente || 0), 0, s * (b.lado ?? 0.1));
      juntas[`cotovelo${lado}`].rotation.set(-(b.cotovelo || 0), 0, 0);
      juntas[`ombro${lado}`].scale.set(1, 1, 1);
    }

    // Agachar: dobra quadril e joelho de cada perna para o quadril descer 'queda' (lei dos cossenos)
    const queda = limitar(pose.agachar || 0, 0, 1.2) * QUEDA_AGACHAR;
    const D = COXA + CANELA - queda;
    const cosJ = limitar((D * D - COXA * COXA - CANELA * CANELA) / (2 * COXA * CANELA), -1, 1);
    const cosQ = limitar((COXA * COXA + D * D - CANELA * CANELA) / (2 * COXA * D), -1, 1);
    const extraJoelho = Math.acos(cosJ);
    const extraQuadril = Math.acos(cosQ);
    for (const lado of ['E', 'D']) {
      const s = lado === 'E' ? 1 : -1;
      const p = pose[`perna${lado}`] || {};
      const frente = (p.frente || 0) + extraQuadril;
      const joelho = (p.joelho || 0) + extraJoelho;
      const [perna, jo, to] = pernas[lado];
      perna.rotation.set(-frente, 0, s * (p.lado || 0));
      jo.rotation.set(joelho, 0, 0);
      to.rotation.set(frente - joelho - (qu.frente || 0) + (p.tornozelo || 0), 0, 0);
    }

    // Apoio: acha o ponto mais baixo das solas e põe no chão
    quadril.position.y = QUADRIL_Y;
    const apoio = limitar(pose.apoio ?? 1, 0, 1);
    let ajuste = 0;
    if (apoio > 0) {
      let menor = Infinity;
      quadril.updateMatrix();
      for (const lado of ['E', 'D']) {
        const [perna, jo, to] = pernas[lado];
        perna.updateMatrix();
        jo.updateMatrix();
        to.updateMatrix();
        m4.multiplyMatrices(quadril.matrix, perna.matrix).multiply(jo.matrix).multiply(to.matrix);
        for (const s of SOLA) menor = Math.min(menor, v3.set(s[0], s[1], s[2]).applyMatrix4(m4).y);
      }
      ajuste = -menor * apoio;
    }
    quadril.position.y = QUADRIL_Y + ajuste + (pose.pulo || 0);

    // Mãos com alvo (maoE / maoD: { x, y, z, peso }, no espaço do tronco)
    for (const lado of ['E', 'D']) {
      const m = pose[`mao${lado}`];
      if (m && m.peso > 0.001) alcancarNoTronco(lado, v3.set(m.x || 0, m.y || 0, m.z || 0), Math.min(1, m.peso));
    }
  }

  // Posição de um ponto preso numa junta (no espaço da junta), no espaço do grupo
  function pontoNoGrupo(junta, x = 0, y = 0, z = 0) {
    corpo.updateMatrix();
    m4.copy(corpo.matrix);
    const cadeia = [];
    for (let o = junta; o && o !== corpo; o = o.parent) cadeia.unshift(o);
    for (const o of cadeia) {
      o.updateMatrix();
      m4.multiply(o.matrix);
    }
    return new THREE.Vector3(x, y, z).applyMatrix4(m4);
  }

  // Leva a mão até um ponto (cinemática inversa de dois ossos: ombro e cotovelo), por cima da pose atual.
  // alvo no espaço do tronco; peso: 0 = pose, 1 = mão no alvo. Estica o braço até 15% se o alvo estiver longe.
  const vetor = new THREE.Vector3();
  const dirCotovelo = new THREE.Vector3();
  const dirAntebraco = new THREE.Vector3();
  const polo = new THREE.Vector3();
  const eixoX = new THREE.Vector3();
  const eixoZ = new THREE.Vector3();
  const base = new THREE.Matrix4();
  const qAlvo = new THREE.Quaternion();
  function alcancarNoTronco(lado, alvo, peso = 1) {
    const s = lado === 'E' ? 1 : -1;
    const ombro = juntas[`ombro${lado}`];
    const cotovelo = juntas[`cotovelo${lado}`];
    const a = BRACO;
    const b = ANTEBRACO + MAO_CENTRO;
    vetor.copy(alvo).sub(ombro.position);
    let dist = vetor.length();
    const estica = limitar(dist / (a + b), 1, 1.15);
    dist = limitar(dist / estica, Math.abs(a - b) + 0.02, (a + b) * 0.999);
    const d = vetor.normalize();
    // Cotovelo para fora e um pouco para baixo (polo), no plano que passa pelo ombro e pelo alvo
    polo.set(s, -0.55, -0.15).normalize();
    polo.addScaledVector(d, -polo.dot(d));
    if (polo.lengthSq() < 1e-6) polo.set(0, 0, -1).addScaledVector(d, -d.z);
    polo.normalize();
    const cosA = limitar((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    dirCotovelo.copy(d).multiplyScalar(cosA).addScaledVector(polo, sinA);
    dirAntebraco.copy(d).multiplyScalar(dist).addScaledVector(dirCotovelo, -a).normalize();
    const dobra = Math.acos(limitar(dirCotovelo.dot(dirAntebraco), -1, 1));
    // Base do ombro: −y local vai para o cotovelo; +z local é para onde o antebraço dobra
    eixoZ.copy(dirAntebraco).addScaledVector(dirCotovelo, -dirAntebraco.dot(dirCotovelo));
    if (eixoZ.lengthSq() < 1e-8) eixoZ.set(0, 0, 1).addScaledVector(dirCotovelo, -dirCotovelo.z);
    eixoZ.normalize();
    const eixoY = dirCotovelo.negate();
    eixoX.crossVectors(eixoY, eixoZ);
    base.makeBasis(eixoX, eixoY, eixoZ);
    qAlvo.setFromRotationMatrix(base);
    ombro.quaternion.slerp(qAlvo, peso);
    cotovelo.rotation.x = misturar(cotovelo.rotation.x, -dobra, peso);
    ombro.scale.y = misturar(1, estica, peso);
  }
  // O mesmo, com o alvo no mundo (ex.: as mãos do goleiro de js/goleiro.js)
  function alcancar(lado, alvoMundo, peso = 1) {
    grupo.updateWorldMatrix(true, true);
    alcancarNoTronco(lado, tronco.worldToLocal(new THREE.Vector3(alvoMundo.x, alvoMundo.y, alvoMundo.z)), peso);
  }

  aplicarPose(posePadrao(0));

  return {
    grupo,
    aplicarPose,
    altura,
    alturaQuadril,
    juntas,
    pontoNoGrupo,
    alcancar,
    visual: v,
    uniforme: uni,
    dispose() {
      if (grupo.parent) grupo.parent.remove(grupo);
      soltarCamisa(camisa);
    },
  };
}

// ---------- Poses ----------

const CHAVES_POSE = {
  tronco: ['frente', 'lado', 'giro'],
  cabeca: ['frente', 'giro'],
  bracoE: ['frente', 'lado', 'cotovelo'],
  bracoD: ['frente', 'lado', 'cotovelo'],
  pernaE: ['frente', 'lado', 'joelho', 'tornozelo'],
  pernaD: ['frente', 'lado', 'joelho', 'tornozelo'],
  quadril: ['frente', 'lado', 'giro'],
  maoE: ['x', 'y', 'z', 'peso'],
  maoD: ['x', 'y', 'z', 'peso'],
};
const SOLTOS = ['agachar', 'apoio', 'pulo'];
const PADRAO_SOLTOS = { agachar: 0, apoio: 1, pulo: 0 };
const PADRAO_BRACO_LADO = 0.1;

function valor(pose, grupo, chave) {
  const g = pose && pose[grupo];
  const v = g && g[chave];
  if (typeof v === 'number') return v;
  return (grupo === 'bracoE' || grupo === 'bracoD') && chave === 'lado' ? PADRAO_BRACO_LADO : 0;
}

// Mistura duas poses: k = 0 → a, k = 1 → b
export function misturarPoses(a, b, k) {
  const r = {};
  for (const [grupo, chaves] of Object.entries(CHAVES_POSE)) {
    const ga = a && a[grupo];
    const gb = b && b[grupo];
    if (!ga && !gb) continue;
    r[grupo] = {};
    for (const c of chaves) {
      // Alvo da mão que só existe numa das poses: o lugar fica fixo, só o peso muda
      const soPeso = (grupo === 'maoE' || grupo === 'maoD') && c !== 'peso' && !(ga && gb);
      r[grupo][c] = soPeso ? valor(ga ? a : b, grupo, c) : misturar(valor(a, grupo, c), valor(b, grupo, c), k);
    }
  }
  for (const c of SOLTOS) {
    const va = a && typeof a[c] === 'number' ? a[c] : PADRAO_SOLTOS[c];
    const vb = b && typeof b[c] === 'number' ? b[c] : PADRAO_SOLTOS[c];
    r[c] = misturar(va, vb, k);
  }
  return r;
}

// Espelha a pose (troca esquerda e direita): o chute de canhoto é o de destro no espelho
function espelhar(p) {
  const r = { ...p };
  r.bracoE = p.bracoD;
  r.bracoD = p.bracoE;
  r.pernaE = p.pernaD;
  r.pernaD = p.pernaE;
  if (p.tronco) r.tronco = { ...p.tronco, lado: -(p.tronco.lado || 0), giro: -(p.tronco.giro || 0) };
  if (p.cabeca) r.cabeca = { ...p.cabeca, giro: -(p.cabeca.giro || 0) };
  if (p.quadril) r.quadril = { ...p.quadril, lado: -(p.quadril.lado || 0), giro: -(p.quadril.giro || 0) };
  return r;
}

// Curva suave passando por todas as poses-chave [[tempo, pose], ...] (Catmull-Rom)
function porChaves(chaves, t) {
  const n = chaves.length;
  if (t <= chaves[0][0]) return chaves[0][1];
  if (t >= chaves[n - 1][0]) return chaves[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > chaves[i + 1][0]) i++;
  const [t1, p1] = chaves[i];
  const [t2, p2] = chaves[i + 1];
  const p0 = i > 0 ? chaves[i - 1][1] : p1;
  const p3 = i + 2 < n ? chaves[i + 2][1] : p2;
  const u = (t - t1) / (t2 - t1);
  const u2 = u * u;
  const u3 = u2 * u;
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  const r = {};
  for (const [grupo, cs] of Object.entries(CHAVES_POSE)) {
    r[grupo] = {};
    for (const c of cs) r[grupo][c] = cr(valor(p0, grupo, c), valor(p1, grupo, c), valor(p2, grupo, c), valor(p3, grupo, c));
  }
  for (const c of SOLTOS) {
    const ler = (p) => (typeof p[c] === 'number' ? p[c] : PADRAO_SOLTOS[c]);
    r[c] = cr(ler(p0), ler(p1), ler(p2), ler(p3));
  }
  r.agachar = Math.max(0, r.agachar);
  r.apoio = limitar(r.apoio, 0, 1);
  return r;
}

// De pé, parado: respira e troca o peso de perna de leve. t em segundos.
export function posePadrao(t = 0) {
  const respira = Math.sin(t * 1.7);
  const peso = Math.sin(t * 0.55);
  return {
    tronco: { frente: 0.03 + 0.012 * respira, lado: 0.025 * peso, giro: 0.03 * Math.sin(t * 0.37) },
    cabeca: { frente: 0.02, giro: 0.12 * Math.sin(t * 0.31) },
    bracoE: { frente: 0.06, lado: 0.13 + 0.015 * respira, cotovelo: 0.22 },
    bracoD: { frente: 0.06, lado: 0.13 + 0.015 * respira, cotovelo: 0.22 },
    pernaE: { frente: 0.02, lado: 0.06 + 0.02 * peso, joelho: 0.04 },
    pernaD: { frente: -0.02, lado: 0.06 - 0.02 * peso, joelho: 0.04 },
    quadril: { lado: -0.03 * peso },
    agachar: 0.03,
  };
}

// Cobrador parado atrás da bola, concentrado, esperando para correr. pe: 'D' ou 'E' (perna do chute).
export function poseCobradorPronto(t = 0, pe = 'D') {
  const respira = Math.sin(t * 1.9);
  const p = {
    tronco: { frente: 0.1 + 0.012 * respira, lado: 0.02, giro: 0 },
    cabeca: { frente: -0.06, giro: 0.05 * Math.sin(t * 0.4) },
    bracoE: { frente: 0.1, lado: 0.2, cotovelo: 0.35 },
    bracoD: { frente: 0.0, lado: 0.2, cotovelo: 0.3 },
    pernaE: { frente: 0.12, lado: 0.07, joelho: 0.1 },
    pernaD: { frente: -0.18, lado: 0.06, joelho: 0.12, tornozelo: 0.15 },
    agachar: 0.06 + 0.01 * respira,
  };
  return pe === 'E' ? espelhar(p) : p;
}

// Corrida. fase de 0 a 1 = um ciclo (dois passos). Em fase 0,25 a perna direita está toda à frente;
// em 0,75, toda atrás (é dali que sai o chute de destro).
export function poseCorrida(fase = 0) {
  const a = 2 * Math.PI * fase;
  const perna = (f) => ({
    frente: 0.6 * Math.sin(f),
    lado: 0.035,
    joelho: 0.22 + 1.2 * Math.max(0, Math.cos(f + 0.35)) ** 1.5,
    tornozelo: 0.35 * Math.max(0, -Math.sin(f)),
  });
  return {
    tronco: { frente: 0.2, lado: 0, giro: -0.14 * Math.sin(a) },
    cabeca: { frente: -0.12, giro: 0.06 * Math.sin(a) },
    bracoE: { frente: 0.55 * Math.sin(a), lado: 0.2, cotovelo: 1.35 + 0.2 * Math.cos(a) },
    bracoD: { frente: -0.55 * Math.sin(a), lado: 0.2, cotovelo: 1.35 - 0.2 * Math.cos(a) },
    pernaD: perna(a),
    pernaE: perna(a + Math.PI),
    quadril: { giro: 0.08 * Math.sin(a) },
    pulo: 0.04 * Math.max(0, Math.sin(2 * a - 0.5)),
  };
}

// Chute (de destro; o de canhoto é o espelho). progresso de 0 a 1:
//   0 a 0,3   último passo, o pé de apoio (esquerdo) chega ao lado da bola
//   0,3 a 0,5 perna do chute vai para trás (preparação)
//   0,55      contato com a bola (TEMPO_CONTATO)
//   0,55 a 1  terminação: a perna sobe à frente e o corpo cai sobre ela
export const TEMPO_CONTATO = 0.55;
export const TEMPO_APOIO = 0.3; // o pé de apoio pisa no chão e não sai mais do lugar até o fim
const CHAVES_CHUTE = [
  [0, poseCorrida(0.75)],
  [TEMPO_APOIO, {
    tronco: { frente: 0.12, lado: -0.08, giro: 0.08 },
    cabeca: { frente: 0.3 },
    bracoE: { frente: 0.2, lado: 0.65, cotovelo: 0.7 },
    bracoD: { frente: 0.0, lado: 0.3, cotovelo: 0.75 },
    pernaE: { frente: 0.32, lado: 0.04, joelho: 0.18, tornozelo: -0.05 },
    pernaD: { frente: -0.3, lado: 0.04, joelho: 1.15, tornozelo: 0.5 },
    quadril: { giro: -0.08 },
    agachar: 0.05,
  }],
  [0.5, {
    tronco: { frente: 0.02, lado: -0.2, giro: 0.12 },
    cabeca: { frente: 0.42, giro: -0.04 },
    bracoE: { frente: 0.3, lado: 1.25, cotovelo: 0.45 },
    bracoD: { frente: 0.15, lado: 0.32, cotovelo: 0.8 },
    pernaE: { frente: 0.28, lado: 0.05, joelho: 0.3 },
    pernaD: { frente: -0.5, lado: 0.02, joelho: 1.9, tornozelo: 0.7 },
    quadril: { giro: -0.2, lado: -0.04 },
    agachar: 0.05,
  }],
  [TEMPO_CONTATO, {
    tronco: { frente: -0.06, lado: -0.24, giro: 0.02 },
    cabeca: { frente: 0.45 },
    bracoE: { frente: 0.15, lado: 1.35, cotovelo: 0.3 },
    bracoD: { frente: 0.2, lado: 0.36, cotovelo: 0.75 },
    pernaE: { frente: 0.25, lado: 0.05, joelho: 0.22 },
    pernaD: { frente: 0.55, lado: -0.02, joelho: 0.9, tornozelo: 0.95 },
    quadril: { giro: 0.05 },
    agachar: 0.04,
  }],
  [0.75, {
    tronco: { frente: -0.18, lado: -0.14, giro: -0.12 },
    cabeca: { frente: 0.2 },
    bracoE: { frente: -0.05, lado: 1.1, cotovelo: 0.4 },
    bracoD: { frente: -0.1, lado: 0.42, cotovelo: 0.6 },
    pernaE: { frente: -0.04, lado: 0.04, joelho: 0.3, tornozelo: 0.45 },
    pernaD: { frente: 1.25, lado: -0.12, joelho: 0.3, tornozelo: 0.8 },
    quadril: { giro: 0.28 },
    agachar: 0.02,
  }],
  [1, {
    tronco: { frente: 0.08, lado: -0.02, giro: -0.05 },
    cabeca: { frente: -0.12 },
    bracoE: { frente: 0.1, lado: 0.55, cotovelo: 0.6 },
    bracoD: { frente: 0.15, lado: 0.3, cotovelo: 0.7 },
    pernaE: { frente: -0.32, lado: 0.04, joelho: 0.55, tornozelo: 0.4 },
    pernaD: { frente: 0.32, lado: 0.0, joelho: 0.3 },
    quadril: { giro: 0.12 },
    agachar: 0.05,
  }],
];
export function poseChute(progresso = 0, pe = 'D') {
  const p = porChaves(CHAVES_CHUTE, limitar(progresso, 0, 1));
  return pe === 'E' ? espelhar(p) : p;
}

// Jogador da barreira: mãos protegendo, de frente para a bola. progressoPulo: 0 = no chão,
// de 0 a 1 = no ar (como em js/barreira.js); t: relógio (para balançar de leve).
export function poseBarreira(progressoPulo = 0, t = 0) {
  const ar = progressoPulo > 0 && progressoPulo < 1 ? Math.sin(Math.PI * progressoPulo) : 0;
  const balanco = Math.sin(t * 2.1);
  return {
    tronco: { frente: 0.05 + 0.08 * ar + 0.01 * balanco, lado: 0.015 * Math.sin(t * 0.8), giro: 0 },
    cabeca: { frente: 0.12 - 0.15 * ar, giro: 0.03 * Math.sin(t * 0.5) },
    bracoE: { frente: 0.42, lado: -0.2, cotovelo: 0.55 + 0.04 * balanco },
    bracoD: { frente: 0.42, lado: -0.2, cotovelo: 0.55 + 0.04 * balanco },
    pernaE: { frente: 0.04 + 0.3 * ar, lado: 0.02, joelho: 0.05 + 0.8 * ar, tornozelo: 0.5 * ar },
    pernaD: { frente: 0.04 + 0.3 * ar, lado: 0.02, joelho: 0.05 + 0.8 * ar, tornozelo: 0.5 * ar },
    agachar: 0.04 + 0.01 * balanco,
    apoio: 1 - suave(ar * 4),
  };
}

// Goleiro na espera: meio agachado, pernas abertas, mãos à frente, quicando na ponta dos pés
export function poseGoleiroPronto(t = 0) {
  const quica = Math.sin(t * 6.5);
  const peso = Math.sin(t * 1.7);
  return {
    tronco: { frente: 0.32, lado: 0.03 * peso, giro: 0 },
    cabeca: { frente: -0.28, giro: 0 },
    bracoE: { frente: 0.75, lado: 0.32, cotovelo: 0.85 },
    bracoD: { frente: 0.75, lado: 0.32, cotovelo: 0.85 },
    maoE: { x: 0.25, y: 0.2, z: 0.33, peso: 1 },
    maoD: { x: -0.25, y: 0.2, z: 0.33, peso: 1 },
    pernaE: { frente: 0.05, lado: 0.2 + 0.02 * peso, joelho: 0, tornozelo: 0.12 },
    pernaD: { frente: 0.05, lado: 0.2 - 0.02 * peso, joelho: 0, tornozelo: 0.12 },
    agachar: 0.42 + 0.04 * quica,
  };
}

// Mergulho do goleiro. progresso: 0 a 1; lado: −1, 0 ou +1 (+1 = para +x local, a esquerda do goleiro,
// que é a direita de quem cobra); alto: 0 = rasteiro, 1 = no alto.
// A pose só mexe braços, pernas e tronco; quem chama tomba (rola) e leva o grupo inteiro.
export function poseGoleiroMergulho(progresso = 0, lado = 0, alto = 0.5) {
  const k = suave(progresso * 1.6);
  const s = Math.sign(lado);
  let alvo;
  if (s !== 0) {
    // Braços esticados acima da cabeça, puxados para o lado do mergulho (o corpo tomba junto)
    const perto = s > 0 ? 'E' : 'D';
    const longe = s > 0 ? 'D' : 'E';
    alvo = {
      tronco: { frente: 0.05, lado: -0.22 * s, giro: 0.1 * s },
      cabeca: { frente: -0.1, giro: 0.25 * s },
      [`braco${perto}`]: { frente: 0.25, lado: 2.75 - 0.25 * (1 - alto), cotovelo: 0.1 },
      [`braco${longe}`]: { frente: 0.35, lado: 3.3 - 0.2 * (1 - alto), cotovelo: 0.25 },
      [`perna${perto}`]: { frente: 0.45, lado: 0.12, joelho: 0.85, tornozelo: 0.3 },
      [`perna${longe}`]: { frente: -0.05, lado: 0.35, joelho: 0.15, tornozelo: 0.5 },
      agachar: 0,
      apoio: 0,
    };
  } else if (alto > 0.5) {
    // Pulo no meio: braços para cima, joelhos dobrados
    alvo = {
      tronco: { frente: 0.05 }, cabeca: { frente: -0.25 },
      bracoE: { frente: 2.6, lado: 0.25, cotovelo: 0.15 },
      bracoD: { frente: 2.6, lado: 0.25, cotovelo: 0.15 },
      pernaE: { frente: 0.35, lado: 0.12, joelho: 0.7, tornozelo: 0.4 },
      pernaD: { frente: 0.1, lado: 0.12, joelho: 0.5, tornozelo: 0.4 },
      apoio: 0,
    };
  } else {
    // Bola baixa no meio: agacha e põe as mãos na frente
    alvo = {
      tronco: { frente: 0.45 }, cabeca: { frente: 0.1 },
      bracoE: { frente: 0.75, lado: 0.12, cotovelo: 0.2 },
      bracoD: { frente: 0.75, lado: 0.12, cotovelo: 0.2 },
      pernaE: { lado: 0.18, tornozelo: 0.1 }, pernaD: { lado: 0.18, tornozelo: 0.1 },
      agachar: 0.75,
    };
  }
  return misturarPoses(poseGoleiroPronto(0), alvo, k);
}

// Comemoração de gol: pula com os braços para cima e o punho fechado. t em segundos desde o gol.
export function poseComemoracao(t = 0) {
  const pulo = Math.abs(Math.sin(t * 4.2));
  const vibra = Math.sin(t * 8.4);
  const entra = suave(t * 3);
  return misturarPoses(posePadrao(t), {
    tronco: { frente: -0.18 - 0.05 * pulo, lado: 0.04 * vibra },
    cabeca: { frente: -0.4 },
    bracoE: { frente: 0.5, lado: 2.55 + 0.1 * vibra, cotovelo: 0.5 + 0.25 * pulo },
    bracoD: { frente: 0.5, lado: 2.55 - 0.1 * vibra, cotovelo: 0.5 + 0.25 * pulo },
    pernaE: { frente: 0.15 * pulo, lado: 0.08, joelho: 0.2 + 0.5 * pulo, tornozelo: 0.4 * pulo },
    pernaD: { frente: 0.05 * pulo, lado: 0.08, joelho: 0.15 + 0.3 * pulo, tornozelo: 0.4 * pulo },
    pulo: 0.22 * pulo,
    agachar: 0.1 * (1 - pulo),
  }, entra);
}

// Lamento (bola fora ou defendida): mãos na cabeça, olhando para baixo, balançando a cabeça
export function poseLamento(t = 0) {
  const entra = suave(t * 3);
  const balanca = Math.sin(t * 2.4);
  return misturarPoses(posePadrao(t), {
    tronco: { frente: 0.1, lado: 0.02 * Math.sin(t * 0.9) },
    cabeca: { frente: 0.18, giro: 0.2 * balanca },
    bracoE: { frente: 1.2, lado: 1.0, cotovelo: 2.2 },
    bracoD: { frente: 1.2, lado: 1.0, cotovelo: 2.2 },
    maoE: { x: 0.07, y: 0.8, z: 0.02 + 0.01 * balanca, peso: 1 },
    maoD: { x: -0.07, y: 0.8, z: 0.02 - 0.01 * balanca, peso: 1 },
    pernaE: { lado: 0.07, frente: 0.04 },
    pernaD: { lado: 0.07, frente: -0.06 },
    agachar: 0.04,
  }, entra);
}

// Quantos recursos estão em cache (para conferir que dispose() não deixa sobras)
export function estatisticasCache() {
  return { geometrias: cacheGeo.size, materiais: cacheMat.size, camisas: camisas.size };
}

// ---------- Sombra ----------
let geoSombra = null;
let matSombra = null;
// Sombra redonda e macia no chão (uma malha só, barata). raio em m. Ponha em y ≈ 0,01, embaixo do boneco.
export function criarSombraBlob(raio = 0.42) {
  if (!matSombra) {
    geoSombra = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    let mapa = null;
    if (temDocumento) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      mapa = new THREE.CanvasTexture(canvas);
    }
    matSombra = new THREE.MeshBasicMaterial({
      map: mapa, color: 0x000000, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    if (mapa) matSombra.color.set(0xffffff);
  }
  const m = new THREE.Mesh(geoSombra, matSombra);
  m.scale.set(2 * raio, 1, 2 * raio);
  m.position.y = 0.012;
  m.renderOrder = 1;
  m.name = 'sombra';
  return m;
}

// ---------- Ajudantes para a cena ----------

// Aparências genéricas para os adversários (barreira): variadas, mas sem lembrar ninguém
const ROSTOS_ADVERSARIOS = [
  { pele: '#e6b892', cabelo: { estilo: 'curto', cor: '#2b1d14' }, barba: 'nenhuma', chuteira: '#111111' },
  { pele: '#86522f', cabelo: { estilo: 'raspado', cor: '#151010' }, barba: 'rala', corBarba: '#151010', chuteira: '#f5f5f5' },
  { pele: '#f1cfb0', cabelo: { estilo: 'curto', cor: '#b8894e' }, barba: 'nenhuma', chuteira: '#1e5bd8' },
  { pele: '#c68e62', cabelo: { estilo: 'medio', cor: '#1c1410' }, barba: 'cavanhaque', corBarba: '#1c1410', chuteira: '#111111' },
  { pele: '#6b4026', cabelo: { estilo: 'careca', cor: '#111111' }, barba: 'cheia', corBarba: '#151010', chuteira: '#e8e8e8' },
  { pele: '#efc6a2', cabelo: { estilo: 'topete', cor: '#6b4a2b' }, barba: 'rala', corBarba: '#5a3c22', chuteira: '#111111' },
  { pele: '#d9a57a', cabelo: { estilo: 'cacheado', cor: '#24170f' }, barba: 'nenhuma', chuteira: '#ff6a00' },
  { pele: '#f3d2b5', cabelo: { estilo: 'raspado', cor: '#a8643a' }, barba: 'rala', corBarba: '#a8643a', chuteira: '#111111' },
];
export function visualAdversario(indice = 0, altura = 1.84) {
  const r = ROSTOS_ADVERSARIOS[((indice % ROSTOS_ADVERSARIOS.length) + ROSTOS_ADVERSARIOS.length) % ROSTOS_ADVERSARIOS.length];
  return { ...r, cabelo: { ...r.cabelo }, faixa: null, altura, porte: indice % 3 === 1 ? 'forte' : 'normal', coxas: 'normais' };
}
export const VISUAL_GOLEIRO_ADVERSARIO = {
  pele: '#e2b48a', cabelo: { estilo: 'raspado', cor: '#2a1d14' }, barba: 'rala', corBarba: '#2a1d14',
  faixa: null, altura: 1.9, porte: 'forte', coxas: 'normais', chuteira: '#111111', goleiro: true,
};

// Barreira (js/barreira.js): põe o boneco no lugar do jogador j e aplica a pose. indice varia o balanço.
export function posicionarBarreira(personagem, j, t = 0, indice = 0) {
  personagem.grupo.position.set(j.x, j.yPes || 0, j.z);
  personagem.grupo.rotation.set(0, j.rotacaoY || 0, 0);
  personagem.aplicarPose(poseBarreira(j.progressoPulo || 0, t + indice * 1.37));
}

// Goleiro (js/goleiro.js): põe o boneco na pose g.pose (quadril, giro, rolagem, mãos).
// De pé, os pés ficam no chão; no mergulho, o quadril do boneco vai para o quadril do goleiro.
// As mãos vão até g.maos (as mesmas da colisão), se maos = true.
export function posicionarGoleiro(personagem, gp, t = 0, { maos = true } = {}) {
  const progresso = gp.progressoMergulho || 0;
  const mergulhando = gp.estado === 'mergulhando' || gp.estado === 'caido' || progresso > 0;
  const noAr = mergulhando ? suave(Math.max(progresso * 2.5, Math.abs(gp.rolagem || 0) / 0.5)) : 0;

  // Passos para o lado: a fase dos passos anda com o deslocamento (um passo a cada ~0,45 m)
  const estado = personagem._goleiro || (personagem._goleiro = { x: gp.centro ? gp.centro.x : gp.x, t, fase: 0, vel: 0 });
  const xAgora = gp.centro ? gp.centro.x : gp.x;
  const dt = t - estado.t;
  if (dt > 1e-4 && dt < 0.5) {
    const v = (xAgora - estado.x) / dt;
    estado.vel += (v - estado.vel) * Math.min(1, dt * 12);
    estado.fase += Math.abs(xAgora - estado.x) / 0.45;
  } else if (dt < 0 || dt >= 0.5) {
    estado.vel = 0;
  }
  estado.x = xAgora;
  estado.t = t;

  let pose = poseGoleiroPronto(t);
  const andando = mergulhando ? 0 : limitar(Math.abs(estado.vel) / 1.2, 0, 1);
  if (andando > 0.02) {
    // A perna do lado para onde ele vai abre; a outra fecha (sem cruzar)
    const onda = Math.sin(estado.fase * Math.PI * 2);
    const lidera = estado.vel > 0 ? 'E' : 'D';
    const segue = lidera === 'E' ? 'D' : 'E';
    const passo = {
      [`perna${lidera}`]: { lado: 0.2 + 0.14 * onda, joelho: 0.12 * Math.max(0, onda), tornozelo: 0.12 },
      [`perna${segue}`]: { lado: 0.2 - 0.1 * onda, joelho: 0.12 * Math.max(0, -onda), tornozelo: 0.12 },
    };
    pose = misturarPoses(pose, { ...pose, ...passo }, andando);
  }
  if (mergulhando) {
    pose = poseGoleiroMergulho(Math.max(progresso, gp.bracos || 0), gp.lado || 0, gp.alto ?? 0.5);
  }
  pose.apoio = 1 - noAr;
  personagem.aplicarPose(pose);
  const g = personagem.grupo;
  g.rotation.set(0, gp.rotacaoY || 0, -(gp.rolagem || 0));
  // Onde o quadril do boneco fica, já girado; de pé os pés ficam no chão, no ar o quadril vai junto
  const q = personagem.pontoNoGrupo(personagem.juntas.quadril).applyEuler(g.rotation);
  g.position.set(gp.x - q.x, misturar(0, gp.y - q.y, noAr), gp.z - q.z);
  if (maos && gp.maos) {
    personagem.alcancar('D', gp.maos.direita, 1);
    personagem.alcancar('E', gp.maos.esquerda, 1);
  }
}

// ---------- Cobrança: corrida, chute e o pé na bola ----------

export const PADRAO_COBRANCA = {
  distancia: 2.0,  // m da posição inicial até onde o pé de apoio pisa
  angulo: 30,      // graus entre a corrida e a direção do chute (destro vem pela esquerda da bola)
  corrida: 0.4,    // s correndo antes do último passo
  chute: 0.75,     // s do último passo até o fim da terminação (contato em 0,55 disso)
  cadencia: 1.6,   // ciclos de corrida por segundo (cada ciclo = dois passos)
};

// Onde fica o peito do pé e o pé de apoio (no espaço do grupo) num momento do chute
function pesDoChute(personagem, progresso, pe) {
  personagem.aplicarPose(poseChute(progresso, pe));
  const outro = pe === 'D' ? 'E' : 'D';
  const j = personagem.juntas;
  return {
    chute: personagem.pontoNoGrupo(j[`tornozelo${pe}`], ...PEITO_DO_PE),
    apoio: personagem.pontoNoGrupo(j[`tornozelo${outro}`], 0, -0.07, 0.06),
  };
}

// Onde fica o centro da bola (no espaço do grupo, de frente para +z) no instante do contato
export function bolaNoContato(personagem, pe = 'D', raioBola = 0.11) {
  const { chute } = pesDoChute(personagem, TEMPO_CONTATO, pe);
  return new THREE.Vector3(chute.x, raioBola, chute.z + raioBola + 0.02);
}

// Monta a animação da cobrança. bola: {x, z}; alvo: {x, z} para onde o corpo fica virado no chute
// (padrão: meio do gol); pe: 'D' ou 'E'; cfg: o CONFIG do jogo (lê cfg.cobrador, se existir). Devolve:
//   inicio: { x, z, rotacaoY }  onde o cobrador espera (parado(t) já o põe lá)
//   tempoContato: s do começo da corrida até o pé tocar a bola (lance a bola nessa hora)
//   duracao: s até o fim da terminação
//   parado(t): pose de espera atrás da bola (t = relógio, para respirar)
//   atualizar(t): t = s desde o começo da corrida; põe o grupo e a pose. Devolve
//                 { etapa: 'parado' | 'corrida' | 'chute' | 'fim', progresso, contato } (contato: já passou do toque)
//   direcao: vetor {x, y, z} para onde o corpo fica virado no chute
export function criarCobranca(personagem, { bola, alvo = { x: 0, z: 0 }, pe = 'D', cfg = {} } = {}) {
  const c = { ...PADRAO_COBRANCA, ...(cfg.cobrador || {}) };
  const g = personagem.grupo;
  const lado = pe === 'D' ? 1 : -1; // destro vem pela esquerda (+x local)
  const yawChute = Math.atan2(alvo.x - bola.x, alvo.z - bola.z);
  const frente = new THREE.Vector3(Math.sin(yawChute), 0, Math.cos(yawChute));
  const girar = (p, yaw) => new THREE.Vector3(
    p.x * Math.cos(yaw) + p.z * Math.sin(yaw), p.y, -p.x * Math.sin(yaw) + p.z * Math.cos(yaw));

  // Pé de apoio: onde precisa pisar para o peito do pé chegar na bola no contato
  const noContato = pesDoChute(personagem, TEMPO_CONTATO, pe);
  const raioBola = cfg.raioBola ?? 0.11;
  const bolaLocal = new THREE.Vector3(noContato.chute.x, 0, noContato.chute.z + raioBola + 0.02);
  const apoioMundo = new THREE.Vector3(bola.x, 0, bola.z).add(girar(noContato.apoio.clone().sub(bolaLocal), yawChute));
  apoioMundo.y = 0;
  const apoioNoPiso = pesDoChute(personagem, TEMPO_APOIO, pe).apoio;
  const grupoNoApoio = apoioMundo.clone().sub(girar(apoioNoPiso, yawChute));
  grupoNoApoio.y = 0;

  // Corrida em linha reta, chegando de trás e do lado do pé de apoio
  const yawCorrida = yawChute - lado * c.angulo * GRAUS;
  const dirCorrida = new THREE.Vector3(Math.sin(yawCorrida), 0, Math.cos(yawCorrida));
  const inicio = grupoNoApoio.clone().addScaledVector(dirCorrida, -c.distancia);
  const tApoio = c.corrida + TEMPO_APOIO * c.chute;
  const tempoContato = c.corrida + TEMPO_CONTATO * c.chute;
  const duracao = c.corrida + c.chute;
  // A fase da corrida termina com a perna do chute toda atrás (encaixa no começo do chute)
  const faseFinal = pe === 'D' ? 0.75 : 0.25;
  const fase0 = faseFinal - c.cadencia * c.corrida;
  // Distância andada até o pé de apoio pisar: acelera no primeiro quarto e depois vai reto
  const ARRANQUE = 0.25;
  const andado = (t) => {
    const u = limitar(t / tApoio, 0, 1);
    const h = u < ARRANQUE ? (u * u) / (2 * ARRANQUE) : u - ARRANQUE / 2;
    return (c.distancia * h) / (1 - ARRANQUE / 2);
  };
  const noCaminho = (t) => inicio.clone().addScaledVector(dirCorrida, andado(t));

  function parado(t = 0) {
    g.position.set(inicio.x, 0, inicio.z);
    g.rotation.set(0, yawCorrida, 0);
    personagem.aplicarPose(poseCobradorPronto(t, pe));
  }

  function atualizar(t) {
    if (t < 0) {
      parado(-t);
      return { etapa: 'parado', progresso: 0, contato: false };
    }
    if (t < c.corrida) {
      // Corrida: sai da pose de espera nos primeiros passos
      const pose = misturarPoses(poseCobradorPronto(0, pe), poseCorrida(fase0 + c.cadencia * t), suave(t / 0.15));
      personagem.aplicarPose(pose);
      const pos = noCaminho(t);
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yawCorrida, 0);
      return { etapa: 'corrida', progresso: 0, contato: false };
    }
    const p = limitar((t - c.corrida) / c.chute, 0, 1);
    personagem.aplicarPose(poseChute(p, pe));
    if (p < TEMPO_APOIO) {
      // Último passo: continua na linha da corrida e vira o corpo para a direção do chute
      const yaw = yawCorrida + (yawChute - yawCorrida) * suave(p / TEMPO_APOIO);
      const pos = noCaminho(t);
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yaw, 0);
    } else {
      // Pé de apoio preso no chão: o corpo gira por cima dele (sem escorregar)
      const outro = pe === 'D' ? 'E' : 'D';
      const apoio = personagem.pontoNoGrupo(personagem.juntas[`tornozelo${outro}`], 0, -0.07, 0.06);
      const pos = apoioMundo.clone().sub(girar(apoio, yawChute));
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yawChute, 0);
    }
    return { etapa: p >= 1 ? 'fim' : 'chute', progresso: p, contato: p >= TEMPO_CONTATO };
  }

  parado(0);
  return {
    inicio: { x: inicio.x, z: inicio.z, rotacaoY: yawCorrida },
    tempoContato,
    duracao,
    direcao: frente,
    parado,
    atualizar,
  };
}
