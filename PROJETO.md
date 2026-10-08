# Free Kick Legends (nome provisório)

## O que é

Minigame 3D leve de cobrança de faltas para celular, jogável no navegador por um link.

Inspirações: os jogos de falta do antigo Click Jogos, as cobranças de falta do PES de PS2, Score! Hero e New Star Soccer.

Os gráficos são simples de propósito. O produto é a mecânica do chute: ela precisa ser gostosa de repetir.

## Sobre mim e como trabalhar comigo

- Não sou desenvolvedor. Explique tudo em português simples. Quando usar um termo técnico, explique em uma frase.
- Trabalhe em etapas pequenas. Ao fim de cada etapa, diga o que mudou e exatamente como eu testo, no computador e no celular.
- Use git e faça um commit a cada etapa que estiver funcionando, para podermos voltar atrás se algo quebrar.
- Não adicione nada fora do escopo da v0.1 sem me perguntar antes.
- Sem etapa de build por enquanto (nada de npm ou Vite). Use HTML + JavaScript + Three.js carregado por CDN com versão fixa. Poucos arquivos.
- Mobile first, orientação vertical. Testar no celular real é obrigatório, porque o toque é diferente do mouse.
- Assim que existir algo jogável, publique numa hospedagem estática gratuita (GitHub Pages ou similar) para eu testar no celular por link. Me guie no passo a passo.

## A mecânica central

Cada cobrança tem três decisões:

1. **Direção:** arrastar o dedo na horizontal. Uma mira aparece no gol.
2. **Ponto de contato:** tocar numa bola grande no canto da tela para escolher onde o pé pega. O ponto escolhido fica salvo entre as cobranças.
3. **Força:** segurar o botão de chute. A barra enche. Soltar chuta. Passar do ponto ideal aumenta o erro.

### Efeito do ponto de contato

| Onde o pé pega | Efeito na bola |
|---|---|
| Embaixo | Gira para trás: sobe mais e flutua. Embaixo demais, vai por cima do gol |
| Em cima | Gira para frente: sai mais baixa e cai rápido (folha seca) |
| Lado direito | Curva para a esquerda |
| Lado esquerdo | Curva para a direita |
| Diagonais | Combina curva com subida ou queda |
| Centro, com força | Sai quase sem giro e oscila de forma imprevisível |

### Princípios

- **Realista no comportamento, exagerado na medida.** A bola obedece aos controles de forma coerente, mas curvas bonitas precisam ser alcançáveis. Diversão vence precisão científica.
- **Imprecisão, como a direção "subjetiva" do PES.** A bola sai dentro de um cone de erro em torno da mira. O cone cresce quando a força passa do ideal. Sem isso, o jogo vira "mirou, acertou".
- **Ciclo rápido.** Depois de cada cobrança, o jogador tenta de novo em menos de 2 segundos.

## Física (aproximação sugerida)

- Unidades em metros e segundos.
- Estado da bola: posição, velocidade e vetor de rotação (spin).
- Forças aplicadas a cada frame:
  - gravidade;
  - arrasto do ar proporcional a |v| · v;
  - força Magnus proporcional a (spin × velocidade);
  - o spin decai devagar ao longo do voo.
- No momento do chute:
  - velocidade inicial interpolada entre um mínimo e um máximo conforme a força;
  - ângulo de elevação maior quanto mais embaixo for o contato, menor com contato em cima;
  - spin lateral proporcional ao deslocamento horizontal do contato (contato à direita curva para a esquerda);
  - spin para trás ou para frente proporcional ao deslocamento vertical do contato;
  - contato no centro com força alta gera a "bola sem rotação": pequena oscilação lateral aleatória.
- Todos os números ficam num único objeto de configuração.

Medidas reais a usar: gol de 7,32 m x 2,44 m; barreira a 9,15 m da bola; raio da bola de cerca de 0,11 m; faltas entre cerca de 18 e 30 m, em ângulos variados.

## Painel de ajuste (obrigatório desde o início)

Um painel escondido, aberto por um botão discreto, com sliders para:

- força da curva;
- efeito do contato na elevação;
- gravidade e arrasto;
- velocidade mínima e máxima do chute;
- tamanho do cone de erro e ponto ideal de força;
- reflexo, velocidade e alcance do goleiro;
- altura da barreira.

As mudanças valem na hora. Um botão "copiar valores" gera o texto com a configuração atual, para eu te mandar os números que ficaram bons.

Motivo: o que define se o jogo é bom é a sensação do chute, e isso se descobre jogando e ajustando, não discutindo.

