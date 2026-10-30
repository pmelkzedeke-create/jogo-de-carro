import { useEffect } from 'react';
import { navigate } from '../../app/controller';
import { ScreenHeader } from '../components/Controls';

export function CreditsScreen() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="screen solid" style={{ flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 'min(760px, 100%)' }}>
        <ScreenHeader title="Créditos" onBack={() => navigate('menu')} />
        <div className="panel credits-card">
          <div className="logo" style={{ fontSize: '2.4rem' }}>
            Apex<span>Velocity</span>
          </div>
          <p>Jogo de corrida 3D original para navegador. Pistas, carros, marcas, personagens, interface e textos são criações originais deste projeto.</p>
          <h3>Tecnologia</h3>
          <ul className="list-plain">
            <li>three.js — renderização WebGL (licença MIT)</li>
            <li>Rapier 3D (@dimforge/rapier3d-compat) — física em WebAssembly (licença Apache-2.0)</li>
            <li>React — interface (licença MIT)</li>
            <li>Vite e TypeScript — ferramentas de desenvolvimento</li>
            <li>Fontes Barlow Condensed e Inter — SIL Open Font License, servidas localmente via Fontsource</li>
          </ul>
          <h3>Conteúdo</h3>
          <ul className="list-plain">
            <li>Modelos de carros: gerados proceduralmente (provisórios), prontos para substituição por arquivos GLB licenciados.</li>
            <li>Texturas: geradas proceduralmente em tempo de carregamento.</li>
            <li>Áudio: sintetizado em tempo real com Web Audio (provisório).</li>
            <li>Céu: modelo analítico de Preetham (three.js Sky).</li>
          </ul>
          <h3>Aviso</h3>
          <p className="muted">
            Todas as marcas, fabricantes e pilotos exibidos são fictícios. Jogos comerciais do gênero foram usados apenas como referência de qualidade; este
            projeto não possui afiliação com eles e não utiliza nenhum de seus conteúdos.
          </p>
        </div>
      </div>
    </div>
  );
}
