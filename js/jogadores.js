// Bonecos 3D dos jogadores: feitos por código (sem arquivos de modelo), leves para o celular.
// Cada lenda é reconhecida pelo cabelo, barba, tom de pele, altura, porte, cor da chuteira e número.
// O corpo tem juntas (tronco, cabeça, ombros, cotovelos, quadris, joelhos e tornozelos) movidas por poses.
// Cada parte é uma peça lisa (normais suaves) com sombreado leve pintado nos vértices (dobras, axilas,
// virilha), e o rosto é uma textura pintada (olhos, sobrancelhas, boca, barba rala, raiz do cabelo).
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
// Potência que mantém o sinal (para os anéis "quadrados" e a sola reta)
const pot = (c, e) => Math.sign(c) * Math.abs(c) ** e;
// Número pseudoaleatório fixo para cada entrada (0 a 1): variação de tom sem mudar a cada boneco
const sorteioFixo = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- Uniformes ----------
// Formato do js/elenco.js: camisa, calcao, meiao, numero (cor do número e do nome), gola (gola, punhos e
// detalhes), padrao e cores (cores do padrão sobre a camisa):
//   'liso' | 'listras' (verticais, cores[0]) | 'aros' (horizontais) | 'faixa' (faixa no peito, até 3 cores) |
//   'diagonal' (faixa do ombro direito ao quadril esquerdo) | 'v' (V no peito e nas costas)
// Formato antigo (UNIFORMES, ainda aceito): listras (cor das listras verticais ou null) no lugar de padrao.
// Extras: faixaMeiao (listra do meião), luvas (goleiros).

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
  // Goleiro das lendas (Mito e Chila quando batem a falta): grafite com detalhes laranja
  goleiroLendas: {
    camisa: '#5c636d', listras: null, calcao: '#2f343b', meiao: '#5c636d',
    numero: '#ff8a2a', gola: '#ff8a2a', faixaMeiao: '#ff8a2a', luvas: '#ff7a1a',
  },
};

// ---------- Cores ----------

