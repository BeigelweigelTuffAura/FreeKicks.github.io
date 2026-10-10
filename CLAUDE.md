# Free Kick Legends

A especificação completa (escopo, mecânica, ordem de construção) está em `PROJETO.md`. Leia antes de mudar qualquer coisa: ela é a fonte da verdade.

## Como trabalhar neste projeto

- Quem conduz o projeto não programa. Responda em português simples; ao usar um termo técnico, explique em uma frase.
- Etapas pequenas. Ao fim de cada etapa: o que mudou e como testar no computador e no celular.
- Um commit por etapa que funciona.
- Nada fora do escopo da v0.1 sem perguntar antes.

## Convenções técnicas

- Sem build: HTML + JavaScript (módulos ES) + Three.js `0.160.0` pelo import map do `index.html`.
- Arquivos:
  - `js/config.js`: todos os números ajustáveis (`CONFIG`) e o rótulo `VERSAO` mostrado na tela.
  - `js/physics.js`: física da bola, sem dependência do Three.js (dá para rodar no Node).
  - `js/main.js`: cena, câmera, controles, loop, replay, os três modos (`estado.modo`: treino, desafio, penalti), o Desafio do Dia (sementes pela data, recordes e compartilhar) e a cola entre os módulos abaixo.
  - `js/elenco.js`: as 22 lendas (atributos, pé, uniforme, jeito de cobrar, visual), `overall`, nota por falta (`notaParaFalta`), nota por pênalti (`notaParaPenalti`) e sugestão de cobrador.
  - `js/interface.js`: HUD (cartão do cobrador, lista "Quem bate?", resultado, placar, botões de modo). Só mexe no HTML.
  - `js/estadio.js`: gramado, gol, rede de pano (massa-mola), arquibancadas e torcida. `PADRAO_CENARIO`.
  - `js/barreira.js` e `js/goleiro.js`: lógica (posição, pulo, reação, mergulho, colisão), sem desenho. `PADRAO_BARREIRA`, `PADRAO_GOLEIRO`, `PADRAO_PENALTI` (goleiro de pênalti: adivinha o canto, dica, memória) e `semBarreira` (pênalti).
  - `js/jogadores.js`: bonecos (corpo, rosto, camisas por padrão), poses e a corrida/chute do cobrador (`criarCobranca`, posturas por lenda). `PADRAO_COBRANCA`.
  - `js/animacaoDefesa.js`: desenho do goleiro e da barreira por cima da lógica (passos, mergulho, queda, gestos).
  - `js/audio.js`: som sintetizado (sem arquivos). `PADRAO_AUDIO`.
  - `js/replay.js`: grava a cobrança em vídeo (MediaRecorder) e baixa/compartilha o gol.
  - `js/painel.js`: painel de ajuste (sliders que mudam o `CONFIG` na hora). Todo número novo que afete a sensação do jogo ganha um slider aqui.
  - Os `PADRAO_*` dos módulos entram no `CONFIG` quando o jogo abre (`js/main.js`); o que está escrito em `config.js` tem prioridade.
  - `testes/fisica.mjs` e `testes/defesa.mjs`: testes no Node. Rodar `node testes/fisica.mjs` e `node testes/defesa.mjs` antes de cada commit que mexa na física, no goleiro ou na barreira. `testes/*.html` são páginas de inspeção visual.
- Eixos: x = direita de quem cobra, y = para cima, z = do gol para quem cobra. Gol em z = 0, chute vai para z negativo.
- **Replay = repetir a cobrança.** A física anda em passos fixos (`PASSO_FISICA`), e todo sorteio que afeta o lance vem de `sorteioDaJogada(n)` (montagem; n = 2 é a decisão do goleiro de pênalti) ou `sorteioChute` (chute e goleiro no voo), com sementes guardadas em `registro` (junto com o modo, a pressão e o histórico de pênaltis). Nunca use `Math.random`/`aleatorio` em algo que mude a bola, a barreira ou o goleiro depois do chute, senão o replay deixa de bater. No Desafio do Dia as sementes vêm de `sementeDoTexto(dia#índice#uso)`: mesma data, mesmas faltas para todo mundo.
- **Cache:** a hospedagem guarda arquivos em cache por alguns minutos. A cada etapa publicada, aumente o número `?v=N` em todos os imports e links (`index.html` e `js/*.js`) e atualize `VERSAO`:
  `sed -i 's/?v=[0-9]*/?v=NOVO/g' index.html js/*.js`
- Testar no celular real é obrigatório; o rótulo de versão no canto da tela confirma qual versão está carregada.
- **Modo teste:** abrir com `?teste` no endereço faz cada quadro valer exatamente 1/60 s, fixa o sorteio (e a data do Desafio do Dia em 2026-10-10) e expõe `window.tempoDeJogo` e `window.jogoTeste` (falta, cobrador, contato, mira, chutar, estado, video, modo, desafio, goleiro, placar, recordes). Serve para capturas automáticas previsíveis (Playwright), mesmo com o navegador lento.
- O CDN do Three.js não abre dentro do ambiente de desenvolvimento na nuvem: os testes com Playwright interceptam o import e servem uma cópia local (`npm pack three@0.160.0`).
