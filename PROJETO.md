# Free Kick Legends (nome provisório)

## O que é

Minigame 3D leve de cobrança de faltas para celular, jogável no navegador por um link.

Inspirações: os jogos de falta do antigo Click Jogos, as cobranças de falta do PES de PS2, Score! Hero e New Star Soccer.

Os gráficos são simples de propósito. O produto é a mecânica do chute: ela precisa ser gostosa de repetir.

O tema: um time formado só por grandes cobradores de falta da história, disputando uma temporada. O jogador escolhe a camisa e joga as faltas decisivas de cada partida.

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

## Modo Temporada (aprovado)

- **Tela inicial:** Temporada ou Treino livre. O Treino livre usa posições sorteadas, e é nele que fica o painel de ajuste.
- **Escolha da camisa:** 6 uniformes que lembram clubes (rubro-negro listrado, todo branco, azul e grená etc.), com nome fictício. O elenco é sempre o mesmo, o Elenco Lendário; a camisa é a identidade do "meu time".
- **Tela de escalação** em 2D com os 11 titulares e os 11 reservas, com as notas de cada um.
- **Uma liga, 8 times, turno único: 7 jogos.** Os adversários são fictícios e genéricos.
- **Cada jogo tem 3 faltas com contexto**, por exemplo: "Rival 1 x 0 você · 78' · falta a 24 m pela direita". O placar do adversário é sorteado conforme a força do rival, cada gol seu muda o placar, e o resultado vira pontos na tabela.
- **Cobrador sugerido:** a cada falta, o jogo sugere o melhor cobrador em campo para aquela posição (pé bom e notas). O jogador só confirma, ou toca em "trocar".
- **Especialista do banco:** uma vez por jogo, dá para chamar um reserva só para bater uma falta.
- **Fim da temporada:** campeão ou a posição final, e o recorde salvo no aparelho.
- **Fora:** jogar a partida inteira, dinheiro, transferências, cansaço, lesões, táticas e duelo entre jogadores.

## Elenco Lendário e atributos (aprovado)

Cada cobrador tem **pé bom** e **5 atributos**, com notas de 0 a 99. O **overall** é a média das 5 notas.

| Atributo | O que faz no jogo |
|---|---|
| **Força (FOR)** | Velocidade máxima do chute |
| **Curva (CUR)** | Quanto a bola curva com o pé na lateral |
| **Queda (QUE)** | Quanto a bola cai com o pé em cima (folha seca) |
| **Precisão (PRE)** | Tamanho do erro de mira (cone menor) |
| **Frieza (FRI)** | Quanto o erro aumenta nos lances decisivos (fim de jogo, placar apertado) |

Regras:
- **Os atributos ajustam, não decidem.** Entre a nota mais baixa e a mais alta do elenco, a diferença fica em torno de 15% no parâmetro da física. A habilidade de quem joga continua mandando. O peso dos atributos vai para o painel de ajuste.
- **Pé bom:** curvar para o lado natural do pé (parte de dentro) usa a curva cheia. Curvar para o outro lado (de trivela) curva menos e erra mais.

Elenco (notas propostas, ajustáveis; os nomes no jogo serão apelidos):

| # | Pos. | Referência | Pé | FOR | CUR | QUE | PRE | FRI | OVR |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GOL | Rogério Ceni | D | 85 | 84 | 82 | 92 | 95 | 88 |
| 2 | LD | Daniel Alves | D | 78 | 82 | 74 | 80 | 85 | 80 |
| 3 | ZAG | Beckenbauer | D | 76 | 80 | 70 | 84 | 97 | 81 |
| 4 | ZAG | Koeman | D | 96 | 74 | 78 | 88 | 92 | 86 |
| 5 | LE | Roberto Carlos | E | 99 | 93 | 72 | 75 | 85 | 85 |
| 6 | MC | Pirlo | D | 74 | 88 | 98 | 95 | 99 | 91 |
| 7 | MD | Beckham | D | 82 | 99 | 85 | 94 | 90 | 90 |
| 8 | MEI | Zico | D | 80 | 93 | 90 | 97 | 92 | 90 |
| 9 | ME | Ronaldinho | D | 82 | 92 | 93 | 90 | 91 | 90 |
| 10 | ATA | Messi | E | 80 | 94 | 88 | 97 | 88 | 89 |
| 11 | ATA | Cristiano Ronaldo | D | 97 | 78 | 84 | 85 | 93 | 87 |
| 12 | GOL | Chilavert | E | 92 | 82 | 76 | 86 | 96 | 86 |
| 13 | LD | Nelinho | D | 95 | 92 | 75 | 80 | 86 | 86 |
| 14 | ZAG | Mihajlovic | E | 96 | 85 | 82 | 92 | 90 | 89 |
| 15 | LE | Branco | E | 97 | 80 | 76 | 82 | 90 | 85 |
| 16 | MC | Didi | D | 78 | 86 | 99 | 92 | 93 | 90 |
| 17 | MC | Juninho Pernambucano | D | 95 | 88 | 92 | 96 | 94 | 93 |
| 18 | MC | Marcos Assunção | D | 84 | 92 | 88 | 95 | 90 | 90 |
| 19 | MC | Gerrard | D | 94 | 82 | 80 | 85 | 95 | 87 |
| 20 | MEI | Maradona | E | 84 | 95 | 90 | 96 | 94 | 92 |
| 21 | ATA | Neymar | D | 80 | 90 | 85 | 90 | 82 | 85 |
| 22 | ATA | Del Piero | D | 82 | 92 | 88 | 95 | 92 | 90 |

