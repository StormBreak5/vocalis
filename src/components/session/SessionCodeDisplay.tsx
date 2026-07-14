'use client';

import { Button } from '@/src/components/ui/button';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface SessionCodeDisplayProps {
  code: string;
}

export function SessionCodeDisplay({ code }: SessionCodeDisplayProps) {
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      toast.success('Código copiado!');
    } catch {
      toast.error('Falha ao copiar o código.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vocalis',
          text: `Entrar no karaokê com o código: ${code}`,
          // We can also share a URL if we know the domain, but text is fine for MVP
        });
        toast.success('Compartilhado com sucesso!');
      } catch (err: unknown) {
        // AbortError is thrown when user cancels share, ignore it
        if (err instanceof Error && err.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-sm mx-auto">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2 font-medium uppercase tracking-wider">
          Código da Sala
        </p>
        <div className="bg-card text-card-foreground border-2 border-primary/20 shadow-lg rounded-2xl py-6 px-12 flex items-center justify-center">
          <span className="font-mono text-5xl font-black tracking-widest text-primary drop-shadow-sm">
            {code}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        <Button
          onClick={handleCopy}
          variant="outline"
          size="lg"
          className="w-full min-h-[48px] rounded-xl hover:bg-primary/10 transition-colors"
        >
          <Copy className="mr-2 h-5 w-5" />
          Copiar
        </Button>
        <Button
          onClick={handleShare}
          variant="secondary"
          size="lg"
          className="w-full min-h-[48px] rounded-xl transition-transform active:scale-95"
        >
          <Share2 className="mr-2 h-5 w-5" />
          Compartilhar
        </Button>
      </div>
    </div>
  );
}
