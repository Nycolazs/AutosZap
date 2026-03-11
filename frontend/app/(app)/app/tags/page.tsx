'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Tags } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { Badge } from '@/components/ui/badge';
import { Tag } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2),
  color: z.string().min(4),
  description: z.string().optional(),
});

const columns: ColumnDef<Tag>[] = [
  { accessorKey: 'name', header: 'Tag' },
  {
    accessorKey: 'color',
    header: 'Cor',
    cell: ({ row }) => <Badge style={{ backgroundColor: `${row.original.color}25`, color: row.original.color }}>{row.original.color}</Badge>,
  },
  { accessorKey: 'description', header: 'Descricao' },
];

export default function TagsPage() {
  return (
    <CrudPage
      title="Tags"
      description="Classifique contatos, conversas e leads com regras simples e visuais."
      endpoint="tags"
      queryKey="tags"
      columns={columns}
      schema={schema}
      defaultValues={{ name: '', color: '#3297ff', description: '' }}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'color', label: 'Cor', type: 'color' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
      ]}
      icon={Tags}
      createLabel="Nova tag"
      emptyDescription="Crie tags para categorizar oportunidades, atendimentos e segmentos."
    />
  );
}