function rgb(cor) {
  const c = new THREE.Color(cor);
  return [c.r, c.g, c.b]; // linear (o THREE converte do hexadecimal sRGB)
}
// Componentes sRGB de 0 a 255 (para pintar no canvas)
function rgb255(cor) {
  const h = new THREE.Color(cor).getHex();
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
function corMisturada(a, b, k) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}
function luminancia(cor) {
  const [r, g, b] = rgb(cor);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Contraste entre duas cores (1 = nenhum; 21 = preto no branco)
function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function claro(cor) {
  return luminancia(cor) > 0.18;
}
function distanciaCor(a, b) {
  const x = rgb255(a);
  const y = rgb255(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Uniforme no formato único usado aqui (aceita o do elenco e o antigo)
function normalizarUniforme(u = {}) {
  const camisa = u.camisa || '#dddddd';
  let cores = Array.isArray(u.cores) ? u.cores.filter(Boolean) : [];
  let padrao = u.padrao || (u.listras ? 'listras' : 'liso');
  if (padrao === 'listras' && u.listras) cores = [u.listras, ...cores.slice(1)];
  if (padrao !== 'liso' && !cores.length) padrao = 'liso';
  if (!['liso', 'listras', 'aros', 'faixa', 'diagonal', 'v'].includes(padrao)) padrao = 'liso';
  const calcao = u.calcao || camisa;
  const meiao = u.meiao || calcao;
  const numero = u.numero || (claro(camisa) ? '#111111' : '#ffffff');
  const gola = u.gola || numero;
  // Listra do meião: a primeira cor do uniforme que aparece sobre o meião
  const faixaMeiao = u.faixaMeiao
    || [gola, camisa, ...cores, numero].find((c) => distanciaCor(c, meiao) > 70)
    || (claro(meiao) ? '#222222' : '#eeeeee');
  return { camisa, calcao, meiao, numero, gola, padrao, cores: cores.slice(0, 3), faixaMeiao, luvas: u.luvas || null };
}

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

// ---------- Cache (geometrias, texturas e materiais compartilhados entre todos os bonecos) ----------

const cacheGeo = new Map();
const cacheMat = new Map();
const cacheTex = new Map();
function geo(chave, criar) {
  let g = cacheGeo.get(chave);
  if (!g) {
    g = criar();
    cacheGeo.set(chave, g);
  }
  return g;
}
const temDocumento = typeof document !== 'undefined';
function textura(chave, criar) {
  if (!temDocumento) return null;
  let t = cacheTex.get(chave);
  if (!t) {
    t = criar();
    cacheTex.set(chave, t);
  }
  return t;
}

// Material com sombreado nos vértices. brilho > 0 = reflexo (couro da chuteira, cabelo); mapa = textura.
function matCor(cor, { duplo = false, brilho = 0, mapa = null, chaveMapa = '' } = {}) {
  const c = new THREE.Color(cor);
  const chave = `cor:${c.getHexString()}:${duplo ? 2 : 1}:${brilho}:${mapa ? chaveMapa : ''}`;
  let m = cacheMat.get(chave);
  if (!m) {
    const base = { color: c, vertexColors: true, side: duplo ? THREE.DoubleSide : THREE.FrontSide };
    if (mapa) base.map = mapa;
    m = brilho > 0
      ? new THREE.MeshPhongMaterial({ ...base, shininess: brilho, specular: new THREE.Color(0x2b2b2b) })
      : new THREE.MeshLambertMaterial(base);
    cacheMat.set(chave, m);
  }
  return m;
}

function novaTextura(canvas, repetir = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function novoCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

// ---------- Geometria: ajudantes ----------

const matriz = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

// Sombreado nos vértices: f(x, y, z, i) devolve um número (cinza) ou [r, g, b]; sem f, tudo 1
function comCor(g, f) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = f ? f(p.getX(i), p.getY(i), p.getZ(i), i) : 1;
    if (typeof v === 'number') c.set([v, v, v], i * 3);
    else c.set(v, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Todos os vértices com a mesma coordenada de textura (peças lisas que usam a textura do rosto)
function uvFixo(g, u, v) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) a.set([u, v], i * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}

// Normais suaves também nas costuras e nos polos: vértices no mesmo lugar ficam com a mesma normal
function suavizarCostura(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const grupos = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 2e4)},${Math.round(p.getY(i) * 2e4)},${Math.round(p.getZ(i) * 2e4)}`;
    let l = grupos.get(k);
    if (!l) grupos.set(k, (l = []));
    l.push(i);
  }
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (const l of grupos.values()) {
    if (l.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of l) v.add(w.fromBufferAttribute(n, i));
    if (v.lengthSq() < 1e-12) continue;
    v.normalize();
    for (const i of l) n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Garante que as faces apontem para fora (volume com sinal positivo em volta do centro)
function orientar(g, centro = null) {
  const p = g.attributes.position;
  const idx = g.index;
  const o = new THREE.Vector3();
  if (centro) o.copy(centro);
  else {
    for (let i = 0; i < p.count; i++) o.x += p.getX(i), o.y += p.getY(i), o.z += p.getZ(i);
    o.divideScalar(Math.max(1, p.count));
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  const n = idx ? idx.count : p.count;
  for (let k = 0; k < n; k += 3) {
    const [i, j, l] = idx ? [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)] : [k, k + 1, k + 2];
    a.fromBufferAttribute(p, i).sub(o);
    b.fromBufferAttribute(p, j).sub(o);
    c.fromBufferAttribute(p, l).sub(o);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0 && idx) {
    const arr = idx.array;
    for (let k = 0; k < arr.length; k += 3) {
      const t = arr[k + 1];
      arr[k + 1] = arr[k + 2];
      arr[k + 2] = t;
    }
    idx.needsUpdate = true;
  }
  return g;
}

function finalizar(g, centro = null) {
  orientar(g, centro);
  g.computeVertexNormals();
  suavizarCostura(g);
  if (!g.attributes.color) comCor(g);
  if (!g.attributes.uv) uvFixo(g, 0, 0);
  g.computeBoundingSphere();
  return g;
}

// Junta várias geometrias numa só malha (mesmo material = uma malha só: menos trabalho para o celular).
// partes: [geometria] ou [[geometria, matriz]]. Mantém normais, cores e coordenadas de textura.
function fundir(partes) {
  const prontas = partes.filter(Boolean).map((p) => {
    const [g, m] = Array.isArray(p) ? p : [p, null];
    const n = g.clone();
    if (m) n.applyMatrix4(m);
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.color) comCor(n);
    if (!n.attributes.uv) uvFixo(n, 0, 0);
    g.dispose();
    return n;
  });
  let total = 0;
  let totalIdx = 0;
  for (const n of prontas) {
    total += n.attributes.position.count;
    totalIdx += n.index ? n.index.count : n.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const cor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx = new (total > 65535 ? Uint32Array : Uint16Array)(totalIdx);
  let o = 0;
  let oi = 0;
  for (const n of prontas) {
    const c = n.attributes.position.count;
    pos.set(n.attributes.position.array, o * 3);
    nor.set(n.attributes.normal.array, o * 3);
    cor.set(n.attributes.color.array, o * 3);
    uv.set(n.attributes.uv.array, o * 2);
    if (n.index) for (let k = 0; k < n.index.count; k++) idx[oi++] = n.index.getX(k) + o;
    else for (let k = 0; k < c; k++) idx[oi++] = o + k;
    o += c;
    n.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------- Peças em anéis (tronco, calção, braços, pernas, meião) ----------
// Anel: [y, meia largura (x), frente (+z), trás (−z), q, dx, dz]. q = 2 é elipse; mais que 2, mais
// "quadrado" (tronco). A lista vai de baixo para cima ao longo da superfície (pode voltar para dentro
// nas beiradas da barra e da gola). A textura dá a volta: u = 0 no lado direito do jogador (−x),
// 0,25 na frente, 0,5 no lado esquerdo, 0,75 nas costas; v cresce com o comprimento da superfície.

function lerAnel(a) {
  return { y: a[0], l: a[1], f: a[2], t: a[3] ?? a[2], q: a[4] ?? 2, dx: a[5] ?? 0, dz: a[6] ?? 0 };
}
function anelMisturado(a, b, k) {
  const r = {};
  for (const c of ['y', 'l', 'f', 't', 'q', 'dx', 'dz']) r[c] = misturar(a[c], b[c], k);
  return r;
}

// seg + 1 pontos [x, z] espalhados por igual no comprimento de cada quarto do anel
function pontosAnel(an, seg) {
  const pts = [];
  if (an.l < 1e-6 && an.f < 1e-6 && an.t < 1e-6) {
    for (let i = 0; i <= seg; i++) pts.push([an.dx, an.dz]);
    return pts;
  }
  const e = 2 / an.q;
  const quarto = seg / 4;
  const N = 24;
  for (let k = 0; k < 4; k++) {
    const dens = [];
    const acum = [0];
    for (let m = 0; m <= N; m++) {
      const phi = -Math.PI / 2 + (k + m / N) * (Math.PI / 2);
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      dens.push([an.dx + an.l * pot(s, e), an.dz + (c >= 0 ? an.f : an.t) * pot(c, e)]);
      if (m > 0) acum.push(acum[m - 1] + Math.hypot(dens[m][0] - dens[m - 1][0], dens[m][1] - dens[m - 1][1]));
    }
    const total = acum[N] || 1;
    for (let i = 0; i < quarto; i++) {
      const alvo = (i / quarto) * total;
      let m = 1;
      while (m < N && acum[m] < alvo) m++;
      const f = (alvo - acum[m - 1]) / ((acum[m] - acum[m - 1]) || 1);
      pts.push([misturar(dens[m - 1][0], dens[m][0], f), misturar(dens[m - 1][1], dens[m][1], f)]);
    }
  }
  pts.push(pts[0].slice());
  return pts;
}

// Peça em anéis (seg: múltiplo de 4). opcoes: deformar(x, y, z, u, j) → [x, y, z] (relevos),
// cor(x, y, z, u, j) → sombreado
function tubo(lista, seg, { deformar = null, cor = null } = {}) {
  if (seg % 4) throw new Error(`tubo: seg = ${seg} precisa ser múltiplo de 4`);
  const aneis = lista.map(lerAnel);
  const n = aneis.length;
  const comp = [0];
  for (let j = 1; j < n; j++) {
    const a = aneis[j - 1];
    const b = aneis[j];
    comp.push(comp[j - 1] + Math.hypot(b.y - a.y, (b.l + b.f + b.t - a.l - a.f - a.t) / 3));
  }
  const total = comp[n - 1] || 1;
  const pos = [];
  const uv = [];
  const cores = [];
  const idx = [];
  for (let j = 0; j < n; j++) {
    const pts = pontosAnel(aneis[j], seg);
    for (let i = 0; i <= seg; i++) {
      let x = pts[i][0];
      let y = aneis[j].y;
      let z = pts[i][1];
      const u = i / seg;
      if (deformar) {
        const r = deformar(x, y, z, u, j);
        if (r) [x, y, z] = r;
      }
      pos.push(x, y, z);
      uv.push(u, comp[j] / total);
      const c = cor ? cor(x, y, z, u, j) : 1;
      if (typeof c === 'number') cores.push(c, c, c);
      else cores.push(c[0], c[1], c[2]);
    }
  }
  const linha = seg + 1;
  const polo = (an) => an.l < 1e-6 && an.f < 1e-6 && an.t < 1e-6;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * linha + i;
      const b = a + 1;
      const d = a + linha;
      const c = d + 1;
      if (!polo(aneis[j])) idx.push(a, b, d);
      if (!polo(aneis[j + 1])) idx.push(c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  suavizarCostura(g);
  g.computeBoundingSphere();

  // Para as texturas: o anel em cada v e o v de cada altura (no trecho que sobe)
  const anelNoV = (v) => {
    const alvo = limitar(v, 0, 1) * total;
    for (let j = 1; j < n; j++) {
      if (alvo <= comp[j] || j === n - 1) {
        const k = limitar((alvo - comp[j - 1]) / ((comp[j] - comp[j - 1]) || 1), 0, 1);
        return anelMisturado(aneis[j - 1], aneis[j], k);
      }
    }
    return aneis[n - 1];
  };
  const vDeY = (y) => {
    let melhor = 0;
    for (let j = 1; j < n; j++) {
      const a = aneis[j - 1].y;
      const b = aneis[j].y;
      if (b > a && y >= a && y <= b) return (comp[j - 1] + (comp[j] - comp[j - 1]) * ((y - a) / (b - a))) / total;
      if (b > a && y > b) melhor = comp[j] / total;
    }
    return melhor;
  };
  const perimetro = (y) => {
    const v = vDeY(y);
    const pts = pontosAnel(anelNoV(v), 64);
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  };
  return { geometria: g, anelNoV, vDeY, perimetro, total };
}

// Gaussiana suave (para sombreados e relevos)
const sino = (d, s) => Math.exp(-(d * d) / (s * s));

// ---------- Tronco (camisa) e bacia (calção) ----------
// Tronco em V: ombros e peito largos, cintura mais fina; a barra fica solta por cima do calção.
const ANEIS_CAMISA = [
  [-0.084, 0.166, 0.112, 0.122, 2.3],   // beirada de dentro da barra
  [-0.100, 0.181, 0.126, 0.136, 2.3],   // barra (solta, um pouco aberta)
  [-0.040, 0.170, 0.120, 0.124, 2.3],
  [0.030, 0.157, 0.114, 0.114, 2.4],    // cintura
  [0.150, 0.163, 0.121, 0.108, 2.5],
  [0.270, 0.180, 0.131, 0.112, 2.7],    // peito
  [0.345, 0.189, 0.125, 0.113, 2.6],    // altura das axilas
  [0.395, 0.181, 0.111, 0.106, 2.4],    // ombros
  [0.432, 0.152, 0.093, 0.092, 2.2],
  [0.458, 0.126, 0.080, 0.086, 2.1],    // trapézio
  [0.475, 0.088, 0.070, 0.077, 2.0, 0, -0.004],
  [0.486, 0.077, 0.067, 0.074, 2.0, 0, -0.006],    // gola
  [0.474, 0.064, 0.055, 0.062, 2.0, 0, -0.006],    // beirada da gola, para dentro
];
const camisaBase = tubo(ANEIS_CAMISA, 16, {
  deformar: (x, y, z, u) => [x, y + 0.028 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (u - 0.25))) * suave((y - 0.41) / 0.06), z],
  cor: (x, y, z, u, j) => {
    if (j === 0 || j >= ANEIS_CAMISA.length - 2) return 0.55; // por dentro da barra e da gola
    const lado = Math.abs(x) / 0.19;
    const axila = sino(y - 0.3, 0.09) * Math.max(0, lado - 0.6) * 0.7;
    const barra = 0.1 * sino(y + 0.1, 0.05);
    const dobra = 0.05 * sino(y - 0.05, 0.07) * Math.max(0, lado - 0.4);
    return 1 - axila - barra - dobra;
  },
});

const ANEIS_CALCAO = [
  [-0.140, 0, 0, 0],
  [-0.138, 0.060, 0.070, 0.060],
  [-0.126, 0.112, 0.096, 0.096, 2.4],   // entre as pernas (a virilha é estreita)
  [-0.085, 0.148, 0.100, 0.108, 2.6],
  [-0.045, 0.156, 0.106, 0.112, 2.6],   // quadris (os lados ficam por conta das pernas do calção)
  [-0.005, 0.148, 0.104, 0.108, 2.3],   // daqui para cima fica por dentro da camisa
  [0.110, 0.136, 0.097, 0.098, 2.2],
  [0.130, 0, 0, 0],
];
function geoCalcao() {
  return tubo(ANEIS_CALCAO, 12, {
    // Divisão entre os glúteos e dobra da virilha
    cor: (x, y, z) => 1 - 0.06 * sino(y - 0.03, 0.05),
  }).geometria;
}

// Perna do calção (presa na coxa): mais larga que a coxa, com barra
const ANEIS_PERNA_CALCAO = [
  [-0.222, 0.083, 0.085, 0.083],  // beirada de dentro da barra
  [-0.235, 0.097, 0.099, 0.097],  // barra
  [-0.130, 0.099, 0.102, 0.097],
  [-0.055, 0.096, 0.101, 0.094],
  [-0.005, 0.071, 0.084, 0.080],  // em cima afina para dentro da barra da camisa
  [0.030, 0.044, 0.058, 0.064],
  [0.048, 0, 0, 0],
].map((a) => [...a, 2, 0.004]); // um pouco para fora (lado de fora em +x; a perna direita é espelhada)
function geoPernaCalcao() {
  return tubo(ANEIS_PERNA_CALCAO, 12, {
    cor: (x, y, z, u, j) => (j === 0 ? 0.5 : 1 - 0.1 * Math.max(0, -x / 0.09) * suave((0.05 - y) / 0.2) - 0.08 * sino(y + 0.235, 0.025)),
  }).geometria;
}

// ---------- Braços ----------

const ANEIS_MANGA = [
  [-0.138, 0.049, 0.050, 0.050],  // beirada de dentro
  [-0.146, 0.060, 0.061, 0.061],  // barra
  [-0.060, 0.063, 0.063, 0.063],
  [0.015, 0.064, 0.062, 0.062],
  [0.050, 0.051, 0.049, 0.049],
  [0.074, 0, 0, 0],
].map((a) => [...a, 2, 0.004]); // ombro (deltoide) um pouco para fora
const ANEIS_MANGA_LONGA = [
  [-0.322, 0, 0, 0],
  [-0.314, 0.030, 0.030, 0.033],
  [-0.292, 0.046, 0.047, 0.051],
  [-0.180, 0.055, 0.058, 0.058],
  [-0.060, 0.061, 0.062, 0.062],
  [0.015, 0.064, 0.062, 0.062],
  [0.050, 0.051, 0.049, 0.049],
  [0.074, 0, 0, 0],
].map((a) => [...a, 2, 0.004]);
const ANEIS_BRACO = [
  [-0.318, 0, 0, 0],
  [-0.309, 0.022, 0.020, 0.025],
  [-0.290, 0.034, 0.032, 0.038],   // cotovelo
  [-0.230, 0.042, 0.044, 0.045],
  [-0.150, 0.048, 0.053, 0.052],   // bíceps e tríceps
  [-0.050, 0.050, 0.051, 0.052],
];
const ANEIS_ANTEBRACO = [
  [-0.262, 0, 0, 0],
  [-0.256, 0.014, 0.018, 0.016],
  [-0.238, 0.021, 0.027, 0.025],   // punho: mais largo de frente para trás
  [-0.160, 0.031, 0.032, 0.031],
  [-0.070, 0.041, 0.041, 0.039],   // músculos do antebraço
  [0.020, 0.033, 0.030, 0.036],
  [0.038, 0, 0, 0],
];
const ANEIS_ANTEBRACO_MANGA = [
  [-0.235, 0.031, 0.035, 0.035],   // beirada de dentro do punho
  [-0.243, 0.037, 0.041, 0.041],   // punho
  [-0.150, 0.041, 0.045, 0.045],
  [-0.040, 0.049, 0.049, 0.049],
  [0.020, 0.045, 0.045, 0.047],
  [0.042, 0, 0, 0],
];
// Lado de dentro do braço (−x no braço esquerdo; o direito é espelhado) um pouco mais escuro
const corBraco = (x, y, z, u, j, n) => (j === 0 || j === n - 1 ? 0.92 : 1 - 0.1 * Math.max(0, -x / 0.05));

// Mão: palma e dedos (um pouco dobrados para a palma, que fica para −x) e o dedão na frente
function geoMao(luva = false) {
  const k = luva ? 1.32 : 1;
  const palma = tubo([
    [-0.176, 0, 0, 0],
    [-0.165, 0.010, 0.026, 0.024, 2.5],
    [-0.108, 0.013, 0.039, 0.034, 3],   // juntas dos dedos
    [-0.060, 0.017, 0.040, 0.034, 3],   // palma
    [-0.008, 0.015, 0.028, 0.026, 2.5],  // punho
    [0.012, 0, 0, 0],
  ].map((a) => [a[0] * (luva ? 1.08 : 1), a[1] * k, a[2] * k, a[3] * k, a[4]]), 8, {
    deformar: (x, y, z) => {
      const d = Math.max(0, -0.1 - y); // dedos dobrando para a palma
      return [x - d * 0.55 - d * d * 4, y + d * 0.12, z];
    },
    cor: (x) => (x < 0 ? 0.88 : 1),
  }).geometria;
  const dedao = tubo([
    [-0.062, 0, 0, 0],
    [-0.052, 0.010, 0.011, 0.011],
    [-0.02, 0.012, 0.013, 0.013],
    [0.01, 0, 0, 0],
  ].map((a) => [a[0], a[1] * k, a[2] * k, a[3] * k]), 4).geometria;
  const partes = [palma, [dedao, matriz(-0.007 * k, -0.035, 0.03 * k, -0.42, 0, -0.25)]];
  if (luva) {
    partes.push(tubo([
      [-0.02, 0.036, 0.04, 0.04],
      [0.025, 0.036, 0.04, 0.04],
      [0.03, 0.03, 0.034, 0.034],
    ], 8).geometria);
  }
  return finalizar(fundir(partes));
}

// ---------- Pernas e pés ----------

const ANEIS_COXA = [
  [-0.492, 0, 0, 0],
  [-0.484, 0.030, 0.031, 0.030],
  [-0.466, 0.047, 0.050, 0.047],    // ponta redonda: cobre a junta do joelho
  [-0.425, 0.054, 0.059, 0.052],    // joelho (patela na frente)
  [-0.350, 0.065, 0.071, 0.060],
  [-0.250, 0.078, 0.085, 0.070],    // quadríceps
  [-0.150, 0.080, 0.084, 0.076],    // daqui para cima fica dentro do calção
  [-0.100, 0, 0, 0],
];
const ANEIS_JOELHO = [
  [-0.100, 0.051, 0.048, 0.063],
  [-0.030, 0.046, 0.049, 0.050],
  [0.010, 0.040, 0.044, 0.040],
  [0.030, 0, 0, 0],
];
const ANEIS_MEIAO = [
  [-0.448, 0, 0, 0],
  [-0.428, 0.032, 0.040, 0.038],    // dentro da chuteira
  [-0.385, 0.032, 0.034, 0.034],    // tornozelo
  [-0.300, 0.043, 0.046, 0.050],
  [-0.200, 0.055, 0.057, 0.071],    // panturrilha
  [-0.120, 0.059, 0.059, 0.074],    // caneleira por baixo
  [-0.077, 0.060, 0.058, 0.067],    // dobra de cima
  [-0.061, 0.055, 0.053, 0.061],
  [-0.066, 0.049, 0.047, 0.057],    // beirada para dentro
];
const meiaoBase = tubo(ANEIS_MEIAO, 8, {
  cor: (x, y, z, u, j) => (j === ANEIS_MEIAO.length - 1 ? 0.55 : 1 - 0.1 * Math.max(0, -x / 0.06) - 0.08 * sino(y + 0.39, 0.05)),
});

// Chuteira: estações ao longo do pé [z, meia largura, topo, sola], de trás (calcanhar) para o bico
const ESTACOES_CHUTEIRA = [
  [-0.073, 0.000, -0.024, -0.060],
  [-0.064, 0.026, 0.006, -0.069],
  [-0.035, 0.037, 0.015, -0.070],   // calcanhar (contraforte)
  [0.000, 0.039, 0.004, -0.070],    // boca da chuteira
  [0.040, 0.043, -0.013, -0.070],   // peito do pé (cadarço)
  [0.090, 0.047, -0.031, -0.070],   // parte larga
  [0.145, 0.044, -0.039, -0.0695],
  [0.178, 0.036, -0.043, -0.067],   // bico
  [0.196, 0.016, -0.051, -0.064],
  [0.201, 0.000, -0.056, -0.062],
];
function geoChuteira() {
  const seg = 8;
  const pos = [];
  const uv = [];
  const cores = [];
  const idx = [];
  const n = ESTACOES_CHUTEIRA.length;
  ESTACOES_CHUTEIRA.forEach(([z, w, topo, sola], k) => {
    const yc = (topo + sola) / 2;
    const h = (topo - sola) / 2;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2; // 0 = em cima (cadarço), π = sola
      const s = Math.sin(th);
      const c = Math.cos(th);
      const e = c < 0 ? 2 / 6 : 2 / 2.4; // sola bem reta, peito do pé arredondado
      let x = w * pot(s, 2 / 2.6);
      let y = yc + h * pot(c, e);
      // Arco do pé (lado de dentro, −x): a sola sobe um pouco no meio
      if (x < 0 && c < -0.3) y += 0.004 * sino(z - 0.03, 0.04) * Math.min(1, -x / Math.max(w, 1e-6));
      pos.push(x, y, z);
      uv.push(i / seg, k / (n - 1));
      cores.push(...(c < -0.75 ? [0.8, 0.8, 0.8] : [1, 1, 1]));
    }
  });
  const linha = seg + 1;
  for (let k = 0; k < n - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = k * linha + i;
      idx.push(a, a + linha, a + 1, a + 1, a + linha, a + linha + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  g.setIndex(idx);
  return finalizar(g);
}

// ---------- Cabeça ----------
// mand: largura da mandíbula (0 = rosto fino, 1 = queixo largo)

// Ponto da superfície da cabeça na direção (x, y, z) da esfera unitária, afastado 'folga' m da pele.
function pontoCabeca(x, y, z, folga = 0, escala = 1, mand = 0.5) {
  const baixo = Math.max(0, -y);
  const tras = Math.max(0, -z);
  const g = (a, b, c, s) => Math.exp(-((x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2) / (s * s));
  // Relevos: maçãs do rosto, arco das sobrancelhas, olhos fundos, boca e nuca
  const rel = 0.005 * (g(0.62, -0.2, 0.74, 0.28) + g(-0.62, -0.2, 0.74, 0.28))
    + 0.006 * g(0, 0.2, 0.97, 0.32)
    - 0.0045 * (g(0.38, 0.09, 0.92, 0.15) + g(-0.38, 0.09, 0.92, 0.15))
    + 0.004 * g(0, -0.45, 0.88, 0.3)
    + 0.007 * g(0, 0.15, -0.95, 0.42);
  // Mandíbula mais estreita que o crânio; queixo para a frente; a nuca entra em direção ao pescoço
  const kx = 1 - (0.33 - 0.12 * mand) * baixo * baixo;
  const kz = 1 - 0.1 * baixo * baixo - 0.2 * baixo * tras;
  const queixo = z > 0 ? (0.014 + 0.004 * mand) * baixo * z : 0;
  // Topo do crânio mais cheio (redondo, sem "ponta")
  const cima = Math.max(0, y);
  const domo = 1 + 0.28 * cima * (1 - cima);
  return new THREE.Vector3(
    x * (CRANIO.rx * escala * kx * domo + folga + rel),
    CRANIO.y + y * (CRANIO.ry * escala + folga + rel) - (z > 0 ? 0.018 * baixo * baixo * z : 0),
    CRANIO.z + z * (CRANIO.rz * escala * kz * (1 + 0.12 * cima * (1 - cima)) + folga + rel) + queixo,
  );
}
// Direção na cabeça pelo ângulo em volta (az, graus; + para a esquerda do jogador) e a partir do alto (pol)
const dirAzPol = (az, pol) => new THREE.Vector3(
  Math.sin(az * GRAUS) * Math.sin(pol * GRAUS), Math.cos(pol * GRAUS), Math.cos(az * GRAUS) * Math.sin(pol * GRAUS));

// Pedaço de pele com textura do rosto em um ponto liso (orelhas, nariz, pescoço)
const UV_PELE = [0.5, 0.012];

// Anéis da cabeça (graus a partir do alto): mais juntos no rosto (olhos, boca, queixo)
const ANEIS_CABECA = [0, 24, 46, 66, 80, 91, 101, 109, 116, 123, 133, 150, 180];

// Crânio, rosto, pescoço, nariz e orelhas numa malha só. A barba (cheia, bigode, cavanhaque) é volume
// da própria cabeça: a pele sobe onde ela cobre, e a cor vem da pintura do rosto (sem beirada serrilhada).
function geoCabeca(mand, barba = null) {
  const esp = ESPESSURA_BARBA[barba] || 0;
  return geo(`cabeca:${mand}:${esp ? barba : ''}`, () => {
    const seg = 16;
    const pos = [];
    const uv = [];
    const idx = [];
    ANEIS_CABECA.forEach((pol, j) => {
      const th = pol * GRAUS;
      for (let i = 0; i <= seg; i++) {
        const phi = (i / seg) * Math.PI * 2;
        const x = -Math.cos(phi) * Math.sin(th);
        const y = Math.cos(th);
        const z = Math.sin(phi) * Math.sin(th);
        const f = esp ? esp * coberturaBarba(barba, Math.atan2(x, z) / GRAUS, pol) ** 1.3 : 0;
        const q = pontoCabeca(x, y, z, f, 1, mand);
        pos.push(q.x, q.y, q.z);
        uv.push(i / seg, 1 - pol / 180);
      }
    });
    const linha = seg + 1;
    for (let j = 0; j < ANEIS_CABECA.length - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * linha + i + 1;
        const b = j * linha + i;
        const c = (j + 1) * linha + i;
        const d = (j + 1) * linha + i + 1;
        if (j > 0) idx.push(a, b, d);
        if (j < ANEIS_CABECA.length - 2) idx.push(b, c, d);
      }
    }
    const cranio = new THREE.BufferGeometry();
    cranio.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cranio.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    cranio.setIndex(idx);
    // Sombra embaixo do queixo e da mandíbula
    comCor(cranio, (x, y) => 1 - 0.22 * suave((CRANIO.y - 0.1 - y) / 0.02));
    orientar(cranio, new THREE.Vector3(0, CRANIO.y, CRANIO.z));

    const pescoco = uvFixo(tubo([
      [-0.06, 0.082, 0.070, 0.078, 2, 0, -0.008],
      [0.0, 0.068, 0.064, 0.067, 2, 0, -0.006],
      [0.06, 0.06, 0.058, 0.060, 2, 0, -0.003],
      [0.13, 0.053, 0.05, 0.056, 2, 0, -0.006],
    ], 8, { cor: (x, y, z) => 0.82 + 0.18 * suave((0.0 - y) / 0.06) - 0.1 * Math.max(0, z / 0.06) * suave((y - 0.06) / 0.05) }).geometria, ...UV_PELE);

    // Nariz: cunha com ponta, asas e base
    const sobre = (az, pol, f) => pontoCabeca(...dirAzPol(az, pol).toArray(), f, 1, mand);
    const P = [
      sobre(0, 84, 0.001),       // 0 raiz, entre os olhos
      sobre(-6.5, 91, -0.001),   // 1 lado direito da ponte
      sobre(6.5, 91, -0.001),    // 2 lado esquerdo da ponte
      sobre(0, 101.5, 0.019),    // 3 ponta
      sobre(-10, 104.5, 0.002),  // 4 asa direita
      sobre(10, 104.5, 0.002),   // 5 asa esquerda
      sobre(0, 107, 0.005),      // 6 base (entre as narinas)
      sobre(-5, 106, 0.0095),    // 7 narina direita
      sobre(5, 106, 0.0095),     // 8 narina esquerda
    ];
    const nariz = new THREE.BufferGeometry();
    nariz.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((v) => v.toArray()), 3));
    nariz.setIndex([0, 1, 3, 0, 3, 2, 1, 4, 3, 2, 3, 5, 4, 7, 3, 5, 3, 8, 7, 6, 3, 8, 3, 6, 4, 6, 7, 5, 8, 6]);
    // Cada triângulo virado para fora da cabeça
    const ix = nariz.index.array;
    const cc = new THREE.Vector3(0, CRANIO.y, CRANIO.z);
    for (let k = 0; k < ix.length; k += 3) {
      const a = P[ix[k]];
      const b = P[ix[k + 1]];
      const c = P[ix[k + 2]];
      const nrm = b.clone().sub(a).cross(c.clone().sub(a));
      if (nrm.dot(a.clone().add(b).add(c).divideScalar(3).sub(cc)) < 0) {
        const t = ix[k + 1];
        ix[k + 1] = ix[k + 2];
        ix[k + 2] = t;
      }
    }
    nariz.computeVertexNormals();
    comCor(nariz, (x, y) => (y < P[6].y + 0.004 ? 0.78 : 1));
    uvFixo(nariz, ...UV_PELE);

    // Orelhas: achatadas, inclinadas para trás, com a concha mais escura
    const orelhas = [];
    for (const s of [-1, 1]) {
      const o = new THREE.SphereGeometry(1, 6, 4);
      comCor(o, (x, y) => 1 - 0.25 * Math.max(0, s * x) * (1 - Math.abs(y)));
      uvFixo(o, ...UV_PELE);
      orelhas.push([o, matriz(s * (CRANIO.rx + 0.001), CRANIO.y - 0.014, -0.012, 0, s * -0.32, -0.14 * s, 0.009, 0.027, 0.018)]);
    }
    cranio.computeVertexNormals();
    suavizarCostura(cranio);
    return fundir([cranio, pescoco, nariz, ...orelhas]);
  });
}

// ---------- Cabelos ----------
// A linha do cabelo diz até onde ele vai: 'frente' (testa), 'lado' (acima das orelhas) e 'tras' (nuca),
// em graus a partir do alto da cabeça.

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

// Faixa de cabelo: passa na testa, logo acima da linha do cabelo, e desce atrás da cabeça
function anguloFaixa(x, z) {
  const c = Math.cos(Math.atan2(x, z));
  return (79 - 26 * c) * GRAUS;
}

// Superfície de um corte de cabelo: ponto(phi, t, extra) com phi em volta (como a esfera do THREE) e
// t = 0 no alto da cabeça até 1 na linha do cabelo (ou na ponta dos fios, se ele cai).
//   base, topo, tras, lados, frenteTopo: volume (m) em cada região; borda: graus em que encosta na pele
//   ondas: { amplitude, frequencia }; ruido(phi, ax, az): graus a mais na linha (franja, pontas)
//   caida: { inicio (graus), comprimento (m), abre }: abaixo de 'inicio' os fios caem retos
//   volumeExtra(x, y, z): m a mais em cada direção (topete, risca); faixa: aperta o cabelo onde passa a faixa
//   pontaSolta: a ponta dos fios que caem fica longe da pele (cabelo comprido); sem ela, a beirada afina
function mapaCabelo({
  linha, base = 0.012, topo = 0, tras = 0, lados = 0, frenteTopo = 0, borda = 12, ondas = null,
  ruido = null, caida = null, volumeExtra = null, faixa = false, pontaSolta = false,
}) {
  const thetaC = caida ? caida.inicio * GRAUS : Infinity;
  const limite = (phi) => limiteCabelo(linha, -Math.cos(phi), Math.sin(phi)) / GRAUS
    + (ruido ? ruido(phi, -Math.cos(phi), Math.sin(phi)) : 0);
  const ponto = function ponto(phi, t, extra = 0) {
    const ax = -Math.cos(phi);
    const az = Math.sin(phi);
    let lim = limiteCabelo(linha, ax, az);
    if (ruido) lim += ruido(phi, ax, az) * GRAUS;
    const theta = t * lim;
    const th = Math.min(theta, thetaC);
    const sx = ax * Math.sin(th);
    const sy = Math.cos(th);
    const sz = az * Math.sin(th);
    let f = base + topo * Math.max(0, sy) ** 2 + tras * Math.max(0, -az) * Math.sin(th)
      + lados * Math.abs(ax) * Math.sin(th) + frenteTopo * Math.max(0, az) * Math.max(0, sy);
    if (volumeExtra) f += volumeExtra(sx, sy, sz);
    let rel = ondas ? ondas.amplitude * relevo(sx, sy, sz, ondas.frequencia) : 0;
    if (faixa) {
      const perto = sino((th - anguloFaixa(sx, sz)) / GRAUS, 9);
      f -= perto * base * 0.45;
      rel *= 1 - perto;
    }
    f += rel;
    if (lim <= thetaC + 1e-6 || !pontaSolta) {
      const b = suave((lim - theta) / (borda * GRAUS));
      f = 0.0015 + (f - 0.0015) * b;
    }
    const q = pontoCabeca(sx, sy, sz, f + extra);
    if (theta > thetaC) {
      // Fios caindo: descem retos a partir de 'inicio', abrindo um pouco
      const d = ((theta - thetaC) / (Math.PI / 2)) * caida.comprimento;
      q.y -= d;
      q.x += ax * d * (caida.abre ?? 0.1);
      q.z += az * d * (caida.abre ?? 0.1) - (caida.paraTras ?? 0) * d;
    }
    return q;
  };
  ponto.limite = limite;
  return ponto;
}

// Coordenada da textura do rosto para uma direção na cabeça (a mesma da esfera do THREE)
function uvDaDirecao(x, y, z) {
  let u = Math.atan2(z, -x) / (Math.PI * 2);
  if (u < 0) u += 1;
  return [u, 1 - Math.acos(limitar(y, -1, 1)) / Math.PI];
}

// Casca do cabelo a partir do mapa. Usa a mesma textura do rosto (o cabelo é pintado nela, na direção da
// raiz de cada ponto), então a beirada da casca some na pele sem "borda de capacete".
// Sombreado: tom de cada mecha varia de leve; pontaSolta escurece as pontas (cabelo comprido).
function cascaCabelo(ponto, seg, aneis, { escurecePonta = 0 } = {}) {
  const pos = [];
  const uv = [];
  const cores = [];
  const idx = [];
  for (let j = 0; j <= aneis; j++) {
    const t = j / aneis;
    for (let i = 0; i <= seg; i++) {
      const phi = (i / seg) * Math.PI * 2;
      const q = ponto(phi, t);
      pos.push(q.x, q.y, q.z);
      const theta = Math.min(179, t * ponto.limite(phi)) * GRAUS;
      uv.push(i / seg, 1 - theta / Math.PI);
      const mecha = 1 + (sorteioFixo(i % seg, j) - 0.5) * 0.22 * (1 - t ** 3);
      const k = (1 - escurecePonta * t * t) * mecha;
      cores.push(k, k, k);
    }
  }
  const linha = seg + 1;
  for (let j = 0; j < aneis; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * linha + i + 1;
      const b = j * linha + i;
      const c = (j + 1) * linha + i;
      const d = (j + 1) * linha + i + 1;
      if (j > 0) idx.push(a, b, d);
      idx.push(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  g.setIndex(idx);
  return finalizar(g, new THREE.Vector3(0, CRANIO.y - 0.03, CRANIO.z));
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
  comCor(g, (x, y, z) => 0.8 + 0.25 * (y / raio));
  // Textura de cachos: cada bolinha pega um pedaço diferente
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * 0.3);
  return g;
}

function finalizarCachos(g) {
  g.computeBoundingSphere();
  return g;
}

// Cachos espalhados pela superfície do cabelo (de t0 a t1), com tamanhos variados
function cachosNoMapa(ponto, n, raio, { t0 = 0.15, t1 = 1, filtro = null, afundar = 0.35 } = {}) {
  const partes = [];
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < n; k++) {
    const t = t0 + (t1 - t0) * Math.sqrt((k + 0.5) / n);
    const phi = (k * ouro) % (Math.PI * 2);
    if (filtro && !filtro(phi, t)) continue;
    const r = raio * (0.8 + 0.4 * sorteioFixo(k, 3));
    const q = ponto(phi, t, r * (1 - afundar) - r);
    partes.push([bolinha(r), matriz(q.x, q.y, q.z, k, k * 2, k * 3)]);
  }
  return partes;
}

// Crista do moicano: faixa no meio da cabeça, da testa até o alto da nuca, mais alta na frente
function crista(folga, largura = 0.3, alturaMax = 0.04) {
  const g = new THREE.SphereGeometry(1, 16, 5, -82 * GRAUS, 130 * GRAUS, Math.PI / 2 - largura, 2 * largura);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getY(i);
    const y = -p.getX(i);
    const z = p.getZ(i);
    const phi = (-82 + uv.getX(i) * 130) * GRAUS;   // 0 = alto da cabeça, + = para a testa
    const meio = 1 - (x / Math.sin(largura)) ** 2;   // 1 no meio da crista, 0 nas beiradas
    const h = (0.01 + alturaMax * Math.exp(-((((phi / GRAUS) - 25) / 50) ** 2))) * Math.max(0, meio) ** 0.55;
    const q = pontoCabeca(x, y, z, folga + h + 0.004 * relevo(x, y, z, 22) * meio);
    p.setXYZ(i, q.x, q.y, q.z);
    uv.setXY(i, ...uvDaDirecao(x, y, z));
  }
  comCor(g, (x, y, z) => 0.85 + 0.15 * sorteioFixo(Math.round(z * 300), Math.round(x * 300)));
  return finalizar(g, new THREE.Vector3(0, CRANIO.y, CRANIO.z));
}

// folga: { frente, tras } (m da pele): encostada na testa e por cima do cabelo atrás
function geoFaixa(folga) {
  const seg = 24;
  const aneis = [[-6.5, 0], [0, 0.004], [6.5, 0]]; // [graus em volta do meio da faixa, folga a mais]
  const pos = [];
  const idx = [];
  for (const [dg, f] of aneis) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.sin(a);
      const z = Math.cos(a);
      const theta = anguloFaixa(x, z) + dg * GRAUS;
      const k = suave((1 - Math.cos(a)) / 1.2);
      const q = pontoCabeca(x * Math.sin(theta), Math.cos(theta), z * Math.sin(theta), misturar(folga.frente, folga.tras, k) + f);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let j = 0; j < aneis.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  comCor(g, (x, y) => (y < CRANIO.y + 0.03 ? 0.85 : 1));
  return finalizar(g, new THREE.Vector3(0, CRANIO.y, CRANIO.z));
}

// Cortes de cabelo. couro: o cabelo raspado pintado na pele (raspado e os lados do moicano e do topete):
// linha do cabelo (graus a partir do alto), densidade (0 a 1) e borda (graus de esfumado). Os outros cortes
// têm casca (parametrosCabelo) e a raiz é pintada pelo mesmo mapa da casca.
// Cortes com variações (cabelo.corte no elenco; sem ele, cada jogador ganha uma fixa):
//   curto: 'frente' (franja para a frente) | 'lado' (risca de lado) | 'arrepiado'
//   medio: 'franja' (anos 80, franja cheia) | 'repartido' (anos 70, risca de lado e volume nos lados)
const CORTES = { curto: ['frente', 'lado', 'arrepiado'], medio: ['franja', 'repartido'] };
const ESTILOS_CABELO = {
  careca: {},
  raspado: { couro: { linha: { frente: 46, lado: 92, tras: 136 }, densidade: 0.66, borda: 3 } },
  topete: { couro: { linha: { frente: 45, lado: 92, tras: 134 }, densidade: 0.72, borda: 3 } },
  moicano: { couro: { linha: { frente: 47, lado: 90, tras: 132 }, densidade: 0.58, borda: 3 } },
  curto: {}, medio: {}, longo: {}, cacheado: {}, cacheadoLongo: {}, volumoso: {},
};

// Escolhe a variação do corte: a do elenco (cabelo.corte) ou uma fixa para cada jogador
function corteDoCabelo(v) {
  const opcoes = CORTES[v.cabelo.estilo];
  if (!opcoes) return '';
  if (opcoes.includes(v.cabelo.corte)) return v.cabelo.corte;
  const chave = `${v.cabelo.cor}${v.pele}${v.altura}${v.porte}`;
  let h = 2254;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return opcoes[h % opcoes.length];
}

// Folga da faixa (m da pele) na testa e atrás, por cima do cabelo apertado por ela
const FAIXA_FOLGA = {
  cacheadoLongo: { frente: 0.004, tras: 0.019 }, cacheado: { frente: 0.004, tras: 0.014 },
  longo: { frente: 0.003, tras: 0.012 }, medio: { frente: 0.006, tras: 0.016 },
  volumoso: { frente: 0.006, tras: 0.025 }, curto: { frente: 0.003, tras: 0.011 },
};

// Parâmetros de cada corte com casca: opções do mapa (mapaCabelo), resolução, cachos e o tipo de fio pintado
function parametrosCabelo(estilo, corte, comFaixa) {
  switch (estilo) {
    case 'curto':
      return {
        fios: corte === 'arrepiado' ? 'curtos' : 'fios', seg: 18, aneis: 8,
        mapa: {
          linha: { frente: corte === 'frente' ? 50 : 45, lado: 94, tras: 136 },
          base: 0.011, topo: corte === 'arrepiado' ? 0.012 : 0.008, borda: 10,
          frenteTopo: corte === 'frente' ? 0.007 : 0.004,
          ondas: corte === 'arrepiado' ? { amplitude: 0.011, frequencia: 17 } : { amplitude: 0.005, frequencia: 15 },
          ruido: corte === 'frente' ? (phi, ax, az) => Math.max(0, az) * 4 * Math.abs(Math.sin(phi * 20)) + 1.5 * Math.sin(phi * 31)
            : (phi) => 1.5 * Math.sin(phi * 29),
          // Risca do lado direito e volume penteado para a esquerda
          volumeExtra: corte === 'lado'
            ? (x, y, z) => 0.006 * Math.max(0, x + 0.2) * Math.max(0, y) - 0.006 * sino(x + 0.42, 0.07) * Math.max(0, y) * Math.max(0, z + 0.3)
            : null,
          faixa: comFaixa,
        },
      };
    case 'topete':
      // Lados bem curtos (pintados) e volume em cima, penteado para cima e para trás na frente
      return {
        fios: 'fios', seg: 18, aneis: 8,
        mapa: {
          linha: { frente: 44, lado: 72, tras: 96 }, base: 0.009, topo: 0.018, borda: 6,
          volumeExtra: (x, y, z) => 0.034 * Math.max(0, z + 0.15) ** 1.4 * sino(y - 0.72, 0.32) * sino(x, 0.6),
          ondas: { amplitude: 0.005, frequencia: 13 },
          ruido: (phi) => 2 * Math.sin(phi * 23),
        },
      };
    case 'medio':
      return {
        fios: 'fios', seg: 20, aneis: 10,
        mapa: corte === 'franja' ? {
          // Anos 80: franja cheia e desfiada na testa, cobre metade das orelhas, nuca até a gola
          linha: { frente: 62, lado: 108, tras: 146 },
          base: 0.016, topo: 0.014, lados: 0.004, borda: 10,
          ondas: { amplitude: 0.008, frequencia: 12 },
          caida: { inicio: 102, comprimento: 0.06, abre: 0.05 },
          ruido: (phi, ax, az) => Math.max(0, az) * 5 * Math.abs(Math.sin(phi * 14)) + Math.max(0, -az) * 5 * Math.sin(phi * 11),
          faixa: comFaixa,
        } : {
          // Anos 70: risca do lado direito, penteado para a esquerda, cobre as orelhas, volume nos lados
          linha: { frente: 51, lado: 112, tras: 158 },
          base: 0.014, topo: 0.009, lados: 0.006, borda: 10,
          ondas: { amplitude: 0.009, frequencia: 7 },
          caida: { inicio: 100, comprimento: 0.085, abre: 0.05, paraTras: 0.04 },
          ruido: (phi, ax, az) => 6 * Math.max(0, ax) * Math.max(0, az) + Math.max(0, -az + 0.2) * 7 * Math.sin(phi * 9),
          volumeExtra: (x, y, z) => 0.009 * Math.max(0, x + 0.15) * Math.max(0, y)
            - 0.008 * sino(x + 0.36, 0.06) * Math.max(0, y) * Math.max(0, z + 0.25),
          faixa: comFaixa,
        },
      };
    case 'longo':
      // Comprido até os ombros, repartido no meio, atrás das orelhas
      return {
        fios: 'fios', seg: 20, aneis: 11, escurecePonta: 0.12,
        mapa: {
          linha: { frente: 47, lado: 104, tras: 168 }, base: 0.013, topo: 0.006, lados: 0.004, borda: 8,
          ondas: { amplitude: 0.004, frequencia: 9 },
          caida: { inicio: 96, comprimento: 0.16, abre: 0.12, paraTras: 0.12 }, pontaSolta: true,
          ruido: (phi, ax, az) => Math.max(0, -az + 0.3) * 6 * Math.sin(phi * 9),
          volumeExtra: (x, y, z) => -0.006 * sino(x, 0.06) * Math.max(0, y) * Math.max(0, z + 0.2),
          faixa: comFaixa,
        },
      };
    case 'cacheado':
      // Cachos curtos: casca com relevo e bolinhas na beirada e em cima
      return {
        fios: 'cachos', seg: 18, aneis: 9,
        mapa: {
          linha: { frente: 44, lado: 96, tras: 128 }, base: 0.016, topo: 0.01, borda: 7,
          ondas: { amplitude: 0.018, frequencia: 13 }, faixa: comFaixa,
          ruido: (phi) => 3 * Math.sin(phi * 17),
        },
        cachos: { n: 8, raio: 0.021, t0: 0.3, afundar: 0.5, filtro: comFaixa ? (phi, t) => Math.abs(t - 0.62) > 0.1 : null },
      };
    case 'cacheadoLongo':
      // Cachos grandes e compridos (descem pela nuca até os ombros), presos pela faixa na testa
      return {
        fios: 'cachos', seg: 20, aneis: 10, escurecePonta: 0.15,
        mapa: {
          linha: { frente: 47, lado: 116, tras: 166 }, base: 0.024, topo: 0.016, lados: 0.012, borda: 7,
          ondas: { amplitude: 0.022, frequencia: 11 },
          caida: { inicio: 96, comprimento: 0.13, abre: 0.38, paraTras: 0.05 }, pontaSolta: true,
          ruido: (phi, ax, az) => Math.max(0, -az + 0.4) * 9 * Math.sin(phi * 11) + 2.5 * Math.sin(phi * 23),
          faixa: comFaixa,
        },
        cachos: { n: 12, raio: 0.028, t0: 0.6, afundar: 0.45, filtro: (phi, t) => Math.sin(phi) < 0.35 && (!comFaixa || t > 0.62) },
      };
    case 'volumoso':
      // Volume grande e redondo (anos 70/80), cachos que descem até a nuca
      return {
        fios: 'cachos', seg: 20, aneis: 10,
        mapa: {
          linha: { frente: 50, lado: 112, tras: 146 }, base: 0.03, topo: 0.03, lados: 0.012, borda: 9,
          ondas: { amplitude: 0.026, frequencia: 9 },
          caida: { inicio: 102, comprimento: 0.05, abre: 0.4 },
          ruido: (phi) => 3 * Math.sin(phi * 15),
          faixa: comFaixa,
        },
        cachos: { n: 6, raio: 0.027, t0: 0.65, afundar: 0.55 },
      };
    default:
      return null;
  }
}

// Partes do cabelo de cada estilo: [{ geometria, cachos }]. As cascas usam a textura do rosto;
// as bolinhas de cachos (cachos: true) usam a textura de cachos na cor do cabelo.
function geoCabelo(estilo, corte, comFaixa) {
  return geo(`cabelo:${estilo}:${corte}:${comFaixa ? 1 : 0}`, () => {
    if (estilo === 'moicano') return [{ geometria: crista(0.003, 0.4, 0.024) }];
    const p = parametrosCabelo(estilo, corte, comFaixa);
    if (!p) return []; // careca e raspado: pintados na pele da cabeça
    const ponto = mapaCabelo(p.mapa);
    const partes = [{ geometria: cascaCabelo(ponto, p.seg, p.aneis, { escurecePonta: p.escurecePonta || 0 }) }];
    if (p.cachos) {
      const c = p.cachos;
      partes.push({
        geometria: finalizarCachos(fundir(cachosNoMapa(ponto, c.n, c.raio, { t0: c.t0, afundar: c.afundar, filtro: c.filtro || null }))),
        cachos: true,
      });
    }
    return partes;
  });
}

// ---------- Barbas ----------
// Onde cada barba cobre o rosto (0 a 1), por az (graus em volta, 0 = frente) e pol (graus do alto)
function coberturaBarba(estilo, az, pol) {
  const a = Math.abs(az);
  const dentro = (v, a0, a1, s) => suave((v - a0) / s) * suave((a1 - v) / s);
  const labios = suave((1 - (a / 13) ** 2 - ((pol - 121.4) / 3.8) ** 2) / 0.35);
  const bigode = dentro(a, -99, 21, 4) * dentro(pol, 107.5, 117.5, 2.5);
  const cantos = dentro(a, 13, 27, 3) * dentro(pol, 110, 134, 4);
  const queixo = dentro(a, -99, 30, 7) * dentro(pol, 126, 174, 5);
  const linhaBochecha = 111 - 16 * limitar((a - 18) / 72, 0, 1);
  const mandibula = dentro(a, 16, 88, 6) * dentro(pol, linhaBochecha, 174, 7);
  switch (estilo) {
    case 'cheia':
    case 'rala':
      return Math.max(bigode, cantos, queixo, mandibula) * (1 - labios);
    case 'bigode':
      // Bigodão anos 70: grosso, descendo nos cantos da boca
      return Math.max(dentro(a, -99, 24, 4) * dentro(pol, 106, 118, 2.5), dentro(a, 15, 25, 3) * dentro(pol, 110, 126, 3)) * (1 - labios);
    case 'cavanhaque':
      return Math.max(bigode, cantos * 0.9, dentro(a, -99, 21, 5) * dentro(pol, 126, 162, 5)) * (1 - labios);
    default:
      return 0;
  }
}
const ESPESSURA_BARBA = { cheia: 0.008, bigode: 0.0065, cavanhaque: 0.0065 };

// ---------- Texturas (desenhadas num canvas) ----------

// Cachos: bolinhas claras no meio e escuras na volta
function texturaCachos() {
  return textura('cachos', () => {
    const [canvas, ctx] = novoCanvas(128, 128);
    ctx.fillStyle = 'rgb(150,150,150)';
    ctx.fillRect(0, 0, 128, 128);
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 170; k++) {
      const x = r() * 128;
      const y = r() * 128;
      const raio = 5 + r() * 7;
      for (const dx of [-128, 0, 128]) {
        for (const dy of [-128, 0, 128]) {
          const g = ctx.createRadialGradient(x + dx - raio * 0.3, y + dy - raio * 0.3, 0, x + dx, y + dy, raio);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(0.55, 'rgba(200,200,200,0.7)');
          g.addColorStop(1, 'rgba(70,70,70,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, raio, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const t = novaTextura(canvas, true);
    t.repeat.set(4, 2);
    return t;
  });
}

// Rosto e couro cabeludo: pele com variação de tom, olhos, sobrancelhas, boca, barba rala e a raiz do
// cabelo (ou o cabelo raspado) pintados. A textura dá a volta na cabeça como a esfera do THREE.
const ROSTO_W = 512;
const ROSTO_H = 256;
const ROSTO_N = ROSTO_W * ROSTO_H;

// Tom dos fios pintados (0 a 1): 'fios' (compridos, seguem do alto para baixo), 'curtos' ou 'cachos'
let mapaCachos = null;
function cachoNoPixel(px, py) {
  if (!mapaCachos) {
    // Cachos espalhados (as bordas dão a volta): cada um é um domo de 3 a 7 px
    mapaCachos = new Float32Array(ROSTO_N).fill(0.18);
    let semente = 11;
    const r = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 2600; k++) {
      const cx = r() * ROSTO_W;
      const cy = r() * ROSTO_H;
      const raio = 3 + r() * 4;
      const tom = 0.7 + 0.3 * r();
      for (let dy = -Math.ceil(raio); dy <= raio; dy++) {
        const y = Math.round(cy + dy);
        if (y < 0 || y >= ROSTO_H) continue;
        for (let dx = -Math.ceil(raio); dx <= raio; dx++) {
          const d2 = (dx * dx + dy * dy) / (raio * raio);
          if (d2 >= 1) continue;
          const x = ((Math.round(cx + dx) % ROSTO_W) + ROSTO_W) % ROSTO_W;
          const i = y * ROSTO_W + x;
          mapaCachos[i] = Math.max(mapaCachos[i], tom * (1 - d2) ** 0.6);
        }
      }
    }
  }
  const x = ((Math.round(px) % ROSTO_W) + ROSTO_W) % ROSTO_W;
  const y = limitar(Math.round(py), 0, ROSTO_H - 1);
  return mapaCachos[y * ROSTO_W + x];
}

function tomDoFio(tipo, px, py) {
  if (tipo === 'cachos') return cachoNoPixel(px, py);
  const x = px * (tipo === 'curtos' ? 1.4 : 0.95) + 2.5 * Math.sin(py * 0.045 + Math.floor(px / 23));
  const i = Math.floor(x);
  const f = x - i;
  const n = misturar(sorteioFixo(i, 7), sorteioFixo(i + 1, 7), f * f * (3 - 2 * f));
  const lento = 0.5 + 0.5 * Math.sin(py * (tipo === 'curtos' ? 0.35 : 0.11) + sorteioFixo(Math.floor(px / 9), 3) * 6);
  return n * (0.7 + 0.3 * lento);
}
const noRosto = (az, pol) => [(0.25 + az / 360) * ROSTO_W, (pol / 180) * ROSTO_H];

// Tabelas compartilhadas da pintura do rosto (calculadas uma vez, de 0 a 255): ruído, rosado das
// bochechas, tom dos fios de cada tipo, cobertura de cada barba e a crista do moicano. Assim cada rosto
// novo só mistura cores (rápido, sem travar o celular quando a barreira é montada).
const tabelasRosto = new Map();
function tabelaRosto(nome, f) {
  let t = tabelasRosto.get(nome);
  if (!t) {
    t = new Uint8Array(ROSTO_N);
    for (let py = 0; py < ROSTO_H; py++) {
      const pol = ((py + 0.5) / ROSTO_H) * 180;
      for (let px = 0; px < ROSTO_W; px++) {
        const u = (px + 0.5) / ROSTO_W;
        let azg = (u - 0.25) * 360;
        if (azg > 180) azg -= 360;
        t[py * ROSTO_W + px] = limitar(Math.round(f(px, py, u, azg, pol) * 255), 0, 255);
      }
    }
    tabelasRosto.set(nome, t);
  }
  return t;
}
const tabRuido = () => tabelaRosto('ruido', (px, py) => sorteioFixo(px, py));
const tabRuido2 = () => tabelaRosto('ruido2', (px, py) => sorteioFixo(px * 3.1, py * 1.7));
const tabRosado = () => tabelaRosto('rosado', (px, py, u, azg, pol) =>
  (0.07 * sino(Math.abs(azg) - 32, 14) * sino(pol - 100, 10) + 0.04 * sino(azg, 9) * sino(pol - 102, 8)) / 0.12);
const tabFios = (tipo) => tabelaRosto(`fios:${tipo}`, (px, py) => tomDoFio(tipo, px, py));
const tabBarbaCachos = () => tabelaRosto('barbaCachos', (px, py) => 0.35 + 0.65 * tomDoFio('cachos', px * 1.7, py * 1.7));
const tabBarba = (estilo) => tabelaRosto(`barba:${estilo}`, (px, py, u, azg, pol) => coberturaBarba(estilo, azg, pol));
const tabCrista = () => tabelaRosto('crista', (px, py, u, azg, pol) => {
  const th = pol * GRAUS;
  const phi = u * Math.PI * 2;
  const sx = -Math.cos(phi) * Math.sin(th);
  const ang = Math.atan2(Math.sin(phi) * Math.sin(th), Math.cos(th)) / GRAUS; // 0 = alto, + = para a testa
  return suave((0.36 - Math.abs(sx)) / 0.05) * suave((49 - ang) / 3) * suave((ang + 80) / 4);
});

function texturaRosto(r) {
  const W = ROSTO_W;
  const H = ROSTO_H;
  const [canvas, ctx] = novoCanvas(W, H);
  const pele = rgb255(r.pele);
  const cabelo = rgb255(r.cabelo);
  const barba = rgb255(r.barba);
  const raspado = rgb255(r.corRaspado || r.cabelo);
  const brilhoFio = (r.fios === 'cachos' ? 30 : 42) * (1 - luminancia(r.cabelo) * 0.6);
  const ruido = tabRuido();
  const ruido2 = tabRuido2();
  const rosado = tabRosado();
  const fios = tabFios(r.fios);
  const crista = r.crista ? tabCrista() : null;
  const cob = r.estiloBarba ? tabBarba(r.estiloBarba) : null;
  const rala = r.estiloBarba === 'rala';
  const pelos = cob && !rala ? tabBarbaCachos() : null;
  // Por coluna (direção em volta da cabeça): linha do cabelo raspado e da casca, e as costeletas
  const limR = new Float32Array(W);
  const limC = new Float32Array(W);
  const cost = new Float32Array(W);
  for (let px = 0; px < W; px++) {
    const u = (px + 0.5) / W;
    const phi = u * Math.PI * 2;
    let azg = (u - 0.25) * 360;
    if (azg > 180) azg -= 360;
    cost[px] = sino(Math.abs(azg) - 80, 6);
    if (r.raspado) limR[px] = limiteCabelo(r.raspado.linha, -Math.cos(phi), Math.sin(phi)) / GRAUS;
    if (r.casca) limC[px] = r.casca.limite(phi);
  }
  const img = ctx.createImageData(W, H);
  const dados = img.data;
  for (let py = 0; py < H; py++) {
    const pol = ((py + 0.5) / H) * 180;
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      // Pele: leve variação de tom; bochechas, nariz e orelhas um pouco mais rosados
      const n0 = 1 + 0.025 * (ruido[i] / 255 - 0.5);
      const ros = (rosado[i] / 255) * 0.12;
      let c0 = pele[0] * n0 * (1 + ros * 0.6);
      let c1 = pele[1] * n0 * (1 - ros * 0.25);
      let c2 = pele[2] * n0 * (1 - ros * 0.3);
      // Cabelo raspado (raspado, lados do moicano e do topete): pontinhos na cor do cabelo
      if (r.raspado) {
        const lim = limR[px] + cost[px] * (pol < 104 ? 14 : 0);
        const k = suave((lim - pol + 1.5) / r.raspado.borda) * r.raspado.densidade * (0.55 + 0.45 * (ruido2[i] / 255));
        if (k > 0) {
          c0 = misturar(c0, raspado[0], k);
          c1 = misturar(c1, raspado[1], k);
          c2 = misturar(c2, raspado[2], k);
        }
      }
      // Cabelo embaixo da casca (e nela mesma): fios ou cachos até a linha do cabelo, beirada suave
      let kCabelo = 0;
      if (r.casca) {
        const lim = limC[px] + cost[px] * Math.max(0, 104 - limC[px]) * (pol < 106 ? 1 : 0);
        kCabelo = suave((lim - pol + 1) / 3);
      }
      if (crista) kCabelo = Math.max(kCabelo, crista[i] / 255);
      if (kCabelo > 0) {
        const n = fios[i] / 255;
        const brilho = Math.max(0, n - 0.78) * 4 * brilhoFio;
        c0 = misturar(c0, cabelo[0] * (0.62 + 0.48 * n) + brilho, kCabelo);
        c1 = misturar(c1, cabelo[1] * (0.62 + 0.48 * n) + brilho, kCabelo);
        c2 = misturar(c2, cabelo[2] * (0.62 + 0.48 * n) + brilho * 0.95, kCabelo);
      }
      // Barba: rala (pontinhos) ou cheia (pelos encaracolados)
      if (cob && cob[i] > 0) {
        const c = cob[i] / 255;
        const k = c * (rala ? 0.42 * (0.45 + 0.55 * (ruido2[i] / 255)) : 0.95);
        const n = pelos ? pelos[i] / 255 : 1;
        c0 = misturar(c0, barba[0] * (0.7 + 0.4 * n), k);
        c1 = misturar(c1, barba[1] * (0.7 + 0.4 * n), k);
        c2 = misturar(c2, barba[2] * (0.7 + 0.4 * n), k);
      }
      const j = i * 4;
      dados[j] = c0;
      dados[j + 1] = c1;
      dados[j + 2] = c2;
      dados[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Olhos: sombra da órbita, branco, íris, pupila, brilho e pálpebra de cima
  const escura = pele.map((c) => Math.round(c * 0.45));
  for (const s of [-1, 1]) {
    const [x, y] = noRosto(s * 21.5, 86);
    let g = ctx.createRadialGradient(x, y - 2, 2, x, y - 2, 26);
    g.addColorStop(0, css(escura, 0.32));
    g.addColorStop(1, css(escura, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 28, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Branco do olho (amêndoa)
    ctx.fillStyle = '#ece5da';
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 0.5);
    ctx.quadraticCurveTo(x - 2 * s, y - 8, x + 14, y - 0.5 * s);
    ctx.quadraticCurveTo(x + 1 * s, y + 7, x - 14, y + 0.5);
    ctx.fill();
    // Íris e pupila (olhando para a frente)
    const ix = x + s * 0.5;
    ctx.fillStyle = r.olhos;
    ctx.beginPath();
    ctx.arc(ix, y, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0907';
    ctx.beginPath();
    ctx.arc(ix, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(ix - 1.6, y - 1.8, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Pálpebra de cima (cílios) e a dobra acima dela
    ctx.strokeStyle = '#1e140f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 1);
    ctx.quadraticCurveTo(x - 2 * s, y - 9, x + 15, y - 1);
    ctx.stroke();
    ctx.strokeStyle = css(escura, 0.35);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 5);
    ctx.quadraticCurveTo(x - 2 * s, y - 13, x + 12, y - 5);
    ctx.stroke();
    ctx.strokeStyle = css(escura, 0.3);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 3);
    ctx.quadraticCurveTo(x, y + 7, x + 12, y + 2);
    ctx.stroke();
    // Sobrancelha: grossa por dentro, fina por fora, com um arco
    const [x0, y0] = noRosto(s * 8, 76.5);
    const [x1, y1] = noRosto(s * 26, 73.5);
    const [x2, y2] = noRosto(s * 38, 77.5);
    ctx.fillStyle = r.sobrancelha;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 4.5 * r.grossura);
    ctx.quadraticCurveTo(x1, y1 + 3 * r.grossura, x2, y2 + 1);
    ctx.quadraticCurveTo(x1, y1 - 3.5 * r.grossura, x0, y0 - 3.5 * r.grossura);
    ctx.closePath();
    ctx.fill();
  }
  // Boca: lábio de cima mais escuro, de baixo com brilho, e a linha da boca
  const comBarba = r.estiloBarba && r.estiloBarba !== 'rala';
  const labio = pele.map((c, i) => Math.round((c * 0.78 + [150, 60, 55][i] * 0.22 * (pele[0] > 150 ? 1 : 0.5)) * (comBarba ? 0.82 : 1)));
  const [bx, by] = noRosto(0, 121);
  const lw = comBarba ? 16 : 21; // meia largura da boca (px)
  ctx.fillStyle = css(labio, 0.95);
  ctx.beginPath();
  ctx.moveTo(bx - lw, by);
  ctx.quadraticCurveTo(bx - lw * 0.43, by - 7, bx, by - 4);
  ctx.quadraticCurveTo(bx + lw * 0.43, by - 7, bx + lw, by);
  ctx.quadraticCurveTo(bx, by + 1.5, bx - lw, by);
  ctx.fill();
  ctx.fillStyle = css(labio.map((c) => Math.min(255, c * 1.06)), 0.9);
  ctx.beginPath();
  ctx.moveTo(bx - lw * 0.9, by + 0.5);
  ctx.quadraticCurveTo(bx, by + (comBarba ? 8 : 10), bx + lw * 0.9, by + 0.5);
  ctx.quadraticCurveTo(bx, by + 2, bx - lw * 0.9, by + 0.5);
  ctx.fill();
  ctx.strokeStyle = css(pele.map((c) => c * 0.3), 0.85);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(bx - lw, by);
  ctx.quadraticCurveTo(bx, by + 2.2, bx + lw, by);
  ctx.stroke();
  // Sombra embaixo do lábio de baixo e no sulco acima da boca
  let g = ctx.createRadialGradient(bx, by + 13, 1, bx, by + 13, 16);
  g.addColorStop(0, css(escura, 0.22));
  g.addColorStop(1, css(escura, 0));
  ctx.fillStyle = g;
  ctx.fillRect(bx - 20, by + 2, 40, 24);
  g = ctx.createLinearGradient(bx, by - 18, bx, by - 5);
  g.addColorStop(0, css(escura, 0));
  g.addColorStop(1, css(escura, 0.12));
  ctx.fillStyle = g;
  ctx.fillRect(bx - 4, by - 18, 8, 13);
  // Bem embaixo (dentro do pescoço): pele lisa, usada pelo pescoço, nariz e orelhas
  ctx.fillStyle = css(pele);
  ctx.fillRect(0, H - 8, W, 8);
  return novaTextura(canvas);
}

// ---------- Camisa (textura com padrão, gola, escudo, número e nome) ----------

const CAMISA_W = 512;
const CAMISA_H = 256;
const ALTURA_FAIXA = [0.205, 0.315];  // faixa do peito (São Paulo)
const SASH = { a: [-0.175, 0.47], b: [0.17, -0.085], largura: 0.092 }; // faixa diagonal (Vasco)
const V_PEITO = { ombro: 0.15, topo: 0.475, ponta: 0.2, largura: 0.07 };

// Faixa diagonal e V num ponto da camisa: u (volta), y (altura), x e z (posição na superfície).
// px = tamanho do pixel em metros (para a borda sair lisa). Devolve [cor, cobertura 0 a 1].
function padraoNoPonto(uni, u, y, x, z, px) {
  const borda = (d) => limitar(0.5 + d / px, 0, 1); // d > 0 = dentro da faixa (m)
  if (uni.padrao === 'diagonal') {
    const [ax, ay] = SASH.a;
    const [bx, by] = SASH.b;
    const lx = bx - ax;
    const ly = by - ay;
    const dist = Math.abs(lx * (y - ay) - ly * (x - ax)) / Math.hypot(lx, ly);
    return [uni.cores[0], borda(SASH.largura / 2 - dist)];
  }
  if (uni.padrao === 'v') {
    const { ombro, topo, ponta, largura } = V_PEITO;
    let melhor = Infinity;
    for (const s of [-1, 1]) {
      // Segmento do ombro até a ponta do V (vale na frente e atrás: só depende de x e y)
      const ax = s * ombro;
      const lx = -ax;
      const ly = ponta - topo;
      const t = limitar(((x - ax) * lx + (y - topo) * ly) / (lx * lx + ly * ly), 0, 1);
      melhor = Math.min(melhor, Math.hypot(x - (ax + lx * t), y - (topo + ly * t)));
    }
    return [uni.cores[0], borda(largura / 2 - melhor)];
  }
  return [null, 0];
}

// Cores que aparecem atrás de um ponto da camisa (para decidir o contorno do número)
function coresAtras(uni, y0, y1, costas) {
  const lista = [uni.camisa];
  if (uni.padrao === 'listras' || uni.padrao === 'aros') lista.push(uni.cores[0]);
  if (uni.padrao === 'faixa' && y1 > ALTURA_FAIXA[0] && y0 < ALTURA_FAIXA[1]) lista.push(...uni.cores);
  if (uni.padrao === 'diagonal') lista.push(uni.cores[0]);
  if (uni.padrao === 'v' && (costas ? y1 > V_PEITO.ponta : true)) lista.push(uni.cores[0]);
  return lista;
}
// Contorno do texto quando ele não se destaca de alguma cor do fundo
function contornoPara(cor, fundos, minimo = 3.2) {
  const pior = Math.min(...fundos.map((f) => contraste(cor, f)));
  if (pior >= minimo) return null;
  return contraste(cor, '#111111') >= contraste(cor, '#ffffff') ? '#111111' : '#ffffff';
}

// Texto com tamanho físico na camisa (altura em m), centrado em (u, y); comprime na largura se precisar
function escreverNaCamisa(ctx, texto, { u, y, altura, cor, contorno, grossuraContorno = 0.12, larguraMax, fonte }) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const v = camisaBase.vDeY;
  const topo = (1 - v(y + altura / 2)) * H;
  const baixo = (1 - v(y - altura / 2)) * H;
  const alturaPx = baixo - topo;
  const pxPorMetroX = W / camisaBase.perimetro(y);
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
    ctx.lineWidth = Math.max(2.5, alturaPx * grossuraContorno) / Math.min(1, sx);
    ctx.strokeStyle = contorno;
    ctx.strokeText(texto, 0, 0);
  }
  ctx.fillStyle = cor;
  ctx.fillText(texto, 0, 0);
  ctx.restore();
}

// Tramado do tecido (compartilhado): cinza claro com pontinhos, multiplicado por cima de cada camisa
let tramaCanvas = null;
function trama() {
  if (!tramaCanvas) {
    const [canvas, ctx] = novoCanvas(64, 64);
    const img = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const k = 238 + 17 * sorteioFixo(x, y) - 8 * ((x + y) % 2);
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = limitar(k, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tramaCanvas = canvas;
  }
  return tramaCanvas;
}

// Máscara (canvas com transparência) da faixa diagonal ou do V: calculada ponto a ponto uma vez só
const mascaras = new Map();
function mascaraPadrao(padrao, W, H) {
  let m = mascaras.get(padrao);
  if (!m) {
    const [canvas, ctx] = novoCanvas(W, H);
    const img = ctx.createImageData(W, H);
    const uni = { padrao, cores: ['#ffffff'] };
    for (let py = 0; py < H; py++) {
      const anel = camisaBase.anelNoV(1 - (py + 0.5) / H);
      const pts = pontosAnel(anel, 128);
      for (let px = 0; px < W; px++) {
        const fi = ((px + 0.5) / W) * 128;
        const i0 = Math.min(127, Math.floor(fi));
        const f = fi - i0;
        const x = misturar(pts[i0][0], pts[i0 + 1][0], f);
        const z = misturar(pts[i0][1], pts[i0 + 1][1], f);
        const [, k] = padraoNoPonto(uni, (px + 0.5) / W, anel.y, x, z, 1 / W);
        const i = (py * W + px) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(limitar(k, 0, 1) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    mascaras.set(padrao, (m = canvas));
  }
  return m;
}

// Padrão da camisa. Listras, aros e faixa são retângulos na textura; a faixa diagonal e o V usam a
// máscara pronta (dependem da posição no corpo).
function pintarPadrao(ctx, uni) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const v = camisaBase.vDeY;
  const linhaDeY = (y) => (1 - v(y)) * H;
  ctx.fillStyle = uni.camisa;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = uni.cores[0];
  switch (uni.padrao) {
    case 'listras': {
      // 16 faixas na volta (8 listras), uma listra bem no meio da frente e das costas
      const n = 16;
      for (let k = 0; k < n; k += 2) {
        const x0 = ((0.25 - 0.5 / n + k / n) % 1) * W;
        ctx.fillRect(x0, 0, W / n, H);
        if (x0 + W / n > W) ctx.fillRect(x0 - W, 0, W / n, H);
      }
      break;
    }
    case 'aros': {
      const h = 0.058;
      for (let y = -0.1 + h; y < 0.5; y += 2 * h) ctx.fillRect(0, linhaDeY(y + h), W, linhaDeY(y) - linhaDeY(y + h));
      break;
    }
    case 'faixa': {
      const [y0, y1] = ALTURA_FAIXA;
      const n = uni.cores.length;
      uni.cores.forEach((cor, i) => {
        const a = y1 - ((y1 - y0) * i) / n;
        const b = y1 - ((y1 - y0) * (i + 1)) / n;
        ctx.fillStyle = cor;
        ctx.fillRect(0, linhaDeY(a), W, linhaDeY(b) - linhaDeY(a));
      });
      break;
    }
    case 'diagonal':
    case 'v': {
      // Máscara da faixa (só depende do formato do corpo): pinta a cor nela e põe por cima
      const [tinta, ctxTinta] = novoCanvas(W, H);
      ctxTinta.drawImage(mascaraPadrao(uni.padrao, W, H), 0, 0);
      ctxTinta.globalCompositeOperation = 'source-in';
      ctxTinta.fillStyle = uni.cores[0];
      ctxTinta.fillRect(0, 0, W, H);
      ctx.drawImage(tinta, 0, 0);
      break;
    }
    default:
      break;
  }
}

function texturaCamisa(uni, numero, nome) {
  const W = CAMISA_W;
  const H = CAMISA_H;
  const [canvas, ctx] = novoCanvas(W, H);
  pintarPadrao(ctx, uni);
  // Tecido: tramado e dobras suaves na cintura e embaixo dos braços
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(trama(), 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  {
    const v = camisaBase.vDeY;
    const yCintura = (1 - v(0.02)) * H;
    for (let k = 0; k < 9; k++) {
      const x = (k / 9 + 0.03 * Math.sin(k * 7)) * W;
      const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 14, yCintura - 22, 28, 30);
    }
    const yAxila = (1 - v(0.32)) * H;
    for (const u of [0, 0.5]) {
      const g = ctx.createRadialGradient(u * W, yAxila, 2, u * W, yAxila, 40);
      g.addColorStop(0, 'rgba(0,0,0,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(u * W - 40, yAxila - 40, 80, 80);
      if (u === 0) ctx.fillRect(W - 40, yAxila - 40, 40, 80);
    }
  }
  const v = camisaBase.vDeY;

  // Gola: faixa em cima e um V cheio na frente; uma linha clara/escura embaixo se ela some no padrão
  const yGola = (1 - v(0.462)) * H;
  const yV = (1 - v(0.41)) * H;
  const fundosGola = [uni.camisa, ...(uni.padrao === 'liso' ? [] : uni.cores)];
  const golaSome = Math.min(...fundosGola.map((f) => contraste(uni.gola, f))) < 1.5;
  const caminhoGola = (folga) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, yGola + folga);
    ctx.lineTo(128 + 18 + folga, yGola + folga);
    ctx.lineTo(128, yV + folga * 1.6);
    ctx.lineTo(128 - 18 - folga, yGola + folga);
    ctx.lineTo(0, yGola + folga);
    ctx.closePath();
  };
  if (golaSome) {
    ctx.fillStyle = claro(uni.gola) ? 'rgba(20,20,20,0.45)' : 'rgba(255,255,255,0.5)';
    caminhoGola(1.5);
    ctx.fill();
  }
  ctx.fillStyle = uni.gola;
  caminhoGola(0);
  ctx.fill();
  // Barra (faixa fina embaixo)
  ctx.fillStyle = uni.gola;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, (1 - v(-0.088)) * H, W, 3);
  ctx.globalAlpha = 1;

  // Escudo genérico no peito esquerdo (lado +x, u > 0,25)
  const yEscudo = (1 - v(0.33)) * H;
  const xEscudo = 128 + 42;
  const corEscudo = distanciaCor(uni.gola, uni.camisa) > 60 ? uni.gola : (claro(uni.camisa) ? '#1b1b1b' : '#f2f2f2');
  ctx.fillStyle = corEscudo;
  ctx.beginPath();
  ctx.moveTo(xEscudo - 9, yEscudo - 11);
  ctx.lineTo(xEscudo + 9, yEscudo - 11);
  ctx.lineTo(xEscudo + 9, yEscudo + 2);
  ctx.lineTo(xEscudo, yEscudo + 12);
  ctx.lineTo(xEscudo - 9, yEscudo + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = claro(corEscudo) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (numero !== undefined && numero !== null && numero !== '') {
    const n = String(numero);
    // Costas: número grande; frente: pequeno no peito direito
    const contornoCostas = contornoPara(uni.numero, coresAtras(uni, 0.09, 0.31, true));
    escreverNaCamisa(ctx, n, {
      u: 0.75, y: 0.2, altura: 0.22, cor: uni.numero, contorno: contornoCostas, larguraMax: 0.3, fonte: '900',
    });
    const contornoFrente = contornoPara(uni.numero, coresAtras(uni, 0.29, 0.37, false));
    escreverNaCamisa(ctx, n, {
      u: 0.25 - 42 / W, y: 0.33, altura: 0.075, cor: uni.numero, contorno: contornoFrente, larguraMax: 0.1, fonte: '900',
    });
  }
  if (nome) {
    const contornoNome = contornoPara(uni.numero, coresAtras(uni, 0.35, 0.4, true), 4.5);
    escreverNaCamisa(ctx, String(nome).toUpperCase(), {
      u: 0.75, y: 0.372, altura: 0.046, cor: uni.numero, contorno: contornoNome, grossuraContorno: 0.24,
      larguraMax: 0.3, fonte: 'bold',
    });
  }
  return novaTextura(canvas);
}

// Manga: o padrão continua (listras e aros) e o punho na ponta. A manga vai da barra (v = 0) ao ombro.
function texturaManga(uni, punho, longa) {
  const W = 128;
  const H = 64;
  const [canvas, ctx] = novoCanvas(W, H);
  ctx.fillStyle = uni.camisa;
  ctx.fillRect(0, 0, W, H);
  if (uni.padrao === 'listras') {
    ctx.fillStyle = uni.cores[0];
    for (let k = 0; k < 3; k++) ctx.fillRect(((k / 3) + 0.25 / 3) * W - W / 12, 0, W / 6, H);
  } else if (uni.padrao === 'aros') {
    ctx.fillStyle = uni.cores[0];
    const n = longa ? 7 : 4;
    for (let k = 0; k < n; k += 2) ctx.fillRect(0, (k / n) * H, W, H / n);
  }
  // Tramado leve
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + 0.02 * ((y / 2) % 2)})`;
    ctx.fillRect(0, y, W, 1);
  }
  if (punho) {
    ctx.fillStyle = uni.gola;
    ctx.fillRect(0, H - 9, W, 9);
    if (contraste(uni.gola, uni.camisa) < 1.4) {
      ctx.fillStyle = claro(uni.gola) ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)';
      ctx.fillRect(0, H - 10, W, 1.5);
    }
  }
  return novaTextura(canvas);
}

