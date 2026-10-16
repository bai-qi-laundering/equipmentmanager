// Device credentials may append inspections/photos; administration uses the existing gateway key.
export function deviceWriteAllowed(change, old, memberId, canonical) {
  if (change.kind !== 'record') return false;
  if (old) return old.created_by === memberId && canonical(old.data) === canonical(change.data);
  return change.expectedRevision === null && !change.data.items.some(item =>
    item.resolvedAt || item.resolvedBy || item.resolution);
}

