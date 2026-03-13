'use client';

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

type KanbanStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  probability: number;
};

type KanbanLead = {
  id: string;
  name: string;
  company?: string | null;
  value: string;
  order: number;
  notes?: string | null;
  stage: KanbanStage;
  tags: Array<{ id: string; name: string; color: string }>;
};

function Column({
  stage,
  leads,
  onCardClick,
}: {
  stage: KanbanStage;
  leads: KanbanLead[];
  onCardClick: (lead: KanbanLead) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      ref={setNodeRef}
      className="flex min-w-[264px] snap-start flex-1 flex-col rounded-[24px] border border-border bg-white/[0.03] p-3.5 sm:min-w-[280px]"
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
          <div>
            <p className="font-medium">{stage.name}</p>
            <p className="text-xs text-muted-foreground">{stage.probability}% de probabilidade</p>
          </div>
        </div>
        <Badge variant="secondary">{leads.length}</Badge>
      </div>
      <SortableContext items={leads.map((lead) => lead.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-3">
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function KanbanCard({ lead, onClick }: { lead: KanbanLead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: lead.id,
  });

  return (
    <Card
      ref={setNodeRef as never}
      className="cursor-grab rounded-[20px] border-white/6 bg-background-panel p-3.5 shadow-[0_12px_26px_rgba(2,10,22,0.16)]"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{lead.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{lead.company ?? 'Sem empresa vinculada'}</p>
        </div>
        <Badge>{formatCurrency(lead.value)}</Badge>
      </div>
      {lead.notes ? <p className="mt-2.5 line-clamp-2 text-sm text-muted-foreground">{lead.notes}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {lead.tags.slice(0, 2).map((tag) => (
          <Badge key={tag.id} variant="secondary">
            {tag.name}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

export function KanbanBoard({
  stages,
  leads,
  onMoveLead,
  onCardClick,
}: {
  stages: KanbanStage[];
  leads: KanbanLead[];
  onMoveLead: (leadId: string, stageId: string, order: number) => void;
  onCardClick: (lead: KanbanLead) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = stages.map((stage) => ({
    stage,
    leads: leads
      .filter((lead) => lead.stage.id === stage.id)
      .sort((a, b) => a.order - b.order),
  }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeLead = leads.find((lead) => lead.id === active.id);
    if (!activeLead) return;

    const targetStage = stages.find((stage) => stage.id === over.id) ?? leads.find((lead) => lead.id === over.id)?.stage;
    if (!targetStage) return;

    const destinationLeads = leads.filter((lead) => lead.stage.id === targetStage.id);
    onMoveLead(activeLead.id, targetStage.id, destinationLeads.length);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-1 pb-2">
        {grouped.map(({ stage, leads: stageLeads }) => (
          <Column key={stage.id} stage={stage} leads={stageLeads} onCardClick={onCardClick} />
        ))}
      </div>
    </DndContext>
  );
}
