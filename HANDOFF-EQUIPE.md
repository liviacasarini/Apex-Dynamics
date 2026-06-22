# HANDOFF — Ecossistema de Equipe ApexDynamics (jun/2026)

Documento de transferência para continuar o trabalho em outra sessão/conta do Claude.
Cobre: visão geral, infra, **tudo que foi feito**, **problemas em aberto** e as **features novas a implementar**, com notas por camada (Desktop / Mobile / Servidor).

---

## 1. Visão geral do ecossistema

Três peças, modelo **100% nuvem** (a antiga LAN/WebSocket está morta/inerte):

| Componente | O que é | Caminho local |
|---|---|---|
| **ApexDynamics Desktop** | Electron + Vite (React). App principal do engenheiro/chefe. v1.2.0 | `C:\Users\Lívia\Documents\GitHub\Apex-Dynamics` |
| **ApexDynamics Mobile** | React Native / Expo SDK 50. Companion da equipe (Android). | `…\Apex-Dynamics\mobile` |
| **ApexServer** | Node/Express + Postgres, na VM Oracle. | `C:\Users\Lívia\Downloads\ApexServer` |
| **ApexServerAdmin** | Electron. Painel do administrador (gerencia contas/equipes/seats). | `C:\Users\Lívia\Downloads\ApexServerAdmin` |

