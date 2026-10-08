// Cenário: céu, luzes, gramado, estádio com torcida, placas, refletores, bandeirinhas e o gol com a rede.
// Tudo desenhado por código (canvas), sem imagens de fora.
// Feito para o celular: sem sombras em tempo real, texturas de no máximo 2048 px e cada material junta
// muitas peças numa malha só (o cenário inteiro custa umas 15 chamadas de desenho; o antigo, de 20 a 60).
// O estádio tem a luz "pintada" nas cores (não usa as luzes da cena): fica mais barato e sob controle.
// As luzes da cena iluminam só o que está no gramado (gramado, gol, bola e bonecos).
// Eixos: x = direita de quem cobra, y = para cima, z = do gol para quem cobra. Gol em z = 0.

import * as THREE from 'three';

const GRAUS = Math.PI / 180;

// ---------- Medidas ----------

// Campo de 105 x 68 m: linhas laterais em x = ±34, o nosso gol em z = 0 e o outro em z = 105
const CAMPO = { meiaLargura: 34, comprimento: 105 };

// Frente das arquibancadas: um retângulo de cantos arredondados em volta do campo
const CONTORNO = { x: 42, zPerto: -11, zLonge: 116, raio: 9 };

// Perfil da arquibancada, igual em toda a volta. d = metros para trás a partir da frente, y = altura.
const PERFIL = {
  muro: 1.3,                                                        // muro na beira do campo
  baixo: { d: 0.6, y: 1.0, fileiras: 19, fundo: 0.8, degrau: 0.42 }, // anel de baixo
  corredor: 17,                                                     // parede dos camarotes, atrás do anel de baixo
  teto: 11.9,                                                       // embaixo do anel de cima
  parapeito: { d: 12.9, topo: 13.6 },                               // frente do anel de cima (com a faixa de LED)
  alto: { d: 13.4, y: 12.6, fileiras: 22, fundo: 0.8, degrau: 0.6 }, // anel de cima (mais íngreme)
  paredeFundo: 31.2,
  cobertura: { frente: 6.5, tras: 33.5, y: 29.8, espessura: 1.6 },
};
const FIM_BAIXO = { d: PERFIL.baixo.d + PERFIL.baixo.fileiras * PERFIL.baixo.fundo, y: PERFIL.baixo.y + PERFIL.baixo.fileiras * PERFIL.baixo.degrau };
const FIM_ALTO = { d: PERFIL.alto.d + PERFIL.alto.fileiras * PERFIL.alto.fundo, y: PERFIL.alto.y + PERFIL.alto.fileiras * PERFIL.alto.degrau };

// Placas de publicidade: retângulo em volta do campo, um pouco à frente das arquibancadas
const PLACAS = { zPerto: -4.8, x: 38.6, altura: 0.9, inclinacao: 8 };

// Torres de refletores, nos quatro cantos, por fora da cobertura
const TORRES = [[-70, -40], [70, -40], [-70, 145], [70, 145]];
const ALTURA_TORRE = 50;

// Cores principais
const COR_NEBLINA = '#222e4c';

// ---------- Utilidades ----------

const BRANCO = [1, 1, 1];
const UV_QUAD = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Sorteio com semente: o estádio sai igual toda vez que o jogo abre
function criarSorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let sorteio = criarSorteio(1);
const entre = (a, b, s = sorteio) => a + (b - a) * s();
const escolher = (lista, s = sorteio) => lista[Math.floor(s() * lista.length)];
// Lista de [valor, peso]: sorteia um valor, os de peso maior saem mais
function escolherPeso(lista, s = sorteio) {
  let r = s() * lista.reduce((soma, [, peso]) => soma + peso, 0);
  for (const [valor, peso] of lista) if ((r -= peso) <= 0) return valor;
  return lista[lista.length - 1][0];
}

// Cor do CSS (#rrggbb) no formato das cores por vértice, já multiplicada pela luz
function rgb(hex, luz = 1) {
  const c = new THREE.Color(hex);
  return [c.r * luz, c.g * luz, c.b * luz];
}
const escurecer = (cor, luz) => [cor[0] * luz, cor[1] * luz, cor[2] * luz];
const suave = (t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

function normalDe(a, b, d) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

// Retângulo de cantos arredondados (o roundRect do canvas não existe em celulares mais antigos).
// raios: [alto à esquerda, alto à direita, baixo à direita, baixo à esquerda]
function retanguloRedondo(ctx, x, y, largura, altura, [r1, r2, r3, r4]) {
  ctx.beginPath();
  ctx.moveTo(x + r1, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, r2);
  ctx.arcTo(x + largura, y + altura, x, y + altura, r3);
  ctx.arcTo(x, y + altura, x, y, r4);
  ctx.arcTo(x, y, x + largura, y, r1);
  ctx.closePath();
}

function novoCanvas(largura, altura) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  return [canvas, canvas.getContext('2d')];
}

// Junta muitas peças numa geometria só: cada material vira uma chamada de desenho, não importa quantas peças tenha
class Construtor {
  constructor(tamanhoExtra = 0) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.cor = [];
    this.idx = [];
    this.tamanhoExtra = tamanhoExtra; // atributo a mais por vértice (a animação da torcida usa)
    this.extra = [];
  }

  get total() {
    return this.pos.length / 3;
  }

  vertice(p, n, uv, cor, extra) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.cor.push(cor[0], cor[1], cor[2]);
    if (this.tamanhoExtra) this.extra.push(...extra);
    return this.total - 1;
  }

  // Quadrilátero a-b-c-d dando a volta. "frente" (opcional) é para onde a face visível deve olhar:
  // se a ordem dos cantos deixaria a face virada para o outro lado, ela é invertida.
  quad(a, b, c, d, { uv = UV_QUAD, cor = BRANCO, cores = null, frente = null, extra = null } = {}) {
    let n = normalDe(a, b, d);
    let ordem = [0, 1, 2, 3];
    if (frente && n[0] * frente[0] + n[1] * frente[1] + n[2] * frente[2] < 0) {
      ordem = [0, 3, 2, 1];
      n = [-n[0], -n[1], -n[2]];
    }
    const cantos = [a, b, c, d];
    const i0 = this.total;
    for (const k of ordem) this.vertice(cantos[k], n, uv[k], cores ? cores[k] : cor, extra);
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  // Acrescenta uma geometria pronta do Three.js (cilindro, caixa...), já posicionada pela matriz
  geometria(geo, matriz, cor = BRANCO, corPorAltura = null) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const normalMatriz = new THREE.Matrix3().getNormalMatrix(matriz);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const i0 = this.total;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(matriz);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatriz).normalize();
      const c = corPorAltura ? corPorAltura(p.y) : cor;
      this.vertice([p.x, p.y, p.z], [n.x, n.y, n.z], uv ? [uv.getX(i), uv.getY(i)] : [0, 0], c, null);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(i0 + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(i0 + i);
  }

  criar() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.cor, 3));
    if (this.tamanhoExtra) g.setAttribute('aExtra', new THREE.Float32BufferAttribute(this.extra, this.tamanhoExtra));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Peça cilíndrica (trave, poste) de um ponto a outro
function tubo(construtor, de, ate, raio, cor, lados = 12, corPorAltura = null) {
  const a = new THREE.Vector3(...de);
  const b = new THREE.Vector3(...ate);
  const comprimento = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(raio, raio, comprimento, lados, 1, true);
  const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const matriz = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), giro, new THREE.Vector3(1, 1, 1));
  construtor.geometria(geo, matriz, cor, corPorAltura);
  geo.dispose();
}

// ---------- Céu, neblina e luzes ----------

