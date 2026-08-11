export type RoomEntryQrResult =
  | { status: 'origin-not-configured' }
  | {
    status: 'ready';
    entryUrl: string;
    svg: string;
    svgDataUrl: string;
  };