Os titulares (1 a 11) são escolha de quem conduz o projeto. Beckenbauer e Daniel Alves ficam no time mesmo não sendo especialistas em falta; por isso, as notas deles são mais baixas.

## Escopo da v0.1 (revisado)

### Entra

- Os três controles da mecânica central, física com curva, elevação e queda, e o painel de ajuste.
- Colisão com trave, travessão, barreira, goleiro e rede; detecção de gol.
- Barreira e goleiro como bonecos simples, com a camisa do adversário. O goleiro tem tempo de reação, velocidade de mergulho e alcance: defende o fácil e sofre no ângulo.
- **Câmeras:** antes do chute, câmera atrás do cobrador, mostrando o jogador como no PS2. No chute, câmera aérea (como nos jogos de falta do Click Jogos). No painel, uma opção para comparar com a câmera de trás.
- Cobrador visível: boneco simples feito por código, com corrida e chute animados. A identidade vem de cabelo, barba, careca, porte físico e número.
- Elenco Lendário com atributos, Modo Temporada e Treino livre.
- **Acabamento barato e de muito impacto:** som (torcida, chute, gol), replay do golaço em câmera lenta e o nome da jogada na tela ("FOLHA SECA!").
- Estádio simples: arquibancada em blocos e torcida feita de pontinhos coloridos.
- Recorde salvo no próprio aparelho.
- Se der tempo: barreira que às vezes pula, deixando espaço para o chute rasteiro passar por baixo.

### Não entra na v0.1

Várias ligas, duelo entre jogadores, multiplayer, moedas, loja, anúncios, compras e publicação nas lojas.

## Ordem de construção

1. ~~Cena, bola e chute reto com força, publicado no link.~~ Feito.
2. ~~Ponto de contato, física de curva e elevação, e painel de ajuste.~~ Feito.
3. ~~Gol, trave, rede que estufa, detecção de gol e placar; câmera aérea depois do chute; estádio com arquibancadas e torcida.~~ Feito.
4. Mira com imprecisão e controles de toque.
5. Barreira e goleiro.
6. Cobrador visível antes do chute (câmera atrás do jogador, como no PS2).
7. Elenco Lendário: atributos, pé bom e cobrador sugerido.
8. Modo Temporada: camisa, escalação, liga, tabela e especialista do banco. Treino livre e recorde.
9. Acabamento: som, replay do golaço e nome da jogada.
10. Rodada de ajuste fino jogando no celular.
11. Depois: transformar em PWA para instalar na tela inicial do celular.

## Critério de sucesso da v0.1

Eu e mais 5 pessoas cobramos 20 faltas seguidas no celular. Se quiserem bater a 21ª, a mecânica funciona e vale evoluir. Se não, ajustamos ou arquivamos.

## Decisão pendente: nomes dos jogadores

- O elenco usa lendas reais como referência, mas no jogo aparecem por **apelido e número**, sem escudos oficiais, no estilo do PES antigo. A identidade vem do visual (cabelo, porte físico, número) e do estilo de cobrança.
- Atenção: o que a lei protege é a pessoa ser reconhecível, mesmo sem o nome. Em protótipo gratuito, o risco prático é zero. Notas e atributos de pessoas reais entram na mesma conta.
- Nomes reais (Pirlo, Beckham, Messi etc.) estão descartados: uso comercial de nome e imagem sem autorização é protegido pelo Código Civil (arts. 18 e 20, e a família pode agir no caso de falecidos), além do risco de remoção nas lojas.
- Em avaliação: nomes paródia (Andrei Pelo, Dvd Beck, Dinho10, Cris7). Reduzem o risco, mas não eliminam, porque o que a lei protege é a identificação da pessoa. "Cris7" tem risco extra, porque CR7 é marca do Cristiano Ronaldo. Evitar "CR7" em qualquer forma.
- Alternativa mais segura: lendas fictícias definidas pela técnica (folha seca, trivela, sem rotação, por cima da barreira).
- Decidir antes de publicar em loja ou monetizar.

## Visão futura (backlog, não construir agora)

- **Princípio:** progressão por técnica, não por atributo comprado.
- **Acesso entre ligas:** ser campeão leva para uma liga mais difícil (em vez de escolher a liga num menu).
- **Desafio do Mestre:** cada lenda tem um desafio próprio que ensina sua técnica (folha seca, sem rotação, por baixo da barreira).
- **Clima:** vento e chuva em alguns jogos.
- **Alvos:** homenagem ao Click Jogos, com placas no gol e combo por acertos seguidos.
- **Falta do Dia:** a mesma cobrança para todos, com ranking diário.
- **Sobrevivência:** cobrar até errar.
- **Faltas clássicas recriadas,** sem citar quem bateu.
- **Economia:** moeda ganha jogando, gasta só em itens visuais (bola, chuteira, uniforme fictício, estádio, rastro da bola).
- **Monetização:** anúncio recompensado, compra única para remover anúncios e itens visuais.
- **Publicação:** PWA primeiro; Android depois, empacotando a versão web; iOS por último (exige Mac ou serviço de build na nuvem, e conta anual na Apple).
- **Nome definitivo:** "Free Kick" é termo genérico e lotado nas lojas, e "Legends" sugere jogadores reais. Revisar antes de publicar.

## Contexto estratégico

- É um projeto de laboratório, com tempo limitado. A fonte de renda principal é o ResuNinja, e o Ninja Duel também está na fila.
- O que for aprendido aqui (física, publicação, monetização, retenção) deve servir ao Ninja Duel.
- O mercado de jogo casual de futebol é saturado e dominado por estúdios grandes, e a receita de anúncio por usuário é baixa, principalmente no Brasil. Não tratar como fonte de renda.
