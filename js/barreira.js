// Barreira: os jogadores que ficam a 9,15 m da bola tapando parte do gol.
// Aqui só a lógica (onde cada um fica, o pulo) e a colisão com a bola; o desenho dos bonecos é de outro arquivo.
// Não depende do Three.js: dá para rodar no Node (veja testes/defesa.mjs).
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra (gol em z = 0).

export const PADRAO_BARREIRA = {
  distancia: 9.15,       // m da bola até a barreira (regra do futebol)
  espacamento: 0.55,     // m entre os centros de dois jogadores lado a lado
  sobraTrave: 0.3,       // m que o jogador de fora passa da linha bola -> trave, para o lado de fora
  altura: 1.85,          // m: altura média dos jogadores (com a cabeça)
  variacaoAltura: 0.07,  // m para mais ou para menos em cada jogador
  raio: 0.23,            // m: "grossura" do corpo (metade da largura dos ombros)
  raioCabeca: 0.12,      // m
  chancePulo: 0.4,       // chance de a barreira pular na cobrança (0 = nunca, 1 = sempre)
  alturaPulo: 0.4,       // m que os pés sobem no pulo (média)
  variacaoPulo: 0.05,    // m para mais ou para menos em cada jogador
  atrasoPulo: 0.14,      // s depois do chute para começar a subir (média)
  variacaoAtraso: 0.04,  // s para mais ou para menos: cada um pula num instante
  duracaoPulo: 0.55,     // s no ar
  quique: 0.3,           // quanto a bola volta ao bater na barreira (0 = morre, 1 = volta tudo)
  atrito: 0.6,           // quanto sobra da velocidade "de raspão" depois da batida
};

const GRAUS = Math.PI / 180;
const lerCfg = (cfg) => ({ ...PADRAO_BARREIRA, ...((cfg && cfg.barreira) || {}) });

// Quantos jogadores vão para a barreira: menos quanto mais longe; de ângulo aberto, no máximo 3
export function quantidadeNaBarreira(distancia, anguloGraus) {
  let n = distancia <= 20 ? 5 : distancia <= 24 ? 4 : distancia <= 28 ? 3 : 2;
  if (Math.abs(anguloGraus) > 25) n = Math.min(n, 3);
  return n;
}

