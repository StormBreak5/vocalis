export function formatParticipantLabel(displayName: string, disambiguationIndex: number): string {
  if (disambiguationIndex === 1) {
    return displayName;
  }
  return `${displayName} #${disambiguationIndex}`;
}
