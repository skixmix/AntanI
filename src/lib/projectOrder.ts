export type ProjectReorder = {
  readonly fromId: string;
  readonly insertBeforeId: string | null;
};

export function reorderProjectSubset(
  projectIds: readonly string[],
  subsetIds: readonly string[],
  move: ProjectReorder,
): string[] {
  const reordered = subsetIds.filter((id) => id !== move.fromId);
  if (move.insertBeforeId === null) {
    reordered.push(move.fromId);
  } else {
    const insertIndex = reordered.indexOf(move.insertBeforeId);
    if (insertIndex === -1) reordered.push(move.fromId);
    else reordered.splice(insertIndex, 0, move.fromId);
  }

  const reorderedSlots = new Map(subsetIds.map((id, index) => [id, reordered[index] ?? id]));
  return projectIds.map((id) => reorderedSlots.get(id) ?? id);
}
