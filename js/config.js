// Todos os números ajustáveis do jogo ficam aqui.
// Unidades: metros, segundos, graus.

export const VERSAO = 'v0.1 · etapa 3';

export const CONFIG = {
  // Mundo
  gravidade: 9.81,        // m/s²
  arrasto: 0.012,         // resistência do ar: quanto maior, mais a bola freia no voo
  magnus: 0.005,          // quanto o giro desvia a bola (efeito Magnus)
  decaimentoGiro: 0.15,   // quanto o giro perde por segundo (0.15 = 15%)
  raioBola: 0.11,         // m
  quiqueChao: 0.5,        // quanto a bola quica no gramado (0 = nada, 1 = tudo)
  atritoGrama: 2.5,       // m/s² de freada quando a bola rola

  // Chute
  velocidadeMin: 14,      // m/s com a barra vazia
  velocidadeMax: 34,      // m/s com a barra cheia
  elevacaoBase: 16,       // graus: ângulo de saída com contato no centro da bola
  tempoCarga: 1.1,        // segundos para a barra encher

  // Ponto de contato na bola
  elevacaoContatoEmbaixo: 4, // graus a mais quando o pé pega embaixo da bola
  elevacaoContatoEmCima: 0,  // graus a menos quando o pé pega em cima
  giroLateralMax: 70,     // giro com o pé na lateral da bola: define a força da curva
  giroVerticalMax: 18,    // giro com o pé em cima (cai: folha seca) ou embaixo (flutua)
  perdaVelocidadeContato: 0.15, // quanto de velocidade se perde batendo na borda da bola

  // Bola sem rotação (pé bem no centro e chute forte)
  semRotacaoRaio: 0.25,         // quão perto do centro precisa ser o contato
  semRotacaoForcaMinima: 0.7,   // força mínima da barra para a bola "dançar"
  semRotacaoAmplitude: 5,       // quanto a bola dança

  // Gol (medidas oficiais)
  golLargura: 7.32,
  golAltura: 2.44,
  golProfundidade: 2.0,
  raioTrave: 0.06,
  quiqueTrave: 0.6,       // quanto a bola volta ao bater na trave (0 = morre, 1 = volta tudo)
  redeRigidez: 2500,      // quanto a rede do fundo segura a bola: menor = estufa mais

  // Cobrança atual (distância do centro do gol; ângulo + = à direita de quem cobra)
  falta: { distancia: 22, angulo: 0 },

  // Câmera atrás da bola, estilo PES
  camera: {
    atras: 6,             // m atrás da bola
    altura: 2.2,          // m do chão
    inclinacao: 10,       // graus olhando para baixo
    fovMin: 40,           // campo de visão vertical mínimo
    larguraVisivel: 24,   // campo de visão horizontal mínimo (garante o gol inteiro no celular em pé)
    seguir: 0.25,         // quanto a câmera acompanha a bola depois do chute (0 = parada)

    // Câmera aérea depois do chute (como nos jogos de falta do Click Jogos)
    aerea: true,
    aereaAltura: 13,      // m do chão
    aereaAtras: 7,        // m atrás da bola
    aereaLado: 2,         // m para o lado (+ = direita de quem cobra)
    aereaAlvo: 0.5,       // para onde olha: 0 = bola, 1 = gol
    aereaAproxima: 0.35,  // quanto a câmera anda junto com a bola em direção ao gol
    aereaTransicao: 0.3,  // s para trocar de câmera (0 = corte seco)
  },

  // Ritmo
  tempoMaxVoo: 4,         // s: encerra a cobrança mesmo se a bola não parar
  esperaRecomeco: 1.3,    // s entre o fim da jogada e a próxima cobrança
  esperaGol: 2.2,         // s depois de um gol, para curtir a rede estufando
};