// Monta a barreira para uma falta. posBola: {x, z}. aleatorio: função que devolve de 0 a 1.
// O jogador de fora fica alinhado com a trave mais próxima (vista da bola), um pouco para fora,
// e os outros vão lado a lado em direção ao centro do gol. Em falta central, cobre uma das metades.
// Todos ficam a 9,15 m da bola (num arco), virados para ela.
export function montarBarreira(posBola, cfg = {}, aleatorio = Math.random) {
  const c = lerCfg(cfg);
  const meia = (cfg.golLargura ?? 7.32) / 2;
  const bola = { x: posBola.x, z: posBola.z };
  const distanciaGol = Math.hypot(bola.x, bola.z);
  const angulo = Math.atan2(bola.x, bola.z) / GRAUS;
  const n = quantidadeNaBarreira(distanciaGol, angulo);

  // Sorteios sempre na mesma ordem e na mesma quantidade: mesma semente, mesma barreira
  const sorteioLado = aleatorio();
  const sorteioPulo = aleatorio();
  const sorteios = [];
  for (let i = 0; i < n; i++) sorteios.push([aleatorio(), aleatorio(), aleatorio(), aleatorio()]);

  // Lado coberto: o da trave mais próxima. Bem de frente, sorteia uma das metades.
  const lado = Math.abs(angulo) >= 4 ? Math.sign(bola.x) : sorteioLado < 0.5 ? -1 : 1;

  // Direção da bola para a trave do lado coberto, e a perpendicular que aponta para fora do gol
  const tx = lado * meia - bola.x;
  const tz = -bola.z;
  const dt = Math.hypot(tx, tz) || 1;
  const paraTrave = { x: tx / dt, z: tz / dt };
  let fora = { x: -paraTrave.z, z: paraTrave.x };
  if (fora.x * lado < 0) fora = { x: -fora.x, z: -fora.z };

  // Alturas variadas; os mais altos ficam do lado de fora (onde a bola curva por cima)
  const alturas = sorteios
    .map(([s]) => c.altura + (2 * s - 1) * c.variacaoAltura)
    .sort((a, b) => b - a);

  const pula = sorteioPulo < c.chancePulo;
  const jogadores = [];
  for (let i = 0; i < n; i++) {
    // Ângulo (visto da bola) a partir da linha bola -> trave: + = para fora
    const a = (c.sobraTrave - i * c.espacamento) / c.distancia;
    const dx = paraTrave.x * Math.cos(a) + fora.x * Math.sin(a);
    const dz = paraTrave.z * Math.cos(a) + fora.z * Math.sin(a);
    const [, s1, s2, s3] = sorteios[i];
    jogadores.push({
      x: bola.x + dx * c.distancia,
      z: bola.z + dz * c.distancia,
      raio: c.raio,
      altura: alturas[i],
      rotacaoY: Math.atan2(-dx, -dz), // de frente para a bola (0 = olhando para +z)
      yPes: 0,                       // altura da sola (sobe no pulo)
      progressoPulo: 0,              // 0 = no chão antes do pulo, 1 = pulo terminado
      pulo: {
        vai: pula,
        atraso: c.atrasoPulo + (2 * s1 - 1) * c.variacaoAtraso,
        altura: c.alturaPulo + (2 * s2 - 1) * c.variacaoPulo,
        duracao: c.duracaoPulo * (0.95 + 0.1 * s3),
      },
      batida: 0,                     // força da última bolada (para o boneco reagir)
    });
  }

  // Direção média da bola para a barreira (para quem precisar alinhar algo com ela)
  const meio = jogadores.reduce((m, j) => ({ x: m.x + j.x / n, z: m.z + j.z / n }), { x: 0, z: 0 });
  const dm = Math.hypot(meio.x - bola.x, meio.z - bola.z) || 1;

  return {
    jogadores,
    lado,                 // -1 = cobre a metade esquerda do gol (x < 0), +1 = a direita
    pula,                 // se a barreira vai pular nesta cobrança
    bola,                 // de onde sai a falta
    distancia: c.distancia,
    direcao: { x: (meio.x - bola.x) / dm, z: (meio.z - bola.z) / dm }, // da bola para o meio da barreira
    batidas: 0,           // quantas vezes a bola bateu na barreira
    ultimaBatida: null,   // { jogador, parte, impacto }
    _anterior: null,      // posição da bola na última checagem (para a bola rápida não atravessar)
    _bola: null,
  };
}

// Atualiza o pulo. tDesdeChute: segundos desde o chute (negativo = ainda não chutou, todos parados).
// Os pés sobem e descem numa parábola: yPes = 4·h·p·(1 − p), com p de 0 a 1 durante o pulo.
export function atualizarBarreira(b, tDesdeChute) {
  for (const j of b.jogadores) {
    const { vai, atraso, altura, duracao } = j.pulo;
    if (!vai || tDesdeChute < atraso) {
      j.yPes = 0;
      j.progressoPulo = 0;
      continue;
    }
    const p = Math.min(1, (tDesdeChute - atraso) / duracao);
    j.progressoPulo = p;
    j.yPes = 4 * altura * p * (1 - p);
  }
}