// Meião: listras na dobra de cima, tramado em canelado e o pé um pouco mais escuro
function texturaMeiao(uni) {
  const W = 64;
  const H = 128;
  const [canvas, ctx] = novoCanvas(W, H);
  ctx.fillStyle = uni.meiao;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, 0, 1.5, H);
  }
  const v = meiaoBase.vDeY;
  const faixa = (y0, y1) => {
    const a = (1 - v(y1)) * H;
    const b = (1 - v(y0)) * H;
    ctx.fillRect(0, a, W, Math.max(1.5, b - a));
  };
  ctx.fillStyle = uni.faixaMeiao;
  faixa(-0.1, -0.084);
  faixa(-0.118, -0.11);
  const g = ctx.createLinearGradient(0, (1 - v(-0.33)) * H, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return novaTextura(canvas);
}

// Chuteira: cor, sola, uma listra curva dos lados e o reforço do calcanhar.
// u dá a volta (0 = cadarço, 0,25 = lado de fora/dentro, 0,5 = sola); v vai do calcanhar (0) ao bico (1).
function texturaChuteira(cor) {
  const W = 64;
  const H = 64;
  const [canvas, ctx] = novoCanvas(W, H);
  const detalhe = luminancia(cor) > 0.35 ? '#1a1a1a' : '#f2f2f2';
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, W, H);
  // Sola
  ctx.fillStyle = corMisturada(cor, detalhe, 0.55);
  ctx.fillRect(W * 0.37, 0, W * 0.26, H);
  // Cadarço: tracinhos no peito do pé
  ctx.fillStyle = corMisturada(cor, detalhe, 0.35);
  for (let k = 0; k < 5; k++) {
    const y = H - (0.42 + k * 0.055) * H;
    ctx.fillRect(W - 4, y, 4, 1.5);
    ctx.fillRect(0, y, 4, 1.5);
  }
  // Listra curva dos dois lados (do calcanhar para o meio do pé)
  ctx.strokeStyle = detalhe;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  for (const uLado of [0.25, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(uLado * W + (uLado < 0.5 ? 4 : -4), H - 0.12 * H);
    ctx.quadraticCurveTo(uLado * W, H - 0.42 * H, uLado * W + (uLado < 0.5 ? -9 : 9), H - 0.62 * H);
    ctx.stroke();
  }
  // Reforço do calcanhar (só a tira de trás)
  ctx.fillStyle = corMisturada(cor, '#000000', 0.25);
  ctx.fillRect(W * 0.62, H - 0.1 * H, W * 0.38, 0.1 * H);
  ctx.fillRect(0, H - 0.1 * H, W * 0.38, 0.1 * H);
  return novaTextura(canvas);
}

