import { PrismaClient, Role, UserStatus, ContactSource, ConversationOwnership, ConversationStatus, MessageDirection, MessageStatus, CampaignAudienceType, CampaignRecipientStatus, CampaignStatus, LeadSource, AssistantStatus, KnowledgeBaseType, KnowledgeDocumentType, EntityStatus, InstanceMode, InstanceProvider, InstanceStatus, NotificationType, AuditAction, WebhookEventType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const contactsSeed = [
  ['Mariana Costa', '+5585988112201', 'mariana@bluewave.com', 'BlueWave Tech', 'Head de Operacoes', ContactSource.WHATSAPP],
  ['Lucas Ferreira', '+5585988112202', 'lucas@orbita.com', 'Orbita CRM', 'Diretor Comercial', ContactSource.CAMPAIGN],
  ['Fernanda Lima', '+5585988112203', 'fernanda@atlaslog.com', 'Atlas Log', 'Gerente de Atendimento', ContactSource.WEBSITE],
  ['Henrique Souza', '+5585988112204', 'henrique@novapago.com', 'NovaPago', 'CEO', ContactSource.IMPORT],
  ['Juliana Melo', '+5585988112205', 'juliana@mercurio.com', 'Mercurio Midia', 'Analista de Growth', ContactSource.MANUAL],
  ['Rafael Tavares', '+5585988112206', 'rafael@solarsales.com', 'Solar Sales', 'Closer', ContactSource.WHATSAPP],
  ['Bruna Nogueira', '+5585988112207', 'bruna@fintrack.com', 'FinTrack', 'CS Lead', ContactSource.WEBSITE],
  ['Gustavo Prado', '+5585988112208', 'gustavo@sinergia.ai', 'Sinergia AI', 'Founder', ContactSource.CAMPAIGN],
  ['Aline Pires', '+5585988112209', 'aline@flexhub.com', 'FlexHub', 'Supervisora', ContactSource.MANUAL],
  ['Tiago Rezende', '+5585988112210', 'tiago@pixelpoint.com', 'Pixel Point', 'Gerente de Vendas', ContactSource.IMPORT],
  ['Patricia Gomes', '+5585988112211', 'patricia@vortex.com', 'Vortex', 'Marketing Ops', ContactSource.WEBSITE],
  ['Diego Ramos', '+5585988112212', 'diego@focustech.com', 'FocusTech', 'Coordenador', ContactSource.WHATSAPP],
  ['Larissa Cordeiro', '+5585988112213', 'larissa@agilepro.com', 'AgilePro', 'PMM', ContactSource.CAMPAIGN],
  ['Eduardo Martins', '+5585988112214', 'eduardo@zephyrlabs.com', 'Zephyr Labs', 'Consultor', ContactSource.WHATSAPP],
  ['Carla Dantas', '+5585988112215', 'carla@hyperlead.com', 'HyperLead', 'SDR Manager', ContactSource.WEBSITE],
  ['Vinicius Araújo', '+5585988112216', 'vinicius@interlink.com', 'InterLink', 'Diretor de Operacoes', ContactSource.IMPORT],
  ['Beatriz Sampaio', '+5585988112217', 'beatriz@helixcare.com', 'Helix Care', 'Coordenadora', ContactSource.MANUAL],
  ['Caio Barros', '+5585988112218', 'caio@cloudx.com', 'CloudX', 'Especialista', ContactSource.CAMPAIGN],
  ['Isabela Freitas', '+5585988112219', 'isabela@vitalconnect.com', 'VitalConnect', 'Executiva de Contas', ContactSource.WHATSAPP],
  ['Pedro Alencar', '+5585988112220', 'pedro@navita.com', 'Navita', 'Analista Comercial', ContactSource.MANUAL],
] as const;

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.messageDeliveryStatus.deleteMany();
  await prisma.whatsAppWebhookEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.conversationNote.deleteMany();
  await prisma.conversationMessage.deleteMany();
  await prisma.conversationAssignment.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversationTag.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.leadTag.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.contactListItem.deleteMany();
  await prisma.contactList.deleteMany();
  await prisma.contactTag.deleteMany();
  await prisma.assistantKnowledgeBase.deleteMany();
  await prisma.assistantTool.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.knowledgeBase.deleteMany();
  await prisma.aiTool.deleteMany();
  await prisma.assistant.deleteMany();
  await prisma.instance.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const workspace = await prisma.workspace.create({
    data: {
      name: 'AutosZap',
      slug: 'autoszap',
      companyName: 'AutosZap',
      settings: {
        locale: 'pt-BR',
        timezone: 'America/Fortaleza',
        theme: 'dark-blue',
      },
    },
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: 'Admin AutosZap',
      email: 'admin@autoszap.com',
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      title: 'Founder',
    },
  });

  const agentAna = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: 'Ana Bezerra',
      email: 'ana@autoszap.com',
      passwordHash,
      role: Role.MANAGER,
      status: UserStatus.ACTIVE,
      title: 'Head de Relacionamento',
    },
  });

  const agentLeo = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: 'Leonardo Alves',
      email: 'leo@autoszap.com',
      passwordHash,
      role: Role.AGENT,
      status: UserStatus.ACTIVE,
      title: 'Especialista de Inbox',
    },
  });

  await prisma.teamMember.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: admin.id,
        invitedById: admin.id,
        name: admin.name,
        email: admin.email,
        title: admin.title,
        role: admin.role,
        status: UserStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        userId: agentAna.id,
        invitedById: admin.id,
        name: agentAna.name,
        email: agentAna.email,
        title: agentAna.title,
        role: agentAna.role,
        status: UserStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        userId: agentLeo.id,
        invitedById: admin.id,
        name: agentLeo.name,
        email: agentLeo.email,
        title: agentLeo.title,
        role: agentLeo.role,
        status: UserStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        invitedById: admin.id,
        name: 'Camila Torres',
        email: 'camila@autoszap.com',
        title: 'Analista de Growth',
        role: Role.AGENT,
        status: UserStatus.PENDING,
        inviteToken: 'invite-camila-autoszap',
      },
    ],
  });

  const tags = await Promise.all(
    ([
      ['VIP', '#59b6ff', 'Clientes prioritarios'],
      ['Onboarding', '#2f7df6', 'Novos clientes em ativacao'],
      ['Lead quente', '#0fb7d8', 'Alta intencao de compra'],
      ['Renovacao', '#5c7cff', 'Clientes em fase de renovacao'],
      ['Suporte', '#2f9fff', 'Demandas de atendimento'],
    ] as const).map(([name, color, description]) =>
      prisma.tag.create({
        data: {
          workspaceId: workspace.id,
          name,
          color,
          description,
        },
      }),
    ),
  );

  const contacts = await Promise.all(
    contactsSeed.map(([name, phone, email, company, jobTitle, source], index) =>
      prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          name,
          phone,
          email,
          company,
          jobTitle,
          source,
          notes: index % 4 === 0 ? 'Contato com forte abertura para automacoes e CRM.' : null,
          lastInteractionAt: new Date(Date.now() - index * 1000 * 60 * 60 * 6),
        },
      }),
    ),
  );

  await prisma.contactTag.createMany({
    data: contacts.flatMap((contact, index) => {
      const rows = [{ contactId: contact.id, tagId: tags[index % tags.length]!.id }];
      if (index % 3 === 0) {
        rows.push({ contactId: contact.id, tagId: tags[(index + 2) % tags.length]!.id });
      }
      return rows;
    }),
  });

  const lists = await Promise.all(
    ([
      ['Clientes Ativos', 'Base principal para relacionamento continuo'],
      ['Leads Q2', 'Contatos captados em campanhas do trimestre'],
      ['Reengajamento', 'Base de contatos para campanhas de retorno'],
    ] as const).map(([name, description]) =>
      prisma.contactList.create({
        data: {
          workspaceId: workspace.id,
          name,
          description,
          createdById: admin.id,
        },
      }),
    ),
  );

  await prisma.contactListItem.createMany({
    data: contacts.flatMap((contact, index) => [
      {
        listId: lists[index % lists.length]!.id,
        contactId: contact.id,
      },
      ...(index % 2 === 0
        ? [
            {
              listId: lists[(index + 1) % lists.length]!.id,
              contactId: contact.id,
            },
          ]
        : []),
    ]),
  });

  const groups = await Promise.all(
    ([
      ['Clientes Enterprise', 'Contas com maior ticket e jornada consultiva'],
      ['Parceiros', 'Contatos parceiros e canais'],
      ['Campanha Web Summit', 'Leads adquiridos em evento recente'],
    ] as const).map(([name, description]) =>
      prisma.group.create({
        data: {
          workspaceId: workspace.id,
          name,
          description,
        },
      }),
    ),
  );

  await prisma.groupMember.createMany({
    data: contacts.flatMap((contact, index) => [
      {
        groupId: groups[index % groups.length]!.id,
        contactId: contact.id,
      },
      ...(index % 5 === 0
        ? [
            {
              groupId: groups[(index + 1) % groups.length]!.id,
              contactId: contact.id,
            },
          ]
        : []),
    ]),
  });

  const instances = await Promise.all(
    [
      {
        name: 'Canal Comercial',
        status: InstanceStatus.CONNECTED,
        mode: InstanceMode.DEV,
        phoneNumber: '+55 85 98811-1001',
        businessAccountId: 'demo-ba-001',
        phoneNumberId: 'demo-phone-001',
        accessTokenEncrypted: 'dev-access-token-001',
        webhookVerifyTokenEncrypted: 'verify-demo-001',
      },
      {
        name: 'Canal Suporte',
        status: InstanceStatus.SYNCING,
        mode: InstanceMode.SANDBOX,
        phoneNumber: '+55 85 98811-1002',
        businessAccountId: 'demo-ba-002',
        phoneNumberId: 'demo-phone-002',
        accessTokenEncrypted: 'sandbox-access-token-002',
        webhookVerifyTokenEncrypted: 'verify-demo-002',
      },
    ].map((instance) =>
      prisma.instance.create({
        data: {
          workspaceId: workspace.id,
          createdById: admin.id,
          provider: InstanceProvider.META_WHATSAPP,
          lastSyncAt: new Date(),
          ...instance,
        },
      }),
    ),
  );

  const pipeline = await prisma.pipeline.create({
    data: {
      workspaceId: workspace.id,
      name: 'Pipeline Comercial',
      description: 'Fluxo principal de oportunidades',
    },
  });

  const stages = await Promise.all(
    ([
      ['Entrada', '#2f7df6', 1, 15],
      ['Qualificacao', '#4da9ff', 2, 35],
      ['Proposta', '#2cc1d9', 3, 60],
      ['Negociacao', '#6a8bff', 4, 80],
      ['Fechado', '#7cb7ff', 5, 100],
    ] as const).map(([name, color, order, probability]) =>
      prisma.pipelineStage.create({
        data: {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          name,
          color,
          order,
          probability,
        },
      }),
    ),
  );

  const leads = await Promise.all(
    Array.from({ length: 10 }).map((_, index) =>
      prisma.lead.create({
        data: {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          stageId: stages[index % stages.length]!.id,
          contactId: contacts[index]!.id,
          assignedToId: index % 2 === 0 ? agentAna.id : agentLeo.id,
          name: contacts[index]!.name,
          company: contacts[index]!.company,
          source: [LeadSource.WHATSAPP, LeadSource.CAMPAIGN, LeadSource.WEBSITE, LeadSource.IMPORT][index % 4]!,
          value: (6000 + index * 1750).toString(),
          order: index,
          notes: index % 2 === 0 ? 'Lead com boa aderencia ao modulo de inbox e CRM.' : 'Necessita follow-up em ate 48h.',
        },
      }),
    ),
  );

  await prisma.leadTag.createMany({
    data: leads.flatMap((lead, index) => [
      {
        leadId: lead.id,
        tagId: tags[index % tags.length]!.id,
      },
      ...(index % 2 === 0
        ? [
            {
              leadId: lead.id,
              tagId: tags[(index + 1) % tags.length]!.id,
            },
          ]
        : []),
    ]),
  });

  const conversations = await Promise.all(
    contacts.slice(0, 8).map((contact, index) =>
      prisma.conversation.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          instanceId: instances[index % instances.length]!.id,
          assignedUserId: index % 2 === 0 ? agentAna.id : agentLeo.id,
          status: [ConversationStatus.OPEN, ConversationStatus.PENDING, ConversationStatus.CLOSED][index % 3]!,
          ownership: [ConversationOwnership.MINE, ConversationOwnership.TEAM, ConversationOwnership.UNASSIGNED][index % 3]!,
          unreadCount: index % 3,
          lastMessageAt: new Date(Date.now() - index * 1000 * 60 * 25),
          lastMessagePreview: index % 2 === 0 ? 'Perfeito, pode me mandar a proposta?' : 'Quero entender melhor a automacao.',
        },
      }),
    ),
  );

  await prisma.conversationTag.createMany({
    data: conversations.map((conversation, index) => ({
      conversationId: conversation.id,
      tagId: tags[index % tags.length]!.id,
    })),
  });

  await prisma.conversationParticipant.createMany({
    data: conversations.flatMap((conversation, index) => [
      {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        contactId: contacts[index]!.id,
        role: 'customer',
      },
      {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: index % 2 === 0 ? agentAna.id : agentLeo.id,
        role: 'agent',
      },
    ]),
  });

  await prisma.conversationAssignment.createMany({
    data: conversations.map((conversation, index) => ({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      assignedToId: index % 2 === 0 ? agentAna.id : agentLeo.id,
      assignedById: admin.id,
    })),
  });

  for (const [index, conversation] of conversations.entries()) {
    const contact = contacts[index]!;
    const ownerId = index % 2 === 0 ? agentAna.id : agentLeo.id;
    await prisma.conversationMessage.createMany({
      data: [
        {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          senderContactId: contact.id,
          instanceId: conversation.instanceId,
          direction: MessageDirection.INBOUND,
          content: `Oi, aqui é ${contact.name.split(' ')[0]}. Quero organizar meus atendimentos no WhatsApp.`,
          status: MessageStatus.READ,
          sentAt: new Date(Date.now() - (index + 6) * 1000 * 60 * 50),
          deliveredAt: new Date(Date.now() - (index + 6) * 1000 * 60 * 49),
          readAt: new Date(Date.now() - (index + 6) * 1000 * 60 * 48),
          externalMessageId: `wamid-inbound-${index + 1}`,
        },
        {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          senderUserId: ownerId,
          instanceId: conversation.instanceId,
          direction: MessageDirection.OUTBOUND,
          content: index % 2 === 0 ? 'Consigo te mostrar inbox, CRM e automacoes em uma unica operação.' : 'Posso te enviar um comparativo com o fluxo ideal do seu atendimento.',
          status: MessageStatus.DELIVERED,
          sentAt: new Date(Date.now() - (index + 4) * 1000 * 60 * 45),
          deliveredAt: new Date(Date.now() - (index + 4) * 1000 * 60 * 44),
          externalMessageId: `wamid-outbound-${index + 1}`,
        },
        {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          senderContactId: contact.id,
          instanceId: conversation.instanceId,
          direction: MessageDirection.INBOUND,
          content: index % 2 === 0 ? 'Perfeito, pode me mandar a proposta?' : 'Quero entender melhor a automacao.',
          status: MessageStatus.READ,
          sentAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 30),
          deliveredAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 29),
          readAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 28),
          externalMessageId: `wamid-latest-${index + 1}`,
        },
      ],
    });

    await prisma.conversationNote.create({
      data: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        authorId: ownerId,
        content: index % 2 === 0 ? 'Lead demonstra urgencia para centralizar atendimento da equipe.' : 'Contato pediu comparativo entre planos e integracoes.',
      },
    });
  }

  const campaigns = await Promise.all(
    [
      {
        name: 'Boas-vindas Abril',
        description: 'Fluxo para novos contatos adicionados pela equipe',
        audienceType: CampaignAudienceType.LIST,
        targetConfig: { listIds: [lists[0]!.id] },
        message: 'Ola! Aqui e a AutosZap. Queremos te mostrar como reduzir tempo de resposta no WhatsApp.',
        status: CampaignStatus.SENT,
      },
      {
        name: 'Reativacao VIP',
        description: 'Campanha para contatos com maior potencial',
        audienceType: CampaignAudienceType.TAG,
        targetConfig: { tagIds: [tags[0]!.id, tags[2]!.id] },
        message: 'Temos uma condicao especial para retomar sua operação com automacao e inbox colaborativa.',
        status: CampaignStatus.SCHEDULED,
      },
      {
        name: 'Follow-up Evento',
        description: 'Leads coletados no evento da semana',
        audienceType: CampaignAudienceType.GROUP,
        targetConfig: { groupIds: [groups[2]!.id] },
        message: 'Obrigado por passar no nosso estande. Posso te enviar um plano de implementacao em 7 dias?',
        status: CampaignStatus.DRAFT,
      },
    ].map((campaign, index) =>
      prisma.campaign.create({
        data: {
          workspaceId: workspace.id,
          createdById: admin.id,
          instanceId: instances[0]!.id,
          name: campaign.name,
          description: campaign.description,
          audienceType: campaign.audienceType,
          targetConfig: campaign.targetConfig,
          message: campaign.message,
          scheduledAt: index === 1 ? new Date(Date.now() + 1000 * 60 * 60 * 24) : null,
          status: campaign.status,
          recipientCount: index === 0 ? 8 : index === 1 ? 12 : 0,
          sentCount: index === 0 ? 8 : 0,
          failedCount: index === 0 ? 1 : 0,
        },
      }),
    ),
  );

  await prisma.campaignRecipient.createMany({
    data: contacts.slice(0, 8).map((contact, index) => ({
      campaignId: campaigns[0]!.id,
      contactId: contact.id,
      status: index === 6 ? CampaignRecipientStatus.FAILED : CampaignRecipientStatus.DELIVERED,
      messageId: index === 6 ? null : `camp-msg-${index + 1}`,
      error: index === 6 ? 'Numero invalido temporariamente' : null,
      sentAt: new Date(Date.now() - (index + 2) * 1000 * 60 * 90),
      deliveredAt: index === 6 ? null : new Date(Date.now() - (index + 2) * 1000 * 60 * 89),
      readAt: index < 5 ? new Date(Date.now() - (index + 2) * 1000 * 60 * 88) : null,
    })),
  });

  const tools = await Promise.all(
    ([
      ['Consulta CRM', 'Busca informacoes resumidas de contatos e leads', 'internal', '/internal/crm-summary'],
      ['Status Financeiro', 'Consulta indicadores de pagamento do cliente', 'http', 'https://api.example.com/billing'],
      ['Criar Tarefa', 'Abre acao operacional para o time', 'internal', '/internal/tasks/create'],
    ] as const).map(([name, description, type, endpoint]) =>
      prisma.aiTool.create({
        data: {
          workspaceId: workspace.id,
          name,
          description,
          type,
          endpoint,
          action: name.toLowerCase().replace(/\s+/g, '_'),
          status: EntityStatus.ACTIVE,
          config: {
            mode: 'safe',
            rateLimit: 20,
          },
        },
      }),
    ),
  );

  const knowledgeBases = await Promise.all(
    ([
      ['Playbook Comercial', 'Regras e argumentos para vendas consultivas', KnowledgeBaseType.INTERNAL],
      ['FAQ de Implantacao', 'Perguntas frequentes sobre setup e integracao', KnowledgeBaseType.FAQ],
    ] as const).map(([name, description, type]) =>
      prisma.knowledgeBase.create({
        data: {
          workspaceId: workspace.id,
          name,
          description,
          type,
          status: EntityStatus.ACTIVE,
        },
      }),
    ),
  );

  await prisma.knowledgeDocument.createMany({
    data: [
      {
        workspaceId: workspace.id,
        knowledgeBaseId: knowledgeBases[0]!.id,
        title: 'Diagnostico comercial',
        type: KnowledgeDocumentType.TEXT,
        content: 'Mapeie canais, equipe, SLA e gargalos antes de propor automacoes.',
        status: EntityStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        knowledgeBaseId: knowledgeBases[0]!.id,
        title: 'Pitch para central de atendimento',
        type: KnowledgeDocumentType.TEXT,
        content: 'Destaque distribuicao de conversas, visibilidade gerencial e rapidez operacional.',
        status: EntityStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        knowledgeBaseId: knowledgeBases[1]!.id,
        title: 'Checklist de webhook',
        type: KnowledgeDocumentType.NOTE,
        content: 'Validar token, app secret, phone number id e endpoint HTTPS publico.',
        status: EntityStatus.ACTIVE,
      },
      {
        workspaceId: workspace.id,
        knowledgeBaseId: knowledgeBases[1]!.id,
        title: 'Documentacao Meta',
        type: KnowledgeDocumentType.URL,
        sourceUrl: 'https://developers.facebook.com/docs/whatsapp',
        content: 'Referencia oficial para API do WhatsApp Business Platform.',
        status: EntityStatus.ACTIVE,
      },
    ],
  });

  const assistants = await Promise.all(
    [
      {
        name: 'Closer IA',
        description: 'Apoia vendas com abordagem consultiva',
        objective: 'Qualificar e conduzir para proposta',
        systemPrompt: 'Atue como especialista em vendas B2B para WhatsApp e CRM. Responda em pt-BR com tom profissional.',
        temperature: 0.3,
        model: 'gpt-4.1-mini',
        status: AssistantStatus.ACTIVE,
      },
      {
        name: 'Onboarding IA',
        description: 'Auxilia setup e boas praticas de implantacao',
        objective: 'Acelerar ativacao e reduzir chamados repetitivos',
        systemPrompt: 'Explique implantacao e melhores praticas do AutosZap de forma objetiva e clara.',
        temperature: 0.2,
        model: 'gpt-4.1-mini',
        status: AssistantStatus.ACTIVE,
      },
    ].map((assistant) =>
      prisma.assistant.create({
        data: {
          workspaceId: workspace.id,
          ...assistant,
        },
      }),
    ),
  );

  await prisma.assistantKnowledgeBase.createMany({
    data: [
      {
        assistantId: assistants[0]!.id,
        knowledgeBaseId: knowledgeBases[0]!.id,
      },
      {
        assistantId: assistants[1]!.id,
        knowledgeBaseId: knowledgeBases[1]!.id,
      },
    ],
  });

  await prisma.assistantTool.createMany({
    data: [
      {
        assistantId: assistants[0]!.id,
        toolId: tools[0]!.id,
      },
      {
        assistantId: assistants[0]!.id,
        toolId: tools[1]!.id,
      },
      {
        assistantId: assistants[1]!.id,
        toolId: tools[2]!.id,
      },
    ],
  });

  const firstConversationMessages = await prisma.conversationMessage.findMany({
    where: {
      conversationId: conversations[0]!.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  await prisma.messageDeliveryStatus.createMany({
    data: firstConversationMessages.map((message, index) => ({
      workspaceId: workspace.id,
      messageId: message.id,
      instanceId: conversations[0]!.instanceId,
      provider: InstanceProvider.META_WHATSAPP,
      externalMessageId: message.externalMessageId ?? `seed-status-${index + 1}`,
      status: index === firstConversationMessages.length - 1 ? MessageStatus.READ : MessageStatus.DELIVERED,
      payload: {
        seed: true,
        statusIndex: index,
      },
      occurredAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 10),
    })),
  });

  await prisma.notification.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: admin.id,
        title: 'Nova resposta recebida',
        body: 'Mariana Costa respondeu na inbox comercial.',
        type: NotificationType.INFO,
      },
      {
        workspaceId: workspace.id,
        userId: agentAna.id,
        title: 'Campanha agendada',
        body: 'A campanha Reativacao VIP foi agendada para amanha.',
        type: NotificationType.SUCCESS,
      },
      {
        workspaceId: workspace.id,
        userId: agentLeo.id,
        title: 'Instancia em sincronizacao',
        body: 'Canal Suporte aguarda validacao final do webhook.',
        type: NotificationType.WARNING,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        entityType: 'campaign',
        entityId: campaigns[0]!.id,
        action: AuditAction.SEND,
        metadata: {
          recipients: 8,
        },
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        entityType: 'instance',
        entityId: instances[0]!.id,
        action: AuditAction.SYNC,
        metadata: {
          mode: instances[0]!.mode,
        },
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        entityType: 'team_member',
        entityId: 'camila@autoszap.com',
        action: AuditAction.INVITE,
        metadata: {
          email: 'camila@autoszap.com',
        },
      },
    ],
  });

  await prisma.whatsAppWebhookEvent.createMany({
    data: [
      {
        workspaceId: workspace.id,
        instanceId: instances[0]!.id,
        externalId: 'webhook-message-seed',
        eventType: WebhookEventType.MESSAGE,
        payload: {
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: contacts[0]!.phone,
                        id: 'wamid-seed-message',
                        text: {
                          body: 'Quero testar o modo oficial.',
                        },
                        timestamp: `${Math.floor(Date.now() / 1000)}`,
                        type: 'text',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        processedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        instanceId: instances[0]!.id,
        externalId: 'webhook-status-seed',
        eventType: WebhookEventType.STATUS,
        payload: {
          statuses: [
            {
              id: 'wamid-outbound-1',
              status: 'delivered',
            },
          ],
        },
        processedAt: new Date(),
      },
    ],
  });

  console.log('Seed concluido. Login demo: admin@autoszap.com / 123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
