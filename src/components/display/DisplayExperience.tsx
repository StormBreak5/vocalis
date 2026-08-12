'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RoomEntryQrResult } from '@/src/infrastructure/qr/room-entry-qr';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { DisplayClosedState } from './DisplayClosedState';
import { DisplayConnectionBanner, type DisplayBannerState } from './DisplayConnectionBanner';
import { DisplayEmptyState } from './DisplayEmptyState';
import { DisplayHeader, type DisplayConnectionState } from './DisplayHeader';
import { DisplayJoinPanel } from './DisplayJoinPanel';
import { DisplayNextUp } from './DisplayNextUp';
import { DisplayNowSinging } from './DisplayNowSinging';
import { DisplayQueuePreview } from './DisplayQueuePreview';
import {
  getDisplayQueueLimit,
  hasLargeDisplayText,
  limitDisplayQueue,
  selectDisplayQueue,
} from './display-queue-presentation';
import styles from './display.module.css';

function subscribeViewport(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

function getViewportWidth() {
  return window.innerWidth;
}

function getServerViewportWidth() {
  return 1_920;
}

export function DisplayExperience({
  sessionId,
  code,
  qr,
}: {
  sessionId: string;
  code: string;
  qr: RoomEntryQrResult;
}) {
  const lifecycle = useSessionLifecycleContext();
  const { queue, isOffline: queueIsOffline } = useActiveQueue(sessionId);
  const { isOnline } = useOnlineStatus();
  const [isBrowserRecovery, setIsBrowserRecovery] = useState(false);
  const sawBrowserOfflineRef = useRef(false);
  const viewportWidth = useSyncExternalStore(
    subscribeViewport,
    getViewportWidth,
    getServerViewportWidth,
  );

  useEffect(() => {
    const handleOffline = () => {
      sawBrowserOfflineRef.current = true;
      setIsBrowserRecovery(false);
    };
    const handleOnline = () => {
      if (sawBrowserOfflineRef.current) setIsBrowserRecovery(true);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!isBrowserRecovery) return;

    const healthy = !queueIsOffline && lifecycle.phase === 'connected';
    const timer = window.setTimeout(
      () => setIsBrowserRecovery(false),
      healthy ? 240 : 10_000,
    );
    return () => window.clearTimeout(timer);
  }, [isBrowserRecovery, lifecycle.phase, queueIsOffline]);

  const isClosed = lifecycle.phase === 'closed'
    || lifecycle.snapshot?.status === 'closed';
  if (isClosed) return <DisplayClosedState />;

  const isOffline = !isOnline
    || (queueIsOffline && !isBrowserRecovery)
    || lifecycle.phase === 'offline'
    || lifecycle.phase === 'error';
  const isReconnecting = !isOffline
    && (
      isBrowserRecovery
      || lifecycle.phase === 'reconnecting'
      || lifecycle.phase === 'loading'
    );
  const isPaused = lifecycle.snapshot?.status === 'paused';
  const connectionState: DisplayConnectionState = isOffline
    ? 'offline'
    : isReconnecting ? 'reconnecting' : 'live';
  const bannerState: DisplayBannerState | null = isOffline
    ? 'offline'
    : isReconnecting ? 'reconnecting' : isPaused ? 'paused' : null;
  const presentation = selectDisplayQueue(queue);
  const largeText = hasLargeDisplayText(presentation);
  const queueLimit = getDisplayQueueLimit({
    viewportWidth,
    hasBanner: bannerState !== null,
    hasLargeText: largeText,
  });
  const limitedQueue = limitDisplayQueue(presentation.following, queueLimit);
  const isEmpty = !presentation.current
    && !presentation.next
    && presentation.following.length === 0;
  const sessionStatus = lifecycle.snapshot?.status === 'paused' ? 'paused' : 'active';

  return (
    <div
      className={styles.experience}
      data-display-state={bannerState ?? 'active'}
      data-large-text={largeText || undefined}
    >
      <div className={styles.topStack}>
        <DisplayHeader
          connectionState={connectionState}
          sessionStatus={sessionStatus}
        />
        {bannerState && <DisplayConnectionBanner state={bannerState} />}
      </div>
      {isEmpty ? (
        <div className={styles.layout}>
          <DisplayEmptyState />
          <DisplayJoinPanel code={code} qr={qr} />
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.flow}>
            <DisplayNowSinging entry={presentation.current} />
            <DisplayNextUp entry={presentation.next} />
            <DisplayQueuePreview
              entries={limitedQueue.visible}
              remaining={limitedQueue.remaining}
              total={presentation.following.length}
            />
          </div>
          <DisplayJoinPanel code={code} qr={qr} />
        </div>
      )}
    </div>
  );
}
