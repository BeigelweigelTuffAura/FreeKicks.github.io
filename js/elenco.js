// Elenco Lendário: notas, pé bom, especialidades e aparência de cada cobrador.
// No jogo aparecem só o apelido e o número; "referencia" serve para nós sabermos quem é quem.
//
// Atributos (0 a 99):
//   FOR força · CUR curva · QUE queda (folha seca) · PRE precisão · FRI frieza nos lances decisivos
// especiais:
//   'trivela'    curva com a parte de fora do pé sem perder qualidade
//   'semRotacao' domina a bola que "dança" (chute forte, no centro, quase sem giro)
//   'folhaSeca'  bola que sobe e cai de repente, por giro para a frente (diferente da sem rotação)
//
// visual (para o boneco):
//   pele, cabelo { estilo, cor }, barba ('nenhuma' | 'rala' | 'cheia' | 'bigode' | 'cavanhaque'), corBarba,
//   faixa (cor da faixa de cabelo ou null), altura (m), porte ('magro' | 'normal' | 'forte'),
//   coxas ('normais' | 'grossas'), chuteira, goleiro (veste camisa de goleiro)
//   estilos de cabelo: 'careca' | 'raspado' | 'curto' | 'topete' | 'moicano' | 'medio' | 'longo' | 'cacheado' | 'volumoso'

const PELE = {
  clara: '#f2c9a5',
  claraRosada: '#f0c3a0',
  bronzeada: '#e2b48a',
  morenaClara: '#d4a072',
  parda: '#b57d52',
  negra: '#7a4a2c',
  negraEscura: '#5c3820',
};

