# Equipe Paga (100% Nuvem) — Registro Completo de Mudanças

**Período:** 20–21 de junho de 2026
**Objetivo:** Transformar a aba **Equipe** em produto pago, migrando do modelo
LAN (desktop = servidor) para **100% nuvem**, com cobrança por dispositivo
(seat), papéis (chefe/participante), aprovação de entrada e aprovação de
medições.

> **Estado da produção:** o **backend já está no ar** (VM Oracle). Os clientes
> (admin, desktop, mobile) estão prontos; o APK do mobile já foi gerado.
> Tudo foi feito em branches isoladas — produção foi protegida a cada passo
> (backup antes de mexer, deploys reversíveis).

---

## 1. A decisão de produto (o "porquê")

| Tema | Decisão |
|---|---|
| **Modelo** | Saiu de hub-and-spoke LAN → **workspace na nuvem** (1 chat, 1 equipe, N dispositivos) |
| **Cobrança** | **1 dispositivo = 1 seat**. Mesma pessoa em desktop + mobile = 2 seats. Preço igual p/ desktop e mobile |
| **Quem cria** | **Você (ADM)** cria o workspace e define o teto de seats (venda manual, horário comercial) |
| **Identidade** | **APEX ID** tanto no desktop quanto no mobile; o painel mostra desktop vs mobile |
| **Papéis** | **Chefe** (1+) e **Participante**. Só desktop pode ser chefe. Chefe promove outros; auto-promove um desktop **online** se o último chefe sair |
| **Entrada mobile** | Escaneia o QR (token persistente) → **pendente** → um chefe aprova → membro permanente |
| **Seat desktop** | Por **máquina (hwid)** |
| **Remoção** | Marca `removed` (preserva auditoria); reentrada reativa o mesmo vínculo |
| **Medições** | Mobile envia ao **Carro/Perfil** escolhido → fila pendente → **qualquer desktop** aprova |
| **Offline** | 100% nuvem **com fila local otimista** (queda de internet atrasa, não perde dados) |
| **Titular** | Quem paga pode ser um burocrata sem app (campo `owner_user_id`, separado de quem opera) |

---

## 2. Backend — ApexServer (VM Oracle) — **DEPLOYADO**

Repositório: `liviacasarini/ApexServer` · branch `feat/team-seats`

### Migrations (banco de dados) — aplicadas em produção
- **`019_team_seats.sql`** — transforma `teams` em workspace e `team_members` em seats:
  - `teams`: `owner_user_id`, `seat_limit`, `status` (active/suspended), `join_token` (token persistente do QR, auto-gerado)
  - `team_members`: `device_type` (desktop/mobile), `role` (chefe/participante), `status` (pending/active/removed), `approved_by`, `approved_at`, `last_seen_at`
  - Índices: 1 seat mobile por pessoa/workspace (anti-fantasma); contagens por status/tipo/papel
  - **Aditiva e retrocompatível** — o app antigo não foi afetado
- **`020_measurement_submissions.sql`** — fila unificada de medições com aprovação (payload JSONB + status + `target_car_id` + `resolved_by`)

### Rotas novas (`src/routes/teamWorkspace.js` — novo arquivo)
Montado em `/api/team`:
- `GET /seats` — contagem total + desktop/mobile + pendentes
- `GET /join-token` — token do QR (chefe)
- `POST /join` — device entra via token → pendente
- `GET /pending` — lista pendentes (chefe)
- `POST /members/:id/approve` — aprova checando o teto de seats
- `POST /members/:id/reject` · `/remove` — marca `removed` (libera seat)
- `POST /members/:id/role` — promove/rebaixa; auto-promove desktop online
- `POST /measurements` — mobile envia ao Carro → pendente
- `GET /measurements/pending` — desktops listam
- `POST /measurements/:id/approve` — grava na tabela canônica (`car_data`/`track_conditions`)
- `POST /measurements/:id/dismiss`
- `GET /me` — vínculos do usuário (o mobile descobre se foi aprovado)

