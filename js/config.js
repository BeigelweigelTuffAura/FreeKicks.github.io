// Todos os números ajustáveis do jogo ficam aqui.
// Unidades: metros, segundos, graus.

export const VERSAO = 'v0.1 · etapa 8.1';

export const CONFIG = {
  // Mundo
  gravidade: 9.81,        // m/s²
  arrasto: 0.012,         // resistência do ar: quanto maior, mais a bola freia no voo
  magnus: 0.005,          // quanto o giro desvia a bola (efeito Magnus)
  decaimentoGiro: 0.15,   // quanto o giro perde por segundo (0.15 = 15%)
  raioBola: 0.11,         // m
  magnusLimite: 0.5,      // limite do efeito Magnus: com giro × raio acima de metade da velocidade, girar mais não curva mais
  quiqueChao: 0.65,       // quanto a bola volta numa batida lenta no gramado (0 = nada, 1 = tudo)
  quiqueChaoForte: 0.45,  // quanto volta numa batida forte (a grama amassa e segura mais)
  quiqueChaoVelocidade: 12, // m/s: batida a partir da qual vale o quiqueChaoForte
  atritoDeslize: 0.4,     // atrito da grama quando a bola escorrega (troca velocidade por giro)
  atritoGrama: 2.5,       // m/s² de freada quando a bola rola

  // Chute
  velocidadeMin: 8,      // m/s com a barra vazia
  velocidadeMax: 36,      // m/s com a barra cheia (cobrador neutro; FOR muda até uns 5% para cima ou 10% para baixo)
  elevacaoBase: 16,       // graus: ângulo de saída com contato no centro da bola
  tempoCarga: 1.1,        // segundos para a barra encher

  // Ponto de contato na bola
  elevacaoContatoEmbaixo: 4, // graus a mais quando o pé pega embaixo da bola
  elevacaoCavadinha: 18,     // graus a mais bem na ponta de baixo (cresce rápido perto da borda)
  elevacaoContatoEmCima: 1,  // graus a menos com o pé em cima, antes de virar rasteiro
  rasteiroInicio: 0.62,      // altura do contato (0 = centro, 1 = topo) onde a bola começa a sair baixa
  rasteiroFim: 0.82,         // a partir desta altura a bola sai rasteira
  elevacaoRasteiro: 2.5,     // graus de saída do chute rasteiro (sai quicando baixinho)
  giroLateralMax: 70,     // giro com o pé na lateral da bola: define a força da curva
  giroVerticalMax: 55,    // giro para a frente com o pé em cima (cai: folha seca; rasteiro)
  giroEmbaixoMax: 18,     // giro para trás com o pé embaixo (flutua)
  perdaVelocidadeContato: 0.15, // quanto de velocidade se perde batendo na borda da bola
  quedaTardia: 6,         // quanto a queda (giro para a frente) e a flutuação (para trás) crescem quando a bola perde velocidade
  quedaTardiaInicio: 0.25, // queda logo depois do chute (fração do efeito normal): sobe e depois despenca
  efeitoTardioMax: 1.8,   // limite do crescimento dos efeitos tardios (queda e trivela)

  // Mira com imprecisão (a bola sai dentro de um cone em volta da mira)
  erroMiraBase: 1,        // graus: tamanho do cone (desvio padrão) do cobrador neutro
  forcaIdeal: 0.8,        // ponto ideal da barra: passar dele aumenta o erro
  erroAcimaIdeal: 2,      // erro a mais com a barra cheia (2 = três vezes o erro normal)
  erroVerticalFracao: 0.35, // erro na altura em relação ao erro na direção
  erroPressao: 0.4,       // erro a mais no lance decisivo (a frieza corta até metade disso)

  // Cobradores (atributos de 0 a 99)
  pesoAtributos: 0.15,    // diferença total entre a nota 60 e a 99 em cada efeito (0.15 = 15%)
  trivelaGiro: 0.6,       // trivela de quem não é especialista: fração da curva
  trivelaErro: 1.4,       // ... e quanto o erro aumenta
  trivelaGiroEspecialista: 1.05, // trivela de especialista: fração da curva
  trivelaErroEspecialista: 1.1,  // ... e quanto o erro aumenta
  trivelaTardia: 3,       // quanto a curva da trivela do especialista cresce no fim (0 = igual à normal)
  trivelaTardiaInicio: 0.6, // curva da trivela do especialista logo depois do chute (fração da normal)
  folhaSecaAngulo: 0.4,   // especialista em folha seca: fração do ângulo perdido com o pé em cima
  folhaSecaGiro: 1.1,     // especialista em folha seca: giro para a frente a mais
  folhaSecaAtraso: 0.08,  // especialista em folha seca: o rasteiro só começa mais perto do topo

  // Bola sem rotação (pé bem no centro e chute forte)
  semRotacaoRaio: 0.25,         // quão perto do centro precisa ser o contato
  semRotacaoForcaMinima: 0.7,   // força mínima da barra para a bola "dançar"
  semRotacaoAmplitude: 6,       // quanto a bola dança
  semRotacaoQueda: 4,           // m/s²: quanto ela cai de repente no fim do voo (com dança cheia)
  semRotacaoEspecialista: 1.5,  // especialista: dança mais...
  semRotacaoZonaEspecialista: 1.5,  // ... tem uma zona central maior...
  semRotacaoForcaEspecialista: 0.12, // ... e precisa de menos força (desconto na força mínima)
  semRotacaoComum: 0.6,         // quem não é especialista: dança menos

  // Gol (medidas oficiais)
  golLargura: 7.32,
  golAltura: 2.44,
  golProfundidade: 2.0,
  raioTrave: 0.06,
  quiqueTrave: 0.6,       // quanto a bola volta ao bater na trave (0 = morre, 1 = volta tudo)
  redeRigidez: 2500,      // quanto a rede do fundo segura a bola: menor = estufa mais

  // Cobrança atual (distância do centro do gol; ângulo + = à direita de quem cobra)
  falta: { distancia: 22, angulo: 0 },

  // Câmera atrás do cobrador, estilo PES de PS2
  camera: {
    atras: 6,             // m atrás da bola, no mínimo (recua mais se o cobrador começar de longe)
    atrasCobrador: 3.5,   // m que a câmera fica atrás de onde o cobrador começa a corrida, no mínimo
    altura: 2.2,          // m do chão
    pesoCobrador: 0.4,    // quanto a câmera desloca para o lado do cobrador (0 = fica no eixo bola → gol, 1 = na linha dele)
    inclinacao: 10,       // graus olhando para baixo (ponto de partida; ajusta para caber o cobrador e o gol)
    fovMin: 40,           // campo de visão vertical mínimo
    larguraVisivel: 32,   // campo de visão horizontal mínimo (graus): no celular em pé, mais = mais afastada
    seguir: 0.25,         // quanto a câmera acompanha a bola depois do chute (0 = parada)

    // Câmera do replay. Lateral (padrão): do lado direito de quem cobra, sempre o mesmo lado, com o gol
    // à direita da tela, como no treino do PES de PS2. Acompanha a bola, porque no celular em pé não cabe
    // cobrador e gol de uma vez. Desligando `replayLateral`, volta a câmera atrás do gol (como na TV).
    replayLateral: true,
    replayLateralDist: 24,    // m para o lado direito de quem cobra (contado a partir da bola): longe, como no treino do PES
    replayLateralAltura: 12,  // m do chão (de cima)
    replayLateralAlvo: 0.5,   // quanto o olhar vai da bola para o meio do gol quando a bola chega lá (0 = só a bola)
    replayLateralLargura: 36, // graus de campo de visão horizontal (menos = mais zoom)
    replayLateralSegue: 0.4,  // quanto a câmera anda junto com a bola em direção ao gol (0 = parada, 1 = sempre ao lado da bola)
    replayLateralFrente: 4,   // m que a câmera fica adiantada em relação à bola, na direção do gol
    replayLado: 7,        // atrás do gol: m para o lado (do lado contrário ao canto em que a bola vai)
    replayAltura: 3.2,    // atrás do gol: m do chão
    replayAtras: 8,       // atrás do gol: m atrás da linha do gol

    // Câmera aérea depois do chute (como nos jogos de falta do Click Jogos)
    aerea: true,
    aereaAltura: 11,      // m do chão
    aereaAtras: 3,        // m atrás da bola
    aereaLado: 9,         // m para o lado de fora da falta (mais = mais de lado)
    aereaAlvo: 0.5,       // para onde olha: 0 = bola, 1 = gol
    aereaAproxima: 0.4,   // quanto a câmera anda junto com a bola em direção ao gol
    aereaTransicao: 0.3,  // s para trocar de câmera (0 = corte seco)
    cameraLenta: true,    // câmera lenta quando a bola está chegando no gol
    cameraLentaFator: 0.35, // velocidade do tempo na câmera lenta (1 = normal)
    cameraLentaDuracao: 0.35, // s de jogo em câmera lenta
    cameraLentaDistancia: 3.5, // m da linha do gol em que a câmera lenta começa
    bolaVisivelAte: 12,   // m: mais longe que isso, a bola aparece um pouco maior na tela
    bolaAumentoMax: 1.7,  // quanto a bola pode crescer na tela, no máximo
  },

  // Mira: arrastar o dedo na tela mexe o alvo no gol
  mira: {
    sensibilidade: 1,     // 1 = o alvo acompanha o dedo; menos = mais fino
    limite: 7,            // m para cada lado do meio do gol (dá para mirar fora e trazer com a curva)
  },

  // Treino livre: falta sorteada a cada cobrança (o botão "Falta fixa" ou o painel seguram a posição)
  sorteio: {
    distanciaMin: 18,     // m
    distanciaMax: 33,     // m
    anguloMax: 32,        // graus para cada lado
  },

  // Desafio do Dia: as mesmas faltas, na mesma ordem, para todo mundo no mesmo dia (sorteio com a data
  // como semente). Vale a maior sequência de gols; errou, volta para a primeira falta do dia.
  // No desafio o painel de ajuste fica trancado (todo mundo joga com os mesmos números) e o goleiro é
  // um pouco mais fraco que o do treino, para a sequência render.
  desafio: {
    pressaoPorGol: 0.06,  // a pressão (que aumenta o erro; a frieza do cobrador corta parte) cresce isso por gol seguido
    pressaoMax: 0.6,      // teto da pressão
    minimoRanking: 2,     // gols seguidos para poder entrar no ranking do dia
    goleiro: {            // por cima de PADRAO_GOLEIRO, só no desafio (não passa pelo painel)
      reflexo: 0.34,
      erroLeitura: 0.85,
      percepcaoCurva: 0.5,
    },
  },

  // Ranking do dia (Desafio do Dia): guardado num projeto Supabase (banco de dados na internet com
  // acesso por endereço + chave pública). Vazio = ranking desligado; a melhor sequência fica só no aparelho.
  ranking: {
    url: 'https://guxfyyswjdwfipovslxh.supabase.co',
    chave: 'sb_publishable__NHNsaWoQkeB7a4UEmVMyw_NPqR83pJ', // chave pública ("publishable"): só lê a lista e entra nela
    tabela: 'ranking',
  },

  // Pênaltis: bola na marca, sem barreira, goleiro que "adivinha" o canto. Os números do goleiro de pênalti
  // (chance de adivinhar, dica, memória...) vêm de PADRAO_PENALTI em js/goleiro.js; o que estiver aqui tem prioridade.
  penalti: {
    pressao: 0.25,        // pressão fixa do pênalti (0 = treino, 1 = decisão)
  },

  rastro: true,           // pontinhos atrás da bola durante o voo, para ver a curva
  video: true,            // botão para gravar o replay em vídeo e salvar/compartilhar (some se o navegador não gravar)

  // Goleiro, barreira, cobrador, cenário e som: os padrões ficam nos próprios módulos
  // (PADRAO_GOLEIRO em js/goleiro.js, PADRAO_BARREIRA em js/barreira.js, PADRAO_COBRANCA em js/jogadores.js,
  // PADRAO_AUDIO em js/audio.js) e são copiados para cá quando o jogo abre. Para mudar um padrão, escreva aqui,
  // por exemplo: goleiro: { reflexo: 0.35 },

  // Ritmo
  tempoMaxVoo: 4,         // s: encerra a cobrança mesmo se a bola não parar
  esperaRecomeco: 1.3,    // s entre o fim da jogada e a próxima cobrança
  esperaGol: 2.2,         // s depois de um gol, para curtir a rede estufando
};
