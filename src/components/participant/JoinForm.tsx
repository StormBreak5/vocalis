'use client';

import { useRef, useState } from 'react';
import { joinSessionAction } from '@/src/application/participant/join-session.action';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeCode } from '@/src/domain/validators/session-code.validator';
import { cn } from '@/src/lib/utils';
import { replaceDocument } from '@/src/lib/browser-navigation';
import styles from './join-form.module.css';

interface JoinFormProps {
  initialCode?: string;
  variant?: 'embedded' | 'standalone';
}

export function JoinForm({ initialCode = '', variant = 'embedded' }: JoinFormProps) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [formError, setFormError] = useState<string>();
  const submissionInFlight = useRef(false);
  const { isOnline } = useOnlineStatus();
  const isStandalone = variant === 'standalone';

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCode(normalizeCode(event.target.value));
    setErrors(previous => ({ ...previous, code: undefined }));
    setFormError(undefined);
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.target.value);
    setErrors(previous => ({ ...previous, name: undefined }));
    setFormError(undefined);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (submissionInFlight.current) return;

    if (!isOnline) {
      toast.error('Você está offline.');
      return;
    }

    setErrors({});
    setFormError(undefined);
    submissionInFlight.current = true;
    setIsPending(true);

    void (async () => {
      let timeoutId: number | undefined;

      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('JOIN_SESSION_TIMEOUT')), 20_000);
        });
        const result = await Promise.race([joinSessionAction(code, displayName), timeout]);

        if (result.ok) {
          if (result.isRecovered) toast.success('Bem-vindo de volta!');
          replaceDocument(`/sala/${code}`);
          return;
        }

        if (result.code === 'INVALID_CODE_FORMAT') {
          setErrors(previous => ({ ...previous, code: result.userMessage }));
        } else if (result.code === 'INVALID_NAME') {
          setErrors(previous => ({ ...previous, name: result.userMessage }));
        } else {
          if (isStandalone) setFormError(result.userMessage);
          toast.error(result.userMessage);
        }
      } catch {
        const message = 'A entrada demorou demais. Atualize a página para confirmar antes de tentar novamente.';
        if (isStandalone) setFormError(message);
        toast.error(message);
      } finally {
        window.clearTimeout(timeoutId);
        submissionInFlight.current = false;
        setIsPending(false);
      }
    })();
  };

  return (
    <form onSubmit={handleSubmit} className={cn('w-full', isStandalone ? styles.standalone : 'space-y-6')}>
      <div className={isStandalone ? styles.field : 'space-y-2'}>
        <Label htmlFor="sessionCode" className={isStandalone ? styles.label : 'text-base font-semibold'}>
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
          className={cn(
            'min-h-[48px] text-lg uppercase font-mono tracking-widest text-center rounded-xl',
            isStandalone && styles.input,
            isStandalone && styles.codeInput,
          )}
          disabled={isPending || (!!initialCode && initialCode === code)}
          aria-invalid={Boolean(errors.code)}
          aria-describedby={isStandalone ? (errors.code ? 'sessionCode-help sessionCode-error' : 'sessionCode-help') : (errors.code ? 'sessionCode-error' : undefined)}
        />
        {isStandalone && <p id="sessionCode-help" className={styles.help}>Use o código de seis caracteres exibido pelo DJ.</p>}
        {errors.code && (
          <p id="sessionCode-error" role="alert" className={isStandalone ? styles.error : 'text-sm text-destructive font-medium mt-1'}>
            {errors.code}
          </p>
        )}
      </div>

      <div className={isStandalone ? styles.field : 'space-y-2'}>
        <Label htmlFor="displayName" className={isStandalone ? styles.label : 'text-base font-semibold'}>
          Seu Nome (ou Apelido)
        </Label>
        <Input
          id="displayName"
          type="text"
          value={displayName}
          onChange={handleNameChange}
          maxLength={32}
          placeholder="Como quer ser chamado?"
          className={cn('min-h-[48px] text-lg rounded-xl', isStandalone && styles.input)}
          disabled={isPending}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={isStandalone ? (errors.name ? 'displayName-help displayName-error' : 'displayName-help') : (errors.name ? 'displayName-error' : undefined)}
        />
        {isStandalone && <p id="displayName-help" className={styles.help}>Seu apelido ficará visível para as pessoas na sala.</p>}
        {errors.name && (
          <p id="displayName-error" role="alert" className={isStandalone ? styles.error : 'text-sm text-destructive font-medium mt-1'}>
            {errors.name}
          </p>
        )}
      </div>

      {isStandalone && formError && <p role="alert" className={styles.formError}>{formError}</p>}

      <Button
        type="submit"
        size="lg"
        disabled={isPending || !isOnline}
        aria-label={!isOnline ? 'Ação indisponível offline' : 'Entrar na sala'}
        aria-busy={isPending}
        className={cn(
          'w-full min-h-[48px] text-lg font-bold rounded-xl transition-transform active:scale-[0.98]',
          isStandalone && styles.submit,
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
            Entrando...
          </>
        ) : (
          'Entrar na Sala'
        )}
      </Button>
    </form>
  );
}
