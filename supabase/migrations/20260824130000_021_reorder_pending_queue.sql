-- Reordenação manual da fila de espera (waiting queue) pelo Host.
--
-- Adiada deliberadamente na feature 002-song-queue (spec.md: "Host does not
-- need controls to... reorder the queue in this release; this will be
-- handled in a future feature."). Esta migration implementa essa RPC.
--
-- Modelo de reordenação: só as entradas 'pending' da sessão são
-- reordenáveis. 'preparing'/'singing' NUNCA têm a própria position tocada
-- por esta função — o rank relativo delas contra qualquer entrada pending é
-- preservado por construção, porque o conjunto de VALORES de position
-- ocupado pelas linhas pending nunca muda, só qual linha pending ocupa cada
-- valor. Concretamente:
--   1. Trava a linha de sessions (mesmo mutex usado por toda RPC de escrita
--      de queue neste projeto: create_queue_entry, cancel_queue_entry,
--      update_queue_song, update_queue_status) — isso serializa
--      reorder_queue contra qualquer mutação concorrente da fila da mesma
--      sessão. Não há necessidade de lidar com deadlock entre travas de
--      linhas de queue: no momento em que esta função trava as linhas
--      pending, nenhuma outra RPC de escrita de queue desta sessão pode
--      estar no meio de uma transação.
--   2. Trava (FOR UPDATE) e coleta TODAS as entradas 'pending' da sessão,
--      ordenadas por position ascendente — essa é a lista de "slots" de
--      position disponíveis: P = [p1 < p2 < ... < pn].
--   3. p_queue_ids é a ordem NOVA desejada pelo Host, como array de ids de
--      queue. Precisa ser exatamente o mesmo conjunto (mesmo multiset) dos
--      ids pending atuais — nem um a mais, nem um a menos, sem duplicata —
--      senão INVALID_QUEUE_ORDER (ex.: uma entrada foi cancelada ou chamada
--      via update_queue_status enquanto o Host arrastava). A comparação é
--      feita por igualdade de arrays ordenados, que cobre cardinalidade,
--      ids estranhos/ausentes e duplicatas numa única checagem.
--   4. Atribui p1 ao 1º id do array do Host, p2 ao 2º, ..., pn ao n-ésimo.
--      Como P é exatamente o conjunto de valores que outras linhas
--      (preparing/singing/outras sessões) já tratavam como "maior que" ou
--      "menor que" antes da chamada, e nenhum desses valores muda, a
--      relação de ordem entre qualquer entrada pending e qualquer entrada
--      não-pending é idêntica antes e depois — só a ordem relativa DENTRO
--      do subconjunto pending muda, que é exatamente o que o Host pediu.
--
-- Não bloqueia em status='paused' — mesmo precedente de cancel_queue_entry
-- e update_queue_song (só create_queue_entry bloqueia pedidos novos durante
-- pausa; reordenar o que já está na fila não é "pedido novo").
BEGIN;

CREATE FUNCTION public.reorder_queue(p_session_id uuid, p_queue_ids uuid[])
RETURNS TABLE(id uuid, "position" integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
  v_current_ids uuid[];
  v_current_positions integer[];
  v_wanted_ids uuid[] := coalesce(p_queue_ids, ARRAY[]::uuid[]);
  v_sorted_current uuid[];
  v_sorted_wanted uuid[];
  i integer;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT s.* INTO v_session FROM public.sessions AS s
  WHERE s.id=p_session_id AND s.host_id=v_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- Trava todas as entradas pending da sessão antes de decidir se o pedido
  -- do Host ainda é válido — nenhuma outra RPC de escrita de queue consegue
  -- avançar essas linhas enquanto esta transação está aberta, porque todas
  -- passam pelo mesmo mutex da linha de sessions acima. FOR UPDATE não pode
  -- ser combinado com array_agg na mesma SELECT, por isso a trava acontece
  -- dentro do CTE e a agregação acontece por fora.
  -- array_agg(id...) sem qualificar seria ambíguo aqui: RETURNS TABLE(id
  -- uuid, "position" integer) cria variáveis implícitas id/position visíveis
  -- em todo o corpo da função, junto com as colunas homônimas de "locked" —
  -- por isso locked.id/locked.position precisam ser explícitos.
  WITH locked AS (
    SELECT q.id, q.position
    FROM public.queue AS q
    WHERE q.session_id=p_session_id AND q.status='pending'
    FOR UPDATE
  )
  SELECT array_agg(locked.id ORDER BY locked.position, locked.id), array_agg(locked.position ORDER BY locked.position, locked.id)
  INTO v_current_ids, v_current_positions
  FROM locked;
  v_current_ids := coalesce(v_current_ids, ARRAY[]::uuid[]);
  v_current_positions := coalesce(v_current_positions, ARRAY[]::integer[]);

  -- Igualdade de arrays ordenados = igualdade de multiset: cobre
  -- cardinalidade errada, id estranho, id ausente e duplicata numa única
  -- checagem.
  SELECT array_agg(x ORDER BY x) INTO v_sorted_current FROM unnest(v_current_ids) AS x;
  SELECT array_agg(x ORDER BY x) INTO v_sorted_wanted FROM unnest(v_wanted_ids) AS x;
  IF v_sorted_current IS DISTINCT FROM v_sorted_wanted THEN
    RAISE EXCEPTION 'INVALID_QUEUE_ORDER';
  END IF;

  -- array_length(ARRAY[]::uuid[],1) é NULL, não 0 — coalesce evita erro de
  -- bound NULL no FOR.
  FOR i IN 1..coalesce(array_length(v_current_ids,1),0) LOOP
    UPDATE public.queue AS q SET position=v_current_positions[i] WHERE q.id=v_wanted_ids[i];
  END LOOP;

  RETURN QUERY SELECT q.id, q.position FROM public.queue AS q
  WHERE q.id=ANY(v_wanted_ids) ORDER BY q.position;
END
$$;

ALTER FUNCTION public.reorder_queue(uuid,uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_queue(uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_queue(uuid,uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
