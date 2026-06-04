# POLÍTICA DE PRIVACIDADE — ApexDynamics

> ⚠️ **AVISO:** Este é um MODELO técnico, redigido a partir dos dados que o
> software **realmente** coleta (HWID, e-mail, IP, dados de equipe). **Deve ser
> revisado por um advogado** especializado em LGPD antes do uso comercial.
> Preencha os campos entre `[ ]`.

**Última atualização:** [DATA]
**Controlador:** [RAZÃO SOCIAL ou NOME], [CNPJ/CPF nº ___], contato: [E-MAIL].

Esta Política descreve como o **ApexDynamics** trata dados pessoais, em
conformidade com a **Lei nº 13.709/2018 (LGPD)**.

---

## 1. Dados que coletamos

| Dado | Quando | Finalidade |
|------|--------|------------|
| Nome de usuário e e-mail | No cadastro | Identificação e comunicação |
| Senha (armazenada com hash bcrypt) | No cadastro | Autenticação segura |
| **Identificador de hardware (HWID)** | No login | Vinculação da licença a 1 máquina (antipirataria) |
| Endereço IP | Em requisições ao servidor | Segurança, prevenção a fraude e logs |
| Datas de login/validação | No uso | Controle de licença (validação semanal) |
| Mensagens e dados da aba Equipe | Ao usar a Equipe | Funcionalidade de colaboração em tempo real |
| Token de notificação (FCM) | Ao usar o app/celular | Envio de notificações push |

**Dados de telemetria e vídeos** importados pelo Usuário são processados
**localmente no computador do Usuário** e, em regra, **não são enviados** aos
nossos servidores (exceto dados resumidos que o Usuário opte por compartilhar
com sua equipe).

## 2. Bases legais (LGPD art. 7º)
- **Execução de contrato** (art. 7º, V): autenticação, licenciamento e
  fornecimento das funcionalidades.
- **Legítimo interesse** (art. 7º, IX): segurança, prevenção a fraude e
  antipirataria (HWID, IP, logs).
- **Consentimento** (art. 7º, I): notificações push e recursos opcionais.

## 3. Como usamos os dados
- Autenticar o acesso e validar a licença;
- Vincular a licença a uma máquina e detectar uso não autorizado;
- Garantir a segurança (detecção de tentativas de invasão, banimentos);
- Operar o chat e as notificações da equipe;
- Cumprir obrigações legais.

**Não vendemos** dados pessoais a terceiros.

## 4. Compartilhamento e operadores
Utilizamos provedores que atuam como **operadores** de dados:
- **Oracle Cloud** — hospedagem do servidor e banco de dados;
- **Google Firebase (Firestore / FCM)** — chat de equipe e notificações push.

Esses provedores podem processar dados **fora do Brasil**. Adotamos as garantias
exigidas pela LGPD (art. 33) para transferência internacional.

## 5. Retenção
- Dados de conta: enquanto a conta existir;
- Logs de segurança e IP: por [ex.: 12 meses] para fins de segurança/auditoria;
- Após exclusão da conta, dados são removidos ou anonimizados, salvo obrigação
  legal de retenção.

## 6. Segurança
Adotamos medidas técnicas como: senhas com hash **bcrypt**, comunicação via
**HTTPS/TLS**, certificados de sessão assinados (**RS256**), **rate limiting**,
bloqueio por tentativas e registro de eventos de segurança. As chaves
criptográficas são mantidas em ambiente controlado e não são distribuídas.

## 7. Direitos do titular (LGPD art. 18)
O Usuário pode, a qualquer tempo, solicitar:
- confirmação e acesso aos dados;
- correção de dados incompletos ou desatualizados;
- anonimização, bloqueio ou eliminação de dados desnecessários;
- portabilidade;
- informação sobre compartilhamento;
- revogação do consentimento.

Solicitações pelo e-mail: **[E-MAIL DO ENCARREGADO/DPO]**.

## 8. Encarregado (DPO)
Encarregado pelo tratamento de dados: [NOME], [E-MAIL].

## 9. Menores
O Software não se destina a menores de 18 anos sem assistência de responsável legal.

## 10. Alterações
Esta Política pode ser atualizada. Mudanças relevantes serão comunicadas pelos
canais do Software. A data de "última atualização" indica a versão vigente.

---

**Dúvidas sobre privacidade:** [E-MAIL].