function matTextura(chave, criar, { cor = '#ffffff', brilho = 0, corSemDocumento = '#cccccc', duplo = false } = {}) {
  const chaveMat = duplo ? `${chave}:duplo` : chave;
  let m = cacheMat.get(chaveMat);
  if (!m) {
    const mapa = temDocumento ? textura(chave, criar) : null;
    const base = { color: new THREE.Color(mapa ? cor : corSemDocumento), vertexColors: true };
    if (duplo) base.side = THREE.DoubleSide;
    if (mapa) base.map = mapa;
    m = brilho > 0
      ? new THREE.MeshPhongMaterial({ ...base, shininess: brilho, specular: new THREE.Color(brilho > 30 ? 0x3a3a3a : 0x1c1c1c) })
      : new THREE.MeshLambertMaterial(base);
    cacheMat.set(chaveMat, m);
  }
  return m;
}

// Camisa de cada jogador (número e nome): fica em cache enquanto algum boneco usa. As que ficam sem uso
// esperam um pouco (até GUARDAR_CAMISAS) antes de sair da memória: a barreira é remontada a cada falta.
const GUARDAR_CAMISAS = 10;
const camisas = new Map();
const guardadas = [];
function pegarCamisa(uni, numero, nome) {
  const chave = JSON.stringify([uni, numero ?? null, nome ?? null]);
  let item = camisas.get(chave);
  if (!item) {
    const material = new THREE.MeshLambertMaterial(
      temDocumento ? { map: texturaCamisa(uni, numero, nome), vertexColors: true } : { color: uni.camisa, vertexColors: true },
    );
    item = { chave, material, usos: 0 };
    camisas.set(chave, item);
  }
  const i = guardadas.indexOf(item);
  if (i >= 0) guardadas.splice(i, 1);
  item.usos++;
  return item;
}
function descartarCamisa(item) {
  if (item.material.map) item.material.map.dispose();
  item.material.dispose();
  if (camisas.get(item.chave) === item) camisas.delete(item.chave);
}
function soltarCamisa(item) {
  item.usos--;
  if (item.usos > 0 || camisas.get(item.chave) !== item) return;
  guardadas.push(item);
  while (guardadas.length > GUARDAR_CAMISAS) descartarCamisa(guardadas.shift());
}

