# Modelos de veículos (GLB)

Os carros usam **modelos procedurais provisórios** por padrão. Para usar um modelo 3D real, coloque o arquivo `.glb`
nesta pasta e preencha `visual.gltf` do veículo em `src/vehicles/VehicleCatalog.ts`:

```ts
gltf: {
  url: 'vehicles/meu-carro.glb',   // relativo a /assets
  scale: 1,                        // fator de escala
  rotationY: 0,                    // radianos (use Math.PI se o modelo olhar para -Z)
  offset: [0, 0, 0],               // ajuste fino de posição (m)
  wheelNodeNames: { fl: 'wheel_fl', fr: 'wheel_fr', rl: 'wheel_rl', rr: 'wheel_rr' }, // opcional
  paintMaterialNames: ['paint'],   // materiais que recebem a cor escolhida na garagem
}
```

## Convenções

- Unidades em **metros**, **+Y para cima**, frente do carro em **+Z**.
- Origem no **solo**, no centro da carroceria.
- Rodas em **nós separados** (`wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`), cada um com origem no centro da roda e eixo em X.
  O jogo reposiciona as rodas conforme a física (suspensão, esterço e giro). Sem os 4 nós, rodas procedurais são usadas.
- Materiais PBR (`MeshStandard`/`MeshPhysical` no glTF). Materiais especiais por nome:
  `paint` (pintura), `brake_light` (luz de freio), `reverse_light` (luz de ré), `headlight` (faróis).
- Compressão suportada: **DRACO** (geometria) e **KTX2/Basis** (texturas) — decodificadores servidos localmente
  em `/assets/decoders` (copiados automaticamente de `three` por `scripts/copy-decoders.mjs`).

## Validação e falhas

Ao carregar, o jogo verifica: existência de malhas, dimensões plausíveis (comprimento 2,5–7 m, largura 1,2–3 m,
altura 0,8–3 m), orientação, contagem de triângulos (limite 600 mil) e materiais. Se o arquivo faltar ou for inválido,
o carro usa o modelo procedural e o jogador recebe um aviso — a falha nunca é silenciosa.

A **física não depende do modelo visual**: dimensões de colisão, posição das rodas, massa etc. ficam em
`physics` na definição do veículo.

## Arquivo atual

- `valkar-sprint-gt.glb` — exemplo gerado a partir do modelo procedural (`npm run assets:sample-glb`) apenas para
  validar o pipeline. **É provisório**: substitua por um modelo próprio ou licenciado.

Use apenas modelos originais, licenciados ou fornecidos por você. Não utilize modelos de jogos comerciais ou de
procedência duvidosa.
