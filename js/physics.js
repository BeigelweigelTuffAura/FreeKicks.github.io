// Física da bola. Não depende do Three.js: só números, para poder ser testada sozinha.
// Eixos: x = direita de quem cobra, y = para cima, z = do gol em direção a quem cobra
// (o gol fica em z = 0 e a bola é chutada no sentido de z negativo).

const GRAUS = Math.PI / 180;
const limitar01 = (v) => Math.min(1, Math.max(0, v));
// Passagem suave de 0 (v <= a) para 1 (v >= b), sem degrau
const suave = (a, b, v) => {
  const t = limitar01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// A bola é oca: momento de inércia I = 2/3 · m · r². Diz quanto um empurrão no ponto de contato
// vira giro e quanto continua como velocidade.
const INERCIA = 2 / 3;

// Cobrador usado quando ninguém é informado: notas 85 em tudo, destro, sem especialidades
export const COBRADOR_NEUTRO = {
  pe: 'D',
  atributos: { FOR: 85, CUR: 85, QUE: 85, PRE: 85, FRI: 85 },
  especiais: [],
};

// Nota do atributo -> 0 (nota 60 ou menos) a 1 (nota 99 ou mais), em linha reta
const nivel = (nota) => limitar01((nota - 60) / 39);
// Multiplicador de um atributo: 1 para a nota 85 (o cobrador neutro).
// Da nota 60 à 99 ele muda cfg.pesoAtributos no total (0.15 = 15%): os atributos ajustam, não decidem.
const fatorAtributo = (nota, cfg) => 1 + cfg.pesoAtributos * (nivel(nota) - nivel(85));

// Tudo o que o cobrador e o ponto de contato mudam no chute, em forma de multiplicadores
function perfilDoChute(contato, cobrador, cfg) {
  const c = cobrador || COBRADOR_NEUTRO;
  const a = { ...COBRADOR_NEUTRO.atributos, ...(c.atributos || {}) };
  const especiais = c.especiais || [];

  // Pé bom: o destro curva para a esquerda com a parte de dentro do pé (pega o lado direito da bola).
  // Pegar o outro lado é a trivela (parte de fora do pé). Para o canhoto, tudo espelhado.
  const ladoDeFora = c.pe === 'E' ? contato.x : -contato.x; // > 0: trivela
  const trivela = ladoDeFora > 0 ? limitar01(ladoDeFora / 0.3) : 0; // 0 = pé natural, 1 = trivela plena
  const mestreTrivela = especiais.includes('trivela');
  const giroTrivela = mestreTrivela ? cfg.trivelaGiroEspecialista : cfg.trivelaGiro;
  const erroTrivela = mestreTrivela ? cfg.trivelaErroEspecialista : cfg.trivelaErro;

  return {
    velocidade: fatorAtributo(a.FOR, cfg),
    curva: fatorAtributo(a.CUR, cfg) * (ladoDeFora > 0 ? giroTrivela : 1),
    queda: fatorAtributo(a.QUE, cfg),
    erro: (2 - fatorAtributo(a.PRE, cfg)) * (1 + (erroTrivela - 1) * trivela),
    frieza: nivel(a.FRI),
    trivela,
    trivelaTardia: mestreTrivela ? trivela : 0,
    folhaSeca: especiais.includes('folhaSeca'),
    semRotacao: especiais.includes('semRotacao'),
  };
}

// Tamanho do cone de erro (desvio padrão, em graus) para este chute.
// Serve também para a tela desenhar o cone na mira antes do chute.
//   PRE diminui o cone; passar do ponto ideal de força aumenta (barra cheia = 1 + erroAcimaIdeal);
//   trivela de quem não domina erra mais; sob pressão o erro cresce, e a frieza corta até metade disso.
export function coneDeErro({ forca, contato = { x: 0, y: 0 }, cobrador, pressao = 0 }, cfg) {
  const p = perfilDoChute(contato, cobrador, cfg);
  const passou = limitar01((forca - cfg.forcaIdeal) / Math.max(1e-6, 1 - cfg.forcaIdeal));
  const exagero = 1 + cfg.erroAcimaIdeal * passou * passou;
  const nervosismo = 1 + limitar01(pressao) * cfg.erroPressao * (1 - 0.5 * p.frieza);
  return cfg.erroMiraBase * p.erro * exagero * nervosismo;
}

// Sorteio com distribuição normal (média 0, desvio 1) pelo método de Box-Muller.
// Usa o seno: com um sorteio fixo em 0,5 (testes) o resultado é 0, ou seja, sem erro.
function sortearNormal(aleatorio) {
  const u1 = 1 - aleatorio(); // (0, 1]: evita log(0)
  const u2 = aleatorio();
  return Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
}

// Ângulo de saída (graus) conforme a altura do contato, y de -1 (embaixo) a 1 (em cima).
//   Embaixo: sobe, pouco no começo e muito perto da ponta (cavadinha).
//   Em cima: até perto do meio da metade de cima perde pouca altura (folha seca);
//   perto do topo o pé empurra a bola contra o chão e ela sai rasteira.
function elevacaoDoContato(y, folhaSeca, cfg) {
  if (y < 0) {
    const u = -y;
    return cfg.elevacaoBase + cfg.elevacaoContatoEmbaixo * u + cfg.elevacaoCavadinha * u * u * u;
  }
  // Quem domina a folha seca perde menos ângulo e só "esmaga" a bola mais perto do topo
  const perda = cfg.elevacaoContatoEmCima * y * (folhaSeca ? cfg.folhaSecaAngulo : 1);
  const atraso = folhaSeca ? cfg.folhaSecaAtraso : 0;
  const rasteiro = suave(cfg.rasteiroInicio + atraso, Math.min(0.94, cfg.rasteiroFim + atraso), y);
  return (cfg.elevacaoBase - perda) * (1 - rasteiro) + cfg.elevacaoRasteiro * rasteiro;
}

export function criarBola(posicao) {
  return {
    pos: { ...posicao },
    vel: { x: 0, y: 0, z: 0 },
    giro: { x: 0, y: 0, z: 0 }, // rotação em rad/s; o eixo diz para onde a bola gira
    danca: null,                // oscilação da bola sem rotação (quando existe)
    curvaTardia: null,          // efeito do giro que cresce no fim do voo (queda e trivela); null depois de batidas
    cruzamento: null,           // onde o centro da bola passou pela linha do gol {x, y}
    entrouNoGol: false,         // passou a linha por dentro das traves e abaixo do travessão
    gol: false,                 // a bola inteira passou a linha
    eventos: [],                // batidas na trave, na rede e no chão, para a tela reagir
  };
}

// Dá o chute: define velocidade e giro iniciais.
//   alvo: ponto de mira {x, z} na linha do gol (pode ser fora das traves: a curva traz de volta).
//   forca: de 0 a 1 (a barra). contato: onde o pé pega na bola, {x, y} dentro de um círculo de raio 1
//   (x > 0 = lado direito da bola, y > 0 = parte de cima).
//   cobrador (opcional): { pe: 'D' | 'E', atributos: { FOR, CUR, QUE, PRE, FRI }, especiais: [...] }.
//   pressao (opcional): de 0 (treino) a 1 (lance decisivo).
// Devolve { velocidade (m/s), elevacao (graus), desvio (graus de erro na direção, + = para a direita),
//   desvioVertical (graus de erro na altura), cone (desvio padrão do erro, graus), tecnica }.
export function chutar(bola, { alvo, forca, contato = { x: 0, y: 0 }, cobrador, pressao = 0 }, cfg, aleatorio = Math.random) {
  forca = limitar01(forca);
  // O ponto de contato fica dentro da bola (círculo de raio 1)
  const raio = Math.hypot(contato.x, contato.y);
  if (raio > 1) contato = { x: contato.x / raio, y: contato.y / raio };
  const p = perfilDoChute(contato, cobrador, cfg);

  // Imprecisão: a bola sai dentro de um cone em volta da mira (na altura o erro é menor)
  const cone = coneDeErro({ forca, contato, cobrador, pressao }, cfg);
  const desvio = cone * sortearNormal(aleatorio);
  const desvioVertical = cone * cfg.erroVerticalFracao * sortearNormal(aleatorio);

  const dx = alvo.x - bola.pos.x;
  const dz = alvo.z - bola.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const mira = { x: dx / dist, z: dz / dist };
  const lado = { x: -mira.z, z: mira.x };
  const cos = Math.cos(desvio * GRAUS);
  const sen = Math.sin(desvio * GRAUS);
  const frente = { x: mira.x * cos + lado.x * sen, z: mira.z * cos + lado.z * sen }; // direção do chute
  const direita = { x: -frente.z, z: frente.x };                                      // direita de quem cobra

  // Velocidade: a força da barra, até o máximo do cobrador (FOR). Bater fora do centro troca
  // velocidade por efeito; na vertical perde menos, para o rasteiro sair rápido.
  const distanciaDoCentro = Math.min(1, Math.hypot(contato.x, contato.y));
  const velocidadeMax = cfg.velocidadeMax * p.velocidade;
  const velocidadeBase = cfg.velocidadeMin + (velocidadeMax - cfg.velocidadeMin) * forca;
  const fora = contato.x * contato.x + 0.5 * contato.y * contato.y;
  const velocidade = velocidadeBase * (1 - cfg.perdaVelocidadeContato * Math.min(1, fora));

  const elevacaoNominal = elevacaoDoContato(contato.y, p.folhaSeca, cfg);
  const elevacao = (elevacaoNominal + desvioVertical) * GRAUS;
  const horizontal = velocidade * Math.cos(elevacao);
  bola.vel = {
    x: frente.x * horizontal,
    y: velocidade * Math.sin(elevacao),
    z: frente.z * horizontal,
  };

  // Bola sem rotação: contato bem no centro e chute forte. Quem domina a técnica tem uma zona
  // maior, consegue com menos força e a bola dança mais; para os outros ela dança menos.
  const zona = cfg.semRotacaoRaio * (p.semRotacao ? cfg.semRotacaoZonaEspecialista : 1);
  const forcaMinima = cfg.semRotacaoForcaMinima - (p.semRotacao ? cfg.semRotacaoForcaEspecialista : 0);
  const noCentro = limitar01(1 - distanciaDoCentro / zona);
  const forte = limitar01((forca - forcaMinima) / Math.max(1e-6, 1 - forcaMinima));
  const semRotacao = noCentro * forte;

  // Giro: contato à direita gira a bola em torno do eixo vertical e ela curva para a esquerda;
  // contato em cima gira para a frente (cai), embaixo gira para trás (flutua).
  // Na bola sem rotação o pé "espeta" o centro e quase não sobra giro.
  const restaGiro = 1 - semRotacao;
  const lateral = contato.x * cfg.giroLateralMax * p.curva * restaGiro;
  const vertical = contato.y >= 0
    ? contato.y * cfg.giroVerticalMax * p.queda * (p.folhaSeca ? cfg.folhaSecaGiro : 1) * restaGiro
    : contato.y * cfg.giroEmbaixoMax * restaGiro;
  bola.giro = {
    x: -vertical * direita.x,
    y: lateral,
    z: -vertical * direita.z,
  };

  // Efeito que aparece mais no fim do voo (veja passo): a folha seca segura e depois despenca;
  // a trivela de especialista sai mais reta e curva mais tarde
  bola.curvaTardia = { v0: velocidade, trivela: p.trivelaTardia };

  const amplitude = p.semRotacao ? cfg.semRotacaoEspecialista : cfg.semRotacaoComum;
  bola.danca = semRotacao > 0
    ? {
      intensidade: semRotacao * amplitude,
      t: 0,
      freq1: 9 + aleatorio() * 6,   // rad/s: algumas oscilações durante o voo
      freq2: 7 + aleatorio() * 6,
      fase1: aleatorio() * Math.PI * 2,
      fase2: aleatorio() * Math.PI * 2,
    }
    : null;

  const tecnica = nomearTecnica({ forca, contato, elevacaoNominal, trivela: p.trivela, semRotacao }, cfg);
  return { velocidade, elevacao: elevacao / GRAUS, desvio, desvioVertical, cone, tecnica };
}

// Nome da jogada, para a tela anunciar
function nomearTecnica({ forca, contato, elevacaoNominal, trivela, semRotacao }, cfg) {
  const lado = Math.abs(contato.x);
  if (elevacaoNominal <= cfg.elevacaoRasteiro + 4) return 'rasteiro';
  if (contato.y <= -0.55 && forca < 0.5) return 'cavadinha';
  if (trivela > 0 && lado >= 0.25) return 'trivela';
  if (semRotacao >= 0.25) return 'semRotacao';
  if (contato.y >= 0.25 && contato.y >= lado * 0.8) return 'folhaSeca';
  if (lado >= 0.25) return 'curva';
  if (forca >= cfg.forcaIdeal) return 'pancada';
  return 'colocado';
}

export function noChao(bola, cfg) {
  return bola.pos.y <= cfg.raioBola + 1e-4 && Math.abs(bola.vel.y) < 1e-3;
}

// Quebra a velocidade em parte "contra a superfície" (normal n) e parte "ao longo dela".
// A parte normal volta multiplicada por restituicao; a outra é multiplicada por atrito.
// Devolve a velocidade da batida (0 se a bola já estava se afastando).
function rebater(vel, n, restituicao, atrito) {
  const vn = vel.x * n.x + vel.y * n.y + vel.z * n.z;
  if (vn >= 0) return 0;
  const tx = vel.x - vn * n.x;
  const ty = vel.y - vn * n.y;
  const tz = vel.z - vn * n.z;
  vel.x = tx * atrito - vn * restituicao * n.x;
  vel.y = ty * atrito - vn * restituicao * n.y;
  vel.z = tz * atrito - vn * restituicao * n.z;
  return -vn;
}

// Traves e travessão: cilindros brancos na linha do gol (z = 0)
function colidirComTraves(bola, cfg) {
  const { pos, vel, giro } = bola;
  const meia = cfg.golLargura / 2;
  const A = cfg.golAltura;
  const R = cfg.raioTrave;
  const minimo = R + cfg.raioBola;
  const bater = (tipo, n) => {
    const impacto = rebater(vel, n, cfg.quiqueTrave, 0.85);
    if (impacto > 0.5) {
      bola.eventos.push({ tipo, impacto });
      giro.x *= 0.4;
      giro.y *= 0.4;
      giro.z *= 0.4;
      bola.danca = null;
      bola.curvaTardia = null;
    }
  };

  for (const lado of [-1, 1]) {
    const cx = lado * (meia + R);
    const dx = pos.x - cx;
    const d = Math.hypot(dx, pos.z);
    if (pos.y <= A + R && d < minimo && d > 1e-6) {
      const n = { x: dx / d, y: 0, z: pos.z / d };
      pos.x = cx + n.x * minimo;
      pos.z = n.z * minimo;
      bater('trave', n);
    }
  }

  if (Math.abs(pos.x) <= meia + 2 * R) {
    const dy = pos.y - (A + R);
    const d = Math.hypot(dy, pos.z);
    if (d < minimo && d > 1e-6) {
      const n = { x: 0, y: dy / d, z: pos.z / d };
      pos.y = A + R + n.y * minimo;
      pos.z = n.z * minimo;
      bater('travessao', n);
    }
  }
}

// Rede: o fundo é macio e estufa; as laterais e o teto seguram a bola por dentro e por fora
function colidirComRede(bola, cfg, anterior, dt) {
  const { pos, vel } = bola;
  const meia = cfg.golLargura / 2;
  const A = cfg.golAltura;
  const P = cfg.golProfundidade;
  const r = cfg.raioBola;

  if (!bola.cruzamento && anterior.z >= 0 && pos.z < 0) {
    bola.cruzamento = { x: pos.x, y: pos.y };
    if (Math.abs(pos.x) < meia && pos.y < A) bola.entrouNoGol = true;
  }
  if (bola.entrouNoGol && pos.z < -r) bola.gol = true;
  if (pos.z >= 0 || pos.z < -P - 1) return;

  const segurar = (eixo, valor, sentido) => {
    pos[eixo] = valor;
    if (vel[eixo] * sentido > 0) {
      vel[eixo] *= -0.1;
      for (const outro of ['x', 'y', 'z']) if (outro !== eixo) vel[outro] *= 0.6;
      bola.eventos.push({ tipo: 'rede' });
    }
  };

  if (bola.entrouNoGol) {
    // Fundo da rede: funciona como uma mola amortecida, então a bola afunda e a rede estufa
    const afundou = -P + r - pos.z;
    if (afundou > 0) {
      // (o amortecimento entra de forma implícita: estável mesmo com passos grandes)
      vel.z = (vel.z + cfg.redeRigidez * afundou * dt) / (1 + 2 * Math.sqrt(cfg.redeRigidez) * dt);
      const atrito = Math.exp(-6 * dt);
      vel.x *= atrito;
      vel.y *= atrito;
      bola.eventos.push({ tipo: 'fundo', x: pos.x, y: pos.y, afundou });
    }
    for (const lado of [-1, 1]) {
      if (lado * pos.x > meia - r) segurar('x', lado * (meia - r), lado);
    }
    if (pos.y > A - r) segurar('y', A - r, 1);
  } else if (pos.z > -P - r) {
    // Por fora: a bola que vem de lado bate na rede lateral; a que cai por cima para no teto
    for (const lado of [-1, 1]) {
      const x = lado * pos.x;
      if (x > meia && x < meia + r && pos.y < A + r) segurar('x', lado * (meia + r), -lado);
    }
    if (Math.abs(pos.x) < meia && pos.y > A && pos.y < A + r) segurar('y', A + r, -1);
  }
}

// ---------- Gramado ----------
// O ponto da bola que toca a grama pode escorregar. O atrito empurra esse ponto contra o
// escorregamento: tira velocidade e põe giro (ou o contrário) até a bola rolar sem escorregar.
//   Giro para a frente maior que o da rolagem: a grama "puxa" e a bola ganha velocidade.
//   Giro para trás: a grama freia forte e a bola pode até "segurar".

// Velocidade (horizontal) do ponto da bola que toca o chão
function escorregamento(vel, giro, r) {
  return { x: vel.x + r * giro.z, z: vel.z - r * giro.x };
}

// Aplica atrito no ponto de contato com o chão: no máximo `limite` (m/s de mudança na velocidade),
// e nunca mais que o necessário para a bola passar a rolar. Devolve true se ela ficou rolando.
function atritarNoChao(vel, giro, limite, r) {
  const s = escorregamento(vel, giro, r);
  const modulo = Math.hypot(s.x, s.z);
  if (modulo < 1e-6) return true;
  // Um impulso j contra o escorregamento reduz o escorregamento em j·(1 + 1/INERCIA)
  const paraRolar = modulo / (1 + 1 / INERCIA);
  const j = Math.min(limite, paraRolar);
  const jx = (-s.x / modulo) * j;
  const jz = (-s.z / modulo) * j;
  vel.x += jx;
  vel.z += jz;
  giro.x -= jz / (INERCIA * r);
  giro.z += jx / (INERCIA * r);
  return j >= paraRolar;
}

// Quanto a bola volta ao quicar: batida lenta volta mais, batida forte volta menos (a grama amassa)
function restituicaoDoChao(impacto, cfg) {
  const t = limitar01(impacto / cfg.quiqueChaoVelocidade);
  return cfg.quiqueChao + (cfg.quiqueChaoForte - cfg.quiqueChao) * t;
}

function tratarChao(bola, dt, cfg) {
  const { pos, vel, giro } = bola;
  const r = cfg.raioBola;
  if (pos.y > r) return;
  pos.y = r;
  if (vel.y < 0) {
    // Quique: a parte vertical volta conforme a restituição; o atrito da batida é limitado pela
    // força da batida (quanto mais forte o quique, mais a grama mexe na velocidade e no giro)
    const impacto = -vel.y;
    let volta = impacto * restituicaoDoChao(impacto, cfg);
    if (volta < 0.5) volta = 0; // quique pequeno demais: a bola assenta e passa a rolar
    atritarNoChao(vel, giro, cfg.atritoDeslize * (impacto + volta), r);
    vel.y = volta;
    if (impacto > 1.5) bola.eventos.push({ tipo: 'quique', impacto });
    bola.danca = null;
    bola.curvaTardia = null;
  }
  if (vel.y > 1e-3) return;

  // Apoiada na grama: escorrega com atrito até rolar; rolando, a grama freia aos poucos
  vel.y = 0;
  bola.danca = null;
  const rolando = atritarNoChao(vel, giro, cfg.atritoDeslize * cfg.gravidade * dt, r);
  if (rolando) {
    const rapidez = Math.hypot(vel.x, vel.z);
    const freada = cfg.atritoGrama * dt;
    const fator = rapidez > freada ? (rapidez - freada) / rapidez : 0;
    vel.x *= fator;
    vel.z *= fator;
    // Rolando sem escorregar: o giro acompanha a velocidade (é ele que a tela mostra)
    giro.x = vel.z / r;
    giro.z = -vel.x / r;
  }
  // O giro em pé (o da curva) morre rápido com a bola raspando na grama
  giro.y *= Math.exp(-3 * dt);
}

// Avança a simulação em dt segundos (use passos pequenos: 1/240 s).
export function passo(bola, dt, cfg) {
  const { pos, vel, giro } = bola;
  const anterior = { ...pos };
  const apoiada = noChao(bola, cfg);
  const rapidez = Math.hypot(vel.x, vel.y, vel.z);

  // Gravidade e arrasto do ar (proporcional a |v|·v)
  let ax = -cfg.arrasto * rapidez * vel.x;
  let ay = -cfg.gravidade - cfg.arrasto * rapidez * vel.y;
  let az = -cfg.arrasto * rapidez * vel.z;

  // Efeito Magnus: o giro empurra a bola na direção de (giro × velocidade).
  // No chão só conta o giro em pé (curva): o resto é a própria rolagem.
  let gx = apoiada ? 0 : giro.x;
  let gy = giro.y;
  let gz = apoiada ? 0 : giro.z;
  const tardio = bola.curvaTardia;
  if (tardio && rapidez > 1) {
    // Quando a bola perde velocidade, o ar "agarra" mais e o efeito aparece de repente
    // (crise do arrasto). Giro para a frente ou para trás: começa fraco e cresce no fim do voo.
    const razao = tardio.v0 / rapidez;
    const queda = Math.min(cfg.efeitoTardioMax, cfg.quedaTardiaInicio * razao ** cfg.quedaTardia);
    gx *= queda;
    gz *= queda;
    // Trivela de especialista: a curva também começa mais fraca e cresce no fim
    if (tardio.trivela > 0) {
      const curva = Math.min(cfg.efeitoTardioMax, cfg.trivelaTardiaInicio * razao ** cfg.trivelaTardia);
      gy *= 1 + tardio.trivela * (curva - 1);
    }
  }
  // Giro muito alto para a velocidade não aumenta o efeito sem limite (como na bola de verdade)
  const giroRelativo = (cfg.raioBola * Math.hypot(gx, gy, gz)) / Math.max(rapidez, 0.5);
  const magnus = cfg.magnus * (giroRelativo > cfg.magnusLimite ? cfg.magnusLimite / giroRelativo : 1);
  ax += magnus * (gy * vel.z - gz * vel.y);
  ay += magnus * (gz * vel.x - gx * vel.z);
  az += magnus * (gx * vel.y - gy * vel.x);

  // Bola sem rotação: empurrões que mudam de lado, mais fortes quanto mais rápida a bola
  const d = bola.danca;
  if (d && !apoiada && rapidez > 1) {
    d.t += dt;
    const forcaDanca = cfg.semRotacaoAmplitude * d.intensidade * (rapidez / 28) ** 2;
    const rapidezChao = Math.hypot(vel.x, vel.z) || 1;
    const lado = Math.sin(d.freq1 * d.t + d.fase1) * forcaDanca;
    const cima = Math.sin(d.freq2 * d.t + d.fase2) * forcaDanca * 0.5;
    // Sem giro, o ar "solta" a bola no fim do voo e ela cai de repente (diferente da folha seca,
    // que cai pelo giro para a frente): é o que deixa bater forte de longe e ainda entrar
    const cai = cfg.semRotacaoQueda * d.intensidade * suave(0.25, 0.75, d.t);
    ax += (-vel.z / rapidezChao) * lado;
    az += (vel.x / rapidezChao) * lado;
    ay += cima - cai;
  }

  // Apoiada na grama, o chão segura o peso: nada de afundar a cada passo
  if (apoiada && ay < 0) ay = 0;

  // Posição pela média da velocidade antes e depois do passo: o resultado quase não muda
  // com o tamanho do passo (1/120 s na previsão do goleiro, 1/240 s no jogo)
  const vx0 = vel.x;
  const vy0 = vel.y;
  const vz0 = vel.z;
  vel.x += ax * dt;
  vel.y += ay * dt;
  vel.z += az * dt;
  pos.x += (vx0 + vel.x) * 0.5 * dt;
  pos.y += (vy0 + vel.y) * 0.5 * dt;
  pos.z += (vz0 + vel.z) * 0.5 * dt;

  colidirComTraves(bola, cfg);
  colidirComRede(bola, cfg, anterior, dt);

  // No ar o giro perde força devagar
  if (pos.y > cfg.raioBola) {
    const perda = Math.max(0, 1 - cfg.decaimentoGiro * dt);
    giro.x *= perda;
    giro.y *= perda;
    giro.z *= perda;
  }

  tratarChao(bola, dt, cfg);
}
