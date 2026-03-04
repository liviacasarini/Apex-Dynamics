# 🏎️ Race Telemetry Analyzer

Aplicação para análise de dados de telemetria de carros de corrida.
Suporta dados exportados da **ProTune**, **MoTec**, **AiM** e qualquer sistema que exporte CSV.

---

## 🚀 Quick Start

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build
```

O app abre em `http://localhost:3000`.

---

## 📁 Estrutura do Projeto

```
race-telemetry/
├── src/
│   ├── main.jsx                          # Entry point
│   ├── App.jsx                           # App principal (routing + state)
│   │
│   ├── constants/                        # Configurações e constantes
│   │   ├── colors.js                     # Paleta de cores + cores por volta
│   │   ├── channels.js                   # Mapeamento de canais + aliases
│   │   └── tabs.js                       # Configuração das abas
│   │
│   ├── utils/                            # Lógica de negócio (sem UI)
│   │   ├── csvParser.js                  # Parser universal de CSV
│   │   ├── channelDetector.js            # Auto-detecção de canais
│   │   ├── lapAnalyzer.js                # Motor de análise de voltas
│   │   └── feedbackGenerator.js          # Gerador de feedback do piloto
│   │
│   ├── hooks/                            # React hooks customizados
│   │   └── useTelemetryData.js           # Hook principal de dados
│   │
│   ├── components/
│   │   ├── UploadView.jsx                # Tela de importação de arquivo
│   │   ├── common/                       # Componentes reutilizáveis
│   │   │   ├── MetricCard.jsx            # Card de métrica individual
│   │   │   ├── ChartCard.jsx             # Wrapper de gráfico
│   │   │   ├── CustomTooltip.jsx         # Tooltip dos gráficos
│   │   │   └── index.js                  # Barrel export
│   │   ├── layout/                       # Componentes de layout
│   │   │   ├── Header.jsx                # Header da aplicação
│   │   │   ├── TabBar.jsx                # Barra de abas
│   │   │   └── index.js
│   │   └── tabs/                         # Abas do dashboard
│   │       ├── OverviewTab.jsx           # Resumo geral da sessão
│   │       ├── LapCompareTab.jsx         # Comparação entre voltas
│   │       ├── VitalsTab.jsx             # Dados vitais do carro
│   │       ├── TrackMapTab.jsx           # Mapa da pista via GPS
│   │       ├── FeedbackTab.jsx           # Feedback de pilotagem
│   │       └── index.js
│   │
│   └── styles/
│       ├── global.css                    # Reset + scrollbar + seleção
│       └── theme.js                      # Objetos de estilo compartilhados
│
├── index.html                            # HTML com fontes Google Fonts
├── vite.config.js                        # Config do Vite + alias @/
├── package.json                          # Dependências
└── README.md
```

---

## 🎯 Funcionalidades

### ⚡ Overview
- Resumo da sessão: melhor volta, Vmax, RPM máx, % full throttle
- Gráfico de tempo por volta
- Radar de consistência (top 5 voltas)
- Traço de velocidade + acelerador + freio da melhor volta

### 🔄 Comparar Voltas
- Seleção livre de múltiplas voltas
- Overlay de qualquer canal (velocidade, RPM, acelerador, freio, G, lambda, MAP, ignição)
- Gráfico de delta time entre 2 voltas
- Tabela comparativa numérica

### 🔧 Dados Vitais
- Temperatura do motor (com alerta de pico)
- Pressão de óleo (com alerta de mínimo)
- Lambda real vs alvo
- Tensão da bateria
- RPM + MAP + ângulo de ignição

### 🗺️ Mapa da Pista
- Traçado via coordenadas GPS
- Coloração por velocidade, acelerador, freio ou RPM
- Seleção de volta individual

### 🏁 Feedback do Piloto
- Análise automática comparando cada volta com a melhor
- Identificação de áreas de perda: aceleração tardia, coasting, frenagens extras, Vmax baixa, RPM fora da faixa
- Estimativa de tempo perdido por área
- Sugestões de melhoria técnica
- Dicas gerais de pilotagem

---

## 📊 Formatos Suportados

| Sistema    | Formato        | Separador | Decimal |
|-----------|----------------|-----------|---------|
| ProTune   | CSV (`;`)      | `;`       | `,`     |
| MoTec     | CSV Export     | `,`       | `.`     |
| AiM       | CSV Export     | `,` ou `;`| auto    |
| Custom    | CSV / TSV      | auto      | auto    |

O parser auto-detecta tudo. Basta importar o arquivo.

---

## 🛠️ Tecnologias

- **React 18** — UI framework
- **Vite** — Build tool
- **Recharts** — Gráficos
- **Lucide React** — Ícones (disponível para extensão)

---

## 📈 Próximos Passos

- [ ] Importação de múltiplas sessões para comparação entre pilotos
- [ ] Suporte a dados de MoTec `.ld` nativo
- [ ] Análise de setores automática por GPS
- [ ] Exportação de relatório PDF
- [ ] Modo escuro/claro
- [ ] Backend Python para processamento pesado