// Ponto do corpo do jogador mais perto de p, e o raio da parte. O corpo é uma cápsula vertical
// (da sola até os ombros, com o raio do corpo) e a cabeça é uma esfera no topo.
function maisPerto(j, p, c) {
  const base = j.yPes + 0.02 + j.raio;       // centro da "tampa" de baixo: a sola fica em yPes + 0,02
  const ombro = j.yPes + j.altura - 0.25;    // centro da "tampa" de cima
  const corpo = { x: j.x, y: Math.min(ombro, Math.max(base, p.y)), z: j.z };
  const dCorpo = Math.hypot(p.x - corpo.x, p.y - corpo.y, p.z - corpo.z) - j.raio;
  const cabeca = { x: j.x, y: j.yPes + j.altura - c.raioCabeca, z: j.z };
  const dCabeca = Math.hypot(p.x - cabeca.x, p.y - cabeca.y, p.z - cabeca.z) - c.raioCabeca;
  return dCabeca < dCorpo
    ? { centro: cabeca, raio: c.raioCabeca, folga: dCabeca, parte: 'cabeca' }
    : { centro: corpo, raio: j.raio, folga: dCorpo, parte: 'corpo' };
}

// Colisão da bola com a barreira. Chamar depois de cada passo(bola, ...).
// A bola é empurrada para fora do corpo e rebate com pouca força (quique) e atrito.
// Registra bola.eventos.push({ tipo: 'barreira', impacto, jogador, parte, x, y, z }).
// Com a barreira no ar, a bola rasteira passa por baixo dos pés.
export function colidirBolaBarreira(bola, b, cfg = {}) {
  if (!b || !b.jogadores.length) return false;
  const c = lerCfg(cfg);
  const r = cfg.raioBola ?? 0.11;
  const { pos, vel, giro } = bola;

  // A bola anda até ~0,15 m por passo: confere vários pontos entre a posição anterior e a atual
  const a = b._bola === bola && b._anterior ? b._anterior : pos;
  const dx = pos.x - a.x;
  const dy = pos.y - a.y;
  const dz = pos.z - a.z;
  const andou = Math.hypot(dx, dy, dz);
  const amostras = andou > 2 ? 1 : Math.min(40, Math.max(1, Math.ceil(andou / 0.04)));
  let bateu = false;

  for (let k = 1; k <= amostras && !bateu; k++) {
    const f = andou > 2 ? 1 : k / amostras;
    const p = { x: a.x + dx * f, y: a.y + dy * f, z: a.z + dz * f };
    for (let i = 0; i < b.jogadores.length; i++) {
      const j = b.jogadores[i];
      // Descarta rápido quem está longe
      if (Math.abs(p.x - j.x) > 0.6 || Math.abs(p.z - j.z) > 0.6) continue;
      const m = maisPerto(j, p, c);
      if (m.folga >= r) continue;

      // Normal da batida: do corpo para a bola (se a bola estiver bem no eixo, usa a direção de onde ela veio)
      let nx = p.x - m.centro.x;
      let ny = p.y - m.centro.y;
      let nz = p.z - m.centro.z;
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
      const encosta = m.raio + r + 1e-3;
      pos.x = m.centro.x + nx * encosta;
      pos.y = Math.max(r, m.centro.y + ny * encosta);
      pos.z = m.centro.z + nz * encosta;

      const vn = vel.x * nx + vel.y * ny + vel.z * nz;
      if (vn < 0) {
        const tx = vel.x - vn * nx;
        const ty = vel.y - vn * ny;
        const tz = vel.z - vn * nz;
        vel.x = tx * c.atrito - vn * c.quique * nx;
        vel.y = ty * c.atrito - vn * c.quique * ny;
        vel.z = tz * c.atrito - vn * c.quique * nz;
        const impacto = -vn;
        if (impacto > 0.5) {
          giro.x *= 0.3;
          giro.y *= 0.3;
          giro.z *= 0.3;
          bola.danca = null;
          if ('curvaTardia' in bola) bola.curvaTardia = null;
          j.batida = impacto;
          b.batidas++;
          b.ultimaBatida = { jogador: i, parte: m.parte, impacto };
          bola.eventos.push({ tipo: 'barreira', impacto, jogador: i, parte: m.parte, x: pos.x, y: pos.y, z: pos.z });
        }
      }
      bateu = true;
      break;
    }
  }

  b._anterior = { x: pos.x, y: pos.y, z: pos.z };
  b._bola = bola;
  return bateu;
}