### Arquivos alterados
- `src/routes/events.js` — exporta `isUserOnline` / `getOnlineUserIds` (presença SSE p/ auto-promote)
- `src/routes/admin.js` — gestão de workspace pago (ver seção 3)
- `src/routes/team.js` — **login mobile aceita qualquer APEX ID** (removido filtro `is_mobile=true` do modelo antigo)
- `src/index.js` — monta o `teamWorkspace.js`
- `scripts/test-migrations.mjs` — **harness de teste** que roda toda a cadeia de migrations num Postgres efêmero (PGlite/WASM), 100% local

### Commits
```
4e223e7 fix(team): mobile/login autentica qualquer APEX ID
4651ab8 feat(team): GET /api/team/me
2970f0a feat(admin): gestao de workspace pago - teto, contagem, link desktop
17921c1 feat(team): rotas de workspace, seats, papeis e aprovacao
8ff6b92 feat(team): schema de seats, papeis e aprovacao de medicoes
```

---

## 3. Painel Admin — ApexServerAdmin — **PRONTO** (branch `master`)

Repositório: `liviacasarini/ApexServerAdmin`

### Backend admin (em `ApexServer/src/routes/admin.js`)
- `GET /teams` — agora retorna `seat_limit`, `status` e **contagem desktop/mobile/pendentes**
- `POST /teams` — aceita `seatLimit` + `ownerUserId` (titular)
- `PATCH /teams/:id` — ajusta nome/teto/status (suspender/reativar)/titular
- `GET /teams/:id/members` — inclui tipo/papel/status
- `POST /teams/:id/link-desktop` — **vincula desktop por APEX ID**, respeitando o teto
- `PATCH /teams/:id/members/:id/role` — define papel (promover a chefe pós-login)

### Interface visual (Electron)
- **Card de equipe**: seats usados/teto + 🖥️ desktop / 📱 mobile / ⏳ pendentes + marca suspensos
- **Modal de criação**: campo de limite de dispositivos
- **Nova sub-aba "💺 Plano"**: resumo de seats, editar teto, **suspender/reativar**, **vincular desktop por APEX ID**, exibir o **token de pareamento (QR)**
- **Tabela de membros**: Tipo/Papel/Status + botões **Tornar chefe / Rebaixar**
- Ponte (`main.js`/`preload.js`): `createTeam(seatLimit)`, `updateTeam`, `linkDesktop`, `setMemberRole`

### Commit
```
b6a6a71 feat(teams): UI de workspace pago - seats, papeis, vincular desktop
```

**Como usar:** `cd Downloads\ApexServerAdmin && npm start`

---

## 4. Desktop — race-telemetry (Apex-Dynamics) — **PRONTO** (branch `feat/team-seats`)

Repositório: `Apex-Dynamics` · app `race-telemetry-analyzer` v1.1.2

### O que mudou
- `electron/main.cjs`:
  - SSE encaminha os eventos de workspace ao renderer (medições/entrada/papéis em tempo real)
  - 11 handlers `cloud:*` (seats, join-token, pending, approve/reject/remove member, role, medições approve/dismiss)
  - *(também carrega fixes desta sessão: `getLocalIP` ignora adaptadores virtuais, grace-period de saída, push de emergência reforçado)*
- `electron/preload.cjs` — expõe os métodos em `cloudTeamAPI`
- `src/context/TeamContext.jsx` — estado cloud (seats/pendentes/medições/token) + ações; **reage aos eventos SSE**
- `src/components/tabs/equipe/EquipeTab.jsx` — painel **"☁️ Workspace na nuvem"**: resumo de seats, aprovar dispositivos pendentes, aprovar/dispensar medições, token de pareamento

### Validação
Build de produção do renderer (`npm run build:vite`) — **951 módulos, build limpo**.

### Commits
```
9f8506d fix(desktop): remove chave border duplicada nos botoes do painel cloud
245ee43 feat(desktop): aba Equipe consome workspace na nuvem
```

**Gerar release:** `npm run build:win:secure` (instalador ofuscado).

---

## 5. Mobile — Expo/React Native (Apex-Dynamics) — **APK PRONTO**

