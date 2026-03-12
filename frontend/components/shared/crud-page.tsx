'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { LucideIcon, Plus, Trash2 } from 'lucide-react';
import { DefaultValues, FieldValues, Path } from 'react-hook-form';
import { toast } from 'sonner';
import { ZodType } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { PaginatedResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from './confirm-dialog';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { EntityFormDialog } from './entity-form-dialog';
import { FilterBar } from './filter-bar';
import { PageHeader } from './page-header';

type EntityWithId = {
  id: string;
};

type FormField<TFormValues extends FieldValues> = {
  name: Path<TFormValues>;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'color' | 'select' | 'multiselect';
  placeholder?: string;
  options?:
    | Array<{ label: string; value: string; color?: string }>
    | ((values: TFormValues) => Array<{ label: string; value: string; color?: string }>);
};

type CrudPageProps<TItem extends EntityWithId, TFormValues extends FieldValues> = {
  title: string;
  description: string;
  endpoint: string;
  queryKey: string;
  columns: ColumnDef<TItem>[];
  schema: ZodType<TFormValues>;
  defaultValues: TFormValues;
  fields: Array<FormField<TFormValues>>;
  icon: LucideIcon;
  createLabel?: string;
  emptyDescription: string;
  mapToFormValues?: (item: TItem) => TFormValues;
  mapToPayload?: (values: TFormValues) => unknown;
};

function normalizeListResponse<TItem>(response: PaginatedResponse<TItem> | TItem[]) {
  return Array.isArray(response) ? response : response.data;
}

export function CrudPage<TItem extends EntityWithId, TFormValues extends FieldValues>({
  title,
  description,
  endpoint,
  queryKey,
  columns,
  schema,
  defaultValues,
  fields,
  icon,
  createLabel = 'Novo registro',
  emptyDescription,
  mapToFormValues,
  mapToPayload,
}: CrudPageProps<TItem, TFormValues>) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TItem | null>(null);

  const query = useQuery({
    queryKey: [queryKey, search],
    queryFn: () => apiRequest<PaginatedResponse<TItem> | TItem[]>(`${endpoint}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  const items = useMemo(() => (query.data ? normalizeListResponse(query.data) : []), [query.data]);

  const createMutation = useMutation({
    mutationFn: (values: TFormValues) =>
      apiRequest(selectedItem ? `${endpoint}/${selectedItem.id}` : endpoint, {
        method: selectedItem ? 'PATCH' : 'POST',
        body: mapToPayload ? mapToPayload(values) : values,
      }),
    onSuccess: () => {
      toast.success(selectedItem ? 'Registro atualizado.' : 'Registro criado.');
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setSelectedItem(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`${endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Registro removido.');
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enhancedColumns = useMemo<ColumnDef<TItem>[]>(
    () => [
      ...columns,
      {
        id: 'actions',
        header: 'Acoes',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedItem(row.original);
                setDialogOpen(true);
              }}
            >
              Editar
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              }
              title="Excluir registro"
              description="Esta acao nao podera ser desfeita."
              actionLabel="Excluir"
              onConfirm={() => deleteMutation.mutate(row.original.id)}
            />
          </div>
        ),
      },
    ],
    [columns, deleteMutation],
  );

  const formDefaultValues = selectedItem
    ? mapToFormValues?.(selectedItem) ?? (selectedItem as unknown as TFormValues)
    : defaultValues;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        action={
          <EntityFormDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setSelectedItem(null);
            }}
            title={selectedItem ? `Editar ${title}` : createLabel}
            description={description}
            schema={schema}
            defaultValues={formDefaultValues as DefaultValues<TFormValues>}
            fields={fields}
            submitLabel={selectedItem ? 'Salvar alteracoes' : 'Criar'}
            onSubmit={(values) => createMutation.mutateAsync(values)}
            trigger={
              <Button onClick={() => setSelectedItem(null)}>
                <Plus className="h-4 w-4" />
                {createLabel}
              </Button>
            }
          />
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} />

      <Card className="p-0">
        <CardContent className="p-4">
          {items.length ? (
            <DataTable
              columns={enhancedColumns}
              data={items}
              onRowClick={(row) => {
                setSelectedItem(row);
                setDialogOpen(true);
              }}
            />
          ) : (
            <EmptyState icon={icon} title={`Nenhum item em ${title.toLowerCase()}`} description={emptyDescription} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
