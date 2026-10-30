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
- **Garagem 3D** com câmera orbital, compra de carros/pinturas e seleção do carro ativo.
- **Câmeras**: perseguição próxima/distante, capô, cockpit, cinematográfica e órbita de apresentação.
- **Efeitos**: marcas de pneu, fumaça, poeira, faíscas, céu físico, sombras, neblina, bloom opcional.
- **Áudio procedural** (Web Audio): motor por RPM/carga, pneus, vento, terreno, impactos, trocas, contagem e interface,
  liberado apenas após interação do usuário.
- **Progresso salvo** (localStorage, versionado e validado campo a campo, com cópia de segurança): créditos, XP, níveis,
  reputação, recordes, histórico, estatísticas e conquistas. Cada resultado é recompensado **uma única vez**.
- **Configurações funcionais**: qualidade, escala de resolução, sombras, distância, partículas, efeitos, limite de FPS,
  sensibilidade, assistências, câmera, FOV, volumes, unidade, HUD reduzido, minimapa, pausa automática, tela cheia.

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
  career/             progressão, economia, conquistas
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
