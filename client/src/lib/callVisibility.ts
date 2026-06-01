import type { CallLog, User } from "../types";

export function canViewCallRecordings(currentUser: Pick<User, "role"> | null | undefined) {
  return currentUser?.role === "admin" || currentUser?.role === "team_leader";
}

export function getVisibleCallLogsForUser(
  calls: CallLog[],
  currentUser: Pick<User, "id" | "role"> | null | undefined,
) {
  if (currentUser?.role === "agent") {
    return calls.filter((call) => call.agentId === currentUser.id);
  }

  return calls;
}
