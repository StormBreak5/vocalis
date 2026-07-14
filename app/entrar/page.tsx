import { JoinForm } from '@/src/components/participant/JoinForm';
import { Mic2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EntrarPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-lg mx-auto">
      <div className="w-full mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para o Início
        </Link>
      </div>

      <div className="w-full space-y-10">
        <header className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight drop-shadow-md">
            Entrar na Sala
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Digite o código exibido pelo DJ.
          </p>
        </header>

        <section className="bg-card text-card-foreground border border-border shadow-xl rounded-2xl p-6 md:p-8">
          <JoinForm />
        </section>
      </div>
    </main>
  );
}
