/**
 * Remove subscriptions órfãs ou estados temporários de sessão da memória do client.
 * Essa função é "room-scoped", e propositalmente evita apagar localStorage globais
 * ou realizar chamadas de signOut() do Supabase.
 */
export function performRoomCleanup(sessionId: string) {
  // Atualmente o Next.js App Router em unmount (useEffect cleanup) cuida do Realtime channel.
  // Se tivéssemos React Query ou SWR, faríamos `queryClient.removeQueries(['session', sessionId])`.
  // Aqui apenas expomos o hook/interface de design exigido pela US5 para evolução futura.
  console.debug(`Room cleanup executado para sessão ${sessionId}. Nenhum dado persistente destruído.`);
}
