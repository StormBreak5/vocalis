'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { joinSessionAction } from '@/src/application/participant/join-session.action';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeCode } from '@/src/domain/validators/session-code.validator';

interface JoinFormProps {
  initialCode?: string;
}

export function JoinForm({ initialCode = '' }: JoinFormProps) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const router = useRouter();
  const { isOnline } = useOnlineStatus();

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(normalizeCode(e.target.value));
    setErrors(prev => ({ ...prev, code: undefined }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    setErrors(prev => ({ ...prev, name: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      toast.error('Você está offline.');
      return;
    }

    setErrors({});

    startTransition(async () => {
      const result = await joinSessionAction(code, displayName);

      if (result.ok) {
        if (result.isRecovered) {
          toast.success('Bem-vindo de volta!');
        }
        router.push(`/sala/${code}`);
      } else {
        if (result.code === 'INVALID_CODE_FORMAT') {
          setErrors(prev => ({ ...prev, code: result.userMessage }));
        } else if (result.code === 'INVALID_NAME') {
          setErrors(prev => ({ ...prev, name: result.userMessage }));
        } else {
          toast.error(result.userMessage);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <div className="space-y-2">
        <Label htmlFor="sessionCode" className="text-base font-semibold">
          Código da Sala
        </Label>
        <Input
          id="sessionCode"
          type="text"
          value={code}
          onChange={handleCodeChange}
          maxLength={6}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Ex: AABB22"
          className="min-h-[48px] text-lg uppercase font-mono tracking-widest text-center rounded-xl"
          disabled={isPending || (!!initialCode && initialCode === code)} // Keep disabled if pre-filled maybe? No, let's keep it editable just in case, but usually we just leave it editable.
        />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive font-medium mt-1">
            {errors.code}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName" className="text-base font-semibold">
          Seu Nome (ou Apelido)
        </Label>
        <Input
          id="displayName"
          type="text"
          value={displayName}
          onChange={handleNameChange}
          maxLength={32}
          placeholder="Como quer ser chamado?"
          className="min-h-[48px] text-lg rounded-xl"
          disabled={isPending}
        />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive font-medium mt-1">
            {errors.name}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isPending || !isOnline}
        aria-label={!isOnline ? 'Ação indisponível offline' : 'Entrar na sala'}
        className="w-full min-h-[48px] text-lg font-bold rounded-xl transition-transform active:scale-[0.98]"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            Entrando...
          </>
        ) : (
          'Entrar na Sala'
        )}
      </Button>
    </form>
  );
}
