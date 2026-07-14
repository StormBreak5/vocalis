import { Metadata } from 'next';
import { Copy, Mic2, Plus, Smartphone, Users } from 'lucide-react';
import Link from 'next/link';
import { CreateSessionButton } from '@/src/components/session/CreateSessionButton';

export const metadata: Metadata = {
  title: 'Vocalis — Karaokê ao Vivo',
};

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-lg mx-auto">
      <div className="w-full space-y-12">
        <header className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <Mic2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight drop-shadow-md">
            Vocalis
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Sua fila de karaokê ao vivo.
          </p>
        </header>

        <section className="space-y-6 w-full">
          <div className="bg-card text-card-foreground border border-border shadow-xl rounded-2xl p-6 md:p-8 space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-center">
                Você é o anfitrião?
              </h2>
              <p className="text-sm text-muted-foreground text-center">
                Crie uma sala e gerencie os cantores.
              </p>
              <CreateSessionButton />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground tracking-wider font-semibold">
                  Ou
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight text-center">
                Vai cantar?
              </h2>
              <p className="text-sm text-muted-foreground text-center">
                Entre na sala com o código na tela.
              </p>
              <Link href="/entrar" className="inline-flex items-center justify-center rounded-xl text-lg font-semibold w-full min-h-[48px] bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]">
                Entrar em uma Sala
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
