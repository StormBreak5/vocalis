import { Skeleton } from '@/src/components/ui/skeleton';

export function ParticipantSkeleton() {
  return (
    <div 
      className="w-full flex flex-col space-y-4" 
      aria-label="Carregando sua sessão..."
      role="status"
    >
      <div className="bg-card border border-border p-4 rounded-xl flex items-center justify-between shadow-sm">
        <Skeleton className="h-6 w-3/4 rounded" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}