// ---------- Personagem ----------

const VISUAL_PADRAO = {
  pele: '#d9a57a', cabelo: { estilo: 'curto', cor: '#2a1d14' }, barba: 'nenhuma', corBarba: null,
  faixa: null, altura: 1.8, porte: 'normal', coxas: 'normais', chuteira: '#111111', goleiro: false,
};
const LARGURA_PORTE = { magro: 0.92, normal: 1, forte: 1.1 };
const MANDIBULA_PORTE = { magro: 0.25, normal: 0.5, forte: 0.8 };

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

// Estilo de cabelo efetivo (cacheado com faixa = os cachos compridos do Bruxo)
function estiloEfetivo(v) {
  const e = v.cabelo.estilo || 'curto';
  if (e === 'cacheado' && (v.cabelo.comprimento === 'longo' || (v.faixa && v.cabelo.comprimento !== 'curto'))) return 'cacheadoLongo';
  return ESTILOS_CABELO[e] ? e : 'curto';
}

// Material do rosto (textura pintada) para uma aparência. Devolve { frente, duplo }: o mesmo desenho
// para a cabeça e a barba (frente) e para as cascas do cabelo (duplo: pinta os dois lados).
function matRosto(v, estilo, corte, comFaixa) {
  const corCabelo = v.cabelo.cor || '#2a1d14';
  const corBarba = v.corBarba || corCabelo;
  const loiro = luminancia(corCabelo) > 0.25;
  const sobrancelha = v.sobrancelha || (estilo === 'careca'
    ? corMisturada(corBarba, '#1a1410', 0.35)
    : corMisturada(corCabelo, '#24180f', loiro ? 0.45 : 0.15));
  const barba = v.barba && v.barba !== 'nenhuma' ? v.barba : null;
  const info = ESTILOS_CABELO[estilo];
  const raspado = info && info.couro ? info.couro : null;
  const p = parametrosCabelo(estilo, corte, comFaixa);
  const r = {
    pele: v.pele, cabelo: corCabelo, corRaspado: corMisturada(corCabelo, '#16100c', 0.25),
    barba: corBarba, estiloBarba: barba, sobrancelha, olhos: v.olhos || '#3a2518',
    grossura: v.porte === 'forte' ? 1.15 : 1, raspado,
    casca: p ? { limite: mapaCabelo(p.mapa).limite } : null,
    crista: estilo === 'moicano', fios: p ? p.fios : 'fios',
  };
  const chave = `rosto:${JSON.stringify(r)}:${estilo}:${corte}:${comFaixa ? 1 : 0}`;
  return pegarRosto(chave, r, v.pele);
}

