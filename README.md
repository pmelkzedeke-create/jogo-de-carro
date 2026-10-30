# APEX VELOCITY

Jogo de corrida 3D **original** para navegador, feito com **Three.js + TypeScript + Vite + Rapier 3D (WebAssembly) + React**.
Roda inteiramente no cliente (sem backend), salva o progresso localmente e pode ser hospedado como site estático (Vercel).

> Pistas, carros, marcas, pilotos, interface e textos são criações originais. Jogos comerciais do gênero foram usados apenas
> como referência de qualidade. Os modelos 3D dos carros, as texturas e os sons atuais são **procedurais e provisórios**
> (gerados em código) e estão claramente marcados como tal no jogo.

## Como executar

Requisitos: **Node.js 22.12+** e npm.

```bash
npm install
npm run dev          # servidor de desenvolvimento em http://localhost:5173
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Verificação de tipos (`tsc --noEmit`) + build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente (porta 4173) |
| `npm run typecheck` | Apenas a verificação de tipos |
| `npm test` | Testes unitários e de integração (Vitest + Rapier real em Node) |
| `npm run test:e2e` | Testes no navegador (Playwright) — requer `npx playwright install chromium` |
| `npm run tracks:plot` | Gera mapas SVG das pistas em `/tmp/apex-plots` (ferramenta de design) |

### Controles

| Ação | Teclado | Controle (padrão Xbox/PS) |
| --- | --- | --- |
| Acelerar | W / ↑ | RT |
| Frear / ré (segure parado) | S / ↓ | LT |
| Esterçar | A D / ← → | Analógico esquerdo |
| Freio de mão | Espaço | A / X |
| Recuperar o carro | R | B |
| Trocar câmera | C | Y |
| Pausar | Esc / P | Start |
| Reiniciar corrida | N | Back |

Em telas sensíveis ao toque aparecem controles na tela (volante analógico, acelerador, freio, freio de mão, câmera,
recuperação e pausa). O mapeamento de teclas fica centralizado em `src/input/Keymap.ts`.

## Fases implementadas

| Fase | Conteúdo | Situação |
| --- | --- | --- |
| 1 | Projeto, cena, renderer, câmera, circuito, carro controlável, colisões, largada, checkpoints, voltas, HUD, pausa/reinício | Concluída e testada |
| 2 | Curvas, tração, frenagem, drift, recuperação, colisões, ajuste por carro, passo fixo, testes de física | Concluída e testada |
| 3 | IA, grid, classificação, dificuldades, corrida rápida, contrarrelógio, treino livre, resultados | Concluída e testada |
| 4 | Pipeline GLB (DRACO/KTX2), PBR, rodas/luzes, garagem 3D, câmeras, áudio, partículas, cenário | Concluída (modelos/sons ainda provisórios) |
| 5 | Save versionado, economia, XP/níveis/reputação, compras, campeonatos, rivais, conquistas, histórico, história | Concluída e testada |
| 6 | Desempenho, interface responsiva, opções gráficas, testes finais, build de produção, documentação | Concluída (ver limitações) |

## O que existe hoje

- **Física real** (Rapier 3D): controlador próprio de veículo por raios (suspensão mola‑amortecedor, barra estabilizadora,
  modelo de pneus com ângulo de deriva e elipse de atrito, freio de mão que reduz a aderência traseira, arrasto, downforce,
  motor com curva de torque, câmbio automático simulado, ré, limitador, freio‑motor, assistências ABS/TC/estabilidade).
  Passo fixo de 1/120 s com acumulador limitado — o resultado não muda entre 30, 60, 120 e 144 FPS (testado).
- **5 carros fictícios** com parâmetros próprios (tração dianteira, traseira, integral e elétrico). As estatísticas da garagem
  são calculadas a partir da mesma física (0–100, velocidade máxima, frenagem).
- **4 pistas** geradas por pontos de controle (Catmull‑Rom centrípeta): Circuito Costa Azul, Anel da Serra Verde,
  Porto Industrial (circuitos) e Estrada do Mirante (sprint). Largura constante, zebras automáticas, áreas de escape,
  barreiras validadas, terreno que acompanha a pista, grid, portais de checkpoint e cenário por tema.
- **Regras de corrida determinísticas**: portais orientados com histerese, voltas só contam na ordem correta, recuar
  sobre a linha desfaz a volta, atalhos/checkpoints pulados não contam, recuperação (R) volta ao último ponto seguro
  sem alterar voltas, detecção de contramão e classificação em tempo real.
- **IA** com linha de corrida de curvatura mínima, perfil de velocidade com frenagem, ultrapassagem/desvio, erros
  controlados por dificuldade (Fácil, Normal, Difícil) e as mesmas regras e física do jogador (sem “teleporte” ou rubber band).
- **Modos**: Corrida rápida, Contrarrelógio, Treino livre e Desafio de drift (pontuação só para drifts válidos).
- **Carreira “Do Litoral à Liga”**: 3 capítulos, 8 eventos, personagens fixos (Tio Bento, Marina Duarte, Caio Ventura,
  Lia Okada), diálogos fixos antes/depois dos eventos, objetivos, rivais e bônus pagos uma única vez.
- **Campeonatos** por pontos (25‑18‑15‑12‑10‑8‑6‑4) com grid fixo; a etapa só é registrada com a classificação final.
- **Estatísticas**: recordes por pista, histórico das últimas corridas e 14 conquistas.
- **Garagem 3D** com câmera orbital, compra de carros/pinturas e seleção do carro ativo.
- **Câmeras**: perseguição próxima/distante, capô, cockpit, cinematográfica e órbita de apresentação.
- **Efeitos**: marcas de pneu, fumaça, poeira, faíscas, céu físico, sombras, neblina, bloom opcional.
- **Áudio procedural** (Web Audio): motor por RPM/carga, pneus, vento, terreno, impactos, trocas, contagem e interface,
  liberado apenas após interação do usuário.
- **Progresso salvo** (localStorage, versionado e validado campo a campo, com cópia de segurança): créditos, XP, níveis,
  reputação, recordes, histórico, estatísticas e conquistas. Cada resultado é recompensado **uma única vez**.
- **Configurações funcionais**: qualidade, escala de resolução, sombras, distância, partículas, efeitos, limite de FPS,
  sensibilidade, assistências, câmera, FOV, volumes, unidade, HUD reduzido, minimapa, pausa automática, tela cheia.

## Testes e verificação

- `npm test` — 96 testes (Vitest) com o **Rapier real em Node**: física do veículo (aceleração, frenagem, ré, esterço,
  drift, colisões sem atravessar/lançar, independência de FPS em 30/60/120/144), comportamento (sobresterço RWD x
  subesterço FWD, TC, ABS, grama, estabilidade, pouso), regras de volta (válida, contramão, atalho, debounce, recuo,
  recuperação, sprint), pistas, IA completando voltas em todas as pistas, corridas completas com 6–8 carros,
  economia idempotente, persistência/recuperação do save, carreira e campeonatos, pipeline GLB.
- `npm run test:e2e` — Playwright: inicialização e configurações persistidas, corrida com aceleração/pausa/saída,
  corrida completa até os resultados (IA pilotando via `?autopilot=1`), celular na horizontal com controles de toque e
  fluxo da carreira. Para usar outro Chromium: `PW_CHROMIUM_PATH=/caminho/chromium` (e `PW_CHROMIUM_ARGS`, se preciso);
  para testar um servidor já rodando: `E2E_BASE_URL=http://localhost:5173`.