## Escopo da v0.1 (um fim de semana)

### Entra

- Cena 3D simples: campo, gol com rede, bola, barreira e goleiro básico. Sem jogadores animados, estádio ou torcida.
- Câmera fixa atrás da bola, estilo PES antigo. Pode acompanhar a bola de leve depois do chute.
- Os três controles da mecânica central.
- Física com curva, elevação e queda, e colisão com trave, travessão, barreira, goleiro e rede.
- Goleiro simples: tempo de reação, velocidade de mergulho e alcance. Defende o fácil e sofre no ângulo.
- Pontuação: gol, bônus para gol no ângulo e multiplicador por sequência.
- Dois modos:
  1. **Free Kick:** 10 cobranças com distância e posição sorteadas. Objetivo: fazer o máximo de pontos.
  2. **Desafios:** acertar o ângulo, marcar de 30 m, passar por cima de uma barreira mais alta, contornar a barreira com curva por fora.
- Recorde salvo no próprio aparelho.
- Se der tempo: barreira que às vezes pula, deixando espaço para o chute rasteiro passar por baixo.

### Não entra na v0.1

Carreira, moedas, loja, jogadores ou lendas, multiplayer, anúncios, compras e publicação nas lojas.

## Ordem de construção

1. Cena, bola e chute reto com força. Já publicado no link.
2. Ponto de contato, física de curva e elevação, e painel de ajuste.
3. Mira com imprecisão e controles de toque.
4. Gol, trave, rede, detecção de gol, placar e recomeço rápido.
5. Barreira e goleiro.
6. Modos Free Kick e Desafios, e recorde.
7. Rodada de ajuste fino jogando no celular.
8. Depois: transformar em PWA para instalar na tela inicial do celular.

## Critério de sucesso da v0.1

Eu e mais 5 pessoas cobramos 20 faltas seguidas no celular. Se quiserem bater a 21ª, a mecânica funciona e vale evoluir. Se não, ajustamos ou arquivamos.

## Decisão pendente: nomes dos jogadores

- A v0.1 não tem jogadores.
- Nomes reais (Pirlo, Beckham, Messi etc.) estão descartados: uso comercial de nome e imagem sem autorização é protegido pelo Código Civil (arts. 18 e 20, e a família pode agir no caso de falecidos), além do risco de remoção nas lojas.
- Em avaliação: nomes paródia (Andrei Pelo, Dvd Beck, Dinho10, Cris7). Reduzem o risco, mas não eliminam, porque o que a lei protege é a identificação da pessoa. "Cris7" tem risco extra, porque CR7 é marca do Cristiano Ronaldo.
- Alternativa mais segura: lendas fictícias definidas pela técnica (folha seca, trivela, sem rotação, por cima da barreira).
- Decidir antes de publicar em loja ou monetizar.

## Visão futura (backlog, não construir agora)

- **Princípio:** progressão por técnica, não por atributo comprado.
- **Jornada "Da várzea à final":** fases com distância, ângulo, barreira, goleiro, vento e chuva; 3 estrelas por fase.
- **Academia das Lendas:** cada mestre ensina uma técnica por meio de desafios.
- **Alvos:** homenagem ao Click Jogos, com placas no gol e combo por acertos seguidos.
- **Falta do Dia:** a mesma cobrança para todos, com ranking diário.
- **Sobrevivência:** cobrar até errar.
- **Duelo assíncrono:** as mesmas 5 faltas para dois jogadores, cada um no seu tempo. Evitar multiplayer em tempo real.
- **Faltas clássicas recriadas,** sem citar quem bateu.
- **Economia:** moeda ganha jogando, gasta só em itens visuais (bola, chuteira, uniforme fictício, estádio, rastro da bola).
- **Monetização:** anúncio recompensado, compra única para remover anúncios e itens visuais.
- **Publicação:** PWA primeiro; Android depois, empacotando a versão web; iOS por último (exige Mac ou serviço de build na nuvem, e conta anual na Apple).
- **Nome definitivo:** "Free Kick" é termo genérico e lotado nas lojas, e "Legends" sugere jogadores reais. Revisar antes de publicar.

## Contexto estratégico

- É um projeto de laboratório, com tempo limitado. A fonte de renda principal é o ResuNinja, e o Ninja Duel também está na fila.
- O que for aprendido aqui (física, publicação, monetização, retenção) deve servir ao Ninja Duel.
- O mercado de jogo casual de futebol é saturado e dominado por estúdios grandes, e a receita de anúncio por usuário é baixa, principalmente no Brasil. Não tratar como fonte de renda.