// Rostos em uso (como as camisas): cada um tem textura própria; os que ficam sem uso esperam um pouco
// (até GUARDAR_ROSTOS) antes de sair da memória do celular
const GUARDAR_ROSTOS = 8;
const rostos = new Map();
const rostosGuardados = [];
function pegarRosto(chave, r, corPele) {
  let item = rostos.get(chave);
  if (!item) {
    const mapa = temDocumento ? texturaRosto(r) : null;
    const criar = (duplo) => new THREE.MeshPhongMaterial({
      color: new THREE.Color(mapa ? '#ffffff' : corPele), map: mapa, vertexColors: true, shininess: 14,
      specular: new THREE.Color(0x1c1c1c), side: duplo ? THREE.DoubleSide : THREE.FrontSide,
    });
    item = { chave, mapa, frente: criar(false), duplo: criar(true), usos: 0 };
    rostos.set(chave, item);
  }
  const i = rostosGuardados.indexOf(item);
  if (i >= 0) rostosGuardados.splice(i, 1);
  item.usos++;
  return item;
}
function soltarRosto(item) {
  item.usos--;
  if (item.usos > 0 || rostos.get(item.chave) !== item) return;
  rostosGuardados.push(item);
  while (rostosGuardados.length > GUARDAR_ROSTOS) {
    const velho = rostosGuardados.shift();
    if (velho.mapa) velho.mapa.dispose();
    velho.frente.dispose();
    velho.duplo.dispose();
    rostos.delete(velho.chave);
  }
}