### Infra / deploy (servidor)
- VM Oracle: `ubuntu@64.181.160.93`, chave `C:\Users\Lívia\Downloads\apexserver.key`.
- App em `~/ApexServer`, processo pm2 `apexserver`, **porta 3333**.
- Node via nvm: `export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- DB Postgres local: `apexdynamics` (rodar SQL: `sudo -u postgres psql -d apexdynamics`).
- **Deploy típico**:
  ```bash
  scp -i <key> src/routes/X.js ubuntu@64.181.160.93:~/ApexServer/src/routes/X.js
  ssh -i <key> ubuntu@64.181.160.93 'export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/ApexServer && node -c src/routes/X.js && pm2 restart apexserver'
  ```
- **Migrations**: `sudo -u postgres psql -d apexdynamics -f - < ~/ApexServer/migrations/NNN.sql`
  (o aviso "could not change directory to /home/ubuntu/ApexServer: Permission denied" é **inofensivo** — é só o cwd do user postgres).

### Builds
- Desktop: `npm run build:win` → `release\ApexDynamics.Setup.1.2.0.exe` (renderer: `npm run build:vite`).
- Admin: `npm run build` em ApexServerAdmin → `dist\ApexServerAdmin Setup 1.0.0.exe`.
- Mobile: `npx eas-cli build --platform android --profile preview --non-interactive` (EAS cloud, conta `victorcae`/victor31.psn@gmail.com, perfil `preview` = APK interno). Demora ~10–20 min.

---

## 2. O que foi FEITO nesta sessão (tudo entregue e no ar)

### A. Medições por perfil (Desktop + Servidor)
- **Visão Geral** da aba Equipe: um box por perfil/carro, cada um com **pressão E temperatura** (lê das submissões, não mais do `car-data/latest` que vinha vazio).
- **Aba Medições**: lista o histórico **agrupado por perfil**, ordenado por horário, **sem sobrescrever**. Pendentes têm Aprovar/Dispensar; **só o chefe deleta** (lixeira).
- Servidor: `GET /api/team/measurements` (todas), `DELETE /api/team/measurements/:id` (chefe), `GET /api/team/measurements/:id/status` (polling do mobile).

### B. Aprovar → vira registro real + propaga p/ todos os desktops
- Ao aprovar uma medição: grava **direto como registro** na aba correta do perfil (escolha do usuário foi "salvar direto"): Pressão → `profiles.saveTireSet` no perfil certo; Temperatura → `profiles.addTempLog` (workspace-level). Função `handleApplyCloudRecord` em `App.jsx`.
- **Propagação**: servidor passou a transmitir `measurement_approved`/`dismissed` para **TODOS os desktops** (antes só notificava o mobile). Cada desktop aplica o registro localmente via SSE → `applyApprovedRef` (TeamContext) → `syncApprovedMeasurements`.
- **Gate anti-duplicata por máquina** (localStorage `apex_applied_measurements` + baseline `apex_applied_baseline`) para não duplicar no aprovador nem reaplicar histórico antigo no 1º boot.
- `writeCanonical` corrigido: pressões aninhadas (`FL:{fria,quente}` → usa quente/fria); temperatura mapeia `condicaoPista` PT→enum (`Seca→dry`…) por causa do CHECK de `track_conditions`.

### C. Sincronização de Perfis → carros da nuvem
- Desktop **chefe** sincroniza Perfis → tabela `cars` (upsert por `client_profile_id`). Auto-sync ao abrir Visão Geral + **botão "🏎️ Sincronizar perfis"** com feedback.
- Mobile lê via `getCars()` no foco da tela; **seletor de perfil** nas telas Pressões/Temperatura (≥2 botões, 1 banner, **0 = aviso âmbar** "peça ao chefe para sincronizar").
- **BUG corrigido**: `ON CONFLICT (team_id, client_profile_id)` falhava ("no unique or exclusion constraint matching") porque o índice é **parcial** (`WHERE client_profile_id IS NOT NULL`) — o `ON CONFLICT` precisa repetir esse `WHERE`. Corrigido.

### D. Feedback de aprovação no mobile
- Mobile não tinha como saber da aprovação (o `measurement:approved` só vinha da LAN morta). Implementado **polling** (`getMeasurementStatus` a cada 6s) nas telas; banner muda para "✅ Medição aprovada!" / dispensada.

### E. Jurídico / LGPD
- `src/license/legalText.js` → **v1.3**: corrigidas 2 afirmações que viraram falsas ("dados 100% locais"), adicionados dados de Equipe, app mobile, compartilhamento entre membros, retenção de workspace.
- **Aceite no mobile** (era a maior brecha): `RegisterScreen` tem checkbox + modal com os textos completos (`mobile/src/legal/legalText.js`, cópia verbatim). Servidor `register-and-join` **exige** `acceptedLegalVersion` e grava prova em `users.accepted_legal_version/at/ip` (**migration 022**).

### F. Banimento (corrigido)
- Conta banida conseguia logar via resume de sessão offline. Causa: `httpsGet` retornava `ok:true` para qualquer JSON (ignorava 403). Corrigido: `httpsGet` expõe `status`; `checkCertStatus` retorna `{banned}`/`{unauthorized}`; `LicenseGate.checkSession` bloqueia e força logout. (`jwtAuth` no servidor já checava ban → 403.)

### G. Exclusão de usuário (admin) — corrigido
- `DELETE /api/admin/users/:id` falhava por FK (tabelas da Equipe referenciam `users` sem cascade) e o painel mostrava "excluído" mesmo no erro. Corrigido: exclusão em **transação** limpando referências (`team_invites.used_by`, `car_assignments.assigned_by` → NULL; `car_data`/`track_conditions`/`messages`/`emergency_log` → DELETE) + painel passou a respeitar o resultado.

### H. Remover membro (chefe) — NOVO
- Aba **Dispositivos**: botão **"Remover"** por membro (chefe, exceto ele próprio que aparece com 👑). Usa `cloudTeamAPI.removeMember` → `POST /api/team/members/:id/remove`. `/members` passou a retornar `role` e `device_type` e filtra `status='active'`.

### I. Checklist — NOVO (completo)
- **Migration 023**: `checklist_items` (universal se `target_car_id` NULL, ou por carro) e `checklist_checks` (presença da linha = item marcado; UNIQUE(car_id,item_id)).
- Servidor: `GET /checklist/overview`, `GET /checklist?carId=`, `POST /checklist/items` (chefe), `DELETE /checklist/items/:id` (chefe), `POST /checklist/check` (qualquer membro), `POST /checklist/reset` (chefe). Notifica desktops via SSE `checklist_updated`.
- **Desktop** (aba "✅ Checklist"): cards de andamento por carro (barra %, "✓ Finalizado", último a marcar); detalhe com itens + quem marcou; chefe adiciona (universal/este carro), deleta, reseta; participante só vê. Polling 8s.
- **Mobile** (aba "Checklist"): seleciona carro, marca itens (sobe na hora), barra de progresso, **banner "Checklist finalizado!"** + vibração ao concluir. Polling 6s.

---

## 3. Problemas / pendências EM ABERTO

1. **Nada commitado no git** (os dois repos). Risco de perda. → `git add/commit` recomendado.
2. **Backup do Postgres da VM**: não há rotina. Risco de perda total. → `pg_dump` agendado + cópia externa.
3. **Versão sempre `1.2.0`** no desktop (sobrescreve o mesmo .exe). Auto-update (electron-updater) não dispara para quem já tem. → bumpar versão + `release:win:secure` para publicar.
4. **Mensagem enganosa do chat mobile** (`ChatScreen.js`): "conecte ao Wi-Fi da pista para funcionalidades completas" — a LAN está morta (`connected=false` fixo). NÃO há diferença entre Wi-Fi/internet. Trocar por "Via Nuvem". (Usuário pediu pra deixar pra depois.)
5. **Polling em vez de tempo real**: medições/checklist/overview usam polling. Funciona, mas o ideal é SSE (desktop já tem) / FCM (mobile, subutilizado).
6. **`versionCode` do mobile ignorado**: existe pasta `android/` no projeto → EAS usa o nativo (mostra 1.0.0/vc1), ignorando o `app.json`. Para Play Store, controlar no `android/app/build.gradle` ou remover `android/` e deixar o Expo gerenciar.
7. **Temperatura é workspace-level**, não por perfil (Pneus é por perfil). Limitação de design da aba Temperaturas do desktop.
8. **Re-aceite de Termos no login** para usuários criados ANTES do portão de consentimento (mobile) — não implementado.
9. **Confirmar região real da VM Oracle** — a Política de Privacidade afirma "Brasil/São Paulo". Se não for, é transferência internacional (texto precisa mudar).
10. **CPF, não CNPJ**: os licenciantes operam como pessoas físicas (responsabilidade pessoal). Decisão de negócio.
11. **Deletar medição/usuário** apaga contribuições (car_data/messages etc.) — comportamento aceito, mas documentar.

---

## 4. FEATURES NOVAS a implementar (pedido do usuário)

Implementar 4 features na aba Equipe. Decisões já tomadas onde aplicável.

### 4.1. Sistema de PRESENÇA (roll call)
- **Objetivo**: ver quem está no autódromo hoje (check-in pelo mobile).
- **Sugestão de modelo**: tabela `attendance (team_id, user_id, username, status 'presente'|'ausente', updated_at)` OU reaproveitar `last_login`. Melhor: presença explícita do dia.
  - `POST /api/team/attendance` (membro marca presente/ausente) ; `GET /api/team/attendance` (lista).
- **Mobile**: botão "Cheguei / Sair" na Home ou aba dedicada.
- **Desktop**: card "Presença" na aba Dispositivos ou Visão Geral — lista quem está presente, com horário do check-in.

### 4.2. ATRIBUIR TAREFA a alguém
- **Objetivo**: além do checklist, uma tarefa dirigida a um membro, com push.
- **Modelo**: `tasks (id, team_id, title, description?, assigned_to user_id, assigned_to_name, created_by, status 'aberta'|'concluida', car_id?, created_at, done_at)`.
  - `POST /api/team/tasks` (chefe cria) ; `GET /api/team/tasks` ; `POST /api/team/tasks/:id/done` (responsável conclui) ; `DELETE` (chefe).
  - Notificar o atribuído via SSE/FCM.
- **Desktop**: aba ou bloco "Tarefas" — chefe cria e atribui a um membro (dropdown de membros), vê status.
- **Mobile**: lista "Minhas tarefas", botão concluir. Push ao receber.

### 4.3. COMPARAR CARROS (lado a lado)
- **Objetivo**: pressão/temperatura dos carros na mesma tela.
- **Sem schema novo** — usa as submissões/medições já existentes. Em **Visão Geral** (desktop), adicionar um modo "Comparar": selecionar 2+ carros e mostrar as últimas medições em colunas lado a lado (FL/FR/RL/RR fria/quente + temp/condições), com destaque de diferença.
- Só desktop (tela maior). Leitura, sem novo endpoint (reusa `getAllMeasurements`/overview).

### 4.4. RELATÓRIO DE FIM DE EVENTO (somente o CHEFE gera)
- **Objetivo**: PDF/resumo do evento com tudo.
- **Conteúdo**: por carro — medições (pressão/temp) do período, checklist (itens + quem fez + finalização), condições de pista, membros presentes, tarefas.
- **Implementação sugerida**: botão "Gerar relatório" (só chefe) na Visão Geral → monta o relatório no desktop a partir dos dados da nuvem (getAllMeasurements + checklist/overview + attendance + tasks) e gera um **PDF/HTML** (pode usar window.print do Electron para PDF, ou uma lib). Não precisa de endpoint novo se os dados já vêm das APIs existentes; opcionalmente um `GET /api/team/report?from=&to=` que agrega tudo.
- **Gate**: visível/acionável só para `isChefe` (joinTokenInfo.joinToken).

---

## 5. Mapa técnico de referência

### Servidor — endpoints da equipe (`src/routes/teamWorkspace.js` e `team.js`)
- Membros: `GET /members`, `POST /members/:id/approve|reject|remove|role`, `GET /seats`, `GET /join-token`, `POST /join`, `GET /pending`.
- Medições: `POST /measurements`, `GET /measurements` (todas), `GET /measurements/pending`, `GET /measurements/:id/status`, `POST /measurements/:id/approve|dismiss`, `DELETE /measurements/:id`.
- Carros/perfis: `GET /cars`, `POST /cars/sync` (chefe).
- Checklist: `GET /checklist/overview`, `GET /checklist?carId=`, `POST /checklist/items`, `DELETE /checklist/items/:id`, `POST /checklist/check`, `POST /checklist/reset`.
- Chat: `GET/POST /messages`. Sessão: `GET/POST` session. Track cond: `GET/POST track-conditions`.
- Helpers usados: `getActiveMembership(userId, teamId)`, `defaultTeamId(userId)`, `teamMemberUserIds(teamId,{onlyDesktop})`, `notifyUsers(ids, payload)` (SSE), `db.pool.connect()` (transação), `db.query`.

### Desktop
- `src/components/tabs/equipe/EquipeTab.jsx` — toda a aba Equipe (seções: conexao, dispositivos, notificacoes/Medições, **checklist**, chat, visao-geral, sessao, emergencia). `isChefe = !!joinTokenInfo?.joinToken`.
- `src/app/App.jsx` — `handleApplyCloudRecord`, `syncApprovedMeasurements`, sync de perfis, gate anti-duplicata.
- `src/context/TeamContext.jsx` — estado cloud, SSE (`applyApprovedRef`), `approveCloudMeasurement` etc.
- `electron/main.cjs` + `preload.cjs` — IPC `cloudTeamAPI.*` (getMembers, removeMember, getCars, syncCars, getAllMeasurements, deleteMeasurement, getChecklist*, checkChecklistItem, etc.).
- Bridge exposto: `window.cloudTeamAPI`.

### Mobile
- `mobile/App.js` — navegação (Tab.Navigator): Home, Temperature, Pressures, **Checklist**, Timer, Chat.
- `mobile/src/api/cloud.js` — REST client (request autenticado). Funções: submitMeasurement, getMeasurementStatus, getCars, getChecklist, checkChecklistItem, registerAndJoin, etc.
- `mobile/src/context/CloudContext.js` — estado/máquina (loading→login→join→pending→active), expõe as funções cloud.
- `mobile/src/screens/` — PressuresScreen, TemperatureScreen (com seletor de perfil + polling de status), ChecklistScreen (nova), RegisterScreen (com aceite de Termos).
- `mobile/src/legal/legalText.js` — cópia verbatim dos termos (manter em sincronia com o desktop).

### Migrations recentes (na VM, aplicadas)
- `021_cars_client_profile.sql` — `cars.client_profile_id` + índice único parcial.
- `022_users_legal_consent.sql` — `users.accepted_legal_version/at/ip`.
- `023_checklist.sql` — `checklist_items`, `checklist_checks`.

### Gotchas importantes
- `ON CONFLICT` com índice **parcial** precisa repetir o `WHERE` predicate.
- `track_conditions.condition` tem CHECK enum `('dry','wet','damp','intermediate')` — mapear PT antes de inserir.
- `httpsGet` (desktop) agora expõe `status` — usar para distinguir 403/401 de offline.
- Gradle local no Windows exige `TEMP=C:\Tmp` (username com acento quebra o 8.3 shortname) — **mas o build mobile é via EAS (nuvem), não local**.
- Estado do app desktop NÃO está commitado; builds saem do working tree.

---

## 6. Status dos builds (no momento deste handoff)
- **Servidor**: tudo deployado e no ar (porta 3333).
- **Desktop**: `release\ApexDynamics.Setup.1.2.0.exe` — atualizado (inclui checklist + remover membro).
- **Admin**: `dist\ApexServerAdmin Setup 1.0.0.exe` — atualizado (fix exclusão).
- **Mobile**: último EAS build com a aba Checklist estava **compilando** (background id `b3741z1uo`). Conferir em https://expo.dev/accounts/victorcae/projects/apexdynamics-mobile/builds e pegar o APK mais recente.

---

## 7. Próximo passo combinado
Implementar as 4 features da seção 4: **Presença**, **Atribuir tarefa**, **Comparar carros**, **Relatório de fim de evento (chefe gera)**. Seguir o padrão: migration (se precisar) → endpoints em `teamWorkspace.js` → deploy VM → IPC em main/preload → UI no EquipeTab (desktop) e/ou tela no mobile → builds.
