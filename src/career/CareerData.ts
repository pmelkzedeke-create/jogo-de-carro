/**
 * Conteúdo ORIGINAL da carreira "Do Litoral à Liga".
 * Personagens, equipes, eventos e diálogos são fixos (não sorteados) e fictícios.
 */
import type { DifficultyId } from '../ai/Difficulty';
import type { GameMode, RaceObjective, RacerEntry } from '../racing/RaceTypes';

export interface Character {
  id: string;
  name: string;
  role: string;
  color: string;
}

export const CHARACTERS: Record<string, Character> = {
  bento: { id: 'bento', name: 'Tio Bento', role: 'Mecânico da Oficina Faísca', color: '#ffb020' },
  marina: { id: 'marina', name: 'Marina Duarte', role: 'Chefe da equipe Horizonte Racing', color: '#3d9bff' },
  caio: { id: 'caio', name: 'Caio Ventura', role: 'Piloto da Vórtice Motorsport', color: '#ff3b30' },
  lia: { id: 'lia', name: 'Lia Okada', role: 'Piloto independente', color: '#34c759' },
  narrator: { id: 'narrator', name: '', role: '', color: '#9ba2ad' },
};

export interface DialogueLine {
  speaker: keyof typeof CHARACTERS | 'player';
  text: string;
}

export interface CareerEvent {
  id: string;
  title: string;
  description: string;
  mode: Extract<GameMode, 'career' | 'timeTrial' | 'drift'>;
  trackId: string;
  laps: number;
  difficulty: DifficultyId;
  /** Adversários fixos (rivais da história) — completados com pilotos genéricos até `fieldSize`. */
  rivals: RacerEntry[];
  fieldSize: number;
  objectives: RaceObjective[];
  rewardBase: number;
  xpBase: number;
  /** Bônus pago uma única vez ao cumprir o objetivo principal pela primeira vez. */
  completionBonus: { credits: number; xp: number; reputation: number };
  before: DialogueLine[];
  after: DialogueLine[];
  timeLimit?: number;
  /** Evento que é um campeonato (rodadas jogadas pela tela de campeonatos). */
  championshipId?: string;
}

export interface CareerChapter {
  id: string;
  title: string;
  subtitle: string;
  intro: DialogueLine[];
  outro: DialogueLine[];
  events: CareerEvent[];
  chapterBonus: { credits: number; xp: number; reputation: number };
}

const CAIO_EARLY: RacerEntry = { id: 'rival-caio', name: 'Caio Ventura', vehicleId: 'valkar-sprint-gt', paint: 'onyx', rival: true };
const CAIO: RacerEntry = { id: 'rival-caio', name: 'Caio Ventura', vehicleId: 'kestrel-rs4', paint: 'onyx', rival: true };
const LIA: RacerEntry = { id: 'rival-lia', name: 'Lia Okada', vehicleId: 'sable-nero-v8', paint: 'jade', rival: true };

