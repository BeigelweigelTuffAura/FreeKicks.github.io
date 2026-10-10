# Free Kick Legends (nome provisório)

## O que é

Minigame 3D leve de cobrança de faltas para celular, jogável no navegador por um link.

Inspirações: os jogos de falta do antigo Click Jogos, as cobranças de falta do PES de PS2, Score! Hero e New Star Soccer.

Os gráficos são simples de propósito. O produto é a mecânica do chute: ela precisa ser gostosa de repetir.

O tema: um elenco formado só por grandes cobradores de falta da história. O jogador escolhe quem bate, vê a barreira e o goleiro com as cores do rival do clube daquele cobrador, imagina o lance e cobra. Sem campeonato: é bater falta e se divertir.

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

## Modos de jogo (decisão de 9/10/2026, ampliada em 10/10/2026)

A base é o **treino livre com rival**. A cada falta o jogo sorteia a posição e um cobrador do Elenco Lendário
(dá para trocar na lista, que mostra o mais indicado). O cobrador veste a camisa do clube em que foi marcante;
a barreira e o goleiro vestem as cores de um rival desse clube. Placar de gols na sessão, replay e vídeo do lance.

Em 10/10/2026, com amigos e família jogando pelo link, entraram dois modos pequenos em cima da mesma mecânica
(botões no alto da tela; o jogo abre no último modo usado):

- **Treino**: o de sempre (falta sorteada, botão de falta fixa).
- **Desafio do Dia** (só faltas): as mesmas faltas, na mesma ordem, para todo mundo no mesmo dia. A data vira a
  semente do sorteio (falta, cobrador sugerido e até o erro da mira saem dela). Vale a maior sequência de gols:
  errou, volta para a primeira falta do dia. A pressão (erro a mais; a frieza do cobrador corta parte) cresce
  com a sequência, que é o lance decisivo deste jogo.
  **Ranking do dia (etapa 8):** com pelo menos 2 gols seguidos, a pessoa digita o nome e a melhor sequência
  dela vai para um ranking na internet, que todo mundo vê no jogo e que zera todo dia. Os dados ficam num
  projeto **Supabase** (banco de dados na internet com plano grátis; o jogo fala com ele por endereço + chave
  pública, em `config.js`, campo `ranking`; a tabela e as permissões estão em `ranking-supabase.sql`, para
  colar no SQL Editor do projeto). Sem endereço e chave, o ranking fica desligado e a melhor
  sequência fica só no aparelho. Ressalva aceita: como o jogo roda inteiro no celular, alguém com vontade
  consegue mandar um número falso; para amigos e família, serve. O "Compartilhar" da etapa 7 saiu.
  **Justiça:** no desafio o painel de ajuste fica trancado e os números do jogo voltam ao padrão (ninguém deixa
  o goleiro fácil para bater o recorde); o goleiro do desafio é fixo e um pouco mais fraco que o do treino
  (`config.js`, `desafio.goleiro`), para a sequência render.
- **Pênaltis**: bola na marca, sem barreira, mesma mecânica de contato e força (pressão fixa). O goleiro decide
  antes do chute, com sorteio de semente (o replay repete): em 80% das vezes vai num canto; nos outros 20%
  fica e só pega bola fraca ou no meio. Antes da corrida ele faz "mind game": aponta um canto; quando vai,
  em 65% das vezes vai para o canto que apontou. Ele tem memória: se você bate seguidas vezes no mesmo lado,
  passa a ir mais para lá (com três seguidas, ~85%). É um goleiro bom: quando acerta o canto, pega a bola de
  meia altura e a bola perto dele; só a bola forte e no canto entra. Os números estão no painel.
  A sugestão de cobrador no pênalti usa precisão, frieza e força (não curva nem queda).

Ideia descartada no desenho do pênalti: "aponta um lado e vai para lá em 50% das vezes". Meio a meio não é
informação nenhuma; o jogador ignora em duas tentativas. Por isso a dica é verdadeira na maioria das vezes e a
memória pune a repetição.

**Câmera do replay (10/10/2026):** lateral, do lado direito de quem cobra, sempre o mesmo lado, com o gol à
direita da tela, como no treino do PES de PS2: longe e de cima (24 m para o lado, 12 m de altura), andando um
pouco junto com a bola e olhando para um ponto entre a bola e o gol. A câmera atrás do gol continua
disponível no painel, para comparar.

~~Modo Temporada (tela inicial, escolha de camisa, escalação, liga de 8 times com 7 jogos de 3 faltas,
especialista do banco, tabela e recorde)~~: **retirado do escopo**. Decisão de quem conduz o projeto: o jogo é
chegar, escolher o batedor e ficar batendo falta. Se um dia voltar, a base (elenco, notas por falta, sugestão
de cobrador) já existe.

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
- Elenco Lendário com atributos e treino livre com rival (sem Modo Temporada).
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
4. ~~Mira com imprecisão e controles de toque.~~ Feito (etapa 4).
5. ~~Barreira e goleiro.~~ Feito (etapa 4: lógica; etapa 5: animação com passos, mergulho e queda).
6. ~~Cobrador visível antes do chute (câmera atrás do jogador, como no PS2).~~ Feito (etapa 5: cada lenda com a sua postura e corrida).
7. ~~Elenco Lendário: atributos, pé bom e cobrador sugerido.~~ Feito (cobrador sorteado a cada falta; a lista mostra o sugerido). Camisa do clube marcante de cada lenda; barreira e goleiro com as cores de um rival desse clube.
8. ~~Modo Temporada.~~ Retirado do escopo (ver "Modo de jogo").
9. ~~Acabamento: som, replay do golaço e nome da jogada.~~ Feito (etapa 5: som sintetizado, rede de pano, câmera lenta; etapa 6: replay com câmera atrás do gol e vídeo para salvar/compartilhar).
10. Rodada de ajuste fino jogando no celular. (Em andamento: etapa 6 veio do primeiro teste no iPhone.)
11. ~~Etapa 7: câmera lateral do replay, Desafio do Dia (com compartilhar) e modo Pênaltis.~~ Feito (10/10/2026).
12. ~~Etapa 8: ranking do dia na internet (Supabase), painel trancado no desafio, goleiro do desafio mais fraco,
    câmera do replay mais longe e de cima.~~ Feito (10/10/2026); o ranking só liga quando o endereço e a chave
    do Supabase entrarem em `config.js`.
13. Depois: transformar em PWA para instalar na tela inicial do celular.

Estado em 10/10/2026: publicado `v0.1 · etapa 8.1` (ranking ligado ao projeto Supabase do dono). Amigos e família já jogam pelo link (o critério de sucesso
da v0.1 está sendo cumprido na prática). Agora: ligar o ranking (conta Supabase) e ajuste fino no celular.

Ideias anotadas (não construir sem combinar): tipos de rede para escolher (véu de noiva, caixote, triangular).
A rede é uma simulação presa ao formato do gol e à física da bola na rede; trocar o formato é refazer essa parte.

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
- ~~**Falta do Dia:** a mesma cobrança para todos, com ranking diário.~~ Virou o Desafio do Dia (etapa 7);
  a tabela de ranking entre celulares ficou para quando houver serviço de dados (ver "Modos de jogo").
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
