// Todos os números ajustáveis do jogo ficam aqui.
// Unidades: metros, segundos, graus.

export const VERSAO = 'v0.1 · etapa 1';

export const CONFIG = {
  // Mundo
  gravidade: 9.81,        // m/s²
  arrasto: 0.012,         // resistência do ar: quanto maior, mais a bola freia no voo
  magnus: 0.005,          // força da curva causada pelo giro (usada a partir da etapa 2)
  decaimentoGiro: 0.15,   // quanto o giro perde por segundo (0.15 = 15%)
  raioBola: 0.11,         // m
  quiqueChao: 0.5,        // quanto a bola quica no gramado (0 = nada, 1 = tudo)
  atritoGrama: 2.5,       // m/s² de freada quando a bola rola

  // Chute
  velocidadeMin: 14,      // m/s com a barra vazia
  velocidadeMax: 34,      // m/s com a barra cheia
  elevacaoBase: 15,       // graus: ângulo de saída com contato no centro da bola
  tempoCarga: 1.1,        // segundos para a barra encher

  // Gol (medidas oficiais)
  golLargura: 7.32,
  golAltura: 2.44,
  golProfundidade: 2.0,
  raioTrave: 0.06,

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
  },

  // Ritmo
  tempoMaxVoo: 4,         // s: encerra a cobrança mesmo se a bola não parar
  esperaRecomeco: 0.9,    // s entre o fim da jogada e a próxima cobrança
};