// Cria um boneco. visual: a aparência (veja js/elenco.js). uniforme: o do elenco ou um dos UNIFORMES.
// Campos opcionais do visual, além dos do elenco:
//   cabelo.corte: variação do corte ('curto': 'frente' | 'lado' | 'arrepiado'; 'medio': 'franja' | 'repartido');
//                 sem ele, cada jogador ganha uma variação fixa
//   cabelo.comprimento: 'longo' | 'curto' (no 'cacheado'; cacheado com faixa já vira o comprido do Bruxo)
//   cabelo.estilo também aceita 'cacheadoLongo' (cachos até a nuca e os ombros)
//   olhos: cor da íris (padrão castanho-escuro); sobrancelha: cor das sobrancelhas
// Devolve { grupo, aplicarPose(pose), altura, alturaQuadril, juntas, pontoNoGrupo, alcancar, dispose() }.
export function criarPersonagem({ visual = {}, uniforme, numero, nome } = {}) {
  const v = { ...VISUAL_PADRAO, ...visual, cabelo: { ...VISUAL_PADRAO.cabelo, ...(visual.cabelo || {}) } };
  const goleiro = !!v.goleiro;
  const uni = normalizarUniforme(uniforme || (goleiro ? UNIFORMES.goleiroLendas : UNIFORMES.lendas));
  const altura = v.altura || 1.8;
  const escala = altura / ALTURA_REF;
  const largura = LARGURA_PORTE[v.porte] ?? 1;
  const mand = MANDIBULA_PORTE[v.porte] ?? 0.5;
  const coxasGrossas = v.coxas === 'grossas';

  const grupo = new THREE.Group();
  grupo.name = nome ? `jogador ${nome}` : 'jogador';
  // Quem é baixo não fica proporcionalmente fino: a largura acompanha só a raiz da altura
  const corpo = new THREE.Group();
  corpo.scale.set(Math.sqrt(escala), escala, Math.sqrt(escala));
  grupo.add(corpo);

  const pele = matCor(v.pele);
  const camisa = pegarCamisa(uni, numero, nome);
  const chaveUni = JSON.stringify({ ...uni, luvas: null });
  const matManga = matTextura(`manga:${chaveUni}:${goleiro ? 1 : 0}`, () => texturaManga(uni, true, goleiro), { corSemDocumento: uni.camisa });
  const matMangaLisa = matTextura(`mangaLisa:${chaveUni}`, () => texturaManga(uni, false, true), { corSemDocumento: uni.camisa });
  const matMeiao = matTextura(`meiao:${chaveUni}`, () => texturaMeiao(uni), { corSemDocumento: uni.meiao });
  const matCalcao = matCor(uni.calcao);
  const matChuteira = matTextura(`chuteira:${v.chuteira}`, () => texturaChuteira(v.chuteira), { brilho: 60, corSemDocumento: v.chuteira });
  const matLuva = matCor(uni.luvas || '#f2f2f2', { brilho: 8 });

  // --- Esqueleto ---
  const quadril = pivo(corpo, 0, QUADRIL_Y, 0);
  const tronco = pivo(quadril, 0, CINTURA, 0);
  const cabeca = pivo(tronco, 0, PESCOCO, 0, 'YXZ');
  const ombroX = OMBRO_X * (0.5 + 0.5 * largura);
  const juntas = { quadril, tronco, cabeca };

  // --- Tronco e bacia ---
  const mCamisa = malha(tronco, camisaBase.geometria, camisa.material, 'camisa');
  mCamisa.scale.set(largura, 1, 0.5 + 0.5 * largura);
  const mCalcao = malha(quadril, geo('calcao', geoCalcao), matCalcao, 'calcao');
  mCalcao.scale.set(largura, 1, 0.5 + 0.5 * largura);

  // --- Braços (o direito é o esquerdo espelhado) ---
  const grossuraBraco = 0.55 + 0.45 * largura;
  const tuboBraco = (chave, aneis, seg) => geo(chave, () => tubo(aneis, seg, {
    cor: (x, y, z, u, j) => corBraco(x, y, z, u, j, aneis.length),
  }).geometria);
  for (const lado of ['E', 'D']) {
    const s = lado === 'E' ? 1 : -1; // a esquerda do jogador fica em +x
    const ombro = pivo(tronco, s * ombroX, OMBRO_Y, 0);
    const cotovelo = pivo(ombro, 0, -BRACO, 0);
    const pecas = [];
    pecas.push(malha(ombro, goleiro ? tuboBraco('mangaLonga', ANEIS_MANGA_LONGA, 8) : tuboBraco('manga', ANEIS_MANGA, 8),
      goleiro ? matMangaLisa : matManga, 'manga'));
    if (!goleiro) pecas.push(malha(ombro, tuboBraco('braco', ANEIS_BRACO, 8), pele, 'braco'));
    pecas.push(malha(cotovelo, goleiro ? tuboBraco('antebracoManga', ANEIS_ANTEBRACO_MANGA, 8) : tuboBraco('antebraco', ANEIS_ANTEBRACO, 8),
      goleiro ? matManga : pele, 'antebraco'));
    for (const m of pecas) m.scale.set(s * grossuraBraco, 1, grossuraBraco);
    const punho = pivo(cotovelo, 0, -ANTEBRACO, 0);
    malha(punho, goleiro ? geo('luva', () => geoMao(true)) : geo('mao', () => geoMao(false)), goleiro ? matLuva : pele, 'mao');
    if (s < 0) punho.scale.x = -1; // mão direita espelhada (dedão para a frente, palma para dentro)
    juntas[`ombro${lado}`] = ombro;
    juntas[`cotovelo${lado}`] = cotovelo;
    juntas[`punho${lado}`] = punho;
  }

  // --- Pernas ---
  const kc = coxasGrossas ? 1.2 : 1;
  const kp = coxasGrossas ? 1.1 : 1;
  for (const lado of ['E', 'D']) {
    const s = lado === 'E' ? 1 : -1;
    const perna = pivo(quadril, s * QUADRIL_X, QUADRIL_JUNTA_Y, 0);
    const joelho = pivo(perna, 0, -COXA, 0);
    const tornozelo = pivo(joelho, 0, -CANELA, 0);
    const calcaoPerna = malha(perna, geo('pernaCalcao', geoPernaCalcao), matCalcao, 'pernaCalcao');
    const kl = 0.9 + 0.1 * largura;
    calcaoPerna.scale.set(s * (kl + (kc - 1) * 0.5), 1, kl + (kc - 1) * 0.45);
    const coxa = malha(perna, geo('coxa', () => tubo(ANEIS_COXA, 12, {
      cor: (x, y, z, u, j) => 1 - 0.12 * Math.max(0, -x / 0.07) - 0.15 * suave((y + 0.13) / 0.1),
    }).geometria), pele, 'coxa');
    coxa.scale.set(s * kc * kl, 1, kc * 0.97 * kl);
    const canela = malha(joelho, geo('joelho', () => tubo(ANEIS_JOELHO, 8, {
      cor: (x, y) => 1 - 0.08 * sino(y + 0.01, 0.03),
    }).geometria), pele, 'canela');
    canela.scale.set(s * kp, 1, kp);
    const meiao = malha(joelho, meiaoBase.geometria, matMeiao, 'meiao');
    meiao.scale.set(s * kp, 1, kp);
    const chuteira = malha(tornozelo, geo('chuteira', geoChuteira), matChuteira, 'chuteira');
    chuteira.scale.x = s;
    juntas[`perna${lado}`] = perna;
    juntas[`joelho${lado}`] = joelho;
    juntas[`tornozelo${lado}`] = tornozelo;
  }

  // --- Cabeça, rosto e cabelo ---
  const estilo = estiloEfetivo(v);
  const corte = corteDoCabelo({ ...v, cabelo: { ...v.cabelo, estilo } });
  const comFaixa = !!v.faixa && estilo !== 'careca' && estilo !== 'raspado';
  const rosto = matRosto(v, estilo, corte, comFaixa);
  malha(cabeca, geoCabeca(mand, v.barba), rosto.frente, 'cabeca');
  const corCabelo = v.cabelo.cor || '#2a1d14';
  for (const parte of geoCabelo(estilo, corte, comFaixa)) {
    const material = parte.cachos
      ? matCor(corMisturada(corCabelo, '#ffffff', 0.04), { brilho: 14, mapa: texturaCachos(), chaveMapa: 'cachos' })
      : rosto.duplo;
    malha(cabeca, parte.geometria, material, 'cabelo');
  }
  if (comFaixa) {
    const folga = FAIXA_FOLGA[estilo] ?? { frente: 0.004, tras: 0.012 };
    malha(cabeca, geo(`faixa:${estilo}`, () => geoFaixa(folga)), matCor(v.faixa, { duplo: true }), 'faixa');
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

  let descartado = false;
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
    // Pode ser chamado mais de uma vez: a camisa compartilhada só é solta na primeira
    dispose() {
      if (grupo.parent) grupo.parent.remove(grupo);
      if (descartado) return;
      descartado = true;
      soltarCamisa(camisa);
      soltarRosto(rosto);
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

// Jeitos de esperar atrás da bola (js/elenco.js, cobranca.postura): ajustes por cima da pose normal
const POSTURAS = {
  normal: {},
  calmo: { tronco: { frente: 0.04 }, bracoE: { lado: 0.12, cotovelo: 0.2 }, bracoD: { lado: 0.12, cotovelo: 0.2 }, agachar: 0.03 },
  concentrado: { tronco: { frente: 0.16 }, cabeca: { frente: 0.05 }, agachar: 0.08 },
  ereto: { tronco: { frente: -0.02 }, cabeca: { frente: -0.16 }, pernaE: { frente: 0.04 }, pernaD: { frente: -0.06 }, agachar: 0.01 },
  curvado: { tronco: { frente: 0.32 }, cabeca: { frente: 0.1 }, bracoE: { frente: 0.25, cotovelo: 0.6 }, bracoD: { frente: 0.2, cotovelo: 0.55 }, agachar: 0.1 },
  agachado: {
    tronco: { frente: 0.28 }, cabeca: { frente: 0 }, pernaE: { frente: 0.3, joelho: 0.6 }, pernaD: { frente: -0.1, joelho: 0.55 },
    bracoE: { frente: 0.3, lado: 0.3, cotovelo: 0.9 }, bracoD: { frente: 0.3, lado: 0.3, cotovelo: 0.9 }, agachar: 0.22,
  },
  // Pernas bem abertas, peito estufado (o agachar extra compensa as pernas abertas, para os pés ficarem no chão)
  pernasAbertas: {
    tronco: { frente: -0.02 }, cabeca: { frente: -0.1 }, pernaE: { frente: 0, lado: 0.4, joelho: 0.06 }, pernaD: { frente: 0, lado: 0.4, joelho: 0.06 },
    bracoE: { frente: 0.02, lado: 0.3, cotovelo: 0.25 }, bracoD: { frente: 0.02, lado: 0.3, cotovelo: 0.25 }, agachar: 0.3,
  },
  bracosAbertos: { tronco: { frente: 0.08 }, bracoE: { frente: -0.1, lado: 0.55, cotovelo: 0.3 }, bracoD: { frente: -0.1, lado: 0.55, cotovelo: 0.3 } },
  // De lado para o gol: o corpo e a cabeça giram para olhar o gol por cima do ombro
  lateral: { tronco: { frente: 0.06, giro: 0.3 }, cabeca: { giro: 0.4 }, bracoE: { lado: 0.15, cotovelo: 0.3 }, bracoD: { lado: 0.15, cotovelo: 0.3 }, pernaE: { frente: 0.05 }, pernaD: { frente: -0.05 }, agachar: 0.03 },
};

// Cobrador parado atrás da bola, concentrado, esperando para correr. pe: 'D' ou 'E' (perna do chute);
// postura: um dos nomes de POSTURAS (o jeito de cada lenda).
export function poseCobradorPronto(t = 0, pe = 'D', postura = 'normal') {
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
  const extra = POSTURAS[postura] || POSTURAS.normal;
  for (const [parte, valor] of Object.entries(extra)) {
    if (typeof valor === 'number') p[parte] = valor + (parte === 'agachar' ? 0.01 * respira : 0);
    else p[parte] = { ...p[parte], ...valor };
  }
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
// braco: 'aberto' abre o braço de equilíbrio (o contrário da perna do chute) durante o chute
export function poseChute(progresso = 0, pe = 'D', braco = 'normal') {
  let p = porChaves(CHAVES_CHUTE, limitar(progresso, 0, 1));
  if (braco === 'aberto' && progresso > 0.2) {
    const k = limitar((progresso - 0.2) / 0.2, 0, 1);
    const b = p.bracoE;
    p = { ...p, bracoE: { frente: b.frente - 0.15 * k, lado: Math.min(1.5, b.lado + 0.5 * k), cotovelo: b.cotovelo * (1 - 0.6 * k) } };
  }
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
  let usadas = 0;
  for (const item of camisas.values()) if (item.usos > 0) usadas++;
  let rostosEmUso = 0;
  for (const item of rostos.values()) if (item.usos > 0) rostosEmUso++;
  return {
    geometrias: cacheGeo.size, materiais: cacheMat.size, texturas: cacheTex.size, camisas: camisas.size,
    camisasEmUso: usadas, camisasGuardadas: guardadas.length, rostos: rostos.size, rostosEmUso, rostosGuardados: rostosGuardados.length,
  };
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
  { pele: '#c68e62', cabelo: { estilo: 'curto', cor: '#1c1410', corte: 'arrepiado' }, barba: 'cavanhaque', corBarba: '#1c1410', chuteira: '#111111' },
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
  postura: 'normal', // jeito de esperar atrás da bola (POSTURAS em poseCobradorPronto)
  braco: 'normal',   // 'aberto': braço de equilíbrio aberto no chute
  giroCorpo: 0.45,   // no contato, quanto do ângulo da corrida o corpo ainda guarda (0 = de frente para o gol; 1 = na linha da corrida)
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
  // No contato o corpo não fica de frente para o gol: guarda parte do ângulo da corrida, e o pé pega a
  // bola meio de lado (chute com a parte de dentro do pé, como nos jogos de PS2). A bola vai para yawChute
  // do mesmo jeito; a geometria do pé de apoio é feita com o corpo nesse ângulo, então o pé chega na bola.
  const yawContato = yawChute - lado * c.angulo * GRAUS * limitar(c.giroCorpo ?? 0, 0, 1);
  const girar = (p, yaw) => new THREE.Vector3(
    p.x * Math.cos(yaw) + p.z * Math.sin(yaw), p.y, -p.x * Math.sin(yaw) + p.z * Math.cos(yaw));

  // Pé de apoio: onde precisa pisar para o peito do pé chegar na bola no contato
  const noContato = pesDoChute(personagem, TEMPO_CONTATO, pe);
  const raioBola = cfg.raioBola ?? 0.11;
  const bolaLocal = new THREE.Vector3(noContato.chute.x, 0, noContato.chute.z + raioBola + 0.02);
  const apoioMundo = new THREE.Vector3(bola.x, 0, bola.z).add(girar(noContato.apoio.clone().sub(bolaLocal), yawContato));
  apoioMundo.y = 0;
  const apoioNoPiso = pesDoChute(personagem, TEMPO_APOIO, pe).apoio;
  const grupoNoApoio = apoioMundo.clone().sub(girar(apoioNoPiso, yawContato));
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
    personagem.aplicarPose(poseCobradorPronto(t, pe, c.postura));
  }

  function atualizar(t) {
    if (t < 0) {
      parado(-t);
      return { etapa: 'parado', progresso: 0, contato: false };
    }
    if (t < c.corrida) {
      // Corrida: sai da pose de espera nos primeiros passos
      const pose = misturarPoses(poseCobradorPronto(0, pe, c.postura), poseCorrida(fase0 + c.cadencia * t), suave(t / 0.15));
      personagem.aplicarPose(pose);
      const pos = noCaminho(t);
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yawCorrida, 0);
      return { etapa: 'corrida', progresso: 0, contato: false };
    }
    const p = limitar((t - c.corrida) / c.chute, 0, 1);
    personagem.aplicarPose(poseChute(p, pe, c.braco));
    if (p < TEMPO_APOIO) {
      // Último passo: continua na linha da corrida e vira o corpo para a direção do chute
      const yaw = yawCorrida + (yawContato - yawCorrida) * suave(p / TEMPO_APOIO);
      const pos = noCaminho(t);
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yaw, 0);
    } else {
      // Pé de apoio preso no chão: o corpo gira por cima dele (sem escorregar)
      const outro = pe === 'D' ? 'E' : 'D';
      const apoio = personagem.pontoNoGrupo(personagem.juntas[`tornozelo${outro}`], 0, -0.07, 0.06);
      const pos = apoioMundo.clone().sub(girar(apoio, yawContato));
      g.position.set(pos.x, 0, pos.z);
      g.rotation.set(0, yawContato, 0);
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
