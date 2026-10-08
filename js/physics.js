// Física da bola. Não depende do Three.js: só números, para poder ser testada sozinha.
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra
// (o gol fica em z = 0 e a bola é chutada no sentido de z negativo).

const GRAUS = Math.PI / 180;
const limitar01 = (v) => Math.min(1, Math.max(0, v));

export function criarBola(posicao) {
  return {
    pos: { ...posicao },
    vel: { x: 0, y: 0, z: 0 },
    giro: { x: 0, y: 0, z: 0 }, // rotação em rad/s; o eixo diz para onde a bola gira
    danca: null,                // oscilação da bola sem rotação (quando existe)
  };
}

// Dá o chute: define velocidade e giro iniciais.
// alvo: ponto {x, z} no chão para onde o chute aponta. forca: de 0 a 1.
// contato: onde o pé pega na bola, {x, y} dentro de um círculo de raio 1
//   (x > 0 = lado direito da bola, y > 0 = parte de cima).
export function chutar(bola, { alvo, forca, contato = { x: 0, y: 0 } }, cfg, aleatorio = Math.random) {
  const dx = alvo.x - bola.pos.x;
  const dz = alvo.z - bola.pos.z;
  const dist = Math.hypot(dx, dz);
  const frente = { x: dx / dist, z: dz / dist };     // direção do chute no chão
  const direita = { x: -frente.z, z: frente.x };      // lado direito de quem cobra

  // Bater fora do centro troca velocidade por efeito
  const desvio = Math.min(1, Math.hypot(contato.x, contato.y));
  const velocidadeBase = cfg.velocidadeMin + (cfg.velocidadeMax - cfg.velocidadeMin) * forca;
  const velocidade = velocidadeBase * (1 - cfg.perdaVelocidadeContato * desvio * desvio);

  // Contato embaixo levanta a bola; em cima, ela sai mais baixa
  const efeito = contato.y < 0 ? cfg.elevacaoContatoEmbaixo : cfg.elevacaoContatoEmCima;
  const elevacao = (cfg.elevacaoBase - contato.y * efeito) * GRAUS;
  const horizontal = velocidade * Math.cos(elevacao);
  bola.vel = {
    x: frente.x * horizontal,
    y: velocidade * Math.sin(elevacao),
    z: frente.z * horizontal,
  };

  // Giro: contato à direita gira a bola em torno do eixo vertical e ela curva para a esquerda;
  // contato em cima gira para a frente (cai), embaixo gira para trás (flutua).
  const lateral = contato.x * cfg.giroLateralMax;
  const vertical = contato.y * cfg.giroVerticalMax;
  bola.giro = {
    x: -vertical * direita.x,
    y: lateral,
    z: -vertical * direita.z,
  };

  // Bola sem rotação: contato bem no centro e chute forte
  const noCentro = limitar01(1 - desvio / cfg.semRotacaoRaio);
  const forte = limitar01((forca - cfg.semRotacaoForcaMinima) / (1 - cfg.semRotacaoForcaMinima));
  const intensidade = noCentro * forte;
  bola.danca = intensidade > 0
    ? {
      intensidade,
      t: 0,
      freq1: 9 + aleatorio() * 6,   // rad/s: algumas oscilações durante o voo
      freq2: 7 + aleatorio() * 6,
      fase1: aleatorio() * Math.PI * 2,
      fase2: aleatorio() * Math.PI * 2,
    }
    : null;

  return { velocidade, elevacao: elevacao / GRAUS };
}

export function noChao(bola, cfg) {
  return bola.pos.y <= cfg.raioBola + 1e-4 && Math.abs(bola.vel.y) < 1e-3;
}

// Avança a simulação em dt segundos.
export function passo(bola, dt, cfg) {
  const { pos, vel, giro } = bola;
  const rolando = noChao(bola, cfg);
  const rapidez = Math.hypot(vel.x, vel.y, vel.z);

  // Gravidade e arrasto do ar (proporcional a |v|·v)
  let ax = -cfg.arrasto * rapidez * vel.x;
  let ay = -cfg.gravidade - cfg.arrasto * rapidez * vel.y;
  let az = -cfg.arrasto * rapidez * vel.z;

  if (!rolando) {
    // Efeito Magnus: o giro empurra a bola na direção de (giro × velocidade)
    ax += cfg.magnus * (giro.y * vel.z - giro.z * vel.y);
    ay += cfg.magnus * (giro.z * vel.x - giro.x * vel.z);
    az += cfg.magnus * (giro.x * vel.y - giro.y * vel.x);

    // Bola sem rotação: empurrões que mudam de lado, mais fortes quanto mais rápida a bola
    const d = bola.danca;
    if (d && rapidez > 1) {
      d.t += dt;
      const forcaDanca = cfg.semRotacaoAmplitude * d.intensidade * (rapidez / 28) ** 2;
      const rapidezChao = Math.hypot(vel.x, vel.z) || 1;
      const lado = Math.sin(d.freq1 * d.t + d.fase1) * forcaDanca;
      const cima = Math.sin(d.freq2 * d.t + d.fase2) * forcaDanca * 0.5;
      ax += (-vel.z / rapidezChao) * lado;
      az += (vel.x / rapidezChao) * lado;
      ay += cima;
    }
  }

  vel.x += ax * dt;
  vel.y += ay * dt;
  vel.z += az * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;

  const perda = Math.max(0, 1 - cfg.decaimentoGiro * dt);
  giro.x *= perda;
  giro.y *= perda;
  giro.z *= perda;

  // Gramado: quica e depois rola até parar
  if (pos.y < cfg.raioBola) {
    pos.y = cfg.raioBola;
    if (vel.y < 0) {
      vel.y = -vel.y * cfg.quiqueChao;
      if (vel.y < 0.6) vel.y = 0;
      vel.x *= 0.85;
      vel.z *= 0.85;
      giro.x *= 0.5;
      giro.y *= 0.5;
      giro.z *= 0.5;
      bola.danca = null;
    }
  }
  if (noChao(bola, cfg)) {
    vel.y = 0;
    const rapidezChao = Math.hypot(vel.x, vel.z);
    const freada = cfg.atritoGrama * dt;
    const fator = rapidezChao > freada ? (rapidezChao - freada) / rapidezChao : 0;
    vel.x *= fator;
    vel.z *= fator;
  }
}
