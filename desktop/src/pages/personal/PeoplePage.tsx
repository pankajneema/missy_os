import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { PersonCard } from "@/components/people/PersonCard";
import { PersonFormDialog } from "@/components/people/PersonFormDialog";
import { PersonDetailDialog } from "@/components/people/PersonDetailDialog";
import { FamilyTreeView } from "@/components/people/FamilyTreeView";
import { usePrototypeCollection } from "@/lib/prototype-store";
import type { Person, PersonCategoryConfig } from "@/lib/people";
import { SectionTabs, PEOPLE_TABS } from "@/components/shared/SectionTabs";

export function PeoplePage({ config }: { config: PersonCategoryConfig }) {
  const { items, add, update, remove } = usePrototypeCollection<Person>(config.storageKey);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "tree">("list");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [viewing, setViewing] = useState<Person | null>(null);

  const filtered = items.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.relationship.toLowerCase().includes(query.toLowerCase()),
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEditFromDetail() {
    if (!viewing) return;
    setEditing(viewing);
    setViewing(null);
    setFormOpen(true);
  }

  function handleSave(person: Person) {
    if (items.some((p) => p.id === person.id)) update(person.id, person);
    else add(person);
  }

  function handleDeleteFromDetail() {
    if (!viewing) return;
    remove(viewing.id);
    setViewing(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">{config.title}</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add {config.singular}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <SectionTabs items={PEOPLE_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">{config.description}</p>
          <PrototypeNotice />

          {config.showTree ? (
            <Tabs value={view} onValueChange={(v) => setView(v as "list" | "tree")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <TabsList>
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="tree">Tree</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="list">
                <PeopleGrid people={filtered} config={config} onSelect={setViewing} onAdd={openAdd} />
              </TabsContent>
              <TabsContent value="tree">
                {items.length === 0 ? (
                  <EmptyState icon={Users} title="No family added yet" description={`Use "Add ${config.singular}" above.`} />
                ) : (
                  <FamilyTreeView people={items} onSelect={setViewing} />
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <PeopleGrid people={filtered} config={config} onSelect={setViewing} onAdd={openAdd} />
            </>
          )}
        </div>
      </div>

      <PersonFormDialog config={config} open={formOpen} onOpenChange={setFormOpen} person={editing} onSave={handleSave} />
      <PersonDetailDialog
        person={viewing}
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={openEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />
    </div>
  );
}

function PeopleGrid({
  people,
  config,
  onSelect,
  onAdd,
}: {
  people: Person[];
  config: PersonCategoryConfig;
  onSelect: (p: Person) => void;
  onAdd: () => void;
}) {
  if (people.length === 0) {
    return (
      <EmptyState icon={Users} title={`No one added yet`} description={`Use "Add ${config.singular}" above to get started.`} action={<Button size="sm" onClick={onAdd}>Add {config.singular}</Button>} />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {people.map((p) => (
        <PersonCard key={p.id} person={p} onClick={() => onSelect(p)} />
      ))}
    </div>
  );
}
