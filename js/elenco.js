// Elenco Lendário: notas, pé bom, especialidades e aparência de cada cobrador.
// Nomes no estilo do PES antigo: quase o real, com uma letra trocada (nome = na tela, nomeCamisa = nas costas).
// "apelido" é o tempero que aparece junto; "referencia" é o nome real, só para nós (não aparece no jogo).
// Antes de publicar em loja, revisar os nomes (veja PROJETO.md, "Decisão pendente: nomes dos jogadores").
//
// Atributos (0 a 99):
//   FOR força · CUR curva · QUE queda (folha seca) · PRE precisão · FRI frieza nos lances decisivos
// especiais:
//   'trivela'    curva com a parte de fora do pé sem perder qualidade
//   'semRotacao' domina a bola que "dança" (chute forte, no centro, quase sem giro)
//   'folhaSeca'  bola que sobe e cai de repente, por giro para a frente (diferente da sem rotação)
//
// uniforme: camisa inspirada no time em que o jogador foi mais marcante (só cores e padrões, sem escudo nem nome no jogo)
//   padrao: 'liso' | 'listras' (verticais) | 'aros' (horizontais) | 'faixa' (faixa no peito, até 3 cores) |
//           'diagonal' (faixa em diagonal) | 'v' (V no peito); cores: cores do padrão sobre a cor da camisa
//
// cobranca: o jeito de bater de cada um (para a animação)
//   postura antes da corrida: 'normal' | 'ereto' | 'calmo' | 'concentrado' | 'curvado' | 'agachado' |
//     'lateral' (de lado para o gol, Ronaldinho) | 'pernasAbertas' (Cristiano) | 'bracosAbertos' (Beckham)
//   distancia (m) e angulo (graus) da corrida; passos até a bola; ritmo (1 = normal, mais = mais rápido)
//   batida padrão: 'chapa' (parte de dentro, curva) | 'peito' (peito do pé) | 'pancada' (peito do pé, com tudo) |
//     'semGiro' (tornozelo travado, terminação curta) | 'trivela' (parte de fora / três dedos)
//   braco: 'normal' | 'aberto' (braço do lado do pé de apoio bem aberto no chute, Beckham e Roberto Carlos)
//   assinatura: frase curta para a interface
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
    numero: 1, apelido: 'Mito', nome: 'Rogério Seni', nomeCamisa: 'SENI', referencia: 'Rogério Ceni', posicao: 'GOL', pe: 'D', titular: true,
    atributos: { FOR: 84, CUR: 90, QUE: 76, PRE: 96, FRI: 94 },
    especiais: [], estilo: 'O goleiro artilheiro',
    uniforme: { clube: 'São Paulo (goleiro)', padrao: 'faixa', camisa: '#2a2e35', cores: ['#d0021b', '#ffffff', '#111111'], calcao: '#2a2e35', meiao: '#2a2e35', numero: '#ffffff', gola: '#d0021b' },
    cobranca: { postura: 'concentrado', distancia: 4.2, angulo: 28, passos: 6, ritmo: 1.0, batida: 'chapa', braco: 'normal', assinatura: 'Sai do gol, corrida longa e batida colocada' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'curto', cor: '#3b2a1e' }, barba: 'nenhuma', faixa: null, altura: 1.88, porte: 'normal', coxas: 'normais', chuteira: '#111111', goleiro: true },
  },
  {
    numero: 2, apelido: 'Dani', nome: 'Daniel Alvez', nomeCamisa: 'ALVEZ', referencia: 'Daniel Alves', posicao: 'LD', pe: 'D', titular: true,
    atributos: { FOR: 76, CUR: 77, QUE: 62, PRE: 72, FRI: 83 },
    especiais: [], estilo: 'Lateral que arrisca',
    uniforme: { clube: 'Barcelona', padrao: 'listras', camisa: '#a50044', cores: ['#004d98'], calcao: '#004d98', meiao: '#004d98', numero: '#f7d84a', gola: '#004d98' },
    cobranca: { postura: 'normal', distancia: 2.4, angulo: 32, passos: 4, ritmo: 1.1, batida: 'chapa', braco: 'normal', assinatura: 'Corridinha curta e ligeira' },
    visual: { pele: PELE.parda, cabelo: { estilo: 'curto', cor: '#e8d27a' }, barba: 'rala', corBarba: '#2a1d14', faixa: null, altura: 1.72, porte: 'magro', coxas: 'normais', chuteira: '#f7d84a' },
  },
  {
    numero: 5, apelido: 'Kaiser', nome: 'Bekenbauer', nomeCamisa: 'BEKENBAUER', referencia: 'Beckenbauer', posicao: 'ZAG', pe: 'D', titular: true,
    atributos: { FOR: 79, CUR: 68, QUE: 55, PRE: 70, FRI: 93 },
    especiais: [], estilo: 'O capitão elegante',
    uniforme: { clube: 'Alemanha', padrao: 'liso', camisa: '#f5f5f5', cores: [], calcao: '#111111', meiao: '#f5f5f5', numero: '#111111', gola: '#111111' },
    cobranca: { postura: 'ereto', distancia: 2.6, angulo: 25, passos: 4, ritmo: 0.9, batida: 'peito', braco: 'normal', assinatura: 'Postura elegante, de cabeça erguida' },
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'medio', cor: '#6b4a2b' }, barba: 'nenhuma', faixa: null, altura: 1.81, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 4, apelido: 'Holandês', nome: 'Ronald Koemann', nomeCamisa: 'KOEMANN', referencia: 'Ronald Koeman', posicao: 'ZAG', pe: 'D', titular: true,
    atributos: { FOR: 99, CUR: 78, QUE: 75, PRE: 89, FRI: 97 },
    especiais: [], estilo: 'O zagueiro canhão',
    uniforme: { clube: 'Barcelona', padrao: 'listras', camisa: '#a50044', cores: ['#004d98'], calcao: '#004d98', meiao: '#004d98', numero: '#f7d84a', gola: '#004d98' },
    cobranca: { postura: 'ereto', distancia: 4.2, angulo: 12, passos: 6, ritmo: 1.15, batida: 'pancada', braco: 'normal', assinatura: 'Corrida reta e longa para a pancada' },
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'curto', cor: '#e2c27a' }, barba: 'nenhuma', faixa: null, altura: 1.81, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 3, apelido: 'Canhão', nome: 'Roberto Larcos', nomeCamisa: 'R. LARCOS', referencia: 'Roberto Carlos', posicao: 'LE', pe: 'E', titular: true,
    atributos: { FOR: 99, CUR: 97, QUE: 76, PRE: 76, FRI: 90 },
    especiais: ['trivela'], estilo: 'O canhão de efeito',
    uniforme: { clube: 'Real Madrid', padrao: 'liso', camisa: '#f8f8f8', cores: [], calcao: '#f8f8f8', meiao: '#f8f8f8', numero: '#3b2a70', gola: '#d4af37' },
    cobranca: { postura: 'agachado', distancia: 5.5, angulo: 18, passos: 8, ritmo: 1.35, batida: 'trivela', braco: 'aberto', assinatura: 'Corrida enorme e explosão de três dedos' },
    visual: { pele: PELE.negra, cabelo: { estilo: 'careca', cor: '#1a1410' }, barba: 'nenhuma', faixa: null, altura: 1.68, porte: 'forte', coxas: 'grossas', chuteira: '#ffffff' },
  },
  {
    numero: 21, apelido: 'Maestro', nome: 'Andrea Pirllo', nomeCamisa: 'PIRLLO', referencia: 'Andrea Pirlo', posicao: 'MC', pe: 'D', titular: true,
    atributos: { FOR: 77, CUR: 93, QUE: 97, PRE: 97, FRI: 96 },
    especiais: ['folhaSeca'], estilo: 'A queda maldita',
    uniforme: { clube: 'Milan', padrao: 'listras', camisa: '#c4142b', cores: ['#151515'], calcao: '#ffffff', meiao: '#151515', numero: '#ffffff', gola: '#151515' },
    cobranca: { postura: 'calmo', distancia: 1.8, angulo: 30, passos: 3, ritmo: 0.75, batida: 'semGiro', braco: 'normal', assinatura: 'Quase caminhando, sem pressa nenhuma' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'longo', cor: '#3a2a1f' }, barba: 'cheia', corBarba: '#3a2a1f', faixa: null, altura: 1.77, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 23, apelido: 'Becks', nome: 'David Beckam', nomeCamisa: 'BECKAM', referencia: 'David Beckham', posicao: 'MD', pe: 'D', titular: true,
    atributos: { FOR: 84, CUR: 99, QUE: 89, PRE: 98, FRI: 96 },
    especiais: [], estilo: 'O mestre da curva',
    uniforme: { clube: 'Manchester United', padrao: 'liso', camisa: '#da291c', cores: [], calcao: '#ffffff', meiao: '#111111', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'bracosAbertos', distancia: 3.6, angulo: 48, passos: 4, ritmo: 0.95, batida: 'chapa', braco: 'aberto', assinatura: 'Chega de longe, passos largos e braço aberto' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'moicano', cor: '#e0c070' }, barba: 'nenhuma', faixa: null, altura: 1.80, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 10, apelido: 'Galinho', nome: 'Zicco', nomeCamisa: 'ZICCO', referencia: 'Zico', posicao: 'MEI', pe: 'D', titular: true,
    atributos: { FOR: 82, CUR: 97, QUE: 94, PRE: 99, FRI: 96 },
    especiais: [], estilo: 'Colocação perfeita',
    uniforme: { clube: 'Flamengo', padrao: 'aros', camisa: '#c4142b', cores: ['#111111'], calcao: '#ffffff', meiao: '#c4142b', numero: '#ffffff', gola: '#111111' },
    cobranca: { postura: 'normal', distancia: 2.2, angulo: 35, passos: 3, ritmo: 0.95, batida: 'chapa', braco: 'normal', assinatura: 'Três passos e a bola no ângulo' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'medio', cor: '#2e2018' }, barba: 'nenhuma', faixa: null, altura: 1.72, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 80, apelido: 'Bruxo', nome: 'Ronaldiño', nomeCamisa: 'RONALDIÑO', referencia: 'Ronaldinho', posicao: 'ME', pe: 'D', titular: true,
    atributos: { FOR: 82, CUR: 95, QUE: 90, PRE: 94, FRI: 91 },
    especiais: [], estilo: 'Mágica por cima ou por baixo',
    uniforme: { clube: 'Barcelona', padrao: 'listras', camisa: '#a50044', cores: ['#004d98'], calcao: '#004d98', meiao: '#004d98', numero: '#f7d84a', gola: '#004d98' },
    cobranca: { postura: 'lateral', distancia: 0.9, angulo: 70, passos: 2, ritmo: 0.8, batida: 'chapa', braco: 'normal', assinatura: 'Parado de lado, quase sem corrida' },
    visual: { pele: PELE.negra, cabelo: { estilo: 'cacheado', cor: '#1a1410' }, barba: 'nenhuma', faixa: '#ffffff', altura: 1.82, porte: 'magro', coxas: 'normais', chuteira: '#ffffff' },
  },
  {
    numero: 30, apelido: 'Pulga', nome: 'Lionel Mesi', nomeCamisa: 'MESI', referencia: 'Lionel Messi', posicao: 'ATA', pe: 'E', titular: true,
    atributos: { FOR: 80, CUR: 98, QUE: 90, PRE: 99, FRI: 96 },
    especiais: [], estilo: 'Precisão cirúrgica',
    uniforme: { clube: 'Barcelona', padrao: 'listras', camisa: '#a50044', cores: ['#004d98'], calcao: '#004d98', meiao: '#004d98', numero: '#f7d84a', gola: '#004d98' },
    cobranca: { postura: 'curvado', distancia: 1.9, angulo: 32, passos: 4, ritmo: 1.2, batida: 'chapa', braco: 'normal', assinatura: 'Passinhos curtos e chute compacto' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'curto', cor: '#4a3020' }, barba: 'cheia', corBarba: '#5a3a24', faixa: null, altura: 1.70, porte: 'magro', coxas: 'normais', chuteira: '#e63946' },
  },
  {
    numero: 7, apelido: 'Robozão', nome: 'Cristiano Ronaldu', nomeCamisa: 'RONALDU', referencia: 'Cristiano Ronaldo', posicao: 'ATA', pe: 'D', titular: true,
    atributos: { FOR: 99, CUR: 73, QUE: 95, PRE: 79, FRI: 91 },
    especiais: ['semRotacao'], estilo: 'A pancada sem giro',
    uniforme: { clube: 'Real Madrid', padrao: 'liso', camisa: '#f8f8f8', cores: [], calcao: '#f8f8f8', meiao: '#f8f8f8', numero: '#3b2a70', gola: '#d4af37' },
    cobranca: { postura: 'pernasAbertas', distancia: 3.0, angulo: 10, passos: 5, ritmo: 1.1, batida: 'semGiro', braco: 'normal', assinatura: 'Pernas abertas, respira e explode' },
    visual: { pele: PELE.bronzeada, cabelo: { estilo: 'topete', cor: '#151010' }, barba: 'nenhuma', faixa: null, altura: 1.87, porte: 'forte', coxas: 'normais', chuteira: '#f39c12' },
  },

  // ---------- Reservas ----------
  {
    numero: 12, apelido: 'Chila', nome: 'José Luis Chilabert', nomeCamisa: 'CHILABERT', referencia: 'José Luis Chilavert', posicao: 'GOL', pe: 'E', titular: false,
    atributos: { FOR: 92, CUR: 76, QUE: 74, PRE: 86, FRI: 94 },
    especiais: [], estilo: 'Goleiro de pé pesado',
    uniforme: { clube: 'Vélez (goleiro)', padrao: 'v', camisa: '#1d3f8f', cores: ['#ffffff'], calcao: '#1d3f8f', meiao: '#1d3f8f', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'ereto', distancia: 4.5, angulo: 20, passos: 6, ritmo: 1.05, batida: 'peito', braco: 'normal', assinatura: 'Atravessa o campo e solta a bomba' },
    visual: { pele: PELE.bronzeada, cabelo: { estilo: 'curto', cor: '#1b1410' }, barba: 'nenhuma', faixa: null, altura: 1.88, porte: 'forte', coxas: 'normais', chuteira: '#111111', goleiro: true },
  },
  {
    numero: 13, apelido: 'Rei da Trivela', nome: 'Nelinho', nomeCamisa: 'NELINHO', referencia: 'Nelinho', posicao: 'LD', pe: 'D', titular: false,
    atributos: { FOR: 97, CUR: 98, QUE: 75, PRE: 84, FRI: 88 },
    especiais: ['trivela'], estilo: 'A trivela impossível',
    uniforme: { clube: 'Cruzeiro', padrao: 'liso', camisa: '#0033a0', cores: [], calcao: '#ffffff', meiao: '#ffffff', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'normal', distancia: 3.2, angulo: 15, passos: 5, ritmo: 1.1, batida: 'trivela', braco: 'normal', assinatura: 'Trivela de três dedos' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'volumoso', cor: '#4a3222' }, barba: 'bigode', corBarba: '#4a3222', faixa: null, altura: 1.80, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 14, apelido: 'Sérvio', nome: 'Sinisa Mihajlovich', nomeCamisa: 'MIHAJLOVICH', referencia: 'Siniša Mihajlović', posicao: 'ZAG', pe: 'E', titular: false,
    atributos: { FOR: 96, CUR: 92, QUE: 86, PRE: 98, FRI: 94 },
    especiais: [], estilo: 'O zagueiro especialista',
    uniforme: { clube: 'Lazio', padrao: 'liso', camisa: '#87ceeb', cores: [], calcao: '#ffffff', meiao: '#87ceeb', numero: '#1d2a4d', gola: '#ffffff' },
    cobranca: { postura: 'ereto', distancia: 2.4, angulo: 25, passos: 4, ritmo: 1.0, batida: 'peito', braco: 'normal', assinatura: 'Canhota calma e precisa' },
    visual: { pele: PELE.claraRosada, cabelo: { estilo: 'raspado', cor: '#3a2a20' }, barba: 'nenhuma', faixa: null, altura: 1.85, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 16, apelido: 'Patada', nome: 'Branko', nomeCamisa: 'BRANKO', referencia: 'Branco', posicao: 'LE', pe: 'E', titular: false,
    atributos: { FOR: 98, CUR: 79, QUE: 77, PRE: 84, FRI: 95 },
    especiais: [], estilo: 'Patada de canhota',
    uniforme: { clube: 'Brasil', padrao: 'liso', camisa: '#ffdf00', cores: [], calcao: '#0033a0', meiao: '#ffffff', numero: '#009c3b', gola: '#009c3b' },
    cobranca: { postura: 'agachado', distancia: 4.0, angulo: 15, passos: 6, ritmo: 1.25, batida: 'pancada', braco: 'normal', assinatura: 'Corrida longa e patada' },
    visual: { pele: PELE.parda, cabelo: { estilo: 'cacheado', cor: '#1a1410' }, barba: 'nenhuma', faixa: null, altura: 1.73, porte: 'forte', coxas: 'grossas', chuteira: '#111111' },
  },
  {
    numero: 15, apelido: 'Príncipe', nome: 'Didi', nomeCamisa: 'DIDI', referencia: 'Didi', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 76, CUR: 91, QUE: 99, PRE: 95, FRI: 95 },
    especiais: ['folhaSeca'], estilo: 'O inventor da folha seca',
    uniforme: { clube: 'Botafogo', padrao: 'listras', camisa: '#ffffff', cores: ['#111111'], calcao: '#111111', meiao: '#9a9a9a', numero: '#ffffff', gola: '#111111' },
    cobranca: { postura: 'calmo', distancia: 2.0, angulo: 25, passos: 3, ritmo: 0.85, batida: 'trivela', braco: 'normal', assinatura: 'Folha seca de três dedos' },
    visual: { pele: PELE.negraEscura, cabelo: { estilo: 'raspado', cor: '#141010' }, barba: 'nenhuma', faixa: null, altura: 1.75, porte: 'magro', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 8, apelido: 'Rei da Falta', nome: 'Juninho Pernambucano', nomeCamisa: 'JUNINHO', referencia: 'Juninho Pernambucano', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 95, CUR: 96, QUE: 99, PRE: 99, FRI: 97 },
    especiais: ['semRotacao'], estilo: 'O especialista absoluto',
    uniforme: { clube: 'Vasco', padrao: 'diagonal', camisa: '#111111', cores: ['#ffffff'], calcao: '#111111', meiao: '#111111', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'concentrado', distancia: 2.2, angulo: 20, passos: 3, ritmo: 1.0, batida: 'semGiro', braco: 'normal', assinatura: 'Poucos passos e a bola que dança' },
    visual: { pele: PELE.morenaClara, cabelo: { estilo: 'curto', cor: '#1c1612' }, barba: 'nenhuma', faixa: null, altura: 1.78, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 20, apelido: 'Pé Calibrado', nome: 'Marcos Asunção', nomeCamisa: 'ASUNÇÃO', referencia: 'Marcos Assunção', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 88, CUR: 95, QUE: 90, PRE: 97, FRI: 92 },
    especiais: [], estilo: 'Bola parada é gol',
    uniforme: { clube: 'Palmeiras', padrao: 'liso', camisa: '#006437', cores: [], calcao: '#ffffff', meiao: '#006437', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'calmo', distancia: 2.0, angulo: 30, passos: 3, ritmo: 0.9, batida: 'chapa', braco: 'normal', assinatura: 'Corrida curta e bola na gaveta' },
    visual: { pele: PELE.parda, cabelo: { estilo: 'careca', cor: '#1e1610' }, barba: 'cavanhaque', corBarba: '#1e1610', faixa: null, altura: 1.75, porte: 'normal', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 17, apelido: 'Stevie G', nome: 'Steven Gerard', nomeCamisa: 'GERARD', referencia: 'Steven Gerrard', posicao: 'MC', pe: 'D', titular: false,
    atributos: { FOR: 96, CUR: 83, QUE: 76, PRE: 85, FRI: 97 },
    especiais: [], estilo: 'Bomba de longe',
    uniforme: { clube: 'Liverpool', padrao: 'liso', camisa: '#c8102e', cores: [], calcao: '#c8102e', meiao: '#c8102e', numero: '#ffffff', gola: '#ffffff' },
    cobranca: { postura: 'ereto', distancia: 3.4, angulo: 18, passos: 5, ritmo: 1.15, batida: 'pancada', braco: 'normal', assinatura: 'Corrida firme e bomba' },
    visual: { pele: PELE.clara, cabelo: { estilo: 'raspado', cor: '#8a5a32' }, barba: 'nenhuma', faixa: null, altura: 1.85, porte: 'forte', coxas: 'normais', chuteira: '#111111' },
  },
  {
    numero: 19, apelido: 'Pibe', nome: 'Diego Maradonna', nomeCamisa: 'MARADONNA', referencia: 'Diego Maradona', posicao: 'MEI', pe: 'E', titular: false,
    atributos: { FOR: 83, CUR: 97, QUE: 92, PRE: 97, FRI: 95 },
    especiais: [], estilo: 'Canhota de ouro',
    uniforme: { clube: 'Argentina', padrao: 'listras', camisa: '#75aadb', cores: ['#ffffff'], calcao: '#111111', meiao: '#ffffff', numero: '#111111', gola: '#111111' },
    cobranca: { postura: 'curvado', distancia: 1.6, angulo: 40, passos: 3, ritmo: 1.1, batida: 'chapa', braco: 'normal', assinatura: 'Pertinho da bola, canhota mágica' },
    visual: { pele: PELE.morenaClara, cabelo: { estilo: 'volumoso', cor: '#141010' }, barba: 'nenhuma', faixa: null, altura: 1.65, porte: 'forte', coxas: 'grossas', chuteira: '#111111' },
  },
  {
    numero: 11, apelido: 'Menino Ney', nome: 'Neimar', nomeCamisa: 'NEIMAR', referencia: 'Neymar', posicao: 'ATA', pe: 'D', titular: false,
    atributos: { FOR: 79, CUR: 94, QUE: 86, PRE: 94, FRI: 88 },
    especiais: [], estilo: 'Ousadia e efeito',
    uniforme: { clube: 'Santos', padrao: 'liso', camisa: '#ffffff', cores: [], calcao: '#ffffff', meiao: '#ffffff', numero: '#111111', gola: '#111111' },
    cobranca: { postura: 'normal', distancia: 2.2, angulo: 35, passos: 4, ritmo: 1.3, batida: 'chapa', braco: 'normal', assinatura: 'Passinhos picados até a bola' },
    visual: { pele: PELE.parda, cabelo: { estilo: 'moicano', cor: '#d9b45a' }, barba: 'rala', corBarba: '#2a1d14', faixa: null, altura: 1.75, porte: 'magro', coxas: 'normais', chuteira: '#2ecc71' },
  },
  {
    numero: 22, apelido: 'Pinturicchio', nome: 'Alessandro Del Pierro', nomeCamisa: 'DEL PIERRO', referencia: 'Alessandro Del Piero', posicao: 'ATA', pe: 'D', titular: false,
    atributos: { FOR: 81, CUR: 96, QUE: 92, PRE: 97, FRI: 94 },
    especiais: [], estilo: 'A curva no ângulo',
    uniforme: { clube: 'Juventus', padrao: 'listras', camisa: '#ffffff', cores: ['#111111'], calcao: '#ffffff', meiao: '#111111', numero: '#ffffff', gola: '#111111' },
    cobranca: { postura: 'normal', distancia: 2.2, angulo: 35, passos: 3, ritmo: 0.95, batida: 'chapa', braco: 'normal', assinatura: 'Passos medidos e curva no ângulo' },
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

// Quão bom o cobrador é num pênalti: precisão e frieza mandam; a força ajuda (bola forte no canto não tem
// defesa); curva e queda quase não contam (não há barreira para contornar).
export function notaParaPenalti(jogador, pressao = 0.25) {
  const a = jogador.atributos;
  const pesos = { PRE: 0.45, FRI: 0.2 + 0.3 * pressao, FOR: 0.25, CUR: 0.05, QUE: 0.05 };
  let soma = 0;
  let total = 0;
  for (const chave of Object.keys(pesos)) {
    soma += pesos[chave] * a[chave];
    total += pesos[chave];
  }
  return Math.round((soma / total) * 10) / 10;
}

// Lista de cobradores do melhor para o pior para esta falta (ou para o pênalti, com falta.penalti)
export function sugerirCobradores(jogadores, falta, pressao = 0) {
  const nota = (jogador) => (falta && falta.penalti ? notaParaPenalti(jogador, pressao) : notaParaFalta(jogador, falta, pressao));
  return jogadores
    .map((jogador) => ({ jogador, nota: nota(jogador) }))
    .sort((a, b) => b.nota - a.nota);
}
