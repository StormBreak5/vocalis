import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionLifecycleProvider, useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';

const snapshot={id:'11111111-1111-4111-8111-111111111111',code:'ABC234',status:'active' as const,closedAt:null};
function Consumer(){const state=useSessionLifecycleContext();return <span>{state.phase}:{String(state.writesAllowed)}:{state.sessionId}</span>}

describe('SessionLifecycleProvider',()=>{
  it('semeia estado confirmado recebido do servidor',()=>{
    render(<SessionLifecycleProvider sessionId={snapshot.id} initialSnapshot={snapshot}><Consumer/></SessionLifecycleProvider>);
    expect(screen.getByText(`connected:true:${snapshot.id}`)).toBeDefined();
  });
});