- Parâmetros de depuração (somente com `?debug=1` ou em desenvolvimento): `window.__APEX__.state()` e
  `window.__APEX__.setTimeScale(n)`; `?autopilot=1` faz a IA pilotar o carro do jogador (usado nos testes).

## Desempenho

- Medições exibidas em jogo (Configurações → Gráficos → Mostrar desempenho): FPS, tempo de CPU por quadro, tempo de
  física, chamadas de desenho e triângulos.
- Física medida em Node: ~0,7 ms por passo com 6 carros (IA + regras incluídas), ou seja ~8% de um núcleo a 120 Hz.
- Otimizações: geometria estática mesclada (barreiras, marcações, faixas), árvores e postes instanciados por célula
  (descarte por frustum), detalhes dos carros ocultados à distância, marcas de pneu em buffer circular, partículas
  instanciadas, sem alocações nos laços críticos, renderização reduzida em pausa, pausa em aba oculta, tratamento de
  perda de contexto WebGL, pixel ratio limitado a 1,75 e qualidade inicial escolhida conforme o dispositivo.
- Efeitos são aproximações em tempo real (mapas de sombra, PMREM, bloom). **Não há ray tracing.** Em computadores
  fracos use a predefinição “Baixa” (sem sombras, sem pós-processamento, menos vegetação e resolução reduzida).

