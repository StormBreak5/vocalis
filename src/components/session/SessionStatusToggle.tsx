'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { updateSessionStatusAction } from '@/src/application/session/update-session-status.action';
import { toast } from 'sonner';
import { Pause, Play, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SessionStatusToggleProps {
  sessionId: string;
  initialStatus: 'active' | 'paused' | 'closed';
}

export function SessionStatusToggle({ sessionId, initialStatus }: SessionStatusToggleProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const isPaused = initialStatus === 'paused';
  const newStatus = isPaused ? 'active' : 'paused';

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const response = await updateSessionStatusAction(sessionId, newStatus);
      if (response.ok) {
        toast.success(`Fila ${isPaused ? 'retomada' : 'pausada'} com sucesso.`);
        router.refresh();
      } else {
        toast.error('Erro', { description: response.userMessage });
      }
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button 
      variant={isPaused ? "default" : "secondary"} 
      onClick={handleToggle} 
      disabled={isUpdating || initialStatus === 'closed'}
      className="w-full sm:w-auto"
    >
      {isUpdating ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : isPaused ? (
        <Play className="w-4 h-4 mr-2" />
      ) : (
        <Pause className="w-4 h-4 mr-2" />
      )}
      {isPaused ? 'Retomar Fila' : 'Pausar Fila'}
    </Button>
  );
}