export const CAREER: readonly CareerChapter[] = [
  {
    id: 'cap-1',
    title: 'Capítulo 1 — Asfalto Quente',
    subtitle: 'Vila Maré, litoral. Uma oficina pequena, um hatch restaurado e uma chance.',
    intro: [
      { speaker: 'narrator', text: 'Vila Maré. O cheiro de maresia se mistura ao de óleo na Oficina Faísca.' },
      { speaker: 'bento', text: 'Terminei o acerto do Sprint GT. Não é o carro mais forte da região, mas é honesto: ele faz exatamente o que você pedir.' },
      { speaker: 'player', text: 'É tudo de que eu preciso, Tio Bento.' },
      { speaker: 'bento', text: 'Domingo tem treino aberto no Circuito Costa Azul. Gente de equipe grande costuma aparecer. Mostre o que sabe — com calma.' },
    ],
    outro: [
      { speaker: 'marina', text: 'Eu vi a sua corrida contra o Ventura. Pouca gente segura a pressão dele no porto.' },
      { speaker: 'marina', text: 'Sou Marina Duarte, da Horizonte Racing. Somos pequenos, mas levamos pilotos ao campeonato regional. Quer correr com a gente?' },
      { speaker: 'bento', text: 'Vai lá. A oficina continua aqui — e eu continuo sendo seu mecânico.' },
    ],
    chapterBonus: { credits: 8000, xp: 900, reputation: 60 },
    events: [
      {
        id: 'c1-treino',
        title: 'Treino aberto',
        description: 'Duas voltas cronometradas no Circuito Costa Azul para mostrar consistência.',
        mode: 'timeTrial',
        trackId: 'costa-azul',
        laps: 2,
        difficulty: 'easy',
        rivals: [],
        fieldSize: 1,
        objectives: [{ type: 'bestLap', value: 78, label: 'Fazer uma volta abaixo de 1:18.000' }],
        rewardBase: 2400,
        xpBase: 300,
        completionBonus: { credits: 1500, xp: 200, reputation: 10 },
        before: [
          { speaker: 'bento', text: 'Nada de heroísmo hoje. Aprenda as freadas: a Curva do Farol no fim da reta pede respeito.' },
        ],
        after: [{ speaker: 'bento', text: 'Bonito. Agora sim: estão anotando o seu nome na cabine de cronometragem.' }],
      },
      {
        id: 'c1-copa',
        title: 'Copa Vila Maré',
        description: 'A corrida local de domingo. Seis carros, três voltas — e o pódio paga as contas da oficina.',
        mode: 'career',
        trackId: 'costa-azul',
        laps: 3,
        difficulty: 'easy',
        rivals: [],
        fieldSize: 6,
        objectives: [{ type: 'position', value: 3, label: 'Terminar no pódio (top 3)' }],
        rewardBase: 5200,
        xpBase: 520,
        completionBonus: { credits: 2500, xp: 300, reputation: 20 },
        before: [{ speaker: 'bento', text: 'Você larga do fundo. Paciência na primeira volta: a corrida é decidida no fim.' }],
        after: [
          { speaker: 'caio', text: 'Pódio na copinha de bairro? Parabéns. No porto, sábado, a conversa é outra.' },
          { speaker: 'bento', text: 'Esse é o Caio Ventura. Rápido, mimado e acostumado a ganhar. Ótimo adversário.' },
        ],
      },
      {
        id: 'c1-duelo',
        title: 'Recado no porto',
        description: 'Caio Ventura desafia você para um duelo no Porto Industrial. Muros perto, nenhuma margem de erro.',
        mode: 'career',
        trackId: 'porto-industrial',
        laps: 3,
        difficulty: 'normal',
        rivals: [CAIO_EARLY],
        fieldSize: 4,
        objectives: [{ type: 'position', value: 1, label: 'Vencer a corrida' }],
        rewardBase: 6500,
        xpBase: 650,
        completionBonus: { credits: 3000, xp: 400, reputation: 35 },
        before: [
          { speaker: 'caio', text: 'Mesmo carro que o seu, para ninguém dizer que foi vantagem. Tente acompanhar.' },
          { speaker: 'bento', text: 'No porto, quem freia por último bate primeiro. Seja limpo.' },
        ],
        after: [{ speaker: 'caio', text: 'Sorte de principiante. Isso não vai se repetir.' }],
      },
    ],
  },
  {
    id: 'cap-2',
    title: 'Capítulo 2 — Equipe Horizonte',
    subtitle: 'Uniforme novo, pressão nova. O campeonato regional começa.',
    intro: [
      { speaker: 'marina', text: 'Bem-vindo à Horizonte. Este é o boxe — e esta é a Lia Okada, que também vai disputar o regional.' },
      { speaker: 'lia', text: 'Olá. Só para avisar: equipe é equipe, pista é pista. Não vou te dar passagem.' },
      { speaker: 'marina', text: 'Ótimo. É assim que vocês dois vão melhorar. Primeiro, quero ver controle de carro: teste de drift no porto.' },
    ],
    outro: [
      { speaker: 'marina', text: 'Pódio no regional na temporada de estreia. Os patrocinadores ligaram — todos.' },
      { speaker: 'lia', text: 'Admito: você me fez frear mais tarde do que eu gostaria. Até a próxima.' },
      { speaker: 'caio', text: 'Se acha que acabou, apareça no Desafio do Porto. Ao pôr do sol. Vamos resolver isso de uma vez.' },
    ],
    chapterBonus: { credits: 15000, xp: 1600, reputation: 110 },
    events: [
      {
        id: 'c2-drift',
        title: 'Teste de controle',
        description: 'Marina quer ver domínio total do carro: pontue com drifts limpos no Porto Industrial.',
        mode: 'drift',
        trackId: 'porto-industrial',
        laps: 99,
        difficulty: 'normal',
        rivals: [],
        fieldSize: 1,
        objectives: [{ type: 'drift', value: 8000, label: 'Somar 8.000 pontos de drift' }],
        rewardBase: 4500,
        xpBase: 500,
        completionBonus: { credits: 3000, xp: 400, reputation: 25 },
        timeLimit: 150,
        before: [{ speaker: 'marina', text: 'Freio de mão para iniciar, acelerador para sustentar, contraesterço para corrigir. Bater zera a sequência.' }],
        after: [{ speaker: 'marina', text: 'Controle de sobra. Agora vamos usar isso para ganhar tempo, não para fazer fumaça.' }],
      },
      {
        id: 'c2-serra',
        title: 'Classificatória da Serra',
        description: 'Prova classificatória no Anel da Serra Verde contra Lia, Caio e o pelotão regional.',
        mode: 'career',
        trackId: 'serra-verde',
        laps: 2,
        difficulty: 'normal',
        rivals: [LIA, CAIO],
        fieldSize: 6,
        objectives: [{ type: 'position', value: 3, label: 'Terminar no pódio (top 3)' }],
        rewardBase: 7500,
        xpBase: 760,
        completionBonus: { credits: 4000, xp: 500, reputation: 40 },
        before: [{ speaker: 'lia', text: 'As curvas cegas da serra enganam. Se não tiver certeza, não arrisque.' }],
        after: [{ speaker: 'marina', text: 'Classificados. O regional é logo depois — três etapas, pontos corridos.' }],
      },
      {
        id: 'c2-regional',
        title: 'Campeonato Regional Litoral',
        description: 'Três etapas, pontos corridos (25-18-15-12-10-8-6-4). Termine o campeonato entre os três primeiros.',
        mode: 'career',
        trackId: 'costa-azul',
        laps: 3,
        difficulty: 'normal',
        rivals: [LIA, CAIO],
        fieldSize: 6,
        objectives: [{ type: 'position', value: 3, label: 'Terminar o campeonato no top 3' }],
        rewardBase: 0,
        xpBase: 0,
        completionBonus: { credits: 9000, xp: 1000, reputation: 70 },
        championshipId: 'regional-litoral',
        before: [{ speaker: 'marina', text: 'Consistência ganha campeonato. Um quinto lugar ainda vale pontos; uma batida não vale nada.' }],
        after: [{ speaker: 'marina', text: 'Top 3 no regional! A Horizonte nunca tinha chegado tão longe.' }],
      },
    ],
  },
  {
    id: 'cap-3',
    title: 'Capítulo 3 — Noite no Porto',
    subtitle: 'O último acerto de contas antes da Liga Nacional.',
    intro: [
      { speaker: 'bento', text: 'Voltei a mexer no seu carro como nos velhos tempos. Para a serra e para o porto, ele está pronto.' },
      { speaker: 'marina', text: 'Primeiro, o Sprint do Mirante: estrada de serra, ponto a ponto. Depois, o Desafio do Porto contra o Caio.' },
    ],
    outro: [
      { speaker: 'caio', text: 'Você venceu limpo. Eu... reconheço. Nos vemos na Liga Nacional — e lá eu não vou subestimar você.' },
      { speaker: 'lia', text: 'Liga Nacional, hein? Vou chegar lá também. Guarde um lugar no grid.' },
      { speaker: 'marina', text: 'O convite oficial chegou: Horizonte Racing na Liga Nacional, com você ao volante.' },
      { speaker: 'bento', text: 'De uma oficina de bairro para a Liga. Agora é só continuar acelerando.' },
      { speaker: 'narrator', text: 'Fim do primeiro ato de “Do Litoral à Liga”. Campeonatos, contrarrelógios e desafios continuam disponíveis.' },
    ],
    chapterBonus: { credits: 25000, xp: 2500, reputation: 180 },
    events: [
      {
        id: 'c3-mirante',
        title: 'Sprint do Mirante',
        description: 'Corrida ponto a ponto pela Estrada do Mirante, com retas rápidas e curvas encadeadas.',
        mode: 'career',
        trackId: 'estrada-mirante',
        laps: 1,
        difficulty: 'normal',
        rivals: [LIA],
        fieldSize: 6,
        objectives: [{ type: 'position', value: 2, label: 'Terminar entre os dois primeiros' }],
        rewardBase: 9000,
        xpBase: 900,
        completionBonus: { credits: 5000, xp: 600, reputation: 50 },
        before: [{ speaker: 'lia', text: 'No sprint não existe segunda volta para corrigir erros. Bom trabalho para nós dois.' }],
        after: [{ speaker: 'lia', text: 'Isso foi rápido de verdade. Agora vai lá resolver o assunto com o Caio.' }],
      },
      {
        id: 'c3-desafio',
        title: 'Desafio do Porto',
        description: 'Quatro voltas ao pôr do sol no Porto Industrial. Caio Ventura e o melhor pelotão da região.',
        mode: 'career',
        trackId: 'porto-industrial',
        laps: 4,
        difficulty: 'hard',
        rivals: [CAIO, LIA],
        fieldSize: 8,
        objectives: [{ type: 'position', value: 1, label: 'Vencer o Desafio do Porto' }],
        rewardBase: 14000,
        xpBase: 1400,
        completionBonus: { credits: 10000, xp: 1200, reputation: 120 },
        before: [
          { speaker: 'caio', text: 'Sem desculpas hoje. Quem ganhar, vai para a Liga com o nome limpo.' },
          { speaker: 'marina', text: 'Respire. Você já venceu ele aqui uma vez. Faça de novo.' },
        ],
        after: [{ speaker: 'bento', text: 'Eu sabia. Desde o primeiro dia na oficina, eu sabia.' }],
      },
    ],
  },
];

export function findCareerEvent(eventId: string): { chapter: CareerChapter; event: CareerEvent; chapterIndex: number } | null {
  for (let c = 0; c < CAREER.length; c++) {
    const event = CAREER[c].events.find((e) => e.id === eventId);
    if (event) return { chapter: CAREER[c], event, chapterIndex: c };
  }
  return null;
}