export const ELENCO = [
  // ---------- Titulares ----------
  {
    numero: 1, apelido: 'Mito', referencia: 'Rogério Ceni', posicao: 'GOL', pe: 'D', titular: true,
    atributos: { FOR: 84, CUR: 90, QUE: 76, PRE: 96, FRI: 94 },
    especiais: [], estilo: 'O goleiro artilheiro',
    visual: { pele: PELE.clara, cabelo: { estilo: 'curto', cor: '#3b2a1e' }, barba: 'nenhuma', faixa: null, altura: 1.88, porte: 'normal', coxas: 'normais', chuteira: '#111111', goleiro: true },
  },
  {
    numero: 2, apelido: 'Dani', referencia: 'Daniel Alves', posicao: 'LD', pe: 'D', titular: true,
    atributos: { FOR: 76, CUR: 77, QUE: 62, PRE: 72, FRI: 83 },
    especiais: [], estilo: 'Lateral que arrisca',
    visual: { pele: PELE.parda, cabelo: { estilo: 'curto', cor: '#e8d27a' }, barba: 'rala', corBarba: '#2a1d14', faixa: null, altura: 1.72, porte: 'magro', coxas: 'normais', chuteira: '#f7d84a' },
  },
  {
    numero: 5, apelido: 'Kaiser', referencia: 'Beckenbauer', posicao: 'ZAG', pe: 'D', titular: true,
    atributos: { FOR: 79, CUR: 68, QUE: 55, PRE: 70, FRI: 93 },
    especiais: [], estilo: 'O capitão elegante',
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'medio', cor: '#6b4a2b' }, barba: 'nenhuma', faixa: null, altura: 1.81, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 4, apelido: 'Holandês', referencia: 'Ronald Koeman', posicao: 'ZAG', pe: 'D', titular: true,
    atributos: { FOR: 99, CUR: 78, QUE: 75, PRE: 89, FRI: 97 },
    especiais: [], estilo: 'O zagueiro canhão',
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'curto', cor: '#e2c27a' }, barba: 'nenhuma', faixa: null, altura: 1.81, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 3, apelido: 'R. Larcos', referencia: 'Roberto Carlos', posicao: 'LE', pe: 'E', titular: true,
    atributos: { FOR: 99, CUR: 97, QUE: 76, PRE: 76, FRI: 90 },
    especiais: ['trivela'], estilo: 'O canhão de efeito',
    visual: { pele: PELE.negra, cabelo: { estilo: 'careca', cor: '#1a1410' }, barba: 'nenhuma', faixa: null, altura: 1.68, porte: 'forte', coxas: 'grossas', chuteira: '#ffffff' },
  },
  {
    numero: 21, apelido: 'Maestro', referencia: 'Andrea Pirlo', posicao: 'MC', pe: 'D', titular: true,
    atributos: { FOR: 77, CUR: 93, QUE: 97, PRE: 97, FRI: 96 },
    especiais: ['folhaSeca'], estilo: 'A queda maldita',
    visual: { pele: PELE.clara, cabelo: { estilo: 'longo', cor: '#3a2a1f' }, barba: 'cheia', corBarba: '#3a2a1f', faixa: null, altura: 1.77, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 23, apelido: 'Becks', referencia: 'David Beckham', posicao: 'MD', pe: 'D', titular: true,
    atributos: { FOR: 84, CUR: 99, QUE: 89, PRE: 98, FRI: 96 },
    especiais: [], estilo: 'O mestre da curva',
    visual: { pele: PELE.clara, cabelo: { estilo: 'moicano', cor: '#e0c070' }, barba: 'nenhuma', faixa: null, altura: 1.80, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 10, apelido: 'Galinho', referencia: 'Zico', posicao: 'MEI', pe: 'D', titular: true,
    atributos: { FOR: 82, CUR: 97, QUE: 94, PRE: 99, FRI: 96 },
    especiais: [], estilo: 'Colocação perfeita',
    visual: { pele: PELE.clara, cabelo: { estilo: 'medio', cor: '#2e2018' }, barba: 'nenhuma', faixa: null, altura: 1.72, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 80, apelido: 'Bruxo', referencia: 'Ronaldinho', posicao: 'ME', pe: 'D', titular: true,
    atributos: { FOR: 82, CUR: 95, QUE: 90, PRE: 94, FRI: 91 },
    especiais: [], estilo: 'Mágica por cima ou por baixo',
    visual: { pele: PELE.negra, cabelo: { estilo: 'cacheado', cor: '#1a1410' }, barba: 'nenhuma', faixa: '#ffffff', altura: 1.82, porte: 'magro', coxas: 'normais', chuteira: '#ffffff' },
  },
  {
    numero: 30, apelido: 'Pulga', referencia: 'Lionel Messi', posicao: 'ATA', pe: 'E', titular: true,
    atributos: { FOR: 80, CUR: 98, QUE: 90, PRE: 99, FRI: 96 },
    especiais: [], estilo: 'Precisão cirúrgica',
    visual: { pele: PELE.clara, cabelo: { estilo: 'curto', cor: '#4a3020' }, barba: 'cheia', corBarba: '#5a3a24', faixa: null, altura: 1.70, porte: 'magro', coxas: 'normais', chuteira: '#e63946' },
  },
  {
    numero: 7, apelido: 'Robozão', referencia: 'Cristiano Ronaldo', posicao: 'ATA', pe: 'D', titular: true,
    atributos: { FOR: 99, CUR: 73, QUE: 95, PRE: 79, FRI: 91 },
    especiais: ['semRotacao'], estilo: 'A pancada sem giro',
    visual: { pele: PELE.bronzeada, cabelo: { estilo: 'topete', cor: '#151010' }, barba: 'nenhuma', faixa: null, altura: 1.87, porte: 'forte', coxas: 'normais', chuteira: '#f39c12' },
  },

  // ---------- Reservas ----------
  {
    numero: 12, apelido: 'Chila', referencia: 'José Luis Chilavert', posicao: 'GOL', pe: 'E', titular: false,
    atributos: { FOR: 92, CUR: 76, QUE: 74, PRE: 86, FRI: 94 },
    especiais: [], estilo: 'Goleiro de pé pesado',
    visual: { pele: PELE.bronzeada, cabelo: { estilo: 'curto', cor: '#1b1410' }, barba: 'nenhuma', faixa: null, altura: 1.88, porte: 'forte', coxas: 'normais', chuteira: '#111111', goleiro: true },
  },
  {
    numero: 13, apelido: 'Nelinho', referencia: 'Nelinho', posicao: 'LD', pe: 'D', titular: false,
    atributos: { FOR: 97, CUR: 98, QUE: 75, PRE: 84, FRI: 88 },
    especiais: ['trivela'], estilo: 'A trivela impossível',
    visual: { pele: PELE.clara, cabelo: { estilo: 'volumoso', cor: '#4a3222' }, barba: 'bigode', corBarba: '#4a3222', faixa: null, altura: 1.80, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 14, apelido: 'Sinisa', referencia: 'Siniša Mihajlović', posicao: 'ZAG', pe: 'E', titular: false,
    atributos: { FOR: 96, CUR: 92, QUE: 86, PRE: 98, FRI: 94 },
    especiais: [], estilo: 'O zagueiro especialista',
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'raspado', cor: '#3a2a20' }, barba: 'nenhuma', faixa: null, altura: 1.85, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 16, apelido: 'Branco', referencia: 'Branco', posicao: 'LE', pe: 'E', titular: false,
    atributos: { FOR: 98, CUR: 79, QUE: 77, PRE: 84, FRI: 95 },
    especiais: [], estilo: 'Patada de canhota',
    visual: { pele: PELE.parda, cabelo: { estilo: 'cacheado', cor: '#1a1410' }, barba: 'nenhuma', faixa: null, altura: 1.73, porte: 'forte', coxas: 'grossas', chuteira: '#111111' },
  },
  {
    numero: 15, apelido: 'Príncipe', referencia: 'Didi', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 76, CUR: 91, QUE: 99, PRE: 95, FRI: 95 },
    especiais: ['folhaSeca'], estilo: 'O inventor da folha seca',
    visual: { pele: PELE.negraEscura, cabelo: { estilo: 'raspado', cor: '#141010' }, barba: 'nenhuma', faixa: null, altura: 1.75, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 8, apelido: 'Pernambucano', referencia: 'Juninho Pernambucano', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 95, CUR: 96, QUE: 99, PRE: 99, FRI: 97 },
    especiais: ['semRotacao'], estilo: 'O especialista absoluto',
    visual: { pele: PELE.morenaClara, cabelo: { estilo: 'curto', cor: '#1c1612' }, barba: 'nenhuma', faixa: null, altura: 1.78, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 20, apelido: 'Assunção', referencia: 'Marcos Assunção', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 88, CUR: 95, QUE: 90, PRE: 97, FRI: 92 },
    especiais: [], estilo: 'Bola parada é gol',
    visual: { pele: PELE.parda, cabelo: { estilo: 'careca', cor: '#1e1610' }, barba: 'cavanhaque', corBarba: '#1e1610', faixa: null, altura: 1.75, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 17, apelido: 'Stevie G', referencia: 'Steven Gerrard', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 96, CUR: 83, QUE: 76, PRE: 85, FRI: 97 },
    especiais: [], estilo: 'Bomba de longe',
    visual: { pele: PELE.clara, cabelo: { estilo: 'raspado', cor: '#8a5a32' }, barba: 'nenhuma', faixa: null, altura: 1.85, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 19, apelido: 'Pibe', referencia: 'Diego Maradona', posicao: 'MEI', pe: 'E', titular: false,
    atributos: { FOR: 83, CUR: 97, QUE: 92, PRE: 97, FRI: 95 },
    especiais: [], estilo: 'Canhota de ouro',
    visual: { pele: PELE.morenaClara, cabelo: { estilo: 'volumoso', cor: '#141010' }, barba: 'nenhuma', faixa: null, altura: 1.65, porte: 'forte', coxas: 'grossas', chuteira: '#111111' },
  },
  {
    numero: 11, apelido: 'Menino Ney', referencia: 'Neymar', posicao: 'ATA', pe: 'D', titular: false,
    atributos: { FOR: 79, CUR: 94, QUE: 86, PRE: 94, FRI: 88 },
    especiais: [], estilo: 'Ousadia e efeito',
    visual: { pele: PELE.parda, cabelo: { estilo: 'moicano', cor: '#d9b45a' }, barba: 'rala', corBarba: '#2a1d14', faixa: null, altura: 1.75, porte: 'magro', coxas: 'normais', chuteira: '#2ecc71' },
  },
  {
    numero: 22, apelido: 'Pinturicchio', referencia: 'Alessandro Del Piero', posicao: 'ATA', pe: 'D', titular: false,
    atributos: { FOR: 81, CUR: 96, QUE: 92, PRE: 97, FRI: 94 },
    especiais: [], estilo: 'A curva no ângulo',
    visual: { pele: PELE.clara, cabelo: { estilo: 'curto', cor: '#2a1e16' }, barba: 'nenhuma', faixa: null, altura: 1.74, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
];

// Overall: média simples das 5 notas. É só referência; não entra na física.
export function overall(jogador) {
  const a = jogador.atributos;
  return Math.round((a.FOR + a.CUR + a.QUE + a.PRE + a.FRI) / 5);
}

const limitar01 = (v) => Math.min(1, Math.max(0, v));

// Quão bom o cobrador é para ESTA falta (0 a ~100). Usa distância, lado e estilo, não o overall.
//   Perto do gol: precisa subir e cair rápido (queda e precisão).
//   Longe: precisa de força (e a bola sem rotação ajuda).
//   Pelos lados: o pé que curva a bola por fora da barreira de volta para o gol leva vantagem.
export function notaParaFalta(jogador, { distancia, angulo }, pressao = 0) {
  const a = jogador.atributos;
  const longe = limitar01((distancia - 18) / 15); // 0 = 18 m, 1 = 33 m
  const pesos = {
    FOR: 0.10 + 0.40 * longe,
    CUR: 0.25 - 0.05 * longe,
    QUE: 0.30 - 0.15 * longe,
    PRE: 0.35 - 0.20 * longe,
    FRI: 0.15 * pressao,
  };
  let soma = 0;
  let total = 0;
  for (const chave of Object.keys(pesos)) {
    soma += pesos[chave] * a[chave];
    total += pesos[chave];
  }
  let nota = soma / total;

  const especiais = jogador.especiais || [];
  if (especiais.includes('semRotacao')) nota += 4 * longe;
  if (especiais.includes('folhaSeca')) nota += 3 * (1 - longe);
  if (especiais.includes('trivela')) nota += 2 * longe;

  // Falta pela direita (ângulo > 0): o destro curva a bola por fora da barreira de volta para o gol
  if (Math.abs(angulo) > 8) {
    const peFavorecido = angulo > 0 ? 'D' : 'E';
    nota += jogador.pe === peFavorecido ? 2.5 : -1;
  }
  return Math.round(nota * 10) / 10;
}

// Lista de cobradores do melhor para o pior para esta falta
export function sugerirCobradores(jogadores, falta, pressao = 0) {
  return jogadores
    .map((jogador) => ({ jogador, nota: notaParaFalta(jogador, falta, pressao) }))
    .sort((a, b) => b.nota - a.nota);
}