// Céu de início de noite: degradê do azul quase preto lá em cima até um horizonte azulado,
// clareado pela luz da cidade e dos refletores. Feito numa esfera que acompanha a câmera.
function criarCeu(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenite: { value: new THREE.Color('#02040a') },
      meio: { value: new THREE.Color('#081126') },
      horizonte: { value: new THREE.Color('#1b2744') },
      brilho: { value: new THREE.Color('#2e3150') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirecao;
      void main() {
        vDirecao = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;            // sempre no fundo de tudo, sem ser cortado pela distância máxima da câmera
        gl_Position.z *= 0.99999;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenite;
      uniform vec3 meio;
      uniform vec3 horizonte;
      uniform vec3 brilho;
      varying vec3 vDirecao;
      void main() {
        float h = normalize(vDirecao).y;
        vec3 cor = mix(horizonte, meio, smoothstep(0.0, 0.3, h));
        cor = mix(cor, zenite, smoothstep(0.25, 0.95, h));
        cor += brilho * exp(-max(h, 0.0) * 7.0) * 0.5;
        gl_FragColor = vec4(cor, 1.0);
        #include <colorspace_fragment>
        // pontilhado bem fraco: tira os "degraus" do degradê escuro
        gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), material);
  ceu.renderOrder = -1000;
  ceu.frustumCulled = false;
  ceu.onBeforeRender = (_r, _s, camera) => {
    ceu.position.copy(camera.position);
    ceu.updateMatrixWorld();
  };
  scene.add(ceu);
  scene.background = new THREE.Color('#0a1430'); // só aparece se o céu não for desenhado
  // Neblina suave: dá profundidade às arquibancadas do fundo e diminui o "chuvisco" da torcida longe
  scene.fog = new THREE.Fog(COR_NEBLINA, 25, 230);
}

// Jogo à noite: luz dos refletores quente vindo de trás de quem cobra, e uma luz fria mais fraca do outro lado
function criarLuzes(scene) {
  scene.add(new THREE.HemisphereLight(0xc6d4ff, 0x2a4a24, 1.45));
  const principal = new THREE.DirectionalLight(0xfff0dc, 2.4);
  principal.position.set(-30, 55, 45);
  scene.add(principal);
  const contraluz = new THREE.DirectionalLight(0xbcd0ff, 0.75);
  contraluz.position.set(40, 45, -40);
  scene.add(contraluz);
}

// ---------- Gramado ----------

// A textura cobre meio campo (de trás do nosso gol até o meio de campo). A outra metade usa a mesma
// textura girada, porque o campo é simétrico: o dobro de detalhe sem gastar mais memória.
function criarGramado(scene, anisotropia) {
  const PX = 2048;
  const X0 = -CONTORNO.x;
  const X1 = CONTORNO.x;
  const Z0 = CONTORNO.zPerto;
  const Z1 = CAMPO.comprimento / 2;
  const sx = PX / (X1 - X0); // pixels por metro (em x e em z)
  const sz = PX / (Z1 - Z0);
  const [canvas, ctx] = novoCanvas(PX, PX);
  const emMetros = (c) => c.setTransform(sx, 0, 0, sz, -X0 * sx, -Z0 * sz); // desenha direto em metros
  const s = criarSorteio(7);

  // Faixas de corte da grama, paralelas à linha do gol, cada uma com um leve degradê (o sentido do corte)
  emMetros(ctx);
  const FAIXA = CAMPO.comprimento / 20;
  for (let i = -3; i < 10; i++) {
    const z = i * FAIXA;
    const clara = ((i % 2) + 2) % 2 === 0;
    const g = ctx.createLinearGradient(0, z, 0, z + FAIXA);
    g.addColorStop(0, clara ? '#4f9b3f' : '#3d8634');
    g.addColorStop(1, clara ? '#4a943b' : '#418b37');
    ctx.fillStyle = g;
    ctx.fillRect(X0, z, X1 - X0, FAIXA + 0.05);
  }

  // Manchas grandes e suaves: a grama nunca tem a cor perfeitamente igual
  for (let i = 0; i < 700; i++) {
    const x = entre(X0, X1, s);
    const z = entre(Z0, Z1, s);
    const r = entre(1.5, 6, s);
    const clara = s() < 0.5;
    const g = ctx.createRadialGradient(x, z, 0, x, z, r);
    g.addColorStop(0, clara ? 'rgba(190,210,120,0.05)' : 'rgba(10,40,10,0.045)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, z - r, r * 2, r * 2);
  }

  // Desgaste: a pequena área (onde o goleiro pisa) e a marca do pênalti ficam mais claras e amareladas
  const desgaste = (x, z, rx, rz, forca) => {
    ctx.save();
    ctx.translate(x, z);
    ctx.scale(rx, rz);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(150,145,80,${forca})`);
    g.addColorStop(0.6, `rgba(140,140,80,${forca * 0.45})`);
    g.addColorStop(1, 'rgba(140,140,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };
  desgaste(0, 1.2, 3.2, 1.8, 0.32);
  desgaste(0, 4.0, 5.5, 2.6, 0.12);
  desgaste(0, 11, 1.4, 1.2, 0.18);
  for (let i = 0; i < 40; i++) desgaste(entre(-4, 4, s), entre(0.2, 3.5, s), entre(0.2, 0.6, s), entre(0.15, 0.4, s), entre(0.08, 0.2, s));

  // Fora das linhas a grama recebe menos luz (sombra das arquibancadas e dos refletores)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const borda = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,10,0,0.32)');
    g.addColorStop(1, 'rgba(0,10,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PX, PX);
  };
  borda(0, 0, (5 * sx), 0);
  borda(PX, 0, PX - 5 * sx, 0);
  borda(0, 0, 0, 7 * sz);

  // Granulado fino da grama (padrão repetido de ruído, misturado por cima)
  const [ruido, ctxRuido] = novoCanvas(256, 256);
  const img = ctxRuido.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (s() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctxRuido.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ctx.createPattern(ruido, 'repeat');
  ctx.fillRect(0, 0, PX, PX);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Linhas do campo numa camada à parte, "gastas" com o mesmo ruído antes de ir para o gramado
  const [camada, cl] = novoCanvas(PX, PX);
  emMetros(cl);
  cl.strokeStyle = '#f4f6f2';
  cl.fillStyle = '#f4f6f2';
  cl.lineWidth = 0.12;
  const M = CAMPO.meiaLargura;
  const linha = (pontos) => {
    cl.beginPath();
    pontos.forEach(([x, z], i) => (i === 0 ? cl.moveTo(x, z) : cl.lineTo(x, z)));
    cl.stroke();
  };
  const arco = (x, z, r, de, ate) => {
    cl.beginPath();
    cl.arc(x, z, r, de, ate);
    cl.stroke();
  };
  const ponto = (x, z, r) => {
    cl.beginPath();
    cl.arc(x, z, r, 0, Math.PI * 2);
    cl.fill();
  };
  linha([[-M, 0], [M, 0]]);                                          // linha de fundo
  linha([[-M, 0], [-M, Z1]]);                                        // laterais
  linha([[M, 0], [M, Z1]]);
  linha([[-M, Z1 - 0.06], [M, Z1 - 0.06]]);                          // meio de campo (a outra metade da linha vem do espelho)
  linha([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]);   // grande área
  linha([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]);         // pequena área
  ponto(0, 11, 0.15);                                                // marca do pênalti
  const abertura = Math.acos(5.5 / 9.15);
  arco(0, 11, 9.15, Math.PI / 2 - abertura, Math.PI / 2 + abertura); // meia-lua
  arco(0, Z1, 9.15, Math.PI, Math.PI * 2);                           // metade do círculo central
  ponto(0, Z1, 0.15);
  arco(-M, 0, 1, 0, Math.PI / 2);                                    // arcos de escanteio
  arco(M, 0, 1, Math.PI / 2, Math.PI);
  // Desgaste das linhas: apaga um pouco, de forma irregular (ruído com transparência variável e falhas maiores)
  const [falhas, ctxFalhas] = novoCanvas(256, 256);
  const imgFalhas = ctxFalhas.createImageData(256, 256);
  for (let i = 0; i < imgFalhas.data.length; i += 4) imgFalhas.data[i + 3] = s() ** 2 * 255;
  ctxFalhas.putImageData(imgFalhas, 0, 0);
  cl.setTransform(1, 0, 0, 1, 0, 0);
  cl.globalCompositeOperation = 'destination-out';
  cl.globalAlpha = 0.7;
  cl.fillStyle = cl.createPattern(falhas, 'repeat');
  cl.fillRect(0, 0, PX, PX);
  cl.globalAlpha = 1;
  for (let i = 0; i < 260; i++) {
    const x = s() * PX;
    const y = s() * PX;
    const r = entre(4, 14, s);
    const g = cl.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cl.fillStyle = g;
    cl.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cl.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(camada, 0, 0);
  ctx.globalAlpha = 1;

  const mapa = new THREE.CanvasTexture(canvas);
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = anisotropia;

  // Duas metades: a de cá (textura direta) e a de lá (a mesma textura girada meia volta)
  const b = new Construtor();
  const uvPerto = (x, z) => [(x - X0) / (X1 - X0), 1 - (z - Z0) / (Z1 - Z0)];
  const uvLonge = (x, z) => uvPerto(-x, CAMPO.comprimento - z);
  const cima = [0, 1, 0];
  for (const [za, zb, uvDe] of [[Z0, Z1, uvPerto], [Z1, CAMPO.comprimento - Z0, uvLonge]]) {
    const cantos = [[X0, 0, zb], [X1, 0, zb], [X1, 0, za], [X0, 0, za]];
    b.quad(...cantos, { uv: cantos.map(([x, , z]) => uvDe(x, z)), frente: cima });
  }
  const material = new THREE.MeshLambertMaterial({ map: mapa });
  // Detalhe fino da grama perto da câmera (ruído calculado na hora, some com a distância)
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMundo;
        float acaso(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ruidoSuave(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(acaso(i), acaso(i + vec2(1.0, 0.0)), f.x), mix(acaso(i + vec2(0.0, 1.0)), acaso(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // (o smoothstep precisa da borda menor primeiro: invertido, o resultado é indefinido no Safari)
        float perto = 1.0 - smoothstep(5.0, 30.0, distance(vMundo, cameraPosition));
        if (perto > 0.0) {
          vec2 p = vMundo.xz * vec2(14.0, 6.0);
          float n = ruidoSuave(p) * 0.6 + ruidoSuave(p * 2.7) * 0.4;
          diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.24 * perto;
        }`);
  };
  material.customProgramCacheKey = () => 'gramado-fkl';
  const gramado = new THREE.Mesh(b.criar(), material);
  scene.add(gramado);
  return gramado;
}

// ---------- Contorno do estádio ----------

// Pontos da frente das arquibancadas dando a volta no campo, cada um com a direção "para fora"
// (já esticada nos cantos, para todas as camadas do perfil ficarem paralelas)
function criarContorno() {
  const { x: X, zPerto, zLonge, raio } = CONTORNO;
  const cantos = [
    { cx: X - raio, cz: zPerto + raio, de: -90 },
    { cx: X - raio, cz: zLonge - raio, de: 0 },
    { cx: -(X - raio), cz: zLonge - raio, de: 90 },
    { cx: -(X - raio), cz: zPerto + raio, de: 180 },
  ];
  const pontos = [];
  for (const c of cantos) {
    for (let k = 0; k <= 6; k++) {
      const a = (c.de + k * 15) * GRAUS;
      // depois do último ponto de cada canto vem um trecho reto (onde ficam as escadas)
      pontos.push({ x: c.cx + raio * Math.cos(a), z: c.cz + raio * Math.sin(a), reto: k === 6 });
    }
  }
  const n = pontos.length;
  const centro = { x: 0, z: (zPerto + zLonge) / 2 };
  const normal = (u, v) => {
    const dx = v.x - u.x;
    const dz = v.z - u.z;
    const l = Math.hypot(dx, dz);
    let nx = dz / l;
    let nz = -dx / l;
    if (nx * ((u.x + v.x) / 2 - centro.x) + nz * ((u.z + v.z) / 2 - centro.z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return [nx, nz];
  };
  for (let i = 0; i < n; i++) {
    const p = pontos[i];
    const n1 = normal(pontos[(i - 1 + n) % n], p);
    const n2 = normal(p, pontos[(i + 1) % n]);
    const mx = n1[0] + n2[0];
    const mz = n1[1] + n2[1];
    const l = Math.hypot(mx, mz);
    const esticar = 1 / ((mx / l) * n1[0] + (mz / l) * n1[1]);
    p.fx = (mx / l) * esticar;
    p.fz = (mz / l) * esticar;
  }
  return pontos;
}

// Ponto do contorno i, recuado d metros para fora
function noContorno(contorno, i, d) {
  const p = contorno[i % contorno.length];
  return [p.x + p.fx * d, p.z + p.fz * d];
}

// Distância percorrida ao longo do contorno (recuado d metros) até cada ponto
function percurso(contorno, d) {
  const s = [0];
  for (let i = 0; i < contorno.length; i++) {
    const [x0, z0] = noContorno(contorno, i, d);
    const [x1, z1] = noContorno(contorno, i + 1, d);
    s.push(s[i] + Math.hypot(x1 - x0, z1 - z0));
  }
  return s;
}

// Uma faixa do perfil dando a volta no estádio, de A até B ({ d, y, cor, v }).
// A face visível é a que fica à esquerda de quem anda de A para B no desenho do perfil
// (d para a direita, y para cima). escalaU: metros por repetição da textura ao longo da volta.
// trocarUV: as listras da textura correm ao longo da volta (vigas) em vez de ao longo do perfil (degraus).
function faixaDoPerfil(construtor, contorno, A, B, escalaU = 4, trocarUV = false) {
  const sA = percurso(contorno, A.d);
  const sB = percurso(contorno, B.d);
  const nd = -(B.y - A.y);
  const ny = B.d - A.d;
  for (let i = 0; i < contorno.length; i++) {
    const p = contorno[i];
    const q = contorno[(i + 1) % contorno.length];
    const frente = [((p.fx + q.fx) / 2) * nd, ny, ((p.fz + q.fz) / 2) * nd];
    const [ax0, az0] = noContorno(contorno, i, A.d);
    const [ax1, az1] = noContorno(contorno, i + 1, A.d);
    const [bx0, bz0] = noContorno(contorno, i, B.d);
    const [bx1, bz1] = noContorno(contorno, i + 1, B.d);
    const vA = A.v ?? 0;
    const vB = B.v ?? 1;
    let uv = [[sA[i] / escalaU, vA], [sA[i + 1] / escalaU, vA], [sB[i + 1] / escalaU, vB], [sB[i] / escalaU, vB]];
    if (trocarUV) {
      // vigas: a mesma posição ao longo da volta na frente e no fundo (senão as listras entortam)
      const s0 = (sA[i] + sB[i]) / 2 / escalaU;
      const s1 = (sA[i + 1] + sB[i + 1]) / 2 / escalaU;
      uv = [[vA, s0], [vA, s1], [vB, s1], [vB, s0]];
    }
    construtor.quad([ax0, A.y, az0], [ax1, A.y, az1], [bx1, B.y, bz1], [bx0, B.y, bz0], {
      uv,
      cores: [A.cor, A.cor, B.cor, B.cor],
      frente,
    });
  }
}

// Pedaços de um trecho do contorno numa profundidade, pulando as escadas nos trechos retos.
// Devolve [t0, t1] (0 a 1 ao longo do trecho) de cada pedaço com mais ou menos "tamanho" metros.
function pedacosDoTrecho(contorno, i, d, tamanho, larguraEscada) {
  const [x0, z0] = noContorno(contorno, i, d);
  const [x1, z1] = noContorno(contorno, i + 1, d);
  const comprimento = Math.hypot(x1 - x0, z1 - z0);
  const intervalos = [];
  if (contorno[i].reto) {
    // escadas a cada ~13 m, sempre em número par: nenhuma cai bem atrás do meio do gol
    const escadas = 2 * Math.max(1, Math.round(comprimento / 26));
    const meia = larguraEscada / 2 / comprimento;
    let t = 0;
    for (let k = 0; k < escadas; k++) {
      const centro = (k + 0.5) / escadas;
      intervalos.push([t, centro - meia]);
      t = centro + meia;
    }
    intervalos.push([t, 1]);
  } else {
    intervalos.push([0, 1]);
  }
  const pedacos = [];
  for (const [a, b] of intervalos) {
    const n = Math.max(1, Math.round(((b - a) * comprimento) / tamanho));
    for (let k = 0; k < n; k++) pedacos.push([a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n]);
  }
  return { pedacos, comprimento, escadas: contorno[i].reto ? intervalos.slice(0, -1).map(([, fim], k) => [fim, intervalos[k + 1][0]]) : [] };
}

// ---------- Torcida ----------

// Torcidas: a da casa (rubro-negra) atrás do gol e na lateral esquerda; misturada na direita e lá no fundo;
// e um canto com os visitantes (azul-celeste e branco).
const TORCIDAS = {
  casa: {
    fundo: '#1b0d10', cadeira: '#4a1217', vazio: 0.03,
    camisas: [['#a91f28', 40], ['#82161d', 12], ['#151517', 36], ['#dcdcdc', 4], ['#36363c', 8]],
    enfeites: [['#c4232d', '#141414'], ['#141414', '#c4232d'], ['#c4232d', '#f2f2f2']],
    bones: ['#b8212b', '#151515'],
    faixas: [0, 1, 2], festa: 3,
  },
  neutro: {
    fundo: '#14161b', cadeira: '#2c3038', vazio: 0.07,
    camisas: [['#a91f28', 12], ['#161618', 22], ['#26365a', 13], ['#4f5763', 14], ['#c9ccd1', 9], ['#3d5a7d', 9],
      ['#2f5b46', 5], ['#a88b38', 4], ['#5e4470', 3], ['#b55c2b', 3], ['#7d828a', 6]],
    enfeites: [['#c4232d', '#141414'], ['#f2f2f2', '#c4232d']],
    bones: ['#151515', '#26365a', '#b8212b', '#d5d8dc'],
    faixas: [6, 7, 8], festa: 3,
  },
  visitante: {
    fundo: '#10151e', cadeira: '#283246', vazio: 0.08,
    camisas: [['#64a2da', 46], ['#e9eef4', 30], ['#1d2c4c', 24]],
    enfeites: [['#64a2da', '#ffffff'], ['#ffffff', '#64a2da']],
    bones: ['#64a2da', '#1d2c4c'],
    faixas: [12, 13], festa: 2,
  },
};
const PELES = [['#e8c0a0', 4], ['#d9a77f', 5], ['#c08a60', 5], ['#9a6440', 4], ['#704428', 3], ['#5a3520', 2]];
const CABELOS = [['#1a1410', 10], ['#2e2018', 6], ['#4a3424', 3], ['#8a6a40', 1], ['#d8c080', 1], ['#9a9a9a', 1]];

// Folha de torcedores: 16 faixas de 64 px de altura; cada faixa é uma fileira de gente (1 m de altura,
// 16 m de comprimento). Cada fileira tem duas versões: normal e comemorando (braços para cima, cachecóis).
const FAIXAS_TORCIDA = 16;
const METROS_FAIXA = 16;

function pintarTorcida() {
  const [canvas, ctx] = novoCanvas(1024, 1024);
  const H = 64;
  for (const torcida of Object.values(TORCIDAS)) {
    for (const faixa of torcida.faixas) {
      // Sorteia as pessoas uma vez e desenha duas vezes: as mesmas pessoas, paradas e comemorando
      const s = criarSorteio(1000 + faixa * 17);
      const pessoas = [];
      for (let x = s() * 12; x < 1024 + 20; x += entre(27, 36, s)) {
        pessoas.push({
          x, vazio: s() < torcida.vazio,
          largura: entre(19, 26, s), topo: entre(17, 25, s),
          camisa: escolherPeso(torcida.camisas, s), camisaTras: escolherPeso(torcida.camisas, s),
          pele: escolherPeso(PELES, s), cabelo: escolherPeso(CABELOS, s),
          bone: s() < 0.18 ? escolher(torcida.bones, s) : null,
          cachecol: s() < 0.3 ? escolher(torcida.enfeites, s) : null,
          bandeira: s() < 0.04 ? escolher(torcida.enfeites, s) : null,
          bracos: [entre(2, 7, s), entre(-21, -15, s), entre(2, 7, s), entre(-21, -15, s)],
          cabeca: entre(5.8, 7, s),
        });
      }
      for (const comemorando of [false, true]) {
        const y0 = (faixa + (comemorando ? torcida.festa : 0)) * H;
        pintarFileira(ctx, y0, H, torcida, pessoas, comemorando);
      }
    }
  }
  return canvas;
}

function pintarFileira(ctx, y0, H, torcida, pessoas, comemorando) {
  // Nada sai da faixa (braços e bandeiras não invadem a fileira de cima na folha)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, 1024, H);
  ctx.clip();
  // Fundo: encosto das cadeiras e a sombra de quem está na frente
  const g = ctx.createLinearGradient(0, y0, 0, y0 + H);
  g.addColorStop(0, torcida.fundo);
  g.addColorStop(1, '#07080a');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, 1024, H);
  ctx.fillStyle = torcida.cadeira;
  for (let x = 4; x < 1024; x += 31) ctx.fillRect(x, y0 + 34, 22, 14);
  // No alto da faixa, atrás das cabeças, aparecem os corpos da fileira de trás (mais escuros):
  // assim a arquibancada fica cheia, sem uma listra escura entre uma fileira e outra
  for (const p of pessoas) {
    if (p.vazio) continue;
    ctx.fillStyle = p.camisaTras;
    ctx.globalAlpha = 0.5;
    retanguloRedondo(ctx, p.x + 15 - p.largura / 2, y0, p.largura + 2, p.topo + 6, [0, 0, 6, 6]);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.lineCap = 'round';
  for (const p of pessoas) {
    if (p.vazio) continue;
    const topo = y0 + p.topo;
    const meia = p.largura / 2;
    // Braços para cima (só comemorando), atrás da cabeça
    const maos = [];
    if (comemorando) {
      for (const lado of [-1, 1]) {
        const [abre, sobe] = lado < 0 ? p.bracos.slice(0, 2) : p.bracos.slice(2, 4);
        const ombro = [p.x + lado * (meia - 3), topo + 4];
        const mao = [p.x + lado * (meia + abre), topo + sobe];
        ctx.strokeStyle = p.camisa;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(...ombro);
        ctx.lineTo(...mao);
        ctx.stroke();
        maos.push(mao);
      }
      if (p.cachecol) {
        // cachecol esticado entre as mãos, listrado
        const [a, b] = maos;
        const y = Math.min(a[1], b[1]) - 1;
        ctx.fillStyle = p.cachecol[0];
        ctx.fillRect(a[0], y - 3, b[0] - a[0], 6);
        ctx.fillStyle = p.cachecol[1];
        for (let x = a[0] + 3; x < b[0] - 2; x += 7) ctx.fillRect(x, y - 3, 3, 6);
      }
      if (p.bandeira) {
        const [, b] = maos;
        ctx.fillStyle = p.bandeira[0];
        ctx.fillRect(b[0], b[1] - 16, 22, 14);
        ctx.fillStyle = p.bandeira[1];
        ctx.fillRect(b[0], b[1] - 11, 22, 4);
      }
      for (const m of maos) {
        ctx.fillStyle = p.pele;
        ctx.beginPath();
        ctx.arc(m[0], m[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.cachecol) {
      // cachecol no pescoço
      ctx.fillStyle = p.cachecol[0];
      ctx.fillRect(p.x - meia + 4, topo + 1, p.largura - 8, 4);
    }
    // Tronco com ombros arredondados
    ctx.fillStyle = p.camisa;
    retanguloRedondo(ctx, p.x - meia, topo, p.largura, y0 + H - topo + 2, [8, 8, 2, 2]);
    ctx.fill();
    if (!comemorando && p.cachecol) {
      ctx.fillStyle = p.cachecol[1];
      ctx.fillRect(p.x - 2, topo + 3, 4, 12);
    }
    // Cabeça, cabelo ou boné
    const cy = topo - p.cabeca + 1;
    ctx.fillStyle = p.pele;
    ctx.beginPath();
    ctx.arc(p.x, cy, p.cabeca, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.bone || p.cabelo;
    ctx.beginPath();
    ctx.arc(p.x, cy - 0.5, p.cabeca + 0.6, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (p.bone) ctx.fillRect(p.x - p.cabeca - 1, cy - 1.5, p.cabeca * 2 + 2, 2);
  }
  // Sombra na parte de baixo (quem está na fileira da frente tapa a luz)
  const sombra = ctx.createLinearGradient(0, y0 + 22, 0, y0 + H);
  sombra.addColorStop(0, 'rgba(0,0,0,0)');
  sombra.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = sombra;
  ctx.fillRect(0, y0 + 22, 1024, H - 22);
  ctx.restore();
}

// Onde fica cada torcida (pela posição no estádio)
function torcidaDoLugar(x, z) {
  const centroCanto = [CONTORNO.x - CONTORNO.raio, CONTORNO.zPerto + CONTORNO.raio];
  const angulo = Math.atan2(z - centroCanto[1], x - centroCanto[0]) / GRAUS;
  if (x > centroCanto[0] && z < centroCanto[1] && angulo > -72 && angulo < -28) return TORCIDAS.visitante; // um pedaço do canto direito atrás do gol
  if (z < -2) return TORCIDAS.casa;               // atrás do nosso gol
  if (x < 0 && z < 90) return TORCIDAS.casa;      // lateral esquerda
  return TORCIDAS.neutro;
}

// Fileiras de torcedores: cada pedaço de ~2,6 m é um retângulo em pé no degrau, com a imagem de
// um trecho da folha de torcedores. O pedaço inteiro pula junto na comemoração (o "bloco" pulando).
function criarTorcida(scene, contorno, anisotropia, uniformes) {
  const b = new Construtor(4);
  const ALTURA = 1.0;
  const INCLINACAO = 0.28; // m que o alto da fileira fica para trás (as pessoas aparecem melhor vistas de cima)
  const aneis = [
    { ...PERFIL.baixo, luzFrente: 0.88, luzFundo: 0.52, sombraDe: PERFIL.parapeito.d },
    { ...PERFIL.alto, luzFrente: 0.78, luzFundo: 0.5, sombraDe: PERFIL.cobertura.frente },
  ];
  for (const anel of aneis) {
    for (let f = 0; f < anel.fileiras; f++) {
      const d = anel.d + f * anel.fundo + 0.22;
      const y = anel.y + f * anel.degrau;
      // Luz da fileira: quem fica embaixo do anel de cima ou da cobertura recebe menos luz dos refletores
      const fundoDaSombra = anel.d + anel.fileiras * anel.fundo;
      const sombra = suave((d - anel.sombraDe) / Math.max(1, fundoDaSombra - anel.sombraDe));
      const luzFileira = anel.luzFrente + (anel.luzFundo - anel.luzFrente) * (0.35 * (f / anel.fileiras) + 0.65 * sombra);
      for (let i = 0; i < contorno.length; i++) {
        const { pedacos, comprimento } = pedacosDoTrecho(contorno, i, d, 2.6, 1.3);
        const [x0, z0] = noContorno(contorno, i, d);
        const [x1, z1] = noContorno(contorno, i + 1, d);
        const [xa0, za0] = noContorno(contorno, i, d + INCLINACAO);
        const [xa1, za1] = noContorno(contorno, i + 1, d + INCLINACAO);
        const p = contorno[i];
        const frente = [-p.fx, 0.4, -p.fz];
        for (const [t0, t1] of pedacos) {
          const xm = x0 + (x1 - x0) * (t0 + t1) / 2;
          const zm = z0 + (z1 - z0) * (t0 + t1) / 2;
          const torcida = torcidaDoLugar(xm, zm);
          const k = escolher(torcida.faixas);
          const largura = ((t1 - t0) * comprimento) / METROS_FAIXA;
          const u0 = entre(0, 1 - largura);
          const vCima = 1 - (k + 0.03) / FAIXAS_TORCIDA;
          const vBaixo = 1 - (k + 0.97) / FAIXAS_TORCIDA;
          const luz = luzFileira * entre(0.93, 1.04);
          // extra: fase do pulo, deslocamento até a versão comemorando, empolgação, 1 = visitante
          const extra = [sorteio(), -torcida.festa / FAIXAS_TORCIDA, sorteio(), torcida === TORCIDAS.visitante ? 1 : 0];
          const ponto = (xa, za, xb, zb, t, alt) => [xa + (xb - xa) * t, alt, za + (zb - za) * t];
          b.quad(
            ponto(x0, z0, x1, z1, t0, y - 0.05),
            ponto(x0, z0, x1, z1, t1, y - 0.05),
            ponto(xa0, za0, xa1, za1, t1, y + ALTURA - 0.05),
            ponto(xa0, za0, xa1, za1, t0, y + ALTURA - 0.05),
            { uv: [[u0, vBaixo], [u0 + largura, vBaixo], [u0 + largura, vCima], [u0, vCima]], cor: [luz, luz, luz], frente, extra },
          );
        }
      }
    }
  }

  const mapa = new THREE.CanvasTexture(pintarTorcida());
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = anisotropia;
  const material = new THREE.MeshBasicMaterial({ map: mapa, vertexColors: true });
  // Comemoração: cada bloco pula no seu ritmo, balança de lado e troca para a imagem de braços para cima
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTempo = uniformes.tempo;
    shader.uniforms.uFesta = uniformes.festa;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTempo;\nuniform float uFesta;\nattribute vec4 aExtra;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        // empolgação deste bloco: uns começam antes e param depois; os visitantes quase não comemoram
        float animo = clamp((uFesta * mix(1.0, 0.1, aExtra.w) - (1.0 - aExtra.z) * 0.35) / 0.65, 0.0, 1.0);
        float pulo = abs(sin((uTempo * 2.1 + aExtra.x) * 3.14159)) * 0.32 * smoothstep(0.3, 0.85, animo);
        float calmo = sin(uTempo * 0.8 + aExtra.x * 6.28) * 0.012;
        vec3 lado = normalize(vec3(normal.z, 0.0, -normal.x));
        transformed += lado * sin(uTempo * 1.6 + aExtra.x * 6.28) * 0.12 * animo;
        transformed.y += pulo + calmo;
        #ifdef USE_MAP
          if (animo > 0.3) vMapUv.y += aExtra.y;
        #endif`);
  };
  material.customProgramCacheKey = () => 'torcida-fkl';
  const malha = new THREE.Mesh(b.criar(), material);
  scene.add(malha);
  return malha;
}

// ---------- Estrutura do estádio ----------

// Textura de degraus (listras: piso, quina clara, espelho escuro). Repete a cada fileira.
function texturaDegraus(anisotropia) {
  const [canvas, ctx] = novoCanvas(8, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#9a9a9a');
  g.addColorStop(0.62, '#cfcfcf');
  g.addColorStop(0.66, '#ffffff');
  g.addColorStop(0.74, '#ffffff');
  g.addColorStop(0.76, '#5c5c5c');
  g.addColorStop(1, '#6c6c6c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropia;
  return t;
}

function criarEstrutura(scene, contorno, anisotropia) {
  const liso = new Construtor();   // paredes, cobertura e torres (só cor)
  const listrado = new Construtor(); // pisos com degraus e vigas embaixo da cobertura (com textura de listras)
  const P = PERFIL;
  const C = P.cobertura;

  // Muro na beira do campo, com uma faixa vermelha no alto
  faixaDoPerfil(liso, contorno, { d: 0, y: 0, cor: rgb('#1d2622') }, { d: 0, y: P.muro - 0.25, cor: rgb('#26302b') });
  faixaDoPerfil(liso, contorno, { d: 0, y: P.muro - 0.25, cor: rgb('#7a141b') }, { d: 0, y: P.muro, cor: rgb('#8f1820') });
  faixaDoPerfil(liso, contorno, { d: 0, y: P.muro, cor: rgb('#3a3f45') }, { d: P.baixo.d, y: P.muro, cor: rgb('#2c3036') });

  // Anel de baixo: piso em degraus, mais escuro no fundo (embaixo do anel de cima)
  const pisoBaixo = rgb('#3a3d44');
  faixaDoPerfil(listrado, contorno,
    { d: P.baixo.d, y: P.baixo.y, cor: pisoBaixo, v: 0 },
    { d: FIM_BAIXO.d, y: FIM_BAIXO.y, cor: escurecer(pisoBaixo, 0.55), v: P.baixo.fileiras }, 1);
  faixaDoPerfil(liso, contorno, { d: FIM_BAIXO.d, y: FIM_BAIXO.y, cor: rgb('#1d2025') }, { d: P.corredor, y: FIM_BAIXO.y, cor: rgb('#1a1c21') });
  // Parede dos camarotes (as janelas acesas são outra peça) e o teto embaixo do anel de cima,
  // que pega um pouco do verde do gramado iluminado
  faixaDoPerfil(liso, contorno, { d: P.corredor, y: FIM_BAIXO.y, cor: rgb('#14161b') }, { d: P.corredor, y: P.teto, cor: rgb('#191c22') });
  faixaDoPerfil(liso, contorno, { d: P.corredor, y: P.teto, cor: rgb('#1d2622') }, { d: P.parapeito.d, y: P.teto, cor: rgb('#2c3a31') });
  // Alto do parapeito (a frente dele é a faixa de LED)
  faixaDoPerfil(liso, contorno, { d: P.parapeito.d, y: P.parapeito.topo, cor: rgb('#3a3f47') }, { d: P.alto.d, y: P.parapeito.topo, cor: rgb('#30343b') });

  // Anel de cima
  const pisoAlto = rgb('#34373e');
  faixaDoPerfil(listrado, contorno,
    { d: P.alto.d, y: P.alto.y, cor: pisoAlto, v: 0 },
    { d: FIM_ALTO.d, y: FIM_ALTO.y, cor: escurecer(pisoAlto, 0.6), v: P.alto.fileiras }, 1);
  faixaDoPerfil(liso, contorno, { d: FIM_ALTO.d, y: FIM_ALTO.y, cor: rgb('#1b1e23') }, { d: P.paredeFundo, y: FIM_ALTO.y, cor: rgb('#1b1e23') });
  faixaDoPerfil(liso, contorno, { d: P.paredeFundo, y: FIM_ALTO.y, cor: rgb('#1d2025') }, { d: P.paredeFundo, y: C.y - 1, cor: rgb('#16181d') });
  faixaDoPerfil(liso, contorno, { d: P.paredeFundo, y: C.y - 1, cor: rgb('#16181d') }, { d: C.tras, y: C.y + 0.6, cor: rgb('#121419') });

  // Cobertura: vigas por baixo (escura, um pouco mais clara na frente, onde bate a luz), testeira clara e telhado
  faixaDoPerfil(listrado, contorno,
    { d: C.tras, y: C.y + 0.6, cor: rgb('#1c2027'), v: 0 },
    { d: C.frente, y: C.y, cor: rgb('#363c46'), v: 1 }, 6, true);
  faixaDoPerfil(liso, contorno, { d: C.frente, y: C.y, cor: rgb('#6f7782') }, { d: C.frente, y: C.y + C.espessura, cor: rgb('#9aa2ad') });
  faixaDoPerfil(liso, contorno, { d: C.frente, y: C.y + C.espessura, cor: rgb('#3a404a') }, { d: C.tras, y: C.y + C.espessura + 0.9, cor: rgb('#2a2f37') });

  // Escadas: faixas de concreto mais claro nos vãos entre os blocos de torcedores
  for (const anel of [P.baixo, P.alto]) {
    const fim = { d: anel.d + anel.fileiras * anel.fundo, y: anel.y + anel.fileiras * anel.degrau };
    for (let i = 0; i < contorno.length; i++) {
      if (!contorno[i].reto) continue;
      const { escadas } = pedacosDoTrecho(contorno, i, anel.d, 2.6, 1.3);
      const p = contorno[i];
      for (const [t0, t1] of escadas) {
        const canto = (t, d, y) => {
          const [xa, za] = noContorno(contorno, i, d);
          const [xb, zb] = noContorno(contorno, i + 1, d);
          return [xa + (xb - xa) * t, y + 0.03, za + (zb - za) * t];
        };
        const claro = rgb('#6b6f77');
        listrado.quad(canto(t0, anel.d, anel.y), canto(t1, anel.d, anel.y), canto(t1, fim.d, fim.y), canto(t0, fim.d, fim.y), {
          uv: [[0, 0], [1, 0], [1, anel.fileiras], [0, anel.fileiras]],
          cores: [claro, claro, escurecer(claro, 0.55), escurecer(claro, 0.55)],
          frente: [-p.fx, 1, -p.fz],
        });
      }
    }
  }

  // Torres dos refletores (a parte acesa é outra peça)
  const corTorre = rgb('#3c434d');
  for (const [x, z] of TORRES) {
    const geo = new THREE.CylinderGeometry(0.7, 1.3, ALTURA_TORRE, 6, 1, true);
    liso.geometria(geo, new THREE.Matrix4().makeTranslation(x, ALTURA_TORRE / 2, z), corTorre,
      (y) => escurecer(corTorre, 0.55 + 0.45 * (y / ALTURA_TORRE)));
    geo.dispose();
    const cabeca = new THREE.BoxGeometry(13, 7, 1);
    liso.geometria(cabeca, matrizCabecaTorre(x, z), rgb('#2a2f37'));
    cabeca.dispose();
  }

  const lisoMalha = new THREE.Mesh(liso.criar(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const listradoMalha = new THREE.Mesh(listrado.criar(), new THREE.MeshBasicMaterial({ vertexColors: true, map: texturaDegraus(anisotropia) }));
  scene.add(lisoMalha, listradoMalha);
}

// Cabeça da torre: virada para o meio do campo e inclinada para baixo
function matrizCabecaTorre(x, z) {
  const m = new THREE.Matrix4();
  const alvo = new THREE.Vector3(x * 0.15, 0, CAMPO.comprimento / 2 + (z - CAMPO.comprimento / 2) * 0.1);
  const pos = new THREE.Vector3(x, ALTURA_TORRE + 2, z);
  m.lookAt(pos, alvo, new THREE.Vector3(0, 1, 0)); // olha de "pos" para "alvo" (o -z local aponta para o alvo)
  m.setPosition(pos);
  return m;
}

// ---------- Luzes acesas: camarotes, refletores e faixa de LED ----------

function texturaBrilho() {
  const [canvas, ctx] = novoCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,248,230,0.85)');
  g.addColorStop(0.35, 'rgba(255,225,180,0.25)');
  g.addColorStop(0.7, 'rgba(255,210,160,0.06)');
  g.addColorStop(1, 'rgba(255,210,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Quase branca: dá para tratar como linear, e assim o WebGL 1 (celulares antigos) também faz as versões reduzidas
  return new THREE.CanvasTexture(canvas);
}

function criarLuzesAcesas(scene, contorno) {
  const b = new Construtor();
  const P = PERFIL;
  const C = P.cobertura;
  const lampadas = [];    // posições dos brilhos dos refletores
  const halos = [];       // posições dos brilhos grandes (torres)
  const luminarias = [];  // pontinhos de luz embaixo do anel de cima

  // Janelas dos camarotes: vidro escuro com a luz de dentro, mais forte em cima (as luminárias do teto).
  // Cada vão tem duas folhas de vidro; uns camarotes mais acesos, outros quase apagados.
  const s = criarSorteio(33);
  const dJanela = P.corredor - 0.05;
  const sJ = percurso(contorno, dJanela);
  const yBaixo = FIM_BAIXO.y + 0.75;
  const yCima = P.teto - 0.55;
  for (let i = 0; i < contorno.length; i++) {
    const [x0, z0] = noContorno(contorno, i, dJanela);
    const [x1, z1] = noContorno(contorno, i + 1, dJanela);
    const comprimento = sJ[i + 1] - sJ[i];
    const n = Math.max(1, Math.round(comprimento / 4));
    const p = contorno[i];
    for (let k = 0; k < n; k++) {
      const quente = s() < 0.88;
      const cor = rgb(quente ? escolher(['#ffcf94', '#ffc07a', '#ffdcaa'], s) : '#a9c8ff', entre(0.3, 0.75, s));
      const vidro = rgb('#24324a', entre(0.35, 0.6, s));
      const ponto = (t, y) => [x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t];
      const yLuz = yBaixo + (yCima - yBaixo) * 0.72;
      for (const [a, c] of [[0.06, 0.49], [0.51, 0.94]]) {
        const t0 = (k + a) / n;
        const t1 = (k + c) / n;
        const frente = [-p.fx, 0, -p.fz];
        // vidro escuro embaixo, a luz do teto do camarote em cima
        b.quad(ponto(t0, yBaixo), ponto(t1, yBaixo), ponto(t1, yLuz), ponto(t0, yLuz), {
          cores: [escurecer(vidro, 0.5), escurecer(vidro, 0.5), vidro, vidro], frente,
        });
        b.quad(ponto(t0, yLuz), ponto(t1, yLuz), ponto(t1, yCima), ponto(t0, yCima), {
          cores: [escurecer(cor, 0.25), escurecer(cor, 0.25), cor, cor], frente,
        });
      }
    }
  }

  // Luminárias embaixo do anel de cima: uma fileira de pontinhos acesos logo atrás do parapeito
  const dTeto = P.parapeito.d + 0.9;
  const sT = percurso(contorno, dTeto);
  for (let i = 0; i < contorno.length; i++) {
    const [x0, z0] = noContorno(contorno, i, dTeto);
    const [x1, z1] = noContorno(contorno, i + 1, dTeto);
    const n = Math.max(1, Math.round((sT[i + 1] - sT[i]) / 4.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      luminarias.push([x0 + (x1 - x0) * t, P.teto - 0.12, z0 + (z1 - z0) * t]);
    }
  }

  // Refletores na frente da cobertura: uma fileira de lâmpadas viradas para o campo
  const dLuz = C.frente + 0.6;
  const sL = percurso(contorno, dLuz);
  for (let i = 0; i < contorno.length; i++) {
    const [x0, z0] = noContorno(contorno, i, dLuz);
    const [x1, z1] = noContorno(contorno, i + 1, dLuz);
    const n = Math.max(1, Math.round((sL[i + 1] - sL[i]) / 7));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      lampadas.push([x0 + (x1 - x0) * t, C.y - 0.15, z0 + (z1 - z0) * t]);
    }
  }
  // Fio de luz na testeira da cobertura
  faixaDoPerfil(b, contorno, { d: C.frente - 0.02, y: C.y + 0.1, cor: rgb('#dfe8ff', 0.9) }, { d: C.frente - 0.02, y: C.y + 0.3, cor: rgb('#dfe8ff', 0.9) });

  // Torres: painel de lâmpadas na cabeça de cada uma
  for (const [x, z] of TORRES) {
    const m = matrizCabecaTorre(x, z);
    for (let linha = 0; linha < 4; linha++) {
      for (let col = 0; col < 7; col++) {
        const cx = -5.4 + col * 1.8;
        const cy = -2.4 + linha * 1.6;
        const canto = (dx, dy) => {
          const v = new THREE.Vector3(cx + dx, cy + dy, -0.55).applyMatrix4(m);
          return [v.x, v.y, v.z];
        };
        const cor = rgb('#fff6e0', 1.3);
        b.quad(canto(-0.7, -0.6), canto(0.7, -0.6), canto(0.7, 0.6), canto(-0.7, 0.6), { cor });
        const centro = new THREE.Vector3(cx, cy, -1.2).applyMatrix4(m);
        lampadas.push([centro.x, centro.y, centro.z]);
      }
    }
    const centro = new THREE.Vector3(0, 0, -3).applyMatrix4(m);
    halos.push([centro.x, centro.y, centro.z]);
  }

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(b.criar(), material));

  // Brilhos (sprites somados à imagem): lâmpadas pequenas e um halo grande em cada torre
  const brilho = texturaBrilho();
  const pontos = (lista, tamanho, cor, opacidade) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lista.flat(), 3));
    const m = new THREE.PointsMaterial({
      map: brilho, size: tamanho, color: cor, transparent: true, opacity: opacidade,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    scene.add(p);
  };
  pontos(lampadas, 8, 0xfff1d8, 0.9);
  pontos(halos, 110, 0xffe2b8, 0.45);
  pontos(luminarias, 1.3, 0xffe6c0, 0.75);
}

// ---------- Faixa de LED na frente do anel de cima ----------

// A faixa de LED e as placas mostram "GOL!" só em festa acima disto (o "uuuh" da trave não chega)
const LIMIAR_GOL = 0.6;

function pintarFaixaLed(gol) {
  const [canvas, ctx] = novoCanvas(2048, 128);
  if (gol) {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#d8222c');
    g.addColorStop(1, '#8c1018');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2048, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 italic 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) ctx.fillText('GOOOL!', 256 + i * 512, 68);
  } else {
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, 2048, 128);
    const blocos = [
      ['FREE KICK LEGENDS', '#ffffff', '#b8212b'],
      ['ELENCO LENDÁRIO', '#f7d84a', '#111318'],
      ['FOLHA SECA', '#ffffff', '#13284d'],
      ['TEMPORADA 2026', '#ffffff', '#111318'],
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 64px system-ui, sans-serif';
    blocos.forEach(([texto, cor, fundo], i) => {
      ctx.fillStyle = fundo;
      ctx.fillRect(i * 512 + 6, 10, 500, 108);
      ctx.fillStyle = cor;
      ctx.fillText(texto, i * 512 + 256, 68, 470);
    });
  }
  // Grade fininha de LED
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < 128; y += 4) ctx.fillRect(0, y, 2048, 1);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function criarFaixaLed(scene, contorno) {
  const b = new Construtor();
  const P = PERFIL;
  const branco = [0.82, 0.82, 0.82];
  faixaDoPerfil(b, contorno, { d: P.parapeito.d, y: P.teto + 0.1, cor: branco, v: 0 }, { d: P.parapeito.d, y: P.parapeito.topo, cor: branco, v: 1 }, 32);
  const normal = pintarFaixaLed(false);
  const gol = pintarFaixaLed(true);
  const material = new THREE.MeshBasicMaterial({ map: normal, vertexColors: true });
  scene.add(new THREE.Mesh(b.criar(), material));
  return {
    // comemorando: mostrar o "GOOOL!" (quem decide é o criarCenario)
    atualizar(dt, comemorando, tempo) {
      material.map = comemorando ? gol : normal;
      material.map.offset.x -= dt * (comemorando ? 0.25 : 0.03);
      // piscando no gol
      material.color.setScalar(comemorando ? (Math.sin(tempo * 18) > -0.3 ? 1 : 0.55) : 1);
    },
  };
}

// ---------- Placas de publicidade (nomes fictícios) ----------

const ANUNCIOS = [
  { texto: 'FREE KICK', texto2: 'LEGENDS', fundo: ['#0e3b25', '#072014'], cor: '#ffffff', cor2: '#f7d84a' },
  { texto: 'FOLHA SECA', fundo: ['#14294f', '#0a1631'], cor: '#f7d84a', icone: 'folha' },
  { texto: 'GOLAÇO TV', fundo: ['#b3141d', '#6e0b10'], cor: '#ffffff', icone: 'tv' },
  { texto: 'TRIVELA', fundo: ['#16181c', '#0c0d10'], cor: '#f2c12e', icone: 'curva' },
  { texto: 'NO ÂNGULO', fundo: ['#101317', '#1a1e25'], cor: '#ffffff', icone: 'angulo' },
  { texto: 'BOLA PARADA', fundo: ['#0d5a61', '#07363a'], cor: '#ffffff', icone: 'bola' },
  { texto: 'PÉ QUENTE', fundo: ['#c2501a', '#7c300d'], cor: '#fff3e0', sub: 'CHUTEIRAS' },
  { texto: 'CAMISA 10', fundo: ['#5c0f17', '#36080d'], cor: '#e8c35a', sub: 'ESPORTES' },
  { texto: 'ARQUIBANCADA', fundo: ['#3e1f5e', '#24113a'], cor: '#ffffff', sub: 'FM 98,7' },
  { texto: 'TRAVESSÃO', fundo: ['#1c3a6b', '#0f2348'], cor: '#ffffff', sub: 'SEGUROS' },
];
const LINHA_GOL = [12, 13]; // linhas da folha com o "GOL!" (duas versões para piscar)
const LINHAS_PLACAS = 16;

function pintarAnuncio(ctx, y, a) {
  const W = 1024;
  const H = 128;
  const g = ctx.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, a.fundo[0]);
  g.addColorStop(1, a.fundo[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const meio = y + H / 2 + 4;
  let xTexto = W / 2;
  // Ícones simples desenhados à mão
  ctx.save();
  if (a.icone) xTexto += 60;
  ctx.strokeStyle = a.cor;
  ctx.fillStyle = a.cor;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const ix = 230;
  if (a.icone === 'folha') {
    ctx.beginPath();
    ctx.ellipse(ix, meio, 46, 22, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = a.fundo[1];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ix - 40, meio + 22);
    ctx.lineTo(ix + 34, meio - 18);
    ctx.stroke();
  } else if (a.icone === 'tv') {
    ctx.strokeRect(ix - 44, meio - 30, 88, 58);
    ctx.beginPath();
    ctx.moveTo(ix - 18, meio - 46);
    ctx.lineTo(ix, meio - 32);
    ctx.lineTo(ix + 18, meio - 46);
    ctx.stroke();
  } else if (a.icone === 'curva') {
    ctx.beginPath();
    ctx.moveTo(ix - 50, meio + 30);
    ctx.quadraticCurveTo(ix + 10, meio - 70, ix + 50, meio + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ix + 50, meio + 14, 11, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.icone === 'angulo') {
    ctx.fillStyle = '#3ddc84';
    ctx.beginPath();
    ctx.moveTo(ix - 40, meio - 40);
    ctx.lineTo(ix + 40, meio - 40);
    ctx.lineTo(ix + 40, meio + 40);
    ctx.closePath();
    ctx.fill();
  } else if (a.icone === 'bola') {
    ctx.beginPath();
    ctx.arc(ix, meio, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.fundo[1];
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const ang = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      ctx.lineTo(ix + Math.cos(ang) * 15, meio + Math.sin(ang) * 15);
    }
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = a.cor;
  if (a.texto2) {
    ctx.font = '900 italic 74px system-ui, sans-serif';
    const largura1 = ctx.measureText(a.texto + ' ').width;
    const largura2 = ctx.measureText(a.texto2).width;
    const x0 = W / 2 - (largura1 + largura2) / 2;
    ctx.textAlign = 'left';
    ctx.fillText(a.texto + ' ', x0, meio);
    ctx.fillStyle = a.cor2;
    ctx.fillText(a.texto2, x0 + largura1, meio);
  } else if (a.sub) {
    ctx.font = '900 70px system-ui, sans-serif';
    const largura1 = ctx.measureText(a.texto).width;
    ctx.font = '700 40px system-ui, sans-serif';
    const largura2 = ctx.measureText(a.sub).width;
    const x0 = W / 2 - (largura1 + 24 + largura2) / 2;
    ctx.textAlign = 'left';
    ctx.font = '900 70px system-ui, sans-serif';
    ctx.fillText(a.texto, x0, meio);
    ctx.globalAlpha = 0.8;
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(a.sub, x0 + largura1 + 24, meio + 6);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = `900 ${a.icone === 'curva' ? 'italic ' : ''}76px system-ui, sans-serif`;
    ctx.fillText(a.texto, xTexto, meio, 700);
  }
}

function pintarPlacas() {
  const W = 1024;
  const H = 128;
  const [canvas, ctx] = novoCanvas(W, H * LINHAS_PLACAS);
  ANUNCIOS.forEach((a, i) => pintarAnuncio(ctx, i * H, a));
  // Duas versões do "GOL!" para piscar
  LINHA_GOL.forEach((linha, k) => {
    const y = linha * H;
    const g = ctx.createLinearGradient(0, y, W, y);
    g.addColorStop(0, k ? '#7a0c12' : '#d8222c');
    g.addColorStop(0.5, k ? '#a3121b' : '#f03a3a');
    g.addColorStop(1, k ? '#7a0c12' : '#d8222c');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, H);
    ctx.fillStyle = k ? '#f7d84a' : '#ffffff';
    ctx.font = '900 italic 88px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOOOL!', W / 2, y + H / 2 + 4);
  });
  // Grade fininha de LED (de perto parece painel de lâmpadas; de longe some)
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H * LINHAS_PLACAS; y += 4) ctx.fillRect(0, y, W, 1);
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H * LINHAS_PLACAS);
  return canvas;
}

function criarPlacas(scene, anisotropia) {
  const b = new Construtor();
  const { zPerto, x: X, altura, inclinacao } = PLACAS;
  const zLonge = CAMPO.comprimento - zPerto;
  const recuo = altura * Math.sin(inclinacao * GRAUS);
  const placas = []; // { inicio (primeiro vértice da frente), linha }
  const frenteEscura = [0.06, 0.06, 0.07];
  // Uma fileira de placas de "de" até "ate" (pontos no chão), com a frente virada para "dentro"
  const fileira = (de, ate, quantas, dentro, ordem) => {
    for (let k = 0; k < quantas; k++) {
      const t0 = k / quantas;
      const t1 = (k + 1) / quantas;
      const a = [de[0] + (ate[0] - de[0]) * t0, de[1] + (ate[1] - de[1]) * t0];
      const c = [de[0] + (ate[0] - de[0]) * t1, de[1] + (ate[1] - de[1]) * t1];
      const atras = [-dentro[0] * recuo, -dentro[1] * recuo];
      const fundo = [-dentro[0] * 0.12, -dentro[1] * 0.12];
      const linha = ordem[k % ordem.length];
      placas.push({ inicio: b.total, linha });
      const v0 = 1 - (linha + 1) / LINHAS_PLACAS;
      const v1 = 1 - linha / LINHAS_PLACAS;
      // frente (com o anúncio)
      b.quad([a[0], 0.02, a[1]], [c[0], 0.02, c[1]], [c[0] + atras[0], altura, c[1] + atras[1]], [a[0] + atras[0], altura, a[1] + atras[1]], {
        uv: [[0, v0], [1, v0], [1, v1], [0, v1]],
        frente: [dentro[0], 0.2, dentro[1]],
      });
      // alto e costas (escuros)
      const topoA = [a[0] + atras[0], altura, a[1] + atras[1]];
      const topoC = [c[0] + atras[0], altura, c[1] + atras[1]];
      const topoA2 = [topoA[0] + fundo[0], altura, topoA[2] + fundo[1]];
      const topoC2 = [topoC[0] + fundo[0], altura, topoC[2] + fundo[1]];
      b.quad(topoA, topoC, topoC2, topoA2, { cor: frenteEscura, frente: [0, 1, 0] });
      b.quad([a[0] + fundo[0], 0, a[1] + fundo[1]], [c[0] + fundo[0], 0, c[1] + fundo[1]], topoC2, topoA2, { cor: frenteEscura, frente: [-dentro[0], 0, -dentro[1]] });
    }
  };
  // Atrás do nosso gol: a do meio é a do próprio jogo
  fileira([-X, zPerto], [X, zPerto], 9, [0, 1], [3, 1, 2, 5, 0, 6, 4, 8, 9]);
  fileira([X, zPerto], [X, zLonge], 14, [-1, 0], [2, 7, 1, 9, 4, 0, 8, 5, 3, 6]);
  fileira([-X, zLonge], [-X, zPerto], 14, [1, 0], [1, 5, 2, 7, 0, 3, 9, 6, 8, 4]);
  fileira([X, zLonge], [-X, zLonge], 9, [0, -1], [6, 2, 8, 1, 0, 4, 7, 3, 5]);

  const mapa = new THREE.CanvasTexture(pintarPlacas());
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = anisotropia;
  const geometria = b.criar();
  const material = new THREE.MeshBasicMaterial({ map: mapa, vertexColors: true });
  scene.add(new THREE.Mesh(geometria, material));

  // Troca a imagem das placas (na comemoração todas mostram o "GOL!")
  const uv = geometria.attributes.uv;
  let mostrando = -1;
  const mostrar = (linhaGol) => {
    if (linhaGol === mostrando) return;
    mostrando = linhaGol;
    for (const placa of placas) {
      const linha = linhaGol >= 0 ? linhaGol : placa.linha;
      const v0 = 1 - (linha + 1) / LINHAS_PLACAS;
      const v1 = 1 - linha / LINHAS_PLACAS;
      // a frente pode ter sido montada na ordem invertida: acerta pelo valor de u de cada canto
      for (let k = 0; k < 4; k++) {
        const i = placa.inicio + k;
        const embaixo = geometria.attributes.position.getY(i) < 0.5;
        uv.setY(i, embaixo ? v0 : v1);
      }
    }
    uv.needsUpdate = true;
  };
  mostrar(-1);
  return {
    // comemorando: mostrar o "GOOOL!" piscando (quem decide é o criarCenario)
    atualizar(comemorando, tempo) {
      if (comemorando) mostrar(LINHA_GOL[Math.sin(tempo * 12) > 0 ? 0 : 1]);
      else mostrar(-1);
    },
  };
}

// ---------- Bandeirinhas de escanteio ----------

function criarBandeirinhas(scene, metal) {
  const cantos = [[-CAMPO.meiaLargura, 0], [CAMPO.meiaLargura, 0], [-CAMPO.meiaLargura, CAMPO.comprimento], [CAMPO.meiaLargura, CAMPO.comprimento]];
  const ALTURA = 1.5;
  const corHaste = rgb('#f1d33a');
  for (const [x, z] of cantos) {
    tubo(metal, [x, 0, z], [x, ALTURA, z], 0.022, corHaste, 6);
  }
  // Pano: uma grade pequena que ondula com o vento (atualizada a cada quadro, são poucos pontos)
  const NS = 6;
  const NT = 3;
  const b = new Construtor();
  for (let c = 0; c < cantos.length; c++) {
    const i0 = b.total;
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NS; i++) b.vertice([0, 0, 0], [0, 0, 1], [i / NS, j / NT], BRANCO, null);
    for (let j = 0; j < NT; j++) {
      for (let i = 0; i < NS; i++) {
        const a = i0 + j * (NS + 1) + i;
        b.idx.push(a, a + 1, a + NS + 2, a, a + NS + 2, a + NS + 1);
      }
    }
  }
  const geometria = b.criar();
  const material = new THREE.MeshLambertMaterial({ color: 0xffb514, side: THREE.DoubleSide });
  const malha = new THREE.Mesh(geometria, material);
  malha.frustumCulled = false;
  scene.add(malha);
  const pos = geometria.attributes.position;
  return {
    atualizar(tempo) {
      let v = 0;
      cantos.forEach(([x, z], c) => {
        const sentido = x < 0 ? -1 : 1; // o pano aponta para fora do campo
        for (let j = 0; j <= NT; j++) {
          for (let i = 0; i <= NS; i++) {
            const s = i / NS;
            const t = j / NT;
            const onda = Math.sin(tempo * 5.5 - s * 4 + c * 1.7) * 0.07 * s;
            pos.setXYZ(v++, x + sentido * s * 0.42, ALTURA - 0.02 - t * 0.3 - s * s * 0.05, z + onda + Math.sin(tempo * 3 + c) * 0.02 * s);
          }
        }
      });
      pos.needsUpdate = true;
      geometria.computeVertexNormals();
    },
  };
}

// ---------- Gol, traves e rede ----------

// Padrões dos números do cenário. O main copia para CONFIG.cenario (o que já estiver lá tem prioridade),
// e o painel de ajuste mexe neles na hora.
export const PADRAO_CENARIO = {
  festaSegura: 1.6,   // s: torcida no auge da festa
  festaDuracao: 3,    // s: tempo para a torcida acalmar depois do auge
  festaPlacas: 1.9,   // s: placas e faixa de LED mostrando "GOOOL!" (acabam antes da próxima cobrança)
  redeFirmeza: 4,     // m/s: velocidade das ondas na rede (mais = rede mais esticada: volta mais rápido)
  redeFreio: 0.9,     // quanto o balanço da rede perde por segundo (menos = balança mais vezes)
  redePeso: 1,        // peso da rede (mais = mais caída e balança mais pesada e lenta)
  redeEstufa: 1,      // quanto o fundo estufa além da bola (0 = só onde a bola foi; 1 = uns 70 cm num chute forte)
  redeEmpurrao: 0.8,  // quanto a bola "chuta" a rede quando bate nela (por fora, no teto, na lateral)
  redeBarriga: 1,     // quanto o fundo inteiro estufa junto com a bolsa (0 = só a bolsa em volta da bola)
  redeBalanco: 1,     // tranco no teto e nas laterais quando o fundo estufa (mais = o gol inteiro balança mais)
  traveTremor: 1,     // quanto o gol treme quando a bola bate na trave ou no travessão (0 = nada)
};

// Lê um número do CONFIG.cenario; se faltar ou não for número, usa o padrão
function ajuste(CONFIG, nome) {
  const v = CONFIG.cenario ? CONFIG.cenario[nome] : undefined;
  return Number.isFinite(v) ? v : PADRAO_CENARIO[nome];
}
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// Divisões de cada pano da rede do nosso gol (pontos = divisões + 1 em cada direção): 1.402 pontos no total
const DIVISOES = { fundo: [40, 13], teto: [40, 11], lateral: [11, 13] };
const CONE = 0.9;          // inclinação da "bolsa" em volta da bola (mais = bolsa mais estreita e funda)
const ESTUFA_MAXIMA = 0.9;  // m: a rede nunca vai para fora do gol mais que isto (a bolsa do fundo)
const ENTRA_MAXIMA = 0.5;   // m: nem para dentro do gol mais que isto (bola empurrando a rede por fora)
const SAIDA_MAXIMA = 1;      // m: trava de segurança: nenhum ponto da rede sai mais que isto do lugar
const MARGEM_TRAVESSIA = 0.03; // m: a bola cruzando o plano do pano a menos disto da borda conta como "por fora"
const PUXAO_BOLSA = 0.35;   // quanto a rede em volta é puxada para dentro da bolsa (parte do quanto o ponto afundou)
const SEGURA_BOLSA = 0.15;  // s: a bolsa fica no mais fundo por este tempo antes de ser solta
const BOLSA_LARGA = 0.7;    // o fundo inteiro estufa junto com a bolsa (parte da fundura dela, com redeBarriga = 1)
const LARGURA_BOLSA = 1.4;  // m: até onde a barriga larga vai (metade da fundura a esta distância da bola)
const TRANCO_MAXIMO = 6;    // m/s: o tranco mais forte da bola batendo na rede (por fora, no teto, na lateral)
const PUXAO_VIZINHOS = 6.6; // m/s: tranco no teto e nas laterais quando o fundo estufa (com redeBalanco = 1)
const ANCORA = 6;          // puxão fraco de cada ponto de volta para o lugar (1/s²)
const FREIO_FINO = 4;      // freio das ondinhas curtas (tira o tremido sem segurar o balanço grande)
const TREMOR_TRAVE = 0.07;  // m: quanto a trave sai do lugar no tremor mais forte (com traveTremor = 1)
const PASSO_MAXIMO = 1 / 120; // s: passo da simulação (num quadro de 1/60 s são 2 passos)

// Quanto um ponto da estrutura do nosso gol sai do lugar: tremor da bola na trave e o puxão da rede
// na estrutura de trás quando a bola estufa o fundo. A mesma conta existe em GLSL (FERRO_GLSL), para os
// ferros (desenhados pela placa de vídeo) e as bordas da rede (presas neles) andarem juntos.
// f = { amp, xh, trav, recuo }: amplitude do tremor agora (m), x da batida, 1 = travessão, puxão de trás (m)
function deslocarFerro(x, y, z, f, meia, A, P, saida, i) {
  const fy = limitar(y / A, 0, 1);
  const fz = limitar(-z / P, 0, 1);
  const g = (x - f.xh) / 2.2;
  const perto = Math.exp(-g * g);
  const frente = fy * (0.5 + 0.5 * perto) * (1 - 0.6 * fz);
  const s = limitar((x + meia) / (2 * meia), 0, 1);
  const topo = suave((y - (A - 0.4)) / 0.4);
  const lado = x < 0 ? -1 : 1;
  const xr = x / meia;
  const tras = fz * fz * fy * Math.max(0, 1 - 0.5 * xr * xr);
  saida[i] = 1.3 * f.amp * (1 - f.trav) * Math.sqrt(fy) * (1 - fz) * perto * lado - 0.3 * f.recuo * fz * fz * fy * lado * Math.abs(xr);
  saida[i + 1] = f.amp * f.trav * Math.sin(Math.PI * s) * topo - 0.35 * f.recuo * tras * fy;
  saida[i + 2] = -0.6 * f.amp * frente - f.recuo * tras;
}

const FERRO_GLSL = /* glsl */ `
  uniform vec4 uTreme; // amplitude do tremor, x da batida, quanto é travessão (0 a 1), puxão da estrutura de trás
  uniform vec4 uGol;   // meia largura, altura e profundidade do gol
  vec3 deslocarFerro(vec3 p) {
    float meia = uGol.x;
    float A = uGol.y;
    float P = uGol.z;
    float amp = uTreme.x;
    float trav = uTreme.z;
    float recuo = uTreme.w;
    float fy = clamp(p.y / A, 0.0, 1.0);
    float fz = clamp(-p.z / P, 0.0, 1.0);
    float g = (p.x - uTreme.y) / 2.2;
    float perto = exp(-g * g);
    float frente = fy * (0.5 + 0.5 * perto) * (1.0 - 0.6 * fz);
    float s = clamp((p.x + meia) / (2.0 * meia), 0.0, 1.0);
    float topo = smoothstep(A - 0.4, A, p.y);
    float lado = p.x < 0.0 ? -1.0 : 1.0;
    float xr = p.x / meia;
    float tras = fz * fz * fy * max(0.0, 1.0 - 0.5 * xr * xr);
    return vec3(
      1.3 * amp * (1.0 - trav) * sqrt(fy) * (1.0 - fz) * perto * lado - 0.3 * recuo * fz * fz * fy * lado * abs(xr),
      amp * trav * sin(PI * s) * topo - 0.35 * recuo * tras * fy,
      -0.6 * amp * frente - recuo * tras);
  }`;

// A rede do nosso gol como pano: fundo, teto e as duas laterais, cada um uma grade de pontos ligados aos
// vizinhos por molas. Cada ponto guarda quanto saiu do lugar (u) e a velocidade (v); as molas puxam cada
// ponto para a média dos vizinhos, então um empurrão vira ondas que correm pelo pano e voltam das bordas.
// As bordas ficam presas nos ferros (traves, travessão, chão e estrutura de trás) e andam junto com eles.
// A bola empurra os pontos que estão no caminho e a rede forma uma bolsa em volta dela (os fios não
// esticam sem fim): a bola nunca aparece do lado de fora. Não usa o Three.js (dá para medir no Node).
export function criarMalhaRede(CONFIG) {
  const { golLargura: L, golAltura: A, golProfundidade: P, raioTrave: R } = CONFIG;
  const meia = L / 2;
  const sen = (a) => Math.sin(Math.PI * a);

  // Cada pano: origem (canto s = 0, t = 0), eixos s e t, normal "para fora do gol", tamanho e caimento.
  // O caimento (em metros, para fora do gol) é o jeito da rede parada: o pé do fundo frouxo encostado no
  // chão, o teto cedendo no meio e as laterais um pouco estufadas.
  const paineis = [];
  let total = 0;
  const painel = (nome, [ns, nt], origem, eixoS, eixoT, normal, compS, compT, caimento, apoio) => {
    paineis.push({
      nome, ns, nt, W: ns + 1, base: total, origem, eixoS, eixoT, normal, compS, compT,
      hs: compS / ns, ht: compT / nt, caimento, apoio, lado: 0, kS: 0, kT: 0, bolsa: [0, 0], temBolsa: false, tocando: false,
      temAntes: false, bsAntes: 0, btAntes: 0, bnAntes: 0, // onde a bola estava no passo anterior (para o lado)
    });
    total += (ns + 1) * (nt + 1);
  };
  painel('fundo', DIVISOES.fundo, [-meia, 0, -P], [1, 0, 0], [0, 1, 0], [0, 0, -1], L, A,
    (s, t) => 0.1 * (1 - t) ** 3 * suave((Math.min(s, 1 - s) * L) / 0.6) + 0.035 * sen(s) * sen(t), false);
  painel('teto', DIVISOES.teto, [-meia, A, -R], [1, 0, 0], [0, 0, -1], [0, 1, 0], L, P - R,
    (s, t) => -0.065 * sen(s) * sen(t), true);
  for (const lado of [-1, 1]) {
    painel(lado < 0 ? 'esquerda' : 'direita', DIVISOES.lateral, [lado * meia, 0, -R], [0, 0, -1], [0, 1, 0], [lado, 0, 0], P - R, A,
      (s, t) => 0.05 * sen(s) * sen(t), false);
  }
  const fundo = paineis[0];

  const N = total;
  const base = new Float64Array(3 * N);    // ponto com a rede lisa (sem caimento)
  const caimento = new Float64Array(N);    // caimento de cada ponto (para fora do gol), com peso 1
  const coordS = new Float64Array(N);      // posição no pano, em metros
  const coordT = new Float64Array(N);
  const presos = [];                       // pontos das bordas (presos nos ferros)
  const indices = [];
  for (const p of paineis) {
    for (let j = 0; j <= p.nt; j++) {
      for (let k = 0; k <= p.ns; k++) {
        const i = p.base + j * p.W + k;
        coordS[i] = (k / p.ns) * p.compS;
        coordT[i] = (j / p.nt) * p.compT;
        for (let q = 0; q < 3; q++) base[3 * i + q] = p.origem[q] + p.eixoS[q] * coordS[i] + p.eixoT[q] * coordT[i];
        caimento[i] = p.caimento(k / p.ns, j / p.nt);
        if (j === 0 || k === 0 || j === p.nt || k === p.ns) presos.push(i);
        if (j < p.nt && k < p.ns) indices.push(i, i + 1, i + p.W + 1, i, i + p.W + 1, i + p.W);
      }
    }
  }

  const u = new Float64Array(3 * N);       // quanto cada ponto saiu do lugar
  const v = new Float64Array(3 * N);       // velocidade
  const acc = new Float64Array(3 * N);
  const posicoes = new Float32Array(3 * N); // para desenhar
  const normais = new Float32Array(3 * N);
  const painelDe = new Uint8Array(N);     // de qual pano é cada ponto
  paineis.forEach((p, n) => painelDe.fill(n, p.base, p.base + p.W * (p.nt + 1)));

  const estado = {
    acordada: true, quietos: 0, peso: -1, firmeza: -1,
    bola: { x: 0, y: 0, z: 0, raio: CONFIG.raioBola || 0.11, nova: false, valida: false, x0: 0, y0: 0, z0: 0, anterior: false, historico: [] },
    relogio: 0,                                       // s de jogo desde que a rede foi criada
    estufa: 1,                                        // redeEstufa deste quadro
    // bolsa do fundo: o mais fundo que já foi (e quando), onde, se a bola está nela, se já foi solta,
    // e quanto dela já virou puxão no resto do gol
    bolsaFundo: { maior: 0, tMaior: 0, x: 0, y: 0, contato: false, solta: false, puxada: 0, forcaUsada: 0 },
    empurrao: null,                                   // estufar(): bola "de mentira" no fundo da rede
    tremor: { t: 10, forca: 0, xh: 0, trav: 0 },
    recuo: { x: 0, v: 0, alvo: 0 },
    ferro: { amp: 0, xh: 0, trav: 0, recuo: 0 },      // estado atual da estrutura (vai para os ferros)
    ferroMexido: false,
  };

  // ----- Um passo da simulação (h segundos) -----
  function integrar(h, gamma) {
    let maxV = 0;
    let maxU = 0;
    for (const p of paineis) {
      const { W, ns, nt, kS, kT } = p;
      const beta = FREIO_FINO;
      for (let j = 1; j < nt; j++) {
        let i = p.base + j * W + 1;
        for (let k = 1; k < ns; k++, i++) {
          const a = 3 * i;
          const e = a - 3;
          const d = a + 3;
          const b = a - 3 * W;
          const c = a + 3 * W;
          let ui = u[a];
          let vi = v[a];
          acc[a] = kS * (u[e] + u[d] - 2 * ui) + kT * (u[b] + u[c] - 2 * ui) - ANCORA * ui
            + beta * (v[e] + v[d] + v[b] + v[c] - 4 * vi) - gamma * vi;
          ui = u[a + 1];
          vi = v[a + 1];
          acc[a + 1] = kS * (u[e + 1] + u[d + 1] - 2 * ui) + kT * (u[b + 1] + u[c + 1] - 2 * ui) - ANCORA * ui
            + beta * (v[e + 1] + v[d + 1] + v[b + 1] + v[c + 1] - 4 * vi) - gamma * vi;
          ui = u[a + 2];
          vi = v[a + 2];
          acc[a + 2] = kS * (u[e + 2] + u[d + 2] - 2 * ui) + kT * (u[b + 2] + u[c + 2] - 2 * ui) - ANCORA * ui
            + beta * (v[e + 2] + v[d + 2] + v[b + 2] + v[c + 2] - 4 * vi) - gamma * vi;
        }
      }
      for (let j = 1; j < nt; j++) {
        let a = 3 * (p.base + j * W + 1);
        for (let k = 1; k < ns; k++, a += 3) {
          const vx = (v[a] += acc[a] * h);
          const vy = (v[a + 1] += acc[a + 1] * h);
          const vz = (v[a + 2] += acc[a + 2] * h);
          const ux = (u[a] += vx * h);
          const uy = (u[a + 1] += vy * h);
          const uz = (u[a + 2] += vz * h);
          const v2 = vx * vx + vy * vy + vz * vz;
          let u2 = ux * ux + uy * uy + uz * uz;
          if (u2 > SAIDA_MAXIMA * SAIDA_MAXIMA) {
            // trava de segurança (sliders no extremo): o ponto não vai mais longe e perde metade da velocidade
            const f = SAIDA_MAXIMA / Math.sqrt(u2);
            u[a] *= f;
            u[a + 1] *= f;
            u[a + 2] *= f;
            v[a] *= 0.5;
            v[a + 1] *= 0.5;
            v[a + 2] *= 0.5;
            u2 = SAIDA_MAXIMA * SAIDA_MAXIMA;
          }
          if (v2 > maxV) maxV = v2;
          if (u2 > maxU) maxU = u2;
        }
      }
    }
    return maxV > 1.6e-5 || maxU > 9e-6; // ainda mexendo? (mais de 4 mm/s ou 3 mm fora do lugar)
  }

  // Tremor da trave (vibração rápida que some em ~0,4 s) e puxão da estrutura de trás (mola mais lenta)
  function moverFerro(h) {
    const tr = estado.tremor;
    tr.t += h;
    const f = estado.ferro;
    f.amp = tr.t < 0.6 ? tr.forca * TREMOR_TRAVE * Math.exp(-tr.t / 0.13) * Math.sin(2 * Math.PI * 9 * tr.t) : 0;
    f.xh = tr.xh;
    f.trav = tr.trav;
    const r = estado.recuo;
    const w = 2 * Math.PI * 4;
    r.v += (w * w * (r.alvo - r.x) - 2 * 0.2 * w * r.v) * h;
    r.x += r.v * h;
    f.recuo = r.x;
    const mexendo = f.amp !== 0 || Math.abs(r.x) > 2e-5 || Math.abs(r.v) > 2e-4 || r.alvo > 0;
    if (!mexendo) {
      r.x = r.v = f.recuo = 0;
      if (!estado.ferroMexido) return false;
    }
    // As bordas da rede andam junto com os ferros. A conta do deslocarFerro é uma soma de duas partes
    // (tremor × amp e puxão × recuo): cada parte fica guardada por ponto e aqui só se multiplica.
    if (campos.xh !== f.xh || campos.trav !== f.trav || campos.peso !== estado.peso) calcularCampos();
    const amp = f.amp;
    const recuo = f.recuo;
    for (let n = 0; n < presos.length; n++) {
      const a = 3 * presos[n];
      const c = 3 * n;
      u[a] = amp * campos.tremor[c] + recuo * campos.puxao[c];
      u[a + 1] = amp * campos.tremor[c + 1] + recuo * campos.puxao[c + 1];
      u[a + 2] = amp * campos.tremor[c + 2] + recuo * campos.puxao[c + 2];
    }
    estado.ferroMexido = mexendo;
    return mexendo;
  }
  // Deslocamento de cada ponto preso com tremor = 1 m (e puxão 0), e com puxão = 1 m (e tremor 0)
  const campos = { xh: NaN, trav: NaN, peso: NaN, tremor: new Float64Array(3 * presos.length), puxao: new Float64Array(3 * presos.length) };
  function calcularCampos() {
    const f = estado.ferro;
    campos.xh = f.xh;
    campos.trav = f.trav;
    campos.peso = estado.peso;
    const so = { amp: 1, xh: f.xh, trav: f.trav, recuo: 0 };
    const sp = { amp: 0, xh: f.xh, trav: f.trav, recuo: 1 };
    presos.forEach((i, n) => {
      const b = estado.peso * caimento[i];
      const p = paineis[painelDe[i]];
      const x = base[3 * i] + b * p.normal[0];
      const y = base[3 * i + 1] + b * p.normal[1];
      const z = base[3 * i + 2] + b * p.normal[2];
      deslocarFerro(x, y, z, so, meia, A, P, campos.tremor, 3 * n);
      deslocarFerro(x, y, z, sp, meia, A, P, campos.puxao, 3 * n);
    });
  }

  // A bola contra um pano. (bx, by, bz) = centro, (wx, wy, wz) = velocidade.
  // ladoForcado: -1 = a bola está do lado de dentro do gol (usado pelo estufar).
  // Devolve quanto a bola afundou o pano para fora do gol (0 se não encostou).
  function colidir(p, bx, by, bz, wx, wy, wz, raio, ladoForcado, empurrao) {
    const ox = bx - p.origem[0];
    const oy = by - p.origem[1];
    const oz = bz - p.origem[2];
    const [s0, s1, s2] = p.eixoS;
    const [t0, t1, t2] = p.eixoT;
    const [n0, n1, n2] = p.normal;
    const bs = ox * s0 + oy * s1 + oz * s2;
    const bt = ox * t0 + oy * t1 + oz * t2;
    const bn = ox * n0 + oy * n1 + oz * n2;
    let lado = ladoForcado;
    if (!lado) {
      decidirLado(p, bs, bt, bn);
      lado = p.lado;
    }
    if (lado === 0) return 0;
    const rEff = raio + 0.015;                       // a bola mais a grossura do fio
    // Bola de verdade fora do retângulo do pano (passando por cima, por trás ou pelo lado): não encosta nele
    if (!ladoForcado && (bs < -rEff || bs > p.compS + rEff || bt < -rEff || bt > p.compT + rEff)) {
      p.tocando = false;
      return 0;
    }
    const ponta = lado < 0 ? bn + rEff : bn - rEff;  // até onde a rede tem de ir (para fora do gol = +)
    const folga = lado < 0 ? ponta + 0.4 : 0.4 - ponta; // a rede balançando chega a uns 40 cm do lugar
    if (folga <= 0) return 0;
    const plato = 0.75 * Math.max(p.hs, p.ht);       // a ponta da bolsa cobre a bola mesmo entre dois pontos
    const alcance = Math.min(2.5, plato + rEff + folga / CONE);
    if (bs < -alcance || bs > p.compS + alcance || bt < -alcance || bt > p.compT + alcance) return 0;
    // Até onde a bola pode levar a rede (os fios não esticam sem fim): para fora, a bolsa mais funda;
    // para dentro, bem menos (a bola de fora quase não entra no gol)
    const limite = lado < 0 ? ESTUFA_MAXIMA : -ENTRA_MAXIMA;
    const k0 = Math.max(1, Math.floor((bs - alcance) / p.hs));
    const k1 = Math.min(p.ns - 1, Math.ceil((bs + alcance) / p.hs));
    const j0 = Math.max(1, Math.floor((bt - alcance) / p.ht));
    const j1 = Math.min(p.nt - 1, Math.ceil((bt + alcance) / p.ht));
    // No fundo, por dentro, quem estufa a rede é a bolsa (afundarFundo): a bola só empurra (sem jogar a rede longe,
    // senão o tamanho da bolsa dependeria de quantos quadros por segundo o celular faz)
    const ganho = p === fundo && lado < 0 && !ladoForcado ? (estado.estufa > 0 ? 0 : 1) : empurrao;
    const vbn = (wx * n0 + wy * n1 + wz * n2) * ganho;
    const peso = estado.peso;
    const xt = CONE * rEff;                            // onde a curva da ponta vira cone
    const ft = (xt * xt) / (2 * rEff);
    // No teto, por fora: a bola parada em cima puxa a rede até encostar nela (senão parece flutuar)
    const apoio = p.apoio && lado > 0 && bn - raio < 0.03 && wx * wx + wy * wy + wz * wz < 4;
    let tocou = false;
    for (let j = j0; j <= j1; j++) {
      let i = p.base + j * p.W + k0;
      for (let k = k0; k <= k1; k++, i++) {
        const ds = coordS[i] - bs;
        const dt = coordT[i] - bt;
        const x = Math.sqrt(ds * ds + dt * dt) - plato;
        const f = x <= 0 ? 0 : x < xt ? (x * x) / (2 * rEff) : ft + CONE * (x - xt);
        const a = 3 * i;
        const n = peso * caimento[i] + u[a] * n0 + u[a + 1] * n1 + u[a + 2] * n2;
        let corrigir = 0;
        if (lado < 0) {
          const alvo = Math.min(ponta - f, limite);
          if (n < alvo) corrigir = alvo - n;
        } else {
          const alvo = Math.max(ponta + f, limite);
          if (n > alvo) corrigir = alvo - n;
          else if (apoio && x < 0.5 * rEff) corrigir = (alvo - n) * 0.3;
        }
        if (corrigir === 0) continue;
        tocou = true;
        u[a] += corrigir * n0;
        u[a + 1] += corrigir * n1;
        u[a + 2] += corrigir * n2;
        // O ponto empurrado vai junto com a bola
        const vn = v[a] * n0 + v[a + 1] * n1 + v[a + 2] * n2;
        const dv = lado < 0 ? Math.max(0, vbn - vn) : Math.min(0, vbn - vn);
        v[a] += dv * n0;
        v[a + 1] += dv * n1;
        v[a + 2] += dv * n2;
      }
    }
    // A física segura a bola encostada no plano do teto e das laterais; a rede desenhada pode estar um
    // pouco mais para dentro (caimento). Encostar no plano já conta como toque.
    const encostou = p !== fundo && bs > 0 && bs < p.compS && bt > 0 && bt < p.compT && Math.abs(bn) < raio + 0.02;
    if (tocou) {
      // centro da última "bolsa" deste pano (a rede em volta é puxada para ela no desenho)
      p.bolsa[0] = limitar(bs, 0, p.compS);
      p.bolsa[1] = limitar(bt, 0, p.compT);
      p.temBolsa = true;
    }
    // Primeiro toque com a bola vindo forte (teto, laterais ou rede por fora): a rede em volta
    // também leva o tranco, não só os pontos embaixo da bola
    if ((tocou || encostou) && !p.tocando && !ladoForcado && !(p === fundo && lado < 0)) {
      p.bolsa[0] = limitar(bs, 0, p.compS);
      p.bolsa[1] = limitar(bt, 0, p.compT);
      p.temBolsa = true;
      chutarEmVolta(p, bs, bt, limitar(vbn * 0.6, -TRANCO_MAXIMO, TRANCO_MAXIMO), lado);
    }
    if (!ladoForcado) p.tocando = tocou || encostou;
    return lado < 0 ? Math.max(0, ponta) : 0;
  }

  // De que lado do pano a bola está (-1 = do lado de dentro do gol, 1 = de fora). A rede não deixa a bola
  // passar, então o lado só muda quando o caminho da bola cruza o plano do pano FORA do retângulo dele
  // (por cima do travessão de trás, pelo lado, pela frente). Cruzou por dentro: é a bola afundando a rede
  // (a bolsa), e o lado continua o mesmo. Assim a bola que rola do teto para trás do gol não leva a rede
  // junto, e a que estufa o fundo nunca aparece do lado de fora.
  function decidirLado(p, bs, bt, bn) {
    if (p.lado === 0) {
      p.lado = bn > 0 ? 1 : -1;
    } else if (p.temAntes && (bn > 0) !== (p.bnAntes > 0)) {
      // onde o caminho da bola (do passo anterior até agora) cruzou o plano do pano
      const f = p.bnAntes / (p.bnAntes - bn);
      const cs = p.bsAntes + (bs - p.bsAntes) * f;
      const ct = p.btAntes + (bt - p.btAntes) * f;
      const m = MARGEM_TRAVESSIA;
      const porDentro = cs > m && cs < p.compS - m && ct > m && ct < p.compT - m;
      if (!porDentro) p.lado = bn > 0 ? 1 : -1;
    }
    p.bsAntes = bs;
    p.btAntes = bt;
    p.bnAntes = bn;
    p.temAntes = true;
  }

  // Tranco espalhado em volta do ponto (s, t) do pano: velocidade "dv" (para fora do gol = +) no centro,
  // diminuindo até uns 70 cm. lado: de que lado a bola está (o tranco é para longe dela).
  function chutarEmVolta(p, cs, ct, dv, lado) {
    if (lado < 0 ? dv <= 0 : dv >= 0) return;
    const [n0, n1, n2] = p.normal;
    const R2 = 0.35 * 0.35;
    const k0 = Math.max(1, Math.floor((cs - 0.8) / p.hs));
    const k1 = Math.min(p.ns - 1, Math.ceil((cs + 0.8) / p.hs));
    const j0 = Math.max(1, Math.floor((ct - 0.8) / p.ht));
    const j1 = Math.min(p.nt - 1, Math.ceil((ct + 0.8) / p.ht));
    for (let j = j0; j <= j1; j++) {
      for (let k = k0; k <= k1; k++) {
        const i = p.base + j * p.W + k;
        const ds = coordS[i] - cs;
        const dt = coordT[i] - ct;
        const g = Math.exp(-(ds * ds + dt * dt) / R2);
        const a = 3 * i;
        const vn = v[a] * n0 + v[a + 1] * n1 + v[a + 2] * n2;
        const alvo = dv * g;
        const muda = lado < 0 ? Math.max(0, alvo - vn) : Math.min(0, alvo - vn);
        v[a] += muda * n0;
        v[a + 1] += muda * n1;
        v[a + 2] += muda * n2;
      }
    }
  }

  // O fundo da rede estufa mais do que a bola afundou: a física para a bola em uns 20 cm, mas a rede de
  // verdade é leve e voa para trás, a bola fica na boca da bolsa e a rede volta balançando. Um empurrão
  // "fantasma" no mesmo ponto vai mais fundo (com limite: chute fraco estufa pouco, chute forte uns 70 cm).
  // profundidade: quanto a bola passou da linha do fundo. Devolve a fundura da bolsa (0 = não encostou).
  function afundarFundo(x, y, profundidade, estufa) {
    const p = Math.max(0, profundidade - 0.008);
    if (p <= 0) return 0;
    const alem = Math.max(p, ESTUFA_MAXIMA * (1 - Math.exp(-7 * estufa * p / ESTUFA_MAXIMA)));
    const bolsa = estado.bolsaFundo;
    bolsa.contato = true;
    if (bolsa.solta) return alem; // já soltou: daqui em diante a bola só empurra o que está na frente dela
    if (alem > bolsa.maior) {
      bolsa.maior = alem;
      bolsa.tMaior = estado.relogio;
    }
    bolsa.x = x;
    bolsa.y = y;
    return alem;
  }

  // A bolsa fica no mais fundo por um instante (a rede "segura" a bola) e depois é solta de uma vez, como a
  // rede de verdade, que larga a bola e volta sozinha: assim ela balança bem, em vez de ser "abaixada"
  // devagar junto com a bola. Enquanto segura, o fundo inteiro acompanha a bolsa (os fios quase não esticam).
  function segurarBolsa(raio, largo) {
    const bolsa = estado.bolsaFundo;
    if (bolsa.maior <= 0 || bolsa.solta) return 0;
    const passou = estado.relogio - bolsa.tMaior;
    if (passou > SEGURA_BOLSA) {
      bolsa.solta = true;
      return 0;
    }
    const fundura = bolsa.maior * (1 - 0.1 * passou / SEGURA_BOLSA); // cede um pouco enquanto segura
    colidir(fundo, bolsa.x, bolsa.y, -P + raio - fundura, 0, 0, 0, raio, -1, 1);
    if (largo > 0) estufarLargo(bolsa.x, bolsa.y, fundura * largo);
    return fundura;
  }

  // O resto do fundo vai junto com a bolsa: uma barriga larga (some nas bordas presas), sem nunca puxar
  // um ponto de volta (só empurra para fora)
  function estufarLargo(x, y, fundura) {
    const [n0, n1, n2] = fundo.normal;
    const cs = x + meia;
    const ct = y;
    const r2 = LARGURA_BOLSA * LARGURA_BOLSA;
    for (let j = 1; j < fundo.nt; j++) {
      let i = fundo.base + j * fundo.W + 1;
      const dt = coordT[i] - ct;
      const bt = BORDA_T[j];
      for (let k = 1; k < fundo.ns; k++, i++) {
        const ds = coordS[i] - cs;
        const alvo = (fundura * bt * BORDA_S[k]) / (1 + (ds * ds + dt * dt) / r2);
        const a = 3 * i;
        const n = estado.peso * caimento[i] + u[a] * n0 + u[a + 1] * n1 + u[a + 2] * n2;
        if (n >= alvo) continue;
        const corrigir = alvo - n;
        u[a] += corrigir * n0;
        u[a + 1] += corrigir * n1;
        u[a + 2] += corrigir * n2;
      }
    }
  }
  // Quanto cada coluna e cada linha do fundo pode sair do lugar na barriga larga (0 nas bordas presas)
  const BORDA_S = Float64Array.from({ length: fundo.ns + 1 }, (_, k) => Math.sqrt(sen(k / fundo.ns)));
  const BORDA_T = Float64Array.from({ length: fundo.nt + 1 }, (_, j) => Math.sqrt(sen(j / fundo.nt)));

  // O fundo estufou de repente: o resto do gol leva o tranco. O teto é puxado para baixo (mais perto de
  // onde a bola entrou) e as laterais para dentro (mais a do lado da bola). Depois tudo volta balançando.
  function puxarVizinhos(x, forca) {
    for (const p of paineis) {
      if (p === fundo) continue;
      const [n0, n1, n2] = p.normal;
      const teto = p === paineis[1];
      // na lateral, quanto mais perto a bola entrou daquele lado, mais ele é puxado
      const perto = teto ? 1 : 0.35 + 0.65 * Math.exp(-(((meia - x * p.normal[0]) / 3.5) ** 2));
      for (let j = 1; j < p.nt; j++) {
        for (let k = 1; k < p.ns; k++) {
          const s = k / p.ns;
          const t = j / p.nt;
          let peso;
          if (teto) {
            const g = (-meia + s * L - x) / 2.5;
            peso = 0.65 * sen(s) * Math.sqrt(sen(t)) * (0.55 + 0.45 * t) * (0.5 + 0.5 * Math.exp(-g * g));
          } else {
            peso = sen(t) * Math.sqrt(sen(s)) * (0.5 + 0.5 * s) * perto;
          }
          const dv = -forca * peso;
          const a = 3 * (p.base + j * p.W + k);
          v[a] += dv * n0;
          v[a + 1] += dv * n1;
          v[a + 2] += dv * n2;
        }
      }
    }
  }

  // Os fios quase não esticam: quando o fundo vira bolsa, a rede em volta é puxada para dentro dela
  // (os losangos "correm" para a bola). Sem isso, de frente (câmera atrás do cobrador) a bolsa quase não
  // aparece, porque ela vai para longe do olho. Só muda o desenho, não a conta das molas.
  // Cada ponto anda para o centro da bolsa uma parte do quanto saiu do lugar, nunca mais que 60% da
  // distância até o centro: a malha não dobra sobre si mesma.
  function puxarParaABolsa(p) {
    const cs = p.bolsa[0];
    const ct = p.bolsa[1];
    const [n0, n1, n2] = p.normal;
    const [s0, s1, s2] = p.eixoS;
    const [t0, t1, t2] = p.eixoT;
    for (let j = 1; j < p.nt; j++) {
      let i = p.base + j * p.W + 1;
      for (let k = 1; k < p.ns; k++, i++) {
        const a = 3 * i;
        const w = Math.abs(u[a] * n0 + u[a + 1] * n1 + u[a + 2] * n2);
        if (w < 0.004) continue;
        const ds = coordS[i] - cs;
        const dt = coordT[i] - ct;
        const r = Math.sqrt(ds * ds + dt * dt);
        if (r < 1e-4) continue;
        const anda = Math.min(PUXAO_BOLSA * w, 0.5 * r) / r;
        posicoes[a] -= (ds * s0 + dt * t0) * anda;
        posicoes[a + 1] -= (ds * s1 + dt * t1) * anda;
        posicoes[a + 2] -= (ds * s2 + dt * t2) * anda;
      }
    }
  }

  // Posições e normais para desenhar
  function escrever() {
    const peso = estado.peso;
    for (const p of paineis) {
      const [n0, n1, n2] = p.normal;
      const fim = p.base + p.W * (p.nt + 1);
      for (let i = p.base; i < fim; i++) {
        const a = 3 * i;
        const b = peso * caimento[i];
        posicoes[a] = base[a] + b * n0 + u[a];
        posicoes[a + 1] = base[a + 1] + b * n1 + u[a + 1];
        posicoes[a + 2] = base[a + 2] + b * n2 + u[a + 2];
      }
      if (p.temBolsa) puxarParaABolsa(p);
      const { ns, nt, W } = p;
      for (let j = 0; j <= nt; j++) {
        const jd = p.base + (j > 0 ? j - 1 : 0) * W;
        const ju = p.base + (j < nt ? j + 1 : nt) * W;
        const linha = p.base + j * W;
        for (let k = 0; k <= ns; k++) {
          const e = 3 * (linha + (k > 0 ? k - 1 : 0));
          const d = 3 * (linha + (k < ns ? k + 1 : ns));
          const b = 3 * (jd + k);
          const c = 3 * (ju + k);
          const sx = posicoes[d] - posicoes[e];
          const sy = posicoes[d + 1] - posicoes[e + 1];
          const sz = posicoes[d + 2] - posicoes[e + 2];
          const tx = posicoes[c] - posicoes[b];
          const ty = posicoes[c + 1] - posicoes[b + 1];
          const tz = posicoes[c + 2] - posicoes[b + 2];
          const nx = sy * tz - sz * ty;
          const ny = sz * tx - sx * tz;
          const nz = sx * ty - sy * tx;
          const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
          const a = 3 * (linha + k);
          normais[a] = nx * l;
          normais[a + 1] = ny * l;
          normais[a + 2] = nz * l;
        }
      }
    }
  }

  function acordar() {
    estado.acordada = true;
    estado.quietos = 0;
  }

  function bolaPerto(b) {
    return b.valida && Math.abs(b.x) < meia + 1.2 && b.y < A + 1.2 && b.z < 1.2 && b.z > -P - 1.6;
  }

  // ----- Um quadro: devolve true se a rede mudou (precisa ser desenhada de novo) -----
  function atualizar(dt) {
    const b = estado.bola;
    b.valida = b.nova;
    b.nova = false;
    if (!(dt > 0)) return false;
    dt = Math.min(dt, 0.1); // (Infinity também vira 0,1)
    estado.relogio += dt;
    const peso = limitar(ajuste(CONFIG, 'redePeso'), 0.2, 3);
    const firmeza = limitar(ajuste(CONFIG, 'redeFirmeza'), 1, 30);
    if (peso !== estado.peso || firmeza !== estado.firmeza) {
      estado.peso = peso;
      estado.firmeza = firmeza;
      acordar();
    }
    const perto = bolaPerto(b);
    if (!perto) {
      for (const p of paineis) {
        p.lado = 0;
        p.temAntes = false;
      }
    }
    if (perto || estado.empurrao || estado.tremor.t < 0.6 || estado.ferroMexido) acordar();
    if (!estado.acordada) {
      guardarBola(b);
      return false;
    }

    // Molas: a rede mais pesada tem ondas mais lentas
    const c = firmeza / Math.sqrt(peso);
    let maiorK = 0;
    for (const p of paineis) {
      p.kS = (c / p.hs) ** 2;
      p.kT = (c / p.ht) ** 2;
      maiorK = Math.max(maiorK, p.kS + p.kT);
    }
    // Passo pequeno o bastante para a conta não "explodir" com molas firmes
    const hMax = Math.min(PASSO_MAXIMO, 1.5 / Math.sqrt(4 * maiorK + ANCORA + 8 * FREIO_FINO ** 2));
    let passos = Math.ceil(dt / hMax - 1e-9);
    let h = dt / passos;
    if (passos > 8) {
      passos = 8; // celular travando: a rede anda um pouco mais devagar, mas não explode
      h = hMax;
    }
    const gamma = limitar(ajuste(CONFIG, 'redeFreio'), 0, 30);
    const empurrao = limitar(ajuste(CONFIG, 'redeEmpurrao'), 0, 3);
    const estufa = limitar(ajuste(CONFIG, 'redeEstufa'), 0, 3);
    estado.estufa = estufa;

    // A bola vai da posição do quadro anterior até a de agora, passo a passo (não atravessa a rede)
    const anda = b.valida && b.anterior && Math.hypot(b.x - b.x0, b.y - b.y0, b.z - b.z0) < Math.max(3, 45 * dt);
    if (!anda) {
      b.historico.length = 0;
      for (const p of paineis) p.temAntes = false; // a bola pulou (ou sumiu): não dá para saber se cruzou a rede
    }
    // Velocidade da bola medida sempre num intervalo de ~1/60 s de jogo, para a rede reagir igual em
    // 30 ou 60 quadros por segundo e na câmera lenta (quadros curtos pegariam a bola antes de frear)
    let wx = 0;
    let wy = 0;
    let wz = 0;
    if (anda && b.historico.length) {
      let antiga = b.historico[0];
      for (let n = b.historico.length - 1; n >= 0; n--) {
        if (estado.relogio - b.historico[n].t >= 1 / 60 - 1e-6) {
          antiga = b.historico[n];
          break;
        }
      }
      const intervalo = estado.relogio - antiga.t;
      if (intervalo > 0) {
        wx = (b.x - antiga.x) / intervalo;
        wy = (b.y - antiga.y) / intervalo;
        wz = (b.z - antiga.z) / intervalo;
      }
    }
    const largo = BOLSA_LARGA * limitar(ajuste(CONFIG, 'redeBarriga'), 0, 2);
    const bolsa = estado.bolsaFundo;
    bolsa.contato = false;
    let mexendo = false;
    for (let n = 0; n < passos; n++) {
      const ferro = moverFerro(h);
      mexendo = integrar(h, gamma) || ferro || mexendo;
      if (b.valida) {
        const f = anda ? (n + 1) / passos : 1;
        const bx = anda ? b.x0 + (b.x - b.x0) * f : b.x;
        const by = anda ? b.y0 + (b.y - b.y0) * f : b.y;
        const bz = anda ? b.z0 + (b.z - b.z0) * f : b.z;
        if (perto) {
          for (const p of paineis) colidir(p, bx, by, bz, wx, wy, wz, b.raio, 0, empurrao);
          // Bola afundando o fundo pelo lado de dentro: a rede estufa além dela (ver afundarFundo)
          if (fundo.lado < 0 && Math.abs(bx) < meia && by < A) afundarFundo(bx, by, -P + b.raio - bz, estufa);
        }
      }
      const e = estado.empurrao;
      if (e) afundarFundo(e.x, e.y, e.profundidade, estufa);
      const fundura = segurarBolsa(b.raio, largo);
      // A bolsa puxa a estrutura de trás (e o resto do gol balança junto)
      estado.recuo.alvo = 0.05 * Math.min(1, fundura / 0.6);
    }
    estado.empurrao = null;
    // O fundo estufou: o resto do gol sente o puxão (pelo quanto a bolsa cresceu, não pelo tamanho do
    // quadro: igual em qualquer celular e na câmera lenta)
    const cresceu = bolsa.maior - bolsa.puxada;
    if (cresceu > 0.02) {
      const total = PUXAO_VIZINHOS * limitar(ajuste(CONFIG, 'redeBalanco'), 0, 3);
      const forca = Math.min(cresceu * total * 1.6, total - bolsa.forcaUsada);
      if (forca > 0) puxarVizinhos(bolsa.x, forca);
      bolsa.forcaUsada += Math.max(0, forca);
      bolsa.puxada = bolsa.maior;
    }
    // Bolsa já solta e a bola fora dela: a próxima batida no fundo começa uma bolsa nova
    if (bolsa.solta && !bolsa.contato) Object.assign(bolsa, { maior: 0, solta: false, puxada: 0, forcaUsada: 0 });
    guardarBola(b);
    escrever();

    // Rede parada e sem bola por perto: para de calcular (economiza bateria)
    if (!perto && !mexendo && estado.tremor.t >= 0.6) {
      if (++estado.quietos >= 15) {
        u.fill(0);
        v.fill(0);
        escrever();
        estado.acordada = false;
      }
    } else {
      estado.quietos = 0;
    }
    return true;
  }

  function guardarBola(b) {
    b.anterior = b.valida;
    b.x0 = b.x;
    b.y0 = b.y;
    b.z0 = b.z;
    if (!b.valida) {
      b.historico.length = 0;
      return;
    }
    // guarda as últimas posições (com a hora) para medir a velocidade
    const h = b.historico.length >= 6 ? b.historico.shift() : {};
    h.x = b.x;
    h.y = b.y;
    h.z = b.z;
    h.t = estado.relogio;
    b.historico.push(h);
  }

  estado.peso = limitar(ajuste(CONFIG, 'redePeso'), 0.2, 3);
  escrever();

  return {
    total: N,
    paineis,
    posicoes,
    normais,
    indices: new Uint16Array(indices),
    ferro: estado.ferro,
    get acordada() {
      return estado.acordada;
    },
    // Coordenadas da textura: uma repetição a cada "celula" metros
    uvs(celula) {
      const uv = new Float32Array(2 * N);
      for (let i = 0; i < N; i++) {
        uv[2 * i] = coordS[i] / celula;
        uv[2 * i + 1] = coordT[i] / celula;
      }
      return uv;
    },
    // Posição da bola neste quadro (chamar a cada quadro, antes de atualizar)
    bola(pos, raio) {
      const b = estado.bola;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
      b.x = pos.x;
      b.y = pos.y;
      b.z = pos.z;
      if (Number.isFinite(raio) && raio > 0) b.raio = raio;
      b.nova = true;
    },
    // Bola afundando o fundo da rede no ponto (x, y), "profundidade" metros além da linha do fundo
    estufar(x, y, profundidade) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(profundidade) || profundidade <= 0) return;
      const e = estado.empurrao;
      if (!e || profundidade > e.profundidade) estado.empurrao = { x, y, profundidade: Math.min(profundidade, 1.2) };
      acordar();
    },
    // Bola na trave ou no travessão: o gol treme (intensidade de 0 a 1)
    tremer(intensidade = 1, forcaExtra = 1) {
      const i = limitar(Number(intensidade), 0, 1) * limitar(Number(forcaExtra), 0, 3);
      if (!(i > 0)) return;
      const b = estado.bola;
      const tr = estado.tremor;
      // Onde bateu: pela última posição da bola (perto do travessão = treme mais para cima e para baixo)
      tr.xh = b.valida || b.anterior ? limitar(b.x, -meia - 0.2, meia + 0.2) : 0;
      tr.trav = (b.valida || b.anterior) && b.y > A - 0.15 && Math.abs(b.x) < meia - 0.1 ? 1 : 0.25;
      tr.forca = tr.t < 0.15 ? Math.max(i, tr.forca) : i;
      tr.t = 0;
      // A rede leva um chacoalhão junto com os ferros: várias ondas curtas misturadas (tremido, não balanço)
      for (const p of paineis) {
        const [n0, n1, n2] = p.normal;
        const forca = i * (p.nome === 'teto' ? 1.4 : 1);
        for (let j = 1; j < p.nt; j++) {
          for (let k = 1; k < p.ns; k++) {
            const a = 3 * (p.base + j * p.W + k);
            const s = (k / p.ns) * p.compS;
            const t = (j / p.nt) * p.compT;
            const onda = forca * sen(k / p.ns) * sen(j / p.nt) * (0.45 + Math.sin(5.3 * s + 2.1) * Math.sin(4.7 * t + 0.7));
            v[a] += onda * n0;
            v[a + 1] += onda * n1;
            v[a + 2] += onda * n2;
          }
        }
      }
      acordar();
    },
    // Nova cobrança: a rede volta ao lugar na hora
    reiniciar() {
      u.fill(0);
      v.fill(0);
      for (const p of paineis) {
        p.lado = 0;
        p.temAntes = false;
        p.temBolsa = false;
        p.tocando = false;
      }
      estado.empurrao = null;
      Object.assign(estado.bolsaFundo, { maior: 0, contato: false, solta: false, puxada: 0, forcaUsada: 0 });
      estado.tremor.t = 10;
      estado.recuo.x = estado.recuo.v = estado.recuo.alvo = 0;
      Object.assign(estado.ferro, { amp: 0, recuo: 0 });
      estado.ferroMexido = false;
      estado.bola.anterior = estado.bola.valida = estado.bola.nova = false;
      estado.bola.historico.length = 0;
      escrever();
      estado.acordada = false;
    },
    atualizar,
  };
}

// Ensaio da rede: uma rede invisível joga um gol "de mentira" (bola no fundo, bola no teto, trave), um
// quadro por vez. Serve só para o navegador deixar a conta rápida antes do primeiro gol de verdade: sem
// isso, o primeiro gol pode dar um engasgo bem na câmera lenta. passo() devolve false quando acabou.
export function criarEnsaioRede(CONFIG) {
  const malha = criarMalhaRede(CONFIG);
  const P = CONFIG.golProfundidade;
  const r = CONFIG.raioBola || 0.11;
  let quadro = 0;
  return {
    passo() {
      const t = quadro / 60;
      if (quadro < 16) {
        // chute no meio do gol: entra, afunda o fundo e volta um pouco
        const z = Math.max(-P - 0.2, 1.5 - 25 * t);
        malha.bola({ x: 0.3, y: 1.0, z }, r);
        if (z < -P + r) malha.estufar(0.3, 1.0, -P + r - z);
      } else if (quadro < 26) {
        // bola caindo em cima do teto e bola raspando a lateral por fora
        malha.bola({ x: 1.0, y: Math.max(CONFIG.golAltura + r, 3.2 - 4 * (t - 16 / 60) * 6), z: -1.0 }, r);
      } else if (quadro === 26) {
        malha.tremer(1);
      }
      malha.atualizar(1 / 60);
      return ++quadro < 34;
    },
  };
}

// Textura da rede: só a transparência (fios brancos num fundo preto opaco; o Three.js usa o canal verde).
// Assim as versões reduzidas da textura (mipmaps) ficam certas: de longe a rede vira um véu claro e
// uniforme, sem "chuvisco" e sem bordas escuras.
function texturaRede(anisotropia) {
  const T = 128;
  const [canvas, ctx] = novoCanvas(T, T);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, T, T);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  // Losangos: duas diagonais por quadradinho, mais as cópias que fecham as emendas
  for (const [x0, y0, x1, y1] of [[0, 0, T, T], [T, 0, 0, T], [-T, 0, T, 2 * T], [0, -T, 2 * T, T], [2 * T, 0, 0, 2 * T], [T, -T, -T, T]]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // Nós onde os fios se cruzam
  ctx.fillStyle = '#fff';
  for (const [x, y] of [[0, 0], [T, 0], [0, T], [T, T], [T / 2, T / 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropia;
  return t;
}

// Material da rede: fios brancos com transparência. Dois truques baratos dão volume ao pano:
// vista de lado, a rede fica mais fechada (os fios se juntam na frente do olho), e a face virada para os
// refletores fica um pouco mais clara. Assim a bolsa e as ondas aparecem até de frente.
function criarMaterialRede(anisotropia) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf4f7fb, alphaMap: texturaRede(anisotropia), transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoRede;\nvarying vec3 vNormalRede;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vMundoRede = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vNormalRede = mat3(modelMatrix) * normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoRede;\nvarying vec3 vNormalRede;')
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        vec3 nRede = normalize(vNormalRede);
        float deFrente = dot(nRede, normalize(cameraPosition - vMundoRede));
        if (deFrente < 0.0) {
          nRede = -nRede;
          deFrente = -deFrente;
        }
        diffuseColor.a = 1.0 - pow(max(1.0 - diffuseColor.a, 0.0), 1.0 / max(deFrente, 0.25));
        diffuseColor.rgb *= 0.74 + 0.3 * max(dot(nRede, vec3(-0.35, 0.75, 0.55)), 0.0);`);
  };
  material.customProgramCacheKey = () => 'rede-fkl';
  return material;
}

// Traves e estrutura. O gol de lá e as hastes das bandeirinhas ficam parados ("metal");
// o nosso gol ("metalPerto") treme na bola na trave. A rede do gol de lá é fixa ("redeLa").
function criarGols(CONFIG) {
  const { golLargura: L, golAltura: A, golProfundidade: P, raioTrave: R } = CONFIG;
  const meia = L / 2;
  const metal = new Construtor();
  const metalPerto = new Construtor();
  const redeLa = new Construtor();

  // Leva um ponto do nosso gol para o gol de lá (meia volta em torno do meio do campo)
  const paraLa = ([x, y, z]) => [-x, y, CAMPO.comprimento - z];

  for (const la of [false, true]) {
    const p = la ? paraLa : (v) => v;
    const m = la ? metal : metalPerto;
    // Traves e travessão: brancos, um pouco mais escuros embaixo (perto da grama)
    const branco = rgb('#f4f6f8');
    const corTrave = (y) => escurecer(branco, 0.72 + 0.28 * suave(y / 0.5));
    for (const lado of [-1, 1]) tubo(m, p([lado * (meia + R), 0, 0]), p([lado * (meia + R), A + R, 0]), R, branco, 20, corTrave);
    tubo(m, p([-(meia + 2 * R), A + R, 0]), p([meia + 2 * R, A + R, 0]), R, branco, 20);
    // Estrutura de trás que segura a rede (mais fina)
    const cinza = rgb('#cfd4da');
    const corFina = (y) => escurecer(cinza, 0.7 + 0.3 * suave(y / 0.5));
    const r = 0.025;
    for (const lado of [-1, 1]) {
      const x = lado * meia;
      tubo(m, p([x, 0, -P]), p([x, A, -P]), r, cinza, 8, corFina);    // poste de trás
      tubo(m, p([x, A, -R]), p([x, A, -P]), r, cinza, 8);             // em cima, da trave para trás
      tubo(m, p([x, r, -R]), p([x, r, -P]), r, cinza, 8, corFina);    // no chão, da trave para trás
    }
    tubo(m, p([-meia, A, -P]), p([meia, A, -P]), r, cinza, 8);
    tubo(m, p([-meia, r, -P]), p([meia, r, -P]), r, cinza, 8, corFina);
  }

  // Rede do gol de lá (parada, longe da câmera): o mesmo caimento da nossa
  const CELULA = CELULA_REDE;
  const grade = (ns, nt, ponto, compS, compT) => {
    const inicio = redeLa.total;
    for (let j = 0; j <= nt; j++) {
      for (let i = 0; i <= ns; i++) {
        redeLa.vertice(paraLa(ponto(i / ns, j / nt)), [0, 0, 1], [(i / ns) * compS / CELULA, (j / nt) * compT / CELULA], BRANCO, null);
      }
    }
    for (let j = 0; j < nt; j++) {
      for (let i = 0; i < ns; i++) {
        const a = inicio + j * (ns + 1) + i;
        redeLa.idx.push(a, a + 1, a + ns + 2, a, a + ns + 2, a + ns + 1);
      }
    }
  };
  const sen = (a) => Math.sin(Math.PI * a);
  grade(24, 8, (s, t) => [-meia + s * L, t * A, -P - 0.1 * (1 - t) ** 3 - 0.035 * sen(s) * sen(t)], L, A);
  grade(24, 7, (s, t) => [-meia + s * L, A - 0.065 * sen(s) * sen(t), -R - t * (P - R)], L, P - R);
  for (const lado of [-1, 1]) {
    grade(7, 8, (s, t) => [lado * (meia + 0.05 * sen(s) * sen(t)), t * A, -R - s * (P - R)], P - R, A);
  }

  return { metal, metalPerto, redeLa };
}

const CELULA_REDE = 0.13; // m: tamanho de cada quadradinho da textura da rede (dois losangos)

// Ferros do nosso gol: o mesmo brilho de tinta dos outros, mais o tremor (calculado na placa de vídeo)
function criarMaterialFerroPerto(uniformesFerro) {
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true, shininess: 60, specular: 0x3a3a3a, emissive: 0x4a4d52,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreme = uniformesFerro.treme;
    shader.uniforms.uGol = uniformesFerro.gol;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FERRO_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += deslocarFerro(position);');
  };
  material.customProgramCacheKey = () => 'ferro-gol-fkl';
  return material;
}

function montarRede(scene, CONFIG, construtorRedeLa, anisotropia, uniformesFerro) {
  const { golLargura: L, golAltura: A, golProfundidade: P } = CONFIG;
  const material = criarMaterialRede(anisotropia);

  // Gol de lá: rede parada
  const geometriaLa = construtorRedeLa.criar();
  geometriaLa.computeVertexNormals();
  const redeLa = new THREE.Mesh(geometriaLa, material);
  redeLa.renderOrder = 2;
  scene.add(redeLa);

  // Nosso gol: o pano que balança
  const malha = criarMalhaRede(CONFIG);
  const geometria = new THREE.BufferGeometry();
  const posicao = new THREE.BufferAttribute(malha.posicoes, 3);
  const normal = new THREE.BufferAttribute(malha.normais, 3);
  posicao.setUsage(THREE.DynamicDrawUsage);
  normal.setUsage(THREE.DynamicDrawUsage);
  geometria.setAttribute('position', posicao);
  geometria.setAttribute('normal', normal);
  geometria.setAttribute('uv', new THREE.BufferAttribute(malha.uvs(CELULA_REDE), 2));
  geometria.setIndex(new THREE.BufferAttribute(malha.indices, 1));
  // Esfera que sempre contém a rede, mesmo estufada (a câmera usa para saber se ela aparece)
  geometria.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, A / 2, -P / 2), Math.hypot(L / 2 + 0.6, A / 2 + 0.6, P / 2 + 1.4));
  const redePerto = new THREE.Mesh(geometria, material);
  redePerto.renderOrder = 2;
  scene.add(redePerto);
  // Nos primeiros quadros (o jogador ainda está mirando), o ensaio prepara a conta da rede
  let ensaio = criarEnsaioRede(CONFIG);

  return {
    // Posição da bola neste quadro (chamar a cada quadro, antes de cenario.atualizar)
    bola(pos, raio) {
      malha.bola(pos, raio);
    },
    // Empurrão extra no fundo da rede (o evento "fundo" da física): ponto (x, y) e quanto afundou
    estufar(x, y, profundidade) {
      malha.estufar(x, y, profundidade);
    },
    // Nova cobrança: a rede volta ao lugar na hora
    reiniciar() {
      malha.reiniciar();
      posicao.needsUpdate = true;
      normal.needsUpdate = true;
    },
    tremer(intensidade) {
      malha.tremer(intensidade, ajuste(CONFIG, 'traveTremor'));
    },
    get mexendo() {
      return malha.acordada;
    },
    malha,
    atualizar(dt) {
      // Ensaio: só enquanto a rede de verdade está parada (nunca no meio de um gol)
      if (ensaio && !malha.acordada && !ensaio.passo()) ensaio = null;
      if (malha.atualizar(dt)) {
        posicao.needsUpdate = true;
        normal.needsUpdate = true;
      }
      const f = malha.ferro;
      uniformesFerro.treme.value.set(f.amp, f.xh, f.trav, f.recuo);
    },
  };
}

// ---------- Tudo junto ----------

// Monta o cenário na cena. CONFIG: medidas do gol (golLargura, golAltura, golProfundidade, raioTrave, raioBola)
// e os ajustes de CONFIG.cenario (padrões em PADRAO_CENARIO).
export function criarCenario(scene, renderer, CONFIG) {
  sorteio = criarSorteio(2026);
  const anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const uniformes = { tempo: { value: 0 }, festa: { value: 0 } };

  criarCeu(scene);
  criarLuzes(scene);
  criarGramado(scene, anisotropia);
  const contorno = criarContorno();
  criarEstrutura(scene, contorno, anisotropia);
  criarTorcida(scene, contorno, anisotropia, uniformes);
  criarLuzesAcesas(scene, contorno);
  const faixaLed = criarFaixaLed(scene, contorno);
  const placas = criarPlacas(scene, anisotropia);

  // Traves, estrutura do gol e hastes das bandeirinhas, com um leve brilho de tinta.
  // O nosso gol é uma malha à parte, porque treme na bola na trave.
  const gols = criarGols(CONFIG);
  const bandeirinhas = criarBandeirinhas(scene, gols.metal);
  scene.add(new THREE.Mesh(gols.metal.criar(), new THREE.MeshPhongMaterial({
    vertexColors: true, shininess: 60, specular: 0x3a3a3a, emissive: 0x4a4d52, // emissive: continua branca de qualquer ângulo
  })));
  const uniformesFerro = {
    treme: { value: new THREE.Vector4(0, 0, 0, 0) },
    gol: { value: new THREE.Vector4(CONFIG.golLargura / 2, CONFIG.golAltura, CONFIG.golProfundidade, 0) },
  };
  const ferroPerto = new THREE.Mesh(gols.metalPerto.criar(), criarMaterialFerroPerto(uniformesFerro));
  ferroPerto.geometry.boundingSphere.radius += 0.3; // o tremor tira o ferro um pouquinho do lugar
  scene.add(ferroPerto);
  const rede = montarRede(scene, CONFIG, gols.redeLa, anisotropia, uniformesFerro);

  // Comemoração da torcida: sobe rápido, fica no auge um tempo e vai acalmando.
  // As placas e a faixa de LED mostram "GOOOL!" só no começo, e param na hora com festa(0).
  const festa = { pico: 0, tempo: 1e3, nivel: 0, calma: false };
  let tempo = 0;
  const torcida = {
    // intensidade de 0 a 1 (1 = gol; uns 0.3 = "uuuh" de bola na trave). 0 acalma a torcida.
    festa(intensidade = 1) {
      const valor = Number(intensidade);
      if (!Number.isFinite(valor)) return; // número estragado (NaN): ignora, senão a festa travava
      if (valor <= 0) {
        festa.pico = Math.min(festa.pico, festa.nivel);
        festa.tempo = 1e3;
        festa.calma = true;
        return;
      }
      festa.pico = Math.max(festa.nivel, Math.min(1, valor));
      festa.tempo = 0;
      festa.calma = false;
    },
    get nivel() {
      return festa.nivel;
    },
    // As placas estão mostrando "GOOOL!"?
    get placasGol() {
      return mostrarGol();
    },
    atualizar(dt) {
      const segura = Math.max(0, ajuste(CONFIG, 'festaSegura'));     // s no auge
      const duracao = Math.max(0.1, ajuste(CONFIG, 'festaDuracao')); // s para ir acalmando depois do auge
      festa.tempo += dt;
      const alvo = festa.pico * (festa.tempo < segura ? 1 : Math.exp(-(festa.tempo - segura) / (duracao / 3)));
      const rapidez = alvo > festa.nivel ? 10 : festa.calma ? 5 : 3;
      festa.nivel += (alvo - festa.nivel) * Math.min(1, dt * rapidez);
      if (!Number.isFinite(festa.nivel)) festa.nivel = festa.pico = 0;
      if (festa.nivel < 0.002 && alvo < 0.002) festa.pico = festa.nivel = 0;
      uniformes.festa.value = festa.nivel;
    },
  };
  // "GOOOL!" nas placas: só em festa de gol, e sempre acaba antes da próxima cobrança (espera do gol)
  const mostrarGol = () => {
    const espera = Number.isFinite(CONFIG.esperaGol) ? CONFIG.esperaGol : 2.2;
    const duracao = Math.min(ajuste(CONFIG, 'festaPlacas'), espera - 0.2);
    return festa.pico > LIMIAR_GOL && festa.tempo < duracao;
  };

  return {
    rede,
    torcida,
    // Bola na trave ou no travessão: o gol treme de leve (intensidade de 0 a 1), com a rede junto
    trave(intensidade = 1) {
      rede.tremer(intensidade);
    },
    // Chamar uma vez por quadro (depois de rede.bola): atualiza a rede, a torcida e as placas
    atualizar(dt) {
      if (!(dt >= 0)) return; // dt estragado (NaN ou negativo): ignora
      dt = Math.min(dt, 0.1);   // e um quadro enorme (ou Infinity) vale no máximo 0,1 s
      tempo = (tempo + dt) % 1000;
      uniformes.tempo.value = tempo;
      rede.atualizar(dt);
      torcida.atualizar(dt);
      const gol = mostrarGol();
      faixaLed.atualizar(dt, gol, tempo);
      placas.atualizar(gol, tempo);
      bandeirinhas.atualizar(tempo);
    },
  };
}
