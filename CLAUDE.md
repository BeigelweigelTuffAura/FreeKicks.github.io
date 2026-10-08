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
  - `js/main.js`: cena, câmera, controles, HUD e loop.
  - `js/painel.js`: painel de ajuste (sliders que mudam o `CONFIG` na hora). Todo número novo que afete a sensação do jogo ganha um slider aqui.
  - `testes/fisica.mjs`: testes da física. Rodar com `node testes/fisica.mjs` antes de cada commit que mexa na física.
- Eixos: x = direita de quem cobra, y = para cima, z = do gol para quem cobra. Gol em z = 0, chute vai para z negativo.
- **Cache:** a hospedagem guarda arquivos em cache por alguns minutos. A cada etapa publicada, aumente o número `?v=N` em todos os imports e links (`index.html` e `js/*.js`) e atualize `VERSAO`:
  `sed -i 's/?v=[0-9]*/?v=NOVO/g' index.html js/*.js`
- Testar no celular real é obrigatório; o rótulo de versão no canto da tela confirma qual versão está carregada.
