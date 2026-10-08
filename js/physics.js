// Física da bola. Não depende do Three.js: só números, para poder ser testada sozinha.
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra
// (o gol fica em z = 0 e a bola é chutada no sentido de z negativo).

const GRAUS = Math.PI / 180;

export function criarBola(posicao) {
  return {
    pos: { ...posicao },
    vel: { x: 0, y: 0, z: 0 },
    giro: { x: 0, y: 0, z: 0 }, // rotação em rad/s; o eixo diz para onde a bola gira
  };
}

// Dá o chute: define velocidade e giro iniciais.
// alvo: ponto {x, z} no chão para onde o chute aponta. forca: de 0 a 1.
export function chutar(bola, { alvo, forca }, cfg) {
  const dx = alvo.x - bola.pos.x;
  const dz = alvo.z - bola.pos.z;
  const dist = Math.hypot(dx, dz);
  const velocidade = cfg.velocidadeMin + (cfg.velocidadeMax - cfg.velocidadeMin) * forca;
  const elevacao = cfg.elevacaoBase * GRAUS;
  const horizontal = velocidade * Math.cos(elevacao);

  bola.vel = {
    x: (dx / dist) * horizontal,
    y: velocidade * Math.sin(elevacao),
    z: (dz / dist) * horizontal,
  };
  bola.giro = { x: 0, y: 0, z: 0 };
  return velocidade;
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

  // Efeito Magnus: o giro empurra a bola na direção de (giro × velocidade)
  if (!rolando) {
    ax += cfg.magnus * (giro.y * vel.z - giro.z * vel.y);
    ay += cfg.magnus * (giro.z * vel.x - giro.x * vel.z);
    az += cfg.magnus * (giro.x * vel.y - giro.y * vel.x);
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
