export type ProcStatusIdentity = {
  realGid: number;
  effectiveGid: number;
  supplementaryGroups: number[];
};

/**
 * Parses the identity fields of /proc/self/status. The Gid line carries four
 * numeric columns (real, effective, saved-set, filesystem) and Groups lists
 * supplementary groups only. Both lines are required; malformed values fail.
 */
export function parseProcStatusIdentity(status: string): ProcStatusIdentity {
  const gidLine = /^Gid:\s*(.*)$/imu.exec(status)?.[1];
  if (gidLine === undefined) throw new Error("missing Gid field");
  const gidColumns = gidLine
    .trim()
    .split(/\s+/u)
    .map((column) => Number(column));
  if (
    gidColumns.length !== 4 ||
    gidColumns.some((column) => !Number.isSafeInteger(column) || column < 0)
  )
    throw new Error("malformed Gid field");
  const realGid = gidColumns[0];
  const effectiveGid = gidColumns[1];
  if (realGid === undefined || effectiveGid === undefined) throw new Error("malformed Gid field");

  const groupsLine = /^Groups:\s*(.*)$/imu.exec(status)?.[1];
  if (groupsLine === undefined) throw new Error("missing Groups field");
  const groupsText = groupsLine.trim();
  const supplementaryGroups =
    groupsText === "" ? [] : groupsText.split(/\s+/u).map((column) => Number(column));
  if (supplementaryGroups.some((group) => !Number.isSafeInteger(group) || group < 0))
    throw new Error("malformed Groups field");

  return { realGid, effectiveGid, supplementaryGroups };
}

/**
 * systemd may represent an empty supplementary group list either as an empty
 * Groups line or as the primary group alone. Any other list fails.
 */
export function supplementaryGroupsAreEmptyOrPrimary(identity: ProcStatusIdentity): boolean {
  return (
    identity.realGid > 0 &&
    (identity.supplementaryGroups.length === 0 ||
      (identity.supplementaryGroups.length === 1 &&
        identity.supplementaryGroups[0] === identity.realGid))
  );
}