## Limitações conhecidas

- Modelos 3D dos carros, texturas e sons são procedurais/provisórios (o pipeline para GLB e a lista de áudios esperados
  já existem). O carregamento de arquivos de áudio gravados ainda não foi implementado.
- Replay e câmera de replay não foram implementados.
- O desempenho não pôde ser medido em GPU real neste ambiente de desenvolvimento (apenas renderização por software);
  os números de FPS dos testes automatizados não representam hardware real.
- Idioma: somente português (Brasil).

## Estrutura

```
src/
  main.tsx            ponto de entrada (React)
  app/                estado global, controlador da aplicação, montagem de eventos
  game/               Game (orquestrador), laço, passo fixo, dados do HUD
  physics/            mundo Rapier, camadas de colisão, superfícies, eventos de impacto
  vehicles/           configuração, catálogo, física do veículo, trem de força, controlador do jogador
  tracks/             definição, construtor, consultas de pista, geometria compartilhada, terreno, colisores
  racing/             portais, voltas, classificação, sessão de corrida, drift, recompensas
  ai/                 linha de corrida, perfil de velocidade, piloto IA, dificuldades
  rendering/          renderer, ambiente, texturas/materiais procedurais, pista, carros, câmeras, efeitos
  garage/             cena 3D da garagem
  audio/              gerenciador de áudio e som de motor sintetizado
  input/              teclado, gamepad, toque e mapeamento de teclas
  career/             progressão, economia, conquistas, história, campeonatos
  persistence/        esquema versionado do save e gerenciador de armazenamento
  ui/                 telas e componentes React
  styles/             CSS global
  utils/              matemática, RNG determinístico, validação, formatação, eventos
tests/unit/           testes Vitest (física com Rapier real, regras, pistas, IA, sessão, economia, persistência)
tests/e2e/            testes Playwright (navegador)
public/assets/        pastas para assets externos (veículos GLB, texturas, ambientes, áudio, interface)
```

## Publicação na Vercel (site estático)

1. Envie o repositório para o GitHub.
2. Na Vercel, **Add New → Project** e importe o repositório.
3. A configuração já está em `vercel.json` (framework Vite, `npm ci`, `npm run build`, saída `dist/`).
4. Clique em **Deploy**. Não há variáveis de ambiente nem backend.

Também funciona em qualquer hospedagem estática: rode `npm run build` e publique a pasta `dist/`
(os caminhos são relativos, então funciona inclusive em subpastas).

## Requisitos do navegador

WebGL 2 e WebAssembly (Chrome, Edge, Firefox ou Safari recentes, com aceleração de hardware). Se algo faltar, o jogo exibe
uma mensagem explicando o motivo em vez de uma tela preta.

## Licenças de terceiros

three.js (MIT), Rapier (Apache‑2.0), React (MIT), fontes Barlow Condensed e Inter (SIL OFL, servidas localmente).
