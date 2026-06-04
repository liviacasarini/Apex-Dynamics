/**
 * tabCatalog.js — Descritivo comercial de cada aba (pitch de vendas).
 *
 * Exibido nas abas que o cliente ainda não comprou (somente-leitura) e nas
 * funcionalidades futuras, para explicar o que a aba entrega, os benefícios
 * para a equipe e instigar a compra.
 *
 * Estrutura por aba:
 *   tagline   — frase curta de impacto
 *   what      — o que a funcionalidade faz (resumo objetivo)
 *   benefits  — lista de benefícios concretos para a equipe
 *   price     — referência de preço (texto livre) | null para futuras
 */

export const TAB_CATALOG = {
  overview: {
    tagline: 'Sua sessão inteira resumida em 2 segundos.',
    what: 'Painel central que, ao carregar um arquivo, mostra um resumo visual completo: velocidade máxima, RPM de pico, temperaturas extremas, alertas de dados vitais e consumo de combustível — tudo em cards de leitura imediata. Inclui calculadora de combustível com cenários salvos, gráfico radar comparativo e detecção automática de outlap.',
    benefits: [
      'Elimina os 15 minutos típicos de "abrir planilha e procurar coluna" de toda análise pós-sessão.',
      'O engenheiro-chefe bate o olho e já sabe se a sessão foi boa ou se há problema crítico.',
      'Reúne os números que importam numa tela só, sem cálculo manual.',
    ],
    price: 'Incluso na Licença Base',
  },
  laps: {
    tagline: 'Pare de discutir sensações. Mostre evidências.',
    what: 'Sobreposição visual de várias voltas em gráficos sincronizados de velocidade, rotação, aceleração, frenagem e força lateral, alinhados por distância ou tempo. Carrega múltiplas sessões ao mesmo tempo (manhã vs. tarde, setup A vs. B, piloto vs. piloto).',
    benefits: [
      'Mostra ao piloto, em tela, que ele freia 15 m antes do ponto ideal na curva 7.',
      'A conversa deixa de ser sobre "achismo" e passa a ser sobre dado objetivo.',
      'Identifica exatamente onde o tempo está sendo perdido, volta a volta.',
    ],
    price: 'R$ 150/carro/mês',
  },
  wot: {
    tagline: 'Descubra o problema no motor antes da quebra.',
    what: 'Identifica automaticamente todas as zonas com mais de 90% de acelerador e cruza esses momentos com dados críticos do motor: lambda, pressão de boost, temperatura de óleo, rotação e tensão da bateria. Tabela comparativa volta a volta.',
    benefits: [
      'Avisa se o lambda empobrece nas retas ou a pressão de óleo cai nas curvas de carga.',
      'Previne quebra de motor — economiza dezenas de milhares de reais em retífica.',
      'Evita o abandono no meio da corrida por falha que daria pra prever.',
    ],
    price: 'R$ 150/carro/mês',
  },
  vitals: {
    tagline: 'O carro avisa antes de parar na pista.',
    what: 'Monitoramento dedicado dos sinais vitais: temperatura do motor, pressão de óleo, tensão da bateria, nível de combustível e lambda — cada um com limites configuráveis e alertas amarelos/vermelhos que se propagam automaticamente para o Overview.',
    benefits: [
      'Quando a bateria cai abaixo de 12 V na volta 14, o sistema detecta e alerta.',
      'Sem essa ferramenta, a equipe só descobre o problema quando o carro para.',
      'Limites adaptados ao tipo de veículo, com canais expansíveis.',
    ],
    price: 'R$ 280/carro/mês',
  },
  report: {
    tagline: 'Diagnóstico completo da sessão em 10 segundos.',
    what: 'Geração automática de relatórios com os valores extremos de cada parâmetro: RPM máximo, pressão mínima de combustível, tensão mínima da bateria, temperatura máxima do motor e pressão de óleo crítica — com indicadores visuais ao ultrapassar limites. Filtros por melhores voltas, todas as voltas ou sem outlap.',
    benefits: [
      'Transforma uma tarefa de 1 hora em 10 segundos.',
      'Diagnóstico imediato: "motor saudável, bateria estável — o problema é o setup".',
      'Relatório pronto para compartilhar com a equipe.',
    ],
    price: 'R$ 60/carro/mês',
  },
  track: {
    tagline: 'Veja no mapa exatamente onde o carro escorregou.',
    what: 'Visualização GPS da linha de corrida com mapas de calor de velocidade, aceleração e rotação. Detecta retas automaticamente (algoritmo de Haversine), tem modo circuito com pistas pré-carregadas e aceita linhas de centro GPS customizadas.',
    benefits: [
      'O piloto aponta no mapa e o engenheiro confirma: entrada 8 km/h acima da melhor volta.',
      'Diagnóstico visual e instantâneo no briefing pós-sessão.',
      'Cruza traçado com dados — fim do "acho que foi por aqui".',
    ],
    price: 'R$ 280/carro/mês',
  },
  temperature: {
    tagline: 'O asfalto mudou? O setup se recalcula sozinho.',
    what: 'Registro contínuo das condições ambientais e de pista: temperatura do ar, do asfalto, umidade, pressão atmosférica, vento e chuva, além de dados da ECU (IAT, altitude, pressão barométrica). Esses dados alimentam automaticamente outras abas.',
    benefits: [
      'A calculadora de combustível e a de pressão fria se ajustam às condições reais.',
      'Quando o asfalto sobe 12 °C entre o quali e a corrida, o sistema recalcula antes do box.',
      'Decisões de setup baseadas no clima do momento, não no da manhã.',
    ],
    price: 'R$ 150/carro/mês',
  },
  pneus: {
    tagline: 'Gestão de pneus deixa de ser feeling e vira ciência.',
    what: 'Gerenciamento total: biblioteca de compostos com curvas de aderência, pressões por canto, temperaturas em 3 zonas (saída e retorno), comparativo entre stints, inventário com DOT/serial/ciclos e quilometragem por canto. Destaque: calculadora de pressão fria de 3ª geração que aprende com o histórico.',
    benefits: [
      'Prevê a pressão fria ideal com precisão de ±0,1 PSI a partir de sessões salvas.',
      'Rastreia o ciclo de vida de cada pneu (DOT, km, stints).',
      'Transforma a arte do mecânico em processo mensurável e repetível.',
    ],
    price: 'R$ 380/carro/mês',
  },
  setup: {
    tagline: 'Acabou a prancheta que some e a dúvida da cambagem.',
    what: 'Ficha técnica completa numa tela só: suspensão (molas, amortecedores, altura, cambagem, convergência, caster, barras), freios, motor (mapa, limitador, boost), transmissão, diferencial e chassi. Múltiplos setups por perfil, comparáveis entre si, alimentando Peso e Combustível.',
    benefits: [
      'Todo setup salvo, versionado e comparável — nunca mais "qual cambagem rodamos sexta?".',
      'Comparação direta entre configurações para evoluir o carro.',
      'Os dados fluem automaticamente para os cálculos de peso e combustível.',
    ],
    price: 'R$ 150/carro/mês',
  },
  multisession: {
    tagline: 'Compare treino, quali e corrida lado a lado.',
    what: 'Carregamento simultâneo de múltiplos arquivos para análise comparativa profunda: sobrepõe dados vitais, cruza aceleração total e gera relatórios consolidados. Em Endurance vira análise de stint (piloto A vs. B, degradação entre stint 1 e 4).',
    benefits: [
      '"O carro está melhor ou pior que na etapa anterior?" — resposta visual, na hora.',
      'Acompanha a evolução do carro conforme o combustível diminui.',
      'Ideal para decisões de stint e troca de piloto em prova longa.',
    ],
    price: 'R$ 480/carro/mês (requer WOT — combo R$ 630)',
  },
  mecanica: {
    tagline: 'Cada peça rastreada. Cada km registrado.',
    what: 'Controle de peças em 10 categorias (suspensão, motor, transmissão, freio, aero, térmico, elétrico, híbrido, chassi e outras) + customizáveis. Cada componente com quilometragem, histórico de manutenção e snapshots de especificação, lidos automaticamente pelos cálculos de frenagem e balanço.',
    benefits: [
      '"Quantos km tem o jogo de pastilhas?" — a resposta está no sistema, não na memória.',
      'O coeficiente de atrito da pastilha entra direto no cálculo de frenagem.',
      'Uma das abas mais robustas (4.964 linhas de código).',
    ],
    price: 'R$ 400/carro/mês',
  },
  onboard: {
    tagline: 'Vídeo onboard + dados sincronizados, com sensor fusion.',
    what: 'Player duplo que analisa o vídeo GoPro lado a lado com os dados da sessão. Suporta 2 vídeos, mapas sincronizados e medidores de velocidade/rotação/marcha. Reconstitui a trajetória por sensor fusion independente (GPS + acelerômetro + giroscópio) — degrada graciosamente se faltar alguma fonte.',
    benefits: [
      'Mesmo princípio de navegação inercial (INS) de sistemas aviônicos de R$ 80.000+.',
      'Sem GoPro? Usa o GPS da ECU. Sem GPS? O acelerômetro reconstrói o traçado.',
      'Nenhuma ferramenta abaixo de US$ 50.000 oferece isso no motorsport.',
    ],
    price: 'R$ 1.400/carro/mês',
  },
  math: {
    tagline: 'Codifique os segredos da sua equipe — para sempre.',
    what: 'Construtor de canais customizados: crie suas próprias fórmulas combinando qualquer canal de dados. As métricas resultantes são comparáveis entre voltas e sessões em gráficos multi-eixo.',
    benefits: [
      'Liberta a equipe da dependência de atualizações do software.',
      'Cada equipe codifica suas métricas proprietárias uma vez e usa para sempre.',
      'A vantagem competitiva que nenhum software genérico oferece.',
    ],
    price: 'R$ 100/carro/mês',
  },
  regulamentacoes: {
    tagline: 'Zero surpresas na balança do scrutineering.',
    what: 'Ficha técnica regulamentar: peso mínimo, dimensões, restrições de motor (potência, cilindrada, rotação), transmissão, freios, assoalho, aerodinâmica e margens de scrutineering. Os limites disparam alertas automáticos para as outras abas.',
    benefits: [
      'Peso abaixo do mínimo ou pressão fora do regulamento? Sinalizado em vermelho antes da pista.',
      'O app avisa a infração potencial antes da equipe ir para a vistoria.',
      'Tranquilidade total na conformidade técnica.',
    ],
    price: 'R$ 100/carro/mês',
  },
  combustivel: {
    tagline: 'A decisão de quantos litros largar, em tempo real.',
    what: 'Gestão completa de combustível para 6 tipos (comum, E10, sintético, E85, 100 octanas e customizado), com cálculo de consumo empírico e teórico, simulação de abastecimento e planejamento de corrida. Integra com peso e centro de gravidade.',
    benefits: [
      'Mostra: "com 45 L termina com 1,8 L de sobra, mas 2,3 kg abaixo do peso" → largue com 47 L.',
      'A variação de combustível entra no cálculo de CG, peso e tempo de volta.',
      'Planejamento de corrida com números, não com palpite.',
    ],
    price: 'R$ 220/carro/mês',
  },
  peso: {
    tagline: 'Distribuição de massa medida, não estimada.',
    what: 'Análise completa: peso por canto, lastro, massa suspensa vs. não suspensa, posição do CG, momentos de inércia (yaw/roll/pitch) e transferência de carga dinâmica. Fórmulas de transferência longitudinal e lateral implementadas. Snapshots de pesagem comparáveis.',
    benefits: [
      '"Mover 2 kg de lastro para a esquerda vale a pena?" — o sistema mostra exatamente o efeito.',
      'Substitui o palpite por números concretos de delta de força vertical.',
      'Compara múltiplos cenários de lastro antes de tocar no carro.',
    ],
    price: 'R$ 280/carro/mês',
  },

  /* ── Funcionalidades futuras (em breve) ───────────────────────────── */
  estrategia: {
    tagline: 'Central de comando tático para a corrida.',
    what: 'Calculará automaticamente a janela ideal de pit stop com base em desgaste de pneu, consumo, posição e gap. Simulará undercut/overcut em tempo real e fará simulação completa de corrida antes da largada. Em Endurance, calculará a troca ideal de pilotos pelo fator de fadiga.',
    benefits: [
      'A equipe deixa de decidir sob pressão no muro e passa a executar um plano otimizado.',
      'Testa combinações de stint, pneu e combustível antes mesmo de largar.',
      'Cruza degradação histórica com as condições atuais da corrida.',
    ],
    price: null,
  },
  laptime: {
    tagline: 'Saiba o ganho de um setup antes de aplicá-lo.',
    what: 'Motor de predição de tempo de volta que decompõe cada volta em microssessões (frenagem, tangência, aceleração, reta) e calcula o tempo teórico ideal. Projetará o impacto de mudanças de setup no tempo antes de alterar o carro.',
    benefits: [
      'Saberá, com precisão de centésimos, onde o tempo está sendo perdido em cada setor.',
      'Chega ao autódromo com um plano de setup já validado por simulação.',
      'Pode economizar dezenas de milhares de reais em tempo de pista por temporada.',
    ],
    price: null,
  },
  performance: {
    tagline: 'O painel executivo do carro e do piloto.',
    what: 'Consolidará todos os indicadores de desempenho numa visão única: evolução entre etapas, ranking interno de pilotos por métrica e um índice composto, o ApexScore (nota de 0 a 100 por sessão). Gerará relatórios automáticos de temporada.',
    benefits: [
      'Comparações objetivas: "piloto A teve score 78 na chuva, B teve 82 no seco".',
      'Relatórios profissionais para apresentar a patrocinadores e renovar contratos.',
      'Direciona o treinamento com base em dados, não em impressão.',
    ],
    price: null,
  },
  equipe: {
    tagline: 'O box inteiro conectado: desktop + celular.',
    what: 'Será a ponte entre o computador do engenheiro e o celular de cada mecânico e piloto, com app companion para Android via rede local (sem nuvem). Medições digitadas no celular aparecem na hora no desktop, já vinculadas ao pneu/stint/perfil corretos.',
    benefits: [
      'O mecânico digita a pressão no celular e ela aparece no engenheiro instantaneamente.',
      'Alertas de dados vitais chegam simultaneamente a toda a equipe conectada.',
      'Fim dos bilhetinhos, da fita crepe no carro e dos mal-entendidos que custam posições.',
    ],
    price: null,
  },
};

export function getTabCatalog(tabId) {
  return TAB_CATALOG[tabId] || null;
}
