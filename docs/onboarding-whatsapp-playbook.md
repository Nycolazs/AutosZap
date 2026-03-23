# Playbook de Onboarding WhatsApp (Comercial + Suporte)

## 1) Objetivo

Padronizar o onboarding de clientes no AutosZap para que:

- o cliente **nao precise** de conhecimento tecnico;
- o time interno controle token, webhook e validacoes;
- o go-live aconteca com previsibilidade.

## 2) Regra de Operacao

- O AutosZap conduz a configuracao tecnica da integracao.
- O cliente apenas autoriza o fluxo guiado no painel.
- Nao solicitar ao cliente:
  - token manual;
  - App Secret;
  - configuracao manual de webhook.

## 3) Modelo Comercial Recomendado

Oferecer duas trilhas:

1. **Plano A (recomendado): numero novo dedicado para API**
2. **Plano B (assistido): migracao do numero atual**

### 3.1 Matriz de decisao

- Escolher **Plano A** quando o cliente quer velocidade e menor risco.
- Escolher **Plano B** quando o cliente precisa manter o mesmo numero por marca/operação.
- No **Plano B**, exigir janela de migracao e responsavel da empresa presente.

## 4) Script Comercial (Copy/Paste)

### 4.1 Abertura

"A integracao e simples: voce autoriza sua conta Meta e a gente configura tudo. Voce nao precisa gerar token nem mexer em parte tecnica."

### 4.2 Qualificacao

"Voce prefere comecar com numero novo (mais rapido) ou manter o numero atual (migracao assistida)?"

### 4.3 Recomendacao

"Nossa recomendacao e comecar com numero novo para entrar em producao rapido e com menos risco."

### 4.4 Fechamento

"Na sessao de onboarding, em 30 a 60 minutos, deixamos o ambiente validado com mensagem de teste."

## 5) Checklist Pre-Onboarding (Comercial/CS)

1. Confirmar email do administrador Meta da empresa.
2. Confirmar trilha escolhida: Plano A ou Plano B.
3. Agendar sessao com decisor presente.
4. Coletar dados:
   - nome da empresa;
   - CNPJ (se aplicavel);
   - telefone principal;
   - fuso horario.
5. Confirmar aceite operacional:
   - Plano A: numero novo disponivel.
   - Plano B: janela de migracao aprovada.

## 6) Checklist Tecnico de Integracao (Suporte)

### 6.1 Antes da sessao

1. Workspace criada no AutosZap.
2. Fluxo "Conectar WhatsApp" disponivel no painel.
3. Webhook configurado e ambiente pronto para validacao.

### 6.2 Durante a sessao

1. Cliente faz login Meta no fluxo guiado.
2. Cliente concede as permissoes solicitadas.
3. Backend do AutosZap captura e armazena:
   - `WABA ID`;
   - `Phone Number ID`;
   - token de acesso (sempre criptografado).

### 6.3 Validacoes obrigatorias

1. Webhook validado.
2. Mensagem outbound de teste enviada com sucesso.
3. Mensagem inbound de teste recebida.
4. Status de entrega/confirmacao retornando corretamente.

### 6.4 Encerramento tecnico

1. Marcar instancia como `CONNECTED`.
2. Registrar data/hora de go-live e responsavel.
3. Enviar resumo ao cliente: "integracao concluida".

## 7) Procedimento Por Trilha

### 7.1 Plano A (numero novo)

1. Ativar numero novo para API.
2. Executar checklist tecnico completo.
3. Treinar equipe do cliente e iniciar operação.

### 7.2 Plano B (migracao do numero atual)

1. Confirmar janela de migracao.
2. Executar migracao assistida.
3. Executar checklist tecnico completo.
4. Acompanhar primeiras 24h com suporte prioritario.

## 8) Mensagens Prontas Para Cliente

### 8.1 Convite de onboarding

"Perfeito, vamos fazer sua ativacao de WhatsApp no AutosZap. A sessao leva cerca de 45 minutos. Voce so precisa acessar sua conta Meta e autorizar; a parte tecnica fica com a gente."

### 8.2 Lembrete de pre-requisitos

"Para a sessao, precisamos de: (1) acesso a conta Meta da empresa, (2) definicao entre numero novo ou migracao do atual, (3) responsavel da empresa presente."

### 8.3 Confirmacao de go-live

"Integracao concluida com sucesso. Webhook validado, envio e recebimento testados. Seu ambiente ja esta pronto para operação."

### 8.4 Follow-up 24h

"Passando para confirmar se o atendimento esta normal. Se quiser, ajustamos juntos automacoes, distribuicao e templates."

## 9) Politica Interna de Seguranca

1. Nunca solicitar token manual ao cliente.
2. Nunca compartilhar segredo em canal inseguro.
3. Armazenar token apenas criptografado.
4. Exigir checklist de validacao antes de marcar producao.

## 10) Dono do Processo

- Comercial: qualificar trilha e agendar onboarding.
- Suporte Tecnico: executar integracao e validacoes.
- CS: confirmar adocao nas primeiras 24h.