### Reescrita para o modelo 100% nuvem
- **`src/api/cloud.js`** (novo) — cliente REST: login APEX ID (JWT persistido), `getMe`, `joinWorkspace`, `submitMeasurement`, `getCars`, chat, emergência; trata 401 e offline
- **`src/context/CloudContext.js`** (novo) — máquina de estados `loading → login → join → pending → active`:
  - Polling de `getMe` a cada 15s no pendente (detecta aprovação do chefe)
  - Chat (mensagens + envio + polling)
  - **Fila offline otimista** (medições/chat persistidos, reenviados ao reconectar)
- **Telas novas**: `LoginScreen.js` (APEX ID), `JoinScreen.js` (scan QR → join), `WaitingApprovalScreen.js` (pendência)
- **`App.js`** — navegação agora dirigida pelo estágio da nuvem (fluxo LAN aposentado no gate)
- **Telas convertidas para a nuvem**: Pressões, Temperatura, Timer (enviam ao Carro via `cloud.submitMeasurement`) e Chat (`cloud.sendChat`/`getMessages`)

### Também consolidado (trabalho do início da sessão)
- Redesign da identidade visual (HomeScreen, PairingScreen, WaitingAssignment), ícones/splash, `alarm.wav`
- Fixes de conexão do AppContext (anti-loop de reconexão)
- Canal de emergência com alarme

### APK gerado (EAS)
**Build:** `5c2f9bb4-ff23-4858-8ccc-4f7460834b90`
**Instalar:** https://expo.dev/accounts/victorcae/projects/apexdynamics-mobile/builds/5c2f9bb4-ff23-4858-8ccc-4f7460834b90

### Commits
```
25596e9 chore(mobile): consolida redesign + fixes de conexao/emergencia
38f56bd feat(mobile): fila offline otimista
f01f6b3 feat(mobile): ChatScreen via nuvem
bc1d573 feat(mobile): telas de medicao enviam para a nuvem
65a5875 feat(mobile): onboarding 100% nuvem - login/join/pendencia
5135331 feat(mobile): LoginScreen com APEX ID
237f651 feat(mobile): cliente cloud (auth APEX ID, join, medicoes)
```

---

## 6. Operações de produção realizadas

1. **Raio-x de saúde da VM** (read-only) — descobriu e corrigiu o **backup automático que estava parado há ~6 dias** (gotcha do `+x`/cron), e capturou alterações não-versionadas da VM num `.patch` de segurança.
2. **Backups frescos do Postgres** antes de cada mudança.
3. **Migrations 019/020 aplicadas em produção** — a 019 precisou rodar como `sudo -u postgres` (as tabelas de equipe pertencem ao `postgres`, não ao `apex`).
4. **Deploy do código do servidor** via `git bundle` + merge (reconciliou o drift git da VM sem perder nada; um conflito trivial em `events.js` resolvido).
5. **`pm2 restart`** com guarda de sintaxe — servidor online, rotas novas verificadas (401 = montadas).

---

## 7. Pendências conhecidas (registradas, não-urgentes)

- **GitHub `origin/main` do ApexServer está desatualizado** — os deploys foram via bundle direto na VM (o push da VM falha por falta de credencial). A VM é a fonte de verdade. **Não rodar `git pull` na VM** até sincronizar o GitHub pelo seu PC.
- **Desktop e mobile ainda em branch** `feat/team-seats` (não em `main`) — merge + release quando quiser distribuir.
- **Faxina do AppContext LAN** (mobile) — o código LAN antigo está inerte (a navegação não depende mais dele); remover depois do teste end-to-end.
- **Robustez menor** em `mobile/login`: POST sem corpo retorna 500 em vez de 400 (clientes reais sempre mandam corpo).

---

## 8. Como testar o fluxo completo (end-to-end)

1. **Admin** (`npm start` → Equipes): crie um workspace com teto de seats e **vincule seu APEX ID como chefe**
2. **Mobile** (APK): **login com seu APEX ID**
3. **Desktop** (aba Equipe): mostre o **QR de pareamento**
4. **Mobile**: **escaneie o QR** → entra em "aguardando aprovação"
5. **Desktop**: aprove o dispositivo no painel "Workspace na nuvem"
6. **Mobile**: avança para as abas → envie uma **medição para um Carro**
7. **Desktop**: a medição aparece → **qualquer desktop aprova**

---

*Documento gerado em 21/06/2026.*
